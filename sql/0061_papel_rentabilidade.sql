-- STATUS: APLICADO em 24/11/2026 (migration 0061_papel_rentabilidade, pedido de mudança 034). Testada antes com rollback no banco oficial.
-- Regra de negócio: custo, margem e rentabilidade só para admin, gestor ou quem tem a marcação "Ver custo e margem" (papel `rentabilidade`, direto ou por grupo).
-- Preserva o que já existia: grupo Financeiro e usuários com papel financeiro recebem a marcação (antes viam custo por serem financeiro).
-- Reversão: recolocar array['admin','gestor','financeiro'] nas 5 funções (listar_pecas, listar_produtos_bling, obter_peca, obter_produto_bling, assistente_margem),
--           tirar 'rentabilidade' dos checks e das listas de convidar_usuario/definir_acesso_usuario/salvar_grupo, e dropar api.ver_rentabilidade.

alter table crm.rel_usuario_empresa drop constraint rel_usuario_empresa_papel_check;
alter table crm.rel_usuario_empresa add constraint rel_usuario_empresa_papel_check
  check (papel = any (array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura','rentabilidade']));
alter table crm.cad_grupo_acesso drop constraint cad_grupo_acesso_papeis_check;
alter table crm.cad_grupo_acesso add constraint cad_grupo_acesso_papeis_check
  check (papeis <@ array['gestor','suporte','apresentadora','expedicao','financeiro','leitura','rentabilidade']);

create function api.ver_rentabilidade(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select api.tem_papel(p_empresa, array['admin','gestor','rentabilidade'])
$$;
revoke all on function api.ver_rentabilidade(uuid) from public, anon, authenticated, service_role;
grant execute on function api.ver_rentabilidade(uuid) to authenticated;

do $$
declare r record; d text; d2 text;
begin
  -- funções que devolvem custo/margem passam a usar api.ver_rentabilidade
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'api' and p.proname in ('listar_pecas','listar_produtos_bling','obter_peca','obter_produto_bling','assistente_margem') loop
    d := pg_get_functiondef(r.oid);
    d2 := regexp_replace(d, 'api\.tem_papel\(p_empresa,\s*array\[''admin'',\s*''gestor'',\s*''financeiro''\]\)', 'api.ver_rentabilidade(p_empresa)', 'g');
    if d2 = d then raise exception 'regra nao encontrada em %', r.proname; end if;
    execute d2;
  end loop;
  -- funções que validam a lista de papéis aceitam o novo papel
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'api' and p.proname in ('convidar_usuario','definir_acesso_usuario','salvar_grupo') loop
    d := pg_get_functiondef(r.oid);
    d2 := regexp_replace(d, '(x not in \([^)]*''leitura'')\)', '\1, ''rentabilidade'')', 'g');
    if d2 = d then raise exception 'lista de papeis nao encontrada em %', r.proname; end if;
    execute d2;
  end loop;
  -- empresas novas já nascem com o grupo "Custo e margem" e o Financeiro com a marcação
  d := pg_get_functiondef('crm._semear_grupos(uuid)'::regprocedure);
  d2 := replace(d, 'array[''financeiro''], true),', 'array[''financeiro'',''rentabilidade''], true),' || E'\n    (p_empresa, ''Custo e margem'', ''Ver custo, margem e rentabilidade em qualquer tela'', array[''rentabilidade''], true),');
  if d2 = d then raise exception 'semear_grupos nao alterada'; end if;
  execute d2;
end $$;

update crm.cad_grupo_acesso set papeis = papeis || array['rentabilidade']
 where nome = 'Financeiro' and sistema and not ('rentabilidade' = any (papeis));
insert into crm.cad_grupo_acesso (empresa_id, nome, descricao, papeis, sistema)
select e.id, 'Custo e margem', 'Ver custo, margem e rentabilidade em qualquer tela', array['rentabilidade'], true
  from crm.cad_empresa e
 where not exists (select 1 from crm.cad_grupo_acesso g where g.empresa_id = e.id and g.nome = 'Custo e margem');
insert into crm.rel_usuario_empresa (usuario_id, empresa_id, papel, ativo)
select usuario_id, empresa_id, 'rentabilidade', ativo from crm.rel_usuario_empresa where papel = 'financeiro'
on conflict do nothing;
