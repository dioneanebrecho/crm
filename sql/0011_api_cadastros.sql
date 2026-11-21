-- 0011: camada api.* para o painel — leitura e escrita dos cadastros (locais, peças, variações, unidades, clientes)
-- Princípio (arquitetura-crm-padroes-e-seguranca 2.3): o painel NÃO toca nas tabelas. Só chama estas funções
-- (security definer, papel checado por empresa, auditoria por gatilho). Nada aqui escreve em sistema externo (D12).

-- ---------------------------------------------------------------- auditoria dos cadastros de catálogo
create trigger auditoria after insert or update or delete on catalogo.cad_peca     for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on catalogo.cad_variacao for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on catalogo.cad_unidade  for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on catalogo.cad_local    for each row execute function audit.registrar();

-- ---------------------------------------------------------------- helper interno (não exposto)
create function api._exigir(p_empresa uuid, p_papeis text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_empresa is null or not (select api.tem_papel(p_empresa, p_papeis)) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------- leitura
create function api.me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'usuario', (select to_jsonb(u) from (select id, nome, email, is_superadmin from crm.cad_usuario
                                          where id = (select auth.uid()) and ativo) u),
    'empresas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'nome', coalesce(e.nome_fantasia, e.razao_social),
               'papeis', coalesce((select array_agg(r.papel order by r.papel) from crm.rel_usuario_empresa r
                                    where r.usuario_id = (select auth.uid()) and r.empresa_id = e.id and r.ativo), '{}')
                         || case when (select api.e_superadmin()) then array['superadmin'] else '{}'::text[] end)
             order by coalesce(e.nome_fantasia, e.razao_social))
        from crm.cad_empresa e
       where e.ativo and (select api.tem_papel(e.id, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']))
    ), '[]'::jsonb)) $$;

create function api.listar_locais(p_empresa uuid)
returns table (id uuid, nome text, vendavel boolean, ativo boolean, qtd_unidades bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  return query
    select l.id, l.nome, l.vendavel, l.ativo,
           (select count(*) from catalogo.cad_unidade u where u.local_id = l.id)
      from catalogo.cad_local l where l.empresa_id = p_empresa order by l.nome;
end $$;

create function api.listar_pecas(p_empresa uuid, p_busca text default null, p_limite int default 50, p_offset int default 0)
returns table (id uuid, codigo text, nome text, categoria text, marca text, condicao text, custo numeric, preco_tabela numeric,
               qtd_variacoes bigint, qtd_unidades bigint, qtd_disponiveis bigint, atualizado_em timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_custo boolean;
  v_busca text := case when nullif(trim(p_busca), '') is null then null
                       else '%' || regexp_replace(trim(p_busca), '([\\%_])', '\\\1', 'g') || '%' end;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_custo := (select api.tem_papel(p_empresa, array['admin','gestor','financeiro']));
  return query
    select p.id, p.codigo, p.nome, p.categoria, p.marca, p.condicao,
           case when v_custo then p.custo end, p.preco_tabela,
           (select count(*) from catalogo.cad_variacao v where v.peca_id = p.id),
           (select count(*) from catalogo.cad_unidade u join catalogo.cad_variacao v on v.id = u.variacao_id where v.peca_id = p.id),
           (select count(*) from catalogo.cad_unidade u join catalogo.cad_variacao v on v.id = u.variacao_id
             where v.peca_id = p.id and u.estado = 'disponivel'),
           p.atualizado_em, count(*) over ()
      from catalogo.cad_peca p
     where p.empresa_id = p_empresa
       and (v_busca is null or p.codigo ilike v_busca or p.nome ilike v_busca or p.marca ilike v_busca or p.categoria ilike v_busca)
     order by p.atualizado_em desc, p.id
     limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function api.obter_peca(p_empresa uuid, p_peca uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_custo boolean; v_res jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_custo := (select api.tem_papel(p_empresa, array['admin','gestor','financeiro']));
  select jsonb_build_object(
    'peca', jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nome', p.nome, 'descricao', p.descricao, 'categoria', p.categoria,
              'marca', p.marca, 'condicao', p.condicao, 'custo', case when v_custo then p.custo end,
              'preco_tabela', p.preco_tabela, 'fotos', p.fotos, 'atualizado_em', p.atualizado_em),
    'variacoes', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'tamanho', v.tamanho, 'codigo', v.codigo,
        'unidades', coalesce((
          select jsonb_agg(jsonb_build_object('id', u.id, 'codigo', u.codigo, 'estado', u.estado, 'local_id', u.local_id,
                                              'local_nome', l.nome, 'observacao', u.observacao) order by u.codigo)
            from catalogo.cad_unidade u join catalogo.cad_local l on l.id = u.local_id where u.variacao_id = v.id), '[]'::jsonb))
        order by v.tamanho)
        from catalogo.cad_variacao v where v.peca_id = p.id), '[]'::jsonb))
    into v_res
    from catalogo.cad_peca p where p.id = p_peca and p.empresa_id = p_empresa;
  if v_res is null then raise exception 'peça não encontrada' using errcode = 'P0002'; end if;
  return v_res;
