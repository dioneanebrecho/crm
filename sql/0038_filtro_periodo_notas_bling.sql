-- 0038 · Filtro por período de emissão em api.listar_nfe_bling
-- Impacto: só leitura. Troca a assinatura (5 -> 7 parâmetros, os 2 novos com DEFAULT NULL), então chamadas antigas continuam válidas.
-- O DROP da assinatura antiga evita sobrecarga ambígua no PostgREST. Único chamador: painel (apiBling.notas).
-- Reversão: ver bloco no final (definição anterior preservada).
begin;

drop function if exists api.listar_nfe_bling(uuid, text, integer, integer, integer);

create or replace function api.listar_nfe_bling(
  p_empresa uuid, p_busca text default null, p_situacao integer default null,
  p_limite integer default 50, p_offset integer default 0,
  p_data_ini date default null, p_data_fim date default null)
returns table(bling_id bigint, numero text, serie integer, situacao integer, situacao_rotulo text, loja_id bigint,
              data_emissao timestamp without time zone, valor_nota numeric, contato_bling_id bigint, contato_nome text,
              qtd_itens integer, tem_detalhe boolean, tem_xml boolean, total bigint)
language plpgsql stable security definer set search_path to ''
as $function$
#variable_conflict use_column
declare v_busca text := case when nullif(trim(p_busca),'') is null then null else '%' || regexp_replace(trim(p_busca),'([\\%_])','\\\1','g') || '%' end;
begin
  perform api._exigir(p_empresa, array['admin','gestor','financeiro']);
  return query
    select n.bling_id, n.numero, n.serie, n.situacao, s.rotulo, n.loja_id, n.data_emissao, n.valor_nota, n.contato_bling_id,
           n.contato_nome, n.qtd_itens, n.tem_detalhe, n.tem_xml, count(*) over ()
      from bling.cad_nfe n left join bling.cfg_dominio_nfe_situacao s on s.codigo = n.situacao
     where n.empresa_id = p_empresa
       and (v_busca is null or n.numero ilike v_busca or n.contato_nome ilike v_busca or n.bling_id::text ilike v_busca
            or exists (select 1 from bling.cad_nfe_item i where i.empresa_id=n.empresa_id and i.nfe_bling_id=n.bling_id
                        and (i.codigo ilike v_busca or i.descricao ilike v_busca)))
       and (p_situacao is null or n.situacao = p_situacao)
       and (p_data_ini is null or n.data_emissao >= p_data_ini::timestamp)
       and (p_data_fim is null or n.data_emissao <  (p_data_fim + 1)::timestamp)
     order by n.data_emissao desc nulls last, n.bling_id
     limit least(greatest(coalesce(p_limite,50),1),200) offset greatest(coalesce(p_offset,0),0);
end $function$;

revoke all on function api.listar_nfe_bling(uuid, text, integer, integer, integer, date, date) from public, anon;
grant execute on function api.listar_nfe_bling(uuid, text, integer, integer, integer, date, date) to authenticated;
commit;

/* REVERSÃO (definição anterior, sem filtro de data):
begin;
drop function if exists api.listar_nfe_bling(uuid, text, integer, integer, integer, date, date);
-- recriar com os 5 parâmetros originais: mesmo corpo acima, sem as 2 linhas de p_data_ini/p_data_fim e sem esses parâmetros.
-- grant execute on function api.listar_nfe_bling(uuid, text, integer, integer, integer) to authenticated;
commit;
*/
