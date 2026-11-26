-- 87b_testes_variaveis_venda_real.sql — garante que as respostas prontas puxam os dados reais da venda
-- Monta uma venda completa (live, reserva, link, Pix, pedido, envio) dentro de uma transação que termina em exceção:
-- nada fica gravado. Falha se alguma resposta pronta de venda/pagamento/envio ficar com variável sem valor
-- ou se o texto enviado pelo servidor não trouxer os valores.
do $$
declare
  v_emp uuid := '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda';
  v_adm uuid := (select usuario_id from crm.rel_usuario_empresa where empresa_id = '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda' and papel = 'admin' and ativo limit 1);
  v_uni catalogo.cad_unidade; v_var uuid; v_live uuid; v_item uuid; v_cli uuid; v_ev bigint; v_int bigint; v_cob uuid; v_ped uuid; v_conv uuid;
  v jsonb; r jsonb; t record; v_ok int := 0; v_falha text[] := '{}';
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  select * into v_uni from catalogo.cad_unidade where empresa_id = v_emp and estado = 'disponivel' limit 1;
  v_var := v_uni.variacao_id;
  insert into crm.cad_cliente (empresa_id, nome, instagram_igsid, instagram_username) values (v_emp, 'Maria Teste Real', 'IGSID_TESTE_VAR', 'maria.teste') returning id into v_cli;
  insert into live.mov_live (empresa_id, titulo) values (v_emp, 'Live teste variáveis') returning id into v_live;
  insert into live.mov_item (empresa_id, live_id, variacao_id, codigo_live, preco) values (v_emp, v_live, v_var, 'T77', 89.9) returning id into v_item;
  insert into engine.log_evento_bruto (fonte, origem, tipo, id_externo, payload, assinatura_valida) values ('manual', coalesce(engine.origem_padrao(),'piloto'), 'teste', 'teste-var-1', '{}', true) returning id into v_ev;
  insert into live.mov_interesse (empresa_id, live_id, item_id, cliente_id, evento_id, comentario_id_externo, texto, comentado_em, recebido_em, canal)
  values (v_emp, v_live, v_item, v_cli, v_ev, 'c-teste-var', 'quero T77', now(), now(), 'live') returning id into v_int;
  insert into live.mov_reserva (empresa_id, item_id, cliente_id, unidade_id, interesse_id, estado, expira_em)
  values (v_emp, v_item, v_cli, v_uni.id, v_int, 'ativa', now() + interval '12 minutes');
  insert into venda.cad_link_venda (empresa_id, item_id, variacao_id, codigo_curto, url, preco, estado) values (v_emp, v_item, v_var, 'TSTVAR77', 'https://anebrecho.com.br/p/T77', 89.9, 'ativo');
  insert into venda.mov_cobranca (empresa_id, cliente_id, live_id, valor_itens, frete, estado, link_url, expira_em)
  values (v_emp, v_cli, v_live, 89.9, 12.9, 'aberta', 'https://anebrecho.com.br/pix/TESTE', now() + interval '20 minutes') returning id into v_cob;
  insert into venda.mov_pedido (empresa_id, numero_loja, cobranca_id, cliente_id, valor_itens, frete, estado) values (v_emp, 'T-1045', v_cob, v_cli, 89.9, 12.9, 'expedido') returning id into v_ped;
  insert into venda.mov_envio (empresa_id, pedido_id, transportadora, codigo_rastreio, url_rastreio, estado) values (v_emp, v_ped, 'Correios', 'QB000TESTE0BR', 'https://rastreamento.correios.com.br', 'em_transito');
  insert into atendimento.mov_conversa (empresa_id, cliente_id, canal, estado, janela_ate) values (v_emp, v_cli, 'instagram', 'aberta', now() + interval '20 hours') returning id into v_conv;

  v := atendimento.variaveis_contexto(v_conv, v_adm);
  for t in select atalho, corpo from atendimento.cad_resposta_pronta where empresa_id = v_emp and atalho in ('ola','link','prazo','pix','pago','status','rastreio') loop
    r := atendimento.renderizar(t.corpo, v);
    if jsonb_array_length(r -> 'faltantes') = 0 and (r ->> 'texto') !~ '\{\{' then v_ok := v_ok + 1;
    else v_falha := v_falha || (t.atalho || ': ' || (r -> 'faltantes')::text); end if;
  end loop;
  if v ->> 'reserva.valor' = 'R$ 89,90' and v ->> 'cobranca.valor' = 'R$ 102,80' and v ->> 'envio.codigo_rastreio' = 'QB000TESTE0BR'
  then v_ok := v_ok + 1; else v_falha := v_falha || ('valores: ' || v::text); end if;

  update engine.cfg_integracao set modo = 'simulado' where empresa_id = v_emp and integracao = 'meta_dm';
  r := api.atendimento_enviar(v_emp, v_conv, (select corpo from atendimento.cad_resposta_pronta where empresa_id = v_emp and atalho = 'pix'));
  if r ->> 'texto' like 'Seu Pix de R$ 102,80 está aqui: https://anebrecho.com.br/pix/TESTE.%' then v_ok := v_ok + 1;
  else v_falha := v_falha || ('servidor: ' || r::text); end if;
  if atendimento.origem_entrada(v_conv) ->> 'tipo' = 'live' then v_ok := v_ok + 1; else v_falha := v_falha || 'origem'::text; end if;

  raise exception 'RESULTADO ok=% falhas=% %', v_ok, cardinality(v_falha), array_to_string(v_falha, ' | ');
end $$;
