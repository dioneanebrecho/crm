-- 0021: base de conhecimento do assistente (Fase A1 do plano-assistente-ia-rag): documentos -> trechos -> vetores.
-- Aproveita o que o ZAgent aprendeu até chegar no ponto ideal:
--   * vetor de 1024 números desde o início, com o modelo gravado em CADA trecho (nunca se misturam modelos na busca);
--   * o texto nunca se perde por falta de vetor: trecho nasce 'pending' e já é pesquisável por texto;
--   * fila de vetores com limite de 5 tentativas ('failed' esgotado precisa de ação);
--   * busca textual = versão final do ZAgent (v3): casa por QUALQUER termo relevante, ignora palavras vazias, ranqueia por IDF
--     com bônus de título, usa o índice GIN por termo e roda com EXECUTE ... USING (plano com os valores reais);
--   * reaproveita o vetor de trecho que não mudou entre versões do mesmo documento (não paga embedding de novo).
-- Segurança: schema fechado (nada de acesso direto); leitura/escrita só por funções api.* que exigem a permissão da tela;
-- funções api.svc_* só para o service_role (Edge Function). Nada aqui toca Bling, Meta ou gateway (D12).

create extension if not exists unaccent with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists conhecimento;
revoke all on schema conhecimento from public, anon, authenticated;

-- texto sem acento e em minúsculas, imutável (necessário para a coluna gerada e para o índice)
create function conhecimento.norm(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))) $$;

-- ---------------------------------------------------------------- tabelas
create table conhecimento.cad_fonte (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  tipo text not null default 'documento' check (tipo in ('documento','regra','politica','outro')),
  titulo text not null check (length(titulo) between 1 and 200),
  chave text not null check (length(chave) between 1 and 200),     -- título normalizado: identifica a mesma fonte entre versões
  sensibilidade text not null default 'baixa' check (sensibilidade in ('baixa','media','alta')),
  ativa boolean not null default true,
  origem text check (origem is null or length(origem) <= 300),
  versao_atual_id uuid,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (empresa_id, chave)
);

create table conhecimento.mov_versao (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references conhecimento.cad_fonte(id) on delete cascade,
  empresa_id uuid not null,
  versao int not null,
  hash_conteudo text not null check (hash_conteudo ~ '^[0-9a-f]{64}$'),
  texto text,                                                      -- só da versão atual (permite reindexar sem novo envio)
  tamanho int not null,
  mascarados jsonb not null default '{}'::jsonb,                   -- quantos CPF/e-mail/telefone foram mascarados antes de gravar
  criado_em timestamptz not null default now(),
  criado_por uuid,
  unique (fonte_id, versao)
);

