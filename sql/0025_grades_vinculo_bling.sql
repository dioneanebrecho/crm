-- 0025: tipos de grade configuráveis (tamanhos + atributos por tipo de peça) e vínculo ágil peça CRM <-> produto Bling.
-- PROPOSTA: ainda não aplicada. Ver pedido-mudanca-015-grades-e-vinculo-bling.md.
-- Base: análise do espelho `bling.cad_produto` (25.200 produtos lidos). Nada aqui escreve no Bling (D12).

-- ---------------------------------------------------------------- 1. Correção: vínculo pai -> variação no espelho
-- Hoje `bling.cad_produto.pai_id` está vazio em 100% das linhas: só era preenchido pelo detalhe do pai, e a listagem já traz
-- `idProdutoPai` em 18.141 registros. Sem isso, a tela não lista as variações do produto e o vínculo com a peça não acha os filhos.
create or replace function bling.processar_produtos(p_empresa uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_n int; begin
  insert into bling.cad_produto (empresa_id, bling_id, formato, situacao, codigo, nome_cru, nome_base, ref_fornecedor,
      grade_rotulo_cru, grade_valor_cru, grade_valor_padrao, grade_grupo, grade_ordem_padrao, sufixo_sku_cru,
      preco, custo_cru, descricao_curta_cru, tem_imagem, atualizado_em)
  select p_empresa, r.bling_id, r.payload->>'formato', r.payload->>'situacao', nullif(r.payload->>'codigo',''), r.payload->>'nome',
      nullif(btrim(regexp_replace(regexp_replace(regexp_replace(r.payload->>'nome','(?i)\s*tam:\s*\S+\s*$',''),'^\s*\d+\s*[- ]\s*',''),'\s+',' ','g')),''),
      substring(r.payload->>'nome' from '^\s*(\d+)\s*[- ]'),
      substring(r.payload->>'nome' from '(?i)(tam):\s*\S+\s*$'),
      substring(r.payload->>'nome' from '(?i)tam:\s*(\S+)\s*$'),
      d.valor_padrao, d.grupo, d.ordem,
      substring(r.payload->>'codigo' from '-(\d+)$'),
      nullif(r.payload->>'preco','')::numeric, nullif(r.payload->>'precoCusto','')::numeric,
      nullif(r.payload->>'descricaoCurta',''), coalesce(r.payload->>'imagemURL','') <> '', now()
    from bling.raw_produto r
    left join bling.cfg_dominio_tamanho d on d.valor_cru = upper(btrim(substring(r.payload->>'nome' from '(?i)tam:\s*(\S+)\s*$')))
   where r.empresa_id = p_empresa and r.nivel = 'lista'
  on conflict (empresa_id, bling_id) do update set
      formato=excluded.formato, situacao=excluded.situacao, codigo=excluded.codigo, nome_cru=excluded.nome_cru, nome_base=excluded.nome_base,
      ref_fornecedor=excluded.ref_fornecedor, grade_rotulo_cru=excluded.grade_rotulo_cru, grade_valor_cru=excluded.grade_valor_cru,
      grade_valor_padrao=excluded.grade_valor_padrao, grade_grupo=excluded.grade_grupo, grade_ordem_padrao=excluded.grade_ordem_padrao,
      sufixo_sku_cru=excluded.sufixo_sku_cru, preco=excluded.preco, custo_cru=excluded.custo_cru,
      descricao_curta_cru=excluded.descricao_curta_cru, tem_imagem=excluded.tem_imagem, atualizado_em=now();
  get diagnostics v_n = row_count;

  -- vínculo pai/variação: primeiro o que a listagem informa (idProdutoPai), depois o que o detalhe do pai informa
  update bling.cad_produto c set pai_id = (r.payload->>'idProdutoPai')::bigint
    from bling.raw_produto r
   where r.empresa_id = p_empresa and r.nivel = 'lista' and c.empresa_id = p_empresa and c.bling_id = r.bling_id
     and coalesce(nullif(r.payload->>'idProdutoPai','')::bigint, 0) > 0
     and c.pai_id is distinct from (r.payload->>'idProdutoPai')::bigint;
  update bling.cad_produto c set pai_id = d.bling_id
    from bling.raw_produto d, jsonb_array_elements(coalesce(d.payload->'variacoes','[]'::jsonb)) v
   where d.empresa_id = p_empresa and d.nivel = 'detalhe' and c.empresa_id = p_empresa and c.bling_id = (v->>'id')::bigint
     and c.pai_id is distinct from d.bling_id;

  -- equivalência excluído -> ativo (mesmo código)
  update bling.cad_produto c set id_ativo_equivalente = (
      select min(a.bling_id) from bling.cad_produto a
       where a.empresa_id = c.empresa_id and a.codigo = c.codigo and a.situacao = 'A' and a.bling_id <> c.bling_id)
   where c.empresa_id = p_empresa and c.situacao = 'E';

  update bling.cad_produto c set
    nome_padrao = case when c.nome_base is null then null
                       else c.nome_base || coalesce(' Tam:' || c.grade_valor_padrao, '') end,
    alertas = array_remove(array[
      case when c.situacao='A' and coalesce(c.custo_cru,0)=0 then 'sem_custo' end,
      case when c.situacao='A' and c.custo_cru>0 and c.preco<=c.custo_cru then 'preco_menor_igual_custo' end,
      case when c.grade_valor_cru is not null and c.grade_valor_padrao is null then 'grade_desconhecida' end,
      case when c.formato='S' and c.grade_valor_cru is null then 'sem_grade_no_nome' end,
      case when c.nome_cru ~ '\s\s' then 'espaco_duplo' end,
      case when c.grade_rotulo_cru is not null and c.grade_rotulo_cru <> 'Tam' then 'rotulo_tam_fora_padrao' end,
      case when c.situacao='E' and c.id_ativo_equivalente is not null then 'excluido_com_gemeo_ativo' end
    ], null),
    versao_regra = 'v1'
   where c.empresa_id = p_empresa;
  update bling.cad_produto set status_padronizacao = case when cardinality(alertas)=0 then 'padronizado' else 'revisar' end
   where empresa_id = p_empresa;
  return jsonb_build_object('produtos_processados', v_n);
end $function$;

-- ---------------------------------------------------------------- 2. Configuração de grades (por empresa)
create table catalogo.cfg_tipo_grade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  codigo text not null check (codigo ~ '^[a-z0-9_]{2,40}$'),
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  controla_tamanho boolean not null default true,   -- false para lote/variados: sem controle por tamanho
  ordem int not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create table catalogo.cfg_tipo_grade_valor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  tipo_grade_id uuid not null references catalogo.cfg_tipo_grade(id) on delete cascade,
  valor text not null check (valor ~ '^[A-Z0-9]{1,10}$'),   -- vai para o código da variação e da unidade: sem acento, sem barra
  rotulo text not null,
  ordem int not null default 0,
  sinonimos text[] not null default '{}',                    -- como o valor aparece no Bling (U, UN, ÚNICO...)
  unique (tipo_grade_id, valor)
);
create table catalogo.cfg_tipo_grade_atributo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  tipo_grade_id uuid not null references catalogo.cfg_tipo_grade(id) on delete cascade,
  codigo text not null check (codigo ~ '^[a-z0-9_]{2,30}$'),
  rotulo text not null,
  nivel text not null check (nivel in ('peca','variacao')),   -- peca: vale para a peça toda (cor, material); variacao: por tamanho (medidas)
  tipo_dado text not null check (tipo_dado in ('texto','numero','lista')),
  opcoes text[] not null default '{}',
  unidade text,
  obrigatorio boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (tipo_grade_id, nivel, codigo),
  check (tipo_dado <> 'lista' or cardinality(opcoes) > 0)
);
create table catalogo.cfg_tipo_grade_palavra (
  empresa_id uuid not null references crm.cad_empresa(id),
  tipo_grade_id uuid not null references catalogo.cfg_tipo_grade(id) on delete cascade,
  palavra text not null check (palavra = upper(palavra) and length(palavra) between 2 and 40),
  primary key (tipo_grade_id, palavra)
);
create index tipo_grade_palavra_busca on catalogo.cfg_tipo_grade_palavra (empresa_id, palavra);

