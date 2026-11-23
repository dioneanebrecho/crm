-- STATUS: APLICADO em 23/11/2026 (migration 0060_margem_bruta_composicao, pedido de mudança 032, etapa 4). Só objetos novos.
-- Visão de composição por pedido + função de margem bruta do assistente.
-- Pedido válido = mesma regra de bling._vendas_base (situação com valida=true; sem cadastro de situação conta como válido).
-- Margem bruta = receita dos itens COM custo − custo dos itens (custo ATUAL do produto, não o da época). Itens sem custo ficam fora da margem e são contados.
-- Não calcula margem de contribuição (frete, comissão, taxas e imposto não entram).

create or replace view bling.vw_pedido_composicao with (security_invoker = true) as
select p.empresa_id,
       p.bling_id as pedido_bling_id,
       p.numero,
       p.data,
       coalesce(nullif(btrim(p.contato_nome), ''), 'Sem cliente') as cliente,
       coalesce(p.total, 0) as total,
       p.total_produtos,
       i.soma_itens,
       i.qtd_itens,
       i.itens_sem_custo,
       i.receita_com_custo,
       i.custo_total,
       i.receita_com_custo - i.custo_total as margem_bruta,
       coalesce(pa.qtd_parcelas, 0)::int as qtd_parcelas
  from bling.cad_pedido p
  join bling.cfg_dominio_pedido_situacao d on d.codigo = p.situacao and coalesce(d.valida, true)
  join lateral (
        select count(*)::int as qtd_itens,
               sum(it.valor_total) as soma_itens,
               count(*) filter (where it.match_status is distinct from 'ok')::int as itens_sem_custo,
               coalesce(sum(it.valor_total) filter (where it.match_status = 'ok'), 0) as receita_com_custo,
               coalesce(sum(it.quantidade * it.custo_unit_snapshot) filter (where it.match_status = 'ok'), 0) as custo_total
          from bling.cad_pedido_item it
         where it.empresa_id = p.empresa_id and it.pedido_bling_id = p.bling_id) i on i.qtd_itens > 0
  left join lateral (
        select count(*) as qtd_parcelas from bling.cad_pedido_parcela pp
         where pp.empresa_id = p.empresa_id and pp.pedido_bling_id = p.bling_id) pa on true;

comment on view bling.vw_pedido_composicao is 'Pedido válido (mesma regra de bling._vendas_base: situação com valida=true ou sem cadastro) com itens espelhados: soma dos itens, custo atual do produto, margem bruta (só itens com custo) e nº de parcelas.';

revoke all on bling.vw_pedido_composicao from public, anon, authenticated, service_role;

create or replace function api.assistente_margem(p_empresa uuid, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_valores boolean; r record; v_cob numeric; v_aviso text; v_baixa boolean;
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['assistente']);
  v_valores := api.tem_papel(p_empresa, array['admin', 'gestor', 'financeiro']);

  select count(*) filter (where b.valida) as validos,
         count(*) filter (where b.valida and c.pedido_bling_id is not null) as com_itens,
         sum(c.soma_itens) as receita_itens,
         sum(c.receita_com_custo) as receita_com_custo,
         sum(c.custo_total) as custo_total,
         coalesce(sum(c.itens_sem_custo), 0) as itens_sem_custo
    into r
    from bling._vendas_base(p_empresa, p_de, p_ate) b
    left join bling.vw_pedido_composicao c on c.empresa_id = p_empresa and c.pedido_bling_id = b.bling_id;

  v_cob := case when r.validos > 0 then round(100.0 * r.com_itens / r.validos, 1) else 0 end;
  v_baixa := v_cob < 80;
  v_aviso := format('O custo usado é o custo ATUAL do produto no cadastro, não o custo da época da venda. Margem bruta = valor dos itens − custo dos itens (sem frete, comissão, taxas nem imposto). Cobertura: %s de %s pedidos válidos do período já têm os itens lidos (%s%%).',
                    coalesce(r.com_itens, 0), coalesce(r.validos, 0), v_cob);
  if v_baixa then
    v_aviso := 'ATENÇÃO: cobertura baixa, os valores abaixo são PARCIAIS e não representam o total do período (os itens dos demais pedidos ainda estão sendo lidos do Bling). ' || v_aviso;
  end if;
  if coalesce(r.itens_sem_custo, 0) > 0 then
    v_aviso := v_aviso || format(' %s itens sem custo cadastrado ficaram fora da margem.', r.itens_sem_custo);
  end if;

  return jsonb_build_object(
    'ok', true, 've_valores', v_valores, 'de', p_de, 'ate', p_ate,
    'receita_itens', case when v_valores then coalesce(r.receita_itens, 0) end,
    'custo_total', case when v_valores then coalesce(r.custo_total, 0) end,
    'margem_bruta', case when v_valores then coalesce(r.receita_com_custo, 0) - coalesce(r.custo_total, 0) end,
    'margem_pct', case when v_valores and coalesce(r.receita_com_custo, 0) > 0
                       then round(100.0 * (r.receita_com_custo - r.custo_total) / r.receita_com_custo, 1) end,
    'pedidos_validos_no_periodo', coalesce(r.validos, 0),
    'pedidos_com_itens', coalesce(r.com_itens, 0),
    'cobertura_pct', v_cob,
    'cobertura_baixa', v_baixa,
    'itens_sem_custo', coalesce(r.itens_sem_custo, 0),
    'aviso', v_aviso);
end $$;

revoke all on function api.assistente_margem(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function api.assistente_margem(uuid, date, date) to authenticated;

/* ===== ROLLBACK =====
drop function if exists api.assistente_margem(uuid, date, date);
drop view if exists bling.vw_pedido_composicao;
*/
