-- Testes da 0091a-g (pedido 047): pagamento confirmado, pagador em cobrança/pedido, parceiro como referência (bloqueio),
-- saneamento de nomes, endereço e CPF no parceiro, link de pagamento v2 (histórico, nome de quem paga, forma de pagamento).
-- Tudo dentro de um DO que termina em exceção: o banco desfaz o que o teste criou. Esperado: "TESTES_OK (rollback forçado)".
do $t$
declare
  v_emp uuid := (select empresa_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  v_adm uuid := (select usuario_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  cods text[]; q jsonb; r jsonb; tokx text; toky text; tokz text; v_x uuid; v_y uuid; v_z uuid; v_z2cli uuid; v_resx uuid; v_resy uuid; v_end uuid; v_ped uuid; v_p3 uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);

  -- nomes
  assert crm.nome_civil_limpo('MARIA DA SILVA @maria.s - INATIVO') = 'Maria da Silva', 'nome 1: ' || crm.nome_civil_limpo('MARIA DA SILVA @maria.s - INATIVO');
  assert crm.nome_civil_limpo('ana de souza e lima') = 'Ana de Souza e Lima', 'nome 2';
  assert crm.nome_civil_limpo('Maria McDonald') = 'Maria McDonald', 'caixa mista mantida';
  assert crm.nome_civil_limpo('@so_arroba') is null, 'só @';
  assert (select count(*) from crm.cad_parceiro where nome ~ '@') <= 20, 'nomes com @ restantes';

  -- CEP oficial pela página: sem cache -> pendente e na fila; com cache -> oficial
  delete from crm.cfg_cep_cache where cep in ('38400100','38400200');
  insert into crm.cfg_cep_cache (cep, encontrado, logradouro, bairro, municipio, uf, ibge, fonte, consultado_em)
  values ('38400100', true, 'Avenida Afonso Pena', 'Centro', 'Uberlândia', 'MG', '3170206', 'teste', now());

  select array_agg(x ->> 'codigo') into cods from jsonb_array_elements(api.publico_vitrine(null, null) -> 'itens') x where x ->> 'situacao' = 'disponivel';
  assert cardinality(cods) >= 3, 'faltam 3 peças disponíveis';

  -- X: pré-cadastro, informa CPF próprio, nome civil, e-mail, endereço com CEP oficial e Pix
  q := api.publico_quero(p_codigo => cods[1], p_canal => 'instagram', p_nome => 'Xenia Teste', p_whatsapp => '34991110911', p_instagram => 'teste_x_0091',
                         p_aceite => true, p_marketing => false, p_chave => 'teste-0091-chave-x-aaaa');
  tokx := q ->> 'token'; assert tokx is not null, 'quero X: ' || q::text;
  assert api.publico_cep(tokx, '38400-200') ->> 'pendente' = 'true', 'cep sem cache vira pendente';
  assert exists (select 1 from crm.fila_cep where cep = '38400200' and estado = 'novo'), 'cep na fila';
  r := api.publico_cep(tokx, '38400100');
  assert (r ->> 'oficial')::boolean and r ->> 'logradouro' = 'Avenida Afonso Pena', 'cep oficial: ' || r::text;
  assert api.publico_cep('x', '38400100') ->> 'erro' = 'nao_encontrada', 'cep sem token';
  r := api.publico_entrega_obter(tokx);
  assert jsonb_array_length(r -> 'enderecos') = 0 and r ->> 'cpf_final' is null, 'obter vazio: ' || r::text;
  assert api.publico_entrega_salvar(p_token => tokx, p_cpf => '52998224725', p_cep => '38400100', p_logradouro => 'av afonso pena', p_numero => '100',
         p_municipio => 'Uberlandia', p_uf => 'MG', p_forma => 'boleto') ->> 'erro' = 'forma_invalida', 'forma inválida';
  assert api.publico_entrega_salvar(p_token => tokx, p_cpf => '52998224725', p_cep => '38400100', p_logradouro => 'av afonso pena', p_numero => '100',
         p_municipio => 'Uberlandia', p_uf => 'MG', p_email => 'x@') ->> 'erro' = 'email_invalido', 'email inválido';
  r := api.publico_entrega_salvar(p_token => tokx, p_cpf => '529.982.247-25', p_cep => '38400-100', p_logradouro => 'av afonso pena', p_numero => '100',
         p_complemento => 'ap 2', p_bairro => 'centro', p_municipio => 'Uberlandia', p_uf => 'mg', p_nome_pagador => 'Xenia Teste Souza', p_email => 'Xenia@Exemplo.com', p_forma => 'pix');
  assert (r ->> 'ok')::boolean and not (r ->> 'cpf_reconhecido')::boolean and (r ->> 'cep_oficial')::boolean, 'salvar X: ' || r::text;
  select c.parceiro_id into v_x from crm.cad_cliente c join venda.mov_acompanhamento a on a.cliente_id = c.id where a.token = tokx;
  select r2.id into v_resx from live.mov_reserva r2 join venda.mov_acompanhamento a on a.interesse_id = r2.interesse_id where a.token = tokx;
  assert (select nome from crm.cad_parceiro where id = v_x) = 'Xenia Teste Souza', 'nome civil atualizado';
  assert (select logradouro from crm.cad_parceiro_endereco where parceiro_id = v_x) = 'Avenida Afonso Pena', 'endereço padronizado pelos Correios';
  assert (select codigo_municipio from crm.cad_parceiro_endereco where parceiro_id = v_x) = '3170206', 'IBGE no endereço';
  assert (select cep from crm.cad_parceiro_dados where parceiro_id = v_x) = '38400100', 'endereço fiscal preenchido';
  assert extensions.pgp_sym_decrypt((select documento_cifrado from crm.cad_parceiro_documento where parceiro_id = v_x), venda._chave_documento()) = '52998224725', 'CPF cifrado no parceiro';
  assert exists (select 1 from crm.cad_parceiro_contato where parceiro_id = v_x and tipo = 'email' and valor = 'xenia@exemplo.com'), 'e-mail em Contatos';
  assert (select forma_pagamento from live.mov_reserva where id = v_resx) = 'pix', 'forma na reserva';
  assert (api.parceiro_resumo(v_emp, v_x) ->> 'pronto_nfe')::boolean, 'X pronto para NF-e: ' || (api.parceiro_resumo(v_emp, v_x) -> 'faltas_nfe')::text;

  -- histórico: endereço sugerido mascarado; usar com 1 toque, sem digitar CPF de novo
  r := api.publico_entrega_obter(tokx);
  assert jsonb_array_length(r -> 'enderecos') = 1 and r ->> 'cpf_final' = '4725' and r ->> 'forma' = 'pix', 'obter com histórico: ' || r::text;
  assert r -> 'enderecos' -> 0 ->> 'resumo' like 'Avenida Afonso Pena, 1••%', 'número mascarado: ' || (r -> 'enderecos' -> 0 ->> 'resumo');
  assert (r -> 'enderecos' -> 0 ->> 'resumo') not like '%, 100%', 'número completo vazou';
  v_end := (r -> 'enderecos' -> 0 ->> 'id')::uuid;
  assert (api.publico_entrega_salvar(p_token => tokx, p_endereco_id => v_end, p_forma => 'cartao') ->> 'ok')::boolean, 'um toque';
  assert (select pagador_situacao from live.mov_reserva where id = v_resx) = 'titular' and (select forma_pagamento from live.mov_reserva where id = v_resx) = 'cartao', 'titular/cartão';
  assert (select count(*) from crm.cad_parceiro_endereco where parceiro_id = v_x) = 1, 'endereço duplicado';

  -- Y: pré-cadastro paga com o CPF de X; "Marcar pago" junta Y em X e o pedido sai no nome de X
  q := api.publico_quero(p_codigo => cods[2], p_canal => 'instagram', p_nome => 'Yara Teste', p_whatsapp => '34991110912', p_instagram => 'teste_y_0091',
                         p_aceite => true, p_marketing => false, p_chave => 'teste-0091-chave-y-aaaa');
  toky := q ->> 'token'; assert toky is not null, 'quero Y';
  select c.parceiro_id into v_y from crm.cad_cliente c join venda.mov_acompanhamento a on a.cliente_id = c.id where a.token = toky;
  assert api.publico_entrega_salvar(p_token => toky, p_endereco_id => v_end, p_cpf => '52998224725') ->> 'erro' = 'endereco_nao_encontrado', 'endereço de outro parceiro';
  r := api.publico_entrega_salvar(p_token => toky, p_cpf => '52998224725', p_cep => '38400100', p_logradouro => 'Av Afonso Pena', p_numero => '200',
         p_municipio => 'Uberlândia', p_uf => 'MG', p_forma => 'pix');
  assert (r ->> 'cpf_reconhecido')::boolean, 'Y reconhecido';
  assert (select count(*) from crm.cad_parceiro_endereco where parceiro_id = v_y) = 1, 'endereço de entrega fica com quem recebe (Y)';
  select r2.id into v_resy from live.mov_reserva r2 join venda.mov_acompanhamento a on a.interesse_id = r2.interesse_id where a.token = toky;
  r := api.marcar_pago(v_emp, v_resy, 'pix', 'Pix conferido no extrato');
  assert r ->> 'resultado' = 'ok', 'marcar pago: ' || r::text;
  v_ped := (r ->> 'pedido_id')::uuid;
  assert (select estado from live.mov_reserva where id = v_resy) = 'paga', 'reserva paga';
  assert (select parceiro_pagador_id from venda.mov_pedido where id = v_ped) = v_x, 'pedido no nome de X';
  assert (select parceiro_pagador_id from venda.mov_cobranca where id = (r ->> 'cobranca_id')::uuid) = v_x, 'cobrança no nome de X';
  assert (select forma_pagamento from venda.mov_cobranca where id = (r ->> 'cobranca_id')::uuid) = 'pix', 'forma na cobrança';
  assert (select parceiro_id from crm.cad_parceiro_contato where valor = 'teste_y_0091' and situacao <> 'inativo') = v_x, '@ de Y foi para X';
  assert (select count(*) from crm.cad_parceiro_endereco where parceiro_id = v_x) = 2, 'endereços de Y acompanham a absorção';
  assert exists (select 1 from live.log_acao_suporte where reserva_id = v_resy and acao = 'marcar_pago'), 'log marcar pago';
  begin perform api.marcar_pago(v_emp, v_resy, 'pix', 'de novo'); assert false, 'pagou duas vezes';
  exception when sqlstate '22023' then null; end;

  -- Z: tem CPF próprio; paga com CPF de alguém sem cadastro -> pede o nome de quem paga
  q := api.publico_quero(p_codigo => cods[3], p_canal => 'whatsapp', p_nome => 'Zelia Teste Lima', p_whatsapp => '34991110913', p_instagram => 'teste_z_0091',
                         p_aceite => true, p_marketing => false, p_chave => 'teste-0091-chave-z-aaaa');
  tokz := q ->> 'token'; assert tokz is not null, 'quero Z';
  select c.parceiro_id into v_z from crm.cad_cliente c join venda.mov_acompanhamento a on a.cliente_id = c.id where a.token = tokz;
  insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (v_emp, v_z, 'cpf', bling.fn_hash_doc('11144477735'), '7735');
  assert api.publico_entrega_salvar(p_token => tokz, p_cpf => '39053344705', p_cep => '38400100', p_logradouro => 'x', p_numero => '3', p_municipio => 'Uberlândia', p_uf => 'MG') ->> 'erro' = 'nome_pagador', 'pede nome';
  assert api.publico_entrega_salvar(p_token => tokz, p_cpf => '39053344705', p_cep => '38400100', p_logradouro => 'x', p_numero => '3', p_municipio => 'Uberlândia', p_uf => 'MG', p_nome_pagador => 'Ana') ->> 'erro' = 'nome_invalido', 'nome curto';
  r := api.publico_entrega_salvar(p_token => tokz, p_cpf => '39053344705', p_cep => '38400100', p_logradouro => 'x', p_numero => '3', p_municipio => 'Uberlândia', p_uf => 'MG', p_nome_pagador => 'PAGADORA NOVA TESTE');
  assert (r ->> 'ok')::boolean, 'Z: ' || r::text;
  select x.parceiro_pagador_id into v_p3 from live.mov_reserva x join venda.mov_acompanhamento a on a.interesse_id = x.interesse_id where a.token = tokz;
  assert (select nome from crm.cad_parceiro where id = v_p3) = 'Pagadora Nova Teste', 'nome de quem paga';
  assert exists (select 1 from crm.cad_parceiro_documento where parceiro_id = v_p3), 'CPF da pagadora cifrado';
  assert not exists (select 1 from crm.cad_parceiro_dados where parceiro_id = v_z) or (select cep from crm.cad_parceiro_dados where parceiro_id = v_z) is null, 'fiscal de Z não muda por pagamento de terceiro';

  -- bloqueio vale para o parceiro inteiro (outro @ da mesma pessoa)
  insert into crm.cad_cliente (empresa_id, nome, instagram_username) values (v_emp, 'Z Dois', 'teste_z2_0091') returning id into v_z2cli;
  perform api.parceiro_contato_mover(v_emp, (select id from crm.cad_parceiro_contato where valor = 'teste_z2_0091'), v_z, 'mesma pessoa');
  assert (select parceiro_id from crm.cad_cliente where id = v_z2cli) = v_z, 'perfil 2 em Z';
  update crm.cad_cliente set bloqueado_ate = now() + interval '1 day' where parceiro_id = v_z and id <> v_z2cli;
  assert crm.parceiro_bloqueado(v_z2cli), 'bloqueio pelo parceiro';
  q := api.publico_quero(p_codigo => cods[1], p_canal => 'instagram', p_nome => 'Z Dois Teste', p_whatsapp => '34991110914', p_instagram => 'teste_z2_0091',
                         p_aceite => true, p_marketing => false, p_chave => 'teste-0091-chave-z2-aaa');
  assert q ->> 'erro' = 'nao_disponivel', 'perfil 2 bloqueado: ' || q::text;

  -- permissões
  assert has_function_privilege('anon', 'api.publico_cep(text,text)', 'execute'), 'anon sem CEP';
  assert not has_function_privilege('anon', 'api.marcar_pago(uuid,uuid,text,text,numeric)', 'execute'), 'anon marcando pago';
  assert not has_function_privilege('authenticated', 'crm.processar_fila_cep(integer)', 'execute'), 'fila exposta';
  assert exists (select 1 from cron.job where jobname = 'cep-consulta-oficial'), 'job do CEP';

  raise exception 'TESTES_OK (rollback forçado)';
end $t$;