alter table catalogo.cad_peca add column tipo_grade_id uuid references catalogo.cfg_tipo_grade(id);
alter table catalogo.cad_peca add column atributos jsonb not null default '{}'::jsonb;
alter table catalogo.cad_variacao add column atributos jsonb not null default '{}'::jsonb;

do $$
declare t text;
begin
  foreach t in array array['cfg_tipo_grade','cfg_tipo_grade_valor','cfg_tipo_grade_atributo','cfg_tipo_grade_palavra'] loop
    execute format('alter table catalogo.%I enable row level security', t);
    execute format('create policy worker_total on catalogo.%I for all to app_worker using (true) with check (true)', t);
    execute format('grant select, insert, update on catalogo.%I to app_worker', t);
  end loop;
end $$;
create trigger auditoria after insert or update or delete on catalogo.cfg_tipo_grade for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on catalogo.cfg_tipo_grade_atributo for each row execute function audit.registrar();

-- ---------------------------------------------------------------- 3. Funções internas
-- Grava um tipo de grade inteiro (cabeçalho, valores, atributos e palavras-chave). Usada pela API e pela carga padrão.
create function catalogo._gravar_tipo_grade(p_empresa uuid, p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_nome text := nullif(btrim(p_dados->>'nome'), ''); v_cod text := nullif(btrim(p_dados->>'codigo'), '');
begin
  if v_nome is null then raise exception 'informe o nome do tipo de grade' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_dados->'valores', '[]'::jsonb)) > 60 or jsonb_array_length(coalesce(p_dados->'atributos', '[]'::jsonb)) > 30
     or jsonb_array_length(coalesce(p_dados->'palavras', '[]'::jsonb)) > 120 then
    raise exception 'limite de itens excedido (60 valores, 30 atributos, 120 palavras)' using errcode = '22023';
  end if;
  if v_id is null then
    if v_cod is null or v_cod !~ '^[a-z0-9_]{2,40}$' then raise exception 'código do tipo inválido (use letras minúsculas, números e _)' using errcode = '22023'; end if;
    insert into catalogo.cfg_tipo_grade (empresa_id, codigo, nome, descricao, controla_tamanho, ordem, ativo)
    values (p_empresa, v_cod, v_nome, nullif(btrim(p_dados->>'descricao'), ''), coalesce((p_dados->>'controla_tamanho')::boolean, true),
            coalesce((p_dados->>'ordem')::int, 100), coalesce((p_dados->>'ativo')::boolean, true))
    returning id into v_id;
  else
    update catalogo.cfg_tipo_grade set nome = v_nome, descricao = nullif(btrim(p_dados->>'descricao'), ''),
           controla_tamanho = coalesce((p_dados->>'controla_tamanho')::boolean, controla_tamanho),
           ordem = coalesce((p_dados->>'ordem')::int, ordem), ativo = coalesce((p_dados->>'ativo')::boolean, ativo), atualizado_em = now()
     where id = v_id and empresa_id = p_empresa;
    if not found then raise exception 'tipo de grade não encontrado' using errcode = 'P0002'; end if;
  end if;

  -- valores
  delete from catalogo.cfg_tipo_grade_valor where tipo_grade_id = v_id
     and valor <> all (select upper(btrim(e->>'valor')) from jsonb_array_elements(coalesce(p_dados->'valores', '[]'::jsonb)) e);
  insert into catalogo.cfg_tipo_grade_valor (empresa_id, tipo_grade_id, valor, rotulo, ordem, sinonimos)
  select p_empresa, v_id, upper(btrim(e.obj->>'valor')), coalesce(nullif(btrim(e.obj->>'rotulo'), ''), upper(btrim(e.obj->>'valor'))),
         coalesce((e.obj->>'ordem')::int, e.n::int),
         coalesce(array(select upper(btrim(s)) from jsonb_array_elements_text(coalesce(e.obj->'sinonimos', '[]'::jsonb)) s where btrim(s) <> ''), '{}')
    from jsonb_array_elements(coalesce(p_dados->'valores', '[]'::jsonb)) with ordinality e(obj, n)
  on conflict (tipo_grade_id, valor) do update set rotulo = excluded.rotulo, ordem = excluded.ordem, sinonimos = excluded.sinonimos;

  -- atributos (o que sai da lista fica inativo: os valores já gravados nas peças continuam no histórico)
  update catalogo.cfg_tipo_grade_atributo set ativo = false where tipo_grade_id = v_id
     and (nivel, codigo) not in (select e->>'nivel', e->>'codigo' from jsonb_array_elements(coalesce(p_dados->'atributos', '[]'::jsonb)) e);
  insert into catalogo.cfg_tipo_grade_atributo (empresa_id, tipo_grade_id, codigo, rotulo, nivel, tipo_dado, opcoes, unidade, obrigatorio, ordem, ativo)
  select p_empresa, v_id, e.obj->>'codigo', btrim(e.obj->>'rotulo'), e.obj->>'nivel', coalesce(e.obj->>'tipo_dado', 'texto'),
         coalesce(array(select btrim(o) from jsonb_array_elements_text(coalesce(e.obj->'opcoes', '[]'::jsonb)) o where btrim(o) <> ''), '{}'),
         nullif(btrim(e.obj->>'unidade'), ''), coalesce((e.obj->>'obrigatorio')::boolean, false), coalesce((e.obj->>'ordem')::int, e.n::int), true
    from jsonb_array_elements(coalesce(p_dados->'atributos', '[]'::jsonb)) with ordinality e(obj, n)
  on conflict (tipo_grade_id, nivel, codigo) do update set rotulo = excluded.rotulo, tipo_dado = excluded.tipo_dado, opcoes = excluded.opcoes,
         unidade = excluded.unidade, obrigatorio = excluded.obrigatorio, ordem = excluded.ordem, ativo = true;

  -- palavras-chave (sugerem o tipo pelo nome da peça)
  delete from catalogo.cfg_tipo_grade_palavra where tipo_grade_id = v_id;
  insert into catalogo.cfg_tipo_grade_palavra (empresa_id, tipo_grade_id, palavra)
  select distinct p_empresa, v_id, upper(btrim(p)) from jsonb_array_elements_text(coalesce(p_dados->'palavras', '[]'::jsonb)) p where btrim(p) <> '';
  return v_id;
