-- 0019: URL base do endpoint nas integrações de IA (como na tela de IA do ZAgent).
-- A URL é opcional (em branco = endereço padrão do provedor) e só aceita hosts da lista abaixo, porque a Edge Function
-- envia a chave de API para esse endereço: um host livre permitiria desviar a chave. Nada escreve em sistema externo (D12).
--   ia_chat:      generativelanguage.googleapis.com (Google AI Studio) ou aiplatform.googleapis.com (Vertex, chave do projeto)
--   ia_embedding: generativelanguage.googleapis.com ou api.voyageai.com
create or replace function engine._chaves_param(p_integracao text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_integracao
    when 'bling'        then array['client_id','empresa_id_bling']
    when 'meta_live'    then array['app_id','instagram_user_id','api_version']
    when 'meta_dm'      then array['app_id','instagram_user_id','api_version']
    when 'facebook'     then array['app_id','page_id','api_version']
    when 'whatsapp'     then array['waba_id','phone_number_id','api_version']
    when 'gateway'      then array['provedor','merchant_id']
    when 'ia_chat'      then array['provedor','modelo','base_url']
    when 'ia_embedding' then array['provedor','modelo','base_url']
    else '{}'::text[] end $$;

create or replace function api.salvar_integracao(p_empresa uuid, p_integracao text, p_parametros jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb; v_txt text; v_ok text[]; v_novo jsonb := '{}'::jsonb; v_bling text; v_ig text;
begin
  perform api._exigir(p_empresa, array['admin']);
  v_ok := engine._chaves_param(p_integracao);
  if cardinality(v_ok) = 0 then raise exception 'integração não configurável: %', p_integracao using errcode = '22023'; end if;
  if p_parametros is null or jsonb_typeof(p_parametros) <> 'object' then
    raise exception 'parâmetros inválidos' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p_parametros) loop
    if not (k = any (v_ok)) then raise exception 'campo não permitido: %', k using errcode = '22023'; end if;
    if jsonb_typeof(v) not in ('string','null') then raise exception 'valor inválido em %', k using errcode = '22023'; end if;
    v_txt := nullif(trim(v #>> '{}'), '');
    if v_txt is not null and length(v_txt) > 200 then raise exception 'valor longo demais em %', k using errcode = '22023'; end if;
    if v_txt is not null and v_txt ~ '[\r\n]' then raise exception 'valor inválido em %', k using errcode = '22023'; end if;
    if k = 'provedor' and v_txt is not null then
      if p_integracao = 'ia_chat' and v_txt <> 'google_gemini' then
        raise exception 'provedor de resposta não suportado: %', v_txt using errcode = '22023'; end if;
      if p_integracao = 'ia_embedding' and v_txt not in ('voyage','google_gemini') then
        raise exception 'provedor de vetor não suportado: %', v_txt using errcode = '22023'; end if;
    end if;
    if k = 'modelo' and v_txt is not null and v_txt !~ '^[A-Za-z0-9._-]{1,80}$' then
      raise exception 'nome de modelo inválido (use letras, números, ponto, hífen e sublinhado)' using errcode = '22023'; end if;
    if k = 'base_url' and v_txt is not null then
      v_txt := regexp_replace(v_txt, '/+$', '');
      if v_txt like '%..%'
         or (p_integracao = 'ia_chat' and v_txt !~ '^https://(generativelanguage|aiplatform)\.googleapis\.com(/[A-Za-z0-9._/-]{1,120})?$')
         or (p_integracao = 'ia_embedding' and v_txt !~ '^https://(generativelanguage\.googleapis\.com|api\.voyageai\.com)(/[A-Za-z0-9._/-]{1,120})?$') then
        raise exception 'URL base não permitida: use https e um endereço do provedor (Google AI Studio, Google Vertex ou Voyage)' using errcode = '22023';
      end if;
    end if;
    if k = 'empresa_id_bling' then v_bling := v_txt;
    elsif k = 'instagram_user_id' then v_ig := v_txt;
    elsif v_txt is not null then v_novo := v_novo || jsonb_build_object(k, v_txt);
    end if;
  end loop;
  if v_bling is not null and v_bling !~ '^[A-Za-z0-9]{1,64}$' then raise exception 'ID da empresa no Bling deve ter só letras e números (até 64)' using errcode = '22023'; end if;
  if v_ig is not null and v_ig !~ '^[0-9]+$' then raise exception 'ID da conta do Instagram deve ser numérico' using errcode = '22023'; end if;
  if p_parametros ? 'empresa_id_bling' then
    update crm.cad_empresa set bling_empresa_id_esperado = v_bling where id = p_empresa; end if;
  if p_parametros ? 'instagram_user_id' then
    update crm.cad_empresa set instagram_user_id_esperado = v_ig where id = p_empresa; end if;
  update engine.cfg_integracao set
     parametros = (parametros - (select coalesce(array_agg(key), '{}'::text[]) from jsonb_each(p_parametros)
                                  where nullif(trim(value #>> '{}'), '') is null)) || v_novo,
     status = 'configurada', ultimo_teste_ok = null, ultimo_teste_em = null, ultimo_teste_resumo = null,
     modo = 'desligado', atualizado_em = now(), atualizado_por = (select auth.uid())
   where empresa_id = p_empresa and integracao = p_integracao;
  if not found then raise exception 'integração não encontrada' using errcode = 'P0002'; end if;
end $$;

revoke all on function api.salvar_integracao(uuid, text, jsonb) from public, anon, service_role;
grant execute on function api.salvar_integracao(uuid, text, jsonb) to authenticated;
