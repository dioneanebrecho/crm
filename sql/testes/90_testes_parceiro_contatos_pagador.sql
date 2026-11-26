-- Testes da 0090a-d (pedido 046): Contatos do parceiro, resolver, gatilhos, pagador no link de pagamento e absorção.
-- Tudo dentro de um DO que termina em exceção: o banco desfaz o que o teste criou.
-- Resultado esperado: "ERROR: TESTES_OK (rollback forçado) ..." — qualquer outra mensagem é falha.
do $t$
declare
  v_emp uuid := (select empresa_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  v_adm uuid := (select usuario_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  v_cli uuid; v_cli2 uuid; v_p uuid; v_p2 uuid; v_mae uuid; v_filha uuid; v_filha2 uuid; v_bling_p uuid; v_bling_ig text;
  v_qtd_parc int; cods text[]; q jsonb; tok text; tok2 text; r jsonb; v_res uuid; log text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);

  -- T1 normalização
  assert crm.norm_instagram('@@Maria.Silva_1') = 'maria.silva_1', 'norm @';
  assert crm.norm_instagram('maria silva') is null, 'norm @ inválido';
  assert crm.norm_telefone('(34) 99123-4567') = '5534991234567', 'norm tel';
  assert crm.norm_telefone('+55 34 3212-0000') = '553432120000', 'norm fixo';
  assert crm.norm_telefone('123') is null, 'norm tel inválido';

  -- T2 DM só com igsid -> pré-cadastro com papel cliente e contato pelo igsid
  insert into crm.cad_cliente (empresa_id, instagram_igsid) values (v_emp, 'igsid-teste-0090-a') returning id, parceiro_id into v_cli, v_p;
  assert v_p is not null, 'DM sem parceiro';
  assert exists (select 1 from crm.rel_parceiro_papel where parceiro_id = v_p and papel = 'cliente'), 'DM sem papel cliente';
  assert exists (select 1 from crm.cad_parceiro_contato where parceiro_id = v_p and igsid = 'igsid-teste-0090-a' and valor is null), 'contato igsid';

  -- T3 comentário na live da mesma conta traz o @: mesma linha de contato ganha o @
  insert into crm.cad_cliente (empresa_id, instagram_igsid, instagram_username) values (v_emp, 'igsid-teste-0090-a', 'teste_filha_0090')
  on conflict (empresa_id, instagram_igsid) do update set instagram_username = excluded.instagram_username, atualizado_em = now();
  assert (select count(*) from crm.cad_parceiro_contato where parceiro_id = v_p and tipo = 'instagram' and situacao <> 'inativo') = 1, 'uma linha por conta';
  assert exists (select 1 from crm.cad_parceiro_contato where parceiro_id = v_p and igsid = 'igsid-teste-0090-a' and valor = 'teste_filha_0090'), '@ na linha do igsid';
  assert exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = v_p and tipo = 'instagram' and valor_hash = 'teste_filha_0090'), '@ como identificador';
  v_filha := v_p;

  -- T4 @ que veio do Bling (parceiro com CPF) é reconhecido: não cria parceiro novo
  select k.parceiro_id, k.valor into v_bling_p, v_bling_ig from crm.cad_parceiro_contato k
   where k.empresa_id = v_emp and k.tipo = 'instagram' and k.origem = 'bling'
     and exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = k.parceiro_id and i.tipo = 'cpf') limit 1;
  v_qtd_parc := (select count(*) from crm.cad_parceiro);
  insert into crm.cad_cliente (empresa_id, instagram_igsid, instagram_username) values (v_emp, 'igsid-teste-0090-b', v_bling_ig) returning parceiro_id into v_p2;
  assert v_p2 = v_bling_p, 'não reconheceu o @ do Bling';
  assert (select count(*) from crm.cad_parceiro) = v_qtd_parc, 'criou parceiro duplicado';
  assert exists (select 1 from crm.cad_parceiro_contato where parceiro_id = v_bling_p and valor = v_bling_ig and igsid = 'igsid-teste-0090-b'), 'igsid no contato Bling';

  -- T5 resolver idempotente; conflito não move contato de outro parceiro
  assert crm.resolver_parceiro(v_emp, null, '@' || v_bling_ig, null) = v_bling_p, 'resolver por @';
  assert crm.resolver_parceiro(v_emp, null, v_bling_ig, null) = v_bling_p, 'resolver idempotente';
  assert crm._registrar_contato(v_emp, v_filha, 'instagram', v_bling_ig, null, 'manual') is null, 'registrou contato de outro';
  assert (select parceiro_id from crm.cad_parceiro_contato where valor = v_bling_ig and situacao <> 'inativo') = v_bling_p, 'contato mudou de dono';
  assert exists (select 1 from crm.log_parceiro_contato where acao = 'conflito' and parceiro_depois = v_filha), 'conflito sem log';

  -- mãe: parceiro com CPF 529.982.247-25
  insert into crm.cad_cliente (empresa_id, nome, instagram_username) values (v_emp, 'Mae Teste Silva', 'teste_mae_0090') returning parceiro_id into v_mae;
  insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (v_emp, v_mae, 'cpf', bling.fn_hash_doc('52998224725'), '4725');

  -- T6 filha (pré-cadastro) reserva pela vitrine e paga com o CPF da mãe
  select array_agg(x ->> 'codigo') into cods from jsonb_array_elements(api.publico_vitrine(null, null) -> 'itens') x where x ->> 'situacao' = 'disponivel';
  assert cardinality(cods) >= 2, 'faltam peças disponíveis para o teste';
  q := api.publico_quero(p_codigo => cods[1], p_canal => 'instagram', p_nome => 'Filha Teste Souza', p_whatsapp => '34991110090',
                         p_instagram => '@teste_filha_0090', p_aceite => true, p_marketing => false, p_chave => 'teste-0090-chave-filha-a');
  tok := q ->> 'token';
  assert tok is not null and q ->> 'situacao' = 'reservada', 'quero filha: ' || q::text;
  select c.id into v_cli2 from crm.cad_cliente c join venda.mov_acompanhamento a on a.cliente_id = c.id where a.token = tok;
  assert (select parceiro_id from crm.cad_cliente where id = v_cli2) = v_filha, 'vitrine não achou a filha pelo @';
  assert exists (select 1 from crm.cad_parceiro_contato where parceiro_id = v_filha and tipo = 'whatsapp' and valor = '5534991110090'), 'whatsapp da filha';
  r := api.publico_entrega_salvar(tok, false, '529.982.247-25', '38400-000', 'Rua A', '1', null, 'Centro', 'Uberlândia', 'MG');
  assert (r ->> 'ok')::boolean and (r ->> 'cpf_reconhecido')::boolean, 'entrega filha: ' || r::text;
  assert r - 'ok' - 'cpf_reconhecido' - 'cep_oficial' = '{}'::jsonb, 'resposta vazou dado';
  select id into v_res from live.mov_reserva r2 where r2.cliente_id = v_cli2 and r2.estado = 'ativa';
  assert (select parceiro_pagador_id from live.mov_reserva where id = v_res) = v_mae, 'pagador não é a mãe';
  assert (select pagador_situacao from live.mov_reserva where id = v_res) = 'terceiro_confirmar', 'situação pagador';
  assert not exists (select 1 from crm.cad_cliente_documento where cliente_id = v_cli2) and not exists (select 1 from crm.cad_parceiro_documento where parceiro_id = v_filha), 'CPF da mãe gravado na filha';
  assert not exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = v_filha and tipo = 'cpf'), 'CPF da mãe na filha';
  assert api.publico_entrega_salvar(tok, true) ->> 'erro' = 'sem_dados_salvos', 'usar salvo com CPF de terceiro';

  -- T7 pagamento aprovado: o pré-cadastro da filha é absorvido pela mãe; @ vira contato familiar
  r := crm.confirmar_pagador_reserva(v_res);
  assert r ->> 'acao' = 'absorvido', 'absorção: ' || r::text;
  assert (select parceiro_id from crm.cad_parceiro_contato where valor = 'teste_filha_0090' and situacao <> 'inativo') = v_mae, '@ não foi para a mãe';
  assert (select vinculo from crm.cad_parceiro_contato where valor = 'teste_filha_0090' and situacao <> 'inativo') = 'familiar', 'vínculo familiar';
  assert (select count(*) from crm.cad_cliente where parceiro_id = v_filha) = 0, 'perfil ficou na filha';
  assert not (select ativo from crm.cad_parceiro where id = v_filha), 'pré-cadastro continua ativo';
  assert (select pagador_situacao from live.mov_reserva where id = v_res) = 'terceiro', 'situação após absorção';
  assert crm.confirmar_pagador_reserva(v_res) ->> 'acao' = 'nada', 'absorção repetida';
  assert (select count(*) from crm.cad_parceiro_contato where parceiro_id = v_mae and tipo = 'instagram' and principal and situacao <> 'inativo') = 1, 'dois principais';

  -- T8 filha com CPF próprio paga com CPF da mãe: nada muda de dono
  q := api.publico_quero(p_codigo => cods[2], p_canal => 'instagram', p_nome => 'Outra Filha Teste', p_whatsapp => '34991110091',
                         p_instagram => 'teste_filha2_0090', p_aceite => true, p_marketing => false, p_chave => 'teste-0090-chave-filha-b');
  tok2 := q ->> 'token';
  assert tok2 is not null, 'quero filha2: ' || q::text;
  select c.parceiro_id into v_filha2 from crm.cad_cliente c join venda.mov_acompanhamento a on a.cliente_id = c.id where a.token = tok2;
  insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (v_emp, v_filha2, 'cpf', bling.fn_hash_doc('11144477735'), '7735');
  r := api.publico_entrega_salvar(tok2, false, '52998224725', '38400000', 'Rua B', '2', null, 'Centro', 'Uberlândia', 'MG');
  assert (r ->> 'cpf_reconhecido')::boolean, 'reconhecido 2';
  select id into v_res from live.mov_reserva r2 join venda.mov_acompanhamento a on a.interesse_id = r2.interesse_id where a.token = tok2 and r2.estado = 'ativa';
  assert (select pagador_situacao from live.mov_reserva where id = v_res) = 'terceiro', 'terceiro com CPF próprio';
  assert crm.confirmar_pagador_reserva(v_res) ->> 'acao' = 'nada', 'absorveu quem tem CPF';
  assert (select parceiro_id from crm.cad_parceiro_contato where valor = 'teste_filha2_0090' and situacao <> 'inativo') = v_filha2, '@ mudou de dono';

  -- T9 mesmo link, CPF novo (390.533.447-05) e o perfil já tem CPF: cria parceiro pagador novo
  v_qtd_parc := (select count(*) from crm.cad_parceiro);
  r := api.publico_entrega_salvar(tok2, false, '39053344705', '38400000', 'Rua B', '2', null, 'Centro', 'Uberlândia', 'MG', null, 'Pagadora Teste Silva');
  assert (r ->> 'ok')::boolean and not (r ->> 'cpf_reconhecido')::boolean, 'cpf novo: ' || r::text;
  assert (select count(*) from crm.cad_parceiro) = v_qtd_parc + 1, 'não criou pagador';
  assert (select p.origem from live.mov_reserva x join crm.cad_parceiro p on p.id = x.parceiro_pagador_id where x.id = v_res) = 'pagamento', 'origem pagador';

  -- T10 CPF do próprio titular: grava documento no perfil (comportamento anterior preservado)
  r := api.publico_entrega_salvar(tok2, false, '11144477735', '38400000', 'Rua B', '2', null, 'Centro', 'Uberlândia', 'MG');
  assert (select pagador_situacao from live.mov_reserva where id = v_res) = 'titular', 'titular';
  assert exists (select 1 from crm.cad_parceiro_documento where parceiro_id = v_filha2), 'doc titular (no parceiro, desde a 0091)';
  assert (api.publico_entrega_salvar(tok2, true) ->> 'ok')::boolean, 'usar salvo titular';

  -- T11 API da tela
  r := api.parceiro_resumo(v_emp, v_mae);
  assert (r -> 'contatos' ->> 'instagram')::int = 2 and not (r ->> 'pre_cadastro')::boolean, 'resumo: ' || r::text;
  assert 'endereço fiscal completo' = any (array(select jsonb_array_elements_text(r -> 'faltas_nfe'))), 'faltas NF-e';
  assert jsonb_array_length(api.parceiro_contatos(v_emp, v_mae)) >= 2, 'lista contatos';
  perform api.parceiro_contato_salvar(v_emp, v_mae, jsonb_build_object('tipo', 'email', 'valor', 'Mae@Exemplo.com', 'vinculo', 'titular'));
  assert exists (select 1 from crm.cad_parceiro_contato where parceiro_id = v_mae and tipo = 'email' and valor = 'mae@exemplo.com'), 'email manual';
  perform api.parceiro_contato_mover(v_emp, (select id from crm.cad_parceiro_contato where valor = 'teste_filha_0090' and situacao <> 'inativo'), v_filha2, 'teste de mover');
  assert (select parceiro_id from crm.cad_parceiro_contato where valor = 'teste_filha_0090' and situacao <> 'inativo') = v_filha2, 'mover';
  assert (select count(*) from api.listar_parceiros(v_emp, 'teste_filha_0090')) = 1, 'busca por contato';
  assert exists (select 1 from api.listar_parceiros(v_emp, null, 'pre_cadastro', null, null, null, false, 5)), 'filtro pré-cadastro';
  begin
    perform api.parceiro_absorver(v_emp, v_mae, v_filha2, 'x');
    assert false, 'absorveu parceiro com CPF';
  exception when sqlstate '22023' then null;
  end;

  -- T12 permissões
  assert not has_function_privilege('anon', 'api.parceiro_resumo(uuid,uuid)', 'execute'), 'anon no resumo';
  assert not has_function_privilege('authenticated', 'crm.absorver_pre_cadastro(uuid,uuid,text)', 'execute'), 'absorver exposto';
  assert not has_function_privilege('authenticated', 'crm.resolver_parceiro(uuid,text,text,text,text,text)', 'execute'), 'resolver exposto';
  assert has_function_privilege('authenticated', 'api.parceiro_contatos(uuid,uuid)', 'execute'), 'contatos sem grant';
  assert (select count(*) from crm.cad_cliente where parceiro_id is null) = 0, 'cliente sem parceiro';

  log := format('contatos=%s; parceiros=%s', (select count(*) from crm.cad_parceiro_contato), (select count(*) from crm.cad_parceiro));
  raise exception 'TESTES_OK (rollback forçado) %', log;
end $t$;