exception when unique_violation then
  raise exception 'já existe um tipo com esse código, ou um valor/atributo repetido na lista' using errcode = '23505';
end $$;

-- Valida e normaliza os atributos de uma peça (nivel = 'peca') ou de uma variação (nivel = 'variacao') contra o tipo de grade.
create function catalogo._validar_atributos(p_tipo uuid, p_nivel text, p_attrs jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare a record; v text; res jsonb := '{}'::jsonb; k text;
begin
  p_attrs := coalesce(p_attrs, '{}'::jsonb);
  if jsonb_typeof(p_attrs) <> 'object' then raise exception 'atributos inválidos' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_attrs) loop
    if not exists (select 1 from catalogo.cfg_tipo_grade_atributo d where d.tipo_grade_id = p_tipo and d.nivel = p_nivel and d.codigo = k and d.ativo) then
      raise exception 'o atributo "%" não existe neste tipo de grade', k using errcode = '22023';
    end if;
  end loop;
  for a in select * from catalogo.cfg_tipo_grade_atributo d where d.tipo_grade_id = p_tipo and d.nivel = p_nivel and d.ativo order by d.ordem loop
    v := nullif(btrim(p_attrs->>a.codigo), '');
    if v is null then
      if a.obrigatorio then raise exception 'informe: %', a.rotulo using errcode = '22023'; end if;
      continue;
    end if;
    if length(v) > 120 then raise exception '% é longo demais', a.rotulo using errcode = '22023'; end if;
    if a.tipo_dado = 'numero' then
      begin
        res := res || jsonb_build_object(a.codigo, replace(v, ',', '.')::numeric);
      exception when others then
        raise exception '% deve ser um número', a.rotulo using errcode = '22023';
      end;
    elsif a.tipo_dado = 'lista' then
      if not (v = any (a.opcoes)) then raise exception '% deve ser uma das opções da lista', a.rotulo using errcode = '22023'; end if;
      res := res || jsonb_build_object(a.codigo, v);
    else
      res := res || jsonb_build_object(a.codigo, v);
    end if;
  end loop;
  return res;
