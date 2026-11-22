-- 0029_link_danfe_nfe_bling.sql  (já aplicada no banco em 22/11/2026)
-- Pedido de mudança 018: botão "Gerar link do DANFE (PDF)" na tela Notas Bling.
-- Aditivo: 1 função nova no schema api. Nada existente é alterado.
-- O link vem do dado bruto do Bling (bling.raw_nfe, nível detalhe) e carrega a chave de acesso da nota:
-- por isso é entregue só sob demanda, só a admin, gestor e financeiro, e nunca vai para a listagem.
-- Só devolve links de https://www.bling.com.br.
-- Reversão: drop function api.obter_link_danfe_nfe_bling(uuid, bigint);

create or replace function api.obter_link_danfe_nfe_bling(p_empresa uuid, p_bling_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb; l_pdf text; l_danfe text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','financeiro']);
  select r.payload into v from bling.raw_nfe r
   where r.empresa_id = p_empresa and r.bling_id = p_bling_id and r.nivel = 'detalhe'
   order by r.lido_em desc limit 1;
  if v is null then return null; end if;
  l_pdf := nullif(v ->> 'linkPDF', '');
  l_danfe := nullif(v ->> 'linkDanfe', '');
  if l_pdf !~ '^https://www\.bling\.com\.br/' then l_pdf := null; end if;
  if l_danfe !~ '^https://www\.bling\.com\.br/' then l_danfe := null; end if;
  if l_pdf is null and l_danfe is null then return null; end if;
  return jsonb_build_object('pdf', l_pdf, 'danfe', l_danfe);
end $$;

revoke all on function api.obter_link_danfe_nfe_bling(uuid, bigint) from public, anon;
grant execute on function api.obter_link_danfe_nfe_bling(uuid, bigint) to authenticated;
