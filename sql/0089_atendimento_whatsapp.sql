-- 0089_atendimento_whatsapp.sql
-- Conector WhatsApp Cloud API (oficial, direto, sem BSP) para a Caixa de entrada (0087).
-- Decisão P30 (claude/decisao-canal-whatsapp-oficial-vs-nao-oficial.md). Suporta coexistência com o app Business (P31, a validar):
-- mensagens enviadas pelo app chegam pelo campo de webhook smb_message_echoes e entram como "app_nativo".
-- Entrada: webhook meta-webhook (object = whatsapp_business_account) -> api.svc_ingerir_whatsapp -> um evento bruto por item.
-- Saída: api.atendimento_enviar (0087) enfileira integracao 'whatsapp' -> engine.job_atendimento_whatsapp (pg_net) -> /{phone_number_id}/messages.

-- 1. Segredos do webhook: aceita o app da Meta do Instagram e o do WhatsApp (podem ser o mesmo app)
create or replace function api.svc_meta_webhook_segredos()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'verify_token', (select ds.decrypted_secret from private.cad_credencial c join vault.decrypted_secrets ds on ds.id = c.segredo_id
                      where c.nome in ('meta_live.verify_token','meta_dm.verify_token') order by c.atualizado_em desc limit 1),
    'app_secret',   (select ds.decrypted_secret from private.cad_credencial c join vault.decrypted_secrets ds on ds.id = c.segredo_id
                      where c.nome in ('meta_live.app_secret','meta_dm.app_secret') order by c.atualizado_em desc limit 1),
    'verify_tokens', coalesce((select jsonb_agg(distinct btrim(ds.decrypted_secret)) from private.cad_credencial c join vault.decrypted_secrets ds on ds.id = c.segredo_id
                      where c.nome in ('meta_live.verify_token','meta_dm.verify_token','whatsapp.verify_token')), '[]'::jsonb),
    'app_secrets',   coalesce((select jsonb_agg(distinct btrim(ds.decrypted_secret)) from private.cad_credencial c join vault.decrypted_secrets ds on ds.id = c.segredo_id
                      where c.nome in ('meta_live.app_secret','meta_dm.app_secret','whatsapp.app_secret')), '[]'::jsonb))
$$;
revoke all on function api.svc_meta_webhook_segredos() from public, anon, authenticated;
grant execute on function api.svc_meta_webhook_segredos() to service_role;

-- 2. Telefone brasileiro em chave comparável: DDD + 8 últimos dígitos (resolve o "9" extra e o +55)
create or replace function atendimento.chave_telefone(p text) returns text
language sql immutable set search_path to '' as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as n)
  select case
    when n = '' then null
    when n ~ '^55\d{10,11}$' then substr(n, 3, 2) || right(n, 8)
    when n ~ '^\d{10,11}$' then left(n, 2) || right(n, 8)
    else n end
  from d
$$;
-- sem índice de expressão em crm.cad_cliente (evita depender do schema atendimento em inserts de outros papéis);
-- a busca por telefone só roda quando chega um número ainda não vinculado.