end $$;

-- Carga padrão: os tipos que a análise do histórico do Bling mostrou (ver o pedido de mudança 015). Só roda em empresa sem nenhum tipo.
create function catalogo._semear_grades(p_empresa uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_roupa_pecas jsonb := '[{"codigo":"cor","rotulo":"Cor","nivel":"peca","tipo_dado":"texto","obrigatorio":true},
                           {"codigo":"tecido","rotulo":"Tecido / composição","nivel":"peca","tipo_dado":"texto"}]'::jsonb;
  v_roupa_medidas jsonb := '[{"codigo":"busto","rotulo":"Busto","nivel":"variacao","tipo_dado":"numero","unidade":"cm"},
                             {"codigo":"cintura","rotulo":"Cintura","nivel":"variacao","tipo_dado":"numero","unidade":"cm"},
                             {"codigo":"quadril","rotulo":"Quadril","nivel":"variacao","tipo_dado":"numero","unidade":"cm"},
                             {"codigo":"comprimento","rotulo":"Comprimento","nivel":"variacao","tipo_dado":"numero","unidade":"cm"}]'::jsonb;
begin
  if exists (select 1 from catalogo.cfg_tipo_grade where empresa_id = p_empresa) then return; end if;

  perform catalogo._gravar_tipo_grade(p_empresa, null, jsonb_build_object(
    'codigo', 'roupa_letras', 'nome', 'Roupa · letras', 'ordem', 10,
    'descricao', 'Blusas, vestidos, conjuntos, moda praia e íntimos com PP a XG. É o tipo mais comum no histórico (cerca de 6,5 mil variações).',
    'valores', (select jsonb_agg(jsonb_build_object('valor', v, 'rotulo', v, 'ordem', o, 'sinonimos', case when v = 'XG' then jsonb_build_array('EXG','XXG') else '[]'::jsonb end)) from unnest(array['PP','P','M','G','GG','XG']) with ordinality u(v, o)),
    'atributos', v_roupa_pecas || v_roupa_medidas, 'palavras', '[]'::jsonb));

  perform catalogo._gravar_tipo_grade(p_empresa, null, jsonb_build_object(
    'codigo', 'roupa_numeracao', 'nome', 'Roupa · numeração', 'ordem', 20,
    'descricao', 'Calças, saias, shorts e vestidos com 34 a 48 (só números pares no histórico).',
    'valores', (select jsonb_agg(jsonb_build_object('valor', n::text, 'rotulo', n::text, 'ordem', n)) from generate_series(34, 48, 2) n),
    'atributos', v_roupa_pecas || v_roupa_medidas, 'palavras', '[]'::jsonb));

  perform catalogo._gravar_tipo_grade(p_empresa, null, jsonb_build_object(
    'codigo', 'calcado', 'nome', 'Calçado · numeração', 'ordem', 30,
    'descricao', 'Tênis, sandálias, botas e sapatos: numeração 33 a 43, com medida da palmilha. No histórico aparecem números ímpares (33, 35, 37, 39), que não existem em roupa.',
    'valores', (select jsonb_agg(jsonb_build_object('valor', n::text, 'rotulo', n::text, 'ordem', n)) from generate_series(33, 43) n),
    'atributos', '[{"codigo":"cor","rotulo":"Cor","nivel":"peca","tipo_dado":"texto","obrigatorio":true},
                   {"codigo":"modelo","rotulo":"Modelo","nivel":"peca","tipo_dado":"lista","opcoes":["Tênis","Sandália","Rasteira","Sapatilha","Scarpin","Bota","Mocassim","Mule","Papete","Chinelo","Tamanco","Outro"]},
                   {"codigo":"material","rotulo":"Material","nivel":"peca","tipo_dado":"lista","opcoes":["Couro","Sintético","Tecido","Borracha","Camurça","Outro"]},
                   {"codigo":"salto","rotulo":"Altura do salto","nivel":"peca","tipo_dado":"numero","unidade":"cm"},
                   {"codigo":"palmilha","rotulo":"Comprimento da palmilha","nivel":"variacao","tipo_dado":"numero","unidade":"cm"}]'::jsonb,
    'palavras', jsonb_build_array('TÊNIS','TENIS','SAPATO','SAPATILHA','SANDÁLIA','SANDALIA','RASTEIRA','CHINELO','MELISSA','BOTA','BOTAS','MULE','MOCASSIM',
                                  'PAPETE','SCARPIN','ANABELA','SLIDE','OXFORD','COTURNO','SAPATENIS','TAMANCO','ALPARGATA','CALÇADOS','CALCADOS')));

  perform catalogo._gravar_tipo_grade(p_empresa, null, jsonb_build_object(
    'codigo', 'infantil', 'nome', 'Infantil · idade', 'ordem', 40,
    'descricao', 'Roupa infantil por idade: 1 a 16 (58 casos no histórico).',
    'valores', (select jsonb_agg(jsonb_build_object('valor', n::text, 'rotulo', n::text, 'ordem', n)) from unnest(array[1,2,3,4,6,8,10,12,14,16]) n),
    'atributos', v_roupa_pecas || '[{"codigo":"altura","rotulo":"Altura indicada","nivel":"variacao","tipo_dado":"numero","unidade":"cm"}]'::jsonb,
    'palavras', '[]'::jsonb));

  perform catalogo._gravar_tipo_grade(p_empresa, null, jsonb_build_object(
    'codigo', 'plus_size', 'nome', 'Plus size', 'ordem', 50,
    'descricao', 'EXG, G1 a G3 e 50 a 54. Hoje caem em "tamanho fora da lista" no espelho do Bling (cerca de 20 casos).',
    'valores', jsonb_build_array(
      jsonb_build_object('valor','EXG','rotulo','EXG','ordem',1), jsonb_build_object('valor','G1','rotulo','G1','ordem',2),
      jsonb_build_object('valor','G2','rotulo','G2','ordem',3), jsonb_build_object('valor','G3','rotulo','G3','ordem',4),
      jsonb_build_object('valor','50','rotulo','50','ordem',5), jsonb_build_object('valor','52','rotulo','52','ordem',6), jsonb_build_object('valor','54','rotulo','54','ordem',7)),
    'atributos', v_roupa_pecas || v_roupa_medidas, 'palavras', '[]'::jsonb));

  perform catalogo._gravar_tipo_grade(p_empresa, null, jsonb_build_object(
    'codigo', 'acessorio', 'nome', 'Acessório · tamanho único', 'ordem', 60,
    'descricao', 'Bolsas, cintos, óculos, brincos, colares e similares: um único tamanho (cerca de 600 casos).',
    'valores', jsonb_build_array(jsonb_build_object('valor','UNICO','rotulo','Único','ordem',1,'sinonimos', jsonb_build_array('U','UN','ÚNICO'))),
    'atributos', '[{"codigo":"cor","rotulo":"Cor","nivel":"peca","tipo_dado":"texto","obrigatorio":true},
                   {"codigo":"material","rotulo":"Material","nivel":"peca","tipo_dado":"texto"},
                   {"codigo":"largura","rotulo":"Largura","nivel":"peca","tipo_dado":"numero","unidade":"cm"},
                   {"codigo":"altura","rotulo":"Altura","nivel":"peca","tipo_dado":"numero","unidade":"cm"},
                   {"codigo":"profundidade","rotulo":"Profundidade","nivel":"peca","tipo_dado":"numero","unidade":"cm"},
                   {"codigo":"alca","rotulo":"Comprimento da alça","nivel":"peca","tipo_dado":"numero","unidade":"cm"}]'::jsonb,
    'palavras', jsonb_build_array('BOLSA','CINTO','ÓCULOS','OCULOS','BRINCO','BRINCOS','COLAR','CARTEIRA','CLUTCH','BRACELETE','MOCHILA','NECESSAIRE',
                                  'NECESSAIR','ANEL','PULSEIRA','LENÇO','ARMAÇÃO','RELÓGIO','RELOGIO','CHAPÉU','BONÉ','LUVA','TIARA')));

  perform catalogo._gravar_tipo_grade(p_empresa, null, jsonb_build_object(
    'codigo', 'lote', 'nome', 'Lote / variados', 'ordem', 70, 'controla_tamanho', false,
    'descricao', 'Itens vendidos em lote, sem controle por tamanho (cerca de mil casos no histórico).',
    'valores', jsonb_build_array(jsonb_build_object('valor','VARIADOS','rotulo','Variados','ordem',1,'sinonimos', jsonb_build_array('VARIADO','DIVERSOS','VARIEDADES','VARIADA','VARIEDOS'))),
    'atributos', '[{"codigo":"qtd_pecas","rotulo":"Quantidade de peças no lote","nivel":"peca","tipo_dado":"numero"}]'::jsonb,
    'palavras', jsonb_build_array('LOTE')));
