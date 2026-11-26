-- Testes da 0095a–c (pedido 050, fluxo do processo). Bloco que termina em exceção (nada fica gravado). Esperado: TESTES_OK.
-- Rodados em 26/11/2026 após 0095a–d e de novo após a 0097 (revisão 1.1): TESTES_OK (11 grupos).
do $t$
declare e uuid; adm uuid; usr uuid; r jsonb; v text; v2 text; ok boolean; n int; c uuid; rev1 uuid; et jsonb;
begin
  select empresa_id into e from crm.cad_fluxo_etapa limit 1;
  select usuario_id into adm from crm.vw_papel_efetivo where empresa_id = e and papel = 'admin' limit 1;
  select usuario_id into usr from crm.vw_papel_efetivo where empresa_id = e and papel <> 'admin'
     and usuario_id not in (select usuario_id from crm.vw_papel_efetivo where empresa_id = e and papel = 'admin') limit 1;

  -- como admin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);

  -- 1 leitura: 33 etapas, 10 papéis, alguma revisão, nível editar
  r := api.fluxo_obter(e);
  if jsonb_array_length(r->'etapas') <> 33 or jsonb_array_length(r->'funcoes') <> 10 or r->>'versao' is null or r->>'nivel' <> 'editar' then
    raise exception 'T1 %', jsonb_build_object('etapas', jsonb_array_length(r->'etapas'), 'versao', r->>'versao', 'nivel', r->>'nivel'); end if;
  select id into rev1 from crm.log_fluxo_revisao where empresa_id = e and versao = '1.0';

  -- 2 editar título da E03 gera a próxima revisão com a etapa e a cópia
  v2 := crm._fluxo_proxima_versao(e);
  et := (select x from jsonb_array_elements(r->'etapas') x where x->>'codigo' = 'E03');
  r := api.fluxo_etapa_salvar(e, et || '{"titulo":"Importar o XML da NF-e de compra"}', 'Título mais claro');
  if r->>'versao' <> v2 then raise exception 'T2 %', r; end if;
  select copia into r from crm.log_fluxo_revisao where empresa_id = e and versao = v2;
  if (select x->>'titulo' from jsonb_array_elements(r) x where x->>'codigo'='E03') <> 'Importar o XML da NF-e de compra' then raise exception 'T2 cópia'; end if;

  -- 3 salvar sem mudança é recusado; sem descrição também
  ok := false; begin perform api.fluxo_etapa_salvar(e, et || '{"titulo":"Importar o XML da NF-e de compra"}', 'nada'); exception when others then ok := sqlerrm = 'nada mudou nesta etapa'; end;
  if not ok then raise exception 'T3a'; end if;
  ok := false; begin perform api.fluxo_etapa_salvar(e, et || '{"titulo":"Outro"}', ' '); exception when others then ok := sqlerrm like 'descreva%'; end;
  if not ok then raise exception 'T3b'; end if;

  -- 4 mover E03 para a posição 1: E01 vai para 2; ordem continua 1..33 sem buraco
  et := (select x from jsonb_array_elements(crm._fluxo_copia(e)) x where x->>'codigo' = 'E03');
  perform api.fluxo_etapa_salvar(e, et || '{"ordem":1}', 'Teste de ordem');
  if (select ordem from crm.cad_fluxo_etapa where empresa_id=e and codigo='E03') <> 1 or (select ordem from crm.cad_fluxo_etapa where empresa_id=e and codigo='E01') <> 2 then raise exception 'T4 subir'; end if;
  perform api.fluxo_etapa_salvar(e, et || '{"ordem":3}', 'Volta');
  if (select string_agg(codigo, ',' order by ordem) from crm.cad_fluxo_etapa where empresa_id=e and ordem <= 4) <> 'E01,E02,E03,E04' then raise exception 'T4 descer'; end if;
  if (select count(distinct ordem) from crm.cad_fluxo_etapa where empresa_id=e) <> 33 or (select max(ordem) from crm.cad_fluxo_etapa where empresa_id=e) <> 33 then raise exception 'T4 buracos'; end if;

  -- 5 nova etapa ganha código E34 e entra na posição pedida
  r := api.fluxo_etapa_salvar(e, jsonb_build_object('ordem', 10, 'fase', 2, 'area', 'estoque', 'titulo', 'Fotografar a arara', 'responsavel', 'marketing',
        'apoio', jsonb_build_array('conferente','marketing'), 'procedimento', jsonb_build_array('Passo 1', '  ', 'Passo 2'), 'situacao', 'man'), 'Nova etapa de teste');
  if r->>'codigo' <> 'E34' or (select ordem from crm.cad_fluxo_etapa where empresa_id=e and codigo='E34') <> 10 then raise exception 'T5 %', r; end if;
  if (select apoio from crm.cad_fluxo_etapa where empresa_id=e and codigo='E34') <> array['conferente'] then raise exception 'T5 apoio sem o responsável'; end if;
  if (select cardinality(procedimento) from crm.cad_fluxo_etapa where empresa_id=e and codigo='E34') <> 2 then raise exception 'T5 passos vazios'; end if;

  -- 6 papel inválido e procedimento vazio
  ok := false; begin perform api.fluxo_etapa_salvar(e, et || '{"responsavel":"astronauta"}', 'x x x'); exception when others then ok := sqlerrm like 'papel responsável%'; end;
  if not ok then raise exception 'T6a'; end if;
  ok := false; begin perform api.fluxo_etapa_salvar(e, et || '{"procedimento":[]}', 'x x x'); exception when others then ok := sqlerrm like 'informe ao menos%'; end;
  if not ok then raise exception 'T6b'; end if;

  -- 7 restaurar a 1.0: E34 fica inativa no fim, título volta, nova revisão de restauração
  v := api.fluxo_restaurar(e, rev1, 'teste de restauração');
  if (select titulo from crm.cad_fluxo_etapa where empresa_id=e and codigo='E03') <> 'Importar o XML da NF-e' then raise exception 'T7 título'; end if;
  if (select ativa from crm.cad_fluxo_etapa where empresa_id=e and codigo='E34') or (select ordem from crm.cad_fluxo_etapa where empresa_id=e and codigo='E34') <> 34 then raise exception 'T7 E34'; end if;
  if (select tipo from crm.log_fluxo_revisao where empresa_id=e and versao=v) <> 'restauracao' then raise exception 'T7 tipo'; end if;
  ok := false; begin perform api.fluxo_restaurar(e, (select id from crm.log_fluxo_revisao where empresa_id=e and versao=v), 'de novo'); exception when others then ok := sqlerrm like 'o fluxo já está igual%'; end;
  if not ok then raise exception 'T7 igual'; end if;

  -- 8 comentário mascara CPF, telefone e e-mail
  c := api.fluxo_comentar(e, 'E18', 'ajuste', 'Cliente 123.456.789-09, fone (34) 99999-1234, mail a@b.com pediu prazo maior');
  select texto, mascarados into v, n from crm.mov_fluxo_comentario where id = c;
  if v like '%123.456%' or v like '%99999%' or v like '%a@b.com%' or n <> 3 then raise exception 'T8 % %', v, n; end if;
  ok := false; begin perform api.fluxo_comentar(e, 'E99', 'ajuste', 'x'); exception when others then ok := sqlerrm = 'etapa não encontrada'; end;
  if not ok then raise exception 'T8 etapa'; end if;

  -- 9 anotação de revisão sem mudar etapas (filtra códigos inexistentes)
  v := api.fluxo_revisao_registrar(e, 'Validado com a Ane', array['E18','E99']);
  if (select etapas from crm.log_fluxo_revisao where empresa_id=e and versao=v) <> array['E18'] then raise exception 'T9'; end if;

  -- 10 usuário só com nível ver: lê e comenta; não edita, não registra revisão, não resolve comentário alheio; resolve o próprio
  if usr is not null then
    update crm.cfg_permissao_tela set nivel = 'ver' where empresa_id = e and tela = 'fluxo';
    perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', usr::text, true);
    if api.fluxo_obter(e)->>'nivel' <> 'ver' then raise exception 'T10 nível'; end if;
    ok := false; begin perform api.fluxo_etapa_salvar(e, et || '{"titulo":"Nao pode"}', 'tentativa'); exception when others then ok := sqlstate = '42501'; end;
    if not ok then raise exception 'T10 editar'; end if;
    ok := false; begin perform api.fluxo_revisao_registrar(e, 'tentativa'); exception when others then ok := sqlstate = '42501'; end;
    if not ok then raise exception 'T10 revisão'; end if;
    ok := false; begin perform api.fluxo_comentario_resolver(e, c, true); exception when others then ok := sqlstate = '42501'; end;
    if not ok then raise exception 'T10 resolver alheio'; end if;
    c := api.fluxo_comentar(e, 'E05', 'duvida', 'Quem confere a marca?');
    perform api.fluxo_comentario_resolver(e, c, true);
    if not (select resolvido from crm.mov_fluxo_comentario where id = c) then raise exception 'T10 resolver próprio'; end if;
    -- nível nenhum: barrado na leitura
    update crm.cfg_permissao_tela set nivel = 'nenhum' where empresa_id = e and tela = 'fluxo';
    ok := false; begin perform api.fluxo_obter(e); exception when others then ok := sqlstate = '42501'; end;
    if not ok then raise exception 'T10 nenhum'; end if;
  end if;

  -- 11 usuário sem vínculo com a empresa é barrado
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  ok := false; begin perform api.fluxo_obter(e); exception when others then ok := sqlstate = '42501'; end;
  if not ok then raise exception 'T11'; end if;

  raise exception 'TESTES_OK';
end $t$;
