-- STATUS: APLICADO em 23/11/2026 (migration 0057_processador_itens_pedido_nota, pedido de mudança 032, etapa 2).
-- 0057_processador_itens_pedido_nota (pedido de mudança 032, etapa 2)
-- Funções NOVAS e idempotentes: payload cru (raw_pedido / raw_nfe, nivel='detalhe') -> espelho tipado.
-- Não altera processar_vendas / processar_nfe nem seus jobs. processar_vendas só atualiza colunas explícitas (as novas sobrevivem);
-- processar_nfe APAGA e recria cad_nfe_item inteira a cada rodada, então as colunas novas dos itens de nota são repreenchidas
-- por bling.processar_nfe_extra (custo_fonte nulo = item ainda não preenchido).
-- Achado na validação: no pedido do Bling, item.valor já é o preço líquido e item.desconto é um PERCENTUAL informativo.
-- valor_total = quantidade * valor_unit (confere com total_produtos em 100% dos pedidos lidos). Subtrair o desconto daria divergência.

alter table bling.cad_pedido add column if not exists itens_lidos_em timestamptz;

create or replace function bling._num(p text) returns numeric
language sql immutable parallel safe set search_path = ''
as $$ select case when p ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then p::numeric end $$;

create or replace function bling._dt(p text) returns date
language sql immutable parallel safe set search_path = ''
as $$ select case when p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' and p !~ '^0000' then substring(p from 1 for 10)::date end $$;

create or replace function bling.processar_pedido_itens(p_empresa uuid, p_lote int default 500)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_ids bigint[]; v_ped int := 0; v_it int := 0; v_par int := 0;
begin
  select array_agg(x.bling_id) into v_ids from (
    select d.bling_id
      from bling.raw_pedido d
      join bling.cad_pedido p on p.empresa_id = d.empresa_id and p.bling_id = d.bling_id
     where d.empresa_id = p_empresa and d.nivel = 'detalhe'
       and (p.itens_lidos_em is null or d.lido_em > p.itens_lidos_em)
     order by d.lido_em desc
     limit greatest(coalesce(p_lote, 500), 1)) x;
  if v_ids is null then
    return jsonb_build_object('pedidos', 0, 'itens', 0, 'parcelas', 0);
  end if;

  delete from bling.cad_pedido_item where empresa_id = p_empresa and pedido_bling_id = any(v_ids);
  delete from bling.cad_pedido_parcela where empresa_id = p_empresa and pedido_bling_id = any(v_ids);

  insert into bling.cad_pedido_item (empresa_id, pedido_bling_id, seq, item_bling_id, produto_bling_id, codigo, descricao, unidade,
      quantidade, valor_unit, desconto, valor_total, aliquota_ipi, comissao_base, comissao_valor, comissao_aliquota, natureza_id,
      custo_unit_snapshot, custo_fonte, match_status, atualizado_em)
  select p_empresa, d.bling_id, it.ord::int, nullif(it.v->>'id','')::bigint,
         nullif(nullif(it.v->'produto'->>'id',''),'0')::bigint, nullif(it.v->>'codigo',''), it.v->>'descricao', nullif(it.v->>'unidade',''),
         bling._num(it.v->>'quantidade'), bling._num(it.v->>'valor'), bling._num(it.v->>'desconto'),
         coalesce(bling._num(it.v->>'quantidade'), 0) * coalesce(bling._num(it.v->>'valor'), 0),
         bling._num(it.v->>'aliquotaIPI'), bling._num(it.v->'comissao'->>'base'), bling._num(it.v->'comissao'->>'valor'),
         bling._num(it.v->'comissao'->>'aliquota'), nullif(nullif(it.v->'naturezaOperacao'->>'id',''),'0')::bigint,
         pr.custo_cru,
         case when pr.bling_id is not null and pr.custo_cru is not null then 'produto_atual' end,
         case when pr.bling_id is null then 'sem_produto'
              when pr.custo_cru is null or pr.custo_cru <= 0 then 'sem_custo'
              else 'ok' end,
         now()
    from bling.raw_pedido d
    cross join lateral jsonb_array_elements(coalesce(d.payload->'itens', '[]'::jsonb)) with ordinality it(v, ord)
    left join bling.cad_produto pr on pr.empresa_id = d.empresa_id and pr.bling_id = nullif(nullif(it.v->'produto'->>'id',''),'0')::bigint
   where d.empresa_id = p_empresa and d.nivel = 'detalhe' and d.bling_id = any(v_ids);
  get diagnostics v_it = row_count;

  insert into bling.cad_pedido_parcela (empresa_id, pedido_bling_id, seq, parcela_bling_id, valor, vencimento, forma_pagamento_id, observacoes, atualizado_em)
  select p_empresa, d.bling_id, pa.ord::int, nullif(pa.v->>'id','')::bigint, bling._num(pa.v->>'valor'),
         bling._dt(pa.v->>'dataVencimento'), nullif(nullif(pa.v->'formaPagamento'->>'id',''),'0')::bigint,
         nullif(pa.v->>'observacoes',''), now()
    from bling.raw_pedido d
    cross join lateral jsonb_array_elements(coalesce(d.payload->'parcelas', '[]'::jsonb)) with ordinality pa(v, ord)
   where d.empresa_id = p_empresa and d.nivel = 'detalhe' and d.bling_id = any(v_ids);
  get diagnostics v_par = row_count;

  -- cabeçalho: só colunas NOVAS; não toca atualizado_em (gatilho do job de vendas)
  update bling.cad_pedido p set
      desconto_valor = bling._num(d.payload->'desconto'->>'valor'),
      desconto_unidade = nullif(d.payload->'desconto'->>'unidade', ''),
      outras_despesas = bling._num(d.payload->>'outrasDespesas'),
      frete_transporte = bling._num(d.payload->'transporte'->>'frete'),
      custo_frete = bling._num(d.payload->'taxas'->>'custoFrete'),
      taxa_comissao = bling._num(d.payload->'taxas'->>'taxaComissao'),
      taxa_valor_base = bling._num(d.payload->'taxas'->>'valorBase'),
      total_icms = bling._num(d.payload->'tributacao'->>'totalICMS'),
      total_ipi = bling._num(d.payload->'tributacao'->>'totalIPI'),
      intermediador_nome = nullif(d.payload->'intermediador'->>'nomeUsuario', ''),
      numero_loja = nullif(d.payload->>'numeroLoja', ''),
      frete_por_conta = nullif(d.payload->'transporte'->>'fretePorConta', '')::int,
      categoria_id = nullif(nullif(d.payload->'categoria'->>'id', ''), '0')::bigint,
      itens_qtd = jsonb_array_length(coalesce(d.payload->'itens', '[]'::jsonb)),
      itens_lidos = true,
      itens_lidos_em = now()
    from bling.raw_pedido d
   where p.empresa_id = p_empresa and d.empresa_id = p.empresa_id and d.bling_id = p.bling_id
     and d.nivel = 'detalhe' and p.bling_id = any(v_ids);
  get diagnostics v_ped = row_count;

  return jsonb_build_object('pedidos', v_ped, 'itens', v_it, 'parcelas', v_par);