-- 3. Ingestão: um item do webhook por evento bruto (idempotente por id da Meta)
create or replace function api.svc_ingerir_whatsapp(p_payload jsonb, p_assinatura_valida boolean, p_cabecalhos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v jsonb := p_payload -> 'value'; v_field text := p_payload ->> 'field'; it jsonb; v_id bigint; v_res jsonb := '[]'::jsonb;
  v_ext text; v_tipo text; v_contato jsonb;
begin
  for it, v_tipo in
    select x, 'mensagem' from jsonb_array_elements(case when v_field = 'messages' then coalesce(v -> 'messages', '[]'::jsonb) else '[]'::jsonb end) x
    union all select x, 'status' from jsonb_array_elements(case when v_field = 'messages' then coalesce(v -> 'statuses', '[]'::jsonb) else '[]'::jsonb end) x
    union all select x, 'eco' from jsonb_array_elements(case when v_field = 'smb_message_echoes' then coalesce(v -> 'message_echoes', '[]'::jsonb) else '[]'::jsonb end) x
  loop
    v_ext := case v_tipo when 'status' then 'st:' || (it ->> 'id') || ':' || (it ->> 'status') else it ->> 'id' end;
    v_contato := null;
    select c into v_contato from jsonb_array_elements(coalesce(v -> 'contacts', '[]'::jsonb)) c where c ->> 'wa_id' = it ->> 'from' limit 1;
    insert into engine.log_evento_bruto (fonte, origem, tipo, id_externo, payload, cabecalhos, assinatura_valida, recebido_em)
    values ('whatsapp', coalesce(engine.origem_padrao(), 'piloto'), v_tipo, coalesce(v_ext, md5(it::text)),
            jsonb_build_object('phone_number_id', v -> 'metadata' ->> 'phone_number_id', 'item', it, 'contato', v_contato),
            coalesce(p_cabecalhos, '{}'::jsonb), coalesce(p_assinatura_valida, false), now())
    on conflict (fonte, id_externo) do nothing
    returning id into v_id;
    if v_id is null then v_res := v_res || jsonb_build_array('duplicado'); continue; end if;
    if not coalesce(p_assinatura_valida, false) then
      update engine.log_evento_bruto set processado_em = now(), resultado = 'assinatura_invalida' where id = v_id;
      v_res := v_res || jsonb_build_array('assinatura_invalida'); continue;
    end if;
    v_res := v_res || jsonb_build_array(atendimento.processar_whatsapp(v_id));
  end loop;
  return jsonb_build_object('resultados', v_res);
end $$;
revoke all on function api.svc_ingerir_whatsapp(jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function api.svc_ingerir_whatsapp(jsonb, boolean, jsonb) to service_role;

create or replace function atendimento.processar_whatsapp(p_evento bigint) returns text
language plpgsql security definer set search_path to '' as $$
declare e engine.log_evento_bruto; it jsonb; v_emp uuid; v_wa text; v_cli uuid; v_conv atendimento.mov_conversa;
  v_ts timestamptz; v_tipo text; v_texto text; v_previa text; v_eco boolean; v_nome text; v_estado text; v_rank int;
begin
  select * into e from engine.log_evento_bruto where id = p_evento for update;
  it := e.payload -> 'item';
  select empresa_id into v_emp from engine.cfg_integracao
   where integracao = 'whatsapp' and parametros ->> 'phone_number_id' = e.payload ->> 'phone_number_id' limit 1;
  if v_emp is null then
    update engine.log_evento_bruto set processado_em = now(), resultado = 'numero_desconhecido' where id = p_evento;
    return 'numero_desconhecido';
  end if;
  update engine.log_evento_bruto set empresa_id = v_emp where id = p_evento and empresa_id is null;
  v_ts := coalesce(to_timestamp((it ->> 'timestamp')::bigint), e.recebido_em);

  -- status de entrega de mensagem que saiu pela API
  if e.tipo = 'status' then
    v_estado := case it ->> 'status' when 'sent' then 'enviada' when 'delivered' then 'entregue' when 'read' then 'lida' when 'failed' then 'erro' end;
    v_rank := case v_estado when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 when 'erro' then 9 else 0 end;
    update atendimento.mov_mensagem m set estado_entrega = v_estado,
           erro = case when v_estado = 'erro' then jsonb_build_object('status', it -> 'errors' -> 0 ->> 'code',
                         'detalhe', coalesce(it -> 'errors' -> 0 ->> 'title', it -> 'errors' -> 0 ->> 'message')) else m.erro end
     where m.empresa_id = v_emp and m.canal = 'whatsapp' and m.id_externo = it ->> 'id' and v_estado is not null
       and (v_estado = 'erro' or v_rank > case m.estado_entrega when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 when 'erro' then 9 else 0 end);
    update engine.log_evento_bruto set processado_em = now(), resultado = 'status_' || coalesce(it ->> 'status', '?') where id = p_evento;
    return 'status';
  end if;

  v_eco := e.tipo = 'eco';
  v_wa := case when v_eco then it ->> 'to' else it ->> 'from' end;
  if v_eco and exists (select 1 from atendimento.mov_mensagem where empresa_id = v_emp and canal = 'whatsapp' and id_externo = it ->> 'id') then
    update engine.log_evento_bruto set processado_em = now(), resultado = 'eco_conhecido' where id = p_evento;
    return 'eco_conhecido';
  end if;

  -- cliente: pelo canal já vinculado; senão pelo telefone do cadastro; senão cria
  select cliente_id into v_cli from crm.rel_cliente_canal where empresa_id = v_emp and canal = 'whatsapp' and identificador = v_wa;
  if v_cli is null then
    select id into v_cli from crm.cad_cliente
     where empresa_id = v_emp and telefone is not null and atendimento.chave_telefone(telefone) = atendimento.chave_telefone(v_wa)
       and anonimizado_em is null
     order by criado_em limit 1;
    v_nome := nullif(btrim(e.payload -> 'contato' -> 'profile' ->> 'name'), '');
    if v_cli is null then
      insert into crm.cad_cliente (empresa_id, nome, telefone) values (v_emp, v_nome, '+' || v_wa) returning id into v_cli;
    end if;
    insert into crm.rel_cliente_canal (empresa_id, cliente_id, canal, identificador)
    values (v_emp, v_cli, 'whatsapp', v_wa) on conflict (empresa_id, canal, identificador) do nothing;
  end if;

  select * into v_conv from atendimento.mov_conversa
   where empresa_id = v_emp and cliente_id = v_cli and canal = 'whatsapp' and estado <> 'resolvida' for update;
  if not found then
    insert into atendimento.mov_conversa (empresa_id, cliente_id, canal, estado) values (v_emp, v_cli, 'whatsapp', 'aberta') returning * into v_conv;
  end if;

  v_tipo := case it ->> 'type'
    when 'text' then 'texto' when 'image' then 'imagem' when 'audio' then 'audio' when 'voice' then 'audio' when 'video' then 'video'
    when 'document' then 'arquivo' when 'sticker' then 'figurinha' when 'reaction' then 'reacao'
    when 'button' then 'texto' when 'interactive' then 'texto' else 'outro' end;
  v_texto := coalesce(it -> 'text' ->> 'body', it -> (it ->> 'type') ->> 'caption', it -> 'button' ->> 'text',
                      it -> 'interactive' -> 'button_reply' ->> 'title', it -> 'interactive' -> 'list_reply' ->> 'title',
                      it -> 'reaction' ->> 'emoji');
  v_previa := coalesce(left(v_texto, 140), '[' || v_tipo || ']');

  insert into atendimento.mov_mensagem (empresa_id, conversa_id, canal, direcao, autor_tipo, tipo, conteudo, midia,
                                        id_externo, estado_entrega, evento_id, criado_em)
  values (v_emp, v_conv.id, 'whatsapp', case when v_eco then 'saida' else 'entrada' end,
          case when v_eco then 'app_nativo' else 'cliente' end, v_tipo, v_texto,
          case when it ? (it ->> 'type') and jsonb_typeof(it -> (it ->> 'type')) = 'object' and v_tipo in ('imagem','audio','video','arquivo','figurinha')
               then jsonb_build_array(jsonb_build_object('type', it ->> 'type', 'media_id', it -> (it ->> 'type') ->> 'id',
                                                         'mime_type', it -> (it ->> 'type') ->> 'mime_type', 'filename', it -> (it ->> 'type') ->> 'filename'))
               else '[]'::jsonb end,
          it ->> 'id', case when v_eco then 'enviada' else 'recebida' end, e.id, v_ts)
  on conflict (empresa_id, canal, id_externo) do nothing;

  if v_eco then
    update atendimento.mov_conversa set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, v_ts), v_ts),
           ultima_previa = v_previa, primeira_resposta_em = coalesce(primeira_resposta_em, v_ts), atualizado_em = now()
     where id = v_conv.id;
  else
    update atendimento.mov_conversa set
           estado = case when estado in ('pendente','adiada') then 'aberta' else estado end,
           adiada_ate = case when estado = 'adiada' then null else adiada_ate end,
           ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, v_ts), v_ts),
           ultima_entrada_em = greatest(coalesce(ultima_entrada_em, v_ts), v_ts),
           janela_ate = greatest(coalesce(janela_ate, v_ts), v_ts + interval '24 hours'),
           ultima_previa = v_previa, nao_lidas = nao_lidas + 1, atualizado_em = now()
     where id = v_conv.id;
  end if;

  update engine.log_evento_bruto set processado_em = now(), resultado = case when v_eco then 'eco_app' else 'mensagem' end where id = p_evento;
  return case when v_eco then 'eco_app' else 'mensagem' end;
