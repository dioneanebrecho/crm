-- 0028_documento_completo_consulta_receita.sql
-- Pedido de mudança 017: CPF/CNPJ completo para o time de cadastro e consulta de CNPJ na Receita (ReceitaWS).
-- Aditivo: 1 tabela de auditoria e 2 funções novas no schema api. Nada existente é alterado.
-- Decisão de Dione (22/11/2026): o time de cadastro pode ver o documento completo (antes: só hash + 4 últimos dígitos).
-- O documento completo continua só no dado bruto do Bling (bling.raw_contato); nada novo é gravado em claro.
-- Todo acesso fica registrado (quem, quando, qual parceiro), sem gravar o número.
-- Reversão:
--   drop function api.obter_documento_parceiro(uuid, uuid);
--   drop function api.registrar_consulta_receita(uuid, text);
--   drop table crm.log_acesso_documento;

create table if not exists crm.log_acesso_documento (
  id bigint generated always as identity primary key,
  empresa_id uuid not null,
  usuario_id uuid,
  parceiro_id uuid,
  acao text not null check (acao in ('ver_documento', 'consulta_receita_cnpj')),
  documento_ultimos text,
  em timestamptz not null default now()
);
create index if not exists log_acesso_documento_empresa_em on crm.log_acesso_documento (empresa_id, em desc);
alter table crm.log_acesso_documento enable row level security;
revoke all on crm.log_acesso_documento from public, anon, authenticated;
comment on table crm.log_acesso_documento is 'Auditoria de quem viu documento completo ou consultou a Receita. Não guarda o número do documento.';

-- Documentos completos dos contatos Bling vinculados ao parceiro (admin, gestor, suporte). Registra o acesso.
create or replace function api.obter_documento_parceiro(p_empresa uuid, p_parceiro uuid)
returns table(tipo text, numero text, valido boolean, confere_identificador boolean, bling_ids bigint[])
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte']);
  if not exists (select 1 from crm.cad_parceiro p where p.id = p_parceiro and p.empresa_id = p_empresa) then
    raise exception 'parceiro não encontrado' using errcode = '22023';
  end if;
  insert into crm.log_acesso_documento (empresa_id, usuario_id, parceiro_id, acao)
  values (p_empresa, (select auth.uid()), p_parceiro, 'ver_documento');
  return query
  with c as (
    select m.bling_id,
           regexp_replace(coalesce((select rr.payload ->> 'numeroDocumento' from bling.raw_contato rr
                                     where rr.empresa_id = m.empresa_id and rr.bling_id = m.bling_id
                                     order by (rr.nivel = 'detalhe') desc, rr.lido_em desc limit 1), ''), '\D', '', 'g') d
      from bling.rel_contato_parceiro m
     where m.empresa_id = p_empresa and m.parceiro_id = p_parceiro and m.status = 'vinculado'),
  g as (select c.d, array_agg(c.bling_id order by c.bling_id) ids from c where c.d <> '' group by c.d)
  select case length(g.d) when 11 then 'cpf' when 14 then 'cnpj' else 'outro' end,
         g.d,
         case length(g.d) when 11 then bling.fn_cpf_valido(g.d) when 14 then bling.fn_cnpj_valido(g.d) else false end,
         exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = p_parceiro and i.valor_hash = bling.fn_hash_doc(g.d)),
         g.ids
    from g
   order by 3 desc, 1, 2;
end $$;

-- Chamada pela Edge Function consulta-receita antes de consultar: confere o papel e registra (sem o número completo).
create or replace function api.registrar_consulta_receita(p_empresa uuid, p_documento_ultimos text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte']);
  insert into crm.log_acesso_documento (empresa_id, usuario_id, acao, documento_ultimos)
  values (p_empresa, (select auth.uid()), 'consulta_receita_cnpj', right(regexp_replace(coalesce(p_documento_ultimos,''), '\D', '', 'g'), 4));
end $$;

revoke all on function api.obter_documento_parceiro(uuid, uuid) from public, anon;
revoke all on function api.registrar_consulta_receita(uuid, text) from public, anon;
grant execute on function api.obter_documento_parceiro(uuid, uuid) to authenticated;
grant execute on function api.registrar_consulta_receita(uuid, text) to authenticated;