end $$;

create or replace function bling.processar_nfe_extra(p_empresa uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_n int := 0; v_i int := 0; v_p int := 0;
begin
  update bling.cad_nfe n set
      data_operacao = nullif(d.payload->>'dataOperacao', '')::timestamp,
      tipo_nota = nullif(d.payload->>'tipoNota', ''),
      numero_pedido_loja = nullif(d.payload->>'numeroPedidoLoja', ''),
      pedido_bling_id = case when nullif(d.payload->>'numeroPedidoLoja', '') ~ '^[0-9]{1,18}$' then (d.payload->>'numeroPedidoLoja')::bigint end,
      frete_por_conta = nullif(d.payload->'transporte'->>'fretePorConta', '')::int,
      transportador_nome = nullif(d.payload->'transporte'->'transportador'->>'nome', ''),
      intermediador_nome = nullif(d.payload->'intermediador'->>'nomeUsuario', ''),
      total_tributos_aprox = (select sum(bling._num(i->'impostos'->>'valorAproximadoTotalTributos'))
                                from jsonb_array_elements(coalesce(d.payload->'itens', '[]'::jsonb)) i),
      outras_despesas = bling._num(d.payload->>'outrasDespesas'),
      desconto_valor = case when jsonb_typeof(d.payload->'desconto') = 'number' then bling._num(d.payload->>'desconto')
                            when jsonb_typeof(d.payload->'desconto') = 'object' then bling._num(d.payload->'desconto'->>'valor') end
    from bling.raw_nfe d
   where n.empresa_id = p_empresa and d.empresa_id = n.empresa_id and d.bling_id = n.bling_id and d.nivel = 'detalhe';
  get diagnostics v_n = row_count;

  update bling.cad_nfe_item ci set
      cest = nullif(it.v->>'cest', ''),
      peso_bruto = bling._num(it.v->>'pesoBruto'),
      peso_liquido = bling._num(it.v->>'pesoLiquido'),
      icms_valor = bling._num(it.v->'impostos'->'icms'->>'valor'),
      icms_aliquota = bling._num(it.v->'impostos'->'icms'->>'aliquota'),
      icms_st = bling._num(it.v->'impostos'->'icms'->>'st'),
      icms_origem = nullif(it.v->'impostos'->'icms'->>'origem', '')::int,
      icms_modalidade = nullif(it.v->'impostos'->'icms'->>'modalidade', '')::int,
      valor_aprox_tributos = bling._num(it.v->'impostos'->>'valorAproximadoTotalTributos'),
      custo_unit_snapshot = pr.custo_cru,
      custo_fonte = case when pr.bling_id is not null and pr.custo_cru is not null then 'produto_atual'
                         when pr.bling_id is null then 'sem_produto' else 'sem_custo' end
    from bling.raw_nfe d
    cross join lateral jsonb_array_elements(coalesce(d.payload->'itens', '[]'::jsonb)) with ordinality it(v, ord)
    left join bling.cad_produto pr on pr.empresa_id = d.empresa_id and pr.bling_id = (
        select ci2.produto_bling_id from bling.cad_nfe_item ci2
         where ci2.empresa_id = d.empresa_id and ci2.nfe_bling_id = d.bling_id and ci2.seq = it.ord::int)
   where d.empresa_id = p_empresa and d.nivel = 'detalhe'
     and ci.empresa_id = d.empresa_id and ci.nfe_bling_id = d.bling_id and ci.seq = it.ord::int;
  get diagnostics v_i = row_count;

  delete from bling.cad_nfe_parcela where empresa_id = p_empresa;
  insert into bling.cad_nfe_parcela (empresa_id, nfe_bling_id, seq, valor, vencimento, forma_pagamento_id, observacoes, atualizado_em)
  select p_empresa, d.bling_id, pa.ord::int, bling._num(pa.v->>'valor'), bling._dt(pa.v->>'data'),
         nullif(nullif(pa.v->'formaPagamento'->>'id', ''), '0')::bigint, nullif(pa.v->>'observacoes', ''), now()
    from bling.raw_nfe d
    cross join lateral jsonb_array_elements(coalesce(d.payload->'parcelas', '[]'::jsonb)) with ordinality pa(v, ord)
   where d.empresa_id = p_empresa and d.nivel = 'detalhe';
  get diagnostics v_p = row_count;

  return jsonb_build_object('notas', v_n, 'itens', v_i, 'parcelas', v_p);
end $$;

create or replace function bling.job_processar_itens()
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_emp uuid := '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda'; r jsonb; i int; v_tot int := 0; v_nfe jsonb;
begin
  for i in 1..4 loop
    r := bling.processar_pedido_itens(v_emp, 500);
    v_tot := v_tot + coalesce((r->>'pedidos')::int, 0);
    exit when coalesce((r->>'pedidos')::int, 0) < 500;
  end loop;
  -- notas: repreenche as colunas novas quando processar_nfe recriou os itens (custo_fonte nulo) ou há nota sem preenchimento
  if exists (select 1 from bling.cad_nfe_item where empresa_id = v_emp and custo_fonte is null)
     or exists (select 1 from bling.cad_nfe n where n.empresa_id = v_emp and n.tem_detalhe and n.data_operacao is null
                   and exists (select 1 from bling.raw_nfe d where d.empresa_id = n.empresa_id and d.bling_id = n.bling_id and d.nivel = 'detalhe'
                                  and nullif(d.payload->>'dataOperacao', '') is not null)) then
    v_nfe := bling.processar_nfe_extra(v_emp);
  end if;
  if v_tot > 0 or v_nfe is not null then
    insert into bling.log_carga (empresa_id, etapa, detalhe) values (v_emp, 'itens_ciclo', jsonb_build_object('pedidos', v_tot, 'nfe', v_nfe));
  end if;
end $$;

revoke all on function bling._num(text), bling._dt(text), bling.processar_pedido_itens(uuid, int), bling.processar_nfe_extra(uuid), bling.job_processar_itens()
  from public, anon, authenticated, service_role;

select cron.schedule('bling-processar-itens', '*/3 * * * *', 'select bling.job_processar_itens()');

/* ===== ROLLBACK (manual) =====
select cron.unschedule('bling-processar-itens');
drop function if exists bling.job_processar_itens(), bling.processar_nfe_extra(uuid), bling.processar_pedido_itens(uuid, int), bling._dt(text), bling._num(text);
alter table bling.cad_pedido drop column if exists itens_lidos_em;
-- (os dados gerados ficam nas tabelas novas; para limpar: truncate bling.cad_pedido_item, bling.cad_pedido_parcela, bling.cad_nfe_parcela;
--  update bling.cad_pedido set itens_lidos=false, itens_qtd=null; )
*/
