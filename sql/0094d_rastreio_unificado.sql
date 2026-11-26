-- 0094d (pedido 049): rastreio unificado.
-- `venda.mov_envio` e `venda.mov_evento_rastreio` existiam desde a era Bling e ninguém escrevia nelas,
-- mas `atendimento.variaveis_contexto` lê {{envio.transportadora}}, {{envio.codigo_rastreio}},
-- {{envio.link_rastreio}} e {{envio.situacao}} de lá. A resposta pronta /rastreio nunca preenchia.
-- Aqui a expedição passa a alimentar mov_envio (uma linha por pedido do envio) e os eventos de rastreio.

-- um envio consolidado leva vários pedidos com o MESMO código: a unicidade velha (transportadora, código) não serve
alter table venda.mov_envio drop constraint mov_envio_transportadora_codigo_rastreio_key;
alter table venda.mov_envio add column expedicao_id uuid references venda.mov_expedicao(id);
create unique index mov_envio_pedido_uk on venda.mov_envio (pedido_id);
create index mov_envio_rastreio_ix on venda.mov_envio (empresa_id, codigo_rastreio);
create index mov_envio_expedicao_ix on venda.mov_envio (expedicao_id);

alter table venda.cfg_expedicao add column url_rastreio_modelo text;
comment on column venda.cfg_expedicao.url_rastreio_modelo is
  'Modelo de link de rastreio para transportadora fora da lista conhecida. Use {codigo} onde entra o código.';

-- link de rastreio por transportadora; sem transportadora conhecida e sem modelo configurado, devolve null
-- (melhor a variável ficar vazia do que mandar a cliente para o site errado)
create or replace function venda._url_rastreio(p_empresa uuid, p_transportadora text, p_codigo text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when nullif(btrim(coalesce(p_codigo, '')), '') is null then null
    when lower(coalesce(p_transportadora, '')) like '%correios%'
      or (coalesce(p_transportadora, '') = '' and btrim(upper(p_codigo)) ~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$')
      then 'https://rastreamento.correios.com.br/app/index.php?objeto=' || btrim(upper(p_codigo))
    when lower(coalesce(p_transportadora, '')) like '%jadlog%'
      then 'https://www.jadlog.com.br/tracking?cte=' || btrim(p_codigo)
    when lower(coalesce(p_transportadora, '')) like '%loggi%'
      then 'https://www.loggi.com/rastreador/' || btrim(p_codigo)
    else (select replace(c.url_rastreio_modelo, '{codigo}', btrim(p_codigo))
            from venda.cfg_expedicao c where c.empresa_id = p_empresa and c.url_rastreio_modelo is not null)
  end
$$;
revoke all on function venda._url_rastreio(uuid, text, text) from public, anon, authenticated;

-- expedir: continua exigindo o frete pago ou grátis (pedido 048) e agora grava o rastreio onde o atendimento lê
create or replace function api.expedicao_enviar(p_empresa uuid, p_expedicao uuid, p_rastreio text, p_transportadora text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; v_cod text; v_transp text; v_url text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','expedicao']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado <> 'pronta' then
    raise exception 'o envio só sai depois do frete pago ou marcado como grátis (situação: %)', x.estado using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_rastreio, ''))) < 5 then raise exception 'informe o código de rastreio' using errcode = '22023'; end if;
  v_cod := upper(btrim(p_rastreio));
  v_transp := nullif(btrim(coalesce(p_transportadora, x.transportadora, '')), '');
  v_url := venda._url_rastreio(p_empresa, v_transp, v_cod);

  update venda.mov_expedicao set estado = 'enviada', codigo_rastreio = v_cod, transportadora = v_transp,
         enviada_em = now(), atualizado_em = now() where id = x.id;

  insert into venda.mov_envio (empresa_id, expedicao_id, pedido_id, transportadora, servico, codigo_rastreio, url_rastreio, estado, postado_em)
  select p_empresa, x.id, rp.pedido_id, v_transp, x.servico, v_cod, v_url, 'postado', now()
    from venda.rel_expedicao_pedido rp where rp.expedicao_id = x.id
  on conflict (pedido_id) do update
    set expedicao_id = excluded.expedicao_id, transportadora = excluded.transportadora, servico = excluded.servico,
        codigo_rastreio = excluded.codigo_rastreio, url_rastreio = excluded.url_rastreio,
        estado = 'postado', postado_em = now();

  insert into venda.mov_evento_rastreio (envio_id, estado, descricao, ocorrido_em, fonte)
  select e.id, 'postado', 'Postado pela expedição', now(), 'painel'
    from venda.mov_envio e where e.expedicao_id = x.id
  on conflict do nothing;

  update venda.mov_pedido set estado = 'expedido', atualizado_em = now()
   where id in (select pedido_id from venda.rel_expedicao_pedido where expedicao_id = x.id) and estado not in ('cancelado','entregue');
end $$;

-- marcar a entrega à mão enquanto o webhook da transportadora não existe (fase 5 do pedido 049)
create or replace function api.expedicao_entregue(p_empresa uuid, p_expedicao uuid, p_em timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; v_em timestamptz;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado <> 'enviada' then raise exception 'só um envio já despachado pode ser marcado como entregue (situação: %)', x.estado using errcode = '22023'; end if;
  v_em := coalesce(p_em, now());
  if v_em > now() + interval '1 hour' then raise exception 'data de entrega no futuro' using errcode = '22023'; end if;
  if v_em < x.enviada_em then raise exception 'a entrega não pode ser anterior à postagem' using errcode = '22023'; end if;

  update venda.mov_expedicao set estado = 'entregue', entregue_em = v_em, atualizado_em = now() where id = x.id;
  update venda.mov_envio set estado = 'entregue', entregue_em = v_em where expedicao_id = x.id;
  insert into venda.mov_evento_rastreio (envio_id, estado, descricao, ocorrido_em, fonte)
  select e.id, 'entregue', 'Entrega confirmada no painel', v_em, 'painel'
    from venda.mov_envio e where e.expedicao_id = x.id
  on conflict do nothing;
  update venda.mov_pedido set estado = 'entregue', atualizado_em = now()
   where id in (select pedido_id from venda.rel_expedicao_pedido where expedicao_id = x.id) and estado <> 'cancelado';
end $$;

-- eventos de rastreio de um envio, para a tela
create or replace function api.expedicao_rastreio(p_empresa uuid, p_expedicao uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x venda.mov_expedicao;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao','financeiro','leitura']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'codigo_rastreio', x.codigo_rastreio, 'transportadora', x.transportadora,
    'url_rastreio', (select url_rastreio from venda.mov_envio where expedicao_id = x.id limit 1),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('estado', ev.estado, 'descricao', ev.descricao,
                            'ocorrido_em', ev.ocorrido_em, 'fonte', ev.fonte) order by ev.ocorrido_em desc)
                   from venda.mov_evento_rastreio ev
                  where ev.envio_id in (select id from venda.mov_envio where expedicao_id = x.id)), '[]'::jsonb));
end $$;

revoke all on function api.expedicao_entregue(uuid, uuid, timestamptz), api.expedicao_rastreio(uuid, uuid) from public, anon;
grant execute on function api.expedicao_entregue(uuid, uuid, timestamptz), api.expedicao_rastreio(uuid, uuid) to authenticated;
