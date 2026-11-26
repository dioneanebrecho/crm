-- Testes do pedido 052 (permissão por usuário no financeiro). Termina com TESTES_OK: nada é gravado.
do $$
declare
  e uuid := '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda';
  adm uuid; usr uuid; parc uuid; nat_r uuid; nat_d uuid; cr uuid; tr uuid; td uuid; r jsonb; n int := 0; ok boolean;
  conta uuid;
begin
  select usuario_id into adm from crm.vw_papel_efetivo where empresa_id = e and papel = 'admin' limit 1;
  select usuario_id into usr from crm.vw_papel_efetivo where empresa_id = e and papel = 'financeiro' and usuario_id <> adm limit 1;
  select id into parc from crm.cad_parceiro where empresa_id = e limit 1;
  select id into nat_r from financeiro.cad_natureza where empresa_id = e and analitico and sinal > 0 limit 1;
  select id into cr from financeiro.cad_centro_resultado where empresa_id = e and analitico and aceita_receita limit 1;
  select id into nat_d from financeiro.cad_natureza where empresa_id = e and analitico and sinal < 0 and cr_padrao_id is not null limit 1;

  -- admin lança uma receita e uma despesa
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  conta := api.fin_conta_salvar(e, jsonb_build_object('nome','Conta teste 052','tipo','corrente','saldo_inicial',0,'data_saldo_inicial',current_date - 30));
  tr := ((api.fin_titulo_criar(e, jsonb_build_object('tipo','R','parceiro_id',parc,'vencimento',current_date,'valor_total',100,'natureza_id',nat_r,'cr_id',cr))) -> 'titulos' ->> 0)::uuid;
  td := ((api.fin_titulo_criar(e, jsonb_build_object('tipo','D','parceiro_id',parc,'vencimento',current_date,'valor_total',40,'natureza_id',nat_d))) -> 'titulos' ->> 0)::uuid;
  if array_length(api.fin_minhas_acoes(e), 1) <> 9 then raise exception 'T1 admin deve ter as 9 ações'; end if; n := n + 1;

  -- usuário só com ver_despesa
  delete from financeiro.cfg_permissao_usuario where empresa_id = e and usuario_id = usr;
  insert into financeiro.cfg_permissao_usuario (empresa_id, usuario_id, acao) values (e, usr, 'ver_despesa');
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);

  if api.fin_minhas_acoes(e) <> array['ver_despesa'] then raise exception 'T2 minhas ações'; end if; n := n + 1;
  r := api.fin_titulos_listar(e, '{}');
  if exists (select 1 from jsonb_array_elements(r -> 'itens') x where x ->> 'tipo' = 'R') then raise exception 'T3 receita apareceu para quem só vê despesa'; end if; n := n + 1;
  if (r -> 'resumo' ->> 'receber_aberto')::numeric <> 0 then raise exception 'T4 resumo de receita vazou'; end if; n := n + 1;
  if not exists (select 1 from jsonb_array_elements(r -> 'itens') x where (x ->> 'id')::uuid = td) then raise exception 'T5 despesa não apareceu'; end if; n := n + 1;

  ok := false; begin perform api.fin_titulo_obter(e, tr); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'T6 abriu receita sem permissão'; end if; n := n + 1;
  ok := false; begin perform api.fin_baixar(e, jsonb_build_object('data', current_date, 'conta_id', conta, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', td)))); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'T7 baixou sem a ação baixar'; end if; n := n + 1;
  ok := false; begin perform api.fin_titulo_criar(e, jsonb_build_object('tipo','D','parceiro_id',parc,'vencimento',current_date,'valor_total',10,'natureza_id',nat_d)); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'T8 lançou sem a ação lancar'; end if; n := n + 1;
  if api.nivel_tela(e, 'movimentacao_financeira') <> 'ver' then raise exception 'T9 nível da tela deveria ser ver'; end if; n := n + 1;

  -- com baixar + lancar: baixa a despesa, mas não lança receita
  insert into financeiro.cfg_permissao_usuario (empresa_id, usuario_id, acao) values (e, usr, 'baixar'), (e, usr, 'lancar');
  perform api.fin_baixar(e, jsonb_build_object('data', current_date, 'conta_id', conta, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', td, 'valor', 15)))) ;
  if (select saldo from financeiro.mov_titulo where id = td) <> 25 then raise exception 'T10 baixa parcial da despesa'; end if; n := n + 1;
  ok := false; begin perform api.fin_titulo_criar(e, jsonb_build_object('tipo','R','parceiro_id',parc,'vencimento',current_date,'valor_total',10,'natureza_id',nat_r,'cr_id',cr)); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'T11 lançou receita sem ver_receita'; end if; n := n + 1;
  ok := false; begin perform api.fin_baixar(e, jsonb_build_object('data', current_date, 'conta_id', conta, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', tr)))); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'T12 baixou receita sem ver_receita'; end if; n := n + 1;
  if api.nivel_tela(e, 'movimentacao_financeira') <> 'editar' then raise exception 'T13 nível da tela deveria ser editar'; end if; n := n + 1;

  -- sem estornar não estorna
  ok := false; begin perform api.fin_baixa_estornar(e, (select id from financeiro.mov_baixa where titulo_id = td limit 1), 'teste'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'T14 estornou sem a ação estornar'; end if; n := n + 1;

  -- só admin mexe nas permissões
  ok := false; begin perform api.fin_permissoes_listar(e); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'T15 não-admin listou permissões'; end if; n := n + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform api.fin_permissoes_salvar(e, usr, array['ver_receita','ver_despesa']);
  if (select array_agg(acao order by acao) from financeiro.cfg_permissao_usuario where empresa_id = e and usuario_id = usr) <> array['ver_despesa','ver_receita'] then raise exception 'T16 salvar permissões'; end if; n := n + 1;
  if jsonb_array_length(api.fin_permissoes_listar(e)) < 2 then raise exception 'T17 listar permissões'; end if; n := n + 1;

  raise exception 'TESTES_OK: %', n;
end $$;
