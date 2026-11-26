-- Testes da 0092a-e (pedido 048): VIP (pagamento acumulado e limites), lista de bloqueio (live, vitrine, caixa de entrada),
-- LGPD (anonimização do parceiro), endereço do painel no parceiro, expedição com frete e notificação da Getnet.
-- Tudo dentro de um DO que termina em exceção: o banco desfaz o que o teste criou. Esperado: "TESTES_OK (rollback forçado)".
do $t$
declare
  v_emp uuid := (select empresa_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  v_adm uuid := (select usuario_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  cods text[]; q jsonb; r jsonb; tok1 text; tok2 text; tok3 text; v_vip uuid; v_cli uuid; v_bl uuid; v_blcli uuid; v_res1 uuid; v_res2 uuid; v_res3 uuid;
  v_conv uuid; v_exp uuid; v_cob uuid; v_n int; v_fim timestamptz; v_ped uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  select array_agg(x ->> 'codigo') into cods from jsonb_array_elements(api.publico_vitrine(null, null) -> 'itens') x where x ->> 'situacao' = 'disponivel';
  assert cardinality(cods) >= 3, 'faltam 3 peças disponíveis';

  -- VIP: limite de 2 peças; as 2 primeiras ficam acumuladas até o fim do dia, a 3ª segue a regra normal
  insert into crm.cad_cliente (empresa_id, nome, instagram_username, telefone) values (v_emp, 'Vera Vip Teste', 'teste_vip_0092', '+5534991110920')
  returning id, parceiro_id into v_cli, v_vip;
  perform api.parceiro_regra_salvar(v_emp, v_vip, '{"vip": true, "vip_max_pecas": 2, "vip_max_valor": 100000, "vip_prazo": "fim_do_dia"}');
  assert (api.parceiro_regra_obter(v_emp, v_vip) ->> 'vip')::boolean, 'VIP salvo';
  q := api.publico_quero(p_codigo => cods[1], p_canal => 'instagram', p_nome => 'Vera Vip Teste', p_whatsapp => '34991110920', p_instagram => 'teste_vip_0092', p_aceite => true, p_marketing => false, p_chave => 'teste-0092-vip-1-aaaaaa');
  tok1 := q ->> 'token'; assert tok1 is not null, 'quero vip 1: ' || q::text;
  q := api.publico_quero(p_codigo => cods[2], p_canal => 'instagram', p_nome => 'Vera Vip Teste', p_whatsapp => '34991110920', p_instagram => 'teste_vip_0092', p_aceite => true, p_marketing => false, p_chave => 'teste-0092-vip-2-aaaaaa');
  tok2 := q ->> 'token'; assert tok2 is not null, 'quero vip 2 (limite da vitrine não conta acumuladas): ' || q::text;
  q := api.publico_quero(p_codigo => cods[3], p_canal => 'instagram', p_nome => 'Vera Vip Teste', p_whatsapp => '34991110920', p_instagram => 'teste_vip_0092', p_aceite => true, p_marketing => false, p_chave => 'teste-0092-vip-3-aaaaaa');
  tok3 := q ->> 'token'; assert tok3 is not null, 'quero vip 3: ' || q::text;
  select r2.id into v_res1 from live.mov_reserva r2 join venda.mov_acompanhamento a on a.interesse_id = r2.interesse_id where a.token = tok1;
  select r2.id into v_res2 from live.mov_reserva r2 join venda.mov_acompanhamento a on a.interesse_id = r2.interesse_id where a.token = tok2;
  select r2.id into v_res3 from live.mov_reserva r2 join venda.mov_acompanhamento a on a.interesse_id = r2.interesse_id where a.token = tok3;
  assert (select pagamento_acumulado from live.mov_reserva where id = v_res1) and (select pagamento_acumulado from live.mov_reserva where id = v_res2), 'duas acumuladas';
  assert not (select pagamento_acumulado from live.mov_reserva where id = v_res3), 'terceira passa do limite e paga na hora';
  v_fim := (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '23 hours 59 minutes') at time zone 'America/Sao_Paulo';
  assert (select expira_em from live.mov_reserva where id = v_res1) = v_fim, 'acumulada vence no fim do dia';
  assert (select expira_em from live.mov_reserva where id = v_res3) < now() + interval '2 hours', 'normal vence no prazo curto';
  r := api.parceiro_regra_obter(v_emp, v_vip);
  assert (r -> 'acumulado' ->> 'pecas')::int = 2, 'acumulado: ' || r::text;

  -- fechamento do acumulado: uma cobrança com as 2 peças; pago -> um pedido só
  perform api.publico_entrega_salvar(p_token => tok1, p_cpf => '52998224725', p_cep => '38400100', p_logradouro => 'Avenida Afonso Pena', p_numero => '10', p_municipio => 'Uberlândia', p_uf => 'MG');
  update live.mov_reserva set endereco_entrega_id = (select endereco_entrega_id from live.mov_reserva where id = v_res1) where id = v_res2;
  -- a 3ª (normal) paga na hora pela Getnet: cobrança da reserva, Pix registrado, notificação aprovada
  perform api.publico_entrega_salvar(p_token => tok3, p_endereco_id => (select endereco_entrega_id from live.mov_reserva where id = v_res1), p_forma => 'pix');
  r := api.svc_cobranca_da_reserva(tok3);
  v_cob := (r ->> 'cobranca_id')::uuid;
  assert v_cob is not null and (r ->> 'valor_centavos')::bigint > 0 and r -> 'config' ->> 'provedor' = 'getnet', 'cobrança da reserva: ' || r::text;
  assert (api.svc_cobranca_da_reserva(tok3) ->> 'cobranca_id')::uuid = v_cob, 'mesma cobrança';
  perform api.svc_getnet_registrar(v_cob, '{"payment_id": "pix-teste-0092", "pix_copia_cola": "000201...", "pix_expira_em": "2099-01-01T00:00:00Z", "status": "WAITING"}');
  assert (api.svc_cobranca_da_reserva(tok3) ->> 'pix_copia_cola') = '000201...', 'Pix válido reaproveitado';
  assert api.svc_getnet_notificacao('{"payment_id": "pix-teste-0092", "status": "WAITING", "payment_type": "pix"}') = 'status_waiting', 'aguardando';
  assert api.svc_getnet_notificacao(jsonb_build_object('payment_id', 'pix-teste-0092', 'order_id', v_cob, 'status', 'APPROVED', 'payment_type', 'pix')) = 'ok', 'aprovado';
  assert (select estado from venda.mov_cobranca where id = v_cob) = 'paga' and (select estado from live.mov_reserva where id = v_res3) = 'paga', 'paga pela Getnet';
  assert api.svc_getnet_notificacao(jsonb_build_object('payment_id', 'pix-teste-0092', 'order_id', v_cob, 'status', 'APPROVED', 'payment_type', 'pix')) = 'duplicado', 'idempotente';
  assert api.svc_getnet_notificacao('{"payment_id": "nao-existe", "status": "APPROVED"}') = 'cobranca_desconhecida', 'desconhecida';
  r := api.vip_fechar_acumulado(v_emp, v_vip, 'pix', 'Pix do fim do dia conferido');
  assert r ->> 'resultado' = 'ok' and (r ->> 'pecas')::int = 2, 'fechar acumulado: ' || r::text;
  assert (select count(*) from venda.mov_pedido p join crm.cad_cliente c on c.id = p.cliente_id where c.parceiro_id = v_vip) = 2, 'dois pedidos (3ª + acumulado)';

  -- expedição: junta os pedidos pagos da mesma pessoa e endereço; frete cobrado depois
  r := api.expedicao_pendentes(v_emp);
  assert exists (select 1 from jsonb_array_elements(r) g where (g ->> 'parceiro_id')::uuid = v_vip), 'pendente para expedição';
  v_exp := api.expedicao_montar(v_emp, v_vip, (select endereco_entrega_id from live.mov_reserva where id = v_res1));
  v_n := (select count(*) from venda.rel_expedicao_pedido where expedicao_id = v_exp);
  assert v_n = 2, 'os dois pedidos no mesmo envio: ' || v_n;
  begin perform api.expedicao_enviar(v_emp, v_exp, 'BR123456789BR'); assert false, 'enviou sem frete';
  exception when sqlstate '22023' then null; end;
  r := api.expedicao_definir_frete(v_emp, v_exp, 24.90, 'PAC', 7, false);
  assert r ->> 'estado' = 'frete_cobrado', 'frete cobrado';
  v_cob := (r ->> 'cobranca_id')::uuid;
  assert (select tipo from venda.mov_cobranca where id = v_cob) = 'frete' and (select valor_total from venda.mov_cobranca where id = v_cob) = 24.90, 'cobrança do frete';
  assert api.expedicao_frete_pago(v_emp, v_exp, 'pix', 'Pix do frete conferido') = 'ok', 'frete pago';
  assert (select estado from venda.mov_expedicao where id = v_exp) = 'pronta', 'pronta após frete';
  perform api.expedicao_enviar(v_emp, v_exp, 'br123456789br', 'Correios');
  assert (select estado from venda.mov_expedicao where id = v_exp) = 'enviada' and (select codigo_rastreio from venda.mov_expedicao where id = v_exp) = 'BR123456789BR', 'enviada';
  assert not exists (select 1 from venda.mov_pedido where id in (select pedido_id from venda.rel_expedicao_pedido where expedicao_id = v_exp) and estado <> 'expedido'), 'pedidos expedidos';
  assert jsonb_array_length(api.expedicoes(v_emp)) >= 1, 'lista de envios';

  -- lista de bloqueio: incluída pelo @ sem cadastro; vitrine responde "não disponível", tentativa medida; conversa fora das filas
  v_bl := api.lista_bloqueio_incluir(v_emp, '@teste_bloq_0092', 'Comenta em todas as lives e nunca paga');
  assert (select bloqueado from crm.cfg_parceiro_regra where parceiro_id = v_bl), 'bloqueado';
  begin perform api.parceiro_regra_salvar(v_emp, v_bl, '{"bloqueado": true, "vip": true, "bloqueio_motivo": "x"}'); assert false, 'VIP e bloqueado juntos';
  exception when sqlstate '22023' then null; end;
  q := api.publico_quero(p_codigo => cods[1], p_canal => 'instagram', p_nome => 'Bia Bloq Teste', p_whatsapp => '34991110929', p_instagram => 'teste_bloq_0092', p_aceite => true, p_marketing => false, p_chave => 'teste-0092-bloq-aaaaaaa');
  assert q ->> 'erro' = 'nao_disponivel', 'vitrine bloqueada: ' || q::text;
  assert exists (select 1 from crm.log_tentativa_bloqueada where parceiro_id = v_bl and origem = 'vitrine'), 'tentativa da vitrine medida';
  select id into v_blcli from crm.cad_cliente where parceiro_id = v_bl limit 1;
  insert into atendimento.mov_conversa (empresa_id, cliente_id, canal, estado) values (v_emp, v_blcli, 'instagram', 'aberta') returning id into v_conv;
  assert (select lista_bloqueio and estado = 'resolvida' from atendimento.mov_conversa where id = v_conv), 'conversa fora da fila';
  insert into atendimento.mov_mensagem (empresa_id, conversa_id, canal, direcao, autor_tipo, tipo, conteudo) values (v_emp, v_conv, 'instagram', 'entrada', 'cliente', 'texto', 'quero a 12');
  assert exists (select 1 from crm.log_tentativa_bloqueada where parceiro_id = v_bl and origem = 'mensagem'), 'tentativa por mensagem medida';
  update atendimento.mov_conversa set estado = 'aberta', nao_lidas = 3 where id = v_conv;
  assert (select estado from atendimento.mov_conversa where id = v_conv) = 'resolvida', 'continua fora da fila';
  r := api.atendimento_resumo(v_emp);
  assert (r ->> 'lista_bloqueio')::int >= 1 and (r -> 'tentativas_bloqueadas' ->> 'd30')::int >= 2, 'resumo: ' || r::text;
  assert exists (select 1 from jsonb_array_elements(api.atendimento_conversas(v_emp, 'lista_bloqueio')) c where (c ->> 'id')::uuid = v_conv), 'filtro lista de bloqueio';
  assert not exists (select 1 from jsonb_array_elements(api.atendimento_conversas(v_emp, 'todas')) c where (c ->> 'id')::uuid = v_conv), 'fora da lista normal';
  assert exists (select 1 from api.listar_parceiros(v_emp, null, 'lista_bloqueio', null, null, null, false, 50) p where p.id = v_bl), 'filtro parceiros bloqueio';
  perform api.parceiro_regra_salvar(v_emp, v_bl, '{"bloqueado": false}');
  assert not (select lista_bloqueio from atendimento.mov_conversa where id = v_conv), 'saiu da lista';

  -- endereço pelo painel vai para o parceiro
  r := api.cliente_endereco_salvar(v_emp, v_cli, '{"cep": "38400100", "logradouro": "Av Afonso Pena", "numero": "999", "municipio": "Uberlandia", "uf": "MG"}');
  assert (select parceiro_id from crm.cad_parceiro_endereco where id = (r ->> 'id')::uuid) = v_vip, 'endereço do painel no parceiro';
  assert not exists (select 1 from crm.cad_cliente_endereco where cliente_id = v_cli), 'tabela aposentada não recebe';

  -- LGPD: anonimização do parceiro
  r := api.parceiro_anonimizar(v_emp, v_vip, 'pedido do titular (teste)');
  assert (r ->> 'perfis')::int >= 1, 'anonimizou perfis';
  assert not exists (select 1 from crm.cad_parceiro_documento where parceiro_id = v_vip), 'CPF removido';
  assert not exists (select 1 from crm.cad_parceiro_contato where parceiro_id = v_vip), 'contatos removidos';
  assert not exists (select 1 from crm.cad_parceiro_endereco where parceiro_id = v_vip and (ativo or logradouro <> 'anonimizado')), 'endereços anonimizados';
  assert (select nome from crm.cad_parceiro where id = v_vip) like 'Titular anonimizado %', 'nome anonimizado';
  assert exists (select 1 from cron.job where jobname = 'lgpd-expurgo-documentos'), 'expurgo agendado';

  -- permissões
  assert not has_function_privilege('anon', 'api.svc_getnet_notificacao(jsonb)', 'execute'), 'notificação exposta';
  assert not has_function_privilege('authenticated', 'api.svc_cobranca_da_reserva(text)', 'execute'), 'svc exposto';
  assert not has_function_privilege('anon', 'api.expedicoes(uuid,text)', 'execute'), 'anon em expedição';

  raise exception 'TESTES_OK (rollback forçado)';
end $t$;