create table conhecimento.mov_chunk (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  fonte_id uuid not null references conhecimento.cad_fonte(id) on delete cascade,
  versao_id uuid not null references conhecimento.mov_versao(id) on delete cascade,
  chunk_index int not null check (chunk_index >= 0),
  titulo text not null,
  conteudo text not null check (length(conteudo) between 1 and 8000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  token_count int not null default 0,
  ativo boolean not null default true,                             -- espelha cad_fonte.ativa (evita join no índice)
  search_vector tsvector generated always as
    (to_tsvector('simple'::regconfig, conhecimento.norm(coalesce(titulo, '') || ' ' || conteudo))) stored,
  embedding extensions.vector(1024),
  embedding_model text,
  embedding_status text not null default 'pending' check (embedding_status in ('pending','ready','failed')),
  embedding_tentativas int not null default 0,
  embedding_erro text,
  embedding_tentado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (versao_id, chunk_index),
  check ((embedding_status = 'ready') = (embedding is not null))
);
create index mov_chunk_busca_idx on conhecimento.mov_chunk using gin (search_vector);
create index mov_chunk_vetor_idx on conhecimento.mov_chunk using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
create index mov_chunk_fila_idx on conhecimento.mov_chunk (empresa_id, criado_em) where embedding_status <> 'ready';
create index mov_chunk_fonte_idx on conhecimento.mov_chunk (fonte_id);
create index mov_chunk_versao_idx on conhecimento.mov_chunk (versao_id);
create index mov_versao_empresa_idx on conhecimento.mov_versao (empresa_id);

create table conhecimento.log_recuperacao (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  usuario_id uuid,
  pergunta text not null,                                          -- já mascarada pela função de serviço
  modo text not null check (modo in ('text','vector','hybrid')),
  chunk_ids uuid[] not null default '{}',
  latencia_ms int,
  criado_em timestamptz not null default now()
);
create index log_recuperacao_empresa_idx on conhecimento.log_recuperacao (empresa_id, criado_em desc);

alter table conhecimento.cad_fonte enable row level security;
alter table conhecimento.mov_versao enable row level security;
alter table conhecimento.mov_chunk enable row level security;
alter table conhecimento.log_recuperacao enable row level security;
revoke all on all tables in schema conhecimento from public, anon, authenticated;
create trigger auditoria after insert or update or delete on conhecimento.cad_fonte
  for each row execute function audit.registrar();

-- ---------------------------------------------------------------- permissão (a tela manda também no banco)
create function conhecimento._exigir(p_empresa uuid, p_nivel text, p_telas text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare t text;
begin
  foreach t in array p_telas loop
    if (select api.pode_tela(p_empresa, t, p_nivel)) then return; end if;
  end loop;
  raise exception 'sem permissão' using errcode = '42501';
end $$;

-- ---------------------------------------------------------------- painel: listar e ativar/desativar
create function api.listar_fontes(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['conhecimento']);
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'fontes', (select count(*) from conhecimento.cad_fonte where empresa_id = p_empresa),
      'trechos', (select count(*) from conhecimento.mov_chunk where empresa_id = p_empresa),
      'prontos', (select count(*) from conhecimento.mov_chunk where empresa_id = p_empresa and embedding_status = 'ready'),
      'pendentes', (select count(*) from conhecimento.mov_chunk where empresa_id = p_empresa
                     and (embedding_status = 'pending' or (embedding_status = 'failed' and embedding_tentativas < 5))),
      'falhos', (select count(*) from conhecimento.mov_chunk where empresa_id = p_empresa and embedding_status = 'failed' and embedding_tentativas >= 5),
      'ultimo_erro', (select embedding_erro from conhecimento.mov_chunk where empresa_id = p_empresa and embedding_status = 'failed'
                       order by embedding_tentado_em desc nulls last limit 1),
      'modelos', coalesce((select jsonb_agg(distinct embedding_model) from conhecimento.mov_chunk
                            where empresa_id = p_empresa and embedding_model is not null), '[]'::jsonb)),
    'fontes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'titulo', f.titulo, 'tipo', f.tipo, 'sensibilidade', f.sensibilidade, 'ativa', f.ativa, 'origem', f.origem,
               'versao', v.versao, 'tamanho', v.tamanho, 'atualizado_em', f.atualizado_em, 'mascarados', v.mascarados,
               'trechos', (select count(*) from conhecimento.mov_chunk c where c.fonte_id = f.id),
               'prontos', (select count(*) from conhecimento.mov_chunk c where c.fonte_id = f.id and c.embedding_status = 'ready'))
             order by f.atualizado_em desc)
        from conhecimento.cad_fonte f left join conhecimento.mov_versao v on v.id = f.versao_atual_id
       where f.empresa_id = p_empresa), '[]'::jsonb))
  into r;
  return r;
end $$;

