-- SOMENTE PARA TESTE LOCAL. Reproduz o mínimo das migrations 0001, 0003, 0007 e 0008 para testar a 0011.
-- Nunca aplicar no Supabase real.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema engine; create schema catalogo; create schema crm; create schema audit; create schema api;

-- 0001
create table engine.cfg_ambiente (singleton boolean primary key default true check (singleton),
  ambiente text not null check (ambiente in ('teste','producao')), atualizado_em timestamptz not null default now());
insert into engine.cfg_ambiente (ambiente) values ('producao');
create function engine.origem_padrao() returns text language sql stable set search_path = '' as $$
  select case ambiente when 'producao' then 'producao' else 'piloto' end from engine.cfg_ambiente $$;
create function engine.guarda_origem() returns trigger language plpgsql set search_path = '' as $$
begin
  if engine.origem_padrao() is not null and new.origem is distinct from engine.origem_padrao() then
    raise exception 'origem % não permitida neste ambiente (esperado %)', new.origem, engine.origem_padrao();
  end if; return new;
end $$;
create table crm.cad_empresa (id uuid primary key default gen_random_uuid(), razao_social text not null, nome_fantasia text,
  cnpj text unique, bling_empresa_id_esperado text, instagram_user_id_esperado text, ativo boolean not null default true,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')), criado_em timestamptz not null default now());
create table crm.cad_usuario (id uuid primary key references auth.users(id) on delete cascade, nome text not null, email text not null,
  is_superadmin boolean not null default false, ativo boolean not null default true, criado_em timestamptz not null default now());
create table crm.rel_usuario_empresa (usuario_id uuid not null references crm.cad_usuario(id) on delete cascade,
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  papel text not null check (papel in ('admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura')),
  ativo boolean not null default true, criado_em timestamptz not null default now(), primary key (usuario_id, empresa_id, papel));
create function api.empresas_do_usuario() returns setof uuid language sql stable security definer set search_path = '' as $$
  select empresa_id from crm.rel_usuario_empresa where usuario_id = (select auth.uid()) and ativo $$;
create function api.e_superadmin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.cad_usuario where id = (select auth.uid()) and is_superadmin and ativo) $$;
create function api.tem_papel(p_empresa uuid, p_papeis text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select (select api.e_superadmin()) or exists (select 1 from crm.rel_usuario_empresa
     where usuario_id = (select auth.uid()) and empresa_id = p_empresa and ativo and papel = any (p_papeis)) $$;

-- 0003 (catálogo e cliente)
create table catalogo.cad_local (id uuid primary key default gen_random_uuid(), empresa_id uuid not null references crm.cad_empresa(id),
  nome text not null, vendavel boolean not null, bling_deposito_id bigint, ativo boolean not null default true, unique (empresa_id, nome));
create table catalogo.cad_peca (id uuid primary key default gen_random_uuid(), empresa_id uuid not null references crm.cad_empresa(id),
  codigo text not null, nome text not null, descricao text, categoria text, marca text,
  condicao text not null default 'usada' check (condicao in ('nova','usada')),
  custo numeric(12,2) check (custo >= 0), preco_tabela numeric(12,2) check (preco_tabela >= 0),
  fotos jsonb not null default '[]', bling_produto_id bigint,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo), unique (empresa_id, bling_produto_id));
create table catalogo.cad_variacao (id uuid primary key default gen_random_uuid(), empresa_id uuid not null references crm.cad_empresa(id),
  peca_id uuid not null references catalogo.cad_peca(id), tamanho text not null, codigo text not null, bling_variacao_id bigint,
  unique (empresa_id, codigo), unique (peca_id, tamanho));
create table catalogo.cad_unidade (id uuid primary key default gen_random_uuid(), empresa_id uuid not null references crm.cad_empresa(id),
  variacao_id uuid not null references catalogo.cad_variacao(id), codigo text not null, local_id uuid not null references catalogo.cad_local(id),
  estado text not null default 'disponivel' check (estado in ('disponivel','reservada','vendida','devolvida','baixada')),
  observacao text, origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), unique (empresa_id, codigo));
create table crm.cad_cliente (id uuid primary key default gen_random_uuid(), empresa_id uuid not null references crm.cad_empresa(id),
  instagram_igsid text, instagram_username text, nome text, telefone text, email text, bling_contato_id bigint, bloqueado_ate timestamptz,
  observacao_interna text, anonimizado_em timestamptz,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id, instagram_igsid), unique (empresa_id, bling_contato_id));
create trigger guarda_origem before insert on catalogo.cad_peca for each row execute function engine.guarda_origem();
create trigger guarda_origem before insert on catalogo.cad_unidade for each row execute function engine.guarda_origem();
create trigger guarda_origem before insert on crm.cad_cliente for each row execute function engine.guarda_origem();

-- 0007 (auditoria, mesma função da migration real)
create table audit.log_alteracao (id bigint generated always as identity, schema_nome text not null, tabela text not null,
  registro_pk text not null, operacao char(1) not null check (operacao in ('I','U','D')), empresa_id uuid, usuario_id uuid,
  origem_ator text not null default 'painel' check (origem_ator in ('painel','worker','sistema')),
  campos_alterados text[], dados_antes jsonb, dados_depois jsonb, ip inet, em timestamptz not null default now(),
  primary key (id, em)) partition by range (em);
create table audit.log_alteracao_default partition of audit.log_alteracao default;
create function audit.registrar() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_txt text := coalesce(((select auth.uid())::text), nullif(current_setting('app.ator', true), ''));
  v_ator uuid := case when v_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_txt::uuid end;
  v_antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_pk text; v_emp uuid; k text; i int;
begin
  select string_agg(coalesce(v_depois ->> a.attname, v_antes ->> a.attname), '|' order by array_position(i.indkey::int2[], a.attnum))
    into v_pk from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = tg_relid and i.indisprimary;
  v_emp := coalesce(v_depois ->> 'empresa_id', v_antes ->> 'empresa_id',
                    case when tg_table_name = 'cad_empresa' then coalesce(v_depois ->> 'id', v_antes ->> 'id') end)::uuid;
  for i in 0 .. tg_nargs - 1 loop
    k := tg_argv[i];
    if v_antes  ? k then v_antes  := jsonb_set(v_antes,  array[k], '"***"'); end if;
    if v_depois ? k then v_depois := jsonb_set(v_depois, array[k], '"***"'); end if;
  end loop;
  insert into audit.log_alteracao (schema_nome, tabela, registro_pk, operacao, empresa_id, usuario_id, origem_ator, campos_alterados, dados_antes, dados_depois)
  values (tg_table_schema, tg_table_name, coalesce(v_pk, '?'), left(tg_op, 1), v_emp, v_ator,
          coalesce(nullif(current_setting('app.origem_ator', true), ''), 'painel'),
          case when tg_op = 'UPDATE' then (select array_agg(key) from jsonb_each(v_depois) where v_depois -> key is distinct from v_antes -> key) end,
          v_antes, v_depois);
  return coalesce(new, old);
end $$;
create trigger auditoria after insert or update or delete on crm.cad_cliente for each row execute function audit.registrar();

-- 0008 (privilégios): nada aberto por padrão; só o api e as 3 funções de papel
alter default privileges revoke execute on functions from public;
revoke all on function api.tem_papel(uuid, text[]), api.empresas_do_usuario(), api.e_superadmin() from public, anon, authenticated;
grant usage on schema api to authenticated;
grant execute on function api.tem_papel(uuid, text[]), api.empresas_do_usuario(), api.e_superadmin() to authenticated;