end $$;

create function api.listar_unidades(p_empresa uuid, p_busca text default null, p_estado text default null, p_local uuid default null,
                                    p_limite int default 50, p_offset int default 0)
returns table (id uuid, codigo text, estado text, local_id uuid, local_nome text, variacao_id uuid, tamanho text,
               peca_id uuid, peca_codigo text, peca_nome text, observacao text, criado_em timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_busca text := case when nullif(trim(p_busca), '') is null then null
                       else '%' || regexp_replace(trim(p_busca), '([\\%_])', '\\\1', 'g') || '%' end;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  return query
    select u.id, u.codigo, u.estado, u.local_id, l.nome, v.id, v.tamanho, p.id, p.codigo, p.nome, u.observacao, u.criado_em, count(*) over ()
      from catalogo.cad_unidade u
      join catalogo.cad_variacao v on v.id = u.variacao_id
      join catalogo.cad_peca p on p.id = v.peca_id
      join catalogo.cad_local l on l.id = u.local_id
     where u.empresa_id = p_empresa
       and (p_estado is null or u.estado = p_estado)
       and (p_local is null or u.local_id = p_local)
       and (v_busca is null or u.codigo ilike v_busca or p.codigo ilike v_busca or p.nome ilike v_busca)
     order by u.criado_em desc, u.id
     limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- Dado pessoal: telefone, e-mail e observação só para quem atende a cliente (admin, gestor, suporte).
create function api.listar_clientes(p_empresa uuid, p_busca text default null, p_limite int default 50, p_offset int default 0)
returns table (id uuid, nome text, instagram_username text, telefone text, email text, observacao_interna text,
               bloqueado_ate timestamptz, anonimizado boolean, criado_em timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_pii boolean;
  v_busca text := case when nullif(trim(p_busca), '') is null then null
                       else '%' || regexp_replace(trim(p_busca), '([\\%_])', '\\\1', 'g') || '%' end;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_pii := (select api.tem_papel(p_empresa, array['admin','gestor','suporte']));
  return query
    select c.id, c.nome, c.instagram_username,
           case when v_pii then c.telefone end, case when v_pii then c.email end, case when v_pii then c.observacao_interna end,
           c.bloqueado_ate, c.anonimizado_em is not null, c.criado_em, count(*) over ()
      from crm.cad_cliente c
     where c.empresa_id = p_empresa
       and (v_busca is null or c.nome ilike v_busca or c.instagram_username ilike v_busca
            or (v_pii and (c.telefone ilike v_busca or c.email ilike v_busca)))
     order by c.criado_em desc, c.id
     limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ---------------------------------------------------------------- escrita
create function api.salvar_local(p_empresa uuid, p_nome text, p_vendavel boolean default true, p_id uuid default null, p_ativo boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_nome text := nullif(trim(p_nome), '');
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if v_nome is null then raise exception 'informe o nome do local' using errcode = '22023'; end if;
  if p_id is null then
    insert into catalogo.cad_local (empresa_id, nome, vendavel, ativo) values (p_empresa, v_nome, coalesce(p_vendavel, true), coalesce(p_ativo, true))
      returning id into v_id;
  else
    update catalogo.cad_local set nome = v_nome, vendavel = coalesce(p_vendavel, vendavel), ativo = coalesce(p_ativo, ativo)
     where id = p_id and empresa_id = p_empresa returning id into v_id;
    if v_id is null then raise exception 'local não encontrado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'já existe um local com esse nome' using errcode = '23505';
end $$;

create function api.salvar_peca(p_empresa uuid, p_codigo text, p_nome text, p_id uuid default null, p_descricao text default null,
                                p_categoria text default null, p_marca text default null, p_condicao text default 'usada',
                                p_custo numeric default null, p_preco_tabela numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_codigo text := nullif(trim(p_codigo), ''); v_nome text := nullif(trim(p_nome), '');
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if v_codigo is null or v_nome is null then raise exception 'informe código e nome da peça' using errcode = '22023'; end if;
  if coalesce(p_condicao, 'usada') not in ('nova','usada') then raise exception 'condição deve ser nova ou usada' using errcode = '22023'; end if;
  if p_custo < 0 or p_preco_tabela < 0 then raise exception 'valores não podem ser negativos' using errcode = '22023'; end if;
  if p_id is null then
    insert into catalogo.cad_peca (empresa_id, codigo, nome, descricao, categoria, marca, condicao, custo, preco_tabela)
    values (p_empresa, v_codigo, v_nome, nullif(trim(p_descricao), ''), nullif(trim(p_categoria), ''), nullif(trim(p_marca), ''),
            coalesce(p_condicao, 'usada'), p_custo, p_preco_tabela)
    returning id into v_id;
  else
    update catalogo.cad_peca set codigo = v_codigo, nome = v_nome, descricao = nullif(trim(p_descricao), ''),
           categoria = nullif(trim(p_categoria), ''), marca = nullif(trim(p_marca), ''), condicao = coalesce(p_condicao, condicao),
           custo = p_custo, preco_tabela = p_preco_tabela, atualizado_em = now()
     where id = p_id and empresa_id = p_empresa returning id into v_id;
    if v_id is null then raise exception 'peça não encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'já existe uma peça com esse código' using errcode = '23505';
end $$;

create function api.salvar_variacao(p_empresa uuid, p_peca uuid, p_tamanho text, p_codigo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_tam text := upper(nullif(trim(p_tamanho), '')); v_pcod text; v_cod text;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if v_tam is null then raise exception 'informe o tamanho' using errcode = '22023'; end if;
  select codigo into v_pcod from catalogo.cad_peca where id = p_peca and empresa_id = p_empresa;
  if v_pcod is null then raise exception 'peça não encontrada' using errcode = 'P0002'; end if;
  v_cod := coalesce(nullif(trim(p_codigo), ''), v_pcod || '-' || regexp_replace(v_tam, '\s+', '', 'g'));
  insert into catalogo.cad_variacao (empresa_id, peca_id, tamanho, codigo) values (p_empresa, p_peca, v_tam, v_cod) returning id into v_id;
  update catalogo.cad_peca set atualizado_em = now() where id = p_peca;
  return v_id;
exception when unique_violation then
  raise exception 'já existe essa variação (tamanho ou código) para a peça' using errcode = '23505';
end $$;

-- Cada unidade física recebe um código sequencial: <código da variação>-001, -002...
create function api.criar_unidades(p_empresa uuid, p_variacao uuid, p_local uuid, p_quantidade int default 1, p_observacao text default null)
returns table (id uuid, codigo text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_vcod text; v_seq int; i int; v_id uuid; v_cod text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','expedicao']);
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 200 then
    raise exception 'quantidade deve ficar entre 1 e 200' using errcode = '22023';
  end if;
  select codigo into v_vcod from catalogo.cad_variacao where catalogo.cad_variacao.id = p_variacao and empresa_id = p_empresa;
  if v_vcod is null then raise exception 'variação não encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from catalogo.cad_local l where l.id = p_local and l.empresa_id = p_empresa and l.ativo) then
    raise exception 'local não encontrado ou inativo' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('unidade:' || p_variacao::text, 0));
  select coalesce(max((regexp_match(u.codigo, '-(\d+)$'))[1]::int), 0) into v_seq from catalogo.cad_unidade u where u.variacao_id = p_variacao;
  for i in 1 .. p_quantidade loop
    v_cod := v_vcod || '-' || lpad((v_seq + i)::text, 3, '0');
    insert into catalogo.cad_unidade (empresa_id, variacao_id, codigo, local_id, observacao)
    values (p_empresa, p_variacao, v_cod, p_local, nullif(trim(p_observacao), '')) returning catalogo.cad_unidade.id into v_id;
    id := v_id; codigo := v_cod; return next;
  end loop;
exception when unique_violation then
  raise exception 'código de unidade já existe; tente novamente' using errcode = '23505';
end $$;

create function api.salvar_cliente(p_empresa uuid, p_nome text default null, p_id uuid default null, p_instagram_username text default null,
                                   p_telefone text default null, p_email text default null, p_observacao_interna text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_nome text := nullif(trim(p_nome), '');
  v_user text := nullif(lower(regexp_replace(trim(coalesce(p_instagram_username, '')), '^@+', '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte']);
  if v_nome is null and v_user is null then raise exception 'informe o nome ou o @ do Instagram' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail inválido' using errcode = '22023'; end if;
  if v_user is not null and exists (select 1 from crm.cad_cliente c
        where c.empresa_id = p_empresa and c.instagram_username = v_user and c.anonimizado_em is null and c.id is distinct from p_id) then
    raise exception 'já existe cliente com esse @ do Instagram' using errcode = '23505';
  end if;
  if p_id is null then
    insert into crm.cad_cliente (empresa_id, nome, instagram_username, telefone, email, observacao_interna)
    values (p_empresa, v_nome, v_user, nullif(trim(p_telefone), ''), v_email, nullif(trim(p_observacao_interna), ''))
    returning id into v_id;
  else
    update crm.cad_cliente set nome = v_nome, instagram_username = v_user, telefone = nullif(trim(p_telefone), ''), email = v_email,
           observacao_interna = nullif(trim(p_observacao_interna), ''), atualizado_em = now()
     where id = p_id and empresa_id = p_empresa and anonimizado_em is null returning id into v_id;
    if v_id is null then raise exception 'cliente não encontrado ou anonimizado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- privilégios: só `authenticated` executa; helper fica fechado
revoke all on function api._exigir(uuid, text[]) from public, anon, authenticated;
revoke all on function
  api.me(), api.listar_locais(uuid), api.listar_pecas(uuid, text, int, int), api.obter_peca(uuid, uuid),
  api.listar_unidades(uuid, text, text, uuid, int, int), api.listar_clientes(uuid, text, int, int),
  api.salvar_local(uuid, text, boolean, uuid, boolean),
  api.salvar_peca(uuid, text, text, uuid, text, text, text, text, numeric, numeric),
  api.salvar_variacao(uuid, uuid, text, text), api.criar_unidades(uuid, uuid, uuid, int, text),
  api.salvar_cliente(uuid, text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  api.me(), api.listar_locais(uuid), api.listar_pecas(uuid, text, int, int), api.obter_peca(uuid, uuid),
  api.listar_unidades(uuid, text, text, uuid, int, int), api.listar_clientes(uuid, text, int, int),
  api.salvar_local(uuid, text, boolean, uuid, boolean),
  api.salvar_peca(uuid, text, text, uuid, text, text, text, text, numeric, numeric),
  api.salvar_variacao(uuid, uuid, text, text), api.criar_unidades(uuid, uuid, uuid, int, text),
  api.salvar_cliente(uuid, text, uuid, text, text, text, text)
  to authenticated;
