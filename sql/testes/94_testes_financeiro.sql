-- Testes da 0094 (módulo financeiro). Bloco que termina em exceção: nada fica gravado. Esperado: TESTES_OK: 20.
-- Rodados em 26/11/2026 após a aplicação: TESTES_OK: 20 (nada gravado; conferido).
do $t$
declare e uuid; u uuid := '2761924d-7615-48dc-b8cb-06e6e159a76a'; pf uuid; pc uuid; pc2 uuid; cb uuid; cb2 uuid;
  n_alug uuid; n_cont uuid; n_venda uuid; n_tar uuid; n_comp uuid; cr_loja uuid; cr_adm uuid; cr_fin uuid; cr_live uuid;
  r jsonb; t1 uuid; t2 uuid; t3 uuid; ids uuid[]; b1 uuid; ok boolean; v numeric; s text; x financeiro.mov_titulo; k int; ln uuid; ln2 uuid; mv uuid; rid uuid; rid2 uuid;
  ent uuid;
begin
  select empresa_id into e from crm.rel_usuario_empresa where usuario_id = u and ativo limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, origem) values (e, 'TESTE FORNECEDOR FIN', 'J', 'manual') returning id into pf;
  insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, origem) values (e, 'TESTE CLIENTE FIN', 'F', 'manual') returning id into pc;
  insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, origem) values (e, 'TESTE CLIENTE 2 FIN', 'F', 'manual') returning id into pc2;
  select id into n_alug from financeiro.cad_natureza where empresa_id = e and codigo = '4.03.01.001';
  select id into n_cont from financeiro.cad_natureza where empresa_id = e and codigo = '4.03.04.001';
  select id into n_venda from financeiro.cad_natureza where empresa_id = e and codigo = '1.01.01.001';
  select id into n_tar from financeiro.cad_natureza where empresa_id = e and codigo = '5.01.02.001';
  select id into cr_loja from financeiro.cad_centro_resultado where empresa_id = e and codigo = '1.02.01';
  select id into cr_live from financeiro.cad_centro_resultado where empresa_id = e and codigo = '1.01.01.001';
  select id into cr_adm from financeiro.cad_centro_resultado where empresa_id = e and codigo = '3.04';
  select id into cr_fin from financeiro.cad_centro_resultado where empresa_id = e and codigo = '3.01';
  cb := api.fin_conta_salvar(e, jsonb_build_object('nome', 'TESTE Banco', 'tipo', 'corrente', 'saldo_inicial', 1000, 'data_saldo_inicial', '2026-11-01'));
  cb2 := api.fin_conta_salvar(e, jsonb_build_object('nome', 'TESTE Caixa', 'tipo', 'caixa', 'saldo_inicial', 100, 'data_saldo_inicial', '2026-11-01'));

  -- T1 título com rateio 70/30
  r := api.fin_titulo_criar(e, jsonb_build_object('tipo', 'D', 'parceiro_id', pf, 'documento', 'Aluguel dez', 'valor_total', 3500, 'vencimento', '2026-12-05',
         'rateio', jsonb_build_array(jsonb_build_object('natureza_id', n_alug, 'cr_id', cr_loja, 'percentual', 70), jsonb_build_object('natureza_id', n_alug, 'cr_id', cr_adm, 'percentual', 30))));
  t1 := (r -> 'titulos' ->> 0)::uuid;
  select * into x from financeiro.mov_titulo where id = t1;
  if x.saldo <> 3500 or x.situacao <> 'aberto' or (select count(*) from financeiro.rel_titulo_rateio where titulo_id = t1) <> 2 then raise exception 'T1 %', row_to_json(x); end if;
  k := 1;

  -- T2 rateio que não fecha 100% e T3 natureza de receita em título a pagar
  ok := false; begin perform api.fin_titulo_criar(e, jsonb_build_object('tipo', 'D', 'parceiro_id', pf, 'valor_total', 10, 'vencimento', '2026-12-05',
         'rateio', jsonb_build_array(jsonb_build_object('natureza_id', n_alug, 'cr_id', cr_loja, 'percentual', 90))));
  exception when others then ok := sqlerrm like '%fechar 100%'; end; if not ok then raise exception 'T2'; end if; k := k + 1;
  ok := false; begin perform api.fin_titulo_criar(e, jsonb_build_object('tipo', 'D', 'parceiro_id', pf, 'valor_total', 10, 'vencimento', '2026-12-05', 'natureza_id', n_venda, 'cr_id', cr_live));
  exception when others then ok := sqlerrm like '%é de receita%'; end; if not ok then raise exception 'T3'; end if; k := k + 1;

  -- T4 baixa parcial e estorno recompõe
  r := api.fin_baixar(e, jsonb_build_object('data', '2026-11-20', 'conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t1, 'valor', 1000))));
  b1 := (r -> 'baixas' ->> 0)::uuid;
  select * into x from financeiro.mov_titulo where id = t1;
  if x.situacao <> 'parcial' or x.saldo <> 2500 then raise exception 'T4a %', row_to_json(x); end if;
  perform api.fin_baixa_estornar(e, b1, 'teste');
  select * into x from financeiro.mov_titulo where id = t1;
  if x.situacao <> 'aberto' or x.saldo <> 3500 or not (select estornado from financeiro.mov_conta_movimento where id = (r ->> 'movimento_id')::uuid) then raise exception 'T4b'; end if;
  k := k + 1;

  -- T5 baixa integral com juros e desconto: movimento = principal + juros − desconto (saída)
  r := api.fin_baixar(e, jsonb_build_object('data', '2026-11-21', 'conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t1, 'juros', 10, 'desconto', 5))));
  if (select valor from financeiro.mov_conta_movimento where id = (r ->> 'movimento_id')::uuid) <> -3505 then raise exception 'T5a'; end if;
  if (select situacao from financeiro.mov_titulo where id = t1) <> 'baixado' then raise exception 'T5b'; end if;
  if (api.fin_saldos(e, '2026-11-30') -> 'contas' @> jsonb_build_array(jsonb_build_object('id', cb, 'sistema', -2505))) is not true then raise exception 'T5c %', api.fin_saldos(e, '2026-11-30'); end if;
  if (select count(*) from financeiro.vw_titulo_apropriacao where titulo_id = t1 and componente in ('juros','desconto')) <> 4 then raise exception 'T5d apropriação de juros/desconto'; end if;
  k := k + 1;

  -- T6 parcelamento: centavos na última, cancelar só pelo grupo
  r := api.fin_titulo_criar(e, jsonb_build_object('tipo', 'D', 'parceiro_id', pf, 'documento', 'Contrato', 'valor_total', 1000, 'parcelas', 3, 'vencimento', '2026-12-10', 'natureza_id', n_cont, 'cr_id', cr_fin));
  select array_agg(id order by parcela_num) into ids from financeiro.mov_titulo where grupo_id = (r ->> 'grupo_id')::uuid;
  if (select string_agg(valor_original::text, ',' order by parcela_num) from financeiro.mov_titulo where grupo_id = (r ->> 'grupo_id')::uuid) <> '333.33,333.33,333.34' then raise exception 'T6a'; end if;
  if (select string_agg(vencimento::text, ',' order by parcela_num) from financeiro.mov_titulo where grupo_id = (r ->> 'grupo_id')::uuid) <> '2026-12-10,2027-01-10,2027-02-10' then raise exception 'T6b'; end if;
  ok := false; begin perform api.fin_titulo_cancelar(e, ids[2], 'x'); exception when others then ok := sqlerrm like '%cancele pelo grupo%'; end; if not ok then raise exception 'T6c'; end if;
  if api.fin_titulo_cancelar(e, ids[2], 'x', 'grupo_a_partir') <> 2 then raise exception 'T6d'; end if;
  k := k + 1;

  -- T7 NFS-e com retenções e guias; cancelar leva as guias
  r := api.fin_titulo_criar(e, jsonb_build_object('tipo', 'D', 'parceiro_id', pf, 'documento', 'NFS-e 4512', 'origem_tipo', 'nfse_entrada', 'valor_total', 1200, 'competencia', '2026-11-25', 'emissao', '2026-11-25',
         'vencimento', '2026-12-05', 'natureza_id', n_cont, 'cr_id', cr_fin, 'retencoes', jsonb_build_object('iss', 24, 'irrf', 18), 'retencao_recolhe', true));
  t2 := (r -> 'titulos' ->> 0)::uuid;
  if (select valor_liquido from financeiro.mov_titulo where id = t2) <> 1158 or jsonb_array_length(r -> 'guias') <> 2 then raise exception 'T7a %', r; end if;
  if (select string_agg(valor_original::text || '@' || vencimento, ',' order by valor_original) from financeiro.mov_titulo where retencao_de_id = t2) <> '18.00@2026-12-20,24.00@2026-12-20' then raise exception 'T7b'; end if;
  if api.fin_titulo_cancelar(e, t2, 'teste') <> 3 then raise exception 'T7c'; end if;
  k := k + 1;

  -- T8 baixa agrupada: um movimento; estornar uma baixa estorna o lote
  r := api.fin_titulo_criar(e, jsonb_build_object('tipo', 'R', 'parceiro_id', pc, 'valor_total', 100, 'vencimento', '2026-11-22', 'natureza_id', n_venda, 'cr_id', cr_live));
  t1 := (r -> 'titulos' ->> 0)::uuid;
  r := api.fin_titulo_criar(e, jsonb_build_object('tipo', 'R', 'parceiro_id', pc2, 'valor_total', 50, 'vencimento', '2026-11-22', 'natureza_id', n_venda, 'cr_id', cr_live));
  t3 := (r -> 'titulos' ->> 0)::uuid;
  r := api.fin_baixar(e, jsonb_build_object('data', '2026-11-22', 'conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t1, 'taxa', 3), jsonb_build_object('titulo_id', t3))));
  if (select count(*) from financeiro.mov_conta_movimento where lote_id = (r ->> 'lote_id')::uuid) <> 1 or (r ->> 'liquido')::numeric <> 147 then raise exception 'T8a %', r; end if;
  perform api.fin_baixa_estornar(e, (r -> 'baixas' ->> 1)::uuid, 'teste lote');
  if (select count(*) from financeiro.mov_titulo where id in (t1, t3) and situacao = 'aberto') <> 2 then raise exception 'T8b'; end if;
  k := k + 1;

  -- T9 adiantamento de cliente compensado com a venda: banco recebe só a diferença
  r := api.fin_adiantamento_criar(e, jsonb_build_object('tipo', 'cliente', 'parceiro_id', pc, 'valor', 200, 'data', '2026-11-18', 'conta_id', cb2, 'cr_id', cr_loja));
  t2 := (r ->> 'titulo_contrapartida')::uuid;
  t3 := (api.fin_titulo_criar(e, jsonb_build_object('tipo', 'R', 'parceiro_id', pc, 'valor_total', 520, 'vencimento', '2026-11-28', 'natureza_id', n_venda, 'cr_id', cr_loja)) -> 'titulos' ->> 0)::uuid;
  r := api.fin_baixar(e, jsonb_build_object('data', '2026-11-24', 'conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t2), jsonb_build_object('titulo_id', t3))));
  if not (r ->> 'compensacao')::boolean or (r ->> 'liquido')::numeric <> 320 then raise exception 'T9a %', r; end if;
  if (select situacao from financeiro.mov_adiantamento where id = (select adiantamento_id from financeiro.mov_titulo where id = t2)) <> 'compensado' then raise exception 'T9b'; end if;
  ok := false; begin perform api.fin_baixar(e, jsonb_build_object('conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t1), jsonb_build_object('titulo_id', ids[1]))));
  exception when others then ok := sqlerrm like '%mesmo parceiro%'; end; if not ok then raise exception 'T9c'; end if;
  k := k + 1;

  -- T10 renegociação agrupando títulos, renegociar de novo e desfazer em ordem
  t1 := (api.fin_titulo_criar(e, jsonb_build_object('tipo', 'R', 'parceiro_id', pc2, 'valor_total', 300, 'vencimento', '2026-11-05', 'natureza_id', n_venda, 'cr_id', cr_live)) -> 'titulos' ->> 0)::uuid;
  t2 := (api.fin_titulo_criar(e, jsonb_build_object('tipo', 'R', 'parceiro_id', pc2, 'valor_total', 200, 'vencimento', '2026-11-10', 'natureza_id', n_venda, 'cr_id', cr_live)) -> 'titulos' ->> 0)::uuid;
  perform api.fin_baixar(e, jsonb_build_object('data', '2026-11-12', 'conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t2, 'valor', 50))));
  r := api.fin_renegociar(e, jsonb_build_object('titulos', jsonb_build_array(t1, t2), 'juros', 10, 'parcelas', 2, 'primeiro_vencimento', '2026-12-20'));
  rid := (r ->> 'renegociacao_id')::uuid;
  if (r ->> 'total_original')::numeric <> 450 or (r ->> 'novo_total')::numeric <> 460 then raise exception 'T10a %', r; end if;
  if (select count(*) from financeiro.mov_titulo where id in (t1, t2) and situacao = 'renegociado') <> 2 then raise exception 'T10b'; end if;
  if (select string_agg(valor_original::text, ',' order by parcela_num) from financeiro.mov_titulo t join financeiro.rel_renegociacao_titulo q on q.titulo_id = t.id where q.renegociacao_id = rid and q.papel = 'novo') <> '230.00,230.00' then raise exception 'T10c'; end if;
  if (select sum(percentual) from financeiro.rel_titulo_rateio where titulo_id = (r -> 'novos' ->> 0)::uuid) <> 100
     or not exists (select 1 from financeiro.rel_titulo_rateio where titulo_id = (r -> 'novos' ->> 0)::uuid and componente = 'juros') then raise exception 'T10d rateio'; end if;
  -- renegocia de novo a 2ª parcela junto com um título novo do mesmo cliente
  t3 := (api.fin_titulo_criar(e, jsonb_build_object('tipo', 'R', 'parceiro_id', pc2, 'valor_total', 40, 'vencimento', '2026-12-01', 'natureza_id', n_venda, 'cr_id', cr_live)) -> 'titulos' ->> 0)::uuid;
  r := api.fin_renegociar(e, jsonb_build_object('titulos', jsonb_build_array((r -> 'novos' ->> 1)::uuid, t3), 'parcelas', 1, 'primeiro_vencimento', '2027-01-20'));
  rid2 := (r ->> 'renegociacao_id')::uuid;
  if jsonb_array_length(api.fin_titulo_obter(e, t3) -> 'vinculos' -> 'renegociado_em') <> 1
     or jsonb_array_length(api.fin_titulo_obter(e, (r -> 'novos' ->> 0)::uuid) -> 'vinculos' -> 'originado_de' -> 'originais') <> 2 then raise exception 'T10e vínculos'; end if;
  ok := false; begin perform api.fin_renegociacao_desfazer(e, rid, 'x'); exception when others then ok := sqlerrm like '%renegociado de novo%'; end; if not ok then raise exception 'T10f'; end if;
  perform api.fin_renegociacao_desfazer(e, rid2, 'teste');
  perform api.fin_renegociacao_desfazer(e, rid, 'teste');
  if (select string_agg(situacao || ':' || saldo, ',' order by numero) from financeiro.mov_titulo where id in (t1, t2)) <> 'aberto:300.00,parcial:150.00' then raise exception 'T10g'; end if;
  k := k + 1;

  -- T11 provisão não baixa; efetivar libera
  t1 := (api.fin_titulo_criar(e, jsonb_build_object('tipo', 'D', 'parceiro_id', pf, 'valor_total', 320, 'vencimento', '2026-12-15', 'natureza_id', n_cont, 'cr_id', cr_fin, 'provisao', true)) -> 'titulos' ->> 0)::uuid;
  ok := false; begin perform api.fin_baixar(e, jsonb_build_object('conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t1)))); exception when others then ok := sqlerrm like '%provisão%'; end;
  if not ok then raise exception 'T11a'; end if;
  perform api.fin_provisao_efetivar(e, t1);
  if (select provisao from financeiro.mov_titulo where id = t1) then raise exception 'T11b'; end if;
  k := k + 1;

  -- T12 duplicar
  t2 := api.fin_titulo_duplicar(e, t1);
  select * into x from financeiro.mov_titulo where id = t2;
  if x.vencimento <> '2027-01-15' or x.origem_tipo <> 'duplicado' or x.titulo_origem_id <> t1 or x.documento is not null then raise exception 'T12 %', row_to_json(x); end if;
  k := k + 1;

  -- T13 conciliação: data do banco ≠ data da baixa; estorno bloqueado quando conciliado
  t1 := (api.fin_titulo_criar(e, jsonb_build_object('tipo', 'R', 'parceiro_id', pc, 'valor_total', 289.90, 'vencimento', '2026-11-21', 'natureza_id', n_venda, 'cr_id', cr_live)) -> 'titulos' ->> 0)::uuid;
  r := api.fin_baixar(e, jsonb_build_object('data', '2026-11-21', 'conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t1))));
  b1 := (r -> 'baixas' ->> 0)::uuid; mv := (r ->> 'movimento_id')::uuid;
  perform api.fin_extrato_importar(e, cb, jsonb_build_object('arquivo_nome', 'teste.ofx', 'saldo_final', -1935, 'data_saldo', '2026-11-25',
     'linhas', jsonb_build_array(jsonb_build_object('fitid', 'A1', 'data', '2026-11-21', 'valor', -3505, 'descricao', 'PAG BOLETO'),
                                 jsonb_build_object('fitid', 'A2', 'data', '2026-11-22', 'valor', 289.90, 'descricao', 'PIX RECEBIDO'),
                                 jsonb_build_object('fitid', 'A3', 'data', '2026-11-24', 'valor', 320, 'descricao', 'PIX RECEBIDO'),
                                 jsonb_build_object('fitid', 'A4', 'data', '2026-11-25', 'valor', -39.90, 'descricao', 'TARIFA PACOTE'))));
  if (api.fin_extrato_importar(e, cb, jsonb_build_object('linhas', jsonb_build_array(jsonb_build_object('fitid', 'A1', 'data', '2026-11-21', 'valor', -3505)))) ->> 'repetidas')::int <> 1 then raise exception 'T13a fitid'; end if;
  r := api.fin_conciliacao(e, cb, '2026-11-25');
  select (l ->> 'id')::uuid into ln from jsonb_array_elements(r -> 'linhas') l where l ->> 'descricao' = 'PIX RECEBIDO' and (l ->> 'valor')::numeric = 289.90;
  if (select l -> 'sugestao' ->> 'movimento_id' from jsonb_array_elements(r -> 'linhas') l where (l ->> 'id')::uuid = ln)::uuid <> mv then raise exception 'T13b sugestão %', r; end if;
  perform api.fin_conciliar(e, ln, mv);
  if (financeiro._saldo_em(cb, '2026-11-21') ->> 'conciliado')::numeric <> 1000 or (financeiro._saldo_em(cb, '2026-11-22') ->> 'conciliado')::numeric <> 1289.90 then raise exception 'T13c datas'; end if;
  if financeiro._sit_exibicao((select t from financeiro.mov_titulo t where id = t1)) <> 'conciliado' then raise exception 'T13d'; end if;
  ok := false; begin perform api.fin_baixa_estornar(e, b1, 'x'); exception when others then ok := sqlerrm like '%desconcilie%'; end; if not ok then raise exception 'T13e'; end if;
  perform api.fin_desconciliar(e, ln);
  perform api.fin_conciliar(e, ln, mv);
  k := k + 1;

  -- T14 conciliar o resto e criar título da tarifa: diferença zero e OFX confere
  for r in select l from jsonb_array_elements(api.fin_conciliacao(e, cb, '2026-11-25') -> 'linhas') l where l ->> 'situacao' = 'pendente' and l -> 'sugestao' is not null and l -> 'sugestao' <> 'null' loop
    perform api.fin_conciliar(e, (r ->> 'id')::uuid, (r -> 'sugestao' ->> 'movimento_id')::uuid);
  end loop;
  select (l ->> 'id')::uuid into ln2 from jsonb_array_elements(api.fin_conciliacao(e, cb, '2026-11-25') -> 'linhas') l where l ->> 'descricao' = 'TARIFA PACOTE';
  t3 := api.fin_extrato_criar_titulo(e, ln2, jsonb_build_object('parceiro_id', pf, 'natureza_id', n_tar, 'cr_id', cr_fin));
  r := api.fin_conciliacao(e, cb, '2026-11-25');
  if (r ->> 'diferenca')::numeric <> 0 or not (r -> 'ofx' ->> 'confere')::boolean then raise exception 'T14 %', r; end if;
  if (select situacao from financeiro.mov_titulo where id = t3) <> 'baixado' then raise exception 'T14b'; end if;
  k := k + 1;

  -- T15 transferência entre contas e estorno
  r := api.fin_transferir(e, cb2, cb, 50, '2026-11-25');
  if (api.fin_saldos(e, '2026-11-25') -> 'contas' @> jsonb_build_array(jsonb_build_object('id', cb2, 'sistema', 250))) is not true then raise exception 'T15a %', api.fin_saldos(e, '2026-11-25'); end if;
  perform api.fin_transferencia_estornar(e, (r ->> 'saida')::uuid);
  if (select count(*) from financeiro.mov_conta_movimento where id in ((r ->> 'saida')::uuid, (r ->> 'entrada')::uuid) and estornado) <> 2 then raise exception 'T15b'; end if;
  k := k + 1;

  -- T16 saldo inicial não muda com movimento conciliado
  ok := false; begin perform api.fin_conta_salvar(e, jsonb_build_object('id', cb, 'saldo_inicial', 5)); exception when others then ok := sqlerrm like '%saldo inicial não muda%'; end;
  if not ok then raise exception 'T16'; end if;
  k := k + 1;

  -- T17 período fechado
  perform api.fin_cfg_salvar(e, jsonb_build_object('data_fechamento', '2026-11-23'));
  t1 := (api.fin_titulo_criar(e, jsonb_build_object('tipo', 'D', 'parceiro_id', pf, 'valor_total', 10, 'vencimento', '2026-12-01', 'competencia', '2026-11-30', 'natureza_id', n_cont, 'cr_id', cr_fin)) -> 'titulos' ->> 0)::uuid;
  ok := false; begin perform api.fin_baixar(e, jsonb_build_object('data', '2026-11-20', 'conta_id', cb, 'itens', jsonb_build_array(jsonb_build_object('titulo_id', t1)))); exception when others then ok := sqlerrm like '%período fechado%'; end;
  if not ok then raise exception 'T17'; end if;
  perform api.fin_cfg_salvar(e, jsonb_build_object('data_fechamento', ''));
  k := k + 1;

  -- T18 NF-e de entrada já confirmada: títulos gerados, travados e idempotentes
  select id into ent from compra.mov_entrada where empresa_id = e and status = 'confirmada' limit 1;
  if ent is not null then
    if api.fin_gerar_titulos_entrada(e, ent) <> (select count(*) from compra.mov_entrada_parcela where entrada_id = ent) then raise exception 'T18a'; end if;
    if api.fin_gerar_titulos_entrada(e, ent) <> 0 then raise exception 'T18b idempotência'; end if;
    select id into t1 from financeiro.mov_titulo where entrada_id = ent limit 1;
    if (select titulo_id from compra.mov_entrada_parcela where id = (select entrada_parcela_id from financeiro.mov_titulo where id = t1)) <> t1 then raise exception 'T18c vínculo'; end if;
    ok := false; begin perform api.fin_titulo_salvar(e, t1, jsonb_build_object('valor_original', 1)); exception when others then ok := sqlerrm like '%vem da NF-e%'; end; if not ok then raise exception 'T18d'; end if;
    ok := false; begin perform api.fin_titulo_cancelar(e, t1, 'x', 'grupo'); exception when others then ok := sqlerrm like '%vem da NF-e%'; end; if not ok then raise exception 'T18e'; end if;
  end if;
  k := k + 1;

  -- T19 listagem e detalhe
  r := api.fin_titulos_listar(e, jsonb_build_object('busca', 'TESTE CLIENTE 2', 'situacoes', jsonb_build_array('aberto','vencido','parcial')));
  if (r ->> 'total')::int < 2 or r -> 'resumo' is null then raise exception 'T19a %', r; end if;
  if jsonb_array_length(api.fin_titulo_obter(e, (select id from financeiro.mov_titulo where parceiro_id = pc2 and situacao = 'parcial' limit 1)) -> 'baixas') < 2 then raise exception 'T19b'; end if;
  k := k + 1;

  -- T20 usuário sem vínculo é barrado
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  ok := false; begin perform api.fin_titulos_listar(e); exception when others then ok := sqlstate = '42501'; end; if not ok then raise exception 'T20'; end if;
  k := k + 1;

  raise exception 'TESTES_OK: %', k;
end $t$;
