-- 0087d_atendimento_papel_leitura.sql — papel "leitura" consulta a caixa (sem responder, sem marcar como lida)
create or replace function atendimento.papeis_leitura() returns text[] language sql immutable as $$
  select array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']
$$;
revoke all on function atendimento.papeis_leitura() from public, anon, authenticated;
do $$ declare f text; d text; begin
  foreach f in array array['api.atendimento_conversas(uuid,text,text,text,text,int)','api.atendimento_resumo(uuid)',
                           'api.atendimento_conversa(uuid,uuid,boolean)','api.atendimento_respostas(uuid,boolean)'] loop
    d := pg_get_functiondef(f::regprocedure);
    execute replace(d, 'atendimento.papeis_caixa()', 'atendimento.papeis_leitura()');
  end loop;
end $$;
do $$ declare d text; begin
  d := pg_get_functiondef('api.atendimento_conversa(uuid,uuid,boolean)'::regprocedure);
  execute replace(d, 'if p_marcar_lida then', 'if p_marcar_lida and api.tem_papel(p_empresa, atendimento.papeis_caixa()) then');
end $$;

-- 0087e (aplicada junto): search_path fixo, apontado pelo advisor de segurança
alter function atendimento.papeis_caixa() set search_path to '';
alter function atendimento.papeis_leitura() set search_path to '';
