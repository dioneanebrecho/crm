-- 0095b (pedido 050): APIs do fluxo do processo. Ler e comentar: nível ver na tela 'fluxo'. Editar etapa, registrar e
-- restaurar revisão e resolver comentário: nível editar (o autor também pode resolver o próprio comentário).

create or replace function crm._fluxo_exigir(p_empresa uuid, p_nivel text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_empresa is null or crm._rank_nivel(api.nivel_tela(p_empresa, 'fluxo')) < crm._rank_nivel(p_nivel) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
end $$;

-- todas as etapas (ativas e inativas), na ordem: é a cópia guardada em cada revisão
create or replace function crm._fluxo_copia(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', e.codigo, 'ordem', e.ordem, 'fase', e.fase, 'area', e.area, 'titulo', e.titulo,
      'responsavel', e.responsavel, 'apoio', to_jsonb(e.apoio), 'tela', e.tela, 'entrada', e.entrada,
      'procedimento', to_jsonb(e.procedimento), 'entrega', e.entrega, 'impacto', e.impacto, 'regras', e.regras,
      'situacao', e.situacao, 'ativa', e.ativa) order by e.ordem, e.codigo), '[]'::jsonb)
    from crm.cad_fluxo_etapa e where e.empresa_id = p_empresa
$$;

create or replace function crm._fluxo_proxima_versao(p_empresa uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select split_part(versao, '.', 1) || '.' || (split_part(versao, '.', 2)::int + 1)
                     from crm.log_fluxo_revisao where empresa_id = p_empresa
                    order by split_part(versao, '.', 1)::int desc, split_part(versao, '.', 2)::int desc limit 1), '1.0')
$$;

