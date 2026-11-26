-- 0093_atendimento_origem_e_franquia.sql (aplicada em 26/11/2026)
-- Caixa de entrada: de onde a conversa veio (live, vitrine, link "Quero A123", direto) e franquia do WhatsApp no mês.

create or replace function atendimento.origem_entrada(p_conversa uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare cv atendimento.mov_conversa; v_txt text; i record;
begin
  select * into cv from atendimento.mov_conversa where id = p_conversa;
  if not found then return null; end if;
  -- interesse registrado pelo motor (comentário da live ou clique na vitrine) perto do início da conversa
  select mi.canal, coalesce(it.codigo_live, mi.codigo_extraido) as codigo into i
    from live.mov_interesse mi left join live.mov_item it on it.id = mi.item_id
   where mi.cliente_id = cv.cliente_id
     and mi.recebido_em between cv.criado_em - interval '48 hours' and cv.criado_em + interval '10 minutes'
   order by mi.recebido_em desc limit 1;
  if found then
    return jsonb_build_object('tipo', case when i.canal = 'live' then 'live' else 'vitrine' end, 'canal', i.canal, 'peca', i.codigo);
  end if;
  -- mensagem pronta do link "Quero A123" (grupo do WhatsApp, story, bio)
  select conteudo into v_txt from atendimento.mov_mensagem where conversa_id = p_conversa and direcao = 'entrada' order by id limit 1;
  if v_txt ~* '^\s*quero\M' then
    return jsonb_build_object('tipo', 'link_quero', 'canal', cv.canal,
      'peca', upper(substring(v_txt from '(?i)quero\s+(?:a\s+|o\s+)?(?:pe[çc]a\s+)?#?([a-z]{0,3}\d{1,5})')));
  end if;
  return jsonb_build_object('tipo', 'direto', 'canal', cv.canal);
end $$;
revoke all on function atendimento.origem_entrada(uuid) from public, anon, authenticated;

-- inclui a origem na lista e no detalhe (sem reescrever as funções: acrescenta a chave ao lado de etapa_venda)
do $$ declare d text; begin
  d := pg_get_functiondef('api.atendimento_conversas(uuid,text,text,text,text,int)'::regprocedure);
  if position('origem_entrada' in d) = 0 then
    execute replace(d, '''etapa_venda'', atendimento.etapa_venda(c.cliente_id),',
                       '''etapa_venda'', atendimento.etapa_venda(c.cliente_id), ''origem_entrada'', atendimento.origem_entrada(c.id),');
  end if;
  d := pg_get_functiondef('api.atendimento_conversa(uuid,uuid,boolean)'::regprocedure);
  if position('origem_entrada' in d) = 0 then
    execute replace(d, '''etapa_venda'', atendimento.etapa_venda(cl.id),',
                       '''etapa_venda'', atendimento.etapa_venda(cl.id), ''origem_entrada'', atendimento.origem_entrada(c.id),');
  end if;
end $$;

-- volume por canal e franquia do WhatsApp (1.000 respostas grátis por número/mês; app Business não conta)
create or replace function api.atendimento_canais(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform api._exigir(p_empresa, atendimento.papeis_leitura());
  return jsonb_build_object(
    'mes_inicio', v_mes,
    'franquia_whatsapp', 1000,
    'whatsapp_enviadas_mes', (select count(*) from atendimento.mov_mensagem
        where empresa_id = p_empresa and canal = 'whatsapp' and direcao = 'saida' and autor_tipo in ('atendente','automacao','sistema')
          and estado_entrega in ('enviada','entregue','lida') and criado_em >= v_mes),
    'por_canal', coalesce((select jsonb_object_agg(canal, jsonb_build_object('abertas', abertas, 'entradas_30d', entradas))
        from (select c.canal,
                     count(distinct c.id) filter (where c.estado <> 'resolvida') as abertas,
                     (select count(*) from atendimento.mov_mensagem m where m.empresa_id = p_empresa and m.canal = c.canal
                        and m.direcao = 'entrada' and m.criado_em > now() - interval '30 days') as entradas
                from atendimento.mov_conversa c where c.empresa_id = p_empresa group by c.canal) s), '{}'::jsonb));
end $$;
revoke all on function api.atendimento_canais(uuid) from public, anon;
grant execute on function api.atendimento_canais(uuid) to authenticated;