create function api.alternar_fonte(p_empresa uuid, p_fonte uuid, p_ativa boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform conhecimento._exigir(p_empresa, 'editar', array['conhecimento']);
  if p_ativa is null then raise exception 'valor inválido' using errcode = '22023'; end if;
  update conhecimento.cad_fonte set ativa = p_ativa, atualizado_em = now(), atualizado_por = (select auth.uid())
   where id = p_fonte and empresa_id = p_empresa;
  if not found then raise exception 'fonte não encontrada' using errcode = 'P0002'; end if;
  update conhecimento.mov_chunk set ativo = p_ativa where fonte_id = p_fonte;
end $$;

-- ---------------------------------------------------------------- busca textual (versão final do ZAgent, adaptada a empresa_id)
create function api.buscar_conhecimento_texto(p_empresa uuid, p_query text, p_limite int default 8)
returns table(chunk_id uuid, fonte_id uuid, fonte_titulo text, titulo text, conteudo text, score real)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['assistente','conhecimento']);
  return query execute $search$
  with terms as materialized (
    select distinct t.lexeme,
      to_tsquery('simple', quote_literal(t.lexeme) || case when length(t.lexeme) >= 5 then ':*' else '' end) as tq
    from unnest(to_tsvector('simple', conhecimento.norm(left(coalesce($2, ''), 1000)))) t
    where length(t.lexeme) >= 2
      and t.lexeme !~ '^[0-9]{1,2}$'
      and t.lexeme not in (
        'a','o','as','os','e','de','da','do','das','dos','em','no','na','nos','nas','um','uma','uns','umas',
        'para','pra','por','pelo','pela','com','sem','que','qual','quais','quando','onde','como','porque','se',
        'nao','sim','foi','ser','tem','teve','ha','ao','aos','ou','mas','me','meu','minha',
        'seu','sua','isso','esse','essa','este','esta','sobre','mais','muito','ja','tambem',
        'fale','fala','diga','existe','existem'
      )
  ),
  matches as materialized (
    select terms.lexeme, hit.id, hit.criado_em, hit.title_hit
    from terms
    cross join lateral (
      select chunk.id, chunk.criado_em,
             to_tsvector('simple', conhecimento.norm(coalesce(chunk.titulo, ''))) @@ terms.tq as title_hit
      from conhecimento.mov_chunk chunk
      where chunk.search_vector @@ terms.tq and chunk.empresa_id = $1 and chunk.ativo
    ) hit
  ),
  total as (
    select greatest(count(*), 1)::numeric as n from conhecimento.mov_chunk chunk where chunk.empresa_id = $1 and chunk.ativo
  ),
  idf as materialized (
    select m.lexeme, greatest(ln((select n from total) / (1 + count(*))), 0) as w
    from matches m group by m.lexeme
  ),
  top as (
    select m.id, max(m.criado_em) as criado_em,
           sum(idf.w) + sum(case when m.title_hit then idf.w * 1.5 else 0 end) as score
    from matches m join idf on idf.lexeme = m.lexeme
    group by m.id
    order by score desc, max(m.criado_em) desc
    limit least(greatest($3, 1), 20)
  )
  select c.id::uuid, c.fonte_id::uuid, f.titulo::text, c.titulo::text, c.conteudo::text, top.score::real
  from top
  join conhecimento.mov_chunk c on c.id = top.id
  join conhecimento.cad_fonte f on f.id = c.fonte_id
  order by top.score desc, top.criado_em desc
  $search$ using p_empresa, p_query, p_limite;
end $$;

-- ---------------------------------------------------------------- busca vetorial (só compara com vetores do MESMO modelo)
create function api.buscar_conhecimento_vetor(p_empresa uuid, p_embedding extensions.vector, p_modelo text,
                                              p_limite int default 8, p_min_similaridade real default 0.25)
returns table(chunk_id uuid, fonte_id uuid, fonte_titulo text, titulo text, conteudo text, score real)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['assistente','conhecimento']);
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 1024 then
    raise exception 'o vetor da pergunta deve ter 1024 números' using errcode = '22023'; end if;
  if p_modelo is null or length(p_modelo) not between 1 and 80 then raise exception 'modelo inválido' using errcode = '22023'; end if;
  return query
  select c.id, c.fonte_id, f.titulo, c.titulo, c.conteudo, (1 - (c.embedding operator(extensions.<=>) p_embedding))::real as sim
    from conhecimento.mov_chunk c join conhecimento.cad_fonte f on f.id = c.fonte_id
   where c.empresa_id = p_empresa and c.ativo and c.embedding is not null and c.embedding_model = p_modelo
     and (1 - (c.embedding operator(extensions.<=>) p_embedding)) >= coalesce(p_min_similaridade, 0.25)
   order by c.embedding operator(extensions.<=>) p_embedding
   limit least(greatest(p_limite, 1), 20);