create or replace function crm._fluxo_revisar(p_empresa uuid, p_descricao text, p_etapas text[], p_tipo text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := crm._fluxo_proxima_versao(p_empresa);
begin
  insert into crm.log_fluxo_revisao (empresa_id, versao, descricao, etapas, tipo, copia, criado_por)
  values (p_empresa, v, governanca.mascarar(btrim(p_descricao)), coalesce(p_etapas, '{}'), p_tipo, crm._fluxo_copia(p_empresa), (select auth.uid()));
  return v;
end $$;

-- grava funções e etapas a partir de um jsonb {funcoes:[...], etapas:[...]}
create or replace function crm._fluxo_carregar(p_empresa uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into crm.cad_fluxo_funcao (empresa_id, codigo, nome, descricao, ordem)
  select p_empresa, f ->> 'codigo', f ->> 'nome', coalesce(f ->> 'descricao', ''), coalesce((f ->> 'ordem')::int, 0)
    from jsonb_array_elements(p -> 'funcoes') f
  on conflict (empresa_id, codigo) do nothing;
  insert into crm.cad_fluxo_etapa (empresa_id, codigo, ordem, fase, area, titulo, responsavel, apoio, tela, entrada, procedimento, entrega, impacto, regras, situacao)
  select p_empresa, e ->> 'codigo', (e ->> 'ordem')::int, (e ->> 'fase')::int, e ->> 'area', e ->> 'titulo', e ->> 'responsavel',
         array(select jsonb_array_elements_text(e -> 'apoio')), coalesce(e ->> 'tela', ''), coalesce(e ->> 'entrada', ''),
         array(select jsonb_array_elements_text(e -> 'procedimento')), coalesce(e ->> 'entrega', ''), coalesce(e ->> 'impacto', ''),
         coalesce(e ->> 'regras', ''), e ->> 'situacao'
    from jsonb_array_elements(p -> 'etapas') e
  on conflict (empresa_id, codigo) do nothing;
end $$;

create or replace function api.fluxo_revisao_copia(p_empresa uuid, p_revisao uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform crm._fluxo_exigir(p_empresa, 'ver');
  select copia into v from crm.log_fluxo_revisao where id = p_revisao and empresa_id = p_empresa;
  if v is null then raise exception 'revisão não encontrada' using errcode = 'P0002'; end if;
  return v;
end $$;

-- inclui (sem código) ou altera uma etapa; cada alteração gera revisão com a descrição informada
create or replace function api.fluxo_etapa_salvar(p_empresa uuid, p_etapa jsonb, p_descricao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cod text := nullif(btrim(coalesce(p_etapa ->> 'codigo', '')), '');
  v_antes crm.cad_fluxo_etapa; v_id uuid; v_ordem int; v_total int; v_resp text; v_apoio text[]; v_proc text[];
  v_copia_antes jsonb; v_versao text;
begin
  perform crm._fluxo_exigir(p_empresa, 'editar');
  if length(btrim(coalesce(p_descricao, ''))) < 3 then raise exception 'descreva o que mudou e por quê' using errcode = '22023'; end if;
  v_resp := p_etapa ->> 'responsavel';
  if not exists (select 1 from crm.cad_fluxo_funcao where empresa_id = p_empresa and codigo = v_resp and ativa) then
    raise exception 'papel responsável inválido' using errcode = '22023';
  end if;
  v_apoio := array(select distinct x from jsonb_array_elements_text(coalesce(p_etapa -> 'apoio', '[]')) x where x <> v_resp);
  if exists (select 1 from unnest(v_apoio) a where not exists (select 1 from crm.cad_fluxo_funcao f where f.empresa_id = p_empresa and f.codigo = a and f.ativa)) then
    raise exception 'papel de apoio inválido' using errcode = '22023';
  end if;
  v_proc := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_etapa -> 'procedimento', '[]')) with ordinality t(x, i) where btrim(x) <> '' order by i);
  if cardinality(v_proc) = 0 then raise exception 'informe ao menos um passo do procedimento' using errcode = '22023'; end if;
  select count(*) into v_total from crm.cad_fluxo_etapa where empresa_id = p_empresa;
  v_ordem := greatest(1, least(coalesce((p_etapa ->> 'ordem')::int, v_total + 1), v_total + case when v_cod is null then 1 else 0 end));
  v_copia_antes := crm._fluxo_copia(p_empresa);

  if v_cod is null then
    select 'E' || lpad((coalesce(max(substr(codigo, 2)::int), 0) + 1)::text, 2, '0') into v_cod from crm.cad_fluxo_etapa where empresa_id = p_empresa;
    update crm.cad_fluxo_etapa set ordem = ordem + 1 where empresa_id = p_empresa and ordem >= v_ordem;
    insert into crm.cad_fluxo_etapa (empresa_id, codigo, ordem, fase, area, titulo, responsavel, apoio, tela, entrada, procedimento, entrega, impacto, regras, situacao, ativa, atualizado_por)
    values (p_empresa, v_cod, v_ordem, (p_etapa ->> 'fase')::int, p_etapa ->> 'area', btrim(p_etapa ->> 'titulo'), v_resp, v_apoio,
            btrim(coalesce(p_etapa ->> 'tela', '')), btrim(coalesce(p_etapa ->> 'entrada', '')), v_proc, btrim(coalesce(p_etapa ->> 'entrega', '')),
            btrim(coalesce(p_etapa ->> 'impacto', '')), btrim(coalesce(p_etapa ->> 'regras', '')), coalesce(p_etapa ->> 'situacao', 'plan'),
            coalesce((p_etapa ->> 'ativa')::boolean, true), (select auth.uid()));
  else
    select * into v_antes from crm.cad_fluxo_etapa where empresa_id = p_empresa and codigo = v_cod for update;
    if v_antes.id is null then raise exception 'etapa não encontrada' using errcode = 'P0002'; end if;
    -- abre espaço na nova posição e fecha o buraco da antiga
    if v_ordem > v_antes.ordem then
      update crm.cad_fluxo_etapa set ordem = ordem - 1 where empresa_id = p_empresa and ordem > v_antes.ordem and ordem <= v_ordem;
    elsif v_ordem < v_antes.ordem then
      update crm.cad_fluxo_etapa set ordem = ordem + 1 where empresa_id = p_empresa and ordem >= v_ordem and ordem < v_antes.ordem;
    end if;
    update crm.cad_fluxo_etapa set ordem = v_ordem, fase = (p_etapa ->> 'fase')::int, area = p_etapa ->> 'area', titulo = btrim(p_etapa ->> 'titulo'),
           responsavel = v_resp, apoio = v_apoio, tela = btrim(coalesce(p_etapa ->> 'tela', '')), entrada = btrim(coalesce(p_etapa ->> 'entrada', '')),
           procedimento = v_proc, entrega = btrim(coalesce(p_etapa ->> 'entrega', '')), impacto = btrim(coalesce(p_etapa ->> 'impacto', '')),
           regras = btrim(coalesce(p_etapa ->> 'regras', '')), situacao = coalesce(p_etapa ->> 'situacao', v_antes.situacao),
           ativa = coalesce((p_etapa ->> 'ativa')::boolean, v_antes.ativa), atualizado_em = now(), atualizado_por = (select auth.uid())
     where id = v_antes.id;
  end if;

  if crm._fluxo_copia(p_empresa) = v_copia_antes then raise exception 'nada mudou nesta etapa' using errcode = '22023'; end if;
  v_versao := crm._fluxo_revisar(p_empresa, p_descricao, array[v_cod], 'edicao');
  return jsonb_build_object('codigo', v_cod, 'versao', v_versao);
end $$;

-- volta as etapas para a cópia de uma revisão anterior (gera nova revisão; nada se perde)
create or replace function api.fluxo_restaurar(p_empresa uuid, p_revisao uuid, p_motivo text) returns text
language plpgsql security definer set search_path = '' as $$
declare r crm.log_fluxo_revisao;
begin
  perform crm._fluxo_exigir(p_empresa, 'editar');
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'informe o motivo da restauração' using errcode = '22023'; end if;
  select * into r from crm.log_fluxo_revisao where id = p_revisao and empresa_id = p_empresa;
  if r.id is null then raise exception 'revisão não encontrada' using errcode = 'P0002'; end if;
  if r.copia = crm._fluxo_copia(p_empresa) then raise exception 'o fluxo já está igual à revisão %', r.versao using errcode = '22023'; end if;
  -- ordem temporária fora da faixa para não colidir enquanto regrava
  update crm.cad_fluxo_etapa set ordem = ordem + 100000 where empresa_id = p_empresa;
  update crm.cad_fluxo_etapa e set ordem = (x ->> 'ordem')::int, fase = (x ->> 'fase')::int, area = x ->> 'area', titulo = x ->> 'titulo',
         responsavel = x ->> 'responsavel', apoio = array(select jsonb_array_elements_text(x -> 'apoio')), tela = x ->> 'tela', entrada = x ->> 'entrada',
         procedimento = array(select jsonb_array_elements_text(x -> 'procedimento')), entrega = x ->> 'entrega', impacto = x ->> 'impacto',
         regras = x ->> 'regras', situacao = x ->> 'situacao', ativa = coalesce((x ->> 'ativa')::boolean, true), atualizado_em = now(), atualizado_por = (select auth.uid())
    from jsonb_array_elements(r.copia) x where e.empresa_id = p_empresa and e.codigo = x ->> 'codigo';
  -- etapas criadas depois da revisão ficam inativas, no fim
  update crm.cad_fluxo_etapa e set ativa = false, ordem = (select coalesce(max((x ->> 'ordem')::int), 0) from jsonb_array_elements(r.copia) x) + (e.ordem - 100000),
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where e.empresa_id = p_empresa and e.ordem > 100000;
  return crm._fluxo_revisar(p_empresa, 'Restaurada a revisão ' || r.versao || ': ' || btrim(p_motivo), '{}', 'restauracao');
end $$;

-- anotação de revisão sem mudar etapas (ex.: validação com a Ane)
create or replace function api.fluxo_revisao_registrar(p_empresa uuid, p_descricao text, p_etapas text[] default '{}') returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform crm._fluxo_exigir(p_empresa, 'editar');
  if length(btrim(coalesce(p_descricao, ''))) < 3 then raise exception 'descreva a revisão' using errcode = '22023'; end if;
  return crm._fluxo_revisar(p_empresa, p_descricao,
    array(select distinct x from unnest(coalesce(p_etapas, '{}')) x where exists (select 1 from crm.cad_fluxo_etapa e where e.empresa_id = p_empresa and e.codigo = x)),
    'anotacao');
end $$;

create or replace function api.fluxo_comentar(p_empresa uuid, p_etapa text, p_tipo text, p_texto text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_txt text; v_id uuid;
begin
  perform crm._fluxo_exigir(p_empresa, 'ver');
  if p_tipo not in ('comentario','ajuste','duvida') then raise exception 'tipo inválido' using errcode = '22023'; end if;
  if not exists (select 1 from crm.cad_fluxo_etapa where empresa_id = p_empresa and codigo = p_etapa) then raise exception 'etapa não encontrada' using errcode = 'P0002'; end if;
  v_txt := governanca.mascarar(btrim(coalesce(p_texto, '')));
  if length(v_txt) not between 1 and 4000 then raise exception 'comentário inválido (1 a 4000 caracteres)' using errcode = '22023'; end if;
  insert into crm.mov_fluxo_comentario (empresa_id, etapa_codigo, tipo, texto, mascarados, criado_por)
  values (p_empresa, p_etapa, p_tipo, v_txt, (select count(*) from regexp_matches(v_txt, '\[omitido\]', 'g')), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

create or replace function api.fluxo_comentario_resolver(p_empresa uuid, p_id uuid, p_resolvido boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c crm.mov_fluxo_comentario;
begin
  perform crm._fluxo_exigir(p_empresa, 'ver');
  select * into c from crm.mov_fluxo_comentario where id = p_id and empresa_id = p_empresa for update;
  if c.id is null then raise exception 'comentário não encontrado' using errcode = 'P0002'; end if;
  if c.criado_por is distinct from (select auth.uid()) and api.nivel_tela(p_empresa, 'fluxo') <> 'editar' then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  update crm.mov_fluxo_comentario set resolvido = coalesce(p_resolvido, true),
         resolvido_por = case when coalesce(p_resolvido, true) then (select auth.uid()) end,
         resolvido_em = case when coalesce(p_resolvido, true) then now() end
   where id = c.id;
end $$;

revoke all on function crm._fluxo_exigir(uuid, text), crm._fluxo_copia(uuid), crm._fluxo_proxima_versao(uuid), crm._fluxo_revisar(uuid, text, text[], text),
  crm._fluxo_carregar(uuid, jsonb) from public, anon, authenticated;
revoke all on function api.fluxo_revisao_copia(uuid, uuid), api.fluxo_etapa_salvar(uuid, jsonb, text), api.fluxo_restaurar(uuid, uuid, text),
  api.fluxo_revisao_registrar(uuid, text, text[]), api.fluxo_comentar(uuid, text, text, text), api.fluxo_comentario_resolver(uuid, uuid, boolean) from public, anon;
grant execute on function api.fluxo_revisao_copia(uuid, uuid), api.fluxo_etapa_salvar(uuid, jsonb, text), api.fluxo_restaurar(uuid, uuid, text),
  api.fluxo_revisao_registrar(uuid, text, text[]), api.fluxo_comentar(uuid, text, text, text), api.fluxo_comentario_resolver(uuid, uuid, boolean) to authenticated;

