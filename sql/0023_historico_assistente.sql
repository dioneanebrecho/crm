-- 0023: tela Assistente para o usuário final + histórico das últimas perguntas.
-- O histórico é PESSOAL: cada usuário enxerga só as próprias perguntas (já gravadas mascaradas por svc_registrar_recuperacao),
-- das últimas 90 dias, e pode limpá-lo. Quem não tem a tela Assistente (nem Conhecimento) não lê nada.
-- A tela Conhecimento passa a ser a administração dos documentos (grupo Configuração).

create function api.historico_perguntas(p_empresa uuid, p_limite int default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['assistente','conhecimento']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('pergunta', x.pergunta, 'em', x.em, 'achados', x.achados) order by x.em desc)
      from (select d.pergunta, d.em, d.achados
              from (select distinct on (lower(l.pergunta)) l.pergunta, l.criado_em as em, cardinality(l.chunk_ids) as achados
                      from conhecimento.log_recuperacao l
                     where l.empresa_id = p_empresa and l.usuario_id = (select auth.uid()) and l.criado_em > now() - interval '90 days'
                     order by lower(l.pergunta), l.criado_em desc) d
             order by d.em desc limit least(greatest(coalesce(p_limite, 12), 1), 30)) x), '[]'::jsonb);
end $$;

create function api.limpar_historico_perguntas(p_empresa uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['assistente','conhecimento']);
  delete from conhecimento.log_recuperacao where empresa_id = p_empresa and usuario_id = (select auth.uid());
  get diagnostics n = row_count;
  return n;
end $$;

update crm.cad_tela set situacao = 'ativa', aplicacao = 'tela_e_banco', grupo = 'Inteligência',
       descricao = 'Perguntas sobre regras e processos da operação, com histórico e atalhos para notas, parceiros e clientes' where tela = 'assistente';
update crm.cad_tela set grupo = 'Configuração', rotulo = 'Base de conhecimento',
       descricao = 'Administração dos documentos que o assistente consulta (envio, vetores, ativar/desativar)' where tela = 'conhecimento';

revoke all on function api.historico_perguntas(uuid, int), api.limpar_historico_perguntas(uuid) from public, anon, authenticated, service_role;
grant execute on function api.historico_perguntas(uuid, int), api.limpar_historico_perguntas(uuid) to authenticated;
