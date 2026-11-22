-- 0022: fotos da peça, campanhas (links de postagem) e histórico de compras por campanha.
-- PROPOSTA: ainda não aplicada. Ver pedido-mudanca-013-fotos-campanhas-etiquetas.md.
-- Nada aqui escreve em sistema externo (D12). O painel continua falando só com o schema api.

-- ---------------------------------------------------------------- 1. Fotos: depósito no Storage e gravação da lista na peça
-- Depósito público para leitura (as fotos vão para a página pública da peça e para o Bling). O caminho do arquivo começa
-- pela empresa: <empresa_id>/<peca_id>/<arquivo>.jpg. Gravar e apagar exige papel admin ou gestor NA empresa do caminho.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pecas-fotos', 'pecas-fotos', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy pecas_fotos_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'pecas-fotos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (select api.tem_papel(((storage.foldername(name))[1])::uuid, array['admin','gestor'])));
create policy pecas_fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'pecas-fotos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (select api.tem_papel(((storage.foldername(name))[1])::uuid, array['admin','gestor'])));

create function api.definir_fotos_peca(p_empresa uuid, p_peca uuid, p_fotos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare f jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if p_fotos is null or jsonb_typeof(p_fotos) <> 'array' then raise exception 'lista de fotos inválida' using errcode = '22023'; end if;
  if jsonb_array_length(p_fotos) > 12 then raise exception 'no máximo 12 fotos por peça' using errcode = '22023'; end if;
  for f in select * from jsonb_array_elements(p_fotos) loop
    if jsonb_typeof(f) <> 'object' or coalesce(f->>'url', '') !~ '^https://' or length(f->>'url') > 600
       or coalesce(f->>'path', '') !~ ('^' || p_empresa::text || '/' || p_peca::text || '/[0-9a-f-]{36}\.jpg$') then
      raise exception 'foto inválida: o arquivo precisa estar no depósito da própria peça' using errcode = '22023';
    end if;
  end loop;
  update catalogo.cad_peca set fotos = (select coalesce(jsonb_agg(jsonb_build_object('url', x->>'url', 'path', x->>'path')), '[]'::jsonb)
                                          from jsonb_array_elements(p_fotos) x),
                               atualizado_em = now()
   where id = p_peca and empresa_id = p_empresa;
  if not found then raise exception 'peça não encontrada' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------- 2. Campanhas e links de venda de postagem
-- Live já existe (live.mov_live / live.mov_item / reservas / cobrança). O que falta é o link de venda de POSTAGEM:
-- uma campanha do tipo postagem tem N links, cada um para uma variação da peça, com endereço próprio.
create table venda.cad_campanha (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  tipo text not null default 'postagem' check (tipo in ('postagem')),
  titulo text not null check (length(trim(titulo)) > 0),
  url_externa text check (url_externa is null or url_externa ~ '^https://'),
  publicada_em timestamptz,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_em timestamptz not null default now()
);
create table venda.cad_link_venda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  campanha_id uuid not null references venda.cad_campanha(id),
  variacao_id uuid not null references catalogo.cad_variacao(id),
  codigo_curto text not null check (codigo_curto ~ '^[A-Za-z0-9_-]{6,40}$'),
  url text not null check (url ~ '^https://'),
  preco numeric(12,2) check (preco is null or preco >= 0),
  estado text not null default 'ativo' check (estado in ('ativo','encerrado')),
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_em timestamptz not null default now(),
  unique (empresa_id, codigo_curto)
);
create index link_venda_variacao on venda.cad_link_venda (variacao_id);
create index link_venda_campanha on venda.cad_link_venda (campanha_id);

-- A compra pelo link de postagem é registrada no item do pedido (a de live já se liga pela reserva).
alter table venda.mov_pedido_item add column link_venda_id uuid references venda.cad_link_venda(id);
create index pedido_item_link on venda.mov_pedido_item (link_venda_id) where link_venda_id is not null;

create trigger guarda_origem before insert on venda.cad_campanha for each row execute function engine.guarda_origem();
create trigger guarda_origem before insert on venda.cad_link_venda for each row execute function engine.guarda_origem();
create trigger auditoria after insert or update or delete on venda.cad_campanha for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on venda.cad_link_venda for each row execute function audit.registrar();

alter table venda.cad_campanha enable row level security;
alter table venda.cad_link_venda enable row level security;
create policy worker_total on venda.cad_campanha for all to app_worker using (true) with check (true);
create policy worker_total on venda.cad_link_venda for all to app_worker using (true) with check (true);
grant select, insert, update on venda.cad_campanha, venda.cad_link_venda to app_worker;

