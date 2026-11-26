-- 89_testes_atendimento_whatsapp.sql — testes da 0089 (WhatsApp Cloud API na Caixa de entrada)
-- Roda numa transação e termina com exceção: nada fica gravado. O texto da exceção é o relatório.
do $$
declare
  v_emp uuid := '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda';
  v_adm uuid := (select usuario_id from crm.rel_usuario_empresa where empresa_id = '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda' and papel = 'admin' and ativo limit 1);
  v_ts bigint := extract(epoch from now())::bigint;
  r jsonb; v_ok int := 0; v_falha text[] := '{}'; v_cli uuid; v_cli2 uuid; v_conv uuid; v_msg bigint; v_n int;
  fn_msg jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  update engine.cfg_integracao set parametros = parametros || '{"phone_number_id":"TESTPNID"}', modo = 'real', somente_allowlist = true
   where empresa_id = v_emp and integracao = 'whatsapp';

  -- W1 mensagem de texto de número novo: cria cliente com nome do perfil, telefone e canal
  r := api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object(
         'messaging_product', 'whatsapp', 'metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'contacts', jsonb_build_array(jsonb_build_object('wa_id', '5534999998888', 'profile', jsonb_build_object('name', 'Maria Teste'))),
         'messages', jsonb_build_array(jsonb_build_object('from', '5534999998888', 'id', 'wamid.IN1', 'timestamp', v_ts::text,
                                                          'type', 'text', 'text', jsonb_build_object('body', 'Oi, ainda tem o vestido?'))))), true);
  select cliente_id into v_cli from crm.rel_cliente_canal where empresa_id = v_emp and canal = 'whatsapp' and identificador = '5534999998888';
  select id into v_conv from atendimento.mov_conversa where cliente_id = v_cli and canal = 'whatsapp' and estado <> 'resolvida';
  if r -> 'resultados' ->> 0 = 'mensagem' and (select nome from crm.cad_cliente where id = v_cli) = 'Maria Teste'
     and (select janela_ate from atendimento.mov_conversa where id = v_conv) > now() + interval '23 hours'
  then v_ok := v_ok + 1; else v_falha := v_falha || ('W1: ' || r::text); end if;

  -- W2 reenvio idempotente
  r := api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object(
         'metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'messages', jsonb_build_array(jsonb_build_object('from', '5534999998888', 'id', 'wamid.IN1', 'timestamp', v_ts::text, 'type', 'text', 'text', jsonb_build_object('body', 'Oi')))) ), true);
  if r -> 'resultados' ->> 0 = 'duplicado' then v_ok := v_ok + 1; else v_falha := v_falha || ('W2: ' || r::text); end if;

  -- W3 número sem o 9 encontra a cliente já cadastrada com o telefone formatado
  insert into crm.cad_cliente (empresa_id, nome, telefone) values (v_emp, 'Ana Cadastrada', '(34) 9 9777-6666') returning id into v_cli2;
  r := api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object(
         'metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'contacts', jsonb_build_array(jsonb_build_object('wa_id', '553497776666', 'profile', jsonb_build_object('name', 'Aninha'))),
         'messages', jsonb_build_array(jsonb_build_object('from', '553497776666', 'id', 'wamid.IN2', 'timestamp', v_ts::text, 'type', 'text', 'text', jsonb_build_object('body', 'Bom dia'))))), true);
  if (select cliente_id from crm.rel_cliente_canal where canal = 'whatsapp' and identificador = '553497776666') = v_cli2
     and (select nome from crm.cad_cliente where id = v_cli2) = 'Ana Cadastrada'
  then v_ok := v_ok + 1; else v_falha := v_falha || ('W3 telefone: ' || r::text); end if;

  -- W4 número de outra conta: não processa
  r := api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object(
         'metadata', jsonb_build_object('phone_number_id', 'OUTRO'),
         'messages', jsonb_build_array(jsonb_build_object('from', '5511900000000', 'id', 'wamid.X', 'timestamp', v_ts::text, 'type', 'text', 'text', jsonb_build_object('body', 'x'))))), true);
  if r -> 'resultados' ->> 0 = 'numero_desconhecido' then v_ok := v_ok + 1; else v_falha := v_falha || ('W4: ' || r::text); end if;

  -- W5 resposta fora da allowlist fica bloqueada; na allowlist vai para o outbox do WhatsApp
  r := api.atendimento_enviar(v_emp, v_conv, 'Tem sim, {{cliente.primeiro_nome}}!');
  if r ->> 'estado_entrega' = 'bloqueada' and r -> 'erro' ->> 'motivo' = 'fora_da_allowlist' then v_ok := v_ok + 1; else v_falha := v_falha || ('W5a: ' || r::text); end if;
  insert into engine.cfg_allowlist_destinatario (empresa_id, canal, identificador, descricao) values (v_emp, 'whatsapp', '5534999998888', 'teste');
  r := api.atendimento_enviar(v_emp, v_conv, 'Tem sim, {{cliente.primeiro_nome}}!');
  v_msg := (r ->> 'mensagem_id')::bigint;
  if r ->> 'estado_entrega' = 'pendente' and r ->> 'texto' = 'Tem sim, Maria!' and exists (select 1 from engine.mov_outbox
        where id = (select outbox_id from atendimento.mov_mensagem where id = v_msg) and integracao = 'whatsapp'
          and estado = 'pendente' and payload ->> 'destinatario' = '5534999998888')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('W5b: ' || r::text); end if;

  -- W6 status: entregue -> (sent atrasado não regride) -> lida
  update atendimento.mov_mensagem set id_externo = 'wamid.OUT1', estado_entrega = 'enviada' where id = v_msg;
  perform api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object('metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'statuses', jsonb_build_array(jsonb_build_object('id', 'wamid.OUT1', 'status', 'delivered', 'timestamp', v_ts::text, 'recipient_id', '5534999998888')))), true);
  perform api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object('metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'statuses', jsonb_build_array(jsonb_build_object('id', 'wamid.OUT1', 'status', 'sent', 'timestamp', v_ts::text)))), true);
  if (select estado_entrega from atendimento.mov_mensagem where id = v_msg) = 'entregue' then v_ok := v_ok + 1;
  else v_falha := v_falha || ('W6a: ' || (select estado_entrega from atendimento.mov_mensagem where id = v_msg)); end if;
  perform api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object('metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'statuses', jsonb_build_array(jsonb_build_object('id', 'wamid.OUT1', 'status', 'read', 'timestamp', v_ts::text)))), true);
  if (select estado_entrega from atendimento.mov_mensagem where id = v_msg) = 'lida' then v_ok := v_ok + 1; else v_falha := v_falha || 'W6b'::text; end if;

  -- W7 falha de entrega grava o motivo
  perform api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object('metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'statuses', jsonb_build_array(jsonb_build_object('id', 'wamid.OUT1', 'status', 'failed', 'timestamp', v_ts::text,
            'errors', jsonb_build_array(jsonb_build_object('code', 131047, 'title', 'Re-engagement message')))))), true);
  if (select estado_entrega = 'erro' and erro ->> 'detalhe' = 'Re-engagement message' from atendimento.mov_mensagem where id = v_msg)
  then v_ok := v_ok + 1; else v_falha := v_falha || 'W7'::text; end if;

  -- W8 coexistência: mensagem enviada pelo app Business entra como saída "app_nativo"
  r := api.svc_ingerir_whatsapp(jsonb_build_object('field', 'smb_message_echoes', 'value', jsonb_build_object('metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'message_echoes', jsonb_build_array(jsonb_build_object('from', '553433334444', 'to', '5534999998888', 'id', 'wamid.ECO1',
                                                                'timestamp', v_ts::text, 'type', 'text', 'text', jsonb_build_object('body', 'Respondi pelo celular'))))), true);
  if r -> 'resultados' ->> 0 = 'eco_app' and exists (select 1 from atendimento.mov_mensagem where conversa_id = v_conv and autor_tipo = 'app_nativo' and id_externo = 'wamid.ECO1')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('W8: ' || r::text); end if;

  -- W9 imagem com legenda
  r := api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object('metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'messages', jsonb_build_array(jsonb_build_object('from', '5534999998888', 'id', 'wamid.IMG1', 'timestamp', v_ts::text, 'type', 'image',
            'image', jsonb_build_object('id', 'MEDIA123', 'mime_type', 'image/jpeg', 'caption', 'Essa aqui'))))), true);
  if exists (select 1 from atendimento.mov_mensagem where id_externo = 'wamid.IMG1' and tipo = 'imagem' and conteudo = 'Essa aqui' and midia -> 0 ->> 'media_id' = 'MEDIA123')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('W9: ' || r::text); end if;

  -- W10 janela fechada no WhatsApp: recusa e sugere modelo aprovado
  update atendimento.mov_conversa set janela_ate = now() - interval '1 minute' where id = v_conv;
  begin
    perform api.atendimento_enviar(v_emp, v_conv, 'Oi?');
    v_falha := v_falha || 'W10 deveria recusar'::text;
  exception when others then
    if sqlerrm like 'janela de resposta fechada%modelo aprovado%' then v_ok := v_ok + 1; else v_falha := v_falha || ('W10: ' || sqlerrm); end if;
  end;

  -- W11 assinatura inválida não cria nada
  r := api.svc_ingerir_whatsapp(jsonb_build_object('field', 'messages', 'value', jsonb_build_object('metadata', jsonb_build_object('phone_number_id', 'TESTPNID'),
         'messages', jsonb_build_array(jsonb_build_object('from', '5511988887777', 'id', 'wamid.FAKE', 'timestamp', v_ts::text, 'type', 'text', 'text', jsonb_build_object('body', 'golpe'))))), false);
  if r -> 'resultados' ->> 0 = 'assinatura_invalida' and not exists (select 1 from crm.rel_cliente_canal where identificador = '5511988887777')
  then v_ok := v_ok + 1; else v_falha := v_falha || ('W11: ' || r::text); end if;

  -- W12 chave de telefone
  if atendimento.chave_telefone('+55 (34) 99999-8888') = atendimento.chave_telefone('553499998888')
     and atendimento.chave_telefone('34999998888') = '3499998888'
  then v_ok := v_ok + 1; else v_falha := v_falha || 'W12'::text; end if;

  -- W13 segredos do webhook devolvem listas (Instagram + WhatsApp)
  if jsonb_typeof(api.svc_meta_webhook_segredos() -> 'app_secrets') = 'array' then v_ok := v_ok + 1; else v_falha := v_falha || 'W13'::text; end if;

  raise exception 'RESULTADO ok=% falhas=% %', v_ok, cardinality(v_falha), array_to_string(v_falha, ' | ');
end $$;
