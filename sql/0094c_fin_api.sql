-- 0094c_fin_api.sql (aplicada em duas migrations: 0094c_fin_api_titulos e 0094d_fin_api_baixa_banco; 0094e corrigiu um apelido em fin_baixar)
-- Pedido de mudança 049, parte C: API do painel (api.fin_*) e funções internas de montagem.
-- Papéis: admin, gestor e financeiro operam; parâmetros só admin e gestor.

create function api._fin_papeis() returns text[]
language sql immutable set search_path = '' as $$ select array['admin','gestor','financeiro'] $$;

-- ---------------------------------------------------------------------------
-- Internas
-- ---------------------------------------------------------------------------
-- Rateio a partir dos dados: lista em 'rateio' ou natureza/CR/projeto únicos (CR padrão da natureza se faltar)
create function financeiro._rateio_de(p_empresa uuid, d jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_nat uuid; v_cr uuid;
begin
  if jsonb_typeof(d -> 'rateio') = 'array' and jsonb_array_length(d -> 'rateio') > 0 then
    return (select jsonb_agg(jsonb_build_object('natureza_id', r ->> 'natureza_id',
              'cr_id', coalesce(nullif(r ->> 'cr_id', ''), (select n.cr_padrao_id::text from financeiro.cad_natureza n where n.id = (r ->> 'natureza_id')::uuid)),
              'projeto_id', nullif(r ->> 'projeto_id', ''), 'percentual', coalesce((r ->> 'percentual')::numeric, 100), 'componente', coalesce(r ->> 'componente', 'principal')))
              from jsonb_array_elements(d -> 'rateio') r);
  end if;
  v_nat := nullif(d ->> 'natureza_id', '')::uuid;
  if v_nat is null then raise exception 'informe a natureza' using errcode = '22023'; end if;
  v_cr := coalesce(nullif(d ->> 'cr_id', '')::uuid, (select cr_padrao_id from financeiro.cad_natureza where id = v_nat and empresa_id = p_empresa));
  if v_cr is null then raise exception 'informe o centro de resultado' using errcode = '22023'; end if;
  return jsonb_build_array(jsonb_build_object('natureza_id', v_nat, 'cr_id', v_cr, 'projeto_id', nullif(d ->> 'projeto_id', ''), 'percentual', 100, 'componente', 'principal'));
end $$;

create function financeiro._novo_titulo(p_empresa uuid, d jsonb, p_rateio jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r jsonb;
begin
  if (d ->> 'tipo') is null or (d ->> 'tipo') not in ('R','D') then raise exception 'tipo deve ser R (receber) ou D (pagar)' using errcode = '22023'; end if;
  if nullif(d ->> 'parceiro_id', '') is null then raise exception 'informe o parceiro' using errcode = '22023'; end if;
  if nullif(d ->> 'vencimento', '') is null then raise exception 'informe o vencimento' using errcode = '22023'; end if;
  insert into financeiro.mov_titulo (empresa_id, tipo, parceiro_id, documento, historico, emissao, competencia, vencimento,
     valor_original, ret_iss, ret_irrf, ret_inss, ret_pcc, retencao_recolhe, provisao, tipo_titulo_id, conta_prevista_id,
     juros_dia_pct, multa_pct, desconto_ate, desconto_valor, codigo_barras, pix_copia_cola, origem_tipo,
     entrada_id, pedido_id, cobranca_id, pagamento_id, nfe_chave, grupo_id, parcela_num, parcela_total,
     titulo_origem_id, retencao_de_id, adiantamento_id, adiantamento_papel, criado_por)
  values (p_empresa, d ->> 'tipo', (d ->> 'parceiro_id')::uuid, nullif(btrim(d ->> 'documento'), ''), nullif(btrim(d ->> 'historico'), ''),
     coalesce(nullif(d ->> 'emissao', '')::date, financeiro._hoje()),
     coalesce(nullif(d ->> 'competencia', '')::date, nullif(d ->> 'emissao', '')::date, financeiro._hoje()),
     (d ->> 'vencimento')::date,
     round((d ->> 'valor_original')::numeric, 2),
     coalesce(round(nullif(d ->> 'ret_iss', '')::numeric, 2), 0), coalesce(round(nullif(d ->> 'ret_irrf', '')::numeric, 2), 0),
     coalesce(round(nullif(d ->> 'ret_inss', '')::numeric, 2), 0), coalesce(round(nullif(d ->> 'ret_pcc', '')::numeric, 2), 0),
     coalesce((d ->> 'retencao_recolhe')::boolean, false), coalesce((d ->> 'provisao')::boolean, false),
     nullif(d ->> 'tipo_titulo_id', '')::uuid, nullif(d ->> 'conta_prevista_id', '')::uuid,
     nullif(d ->> 'juros_dia_pct', '')::numeric, nullif(d ->> 'multa_pct', '')::numeric, nullif(d ->> 'desconto_ate', '')::date, nullif(d ->> 'desconto_valor', '')::numeric,
     nullif(d ->> 'codigo_barras', ''), nullif(d ->> 'pix_copia_cola', ''), coalesce(d ->> 'origem_tipo', 'manual'),
     nullif(d ->> 'entrada_id', '')::uuid, nullif(d ->> 'pedido_id', '')::uuid, nullif(d ->> 'cobranca_id', '')::uuid, nullif(d ->> 'pagamento_id', '')::uuid,
     nullif(d ->> 'nfe_chave', ''), nullif(d ->> 'grupo_id', '')::uuid, nullif(d ->> 'parcela_num', '')::int, nullif(d ->> 'parcela_total', '')::int,
     nullif(d ->> 'titulo_origem_id', '')::uuid, nullif(d ->> 'retencao_de_id', '')::uuid, nullif(d ->> 'adiantamento_id', '')::uuid, d ->> 'adiantamento_papel',
     (select auth.uid()))
  returning id into v_id;
  for r in select * from jsonb_array_elements(p_rateio) loop
    insert into financeiro.rel_titulo_rateio (empresa_id, titulo_id, natureza_id, cr_id, projeto_id, percentual, componente)
    values (p_empresa, v_id, (r ->> 'natureza_id')::uuid, (r ->> 'cr_id')::uuid, nullif(r ->> 'projeto_id', '')::uuid,
            (r ->> 'percentual')::numeric, coalesce(r ->> 'componente', 'principal'));
  end loop;
  perform financeiro._rateio_conferir(v_id);
  return v_id;
end $$;

-- Parceiro do órgão para guias de retenção (cria na primeira vez e guarda nos parâmetros)
create function financeiro._parceiro_orgao(p_empresa uuid, p_orgao text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select case p_orgao when 'prefeitura' then parceiro_prefeitura_id else parceiro_receita_id end into v
    from financeiro.cfg_financeiro where empresa_id = p_empresa;
  if v is null then
    insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, origem, observacao)
    values (p_empresa, case p_orgao when 'prefeitura' then 'Prefeitura Municipal' else 'Receita Federal' end, 'J', 'manual',
            'Criado pelo financeiro para as guias de impostos retidos')
    returning id into v;
    if p_orgao = 'prefeitura' then update financeiro.cfg_financeiro set parceiro_prefeitura_id = v where empresa_id = p_empresa;
    else update financeiro.cfg_financeiro set parceiro_receita_id = v where empresa_id = p_empresa; end if;
  end if;
  return v;
end $$;

-- Guias a pagar das retenções de um título (a Ane recolhe; o fornecedor recebe o líquido)
create function financeiro._gerar_guias(p_titulo uuid) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo; c financeiro.cfg_financeiro; v_ids uuid[] := '{}'; x record; v_venc date; v_tt uuid; v_cr uuid;
begin
  select * into t from financeiro.mov_titulo where id = p_titulo;
  select * into c from financeiro.cfg_financeiro where empresa_id = t.empresa_id;
  v_venc := (date_trunc('month', t.competencia) + interval '1 month')::date + (c.dia_vencimento_retencao - 1);
  select id into v_tt from financeiro.cad_tipo_titulo where empresa_id = t.empresa_id and codigo = 'GUIA';
  v_cr := coalesce(c.cr_financeiro_id, (select cr_id from financeiro.rel_titulo_rateio where titulo_id = p_titulo order by percentual desc limit 1));
  for x in select * from (values ('ISS retido', t.ret_iss, 'prefeitura', c.nat_iss_id), ('IRRF retido', t.ret_irrf, 'receita', c.nat_irrf_id),
                                 ('INSS retido', t.ret_inss, 'receita', c.nat_inss_id), ('PIS/COFINS/CSLL retidos', t.ret_pcc, 'receita', c.nat_pcc_id)) v(nome, valor, orgao, nat)
            where v.valor > 0 loop
    v_ids := v_ids || financeiro._novo_titulo(t.empresa_id, jsonb_build_object(
      'tipo', 'D', 'parceiro_id', financeiro._parceiro_orgao(t.empresa_id, x.orgao),
      'documento', x.nome || ' · ' || coalesce(t.documento, 'título #' || t.numero),
      'historico', 'Guia da retenção do título #' || t.numero, 'emissao', t.emissao, 'competencia', t.competencia,
      'vencimento', v_venc, 'valor_original', x.valor, 'tipo_titulo_id', v_tt, 'origem_tipo', 'retencao', 'retencao_de_id', t.id),
      jsonb_build_array(jsonb_build_object('natureza_id', x.nat, 'cr_id', v_cr, 'percentual', 100)));
  end loop;
  return v_ids;
end $$;

-- Situação exibida (vencido e conciliado são calculados)
create function financeiro._sit_exibicao(t financeiro.mov_titulo) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when t.situacao in ('cancelado','renegociado') then t.situacao
    when t.situacao = 'baixado' then
      case when exists (select 1 from financeiro.mov_baixa b join financeiro.mov_conta_movimento m on m.id = b.movimento_id
                         where b.titulo_id = t.id and not b.estornada and not m.conciliado) then 'baixado' else 'conciliado' end
    when t.provisao then 'provisao'
    when t.situacao = 'parcial' then 'parcial'
    when t.vencimento < financeiro._hoje() then 'vencido'
    else 'aberto' end
$$;

create function financeiro._titulo_resumo(t financeiro.mov_titulo) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'numero', t.numero, 'tipo', t.tipo, 'parceiro_id', t.parceiro_id, 'parceiro_nome', p.nome,
    'documento', t.documento, 'historico', t.historico, 'emissao', t.emissao, 'competencia', t.competencia,
    'vencimento', t.vencimento, 'vencimento_original', t.vencimento_original,
    'valor_original', t.valor_original, 'retencoes', t.valor_original - t.valor_liquido, 'valor_liquido', t.valor_liquido,
    'saldo', t.saldo, 'baixado', t.valor_liquido - t.saldo,
    'pct_baixado', case when t.valor_liquido > 0 then round((t.valor_liquido - t.saldo) / t.valor_liquido * 100) else 0 end,
    'situacao', t.situacao, 'situacao_exibicao', financeiro._sit_exibicao(t), 'provisao', t.provisao,
    'origem_tipo', t.origem_tipo, 'tipo_titulo', tt.nome, 'conta_prevista', cb.nome,
    'grupo_id', t.grupo_id, 'parcela', case when t.grupo_id is not null then t.parcela_num || '/' || t.parcela_total end,
    'natureza', (select n.codigo || ' · ' || n.nome from financeiro.rel_titulo_rateio r join financeiro.cad_natureza n on n.id = r.natureza_id
                  where r.titulo_id = t.id order by r.percentual desc limit 1),
    'cr', (select c.codigo || ' · ' || c.nome from financeiro.rel_titulo_rateio r join financeiro.cad_centro_resultado c on c.id = r.cr_id
            where r.titulo_id = t.id order by r.percentual desc limit 1),
    'linhas_rateio', (select count(*) from financeiro.rel_titulo_rateio r where r.titulo_id = t.id))
  from crm.cad_parceiro p
  left join financeiro.cad_tipo_titulo tt on tt.id = t.tipo_titulo_id
  left join financeiro.cad_conta_bancaria cb on cb.id = t.conta_prevista_id
  where p.id = t.parceiro_id
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'financeiro' and p.proname in ('_rateio_de','_novo_titulo','_parceiro_orgao','_gerar_guias','_sit_exibicao','_titulo_resumo') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.s);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------
create function api.fin_cadastros(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  return jsonb_build_object(
    'contas', coalesce((select jsonb_agg(to_jsonb(c) - 'empresa_id' order by c.ativa desc, c.nome) from financeiro.cad_conta_bancaria c where c.empresa_id = p_empresa), '[]'),
    'tipos', coalesce((select jsonb_agg((to_jsonb(t) - 'empresa_id') || jsonb_build_object('natureza_taxa', n.codigo || ' · ' || n.nome) order by t.ordem, t.nome)
                         from financeiro.cad_tipo_titulo t left join financeiro.cad_natureza n on n.id = t.natureza_taxa_id where t.empresa_id = p_empresa), '[]'),
    'projetos', coalesce((select jsonb_agg(to_jsonb(p) - 'empresa_id' order by p.situacao, p.codigo) from financeiro.cad_projeto p where p.empresa_id = p_empresa), '[]'),
    'naturezas', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'codigo', n.codigo, 'nome', n.nome, 'caminho', n.caminho_nome, 'sinal', n.sinal,
                             'reconhece_em', n.reconhece_em, 'cr_padrao_id', n.cr_padrao_id) order by n.codigo)
                           from financeiro.cad_natureza n where n.empresa_id = p_empresa and n.analitico and n.ativo), '[]'),
    'centros', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome, 'caminho', c.caminho_nome, 'aceita_receita', c.aceita_receita) order by c.codigo)
                         from financeiro.cad_centro_resultado c where c.empresa_id = p_empresa and c.analitico and c.ativo), '[]'),
    'parametros', (select to_jsonb(c) - 'empresa_id' from financeiro.cfg_financeiro c where c.empresa_id = p_empresa));
