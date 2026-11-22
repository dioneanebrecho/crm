-- 0024_parceiros_ux_principal_notas.sql
-- Pedido de mudança 014: UX da tela Parceiros (contato principal, filtros de repetidos, histórico de notas).
-- Aditivo: 1 coluna nova e 4 funções novas no schema api. Nada existente é alterado ou removido.
-- Reversão:
--   drop function api.obter_parceiro_contatos(uuid, uuid);
--   drop function api.definir_contato_principal(uuid, uuid, bigint);
--   drop function api.listar_notas_parceiro(uuid, uuid, integer, integer);
--   drop function api.resumo_notas_parceiro(uuid, uuid);
--   alter table bling.rel_contato_parceiro drop column principal;

alter table bling.rel_contato_parceiro add column if not exists principal boolean not null default false;
comment on column bling.rel_contato_parceiro.principal is
  'Contato do Bling escolhido manualmente como principal do parceiro (preferência de exibição; não altera a amarração).';

-- Contatos do parceiro com os indicadores usados nos filtros de repetidos.
-- O Bling não informa data de alteração no que lemos; "mais recente" usa o maior ID do Bling (sequencial por criação).
create or replace function api.obter_parceiro_contatos(p_empresa uuid, p_parceiro uuid)
returns table(bling_id bigint, nome_cru text, nome_padrao text, situacao text, inativo boolean,
              documento_ultimos text, documento_valido boolean, handle_social text, telefone text,
              criterio text, status text, motivo text, decidido_por text, decidido_em timestamptz,
              principal boolean, completude integer, mais_recente boolean, mais_completo boolean, qtd_notas bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_pii boolean; v_fiscal boolean;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_pii := (select api.tem_papel(p_empresa, array['admin','gestor','suporte']));
  v_fiscal := (select api.tem_papel(p_empresa, array['admin','gestor','financeiro']));
  return query
  with base as (
    select c.bling_id, c.nome_cru, c.nome_padrao, c.situacao, c.documento_ultimos, c.documento_valido, c.handle_social,
           coalesce(nullif(trim(c.celular_cru),''), nullif(trim(c.telefone_cru),'')) tel,
           (coalesce(c.situacao,'A') <> 'A' or coalesce(c.inativo_no_nome,false)) inat,
           c.tem_detalhe, m.criterio, m.status, m.motivo, m.decidido_por, m.decidido_em, m.principal
      from bling.rel_contato_parceiro m join bling.cad_contato c using (empresa_id, bling_id)
     where m.empresa_id = p_empresa and m.parceiro_id = p_parceiro),
  pont as (
    select b.*,
           ((case when b.documento_valido then 1 else 0 end) + (case when b.handle_social is not null then 1 else 0 end)
            + (case when b.tel is not null then 1 else 0 end) + (case when b.tem_detalhe then 1 else 0 end)
            + (case when not b.inat then 1 else 0 end))::integer comp
      from base b),
  rk as (
    select p.*,
           row_number() over (order by p.inat, p.bling_id desc) r_rec,
           row_number() over (order by p.comp desc, p.inat, p.bling_id desc) r_comp
      from pont p)
  select r.bling_id, r.nome_cru, r.nome_padrao, r.situacao, r.inat, r.documento_ultimos, r.documento_valido, r.handle_social,
         case when v_pii then r.tel end, r.criterio, r.status, r.motivo, r.decidido_por, r.decidido_em,
         r.principal, r.comp, r.r_rec = 1, r.r_comp = 1,
         case when v_fiscal then (select count(*) from bling.cad_nfe n where n.empresa_id = p_empresa and n.contato_bling_id = r.bling_id) end
    from rk r
   order by r.principal desc, r.inat, r.bling_id desc;
end $$;

-- Define (ou limpa, com p_bling_id nulo) o contato principal do parceiro. Não mexe na amarração nem no critério.
create or replace function api.definir_contato_principal(p_empresa uuid, p_parceiro uuid, p_bling_id bigint)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_ator text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte']);
  if p_bling_id is not null and not exists (
      select 1 from bling.rel_contato_parceiro m
       where m.empresa_id = p_empresa and m.parceiro_id = p_parceiro and m.bling_id = p_bling_id and m.status = 'vinculado') then
    raise exception 'contato não está vinculado a este parceiro' using errcode = '22023';
  end if;
  v_ator := coalesce((select auth.jwt() ->> 'email'), (select auth.uid())::text, 'sistema');
  update bling.rel_contato_parceiro m set principal = (m.bling_id = p_bling_id)
   where m.empresa_id = p_empresa and m.parceiro_id = p_parceiro and (m.principal or m.bling_id = p_bling_id);
  insert into bling.log_vinculo (empresa_id, bling_id, parceiro_antes, parceiro_depois, status, criterio, motivo, ator)
  select p_empresa, coalesce(p_bling_id, 0), p_parceiro, p_parceiro, 'vinculado', 'manual',
         case when p_bling_id is null then 'contato principal removido' else 'contato principal definido' end, v_ator;
end $$;

-- Notas (NF-e) de todos os contatos Bling vinculados ao parceiro. Dado pessoal: só admin, gestor e financeiro.
create or replace function api.listar_notas_parceiro(p_empresa uuid, p_parceiro uuid, p_limite integer default 50, p_offset integer default 0)
returns table(bling_id bigint, numero text, serie integer, tipo integer, situacao integer, situacao_rotulo text,
              data_emissao timestamp, valor_nota numeric, valor_frete numeric, qtd_itens integer, tem_detalhe boolean,
              contato_bling_id bigint, contato_nome text, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform api._exigir(p_empresa, array['admin','gestor','financeiro']);
  return query
    select n.bling_id, n.numero, n.serie, n.tipo, n.situacao, s.rotulo, n.data_emissao, n.valor_nota, n.valor_frete,
           n.qtd_itens, n.tem_detalhe, n.contato_bling_id, n.contato_nome, count(*) over ()
      from bling.cad_nfe n
      join bling.rel_contato_parceiro m on m.empresa_id = n.empresa_id and m.bling_id = n.contato_bling_id
      left join bling.cfg_dominio_nfe_situacao s on s.codigo = n.situacao
     where n.empresa_id = p_empresa and m.parceiro_id = p_parceiro and m.status = 'vinculado'
     order by n.data_emissao desc nulls last, n.bling_id
     limit least(greatest(coalesce(p_limite,50),1),200) offset greatest(coalesce(p_offset,0),0);
end $$;

-- Totais do histórico. Os códigos de situação ainda não foram validados na conta (cfg_dominio_nfe_situacao.validado = false):
-- valor_total e ticket_medio desconsideram canceladas (2), rejeitadas (4) e denegadas (9) e só somam notas com detalhe lido.
create or replace function api.resumo_notas_parceiro(p_empresa uuid, p_parceiro uuid)
returns table(qtd_notas bigint, qtd_sem_detalhe bigint, qtd_desconsideradas bigint, valor_total numeric, ticket_medio numeric,
              primeira timestamp, ultima timestamp, por_situacao jsonb)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform api._exigir(p_empresa, array['admin','gestor','financeiro']);
  return query
  with n as (
    select x.*, coalesce(s.rotulo, 'Situação ' || x.situacao) rot
      from bling.cad_nfe x
      join bling.rel_contato_parceiro m on m.empresa_id = x.empresa_id and m.bling_id = x.contato_bling_id
      left join bling.cfg_dominio_nfe_situacao s on s.codigo = x.situacao
     where x.empresa_id = p_empresa and m.parceiro_id = p_parceiro and m.status = 'vinculado'),
  sit as (select rot, count(*) q from n group by rot)
  select count(*), count(*) filter (where not n.tem_detalhe),
         count(*) filter (where n.situacao in (2,4,9)),
         coalesce(sum(n.valor_nota) filter (where n.tem_detalhe and n.situacao not in (2,4,9)), 0),
         (sum(n.valor_nota) filter (where n.tem_detalhe and n.situacao not in (2,4,9))
            / nullif(count(*) filter (where n.tem_detalhe and n.situacao not in (2,4,9)), 0)),
         min(n.data_emissao), max(n.data_emissao),
         coalesce((select jsonb_object_agg(sit.rot, sit.q) from sit), '{}'::jsonb)
    from n;
end $$;

revoke all on function api.obter_parceiro_contatos(uuid, uuid) from public, anon;
revoke all on function api.definir_contato_principal(uuid, uuid, bigint) from public, anon;
revoke all on function api.listar_notas_parceiro(uuid, uuid, integer, integer) from public, anon;
revoke all on function api.resumo_notas_parceiro(uuid, uuid) from public, anon;
grant execute on function api.obter_parceiro_contatos(uuid, uuid) to authenticated;
grant execute on function api.definir_contato_principal(uuid, uuid, bigint) to authenticated;
grant execute on function api.listar_notas_parceiro(uuid, uuid, integer, integer) to authenticated;
grant execute on function api.resumo_notas_parceiro(uuid, uuid) to authenticated;