end $$;
revoke all on function atendimento.processar_whatsapp(bigint) from public, anon, authenticated;

-- 4. Worker de envio do WhatsApp
create or replace function engine.job_atendimento_whatsapp()
returns void language plpgsql security definer set search_path to '' as $$
declare o record; v_emp uuid; v_tok text; v_pnid text; v_ver text; v_req bigint; v_wamid text; v_st text;
begin
  -- a) reconciliar respostas da API
  for o in select ob.*, hr.status_code, hr.content, hr.error_msg
             from engine.mov_outbox ob join net._http_response hr on hr.id = ob.id_externo::bigint
            where ob.integracao = 'whatsapp' and ob.tipo = 'enviar_mensagem_atendimento'
              and ob.estado = 'em_andamento' and ob.id_externo ~ '^\d+$' loop
    if coalesce(o.status_code, 0) between 200 and 299 then
      v_wamid := (case when o.content ~ '^\s*\{' then o.content::jsonb end) -> 'messages' -> 0 ->> 'id';
      update engine.mov_outbox set estado = 'ok', concluido_em = now(), ultimo_erro = null where id = o.id;
      -- se o status (entregue/lida) chegou antes da resposta, aplica o mais avançado já recebido
      select case max(case split_part(id_externo, ':', 3) when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 9 end)
                  when 1 then 'enviada' when 2 then 'entregue' when 3 then 'lida' when 9 then 'erro' end
        into v_st from engine.log_evento_bruto where fonte = 'whatsapp' and v_wamid is not null and id_externo like 'st:' || v_wamid || ':%';
      update atendimento.mov_mensagem set estado_entrega = coalesce(v_st, 'enviada'), id_externo = coalesce(v_wamid, id_externo), erro = null
       where id = o.entidade_id::bigint;
    else
      update engine.mov_outbox set
             estado = case when tentativas >= max_tentativas or coalesce(o.status_code,0) between 400 and 499 then 'erro_negocio' else 'pendente' end,
             ultimo_erro = jsonb_build_object('status', o.status_code, 'erro', left(coalesce(o.error_msg, left(o.content, 300), 'erro'), 300)),
             id_externo = null, proxima_tentativa_em = now() + interval '1 minute'
       where id = o.id;
      update atendimento.mov_mensagem set
             estado_entrega = case when o.tentativas >= o.max_tentativas or coalesce(o.status_code,0) between 400 and 499 then 'erro' else 'pendente' end,
             erro = jsonb_build_object('status', o.status_code,
                      'detalhe', left(coalesce((case when o.content ~ '^\s*\{' then o.content::jsonb end) -> 'error' ->> 'message', o.error_msg, o.content, ''), 300))
       where id = o.entidade_id::bigint;
    end if;
  end loop;

  update engine.mov_outbox ob set estado = 'pendente', id_externo = null, ultimo_erro = jsonb_build_object('erro', 'sem_resposta'),
         proxima_tentativa_em = now() + interval '1 minute'
   where ob.integracao = 'whatsapp' and ob.tipo = 'enviar_mensagem_atendimento' and ob.estado = 'em_andamento'
     and ob.id_externo ~ '^\d+$' and ob.proxima_tentativa_em < now() - interval '5 minutes'
     and not exists (select 1 from net._http_response h where h.id = ob.id_externo::bigint);

  -- b) disparar pendentes
  for v_emp in select distinct empresa_id from engine.mov_outbox
                where integracao = 'whatsapp' and tipo = 'enviar_mensagem_atendimento' and estado = 'pendente' loop
    v_tok := null; v_pnid := null;
    select btrim(ds.decrypted_secret) into v_tok from private.cad_credencial c join vault.decrypted_secrets ds on ds.id = c.segredo_id
     where c.empresa_id = v_emp and c.nome = 'whatsapp.access_token' limit 1;
    select nullif(parametros ->> 'phone_number_id', ''), coalesce(nullif(parametros ->> 'api_version', ''), nullif(parametros ->> 'graph_version', ''), 'v27.0')
      into v_pnid, v_ver from engine.cfg_integracao where empresa_id = v_emp and integracao = 'whatsapp';
    if v_tok is null or v_pnid is null then continue; end if;
    for o in select * from engine.mov_outbox
              where empresa_id = v_emp and integracao = 'whatsapp' and tipo = 'enviar_mensagem_atendimento' and estado = 'pendente'
                and proxima_tentativa_em <= now() and tentativas < max_tentativas
              order by prioridade, id limit 20 for update skip locked loop
      select net.http_post(url := 'https://graph.facebook.com/' || v_ver || '/' || v_pnid || '/messages',
               body := jsonb_build_object('messaging_product', 'whatsapp', 'recipient_type', 'individual', 'to', o.payload ->> 'destinatario',
                                          'type', 'text', 'text', jsonb_build_object('preview_url', true, 'body', o.payload ->> 'texto')),
               headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok),
               timeout_milliseconds := 15000) into v_req;
      update engine.mov_outbox set estado = 'em_andamento', id_externo = v_req::text, tentativas = tentativas + 1, proxima_tentativa_em = now()
       where id = o.id;
    end loop;
  end loop;
end $$;
revoke all on function engine.job_atendimento_whatsapp() from public, anon, authenticated;
select cron.schedule('atendimento-whatsapp', '10 seconds', 'select engine.job_atendimento_whatsapp()');
