-- 87_testes_atendimento.sql — testes da 0087 (caixa de entrada + respostas prontas)
-- Roda dentro de uma transação e termina com exceção: nada fica gravado. O texto da exceção é o relatório.
do $$
declare
  v_emp uuid := '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda';
  v_adm uuid := (select usuario_id from crm.rel_usuario_empresa where empresa_id = '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda' and papel = 'admin' and ativo limit 1);
  v_ig text := (select instagram_user_id_esperado from crm.cad_empresa where id = '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda');
  v_ts bigint := (extract(epoch from now()) * 1000)::bigint;
  r jsonb; v_conv uuid; v_cli uuid; v_ok int := 0; v_falha text[] := '{}'; c atendimento.mov_conversa;
  v_rp uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_adm::text, true);

  -- T1 ingestão de DM
  r := api.svc_ingerir_mensagem_meta(jsonb_build_object('entry_id', v_ig, 'time', v_ts, 'item', jsonb_build_object(
         'sender', jsonb_build_object('id', 'TESTE_IGSID_1'), 'recipient', jsonb_build_object('id', v_ig),
         'timestamp', v_ts, 'message', jsonb_build_object('mid', 'mid.teste.1', 'text', 'Oi, a peça A1 ainda tem?'))), true, '{}');
  if r ->> 'resultado' = 'mensagem' then v_ok := v_ok + 1; else v_falha := v_falha || ('T1 ingestao: ' || r::text); end if;

  -- T2 reenvio do mesmo webhook é idempotente
  r := api.svc_ingerir_mensagem_meta(jsonb_build_object('item', jsonb_build_object(
         'sender', jsonb_build_object('id', 'TESTE_IGSID_1'), 'recipient', jsonb_build_object('id', v_ig),
         'timestamp', v_ts, 'message', jsonb_build_object('mid', 'mid.teste.1', 'text', 'Oi, a peça A1 ainda tem?'))), true, '{}');
  if r ->> 'resultado' = 'duplicado' then v_ok := v_ok + 1; else v_falha := v_falha || ('T2 duplicado: ' || r::text); end if;

  select cv.* into c from atendimento.mov_conversa cv join crm.cad_cliente cl on cl.id = cv.cliente_id
   where cl.instagram_igsid = 'TESTE_IGSID_1' and cv.empresa_id = v_emp;
  v_conv := c.id; v_cli := c.cliente_id;
  -- T3 conversa aberta, 1 não lida, janela de 24 h
  if c.estado = 'aberta' and c.nao_lidas = 1 and c.janela_ate > now() + interval '23 hours'
     and (select count(*) from atendimento.mov_mensagem where conversa_id = v_conv) = 1
     and exists (select 1 from crm.rel_cliente_canal where cliente_id = v_cli and canal = 'instagram' and identificador = 'TESTE_IGSID_1')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T3 conversa: ' || row_to_json(c)::text); end if;

  -- T4 lista mostra a conversa aguardando resposta, sem atendente
  r := api.atendimento_conversas(v_emp, 'nao_atribuidas');
  if exists (select 1 from jsonb_array_elements(r) x where x ->> 'id' = v_conv::text and (x ->> 'aguardando_resposta')::boolean)
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T4 lista'); end if;

  -- T5 prévia aponta variável sem valor (cliente sem nome nem @)
  r := api.atendimento_previa(v_emp, v_conv, 'Oi, {{cliente.primeiro_nome}}! Aqui é {{atendente.primeiro_nome}}.');
  if r -> 'faltantes' ? 'cliente.primeiro_nome' then v_ok := v_ok + 1; else v_falha := v_falha || ('T5 faltante: ' || r::text); end if;

  -- T6 com @ preenchido, a prévia resolve tudo
  update crm.cad_cliente set instagram_username = 'teste.cliente' where id = v_cli;
  r := api.atendimento_previa(v_emp, v_conv, 'Oi, {{ cliente.primeiro_nome }}! Aqui é {{atendente.primeiro_nome}}, da {{empresa.nome}}. {{xpto.y}}');
  if r ->> 'texto' like 'Oi, @teste.cliente! Aqui é %, da %.%' and jsonb_array_length(r -> 'faltantes') = 1 and r -> 'desconhecidas' ? 'xpto.y'
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T6 previa: ' || r::text); end if;

  -- T7 envio com variável sem valor é recusado
  begin
    perform api.atendimento_enviar(v_emp, v_conv, 'Seu link: {{reserva.link}}');
    v_falha := v_falha || 'T7 deveria recusar variavel sem valor';
  exception when others then
    if sqlerrm like 'variáveis sem valor%reserva.link%' then v_ok := v_ok + 1; else v_falha := v_falha || ('T7 erro: ' || sqlerrm); end if;
  end;

  -- T8 integração desligada: mensagem fica registrada como bloqueada, sem outbox
  update engine.cfg_integracao set modo = 'desligado' where empresa_id = v_emp and integracao = 'meta_dm';
  r := api.atendimento_enviar(v_emp, v_conv, 'Tem sim!');
  if r ->> 'estado_entrega' = 'bloqueada' and r -> 'erro' ->> 'motivo' = 'integracao_desligada'
     and (select atendente_id from atendimento.mov_conversa where id = v_conv) = v_adm
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T8 desligado: ' || r::text); end if;

  -- T9 modo simulado
  update engine.cfg_integracao set modo = 'simulado' where empresa_id = v_emp and integracao = 'meta_dm';
  r := api.atendimento_enviar(v_emp, v_conv, 'Oi {{cliente.primeiro_nome}}', (select id from atendimento.cad_resposta_pronta where empresa_id = v_emp and atalho = 'ola'));
  if r ->> 'estado_entrega' = 'simulada' and r ->> 'texto' = 'Oi @teste.cliente'
     and (select usos from atendimento.cad_resposta_pronta where empresa_id = v_emp and atalho = 'ola') >= 1
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T9 simulado: ' || r::text); end if;

  -- T10 modo real fora da allowlist: bloqueada
  update engine.cfg_integracao set modo = 'real', somente_allowlist = true where empresa_id = v_emp and integracao = 'meta_dm';
  r := api.atendimento_enviar(v_emp, v_conv, 'Teste real');
  if r ->> 'estado_entrega' = 'bloqueada' and r -> 'erro' ->> 'motivo' = 'fora_da_allowlist'
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T10 allowlist: ' || r::text); end if;

  -- T11 modo real na allowlist: vai para o outbox pendente
  insert into engine.cfg_allowlist_destinatario (empresa_id, canal, identificador, descricao) values (v_emp, 'instagram', 'TESTE_IGSID_1', 'teste');
  r := api.atendimento_enviar(v_emp, v_conv, 'Teste real 2');
  if r ->> 'estado_entrega' = 'pendente' and exists (select 1 from engine.mov_outbox ob join atendimento.mov_mensagem m on m.outbox_id = ob.id
        where m.id = (r ->> 'mensagem_id')::bigint and ob.estado = 'pendente' and ob.payload ->> 'destinatario' = 'TESTE_IGSID_1')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T11 outbox: ' || r::text); end if;

  -- T12 eco do app do Instagram entra como saída "app_nativo"
  r := api.svc_ingerir_mensagem_meta(jsonb_build_object('item', jsonb_build_object(
         'sender', jsonb_build_object('id', v_ig), 'recipient', jsonb_build_object('id', 'TESTE_IGSID_1'),
         'timestamp', v_ts + 1000, 'message', jsonb_build_object('mid', 'mid.teste.eco', 'text', 'respondi pelo celular', 'is_echo', true))), true, '{}');
  if r ->> 'resultado' = 'eco_app' and exists (select 1 from atendimento.mov_mensagem where conversa_id = v_conv and autor_tipo = 'app_nativo')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T12 eco: ' || r::text); end if;

  -- T13 confirmação de leitura
  update atendimento.mov_mensagem set id_externo = 'mid.teste.saida', estado_entrega = 'enviada' where id = (select max(id) from atendimento.mov_mensagem where conversa_id = v_conv and autor_tipo = 'atendente');
  r := api.svc_ingerir_mensagem_meta(jsonb_build_object('item', jsonb_build_object(
         'sender', jsonb_build_object('id', 'TESTE_IGSID_1'), 'recipient', jsonb_build_object('id', v_ig),
         'timestamp', v_ts + 2000, 'read', jsonb_build_object('mid', 'mid.teste.saida'))), true, '{}');
  if r ->> 'resultado' = 'leitura' and exists (select 1 from atendimento.mov_mensagem where id_externo = 'mid.teste.saida' and estado_entrega = 'lida')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T13 leitura: ' || r::text); end if;

  -- T14 janela de 24 h vencida, ainda na de 7 dias: usa HUMAN_AGENT
  update atendimento.mov_conversa set janela_ate = now() - interval '1 hour', janela_humana_ate = now() + interval '1 day' where id = v_conv;
  r := api.atendimento_enviar(v_emp, v_conv, 'Voltando ao seu pedido');
  if (r ->> 'human_agent')::boolean then v_ok := v_ok + 1; else v_falha := v_falha || ('T14 human_agent: ' || r::text); end if;

  -- T15 janela totalmente fechada: recusa
  update atendimento.mov_conversa set janela_humana_ate = now() - interval '1 hour' where id = v_conv;
  begin
    perform api.atendimento_enviar(v_emp, v_conv, 'Oi?');
    v_falha := v_falha || 'T15 deveria recusar janela fechada';
  exception when others then
    if sqlerrm like 'janela de resposta fechada%' then v_ok := v_ok + 1; else v_falha := v_falha || ('T15 erro: ' || sqlerrm); end if;
  end;

  -- T16 nota interna funciona mesmo com janela fechada
  r := api.atendimento_enviar(v_emp, v_conv, 'Cliente pediu medidas do busto', null, true);
  if r ->> 'estado_entrega' = 'nota' then v_ok := v_ok + 1; else v_falha := v_falha || ('T16 nota: ' || r::text); end if;

  -- T17 nova mensagem da cliente reabre conversa adiada e renova a janela
  perform api.atendimento_acao(v_emp, v_conv, 'adiar', (now() + interval '2 hours')::text);
  r := api.svc_ingerir_mensagem_meta(jsonb_build_object('item', jsonb_build_object(
         'sender', jsonb_build_object('id', 'TESTE_IGSID_1'), 'recipient', jsonb_build_object('id', v_ig),
         'timestamp', v_ts + 3000, 'message', jsonb_build_object('mid', 'mid.teste.2', 'text', 'e o busto?'))), true, '{}');
  select * into c from atendimento.mov_conversa where id = v_conv;
  if c.estado = 'aberta' and c.adiada_ate is null and c.janela_ate > now() then v_ok := v_ok + 1;
  else v_falha := v_falha || ('T17 reabrir: ' || row_to_json(c)::text); end if;

  -- T18 etiquetas e resolver
  perform api.atendimento_acao(v_emp, v_conv, 'etiqueta_add', (select id::text from atendimento.cad_etiqueta where empresa_id = v_emp and nome = 'Dúvida de medida'));
  perform api.atendimento_acao(v_emp, v_conv, 'estado', 'resolvida');
  if exists (select 1 from atendimento.rel_conversa_etiqueta where conversa_id = v_conv)
     and (select estado from atendimento.mov_conversa where id = v_conv) = 'resolvida'
  then v_ok := v_ok + 1; else v_falha := v_falha || 'T18 etiqueta/resolver'; end if;

  -- T19 nova mensagem após resolvida abre NOVA conversa
  r := api.svc_ingerir_mensagem_meta(jsonb_build_object('item', jsonb_build_object(
         'sender', jsonb_build_object('id', 'TESTE_IGSID_1'), 'recipient', jsonb_build_object('id', v_ig),
         'timestamp', v_ts + 4000, 'message', jsonb_build_object('mid', 'mid.teste.3', 'text', 'oi de novo'))), true, '{}');
  if (select count(*) from atendimento.mov_conversa where cliente_id = v_cli) = 2 then v_ok := v_ok + 1;
  else v_falha := v_falha || 'T19 nova conversa'; end if;

  -- T20 salvar resposta: variável inexistente é recusada; válida grava e versiona
  begin
    perform api.atendimento_resposta_salvar(v_emp, '{"atalho":"tst","titulo":"t","corpo":"Oi {{cliente.apelido}}"}');
    v_falha := v_falha || 'T20 deveria recusar variavel inexistente';
  exception when others then
    if sqlerrm like 'variáveis inexistentes: cliente.apelido%' then v_ok := v_ok + 1; else v_falha := v_falha || ('T20 erro: ' || sqlerrm); end if;
  end;
  r := api.atendimento_resposta_salvar(v_emp, '{"atalho":"tst","titulo":"t","categoria":"geral","corpo":"Oi {{cliente.nome}}"}');
  v_rp := (r ->> 'id')::uuid;
  perform api.atendimento_resposta_salvar(v_emp, jsonb_build_object('id', v_rp, 'atalho', 'tst', 'titulo', 't', 'corpo', 'Olá {{cliente.nome}}'));
  if (select versao from atendimento.cad_resposta_pronta where id = v_rp) = 2 then v_ok := v_ok + 1;
  else v_falha := v_falha || 'T21 versao'; end if;

  -- T22 assinatura inválida não cria conversa
  r := api.svc_ingerir_mensagem_meta(jsonb_build_object('item', jsonb_build_object(
         'sender', jsonb_build_object('id', 'TESTE_IGSID_2'), 'recipient', jsonb_build_object('id', v_ig),
         'timestamp', v_ts, 'message', jsonb_build_object('mid', 'mid.teste.x', 'text', 'golpe'))), false, '{}');
  if r ->> 'resultado' = 'assinatura_invalida' and not exists (select 1 from crm.cad_cliente where instagram_igsid = 'TESTE_IGSID_2')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('T22 assinatura: ' || r::text); end if;

  -- T23 usuário sem vínculo com a empresa é barrado
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform api.atendimento_conversas(v_emp);
    v_falha := v_falha || 'T23 deveria barrar';
  exception when others then
    if sqlerrm = 'sem permissão' then v_ok := v_ok + 1; else v_falha := v_falha || ('T23 erro: ' || sqlerrm); end if;
  end;

  raise exception 'RESULTADO ok=% falhas=% %', v_ok, cardinality(v_falha), array_to_string(v_falha, ' | ');
end $$;
