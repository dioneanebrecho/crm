-- SOMENTE PARA TESTE LOCAL. Reproduz o mínimo do estado anterior à 0014 (0001, 0002, 0007, 0008, 0012, 0013) + stub do Vault.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema engine; create schema crm; create schema audit; create schema api; create schema private;

create table crm.cad_empresa (id uuid primary key default gen_random_uuid(), razao_social text not null, nome_fantasia text,
  cnpj text unique, bling_empresa_id_esperado text, instagram_user_id_esperado text, ativo boolean not null default true,
  criado_em timestamptz not null default now());
create table crm.cfg_empresa (empresa_id uuid primary key references crm.cad_empresa(id) on delete cascade);
create table crm.cad_usuario (id uuid primary key references auth.users(id) on delete cascade, nome text not null, email text not null,
  is_superadmin boolean not null default false, ativo boolean not null default true, criado_em timestamptz not null default now());
create table crm.rel_usuario_empresa (usuario_id uuid not null references crm.cad_usuario(id) on delete cascade,
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  papel text not null check (papel in ('admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura')),
  ativo boolean not null default true, criado_em timestamptz not null default now(), primary key (usuario_id, empresa_id, papel));
create function api.e_superadmin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.cad_usuario where id = (select auth.uid()) and is_superadmin and ativo) $$;
create function api.tem_papel(p_empresa uuid, p_papeis text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select (select api.e_superadmin()) or exists (select 1 from crm.rel_usuario_empresa
     where usuario_id = (select auth.uid()) and empresa_id = p_empresa and ativo and papel = any (p_papeis)) $$;
create function api._exigir(p_empresa uuid, p_papeis text[]) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_empresa is null or not (select api.tem_papel(p_empresa, p_papeis)) then raise exception 'sem permissão' using errcode = '42501'; end if;
end $$;

-- estado pós-0012 de engine.cfg_integracao
create table engine.cfg_integracao (
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  integracao text not null,
  modo text not null default 'desligado' check (modo in ('desligado','simulado','real')),
  somente_allowlist boolean not null default true, observacao text,
  atualizado_em timestamptz not null default now(),
  parametros jsonb not null default '{}'::jsonb,
  status text not null default 'nao_configurada' check (status in ('nao_configurada','configurada','testada_ok','falhou')),
  ultimo_teste_em timestamptz, ultimo_teste_ok boolean, ultimo_teste_resumo text, atualizado_por uuid,
  primary key (empresa_id, integracao));
alter table engine.cfg_integracao add constraint cfg_integracao_integracao_check
  check (integracao in ('meta_dm','meta_live','bling','gateway','whatsapp','nfe','facebook'));
create table private.cad_credencial (
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  nome text not null, segredo_id uuid, expira_em timestamptz, versao bigint not null default 1,
  atualizado_em timestamptz not null default now(), primary key (empresa_id, nome));
create function crm.provisionar_empresa(p_empresa uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into crm.cfg_empresa (empresa_id) values (p_empresa) on conflict do nothing;
  insert into engine.cfg_integracao (empresa_id, integracao)
  select p_empresa, x from unnest(array['meta_dm','meta_live','bling','gateway','whatsapp','nfe','facebook']) x on conflict do nothing;
end $$;

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
create trigger auditoria after insert or update or delete on engine.cfg_integracao for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on private.cad_credencial for each row execute function audit.registrar('segredo_id');

create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text not null,
  created_at timestamptz default now(), updated_at timestamptz default now());
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$ update vault.secrets set secret = coalesce(new_secret, secret), updated_at = now() where id = secret_id $$;

-- funções da 0012 usadas pelos testes (cópia fiel; a salvar_integracao e _chaves_param/_segredos_painel vêm da 0014)
create function engine._chaves_param(p_integracao text) returns text[] language sql immutable set search_path = '' as $$
  select case p_integracao when 'bling' then array['client_id','empresa_id_bling'] else '{}'::text[] end $$;
create function engine._segredos_painel(p_integracao text) returns text[] language sql immutable set search_path = '' as $$
  select case p_integracao when 'bling' then array['client_secret'] else '{}'::text[] end $$;
create function engine._segredos_servico(p_integracao text) returns text[] language sql immutable set search_path = '' as $$
  select engine._segredos_painel(p_integracao) || case when p_integracao = 'bling' then array['access_token','refresh_token'] else '{}'::text[] end $$;
create function api.pode_gravar_segredo_painel(p_empresa uuid, p_integracao text, p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select api.tem_papel(p_empresa, array['admin'])) and p_nome = any (engine._segredos_painel(p_integracao)) $$;
create function api.salvar_integracao(p_empresa uuid, p_integracao text, p_parametros jsonb) returns void
language plpgsql security definer set search_path = '' as $$ begin raise exception 'stub'; end $$;
create function api.svc_gravar_segredo(p_empresa uuid, p_integracao text, p_nome text, p_valor text,
                                       p_expira timestamptz default null, p_invalida_teste boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare v_nome text := p_integracao || '.' || p_nome; v_id uuid;
begin
  if not (p_nome = any (engine._segredos_servico(p_integracao))) then
    raise exception 'segredo não permitido: %', v_nome using errcode = '22023'; end if;
  if nullif(p_valor, '') is null then raise exception 'valor vazio' using errcode = '22023'; end if;
  select segredo_id into v_id from private.cad_credencial where empresa_id = p_empresa and nome = v_nome for update;
  if v_id is null then
    v_id := vault.create_secret(p_valor, p_empresa::text || ':' || v_nome, 'integração ' || p_integracao);
    insert into private.cad_credencial (empresa_id, nome, segredo_id, expira_em, versao, atualizado_em) values (p_empresa, v_nome, v_id, p_expira, 1, now());
  else
    perform vault.update_secret(v_id, p_valor);
    update private.cad_credencial set expira_em = p_expira, versao = versao + 1, atualizado_em = now() where empresa_id = p_empresa and nome = v_nome;
  end if;
  if p_invalida_teste then
    update engine.cfg_integracao set status = 'configurada', ultimo_teste_ok = null, ultimo_teste_em = null,
           ultimo_teste_resumo = null, modo = 'desligado', atualizado_em = now() where empresa_id = p_empresa and integracao = p_integracao;
  end if;
end $$;

alter default privileges revoke execute on functions from public;
revoke all on function api.tem_papel(uuid, text[]), api.e_superadmin(), api._exigir(uuid, text[]) from public, anon, authenticated;
grant usage on schema api to authenticated, service_role;
grant execute on function api.tem_papel(uuid, text[]), api.e_superadmin() to authenticated;
revoke all on function api.svc_gravar_segredo(uuid,text,text,text,timestamptz,boolean), api.pode_gravar_segredo_painel(uuid,text,text), api.salvar_integracao(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function api.svc_gravar_segredo(uuid,text,text,text,timestamptz,boolean) to service_role;
grant execute on function api.pode_gravar_segredo_painel(uuid,text,text), api.salvar_integracao(uuid,text,jsonb) to authenticated;

-- dados de teste (a1 admin, a2 gestor, a3 leitura, a4 admin de outra empresa, a5 suporte, a6 expedição, a7 superadmin, a8 gestor+financeiro)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t'), ('00000000-0000-0000-0000-0000000000a2','gestor@t'),
 ('00000000-0000-0000-0000-0000000000a3','leitura@t'), ('00000000-0000-0000-0000-0000000000a4','outra@t'),
 ('00000000-0000-0000-0000-0000000000a5','suporte@t'), ('00000000-0000-0000-0000-0000000000a6','expedicao@t'),
 ('00000000-0000-0000-0000-0000000000a7','super@t'), ('00000000-0000-0000-0000-0000000000a8','gestorfin@t');
insert into crm.cad_usuario (id, nome, email, is_superadmin) select id, email, email, (email = 'super@t') from auth.users;
insert into crm.cad_empresa (id, razao_social) values ('aaaaaaaa-0000-0000-0000-000000000001','Ane'),('bbbbbbbb-0000-0000-0000-000000000002','Outra');
select crm.provisionar_empresa(id) from crm.cad_empresa;
insert into crm.rel_usuario_empresa (usuario_id, empresa_id, papel) values
 ('00000000-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('00000000-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001','gestor'),
 ('00000000-0000-0000-0000-0000000000a3','aaaaaaaa-0000-0000-0000-000000000001','leitura'),
 ('00000000-0000-0000-0000-0000000000a4','bbbbbbbb-0000-0000-0000-000000000002','admin'),
 ('00000000-0000-0000-0000-0000000000a5','aaaaaaaa-0000-0000-0000-000000000001','suporte'),
 ('00000000-0000-0000-0000-0000000000a6','aaaaaaaa-0000-0000-0000-000000000001','expedicao'),
 ('00000000-0000-0000-0000-0000000000a8','aaaaaaaa-0000-0000-0000-000000000001','gestor'),
 ('00000000-0000-0000-0000-0000000000a8','aaaaaaaa-0000-0000-0000-000000000001','financeiro');