end $$;

create function api.fin_conta_salvar(p_empresa uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if v_id is null then
    insert into financeiro.cad_conta_bancaria (empresa_id, nome, tipo, banco_codigo, agencia, conta, saldo_inicial, data_saldo_inicial, permite_negativo, observacao)
    values (p_empresa, btrim(p_dados ->> 'nome'), p_dados ->> 'tipo', nullif(p_dados ->> 'banco_codigo', ''), nullif(p_dados ->> 'agencia', ''), nullif(p_dados ->> 'conta', ''),
            coalesce(round((p_dados ->> 'saldo_inicial')::numeric, 2), 0), coalesce((p_dados ->> 'data_saldo_inicial')::date, financeiro._hoje()),
            coalesce((p_dados ->> 'permite_negativo')::boolean, true), nullif(p_dados ->> 'observacao', ''))
    returning id into v_id;
  else
    update financeiro.cad_conta_bancaria set
      nome = coalesce(btrim(p_dados ->> 'nome'), nome), tipo = coalesce(p_dados ->> 'tipo', tipo),
      banco_codigo = case when p_dados ? 'banco_codigo' then nullif(p_dados ->> 'banco_codigo', '') else banco_codigo end,
      agencia = case when p_dados ? 'agencia' then nullif(p_dados ->> 'agencia', '') else agencia end,
      conta = case when p_dados ? 'conta' then nullif(p_dados ->> 'conta', '') else conta end,
      saldo_inicial = coalesce(round((p_dados ->> 'saldo_inicial')::numeric, 2), saldo_inicial),
      data_saldo_inicial = coalesce((p_dados ->> 'data_saldo_inicial')::date, data_saldo_inicial),
      permite_negativo = coalesce((p_dados ->> 'permite_negativo')::boolean, permite_negativo),
      ativa = coalesce((p_dados ->> 'ativa')::boolean, ativa),
      observacao = case when p_dados ? 'observacao' then nullif(p_dados ->> 'observacao', '') else observacao end
    where id = v_id and empresa_id = p_empresa;
    if not found then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create function api.fin_tipo_titulo_salvar(p_empresa uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if nullif(p_dados ->> 'conta_padrao_id', '') is not null and not exists (select 1 from financeiro.cad_conta_bancaria where id = (p_dados ->> 'conta_padrao_id')::uuid and empresa_id = p_empresa) then
    raise exception 'conta inexistente nesta empresa' using errcode = '23503'; end if;
  if nullif(p_dados ->> 'natureza_taxa_id', '') is not null and not exists (select 1 from financeiro.cad_natureza where id = (p_dados ->> 'natureza_taxa_id')::uuid and empresa_id = p_empresa and analitico) then
    raise exception 'natureza da taxa inválida' using errcode = '23503'; end if;
  if v_id is null then
    insert into financeiro.cad_tipo_titulo (empresa_id, codigo, nome, meio, aplica_a, conta_padrao_id, natureza_taxa_id, taxa_pct, taxa_fixa, dias_compensacao, baixa_automatica, exige_codigo_barras, ordem)
    values (p_empresa, upper(btrim(p_dados ->> 'codigo')), btrim(p_dados ->> 'nome'), p_dados ->> 'meio', coalesce(p_dados ->> 'aplica_a', 'A'),
            nullif(p_dados ->> 'conta_padrao_id', '')::uuid, nullif(p_dados ->> 'natureza_taxa_id', '')::uuid,
            coalesce((p_dados ->> 'taxa_pct')::numeric, 0), coalesce((p_dados ->> 'taxa_fixa')::numeric, 0), coalesce((p_dados ->> 'dias_compensacao')::int, 0),
            coalesce((p_dados ->> 'baixa_automatica')::boolean, false), coalesce((p_dados ->> 'exige_codigo_barras')::boolean, false), coalesce((p_dados ->> 'ordem')::int, 100))
    returning id into v_id;
  else
    update financeiro.cad_tipo_titulo set
      nome = coalesce(btrim(p_dados ->> 'nome'), nome), meio = coalesce(p_dados ->> 'meio', meio), aplica_a = coalesce(p_dados ->> 'aplica_a', aplica_a),
      conta_padrao_id = case when p_dados ? 'conta_padrao_id' then nullif(p_dados ->> 'conta_padrao_id', '')::uuid else conta_padrao_id end,
      natureza_taxa_id = case when p_dados ? 'natureza_taxa_id' then nullif(p_dados ->> 'natureza_taxa_id', '')::uuid else natureza_taxa_id end,
      taxa_pct = coalesce((p_dados ->> 'taxa_pct')::numeric, taxa_pct), taxa_fixa = coalesce((p_dados ->> 'taxa_fixa')::numeric, taxa_fixa),
      dias_compensacao = coalesce((p_dados ->> 'dias_compensacao')::int, dias_compensacao),
      baixa_automatica = coalesce((p_dados ->> 'baixa_automatica')::boolean, baixa_automatica),
      exige_codigo_barras = coalesce((p_dados ->> 'exige_codigo_barras')::boolean, exige_codigo_barras),
      ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo), ordem = coalesce((p_dados ->> 'ordem')::int, ordem)
    where id = v_id and empresa_id = p_empresa;
    if not found then raise exception 'tipo de título não encontrado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create function api.fin_projeto_salvar(p_empresa uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if v_id is null then
    insert into financeiro.cad_projeto (empresa_id, codigo, nome, inicio, fim, responsavel_id, orcamento, observacao)
    values (p_empresa, btrim(p_dados ->> 'codigo'), btrim(p_dados ->> 'nome'), nullif(p_dados ->> 'inicio', '')::date, nullif(p_dados ->> 'fim', '')::date,
            nullif(p_dados ->> 'responsavel_id', '')::uuid, nullif(p_dados ->> 'orcamento', '')::numeric, nullif(p_dados ->> 'observacao', ''))
    returning id into v_id;
  else
    update financeiro.cad_projeto set
      nome = coalesce(btrim(p_dados ->> 'nome'), nome),
      inicio = case when p_dados ? 'inicio' then nullif(p_dados ->> 'inicio', '')::date else inicio end,
      fim = case when p_dados ? 'fim' then nullif(p_dados ->> 'fim', '')::date else fim end,
      situacao = coalesce(p_dados ->> 'situacao', situacao),
      responsavel_id = case when p_dados ? 'responsavel_id' then nullif(p_dados ->> 'responsavel_id', '')::uuid else responsavel_id end,
      orcamento = case when p_dados ? 'orcamento' then nullif(p_dados ->> 'orcamento', '')::numeric else orcamento end,
      observacao = case when p_dados ? 'observacao' then nullif(p_dados ->> 'observacao', '') else observacao end
    where id = v_id and empresa_id = p_empresa;
    if not found then raise exception 'projeto não encontrado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- Parâmetros (admin e gestor). Chaves aceitas: as colunas de financeiro.cfg_financeiro.
create function api.fin_cfg_salvar(p_empresa uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; v_cols text[] := array['nat_juros_recebidos_id','nat_multa_recebida_id','nat_desconto_concedido_id','nat_taxa_receber_id','nat_juros_pagos_id',
  'nat_multa_paga_id','nat_desconto_obtido_id','nat_tarifa_pagar_id','nat_adiant_cliente_id','nat_adiant_fornecedor_id','nat_iss_id','nat_irrf_id','nat_inss_id',
  'nat_pcc_id','nat_transferencia_id','cr_financeiro_id','parceiro_prefeitura_id','parceiro_receita_id','dia_vencimento_retencao','data_fechamento','janela_conciliacao_dias'];
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  insert into financeiro.cfg_financeiro (empresa_id) values (p_empresa) on conflict do nothing;
  for k in select jsonb_object_keys(p_dados) loop
    if not (k = any (v_cols)) then raise exception 'parâmetro desconhecido: %', k using errcode = '22023'; end if;
    execute format('update financeiro.cfg_financeiro set %I = %L where empresa_id = %L', k, nullif(p_dados ->> k, ''), p_empresa);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Títulos
-- ---------------------------------------------------------------------------
-- Cria um título ou um parcelamento/contrato/recorrência (N títulos amarrados no mesmo grupo).
-- Retenções (NFS-e) entram na 1ª parcela; com retencao_recolhe, gera as guias a pagar.
create function api.fin_titulo_criar(p_empresa uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb := p_dados; n int := coalesce(nullif(p_dados ->> 'parcelas', '')::int, 1);
  v_total numeric := round(coalesce(nullif(p_dados ->> 'valor_total', ''), p_dados ->> 'valor_original')::numeric, 2);
  v_vals numeric[]; v_rat jsonb; v_g uuid; v_ids uuid[] := '{}'; v_id uuid; i int;
  v_per text := coalesce(p_dados ->> 'periodicidade', 'mensal'); v_dias int := nullif(p_dados ->> 'intervalo_dias', '')::int;
  v_ini date := nullif(p_dados ->> 'vencimento', '')::date; v_ret jsonb := coalesce(p_dados -> 'retencoes', '{}');
  v_origem text := coalesce(p_dados ->> 'origem_tipo', 'manual'); v_guias uuid[] := '{}'; v_comp date;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if v_total is null or v_total <= 0 then raise exception 'informe o valor' using errcode = '22023'; end if;
  if v_ini is null then raise exception 'informe o vencimento' using errcode = '22023'; end if;
  if n < 1 or n > 360 then raise exception 'número de parcelas entre 1 e 360' using errcode = '22023'; end if;
  if v_origem not in ('manual','nfse_entrada','recorrente','parcelamento','implantacao') then
    raise exception 'origem % não é lançada por aqui', v_origem using errcode = '22023'; end if;
  if v_origem = 'recorrente' and n < 2 then raise exception 'recorrência precisa de pelo menos 2 lançamentos' using errcode = '22023'; end if;
  v_rat := financeiro._rateio_de(p_empresa, d);
  v_vals := case when v_origem = 'recorrente' and jsonb_typeof(d -> 'valores') is distinct from 'array'
                 then array_fill(v_total, array[n]) else financeiro._dividir(v_total, n, d -> 'valores') end;
  v_comp := coalesce(nullif(d ->> 'competencia', '')::date, nullif(d ->> 'emissao', '')::date, financeiro._hoje());
  if n > 1 then
    insert into financeiro.mov_grupo_titulo (empresa_id, tipo, descricao, total, parcelas, periodicidade, intervalo_dias, criado_por)
    values (p_empresa, case when v_origem = 'recorrente' then 'recorrente' when d ->> 'grupo_tipo' = 'contrato' then 'contrato' else 'parcelamento' end,
            coalesce(nullif(btrim(d ->> 'documento'), ''), nullif(btrim(d ->> 'historico'), ''), 'Parcelamento'),
            (select sum(x) from unnest(v_vals) x), n, v_per, v_dias, (select auth.uid()))
    returning id into v_g;
  end if;
  for i in 1 .. n loop
    v_id := financeiro._novo_titulo(p_empresa, d || jsonb_build_object(
      'valor_original', v_vals[i],
      'vencimento', financeiro._venc(v_ini, i - 1, v_per, v_dias),
      'competencia', case when v_origem = 'recorrente' then financeiro._venc(v_comp, i - 1, v_per, v_dias) else v_comp end,
      'documento', case when n > 1 then concat_ws(' · ', nullif(btrim(d ->> 'documento'), ''), i || '/' || n) else d ->> 'documento' end,
      'ret_iss', case when i = 1 then v_ret ->> 'iss' end, 'ret_irrf', case when i = 1 then v_ret ->> 'irrf' end,
      'ret_inss', case when i = 1 then v_ret ->> 'inss' end, 'ret_pcc', case when i = 1 then v_ret ->> 'pcc' end,
      'retencao_recolhe', i = 1 and coalesce((d ->> 'retencao_recolhe')::boolean, false),
      'grupo_id', v_g, 'parcela_num', case when n > 1 then i end, 'parcela_total', case when n > 1 then n end), v_rat);
    v_ids := v_ids || v_id;
  end loop;
  if coalesce((d ->> 'retencao_recolhe')::boolean, false) then
    if d ->> 'tipo' <> 'D' then raise exception 'guias de retenção só em contas a pagar' using errcode = '22023'; end if;
    v_guias := financeiro._gerar_guias(v_ids[1]);
  end if;
  return jsonb_build_object('titulos', to_jsonb(v_ids), 'guias', to_jsonb(v_guias), 'grupo_id', v_g);
end $$;

-- Edição. Valor, parceiro e tipo seguem as travas do gatilho (nota, baixa, renegociação). Rateio é substituído inteiro.
create function api.fin_titulo_salvar(p_empresa uuid, p_titulo uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo; r jsonb;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into t from financeiro.mov_titulo where id = p_titulo and empresa_id = p_empresa for update;
  if not found then raise exception 'título não encontrado' using errcode = 'P0002'; end if;
  if t.situacao in ('cancelado','renegociado') then raise exception 'título #% está % e não se edita', t.numero, t.situacao using errcode = '55000'; end if;
  update financeiro.mov_titulo set
    tipo = coalesce(p_dados ->> 'tipo', tipo),
    parceiro_id = coalesce(nullif(p_dados ->> 'parceiro_id', '')::uuid, parceiro_id),
    documento = case when p_dados ? 'documento' then nullif(btrim(p_dados ->> 'documento'), '') else documento end,
    historico = case when p_dados ? 'historico' then nullif(btrim(p_dados ->> 'historico'), '') else historico end,
    emissao = coalesce(nullif(p_dados ->> 'emissao', '')::date, emissao),
    competencia = coalesce(nullif(p_dados ->> 'competencia', '')::date, competencia),
    vencimento = coalesce(nullif(p_dados ->> 'vencimento', '')::date, vencimento),
    valor_original = coalesce(round(nullif(p_dados ->> 'valor_original', '')::numeric, 2), valor_original),
    ret_iss = coalesce(round(nullif(p_dados -> 'retencoes' ->> 'iss', '')::numeric, 2), ret_iss),
    ret_irrf = coalesce(round(nullif(p_dados -> 'retencoes' ->> 'irrf', '')::numeric, 2), ret_irrf),
    ret_inss = coalesce(round(nullif(p_dados -> 'retencoes' ->> 'inss', '')::numeric, 2), ret_inss),
    ret_pcc = coalesce(round(nullif(p_dados -> 'retencoes' ->> 'pcc', '')::numeric, 2), ret_pcc),
    tipo_titulo_id = case when p_dados ? 'tipo_titulo_id' then nullif(p_dados ->> 'tipo_titulo_id', '')::uuid else tipo_titulo_id end,
    conta_prevista_id = case when p_dados ? 'conta_prevista_id' then nullif(p_dados ->> 'conta_prevista_id', '')::uuid else conta_prevista_id end,
    juros_dia_pct = case when p_dados ? 'juros_dia_pct' then nullif(p_dados ->> 'juros_dia_pct', '')::numeric else juros_dia_pct end,
    multa_pct = case when p_dados ? 'multa_pct' then nullif(p_dados ->> 'multa_pct', '')::numeric else multa_pct end,
    desconto_ate = case when p_dados ? 'desconto_ate' then nullif(p_dados ->> 'desconto_ate', '')::date else desconto_ate end,
    desconto_valor = case when p_dados ? 'desconto_valor' then nullif(p_dados ->> 'desconto_valor', '')::numeric else desconto_valor end,
    codigo_barras = case when p_dados ? 'codigo_barras' then nullif(p_dados ->> 'codigo_barras', '') else codigo_barras end,
    pix_copia_cola = case when p_dados ? 'pix_copia_cola' then nullif(p_dados ->> 'pix_copia_cola', '') else pix_copia_cola end
  where id = p_titulo;
  if p_dados ? 'rateio' or p_dados ? 'natureza_id' then
    delete from financeiro.rel_titulo_rateio where titulo_id = p_titulo;
    for r in select * from jsonb_array_elements(financeiro._rateio_de(p_empresa, p_dados)) loop
      insert into financeiro.rel_titulo_rateio (empresa_id, titulo_id, natureza_id, cr_id, projeto_id, percentual, componente)
      values (p_empresa, p_titulo, (r ->> 'natureza_id')::uuid, (r ->> 'cr_id')::uuid, nullif(r ->> 'projeto_id', '')::uuid, (r ->> 'percentual')::numeric, coalesce(r ->> 'componente', 'principal'));
    end loop;
    perform financeiro._rateio_conferir(p_titulo);
  end if;
end $$;

-- Lista com filtros. situacoes: aberto, vencido, parcial, baixado, conciliado, renegociado, provisao, cancelado.
create function api.fin_titulos_listar(p_empresa uuid, p_filtros jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f jsonb := coalesce(p_filtros, '{}'); v_lim int := least(coalesce(nullif(p_filtros ->> 'limite', '')::int, 500), 2000);
  v_q text := nullif(lower(btrim(p_filtros ->> 'busca')), ''); r jsonb;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  with base as (
    select t, financeiro._sit_exibicao(t) sx, p.nome parceiro
      from financeiro.mov_titulo t join crm.cad_parceiro p on p.id = t.parceiro_id
     where t.empresa_id = p_empresa
       and (f ->> 'tipo' is null or t.tipo = f ->> 'tipo')
       and (nullif(f ->> 'de', '') is null or t.vencimento >= (f ->> 'de')::date)
       and (nullif(f ->> 'ate', '') is null or t.vencimento <= (f ->> 'ate')::date)
       and (nullif(f ->> 'parceiro_id', '') is null or t.parceiro_id = (f ->> 'parceiro_id')::uuid)
       and (nullif(f ->> 'origem_tipo', '') is null or t.origem_tipo = f ->> 'origem_tipo')
       and (nullif(f ->> 'grupo_id', '') is null or t.grupo_id = (f ->> 'grupo_id')::uuid)
       and (nullif(f ->> 'conta_id', '') is null or t.conta_prevista_id = (f ->> 'conta_id')::uuid
            or exists (select 1 from financeiro.mov_baixa b where b.titulo_id = t.id and b.conta_id = (f ->> 'conta_id')::uuid and not b.estornada))
       and (nullif(f ->> 'natureza_id', '') is null or exists (select 1 from financeiro.rel_titulo_rateio x where x.titulo_id = t.id and x.natureza_id = (f ->> 'natureza_id')::uuid))
       and (nullif(f ->> 'cr_id', '') is null or exists (select 1 from financeiro.rel_titulo_rateio x where x.titulo_id = t.id and x.cr_id = (f ->> 'cr_id')::uuid))
       and (nullif(f ->> 'projeto_id', '') is null or exists (select 1 from financeiro.rel_titulo_rateio x where x.titulo_id = t.id and x.projeto_id = (f ->> 'projeto_id')::uuid))
       and (v_q is null or lower(concat_ws(' ', p.nome, t.documento, t.historico, t.numero::text)) like '%' || v_q || '%')
  ), filtrada as (
    select * from base b
     where jsonb_typeof(f -> 'situacoes') is distinct from 'array' or jsonb_array_length(f -> 'situacoes') = 0
        or b.sx in (select jsonb_array_elements_text(f -> 'situacoes'))
  )
  select jsonb_build_object(
    'contagem', (select coalesce(jsonb_object_agg(sx, n), '{}') from (select sx, count(*) n from base group by sx) c),
    'resumo', (select jsonb_build_object(
        'receber_aberto', coalesce(sum((b.t).saldo) filter (where (b.t).tipo = 'R' and b.sx in ('aberto','vencido','parcial')), 0),
        'pagar_aberto', coalesce(sum((b.t).saldo) filter (where (b.t).tipo = 'D' and b.sx in ('aberto','vencido','parcial')), 0),
        'vencido_receber', coalesce(sum((b.t).saldo) filter (where (b.t).tipo = 'R' and (b.sx = 'vencido' or (b.sx = 'parcial' and (b.t).vencimento < financeiro._hoje()))), 0),
        'vencido_pagar', coalesce(sum((b.t).saldo) filter (where (b.t).tipo = 'D' and (b.sx = 'vencido' or (b.sx = 'parcial' and (b.t).vencimento < financeiro._hoje()))), 0),
        'provisoes', coalesce(sum((b.t).saldo) filter (where b.sx = 'provisao'), 0)) from base b),
    'total', (select count(*) from filtrada),
    'itens', coalesce((select jsonb_agg(financeiro._titulo_resumo(x.t) order by (x.t).vencimento, (x.t).numero)
                         from (select * from filtrada order by (t).vencimento, (t).numero limit v_lim) x), '[]'))
  into r;
  return r;
end $$;

-- Detalhe: composição, efeito no caixa, rateio, baixas e todos os vínculos
create function api.fin_titulo_obter(p_empresa uuid, p_titulo uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t financeiro.mov_titulo; v jsonb;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into t from financeiro.mov_titulo where id = p_titulo and empresa_id = p_empresa;
  if not found then raise exception 'título não encontrado' using errcode = 'P0002'; end if;
  v := financeiro._titulo_resumo(t) || jsonb_build_object(
    'retencoes_detalhe', jsonb_build_object('iss', t.ret_iss, 'irrf', t.ret_irrf, 'inss', t.ret_inss, 'pcc', t.ret_pcc, 'recolhe', t.retencao_recolhe),
    'tipo_titulo_id', t.tipo_titulo_id, 'conta_prevista_id', t.conta_prevista_id,
    'juros_dia_pct', t.juros_dia_pct, 'multa_pct', t.multa_pct, 'desconto_ate', t.desconto_ate, 'desconto_valor', t.desconto_valor,
    'codigo_barras', t.codigo_barras, 'pix_copia_cola', t.pix_copia_cola,
    'cancelado_em', t.cancelado_em, 'motivo_cancelamento', t.motivo_cancelamento,
    'rateio', coalesce((select jsonb_agg(jsonb_build_object('natureza_id', r.natureza_id, 'natureza', n.codigo || ' · ' || n.nome, 'cr_id', r.cr_id, 'cr', cr.codigo || ' · ' || cr.nome,
                 'projeto_id', r.projeto_id, 'projeto', pj.nome, 'percentual', r.percentual, 'componente', r.componente,
                 'valor', round(t.valor_original * r.percentual / 100, 2)) order by r.componente, r.percentual desc)
               from financeiro.rel_titulo_rateio r join financeiro.cad_natureza n on n.id = r.natureza_id join financeiro.cad_centro_resultado cr on cr.id = r.cr_id
               left join financeiro.cad_projeto pj on pj.id = r.projeto_id where r.titulo_id = t.id), '[]'),
    'baixas', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'data', b.data, 'tipo', b.tipo, 'principal', b.valor_principal, 'juros', b.juros, 'multa', b.multa,
                 'desconto', b.desconto, 'taxa', b.taxa, 'movimentado', b.valor_movimentado, 'parcial', b.valor_principal < t.valor_liquido,
                 'conta_id', b.conta_id, 'conta', cb.nome, 'lote', l.numero, 'lote_tipo', l.tipo, 'tipo_titulo', tt.nome,
                 'renegociacao', rn.numero, 'estornada', b.estornada, 'estornada_em', b.estornada_em, 'motivo_estorno', b.motivo_estorno,
                 'conciliado', m.conciliado, 'data_banco', m.data_conciliacao, 'conciliado_em', m.conciliado_em, 'historico', b.historico) order by b.data, b.criado_em)
               from financeiro.mov_baixa b left join financeiro.cad_conta_bancaria cb on cb.id = b.conta_id
               left join financeiro.mov_baixa_lote l on l.id = b.lote_id left join financeiro.cad_tipo_titulo tt on tt.id = b.tipo_titulo_id
               left join financeiro.mov_renegociacao rn on rn.id = b.renegociacao_id left join financeiro.mov_conta_movimento m on m.id = b.movimento_id
              where b.titulo_id = t.id), '[]'),
    'caixa', (select jsonb_build_object('principal', coalesce(sum(b.valor_principal), 0), 'juros_multa', coalesce(sum(b.juros + b.multa), 0),
                'desconto', coalesce(sum(b.desconto), 0), 'taxa', coalesce(sum(b.taxa), 0), 'movimentado', coalesce(sum(b.valor_movimentado), 0))
                from financeiro.mov_baixa b where b.titulo_id = t.id and not b.estornada and b.tipo <> 'renegociacao'),
    'renegociado_total', (select coalesce(sum(b.valor_principal), 0) from financeiro.mov_baixa b where b.titulo_id = t.id and not b.estornada and b.tipo = 'renegociacao'),
    'vinculos', jsonb_build_object(
      'entrada', (select jsonb_build_object('id', e.id, 'numero', e.numero, 'chave', e.chave_acesso, 'fornecedor', e.fornecedor_nome, 'parcela_id', t.entrada_parcela_id)
                    from compra.mov_entrada e where e.id = t.entrada_id),
      'pedido', (select jsonb_build_object('id', pd.id, 'numero', pd.numero, 'nfe_numero', pd.nfe_numero, 'nfe_chave', pd.nfe_chave) from venda.mov_pedido pd where pd.id = t.pedido_id),
      'grupo', (select jsonb_build_object('id', g.id, 'tipo', g.tipo, 'descricao', g.descricao, 'parcelas', g.parcelas,
                  'titulos', (select jsonb_agg(financeiro._titulo_resumo(x) order by x.parcela_num) from financeiro.mov_titulo x where x.grupo_id = g.id))
                  from financeiro.mov_grupo_titulo g where g.id = t.grupo_id),
      'renegociado_em', coalesce((select jsonb_agg(jsonb_build_object('id', rn.id, 'numero', rn.numero, 'situacao', rn.situacao, 'novo_total', rn.novo_total,
                  'novos', (select jsonb_agg(financeiro._titulo_resumo(x) order by x.parcela_num) from financeiro.rel_renegociacao_titulo q join financeiro.mov_titulo x on x.id = q.titulo_id
                             where q.renegociacao_id = rn.id and q.papel = 'novo')) order by rn.numero)
                  from financeiro.rel_renegociacao_titulo z join financeiro.mov_renegociacao rn on rn.id = z.renegociacao_id
                 where z.titulo_id = t.id and z.papel = 'original'), '[]'),
      'originado_de', (select jsonb_build_object('id', rn.id, 'numero', rn.numero, 'situacao', rn.situacao, 'total_original', rn.total_original, 'juros', rn.juros, 'desconto', rn.desconto,
                  'originais', (select jsonb_agg(financeiro._titulo_resumo(x) || jsonb_build_object('saldo_renegociado', q.saldo_renegociado) order by x.numero)
                                 from financeiro.rel_renegociacao_titulo q join financeiro.mov_titulo x on x.id = q.titulo_id
                                where q.renegociacao_id = rn.id and q.papel = 'original'))
                  from financeiro.rel_renegociacao_titulo z join financeiro.mov_renegociacao rn on rn.id = z.renegociacao_id
                 where z.titulo_id = t.id and z.papel = 'novo'),
      'adiantamento', (select jsonb_build_object('id', a.id, 'numero', a.numero, 'tipo', a.tipo, 'situacao', a.situacao, 'valor', a.valor, 'papel', t.adiantamento_papel,
                  'titulos', (select jsonb_agg(financeiro._titulo_resumo(x) || jsonb_build_object('papel', x.adiantamento_papel)) from financeiro.mov_titulo x where x.adiantamento_id = a.id))
                  from financeiro.mov_adiantamento a where a.id = t.adiantamento_id),
      'guias', coalesce((select jsonb_agg(financeiro._titulo_resumo(x) order by x.numero) from financeiro.mov_titulo x where x.retencao_de_id = t.id), '[]'),
      'retencao_de', (select financeiro._titulo_resumo(x) from financeiro.mov_titulo x where x.id = t.retencao_de_id),
      'duplicado_de', (select financeiro._titulo_resumo(x) from financeiro.mov_titulo x where x.id = t.titulo_origem_id),
      'provisao_substituida', (select financeiro._titulo_resumo(x) from financeiro.mov_titulo x where x.id = t.provisao_substituida_id),
      'substituido_por', (select financeiro._titulo_resumo(x) from financeiro.mov_titulo x where x.provisao_substituida_id = t.id limit 1)));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Baixa (simples, parcial, agrupada e compensação) e estorno
-- itens: [{titulo_id, valor (padrão = saldo), juros, multa, desconto, taxa, tipo_titulo_id}]
-- ---------------------------------------------------------------------------
create function api.fin_baixar(p_empresa uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; t financeiro.mov_titulo; v_data date := coalesce(nullif(p_dados ->> 'data', '')::date, financeiro._hoje());
  v_conta uuid := nullif(p_dados ->> 'conta_id', '')::uuid; v_n int := jsonb_array_length(coalesce(p_dados -> 'itens', '[]'));
  v_tipos int; v_parc int; v_achados int; v_net numeric := 0; v_mix boolean; v_lote uuid; v_lote_num bigint; v_mov uuid;
  v_val numeric; v_j numeric; v_m numeric; v_d numeric; v_tx numeric; v_mv numeric; v_ids uuid[] := '{}'; v_b uuid; v_hist text; v_primeiro financeiro.mov_titulo;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if v_n = 0 then raise exception 'informe os títulos a baixar' using errcode = '22023'; end if;
  select count(distinct q.tipo), count(distinct q.parceiro_id), count(*) into v_tipos, v_parc, v_achados
    from jsonb_array_elements(p_dados -> 'itens') x join financeiro.mov_titulo q on q.id = (x ->> 'titulo_id')::uuid and q.empresa_id = p_empresa;
  if v_achados <> v_n or (select count(distinct x ->> 'titulo_id') from jsonb_array_elements(p_dados -> 'itens') x) <> v_n then
    raise exception 'título repetido, inexistente ou de outra empresa' using errcode = '22023';
  end if;
  v_mix := v_tipos > 1;
  if v_mix and v_parc > 1 then raise exception 'compensação (receber e pagar juntos) só entre títulos do mesmo parceiro' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_dados -> 'itens') loop
    select * into t from financeiro.mov_titulo where id = (it ->> 'titulo_id')::uuid;
    v_val := round(coalesce(nullif(it ->> 'valor', '')::numeric, t.saldo), 2);
    v_j := coalesce(round(nullif(it ->> 'juros', '')::numeric, 2), 0); v_m := coalesce(round(nullif(it ->> 'multa', '')::numeric, 2), 0);
    v_d := coalesce(round(nullif(it ->> 'desconto', '')::numeric, 2), 0); v_tx := coalesce(round(nullif(it ->> 'taxa', '')::numeric, 2), 0);
    v_mv := case t.tipo when 'R' then v_val + v_j + v_m - v_d - v_tx else v_val + v_j + v_m - v_d + v_tx end;
    v_net := v_net + case t.tipo when 'R' then v_mv else -v_mv end;
  end loop;
  if abs(v_net) >= 0.005 then
    if v_conta is null then raise exception 'informe a conta da baixa' using errcode = '22023'; end if;
  elsif v_mix then
    v_conta := null;   -- compensação com líquido zero: não mexe no banco
  else
    raise exception 'a baixa não movimenta valor (confira desconto e taxa)' using errcode = '22023';
  end if;
  select * into v_primeiro from financeiro.mov_titulo where id = (p_dados -> 'itens' -> 0 ->> 'titulo_id')::uuid;
  if v_n > 1 then
    v_lote_num := financeiro._proximo(p_empresa, 'lote');
    insert into financeiro.mov_baixa_lote (empresa_id, numero, tipo, data, conta_id, valor_liquido, criado_por)
    values (p_empresa, v_lote_num, case when v_mix then 'compensacao' else 'agrupada' end, v_data, v_conta, round(v_net, 2), (select auth.uid()))
    returning id into v_lote;
  end if;
  v_hist := coalesce(nullif(btrim(p_dados ->> 'historico'), ''),
    case when v_n > 1 then (case when v_mix then 'Compensação' else 'Baixa agrupada' end) || ' L-' || v_lote_num || ' · ' || v_n || ' títulos'
         else 'Baixa do título #' || v_primeiro.numero || ' · ' || coalesce((select nome from crm.cad_parceiro where id = v_primeiro.parceiro_id), '') end);
  if v_conta is not null then
    insert into financeiro.mov_conta_movimento (empresa_id, conta_id, data, valor, tipo, historico, lote_id, criado_por)
    values (p_empresa, v_conta, v_data, round(v_net, 2), 'baixa', v_hist, v_lote, (select auth.uid()))
    returning id into v_mov;
  end if;
  for it in select * from jsonb_array_elements(p_dados -> 'itens') loop
    select * into t from financeiro.mov_titulo where id = (it ->> 'titulo_id')::uuid;
    insert into financeiro.mov_baixa (empresa_id, titulo_id, lote_id, tipo, data, valor_principal, juros, multa, desconto, taxa, valor_movimentado,
                                      conta_id, tipo_titulo_id, movimento_id, historico, criado_por)
    values (p_empresa, t.id, v_lote, case when v_mix then 'compensacao' else 'normal' end, v_data,
            round(coalesce(nullif(it ->> 'valor', '')::numeric, t.saldo), 2),
            coalesce(round(nullif(it ->> 'juros', '')::numeric, 2), 0), coalesce(round(nullif(it ->> 'multa', '')::numeric, 2), 0),
            coalesce(round(nullif(it ->> 'desconto', '')::numeric, 2), 0), coalesce(round(nullif(it ->> 'taxa', '')::numeric, 2), 0), 0,
            v_conta, coalesce(nullif(it ->> 'tipo_titulo_id', '')::uuid, t.tipo_titulo_id), v_mov, v_hist, (select auth.uid()))
    returning id into v_b;
    v_ids := v_ids || v_b;
  end loop;
  return jsonb_build_object('baixas', to_jsonb(v_ids), 'lote_id', v_lote, 'lote_numero', v_lote_num, 'movimento_id', v_mov,
                            'liquido', round(v_net, 2), 'compensacao', v_mix);
end $$;

-- Estorna a baixa (ou o lote inteiro): o saldo do título volta; movimento conciliado bloqueia
create function api.fin_baixa_estornar(p_empresa uuid, p_baixa uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b financeiro.mov_baixa; t financeiro.mov_titulo; v_n int;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if nullif(btrim(p_motivo), '') is null then raise exception 'informe o motivo do estorno' using errcode = '22023'; end if;
  select * into b from financeiro.mov_baixa where id = p_baixa and empresa_id = p_empresa for update;
  if not found then raise exception 'baixa não encontrada' using errcode = 'P0002'; end if;
  if b.estornada then raise exception 'baixa já estornada' using errcode = '55000'; end if;
  if b.tipo = 'renegociacao' then raise exception 'esta baixa é da renegociação: desfaça a renegociação' using errcode = '55000'; end if;
  select * into t from financeiro.mov_titulo where id = b.titulo_id;
  if t.adiantamento_papel = 'entrada' and exists (select 1 from financeiro.mov_titulo c join financeiro.mov_baixa x on x.titulo_id = c.id
       where c.adiantamento_id = t.adiantamento_id and c.adiantamento_papel = 'contrapartida' and not x.estornada) then
    raise exception 'o adiantamento já foi compensado: estorne a compensação antes' using errcode = '55000';
  end if;
  if exists (select 1 from financeiro.mov_conta_movimento m where m.conciliado and m.id in
             (select x.movimento_id from financeiro.mov_baixa x where (b.lote_id is not null and x.lote_id = b.lote_id) or x.id = b.id)) then
    raise exception 'a baixa já está conciliada com o extrato: desconcilie antes de estornar' using errcode = '55000';
  end if;
  update financeiro.mov_conta_movimento set estornado = true, estornado_em = now(), estornado_por = (select auth.uid())
   where not estornado and id in (select x.movimento_id from financeiro.mov_baixa x where (b.lote_id is not null and x.lote_id = b.lote_id) or x.id = b.id);
  update financeiro.mov_baixa set estornada = true, estornada_por = (select auth.uid()), motivo_estorno = btrim(p_motivo)
   where not estornada and ((b.lote_id is not null and lote_id = b.lote_id) or id = b.id);
  get diagnostics v_n = row_count;
  if b.lote_id is not null then update financeiro.mov_baixa_lote set estornado = true where id = b.lote_id; end if;
  return jsonb_build_object('baixas_estornadas', v_n, 'lote_id', b.lote_id);
end $$;

-- ---------------------------------------------------------------------------
-- Cancelar, duplicar, provisão
-- p_modo: titulo (avulso) | grupo (todas em aberto do grupo) | grupo_a_partir (esta e as seguintes)
-- ---------------------------------------------------------------------------
create function api.fin_titulo_cancelar(p_empresa uuid, p_titulo uuid, p_motivo text, p_modo text default 'titulo') returns int
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo; v_ids uuid[]; v_n int;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if nullif(btrim(p_motivo), '') is null then raise exception 'informe o motivo do cancelamento' using errcode = '22023'; end if;
  select * into t from financeiro.mov_titulo where id = p_titulo and empresa_id = p_empresa for update;
  if not found then raise exception 'título não encontrado' using errcode = 'P0002'; end if;
  if t.situacao in ('cancelado','renegociado') then raise exception 'título #% já está %', t.numero, t.situacao using errcode = '55000'; end if;
  if t.origem_tipo = 'nfe_entrada' then raise exception 'título #% vem da NF-e: o cancelamento é feito pela entrada de mercadoria', t.numero using errcode = '55000'; end if;
  if t.adiantamento_id is not null then raise exception 'título #% é de adiantamento: cancele o adiantamento', t.numero using errcode = '55000'; end if;
  if t.origem_tipo = 'renegociacao' then raise exception 'título #% é de renegociação: desfaça a renegociação', t.numero using errcode = '55000'; end if;
  if t.grupo_id is not null and p_modo = 'titulo' then
    raise exception 'título #% faz parte de um grupo (% de %): cancele pelo grupo', t.numero, t.parcela_num, t.parcela_total using errcode = '55000';
  end if;
  select array_agg(x.id) into v_ids from financeiro.mov_titulo x
   where (x.id = t.id or (p_modo = 'grupo' and x.grupo_id = t.grupo_id) or (p_modo = 'grupo_a_partir' and x.grupo_id = t.grupo_id and x.parcela_num >= t.parcela_num))
     and x.situacao = 'aberto' and not exists (select 1 from financeiro.mov_baixa b where b.titulo_id = x.id and not b.estornada);
  if v_ids is null or not (t.id = any (v_ids)) then
    raise exception 'título #% tem baixa: estorne antes de cancelar', t.numero using errcode = '55000';
  end if;
  -- guias de retenção sem baixa acompanham
  v_ids := v_ids || coalesce((select array_agg(g.id) from financeiro.mov_titulo g where g.retencao_de_id = any (v_ids) and g.situacao = 'aberto'), '{}');
  if exists (select 1 from financeiro.mov_titulo g where g.retencao_de_id = any (v_ids) and g.situacao not in ('aberto','cancelado')) then
    raise exception 'há guia de retenção já baixada: estorne a guia antes' using errcode = '55000';
  end if;
  update financeiro.mov_titulo set situacao = 'cancelado', cancelado_em = now(), cancelado_por = (select auth.uid()), motivo_cancelamento = btrim(p_motivo)
   where id = any (v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function api.fin_titulo_duplicar(p_empresa uuid, p_titulo uuid, p_vencimento date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo; v_id uuid; v_venc date;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into t from financeiro.mov_titulo where id = p_titulo and empresa_id = p_empresa;
  if not found then raise exception 'título não encontrado' using errcode = 'P0002'; end if;
  v_venc := coalesce(p_vencimento, (t.vencimento + interval '1 month')::date);
  v_id := financeiro._novo_titulo(p_empresa, jsonb_build_object(
    'tipo', t.tipo, 'parceiro_id', t.parceiro_id, 'historico', t.historico, 'emissao', financeiro._hoje(),
    'competencia', (t.competencia + (v_venc - t.vencimento))::date, 'vencimento', v_venc, 'valor_original', t.valor_original,
    'ret_iss', t.ret_iss, 'ret_irrf', t.ret_irrf, 'ret_inss', t.ret_inss, 'ret_pcc', t.ret_pcc, 'retencao_recolhe', t.retencao_recolhe,
    'provisao', t.provisao, 'tipo_titulo_id', t.tipo_titulo_id, 'conta_prevista_id', t.conta_prevista_id,
    'juros_dia_pct', t.juros_dia_pct, 'multa_pct', t.multa_pct, 'origem_tipo', 'duplicado', 'titulo_origem_id', t.id),
    (select jsonb_agg(jsonb_build_object('natureza_id', r.natureza_id, 'cr_id', r.cr_id, 'projeto_id', r.projeto_id, 'percentual', r.percentual, 'componente', 'principal'))
       from financeiro.rel_titulo_rateio r where r.titulo_id = t.id and r.componente = 'principal'));
  if t.retencao_recolhe then perform financeiro._gerar_guias(v_id); end if;
  return v_id;
end $$;

-- Efetiva a provisão (passa a ser título real) ou a substitui por um título real já lançado (a provisão é cancelada)
create function api.fin_provisao_efetivar(p_empresa uuid, p_titulo uuid, p_titulo_real uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo; r financeiro.mov_titulo;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into t from financeiro.mov_titulo where id = p_titulo and empresa_id = p_empresa for update;
  if not found or not t.provisao or t.situacao <> 'aberto' then raise exception 'provisão não encontrada ou já tratada' using errcode = 'P0002'; end if;
  if p_titulo_real is null then
    update financeiro.mov_titulo set provisao = false where id = p_titulo;
  else
    select * into r from financeiro.mov_titulo where id = p_titulo_real and empresa_id = p_empresa for update;
    if not found or r.provisao or r.situacao = 'cancelado' then raise exception 'título real inválido' using errcode = '22023'; end if;
    if r.tipo <> t.tipo then raise exception 'a provisão e o título real precisam ser do mesmo tipo' using errcode = '22023'; end if;
    update financeiro.mov_titulo set provisao_substituida_id = p_titulo where id = p_titulo_real;
    update financeiro.mov_titulo set situacao = 'cancelado', cancelado_em = now(), cancelado_por = (select auth.uid()),
           motivo_cancelamento = 'Provisão substituída pelo título #' || r.numero where id = p_titulo;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Renegociação (agrupa títulos do mesmo parceiro e tipo; vínculos N:N; pode renegociar de novo)
-- dados: {titulos:[uuid], juros, desconto, parcelas, primeiro_vencimento, periodicidade, intervalo_dias, tipo_titulo_id, historico}
-- ---------------------------------------------------------------------------
create function api.fin_renegociar(p_empresa uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; t0 financeiro.mov_titulo; x financeiro.mov_titulo; c financeiro.cfg_financeiro;
  v_total numeric; v_j numeric := coalesce(round(nullif(p_dados ->> 'juros', '')::numeric, 2), 0); v_d numeric := coalesce(round(nullif(p_dados ->> 'desconto', '')::numeric, 2), 0);
  v_novo numeric; n int := coalesce(nullif(p_dados ->> 'parcelas', '')::int, 1); v_ini date := nullif(p_dados ->> 'primeiro_vencimento', '')::date;
  v_per text := coalesce(p_dados ->> 'periodicidade', 'mensal'); v_dias int := nullif(p_dados ->> 'intervalo_dias', '')::int;
  v_rid uuid; v_num bigint; v_g uuid; v_vals numeric[]; v_rat jsonb; v_pj numeric; v_novos uuid[] := '{}'; v_id uuid; i int; v_soma numeric;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select array_agg(distinct e::uuid) into v_ids from jsonb_array_elements_text(p_dados -> 'titulos') e;
  if v_ids is null then raise exception 'selecione os títulos a renegociar' using errcode = '22023'; end if;
  if v_ini is null then raise exception 'informe o primeiro vencimento' using errcode = '22023'; end if;
  if n < 1 or n > 360 then raise exception 'número de parcelas entre 1 e 360' using errcode = '22023'; end if;
  if (select count(*) from financeiro.mov_titulo where id = any (v_ids) and empresa_id = p_empresa) <> array_length(v_ids, 1) then
    raise exception 'título inexistente ou de outra empresa' using errcode = '22023'; end if;
  if (select count(distinct (tipo, parceiro_id)) from financeiro.mov_titulo where id = any (v_ids)) > 1 then
    raise exception 'renegociação agrupa títulos do mesmo parceiro e do mesmo tipo (receber ou pagar)' using errcode = '22023'; end if;
  for x in select * from financeiro.mov_titulo where id = any (v_ids) for update loop
    if x.situacao not in ('aberto','parcial') or x.provisao then
      raise exception 'título #% não tem saldo em aberto para renegociar', x.numero using errcode = '55000'; end if;
  end loop;
  select * into t0 from financeiro.mov_titulo where id = any (v_ids) order by vencimento, numero limit 1;
  select * into c from financeiro.cfg_financeiro where empresa_id = p_empresa;
  select sum(saldo) into v_total from financeiro.mov_titulo where id = any (v_ids);
  v_novo := v_total + v_j - v_d;
  if v_novo <= 0 then raise exception 'o novo total precisa ser maior que zero' using errcode = '22023'; end if;
  v_num := financeiro._proximo(p_empresa, 'renegociacao');
  insert into financeiro.mov_renegociacao (empresa_id, numero, tipo, parceiro_id, total_original, juros, desconto, novo_total, historico, criado_por)
  values (p_empresa, v_num, t0.tipo, t0.parceiro_id, v_total, v_j, v_d, v_novo, nullif(btrim(p_dados ->> 'historico'), ''), (select auth.uid()))
  returning id into v_rid;
  for x in select * from financeiro.mov_titulo where id = any (v_ids) order by numero loop
    insert into financeiro.rel_renegociacao_titulo (renegociacao_id, titulo_id, papel, saldo_renegociado) values (v_rid, x.id, 'original', x.saldo);
    insert into financeiro.mov_baixa (empresa_id, titulo_id, tipo, data, valor_principal, valor_movimentado, renegociacao_id, historico, criado_por)
    values (p_empresa, x.id, 'renegociacao', financeiro._hoje(), x.saldo, 0, v_rid, 'Renegociação R-' || v_num, (select auth.uid()));
  end loop;
  -- rateio dos novos: o do primeiro título (parte principal) + linha de juros
  v_pj := case when v_j > 0 then round(v_j / v_novo * 100, 6) else 0 end;
  select jsonb_agg(jsonb_build_object('natureza_id', r.natureza_id, 'cr_id', r.cr_id, 'projeto_id', r.projeto_id,
           'percentual', round(r.percentual * (100 - v_pj) / 100, 6), 'componente', 'principal'))
    into v_rat from financeiro.rel_titulo_rateio r where r.titulo_id = t0.id and r.componente = 'principal';
  select sum((e ->> 'percentual')::numeric) into v_soma from jsonb_array_elements(v_rat) e;
  v_rat := jsonb_set(v_rat, array['0','percentual'], to_jsonb(((v_rat -> 0 ->> 'percentual')::numeric + (100 - v_pj - v_soma))));
  if v_pj > 0 then
    v_rat := v_rat || jsonb_build_array(jsonb_build_object('natureza_id', case t0.tipo when 'R' then c.nat_juros_recebidos_id else c.nat_juros_pagos_id end,
               'cr_id', v_rat -> 0 ->> 'cr_id', 'percentual', v_pj, 'componente', 'juros'));
  end if;
  v_vals := financeiro._dividir(v_novo, n, null);
  insert into financeiro.mov_grupo_titulo (empresa_id, tipo, descricao, total, parcelas, periodicidade, intervalo_dias, criado_por)
  values (p_empresa, 'renegociacao', 'Renegociação R-' || v_num || ' · ' || (select nome from crm.cad_parceiro where id = t0.parceiro_id), v_novo, n, v_per, v_dias, (select auth.uid()))
  returning id into v_g;
  for i in 1 .. n loop
    v_id := financeiro._novo_titulo(p_empresa, jsonb_build_object(
      'tipo', t0.tipo, 'parceiro_id', t0.parceiro_id, 'documento', 'Renegociação R-' || v_num || ' · ' || i || '/' || n,
      'historico', concat_ws(' · ', nullif(btrim(p_dados ->> 'historico'), ''), 'Renegocia ' || array_length(v_ids, 1) || ' título(s), saldo R$ ' || v_total),
      'emissao', financeiro._hoje(), 'competencia', financeiro._hoje(), 'vencimento', financeiro._venc(v_ini, i - 1, v_per, v_dias),
      'valor_original', v_vals[i], 'tipo_titulo_id', coalesce(nullif(p_dados ->> 'tipo_titulo_id', ''), t0.tipo_titulo_id::text),
      'conta_prevista_id', t0.conta_prevista_id, 'origem_tipo', 'renegociacao', 'grupo_id', v_g, 'parcela_num', i, 'parcela_total', n), v_rat);
    insert into financeiro.rel_renegociacao_titulo (renegociacao_id, titulo_id, papel) values (v_rid, v_id, 'novo');
    v_novos := v_novos || v_id;
  end loop;
  return jsonb_build_object('renegociacao_id', v_rid, 'numero', v_num, 'novos', to_jsonb(v_novos), 'total_original', v_total, 'novo_total', v_novo);
end $$;

create function api.fin_renegociacao_desfazer(p_empresa uuid, p_renegociacao uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare rn financeiro.mov_renegociacao; v_novos uuid[];
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if nullif(btrim(p_motivo), '') is null then raise exception 'informe o motivo' using errcode = '22023'; end if;
  select * into rn from financeiro.mov_renegociacao where id = p_renegociacao and empresa_id = p_empresa for update;
  if not found or rn.situacao <> 'ativa' then raise exception 'renegociação não encontrada ou já desfeita' using errcode = 'P0002'; end if;
  select array_agg(titulo_id) into v_novos from financeiro.rel_renegociacao_titulo where renegociacao_id = rn.id and papel = 'novo';
  if exists (select 1 from financeiro.mov_baixa b where b.titulo_id = any (v_novos) and not b.estornada) then
    if exists (select 1 from financeiro.mov_baixa b where b.titulo_id = any (v_novos) and not b.estornada and b.tipo = 'renegociacao') then
      raise exception 'um título desta renegociação foi renegociado de novo: desfaça a mais recente primeiro' using errcode = '55000';
    end if;
    raise exception 'um título novo de R-% já tem baixa: estorne antes de desfazer', rn.numero using errcode = '55000';
  end if;
  update financeiro.mov_titulo set situacao = 'cancelado', cancelado_em = now(), cancelado_por = (select auth.uid()),
         motivo_cancelamento = 'Renegociação R-' || rn.numero || ' desfeita: ' || btrim(p_motivo)
   where id = any (v_novos);
  update financeiro.mov_baixa set estornada = true, estornada_por = (select auth.uid()), motivo_estorno = 'Renegociação desfeita: ' || btrim(p_motivo)
   where renegociacao_id = rn.id and tipo = 'renegociacao' and not estornada;
  update financeiro.mov_renegociacao set situacao = 'desfeita', desfeita_em = now(), desfeita_por = (select auth.uid()), motivo_desfazer = btrim(p_motivo)
   where id = rn.id;
end $$;

-- ---------------------------------------------------------------------------
-- Adiantamento: título de entrada (baixado na conta) + contrapartida em aberto, compensada depois
-- dados: {tipo: cliente|fornecedor, parceiro_id, valor, data, conta_id, cr_id, tipo_titulo_id, vencimento_compensacao, historico}
-- ---------------------------------------------------------------------------
create function api.fin_adiantamento_criar(p_empresa uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c financeiro.cfg_financeiro; v_tipo text := p_dados ->> 'tipo'; v_val numeric := round((p_dados ->> 'valor')::numeric, 2);
  v_data date := coalesce(nullif(p_dados ->> 'data', '')::date, financeiro._hoje()); v_conta uuid := nullif(p_dados ->> 'conta_id', '')::uuid;
  v_ad uuid; v_num bigint; v_nat uuid; v_cr uuid; v_ent uuid; v_cp uuid; v_t1 char(1); v_mov uuid; v_tt uuid;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if v_tipo is null or v_tipo not in ('cliente','fornecedor') then raise exception 'tipo deve ser cliente ou fornecedor' using errcode = '22023'; end if;
  if v_val is null or v_val <= 0 then raise exception 'informe o valor' using errcode = '22023'; end if;
  if v_conta is null then raise exception 'informe a conta' using errcode = '22023'; end if;
  select * into c from financeiro.cfg_financeiro where empresa_id = p_empresa;
  v_nat := case v_tipo when 'cliente' then c.nat_adiant_cliente_id else c.nat_adiant_fornecedor_id end;
  v_cr := coalesce(nullif(p_dados ->> 'cr_id', '')::uuid, c.cr_financeiro_id);
  v_t1 := case v_tipo when 'cliente' then 'R' else 'D' end;
  v_tt := coalesce(nullif(p_dados ->> 'tipo_titulo_id', '')::uuid, (select id from financeiro.cad_tipo_titulo where empresa_id = p_empresa and codigo = 'CREDITO_LOJA'));
  v_num := financeiro._proximo(p_empresa, 'adiantamento');
  insert into financeiro.mov_adiantamento (empresa_id, numero, tipo, parceiro_id, valor, data, conta_id, historico, criado_por)
  values (p_empresa, v_num, v_tipo, (p_dados ->> 'parceiro_id')::uuid, v_val, v_data, v_conta, nullif(btrim(p_dados ->> 'historico'), ''), (select auth.uid()))
  returning id into v_ad;
  v_ent := financeiro._novo_titulo(p_empresa, jsonb_build_object('tipo', v_t1, 'parceiro_id', p_dados ->> 'parceiro_id',
    'documento', 'Adiantamento A-' || v_num, 'historico', p_dados ->> 'historico', 'emissao', v_data, 'competencia', v_data, 'vencimento', v_data,
    'valor_original', v_val, 'conta_prevista_id', v_conta, 'origem_tipo', 'adiantamento', 'adiantamento_id', v_ad, 'adiantamento_papel', 'entrada'),
    jsonb_build_array(jsonb_build_object('natureza_id', v_nat, 'cr_id', v_cr, 'percentual', 100)));
  insert into financeiro.mov_conta_movimento (empresa_id, conta_id, data, valor, tipo, historico, criado_por)
  values (p_empresa, v_conta, v_data, case v_t1 when 'R' then v_val else -v_val end, 'baixa', 'Adiantamento A-' || v_num, (select auth.uid()))
  returning id into v_mov;
  insert into financeiro.mov_baixa (empresa_id, titulo_id, data, valor_principal, valor_movimentado, conta_id, movimento_id, historico, criado_por)
  values (p_empresa, v_ent, v_data, v_val, 0, v_conta, v_mov, 'Adiantamento A-' || v_num, (select auth.uid()));
  v_cp := financeiro._novo_titulo(p_empresa, jsonb_build_object('tipo', case v_t1 when 'R' then 'D' else 'R' end, 'parceiro_id', p_dados ->> 'parceiro_id',
    'documento', 'Contrapartida do adiantamento A-' || v_num, 'historico', 'Compensar com ' || case v_tipo when 'cliente' then 'a venda' else 'a nota do fornecedor' end,
    'emissao', v_data, 'competencia', v_data, 'vencimento', coalesce(nullif(p_dados ->> 'vencimento_compensacao', ''), v_data::text),
    'valor_original', v_val, 'tipo_titulo_id', v_tt, 'origem_tipo', 'adiantamento', 'adiantamento_id', v_ad, 'adiantamento_papel', 'contrapartida'),
    jsonb_build_array(jsonb_build_object('natureza_id', v_nat, 'cr_id', v_cr, 'percentual', 100)));
  return jsonb_build_object('adiantamento_id', v_ad, 'numero', v_num, 'titulo_entrada', v_ent, 'titulo_contrapartida', v_cp, 'movimento_id', v_mov);
end $$;

create function api.fin_adiantamento_cancelar(p_empresa uuid, p_adiantamento uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare a financeiro.mov_adiantamento;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if nullif(btrim(p_motivo), '') is null then raise exception 'informe o motivo' using errcode = '22023'; end if;
  select * into a from financeiro.mov_adiantamento where id = p_adiantamento and empresa_id = p_empresa for update;
  if not found or a.situacao = 'cancelado' then raise exception 'adiantamento não encontrado ou já cancelado' using errcode = 'P0002'; end if;
  if exists (select 1 from financeiro.mov_titulo t join financeiro.mov_baixa b on b.titulo_id = t.id
              where t.adiantamento_id = a.id and t.adiantamento_papel = 'contrapartida' and not b.estornada) then
    raise exception 'o adiantamento A-% já foi compensado ou devolvido: estorne essas baixas antes', a.numero using errcode = '55000';
  end if;
  if exists (select 1 from financeiro.mov_titulo t join financeiro.mov_baixa b on b.titulo_id = t.id join financeiro.mov_conta_movimento m on m.id = b.movimento_id
              where t.adiantamento_id = a.id and not b.estornada and m.conciliado) then
    raise exception 'a entrada do adiantamento já está conciliada: desconcilie antes' using errcode = '55000';
  end if;
  update financeiro.mov_conta_movimento set estornado = true, estornado_em = now(), estornado_por = (select auth.uid())
   where not estornado and id in (select b.movimento_id from financeiro.mov_baixa b join financeiro.mov_titulo t on t.id = b.titulo_id where t.adiantamento_id = a.id and not b.estornada);
  update financeiro.mov_baixa set estornada = true, estornada_por = (select auth.uid()), motivo_estorno = 'Adiantamento cancelado: ' || btrim(p_motivo)
   where not estornada and titulo_id in (select id from financeiro.mov_titulo where adiantamento_id = a.id);
  update financeiro.mov_titulo set situacao = 'cancelado', cancelado_em = now(), cancelado_por = (select auth.uid()), motivo_cancelamento = 'Adiantamento cancelado: ' || btrim(p_motivo)
   where adiantamento_id = a.id and situacao <> 'cancelado';
  update financeiro.mov_adiantamento set situacao = 'cancelado' where id = a.id;
end $$;

-- ---------------------------------------------------------------------------
-- Banco: transferência, saldos e movimentação
-- ---------------------------------------------------------------------------
create function api.fin_transferir(p_empresa uuid, p_de uuid, p_para uuid, p_valor numeric, p_data date, p_historico text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v1 uuid; v2 uuid; v_h text;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if p_de = p_para then raise exception 'escolha contas diferentes' using errcode = '22023'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'informe o valor' using errcode = '22023'; end if;
  v_h := coalesce(nullif(btrim(p_historico), ''), 'Transferência ' || (select nome from financeiro.cad_conta_bancaria where id = p_de) || ' → ' || (select nome from financeiro.cad_conta_bancaria where id = p_para));
  insert into financeiro.mov_conta_movimento (empresa_id, conta_id, data, valor, tipo, historico, criado_por)
  values (p_empresa, p_de, coalesce(p_data, financeiro._hoje()), -round(p_valor, 2), 'transferencia', v_h, (select auth.uid())) returning id into v1;
  insert into financeiro.mov_conta_movimento (empresa_id, conta_id, data, valor, tipo, historico, transferencia_par_id, criado_por)
  values (p_empresa, p_para, coalesce(p_data, financeiro._hoje()), round(p_valor, 2), 'transferencia', v_h, v1, (select auth.uid())) returning id into v2;
  update financeiro.mov_conta_movimento set transferencia_par_id = v2 where id = v1;
  return jsonb_build_object('saida', v1, 'entrada', v2);
end $$;

create function api.fin_transferencia_estornar(p_empresa uuid, p_movimento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m financeiro.mov_conta_movimento;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into m from financeiro.mov_conta_movimento where id = p_movimento and empresa_id = p_empresa and tipo = 'transferencia';
  if not found then raise exception 'transferência não encontrada' using errcode = 'P0002'; end if;
  update financeiro.mov_conta_movimento set estornado = true, estornado_em = now(), estornado_por = (select auth.uid())
   where id in (m.id, m.transferencia_par_id) and not estornado;
end $$;

-- Saldos por conta numa data: sistema (data da baixa), conciliado (data do banco) e extrato (linhas do OFX)
create function financeiro._saldo_em(p_conta uuid, p_data date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sistema', c.saldo_inicial + coalesce((select sum(m.valor) from financeiro.mov_conta_movimento m where m.conta_id = c.id and not m.estornado and m.data <= p_data), 0),
    'conciliado', c.saldo_inicial + coalesce((select sum(m.valor) from financeiro.mov_conta_movimento m where m.conta_id = c.id and m.conciliado and m.data_conciliacao <= p_data), 0),
    'extrato', c.saldo_inicial + coalesce((select sum(l.valor) from financeiro.mov_extrato_linha l where l.conta_id = c.id and l.data >= c.data_saldo_inicial and l.data <= p_data), 0),
    'tem_extrato', exists (select 1 from financeiro.mov_extrato_linha l where l.conta_id = c.id))
  from financeiro.cad_conta_bancaria c where c.id = p_conta
$$;
revoke all on function financeiro._saldo_em(uuid, date) from public, anon, authenticated;

create function api.fin_saldos(p_empresa uuid, p_data date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_d date := coalesce(p_data, financeiro._hoje());
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  return jsonb_build_object('data', v_d, 'contas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'ativa', c.ativa,
            'saldo_inicial', c.saldo_inicial, 'data_saldo_inicial', c.data_saldo_inicial) || financeiro._saldo_em(c.id, v_d) order by c.ativa desc, c.nome)
         from financeiro.cad_conta_bancaria c where c.empresa_id = p_empresa), '[]'));
end $$;

create function api.fin_movimentos(p_empresa uuid, p_conta uuid, p_de date default null, p_ate date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c financeiro.cad_conta_bancaria; v_de date; v_ate date; v_ant numeric;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into c from financeiro.cad_conta_bancaria where id = p_conta and empresa_id = p_empresa;
  if not found then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  v_de := greatest(coalesce(p_de, date_trunc('month', financeiro._hoje())::date), c.data_saldo_inicial);
  v_ate := coalesce(p_ate, financeiro._hoje());
  v_ant := c.saldo_inicial + coalesce((select sum(valor) from financeiro.mov_conta_movimento where conta_id = c.id and not estornado and data < v_de), 0);
  return jsonb_build_object('conta', c.nome, 'de', v_de, 'ate', v_ate, 'saldo_anterior', v_ant,
    'itens', coalesce((select jsonb_agg(s.x order by s.d, s.ce) from (
      select m.data d, m.criado_em ce, jsonb_build_object('id', m.id, 'data', m.data, 'valor', m.valor, 'tipo', m.tipo, 'historico', m.historico, 'estornado', m.estornado,
        'conciliado', m.conciliado, 'data_banco', m.data_conciliacao, 'conciliado_em', m.conciliado_em,
        'lote', (select numero from financeiro.mov_baixa_lote where id = m.lote_id),
        'titulos', (select jsonb_agg(jsonb_build_object('id', t.id, 'numero', t.numero, 'parceiro', p.nome)) from financeiro.mov_baixa b
                     join financeiro.mov_titulo t on t.id = b.titulo_id join crm.cad_parceiro p on p.id = t.parceiro_id where b.movimento_id = m.id),
        'saldo', v_ant + sum(case when m.estornado then 0 else m.valor end) over (order by m.data, m.criado_em rows unbounded preceding)) x
      from financeiro.mov_conta_movimento m where m.conta_id = c.id and m.data between v_de and v_ate) s), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- Extrato e conciliação
-- dados: {arquivo_nome, arquivo_hash, saldo_final, data_saldo, linhas:[{fitid, data, valor, descricao, tipo}]}  (o painel lê o OFX)
-- ---------------------------------------------------------------------------
create function api.fin_extrato_importar(p_empresa uuid, p_conta uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ext uuid; v_novas int; v_total int := jsonb_array_length(coalesce(p_dados -> 'linhas', '[]'));
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if not exists (select 1 from financeiro.cad_conta_bancaria where id = p_conta and empresa_id = p_empresa) then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  if v_total = 0 then raise exception 'o arquivo não tem lançamentos' using errcode = '22023'; end if;
  insert into financeiro.mov_extrato (empresa_id, conta_id, arquivo_nome, arquivo_hash, periodo_ini, periodo_fim, saldo_final, data_saldo, importado_por)
  values (p_empresa, p_conta, p_dados ->> 'arquivo_nome', p_dados ->> 'arquivo_hash',
          (select min((l ->> 'data')::date) from jsonb_array_elements(p_dados -> 'linhas') l), (select max((l ->> 'data')::date) from jsonb_array_elements(p_dados -> 'linhas') l),
          nullif(p_dados ->> 'saldo_final', '')::numeric, nullif(p_dados ->> 'data_saldo', '')::date, (select auth.uid()))
  returning id into v_ext;
  insert into financeiro.mov_extrato_linha (empresa_id, conta_id, extrato_id, fitid, data, valor, descricao, tipo_ofx)
  select p_empresa, p_conta, v_ext, coalesce(nullif(l ->> 'fitid', ''), md5(concat_ws('|', l ->> 'data', l ->> 'valor', l ->> 'descricao'))),
         (l ->> 'data')::date, round((l ->> 'valor')::numeric, 2), nullif(btrim(l ->> 'descricao'), ''), l ->> 'tipo'
    from jsonb_array_elements(p_dados -> 'linhas') l
   where round((l ->> 'valor')::numeric, 2) <> 0
  on conflict (conta_id, fitid) do nothing;
  get diagnostics v_novas = row_count;
  update financeiro.mov_extrato set linhas_novas = v_novas, linhas_repetidas = v_total - v_novas where id = v_ext;
  return jsonb_build_object('extrato_id', v_ext, 'novas', v_novas, 'repetidas', v_total - v_novas);
end $$;

create function api.fin_conciliacao(p_empresa uuid, p_conta uuid, p_data date default null, p_de date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c financeiro.cad_conta_bancaria; v_d date := coalesce(p_data, financeiro._hoje()); v_de date; v_jan int; s jsonb; o financeiro.mov_extrato;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into c from financeiro.cad_conta_bancaria where id = p_conta and empresa_id = p_empresa;
  if not found then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  select janela_conciliacao_dias into v_jan from financeiro.cfg_financeiro where empresa_id = p_empresa;
  v_de := greatest(coalesce(p_de, date_trunc('month', v_d)::date), c.data_saldo_inicial);
  s := financeiro._saldo_em(c.id, v_d);
  select * into o from financeiro.mov_extrato where conta_id = c.id and saldo_final is not null order by data_saldo desc, importado_em desc limit 1;
  return jsonb_build_object(
    'conta', c.nome, 'data', v_d, 'de', v_de, 'saldos', s,
    'diferenca', (s ->> 'extrato')::numeric - (s ->> 'conciliado')::numeric,
    'linhas_pendentes', (select count(*) from financeiro.mov_extrato_linha l where l.conta_id = c.id and l.situacao <> 'conciliada' and l.data <= v_d),
    'baixas_sem_extrato', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(m.valor), 0)) from financeiro.mov_conta_movimento m
                            where m.conta_id = c.id and not m.estornado and not m.conciliado and m.data <= v_d),
    'ofx', case when o.id is not null then jsonb_build_object('data_saldo', o.data_saldo, 'saldo_banco', o.saldo_final,
             'saldo_calculado', (financeiro._saldo_em(c.id, o.data_saldo) ->> 'extrato')::numeric,
             'confere', abs(o.saldo_final - (financeiro._saldo_em(c.id, o.data_saldo) ->> 'extrato')::numeric) < 0.005) end,
    'diario', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia,
                 'extrato_no_dia', (select coalesce(sum(l.valor), 0) from financeiro.mov_extrato_linha l where l.conta_id = c.id and l.data = d.dia))
                 || financeiro._saldo_em(c.id, d.dia) order by d.dia)
              from (select l.data dia from financeiro.mov_extrato_linha l where l.conta_id = c.id and l.data between v_de and v_d
                    union select m.data from financeiro.mov_conta_movimento m where m.conta_id = c.id and not m.estornado and m.data between v_de and v_d
                    union select m.data_conciliacao from financeiro.mov_conta_movimento m where m.conta_id = c.id and m.conciliado and m.data_conciliacao between v_de and v_d) d), '[]'),
    'linhas', coalesce((select jsonb_agg(z.j order by z.data, z.fitid) from (
              select l.data, l.fitid, jsonb_build_object('id', l.id, 'data', l.data, 'valor', l.valor, 'descricao', l.descricao, 'situacao', l.situacao,
                 'motivo_ignorar', l.motivo_ignorar, 'movimento_id', l.movimento_id,
                 'saldo_extrato', c.saldo_inicial + sum(l.valor) over (order by l.data, l.fitid rows unbounded preceding),
                 'conciliacao', case when l.movimento_id is not null then (select jsonb_build_object('data_baixa', m.data, 'data_banco', m.data_conciliacao, 'conciliado_em', m.conciliado_em,
                        'titulos', (select jsonb_agg(t.numero) from financeiro.mov_baixa b join financeiro.mov_titulo t on t.id = b.titulo_id where b.movimento_id = m.id))
                        from financeiro.mov_conta_movimento m where m.id = l.movimento_id) end,
                 'sugestao', case when l.situacao = 'pendente' then (select jsonb_build_object('movimento_id', m.id, 'data_baixa', m.data, 'historico', m.historico,
                        'titulos', (select jsonb_agg(t.numero) from financeiro.mov_baixa b join financeiro.mov_titulo t on t.id = b.titulo_id where b.movimento_id = m.id))
                      from financeiro.mov_conta_movimento m
                     where m.conta_id = c.id and not m.estornado and not m.conciliado and m.valor = l.valor and abs(m.data - l.data) <= coalesce(v_jan, 5)
                       and not exists (select 1 from financeiro.mov_extrato_linha y where y.movimento_id = m.id)
                     order by abs(m.data - l.data), m.criado_em limit 1) end) j
              from financeiro.mov_extrato_linha l where l.conta_id = c.id and l.data >= c.data_saldo_inicial and l.data <= greatest(v_d, v_de)) z), '[]'),
    'pendentes_sistema', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'data', m.data, 'valor', m.valor, 'historico', m.historico) order by m.data)
              from financeiro.mov_conta_movimento m where m.conta_id = c.id and not m.estornado and not m.conciliado and m.data <= v_d), '[]'));
end $$;

create function api.fin_conciliar(p_empresa uuid, p_linha uuid, p_movimento uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l financeiro.mov_extrato_linha; m financeiro.mov_conta_movimento;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into l from financeiro.mov_extrato_linha where id = p_linha and empresa_id = p_empresa for update;
  if not found then raise exception 'linha do extrato não encontrada' using errcode = 'P0002'; end if;
  if l.situacao = 'conciliada' then raise exception 'linha já conciliada' using errcode = '55000'; end if;
  select * into m from financeiro.mov_conta_movimento where id = p_movimento and empresa_id = p_empresa for update;
  if not found then raise exception 'movimento não encontrado' using errcode = 'P0002'; end if;
  if m.conta_id <> l.conta_id then raise exception 'o movimento é de outra conta' using errcode = '22023'; end if;
  if m.estornado or m.conciliado then raise exception 'movimento estornado ou já conciliado' using errcode = '55000'; end if;
  if m.valor <> l.valor then raise exception 'valores diferentes: extrato R$ % e sistema R$ %', l.valor, m.valor using errcode = '22023'; end if;
  update financeiro.mov_conta_movimento set conciliado = true, data_conciliacao = l.data, conciliado_em = now(), conciliado_por = (select auth.uid()) where id = m.id;
  update financeiro.mov_extrato_linha set situacao = 'conciliada', movimento_id = m.id, motivo_ignorar = null, decidido_por = (select auth.uid()), decidido_em = now() where id = l.id;
  return jsonb_build_object('data_baixa', m.data, 'data_banco', l.data);
end $$;

create function api.fin_desconciliar(p_empresa uuid, p_linha uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l financeiro.mov_extrato_linha;
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into l from financeiro.mov_extrato_linha where id = p_linha and empresa_id = p_empresa for update;
  if not found then raise exception 'linha do extrato não encontrada' using errcode = 'P0002'; end if;
  update financeiro.mov_extrato_linha set situacao = 'pendente', movimento_id = null, motivo_ignorar = null, decidido_por = (select auth.uid()), decidido_em = now() where id = l.id;
  if l.situacao = 'conciliada' then
    update financeiro.mov_conta_movimento set conciliado = false, data_conciliacao = null, conciliado_em = null, conciliado_por = null where id = l.movimento_id;
  end if;
end $$;

create function api.fin_extrato_ignorar(p_empresa uuid, p_linha uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if nullif(btrim(p_motivo), '') is null then raise exception 'informe o motivo' using errcode = '22023'; end if;
  update financeiro.mov_extrato_linha set situacao = 'ignorada', motivo_ignorar = btrim(p_motivo), decidido_por = (select auth.uid()), decidido_em = now()
   where id = p_linha and empresa_id = p_empresa and situacao = 'pendente';
  if not found then raise exception 'linha não encontrada ou não pendente' using errcode = 'P0002'; end if;
end $$;

-- Cria título já baixado e conciliado a partir da linha (tarifa, IOF, DAS debitado, rendimento)
create function api.fin_extrato_criar_titulo(p_empresa uuid, p_linha uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l financeiro.mov_extrato_linha; v_id uuid; v_mov uuid; v_tipo char(1);
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  select * into l from financeiro.mov_extrato_linha where id = p_linha and empresa_id = p_empresa for update;
  if not found or l.situacao <> 'pendente' then raise exception 'linha não encontrada ou não pendente' using errcode = 'P0002'; end if;
  v_tipo := case when l.valor < 0 then 'D' else 'R' end;
  v_id := financeiro._novo_titulo(p_empresa, p_dados || jsonb_build_object('tipo', v_tipo, 'emissao', l.data, 'competencia', coalesce(nullif(p_dados ->> 'competencia', ''), l.data::text),
            'vencimento', l.data, 'valor_original', abs(l.valor), 'documento', coalesce(nullif(p_dados ->> 'documento', ''), l.descricao),
            'conta_prevista_id', l.conta_id, 'origem_tipo', 'extrato'), financeiro._rateio_de(p_empresa, p_dados));
  insert into financeiro.mov_conta_movimento (empresa_id, conta_id, data, valor, tipo, historico, criado_por)
  values (p_empresa, l.conta_id, l.data, l.valor, 'baixa', coalesce(l.descricao, 'Lançamento do extrato'), (select auth.uid()))
  returning id into v_mov;
  insert into financeiro.mov_baixa (empresa_id, titulo_id, data, valor_principal, valor_movimentado, conta_id, movimento_id, historico, criado_por)
  values (p_empresa, v_id, l.data, abs(l.valor), 0, l.conta_id, v_mov, 'Criado na conciliação', (select auth.uid()));
  update financeiro.mov_conta_movimento set conciliado = true, data_conciliacao = l.data, conciliado_em = now(), conciliado_por = (select auth.uid()) where id = v_mov;
  update financeiro.mov_extrato_linha set situacao = 'conciliada', movimento_id = v_mov, decidido_por = (select auth.uid()), decidido_em = now() where id = l.id;
  return v_id;
end $$;

-- NF-e de entrada já confirmada antes deste módulo, ou para gerar de novo após cancelar um título: idempotente
create function api.fin_gerar_titulos_entrada(p_empresa uuid, p_entrada uuid) returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._fin_papeis());
  if not exists (select 1 from compra.mov_entrada where id = p_entrada and empresa_id = p_empresa and status = 'confirmada') then
    raise exception 'entrada não encontrada ou não confirmada' using errcode = 'P0002'; end if;
  return financeiro._gerar_titulos_entrada(p_entrada);
end $$;

-- ---------------------------------------------------------------------------
-- Apropriação para o DRE (base para o painel; ainda não ligada a financeiro._lanc_base)
-- Competência: rateio do valor original; títulos de renegociação entram só com a parte de juros.
-- Caixa e acessórios: juros, multa, desconto e taxa de cada baixa na natureza dos parâmetros.
-- ---------------------------------------------------------------------------
create view financeiro.vw_titulo_apropriacao with (security_invoker = true) as
select t.empresa_id, t.id titulo_id, t.numero, t.tipo, 'principal'::text componente, r.natureza_id, r.cr_id, r.projeto_id,
       t.competencia data_competencia, t.vencimento data_vencimento, null::date data_baixa,
       round(t.valor_original * r.percentual / 100, 2) valor
  from financeiro.mov_titulo t join financeiro.rel_titulo_rateio r on r.titulo_id = t.id
 where t.situacao <> 'cancelado' and not t.provisao and (t.origem_tipo <> 'renegociacao' or r.componente = 'juros')
union all
select t.empresa_id, t.id, t.numero, t.tipo, x.comp, x.nat, r.cr_id, r.projeto_id, b.data, b.data, b.data,
       round(x.valor * r.percentual / 100, 2)
  from financeiro.mov_baixa b
  join financeiro.mov_titulo t on t.id = b.titulo_id
  join financeiro.cfg_financeiro c on c.empresa_id = t.empresa_id
  left join financeiro.cad_tipo_titulo tt on tt.id = coalesce(b.tipo_titulo_id, t.tipo_titulo_id)
  join financeiro.rel_titulo_rateio r on r.titulo_id = t.id and r.componente = 'principal'
  cross join lateral (values
    ('juros', b.juros, case t.tipo when 'R' then c.nat_juros_recebidos_id else c.nat_juros_pagos_id end),
    ('multa', b.multa, case t.tipo when 'R' then c.nat_multa_recebida_id else c.nat_multa_paga_id end),
    ('desconto', b.desconto, case t.tipo when 'R' then c.nat_desconto_concedido_id else c.nat_desconto_obtido_id end),
    ('taxa', b.taxa, case t.tipo when 'R' then coalesce(tt.natureza_taxa_id, c.nat_taxa_receber_id) else c.nat_tarifa_pagar_id end)) x(comp, valor, nat)
 where not b.estornada and x.valor > 0;
revoke all on financeiro.vw_titulo_apropriacao from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissões de execução: só usuários autenticados; a checagem real é o _exigir
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and (p.proname like 'fin\_%' or p.proname = '_fin_papeis') loop
    execute format('revoke all on function %s from public, anon', f.s);
    execute format('grant execute on function %s to authenticated', f.s);
  end loop;
end $$;