end $$;

-- ---------------------------------------------------------------- serviço (Edge Function): gravar documento já dividido em trechos
create function api.svc_gravar_fonte(p_empresa uuid, p_titulo text, p_tipo text, p_sensibilidade text, p_origem text,
                                     p_texto text, p_hash text, p_chunks jsonb, p_mascarados jsonb, p_por uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_titulo text := trim(coalesce(p_titulo, ''));
  v_chave text; v_fonte conhecimento.cad_fonte; v_ver int; v_vid uuid; v_antiga uuid; v_estado text; c jsonb;
  v_total int; v_prontos int;
begin
  if not exists (select 1 from crm.cad_empresa where id = p_empresa) then raise exception 'empresa não encontrada' using errcode = 'P0002'; end if;
  if length(v_titulo) not between 1 and 200 then raise exception 'título inválido' using errcode = '22023'; end if;
  if p_tipo not in ('documento','regra','politica','outro') then raise exception 'tipo inválido' using errcode = '22023'; end if;
  if p_sensibilidade not in ('baixa','media','alta') then raise exception 'sensibilidade inválida' using errcode = '22023'; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'hash inválido' using errcode = '22023'; end if;
  if p_texto is null or length(p_texto) not between 1 and 400000 then raise exception 'texto inválido (1 a 400.000 caracteres)' using errcode = '22023'; end if;
  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) not between 1 and 2000 then
    raise exception 'trechos inválidos' using errcode = '22023'; end if;
  for c in select * from jsonb_array_elements(p_chunks) loop
    if jsonb_typeof(c) <> 'object' or (c->>'indice') is null or (c->>'indice') !~ '^[0-9]{1,5}$'
       or length(coalesce(c->>'conteudo', '')) not between 1 and 8000 or coalesce(c->>'hash', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'trecho inválido' using errcode = '22023'; end if;
  end loop;
  if (select count(distinct (x->>'indice')) from jsonb_array_elements(p_chunks) x) <> jsonb_array_length(p_chunks) then
    raise exception 'índices de trecho repetidos' using errcode = '22023'; end if;

  -- "Regras.pdf", "Regras.md" e "Regras (1).pdf" são a mesma fonte (o ZAgent teve cópias duplicadas assim)
  v_chave := trim(regexp_replace(conhecimento.norm(
               regexp_replace(regexp_replace(v_titulo, '\.(pdf|docx?|xlsx?|csv|txt|md|pptx?)$', '', 'i'), '\s*\(\d+\)\s*$', '')),
             '[^a-z0-9]+', ' ', 'g'));
  if v_chave = '' then raise exception 'título inválido' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text || '|' || v_chave, 0));

  select * into v_fonte from conhecimento.cad_fonte where empresa_id = p_empresa and chave = v_chave;
  if found then
    v_antiga := v_fonte.versao_atual_id;
    if exists (select 1 from conhecimento.mov_versao where id = v_antiga and hash_conteudo = p_hash) then
      return jsonb_build_object('estado', 'sem_mudanca', 'fonte_id', v_fonte.id);
    end if;
    select coalesce(max(versao), 0) + 1 into v_ver from conhecimento.mov_versao where fonte_id = v_fonte.id;
    update conhecimento.cad_fonte set titulo = v_titulo, tipo = p_tipo, sensibilidade = p_sensibilidade, origem = left(p_origem, 300),
           atualizado_em = now(), atualizado_por = p_por where id = v_fonte.id returning * into v_fonte;
    v_estado := 'atualizada';
  else
    insert into conhecimento.cad_fonte (empresa_id, tipo, titulo, chave, sensibilidade, origem, criado_por, atualizado_por)
    values (p_empresa, p_tipo, v_titulo, v_chave, p_sensibilidade, left(p_origem, 300), p_por, p_por) returning * into v_fonte;
    v_ver := 1; v_estado := 'criada';
  end if;

  insert into conhecimento.mov_versao (fonte_id, empresa_id, versao, hash_conteudo, texto, tamanho, mascarados, criado_por)
  values (v_fonte.id, p_empresa, v_ver, p_hash, p_texto, length(p_texto), coalesce(p_mascarados, '{}'::jsonb), p_por) returning id into v_vid;

  -- reaproveita o vetor de trecho idêntico da versão anterior (não paga embedding de novo)
  insert into conhecimento.mov_chunk (empresa_id, fonte_id, versao_id, chunk_index, titulo, conteudo, content_hash, token_count, ativo,
                                      embedding, embedding_model, embedding_status, embedding_tentativas)
  select p_empresa, v_fonte.id, v_vid, (x->>'indice')::int, left(coalesce(nullif(x->>'titulo', ''), v_titulo), 200), x->>'conteudo',
         x->>'hash', coalesce(nullif(x->>'tokens', '')::int, 0), v_fonte.ativa,
         o.embedding, o.embedding_model, case when o.id is not null then 'ready' else 'pending' end, case when o.id is not null then 1 else 0 end
    from jsonb_array_elements(p_chunks) x
    left join lateral (select oc.id, oc.embedding, oc.embedding_model from conhecimento.mov_chunk oc
                        where oc.versao_id = v_antiga and oc.content_hash = x->>'hash' and oc.embedding_status = 'ready' limit 1) o on true;

  if v_antiga is not null then
    delete from conhecimento.mov_chunk where versao_id = v_antiga;
    update conhecimento.mov_versao set texto = null where id = v_antiga;
  end if;
  update conhecimento.cad_fonte set versao_atual_id = v_vid where id = v_fonte.id;
  select count(*), count(*) filter (where embedding_status = 'ready') into v_total, v_prontos from conhecimento.mov_chunk where versao_id = v_vid;
  return jsonb_build_object('estado', v_estado, 'fonte_id', v_fonte.id, 'versao', v_ver, 'trechos', v_total,
                            'reaproveitados', v_prontos, 'pendentes', v_total - v_prontos);