-- ---------------------------------------------------------------- 3. Histórico de campanhas de uma peça (lives e links de postagem), com as compras
-- Lives: peça incluída num item da live (live.mov_item); compras ligadas pela reserva. Cada compra traz o link de pagamento da cobrança.
-- Postagens: links de venda da peça (venda.cad_link_venda); compras ligadas por mov_pedido_item.link_venda_id.
-- Valor e quantidade totais não contam pedido cancelado, mas a compra cancelada continua listada, com a situação.
-- Só papéis que já veem dados de cliente (admin, gestor, suporte) e financeiro. Telefone e e-mail não saem daqui.
create function api.historico_campanhas_peca(p_empresa uuid, p_peca uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','financeiro']);
  if not exists (select 1 from catalogo.cad_peca where id = p_peca and empresa_id = p_empresa) then
    raise exception 'peça não encontrada' using errcode = 'P0002';
  end if;
  with vars as (
    select va.id, va.tamanho from catalogo.cad_variacao va where va.peca_id = p_peca and va.empresa_id = p_empresa
  ), compras as (
    select pi.link_venda_id, r.item_id as live_item_id, p.estado as pedido_estado,
           jsonb_build_object(
             'cliente_nome', case when c.anonimizado_em is null then c.nome end,
             'cliente_instagram', case when c.anonimizado_em is null then c.instagram_username end,
             'comprado_em', p.criado_em, 'tamanho', vs.tamanho, 'unidade_codigo', u.codigo,
             'valor', pi.valor_unitario * pi.quantidade, 'pedido_numero', p.numero_loja, 'pedido_estado', p.estado,
             'nfe_numero', p.nfe_numero, 'nfe_estado', p.nfe_estado,
             'link_pagamento', (select cb.link_url from venda.rel_cobranca_reserva rc join venda.mov_cobranca cb on cb.id = rc.cobranca_id
                                 where rc.reserva_id = pi.reserva_id limit 1)) as linha,
           p.criado_em as quando, (pi.valor_unitario * pi.quantidade) as valor
      from venda.mov_pedido_item pi
      join venda.mov_pedido p on p.id = pi.pedido_id and p.empresa_id = p_empresa
      join crm.cad_cliente c on c.id = p.cliente_id
      join vars vs on vs.id = pi.variacao_id
      left join catalogo.cad_unidade u on u.id = pi.unidade_id
      left join live.mov_reserva r on r.id = pi.reserva_id
     where pi.empresa_id = p_empresa
  ), lives as (
    select l.id::text as id, 'live'::text as tipo, l.titulo, coalesce(l.iniciada_em, l.criado_em) as data, null::text as url_externa, null::text as link_url,
           coalesce(jsonb_agg(co.linha order by co.quando) filter (where co.linha is not null), '[]'::jsonb) as lista,
           count(co.linha) filter (where co.pedido_estado <> 'cancelado') as qtd, coalesce(sum(co.valor) filter (where co.pedido_estado <> 'cancelado'), 0) as total
      from live.mov_item i
      join live.mov_live l on l.id = i.live_id and l.empresa_id = p_empresa
      left join compras co on co.live_item_id = i.id
     where i.empresa_id = p_empresa and i.variacao_id in (select id from vars)
     group by l.id, l.titulo, l.iniciada_em, l.criado_em
  ), links as (
    select lv.id::text as id, c.tipo, c.titulo, coalesce(c.publicada_em, c.criado_em) as data, c.url_externa, lv.url as link_url,
           coalesce(jsonb_agg(co.linha order by co.quando) filter (where co.linha is not null), '[]'::jsonb) as lista,
           count(co.linha) filter (where co.pedido_estado <> 'cancelado') as qtd, coalesce(sum(co.valor) filter (where co.pedido_estado <> 'cancelado'), 0) as total
      from venda.cad_link_venda lv
      join venda.cad_campanha c on c.id = lv.campanha_id and c.empresa_id = p_empresa
      left join compras co on co.link_venda_id = lv.id
     where lv.empresa_id = p_empresa and lv.variacao_id in (select id from vars)
     group by lv.id, c.tipo, c.titulo, c.publicada_em, c.criado_em, c.url_externa, lv.url
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'titulo', x.titulo, 'data', x.data, 'url_externa', x.url_externa,
                                               'link_url', x.link_url, 'qtd_compras', x.qtd, 'valor_total', x.total, 'compras', x.lista)
                            order by x.data desc nulls last), '[]'::jsonb)
    into v
    from (select * from lives union all select * from links) x;
  return v;
end $$;

-- ---------------------------------------------------------------- 4. Privilégios
revoke all on function api.definir_fotos_peca(uuid, uuid, jsonb), api.historico_campanhas_peca(uuid, uuid) from public, anon, authenticated;
grant execute on function api.definir_fotos_peca(uuid, uuid, jsonb), api.historico_campanhas_peca(uuid, uuid) to authenticated;