end $$;

select catalogo._semear_grades(id) from crm.cad_empresa;

-- ---------------------------------------------------------------- 4. API: configuração de grades
create function api.listar_tipos_grade(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'codigo', t.codigo, 'nome', t.nome, 'descricao', t.descricao, 'controla_tamanho', t.controla_tamanho, 'ordem', t.ordem, 'ativo', t.ativo,
      'em_uso', (select count(*) from catalogo.cad_peca p where p.tipo_grade_id = t.id),
      'valores', coalesce((select jsonb_agg(jsonb_build_object('valor', v.valor, 'rotulo', v.rotulo, 'ordem', v.ordem, 'sinonimos', v.sinonimos) order by v.ordem, v.valor)
                             from catalogo.cfg_tipo_grade_valor v where v.tipo_grade_id = t.id), '[]'::jsonb),
      'atributos', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'rotulo', a.rotulo, 'nivel', a.nivel, 'tipo_dado', a.tipo_dado,
                                                                  'opcoes', a.opcoes, 'unidade', a.unidade, 'obrigatorio', a.obrigatorio, 'ordem', a.ordem) order by a.nivel, a.ordem)
                               from catalogo.cfg_tipo_grade_atributo a where a.tipo_grade_id = t.id and a.ativo), '[]'::jsonb),
      'palavras', coalesce((select jsonb_agg(w.palavra order by w.palavra) from catalogo.cfg_tipo_grade_palavra w where w.tipo_grade_id = t.id), '[]'::jsonb)
    ) order by t.ordem, t.nome)
    from catalogo.cfg_tipo_grade t where t.empresa_id = p_empresa), '[]'::jsonb);