end $$;

-- ---------------------------------------------------------------- serviço: fila de vetores
create function api.svc_chunks_pendentes(p_empresa uuid, p_limite int default 32) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'texto', q.titulo || E'\n' || q.conteudo) order by q.criado_em), '[]'::jsonb)
    from (select id, titulo, conteudo, criado_em from conhecimento.mov_chunk
           where empresa_id = p_empresa and ativo
             and (embedding_status = 'pending' or (embedding_status = 'failed' and embedding_tentativas < 5))
           order by criado_em, chunk_index limit least(greatest(p_limite, 1), 64)) q $$;

create function api.svc_gravar_vetores(p_itens jsonb, p_modelo text) returns int
language plpgsql security definer set search_path = '' as $$
declare e jsonb; n int := 0; v extensions.vector;
begin
  if p_modelo is null or p_modelo !~ '^[A-Za-z0-9._-]{1,80}$' then raise exception 'modelo inválido' using errcode = '22023'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 128 then raise exception 'itens inválidos' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(e->'embedding') <> 'array' or jsonb_array_length(e->'embedding') <> 1024 then
      update conhecimento.mov_chunk set embedding_status = 'failed', embedding_tentativas = embedding_tentativas + 1,
             embedding_erro = 'o provedor devolveu vetor com tamanho diferente de 1024', embedding_tentado_em = now()
       where id = (e->>'id')::uuid;
      continue;
    end if;
    v := (select array_agg(x::float4) from jsonb_array_elements_text(e->'embedding') x)::extensions.vector;
    update conhecimento.mov_chunk set embedding = v, embedding_model = p_modelo, embedding_status = 'ready',
           embedding_tentativas = embedding_tentativas + 1, embedding_erro = null, embedding_tentado_em = now()
     where id = (e->>'id')::uuid;
    n := n + 1;
  end loop;
  return n;
