-- 0026: categorias e marcas como cadastro próprio (lista sugerida na tela de Peças, cadastro automático sem duplicar)
--       e condição padrão "nova".
-- PROPOSTA: ainda não aplicada. Ver pedido-mudanca-016-ux-pecas-categoria-marca.md.
-- Independe da 0022, 0024 e 0025 (só usa catalogo.cad_peca e api.salvar_peca da 0011).
-- Nada aqui escreve em sistema externo (D12). O painel continua falando só com o schema api.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------- 1. Normalização (chave de comparação)
-- "Blusa", "blusa ", "BLUSA" e "Blúsa" caem na mesma chave. Espaço duplo, espaço nas pontas e caixa não criam duplicidade.
create or replace function catalogo.normalizar_texto(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select nullif(lower(extensions.unaccent(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'))), '')
$$;

-- ---------------------------------------------------------------- 2. Tabelas
create table catalogo.cad_categoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  nome text not null check (length(nome) between 1 and 80),
  nome_norm text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome_norm)
);
create table catalogo.cad_marca (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  nome text not null check (length(nome) between 1 and 80),
  nome_norm text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome_norm)
);
alter table catalogo.cad_categoria enable row level security;
alter table catalogo.cad_marca enable row level security;
-- sem policy: acesso só pelas funções api.* (security definer), como as demais tabelas do catálogo.

-- ---------------------------------------------------------------- 3. Carga inicial a partir do que já existe nas peças
insert into catalogo.cad_categoria (empresa_id, nome, nome_norm)
select empresa_id, min(trim(categoria)), catalogo.normalizar_texto(categoria)
  from catalogo.cad_peca where catalogo.normalizar_texto(categoria) is not null
 group by empresa_id, catalogo.normalizar_texto(categoria)
on conflict do nothing;
insert into catalogo.cad_marca (empresa_id, nome, nome_norm)
select empresa_id, min(trim(marca)), catalogo.normalizar_texto(marca)
  from catalogo.cad_peca where catalogo.normalizar_texto(marca) is not null
 group by empresa_id, catalogo.normalizar_texto(marca)
on conflict do nothing;

-- ---------------------------------------------------------------- 4. Leitura para a lista do formulário
create function api.listar_categorias(p_empresa uuid) returns table (id uuid, nome text, pecas bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','financeiro','expedicao']);
  return query
    select c.id, c.nome, count(p.id)
      from catalogo.cad_categoria c
      left join catalogo.cad_peca p on p.empresa_id = c.empresa_id and catalogo.normalizar_texto(p.categoria) = c.nome_norm
     where c.empresa_id = p_empresa and c.ativo
     group by c.id, c.nome order by count(p.id) desc, c.nome;
end $$;

create function api.listar_marcas(p_empresa uuid) returns table (id uuid, nome text, pecas bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','financeiro','expedicao']);
  return query
    select m.id, m.nome, count(p.id)
      from catalogo.cad_marca m
      left join catalogo.cad_peca p on p.empresa_id = m.empresa_id and catalogo.normalizar_texto(p.marca) = m.nome_norm
     where m.empresa_id = p_empresa and m.ativo
     group by m.id, m.nome order by count(p.id) desc, m.nome;
end $$;

-- ---------------------------------------------------------------- 5. Achar ou criar (idempotente)
-- Devolve o nome canônico: se "blusa " já existe como "Blusa", devolve "Blusa" e não cria outro.
create function catalogo._achar_ou_criar_categoria(p_empresa uuid, p_nome text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_norm text := catalogo.normalizar_texto(p_nome); v_nome text;
begin
  if v_norm is null then return null; end if;
  insert into catalogo.cad_categoria (empresa_id, nome, nome_norm)
  values (p_empresa, left(regexp_replace(trim(p_nome), '\s+', ' ', 'g'), 80), v_norm)
  on conflict (empresa_id, nome_norm) do nothing;
  select nome into v_nome from catalogo.cad_categoria where empresa_id = p_empresa and nome_norm = v_norm;
  return v_nome;
end $$;

create function catalogo._achar_ou_criar_marca(p_empresa uuid, p_nome text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_norm text := catalogo.normalizar_texto(p_nome); v_nome text;
begin
  if v_norm is null then return null; end if;
  insert into catalogo.cad_marca (empresa_id, nome, nome_norm)
  values (p_empresa, left(regexp_replace(trim(p_nome), '\s+', ' ', 'g'), 80), v_norm)
  on conflict (empresa_id, nome_norm) do nothing;
  select nome into v_nome from catalogo.cad_marca where empresa_id = p_empresa and nome_norm = v_norm;
  return v_nome;
end $$;

-- ---------------------------------------------------------------- 6. salvar_peca: categoria e marca passam pelo "achar ou criar"; condição padrão "nova"
alter table catalogo.cad_peca alter column condicao set default 'nova';

create or replace function api.salvar_peca(p_empresa uuid, p_codigo text, p_nome text, p_id uuid default null, p_descricao text default null,
                                           p_categoria text default null, p_marca text default null, p_condicao text default 'nova',
                                           p_custo numeric default null, p_preco_tabela numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_codigo text := nullif(trim(p_codigo), ''); v_nome text := nullif(trim(p_nome), '');
        v_cat text; v_marca text;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if v_codigo is null or v_nome is null then raise exception 'informe código e nome da peça' using errcode = '22023'; end if;
  if coalesce(p_condicao, 'nova') not in ('nova','usada') then raise exception 'condição deve ser nova ou usada' using errcode = '22023'; end if;
  if p_custo < 0 or p_preco_tabela < 0 then raise exception 'valores não podem ser negativos' using errcode = '22023'; end if;
  v_cat := catalogo._achar_ou_criar_categoria(p_empresa, p_categoria);
  v_marca := catalogo._achar_ou_criar_marca(p_empresa, p_marca);
  if p_id is null then
    insert into catalogo.cad_peca (empresa_id, codigo, nome, descricao, categoria, marca, condicao, custo, preco_tabela)
    values (p_empresa, v_codigo, v_nome, nullif(trim(p_descricao), ''), v_cat, v_marca, coalesce(p_condicao, 'nova'), p_custo, p_preco_tabela)
    returning id into v_id;
  else
    update catalogo.cad_peca set codigo = v_codigo, nome = v_nome, descricao = nullif(trim(p_descricao), ''),
           categoria = v_cat, marca = v_marca, condicao = coalesce(p_condicao, condicao),
           custo = p_custo, preco_tabela = p_preco_tabela, atualizado_em = now()
     where id = p_id and empresa_id = p_empresa returning id into v_id;
    if v_id is null then raise exception 'peça não encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'já existe uma peça com esse código' using errcode = '23505';
end $$;

-- ---------------------------------------------------------------- 7. Permissões (mesmo padrão das demais funções api.*)
revoke all on function api.listar_categorias(uuid), api.listar_marcas(uuid) from public, anon;
grant execute on function api.listar_categorias(uuid), api.listar_marcas(uuid) to authenticated;
revoke all on function catalogo._achar_ou_criar_categoria(uuid, text), catalogo._achar_ou_criar_marca(uuid, text) from public, anon, authenticated;
