-- 0054: Central de governança — dúvidas e ocorrências do uso do painel, com triagem e resolução.
-- Padrão herdado do ZAgent (lib/governance/redaction + fluxo de revisão): schema fechado, nada de acesso direto;
-- leitura/escrita só por funções api.* que checam a permissão da tela; dado sensível (CPF, CNPJ, e-mail, telefone)
-- é mascarado ANTES de gravar (LGPD), como o ZAgent faz antes de promover aprendizado. Nada aqui toca Bling, Meta
-- ou gateway (D12). Registrar é aberto a qualquer membro da empresa (pelo menu de Ajuda); triar/resolver exige a tela.
--
-- Reversão: drop schema governanca cascade; delete from crm.cfg_permissao_tela where tela='governanca';
--           delete from crm.cad_tela where tela='governanca';

create schema if not exists governanca;
revoke all on schema governanca from public, anon, authenticated;

-- ---------------------------------------------------------------- redação de dados sensíveis (espelha o ZAgent)
-- ordem: CNPJ antes de CPF (o CPF casaria parte do CNPJ); e-mail; telefone por último.
create function governanca.mascarar(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(p, ''),
                 '\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}', '[omitido]', 'g'),   -- CNPJ
               '\d{3}\.?\d{3}\.?\d{3}-?\d{2}', '[omitido]', 'g'),            -- CPF
             '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[omitido]', 'g'),  -- e-mail
           '(\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}', '[omitido]', 'g')   -- telefone
$$;

-- ---------------------------------------------------------------- tabela
create table governanca.mov_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  tipo text not null check (tipo in ('duvida','ocorrencia','sugestao')),
  origem text not null default 'usuario' check (origem in ('usuario','sistema')),
  titulo text not null check (length(titulo) between 1 and 180),
  descricao text not null check (length(descricao) between 1 and 4000),
  tela text references crm.cad_tela(tela),                       -- tela de origem (null = geral)
  severidade text check (severidade is null or severidade in ('baixa','media','alta')),
  estado text not null default 'aberto' check (estado in ('aberto','em_analise','resolvido','descartado')),
  resolucao text check (resolucao is null or length(resolucao) <= 4000),
  mascarados jsonb not null default '{}'::jsonb,                  -- quantos trechos sensíveis foram mascarados
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  resolvido_por uuid,
  resolvido_em timestamptz
);
create index mov_item_empresa_estado_idx on governanca.mov_item (empresa_id, estado, criado_em desc);
create index mov_item_empresa_tipo_idx on governanca.mov_item (empresa_id, tipo, criado_em desc);

alter table governanca.mov_item enable row level security;
revoke all on all tables in schema governanca from public, anon, authenticated;
create trigger auditoria after insert or update or delete on governanca.mov_item
  for each row execute function audit.registrar();