end $$;

create function api.salvar_tipo_grade(p_empresa uuid, p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  return catalogo._gravar_tipo_grade(p_empresa, p_id, p_dados);
end $$;

create function api.semear_grades_padrao(p_empresa uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin']);
  perform catalogo._semear_grades(p_empresa);
end $$;

-- Sugere o tipo de grade pela primeira palavra do nome (ex.: "BOLSA ..." -> acessório). Sem palavra conhecida, devolve null.
create function api.sugerir_tipo_grade(p_empresa uuid, p_nome text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_w text := upper(split_part(btrim(coalesce(p_nome, '')), ' ', 1));
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  return (select w.tipo_grade_id from catalogo.cfg_tipo_grade_palavra w join catalogo.cfg_tipo_grade t on t.id = w.tipo_grade_id and t.ativo
           where w.empresa_id = p_empresa and w.palavra = v_w limit 1);
end $$;

-- ---------------------------------------------------------------- 5. API: tipo de grade e atributos da peça e das variações
create function api.definir_grade_peca(p_empresa uuid, p_peca uuid, p_tipo uuid, p_atributos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_attr jsonb := '{}'::jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if p_tipo is not null then
    if not exists (select 1 from catalogo.cfg_tipo_grade where id = p_tipo and empresa_id = p_empresa and ativo) then
      raise exception 'tipo de grade não encontrado ou inativo' using errcode = 'P0002';
    end if;
    v_attr := catalogo._validar_atributos(p_tipo, 'peca', p_atributos);
  end if;
  update catalogo.cad_peca set tipo_grade_id = p_tipo, atributos = v_attr, atualizado_em = now() where id = p_peca and empresa_id = p_empresa;
  if not found then raise exception 'peça não encontrada' using errcode = 'P0002'; end if;
end $$;

create function api.salvar_atributos_variacao(p_empresa uuid, p_variacao uuid, p_atributos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tipo uuid;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  select p.tipo_grade_id into v_tipo from catalogo.cad_variacao va join catalogo.cad_peca p on p.id = va.peca_id
   where va.id = p_variacao and va.empresa_id = p_empresa;
  if not found then raise exception 'variação não encontrada' using errcode = 'P0002'; end if;
  if v_tipo is null then raise exception 'escolha o tipo de grade da peça antes de informar medidas' using errcode = '22023'; end if;
  update catalogo.cad_variacao set atributos = catalogo._validar_atributos(v_tipo, 'variacao', p_atributos) where id = p_variacao;
end $$;

-- obter_peca passa a devolver tipo de grade, atributos e vínculo com o Bling (o resto do retorno não muda)
create or replace function api.obter_peca(p_empresa uuid, p_peca uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_custo boolean; v_res jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_custo := (select api.tem_papel(p_empresa, array['admin','gestor','financeiro']));
  select jsonb_build_object(
    'peca', jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nome', p.nome, 'descricao', p.descricao, 'categoria', p.categoria,
              'marca', p.marca, 'condicao', p.condicao, 'custo', case when v_custo then p.custo end,
              'preco_tabela', p.preco_tabela, 'fotos', p.fotos, 'atualizado_em', p.atualizado_em,
              'tipo_grade_id', p.tipo_grade_id, 'atributos', p.atributos, 'bling_produto_id', p.bling_produto_id),
    'bling', (select jsonb_build_object('bling_id', b.bling_id, 'codigo', b.codigo, 'nome', coalesce(b.nome_padrao, b.nome_cru), 'situacao', b.situacao)
                from bling.cad_produto b where b.empresa_id = p_empresa and b.bling_id = p.bling_produto_id),
    'variacoes', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'tamanho', v.tamanho, 'codigo', v.codigo, 'atributos', v.atributos, 'bling_variacao_id', v.bling_variacao_id,
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

-- ---------------------------------------------------------------- 6. API: vínculo ágil com o produto do Bling (somente leitura do espelho; nada é gravado no Bling)
-- Busca produtos do Bling (pai ou simples, ativos) por nome-base, código (SKU) ou referência do fornecedor, com os tamanhos das variações.
create function api.sugerir_produtos_bling(p_empresa uuid, p_busca text, p_limite int default 8)
returns table (bling_id bigint, codigo text, nome text, ref_fornecedor text, preco numeric, tamanhos text[], qtd_variacoes int, ja_vinculado boolean, motivo text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_t text := nullif(btrim(coalesce(p_busca, '')), ''); v_like text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  if v_t is null or length(v_t) < 2 then return; end if;
  v_like := '%' || regexp_replace(v_t, '([\\%_])', '\\\1', 'g') || '%';
  return query
    select c.bling_id, c.codigo, coalesce(c.nome_base, c.nome_cru), c.ref_fornecedor, c.preco,
           coalesce((select array_agg(distinct f.grade_valor_padrao order by f.grade_valor_padrao) from bling.cad_produto f
                      where f.empresa_id = p_empresa and f.pai_id = c.bling_id and f.situacao = 'A' and f.grade_valor_padrao is not null), '{}'),
           (select count(*)::int from bling.cad_produto f where f.empresa_id = p_empresa and f.pai_id = c.bling_id and f.situacao = 'A'),
           exists (select 1 from catalogo.cad_peca p where p.empresa_id = p_empresa and p.bling_produto_id = c.bling_id),
           case when c.codigo = v_t then 'código igual' when c.ref_fornecedor = v_t then 'referência igual'
                when upper(coalesce(c.nome_base, '')) like upper(regexp_replace(v_t, '([\\%_])', '\\\1', 'g')) || '%' then 'nome começa igual' else 'nome parecido' end
      from bling.cad_produto c
     where c.empresa_id = p_empresa and c.situacao = 'A' and c.pai_id is null and c.formato in ('V', 'S')
       and (c.codigo = v_t or c.ref_fornecedor = v_t or coalesce(c.nome_base, c.nome_cru) ilike v_like)
     order by (c.codigo = v_t) desc, (c.ref_fornecedor = v_t) desc, (c.nome_base ilike regexp_replace(v_t, '([\\%_])', '\\\1', 'g') || '%') desc, c.nome_base
     limit least(greatest(coalesce(p_limite, 8), 1), 20);
end $$;

-- Vincula (ou, com p_bling_id nulo, desvincula) a peça a um produto do Bling. As variações da peça são casadas com as do Bling pelo tamanho
-- (UNICO <-> U). Peça com uma só variação ligada a produto simples (sem filhos) usa o próprio produto.
create function api.vincular_peca_bling(p_empresa uuid, p_peca uuid, p_bling_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_filhos int; v_vinc int := 0; v_sem text[] := '{}'; v_sobra text[]; r record; v_filho bigint;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if not exists (select 1 from catalogo.cad_peca where id = p_peca and empresa_id = p_empresa) then raise exception 'peça não encontrada' using errcode = 'P0002'; end if;
  if p_bling_id is null then
    update catalogo.cad_variacao set bling_variacao_id = null where peca_id = p_peca and empresa_id = p_empresa;
    update catalogo.cad_peca set bling_produto_id = null, atualizado_em = now() where id = p_peca;
    return jsonb_build_object('vinculado', false);
  end if;
  if not exists (select 1 from bling.cad_produto where empresa_id = p_empresa and bling_id = p_bling_id and situacao = 'A') then
    raise exception 'produto do Bling não encontrado ou excluído' using errcode = 'P0002';
  end if;
  if exists (select 1 from catalogo.cad_peca where empresa_id = p_empresa and bling_produto_id = p_bling_id and id <> p_peca) then
    raise exception 'esse produto do Bling já está vinculado a outra peça' using errcode = '23505';
  end if;
  update catalogo.cad_peca set bling_produto_id = p_bling_id, atualizado_em = now() where id = p_peca;
  select count(*) into v_filhos from bling.cad_produto where empresa_id = p_empresa and pai_id = p_bling_id and situacao = 'A';
  for r in select id, tamanho from catalogo.cad_variacao where peca_id = p_peca and empresa_id = p_empresa loop
    if v_filhos = 0 then
      -- produto simples: só casa quando a peça tem uma variação
      if (select count(*) from catalogo.cad_variacao where peca_id = p_peca) = 1 then
        update catalogo.cad_variacao set bling_variacao_id = p_bling_id where id = r.id; v_vinc := v_vinc + 1;
      else v_sem := v_sem || r.tamanho; end if;
    else
      select min(f.bling_id) into v_filho from bling.cad_produto f
       where f.empresa_id = p_empresa and f.pai_id = p_bling_id and f.situacao = 'A'
         and f.grade_valor_padrao = case when r.tamanho = 'UNICO' then 'U' else r.tamanho end;
      if v_filho is null then v_sem := v_sem || r.tamanho;
      else update catalogo.cad_variacao set bling_variacao_id = v_filho where id = r.id; v_vinc := v_vinc + 1; end if;
    end if;
  end loop;
  select coalesce(array_agg(f.grade_valor_padrao), '{}') into v_sobra from bling.cad_produto f
   where f.empresa_id = p_empresa and f.pai_id = p_bling_id and f.situacao = 'A' and f.grade_valor_padrao is not null
     and not exists (select 1 from catalogo.cad_variacao va where va.peca_id = p_peca and va.bling_variacao_id = f.bling_id);
  return jsonb_build_object('vinculado', true, 'variacoes_vinculadas', v_vinc, 'tamanhos_da_peca_sem_par_no_bling', to_jsonb(v_sem), 'tamanhos_do_bling_sem_par_na_peca', to_jsonb(v_sobra));
end $$;

-- Cria a peça no CRM a partir de um produto do Bling já lido (o caminho mais rápido para trazer o que existe): copia nome-base, preço, custo e as
-- variações (tamanho padronizado), liga tudo pelos IDs do Bling e aplica o tipo de grade escolhido. Não cria unidades (o saldo continua no Bling).
create function api.criar_peca_de_produto_bling(p_empresa uuid, p_bling_id bigint, p_tipo uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b record; v_peca uuid; v_cod text; r record; v_tam text; v_n int := 0; v_avisos text[] := '{}'; v_filhos int; v_sizes text[];
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  select * into b from bling.cad_produto where empresa_id = p_empresa and bling_id = p_bling_id and situacao = 'A' and pai_id is null;
  if not found then raise exception 'produto do Bling não encontrado, excluído ou é uma variação (escolha o produto pai)' using errcode = 'P0002'; end if;
  if exists (select 1 from catalogo.cad_peca where empresa_id = p_empresa and bling_produto_id = p_bling_id) then
    raise exception 'esse produto do Bling já está vinculado a uma peça' using errcode = '23505';
  end if;
  if p_tipo is not null and not exists (select 1 from catalogo.cfg_tipo_grade where id = p_tipo and empresa_id = p_empresa and ativo) then
    raise exception 'tipo de grade não encontrado ou inativo' using errcode = 'P0002';
  end if;
  v_cod := coalesce(b.codigo, 'B' || b.bling_id::text);
  if exists (select 1 from catalogo.cad_peca where empresa_id = p_empresa and codigo = v_cod) then
    raise exception 'já existe uma peça com o código %; vincule a peça existente em vez de criar outra', v_cod using errcode = '23505';
  end if;
  insert into catalogo.cad_peca (empresa_id, codigo, nome, preco_tabela, custo, bling_produto_id, tipo_grade_id, condicao)
  values (p_empresa, v_cod, coalesce(b.nome_base, b.nome_cru), b.preco, nullif(b.custo_cru, 0), b.bling_id, p_tipo, 'nova') returning id into v_peca;
  select count(*) into v_filhos from bling.cad_produto where empresa_id = p_empresa and pai_id = b.bling_id and situacao = 'A';
  if v_filhos = 0 then
    insert into catalogo.cad_variacao (empresa_id, peca_id, tamanho, codigo, bling_variacao_id) values (p_empresa, v_peca, 'UNICO', v_cod || '-UNICO', b.bling_id);
    v_n := 1;
  else
    for r in select f.bling_id, f.grade_valor_padrao, f.grade_valor_cru from bling.cad_produto f
              where f.empresa_id = p_empresa and f.pai_id = b.bling_id and f.situacao = 'A' order by f.grade_ordem_padrao nulls last, f.bling_id loop
      v_tam := case when r.grade_valor_padrao = 'U' then 'UNICO' else r.grade_valor_padrao end;
      if v_tam is null then v_avisos := v_avisos || ('variação ' || r.bling_id || ' sem tamanho padronizado (' || coalesce(r.grade_valor_cru, 'sem tamanho no nome') || ')'); continue; end if;
      if v_tam = any (coalesce(v_sizes, '{}')) then v_avisos := v_avisos || ('tamanho ' || v_tam || ' repetido no Bling (variação ' || r.bling_id || ')'); continue; end if;
      v_sizes := coalesce(v_sizes, '{}') || v_tam;
      insert into catalogo.cad_variacao (empresa_id, peca_id, tamanho, codigo, bling_variacao_id) values (p_empresa, v_peca, v_tam, v_cod || '-' || v_tam, r.bling_id);
      v_n := v_n + 1;
    end loop;
  end if;
  return jsonb_build_object('peca_id', v_peca, 'variacoes_criadas', v_n, 'avisos', to_jsonb(v_avisos));
end $$;

-- ---------------------------------------------------------------- 7. Tela "Grades" no menu Configuração e permissões
insert into crm.cad_tela (tela, rotulo, grupo, ordem, situacao, nivel_max, aplicacao, descricao)
values ('grades', 'Grades e atributos', 'Configuração', 205, 'ativa', 'editar', 'tela', 'Tipos de grade (tamanhos) e atributos por tipo de peça: calçado, roupa, acessório…')
on conflict (tela) do nothing;
insert into crm.cfg_permissao_tela (empresa_id, tela, papel, nivel)
select e.id, 'grades', r.papel, case r.papel when 'gestor' then 'editar' else 'ver' end
  from crm.cad_empresa e cross join unnest(array['gestor','suporte','apresentadora','expedicao','financeiro','leitura']) r(papel)
on conflict do nothing;

-- ---------------------------------------------------------------- 8. Privilégios
revoke all on function catalogo._gravar_tipo_grade(uuid, uuid, jsonb), catalogo._validar_atributos(uuid, text, jsonb), catalogo._semear_grades(uuid) from public, anon, authenticated;
revoke all on function api.listar_tipos_grade(uuid), api.salvar_tipo_grade(uuid, uuid, jsonb), api.semear_grades_padrao(uuid), api.sugerir_tipo_grade(uuid, text),
  api.definir_grade_peca(uuid, uuid, uuid, jsonb), api.salvar_atributos_variacao(uuid, uuid, jsonb), api.obter_peca(uuid, uuid),
  api.sugerir_produtos_bling(uuid, text, int), api.vincular_peca_bling(uuid, uuid, bigint), api.criar_peca_de_produto_bling(uuid, bigint, uuid)
  from public, anon, authenticated;
grant execute on function api.listar_tipos_grade(uuid), api.salvar_tipo_grade(uuid, uuid, jsonb), api.semear_grades_padrao(uuid), api.sugerir_tipo_grade(uuid, text),
  api.definir_grade_peca(uuid, uuid, uuid, jsonb), api.salvar_atributos_variacao(uuid, uuid, jsonb), api.obter_peca(uuid, uuid),
  api.sugerir_produtos_bling(uuid, text, int), api.vincular_peca_bling(uuid, uuid, bigint), api.criar_peca_de_produto_bling(uuid, bigint, uuid)
  to authenticated;
