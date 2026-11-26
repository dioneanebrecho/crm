-- 0090a: Contatos do parceiro (vários @/WhatsApp/e-mail por CPF), log e carga inicial. Pedido de mudança 046.
alter table crm.cad_parceiro drop constraint cad_parceiro_origem_check;
alter table crm.cad_parceiro add constraint cad_parceiro_origem_check
  check (origem in ('importacao_bling','manual','instagram','whatsapp','vitrine','pagamento','compra_nfe','outro'));

create table crm.cad_parceiro_contato (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  parceiro_id uuid not null references crm.cad_parceiro(id) on delete cascade,
  tipo text not null check (tipo in ('instagram','whatsapp','email','telefone')),
  valor text,
  igsid text,
  nome_exibicao text,
  vinculo text not null default 'nao_informado' check (vinculo in ('titular','familiar','terceiro','nao_informado')),
  situacao text not null default 'confirmado' check (situacao in ('confirmado','pendente','inativo')),
  principal boolean not null default false,
  origem text not null check (origem in ('bling','meta_dm','meta_live','whatsapp','vitrine','pagamento','perfil_cliente','manual','migracao')),
  criado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  ultimo_uso_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint cad_parceiro_contato_tem_chave check (valor is not null or igsid is not null),
  constraint cad_parceiro_contato_igsid_instagram check (igsid is null or tipo = 'instagram')
);
comment on table crm.cad_parceiro_contato is 'Contatos do parceiro (detalhe): vários @ do Instagram, WhatsApp e e-mail ligados a um CPF/CNPJ. Um contato ativo pertence a um parceiro por vez.';
create unique index cad_parceiro_contato_valor_uq on crm.cad_parceiro_contato (empresa_id, tipo, valor) where valor is not null and situacao <> 'inativo';
create unique index cad_parceiro_contato_igsid_uq on crm.cad_parceiro_contato (empresa_id, igsid) where igsid is not null and situacao <> 'inativo';
create index cad_parceiro_contato_parceiro_idx on crm.cad_parceiro_contato (parceiro_id);
alter table crm.cad_parceiro_contato enable row level security;
revoke all on crm.cad_parceiro_contato from anon, authenticated;

create table crm.log_parceiro_contato (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references crm.cad_empresa(id),
  contato_id uuid,
  parceiro_antes uuid,
  parceiro_depois uuid,
  acao text not null,
  motivo text,
  detalhe jsonb,
  feito_por uuid default auth.uid(),
  feito_em timestamptz not null default now()
);
create index log_parceiro_contato_parceiro_idx on crm.log_parceiro_contato (parceiro_depois);
create index log_parceiro_contato_antes_idx on crm.log_parceiro_contato (parceiro_antes);
alter table crm.log_parceiro_contato enable row level security;
revoke all on crm.log_parceiro_contato from anon, authenticated;

-- normalização
create or replace function crm.norm_instagram(p text) returns text
language sql immutable set search_path = '' as $$
  select case when x ~ '^[a-z0-9._]{1,30}$' then x end
    from (select lower(regexp_replace(trim(coalesce(p, '')), '^@+', '')) x) s
$$;
create or replace function crm.norm_telefone(p text) returns text
language sql immutable set search_path = '' as $$
  select case when y ~ '^55[1-9][0-9][0-9]{8,9}$' then y end
    from (select case when length(x) in (10, 11) then '55' || x else x end y
            from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') x) s) t
$$;

-- carga 1: @ já identificados (um por parceiro)
insert into crm.cad_parceiro_contato (empresa_id, parceiro_id, tipo, valor, vinculo, situacao, principal, origem, confirmado_em)
select i.empresa_id, i.parceiro_id, 'instagram', i.valor_hash, 'nao_informado', 'confirmado', true,
       case when p.origem = 'importacao_bling' then 'bling' else 'migracao' end, now()
  from crm.cad_parceiro_identificador i join crm.cad_parceiro p on p.id = i.parceiro_id
 where i.tipo = 'instagram' and crm.norm_instagram(i.valor_hash) is not null;

-- carga 2: os demais @ escritos no nome dos contatos Bling do mesmo parceiro (ex.: "NOME @a / @b @c")
with a as (
  select distinct r.empresa_id, r.parceiro_id, crm.norm_instagram(m[1]) arroba
    from bling.rel_contato_parceiro r
    join bling.cad_contato c on c.bling_id = r.bling_id and c.empresa_id = r.empresa_id
    cross join lateral regexp_matches(c.nome_cru, '@([A-Za-z0-9._]{1,30})', 'g') m
   where r.status = 'vinculado' and r.parceiro_id is not null
), livre as (
  select a.* from a
   where a.arroba is not null and a.arroba !~ '\.$'
     and not exists (select 1 from crm.cad_parceiro_contato k where k.empresa_id = a.empresa_id and k.tipo = 'instagram' and k.valor = a.arroba)
     and (select count(distinct a2.parceiro_id) from a a2 where a2.empresa_id = a.empresa_id and a2.arroba = a.arroba) = 1
)
insert into crm.cad_parceiro_contato (empresa_id, parceiro_id, tipo, valor, vinculo, situacao, principal, origem, confirmado_em)
select empresa_id, parceiro_id, 'instagram', arroba, 'nao_informado', 'confirmado', false, 'bling', now() from livre;

-- o @ extra também vira identificador, para a reconciliação noturna do Bling reconhecer o mesmo parceiro
insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash)
select k.empresa_id, k.parceiro_id, 'instagram', k.valor from crm.cad_parceiro_contato k
 where k.tipo = 'instagram' and k.valor is not null
on conflict (empresa_id, tipo, valor_hash) do nothing;

insert into crm.log_parceiro_contato (empresa_id, contato_id, parceiro_depois, acao, motivo)
select empresa_id, id, parceiro_id, 'carga', 'migração 0090a' from crm.cad_parceiro_contato;

-- pagador (quem paga e é faturado) separado de quem demonstrou interesse
alter table live.mov_reserva
  add column parceiro_pagador_id uuid references crm.cad_parceiro(id),
  add column pagador_situacao text check (pagador_situacao in ('titular','terceiro','terceiro_confirmar')),
  add column pagador_definido_em timestamptz;
alter table venda.mov_cobranca add column parceiro_pagador_id uuid references crm.cad_parceiro(id);
alter table venda.mov_pedido add column parceiro_pagador_id uuid references crm.cad_parceiro(id);
create index on live.mov_reserva (parceiro_pagador_id);
create index on venda.mov_cobranca (parceiro_pagador_id);
create index on venda.mov_pedido (parceiro_pagador_id);