-- ---------------------------------------------------------------- permissão
-- registrar: qualquer membro ativo da empresa (ou superadmin). triar/resolver: a tela 'governanca'.
create function governanca._membro(p_empresa uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_empresa is null or not (
       (select api.e_superadmin())
    or exists (select 1 from crm.rel_usuario_empresa r
                where r.usuario_id = (select auth.uid()) and r.empresa_id = p_empresa and r.ativo)) then
    raise exception 'sem acesso a esta empresa' using errcode = '42501';
  end if;
end $$;

create function governanca._exigir(p_empresa uuid, p_nivel text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select api.pode_tela(p_empresa, 'governanca', p_nivel)) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------- registrar (aberto a qualquer membro)
create function api.governanca_registrar(p_empresa uuid, p_tela text, p_tipo text, p_titulo text, p_descricao text, p_severidade text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_tit text; v_desc text; v_tela text; v_sev text; n int;
begin
  perform governanca._membro(p_empresa);
  if p_tipo not in ('duvida','ocorrencia','sugestao') then raise exception 'tipo inválido' using errcode = '22023'; end if;
  v_tit := governanca.mascarar(btrim(coalesce(p_titulo, '')));
  v_desc := governanca.mascarar(btrim(coalesce(p_descricao, '')));
  if length(v_tit) not between 1 and 180 then raise exception 'resumo inválido (1 a 180 caracteres)' using errcode = '22023'; end if;
  if length(v_desc) not between 1 and 4000 then raise exception 'detalhes inválidos (1 a 4000 caracteres)' using errcode = '22023'; end if;
  v_tela := case when p_tela is not null and exists (select 1 from crm.cad_tela where tela = p_tela) then p_tela else null end;
  v_sev := case when p_tipo = 'ocorrencia' and p_severidade in ('baixa','media','alta') then p_severidade else null end;
  n := (select count(*) from regexp_matches(v_tit || ' ' || v_desc, '\[omitido\]', 'g'));
  insert into governanca.mov_item (empresa_id, tipo, origem, titulo, descricao, tela, severidade, mascarados, criado_por)
  values (p_empresa, p_tipo, 'usuario', v_tit, v_desc, v_tela, v_sev, jsonb_build_object('total', n), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- listar (triagem) com resumo e filtros
create function api.governanca_listar(p_empresa uuid, p_tipo text default null, p_estado text default null, p_busca text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; v_busca text;
begin
  perform governanca._exigir(p_empresa, 'ver');
  v_busca := nullif(btrim(coalesce(p_busca, '')), '');
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'aberto',     (select count(*) from governanca.mov_item where empresa_id = p_empresa and estado = 'aberto'),
      'em_analise', (select count(*) from governanca.mov_item where empresa_id = p_empresa and estado = 'em_analise'),
      'resolvido',  (select count(*) from governanca.mov_item where empresa_id = p_empresa and estado = 'resolvido'),
      'descartado', (select count(*) from governanca.mov_item where empresa_id = p_empresa and estado = 'descartado'),
      'total',      (select count(*) from governanca.mov_item where empresa_id = p_empresa)),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'tipo', i.tipo, 'origem', i.origem, 'titulo', i.titulo, 'descricao', i.descricao,
               'tela', i.tela, 'tela_rotulo', t.rotulo, 'severidade', i.severidade, 'estado', i.estado,
               'criado_em', i.criado_em, 'criado_por_nome', uc.nome,
               'atualizado_em', i.atualizado_em, 'resolucao', i.resolucao,
               'resolvido_por_nome', ur.nome, 'resolvido_em', i.resolvido_em)
             order by case i.estado when 'aberto' then 0 when 'em_analise' then 1 when 'resolvido' then 2 else 3 end, i.criado_em desc)
        from governanca.mov_item i
        left join crm.cad_tela t on t.tela = i.tela
        left join crm.cad_usuario uc on uc.id = i.criado_por
        left join crm.cad_usuario ur on ur.id = i.resolvido_por
       where i.empresa_id = p_empresa
         and (p_tipo is null or i.tipo = p_tipo)
         and (p_estado is null or i.estado = p_estado)
         and (v_busca is null or i.titulo ilike '%' || v_busca || '%' or i.descricao ilike '%' || v_busca || '%')
       limit 300), '[]'::jsonb))
  into r;
  return r;
end $$;

-- ---------------------------------------------------------------- atualizar estado / resolução
create function api.governanca_atualizar(p_empresa uuid, p_id uuid, p_estado text, p_resolucao text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform governanca._exigir(p_empresa, 'editar');
  if p_estado not in ('aberto','em_analise','resolvido','descartado') then raise exception 'estado inválido' using errcode = '22023'; end if;
  update governanca.mov_item set
    estado = p_estado,
    resolucao = case when p_resolucao is null then resolucao else nullif(governanca.mascarar(left(btrim(p_resolucao), 4000)), '') end,
    atualizado_em = now(),
    resolvido_por = case when p_estado in ('resolvido','descartado') then (select auth.uid()) else resolvido_por end,
    resolvido_em  = case when p_estado in ('resolvido','descartado') then now() else resolvido_em end
  where id = p_id and empresa_id = p_empresa;
  if not found then raise exception 'item não encontrado' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------- registrar a tela (admin recebe 'editar' automático)
insert into crm.cad_tela (tela, grupo, ordem, rotulo, situacao, aplicacao, descricao, nivel_max)
values ('governanca', 'Configuração', 270, 'Central de governança', 'ativa', 'tela_e_banco',
        'Dúvidas e ocorrências do uso do painel: registro, triagem, resolução e aprendizado, com dados sensíveis mascarados', 'editar')
on conflict (tela) do nothing;
insert into crm.cfg_permissao_tela (empresa_id, tela, papel, nivel)
select e.id, 'governanca', p.papel, p.nivel from crm.cad_empresa e
 cross join (values ('gestor','editar'), ('suporte','editar'), ('financeiro','ver')) p(papel, nivel)
on conflict do nothing;

-- ---------------------------------------------------------------- privilégios
revoke all on function governanca.mascarar(text), governanca._membro(uuid), governanca._exigir(uuid, text) from public, anon, authenticated, service_role;
revoke all on function
  api.governanca_registrar(uuid, text, text, text, text, text),
  api.governanca_listar(uuid, text, text, text),
  api.governanca_atualizar(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  api.governanca_registrar(uuid, text, text, text, text, text),
  api.governanca_listar(uuid, text, text, text),
  api.governanca_atualizar(uuid, uuid, text, text)
  to authenticated;
