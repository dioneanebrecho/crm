-- 0027: api.listar_pecas passa a devolver a foto de capa (primeira foto da peça) para a miniatura na lista de Peças.
-- PROPOSTA: ainda não aplicada. Ver pedido-mudanca-016-ux-pecas-categoria-marca.md.
-- Muda o tipo de retorno (coluna nova), por isso precisa de drop + create. O painel já trata a coluna como opcional:
-- antes desta migration a lista mostra "—" no lugar da miniatura. A foto em si depende da 0022 (Storage + api.definir_fotos_peca).
-- Rollback: recriar a versão anterior (sem foto_capa), disponível em pg_get_functiondef ou na 0011.

drop function api.listar_pecas(uuid, text, integer, integer);

create function api.listar_pecas(p_empresa uuid, p_busca text default null, p_limite integer default 50, p_offset integer default 0)
returns table (id uuid, codigo text, nome text, categoria text, marca text, condicao text, custo numeric, preco_tabela numeric,
               qtd_variacoes bigint, qtd_unidades bigint, qtd_disponiveis bigint, atualizado_em timestamptz, total bigint, foto_capa text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_custo boolean;
  v_busca text := case when nullif(trim(p_busca), '') is null then null
                       else '%' || regexp_replace(trim(p_busca), '([\\%_])', '\\\1', 'g') || '%' end;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_custo := (select api.tem_papel(p_empresa, array['admin','gestor','financeiro']));
  return query
    select p.id, p.codigo, p.nome, p.categoria, p.marca, p.condicao,
           case when v_custo then p.custo end, p.preco_tabela,
           (select count(*) from catalogo.cad_variacao v where v.peca_id = p.id),
           (select count(*) from catalogo.cad_unidade u join catalogo.cad_variacao v on v.id = u.variacao_id where v.peca_id = p.id),
           (select count(*) from catalogo.cad_unidade u join catalogo.cad_variacao v on v.id = u.variacao_id
             where v.peca_id = p.id and u.estado = 'disponivel'),
           p.atualizado_em, count(*) over (),
           case jsonb_typeof(p.fotos -> 0) when 'string' then p.fotos ->> 0 when 'object' then p.fotos -> 0 ->> 'url' end
      from catalogo.cad_peca p
     where p.empresa_id = p_empresa
       and (v_busca is null or p.codigo ilike v_busca or p.nome ilike v_busca or p.marca ilike v_busca or p.categoria ilike v_busca)
     order by p.atualizado_em desc, p.id
     limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke all on function api.listar_pecas(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function api.listar_pecas(uuid, text, integer, integer) to authenticated;