end $$;

-- p_conta = false para cota/limite do provedor (não gasta tentativa: o trecho continua na fila)
create function api.svc_marcar_falha_chunks(p_ids uuid[], p_erro text, p_conta boolean default true) returns void
language sql security definer set search_path = '' as $$
  update conhecimento.mov_chunk
     set embedding_status = case when p_conta then 'failed' else embedding_status end,
         embedding_tentativas = embedding_tentativas + case when p_conta then 1 else 0 end,
         embedding_erro = left(p_erro, 500), embedding_tentado_em = now()
   where id = any (p_ids) and embedding_status <> 'ready' $$;

-- troca de modelo: descarta vetores de outro modelo e volta o trecho para a fila (o texto continua pesquisável)
create function api.svc_preparar_fila(p_empresa uuid, p_modelo text, p_zerar_falhas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; b int := 0;
begin
  update conhecimento.mov_chunk set embedding = null, embedding_model = null, embedding_status = 'pending', embedding_tentativas = 0, embedding_erro = null
   where empresa_id = p_empresa and embedding is not null and embedding_model is distinct from p_modelo;
  get diagnostics a = row_count;
  if p_zerar_falhas then
    update conhecimento.mov_chunk set embedding_status = 'pending', embedding_tentativas = 0, embedding_erro = null
     where empresa_id = p_empresa and embedding_status = 'failed' and embedding_tentativas >= 5;
    get diagnostics b = row_count;
  end if;
  return jsonb_build_object('descartados', a, 'reabertos', b);
end $$;

create function api.svc_registrar_recuperacao(p_empresa uuid, p_usuario uuid, p_pergunta text, p_modo text, p_chunks uuid[], p_latencia int)
returns void language sql security definer set search_path = '' as $$
  insert into conhecimento.log_recuperacao (empresa_id, usuario_id, pergunta, modo, chunk_ids, latencia_ms)
  values (p_empresa, p_usuario, left(coalesce(p_pergunta, ''), 500), p_modo, coalesce(p_chunks, '{}'), p_latencia) $$;

-- ---------------------------------------------------------------- tela Conhecimento passa a existir; o banco também aplica a permissão
update crm.cad_tela set situacao = 'ativa', aplicacao = 'tela_e_banco',
       descricao = 'Documentos e regras que o assistente consulta (busca por texto e por vetor)' where tela = 'conhecimento';

-- ---------------------------------------------------------------- privilégios
revoke all on function conhecimento.norm(text), conhecimento._exigir(uuid, text, text[]) from public, anon, authenticated, service_role;
revoke all on function
  api.listar_fontes(uuid), api.alternar_fonte(uuid, uuid, boolean),
  api.buscar_conhecimento_texto(uuid, text, int), api.buscar_conhecimento_vetor(uuid, extensions.vector, text, int, real),
  api.svc_gravar_fonte(uuid, text, text, text, text, text, text, jsonb, jsonb, uuid),
  api.svc_chunks_pendentes(uuid, int), api.svc_gravar_vetores(jsonb, text), api.svc_marcar_falha_chunks(uuid[], text, boolean),
  api.svc_preparar_fila(uuid, text, boolean), api.svc_registrar_recuperacao(uuid, uuid, text, text, uuid[], int)
  from public, anon, authenticated, service_role;
grant execute on function
  api.listar_fontes(uuid), api.alternar_fonte(uuid, uuid, boolean),
  api.buscar_conhecimento_texto(uuid, text, int), api.buscar_conhecimento_vetor(uuid, extensions.vector, text, int, real)
  to authenticated;
grant execute on function
  api.svc_gravar_fonte(uuid, text, text, text, text, text, text, jsonb, jsonb, uuid),
  api.svc_chunks_pendentes(uuid, int), api.svc_gravar_vetores(jsonb, text), api.svc_marcar_falha_chunks(uuid[], text, boolean),
  api.svc_preparar_fila(uuid, text, boolean), api.svc_registrar_recuperacao(uuid, uuid, text, text, uuid[], int)
  to service_role;
