-- 0094e: corrige referência ambígua em api.fin_baixar (variável t × apelido t). Substituição pontual com conferência.
-- Já incorporada ao texto de 0094c_fin_api.sql.
do $$
declare d text := pg_get_functiondef('api.fin_baixar(uuid,jsonb)'::regprocedure); a text;
begin
  a := 'select count(distinct t.tipo), count(distinct t.parceiro_id), count(*) into v_tipos, v_parc, v_achados
    from jsonb_array_elements(p_dados -> ''itens'') x join financeiro.mov_titulo t on t.id = (x ->> ''titulo_id'')::uuid and t.empresa_id = p_empresa;';
  if position(a in d) = 0 then raise exception 'trecho não encontrado'; end if;
  d := replace(d, a, 'select count(distinct q.tipo), count(distinct q.parceiro_id), count(*) into v_tipos, v_parc, v_achados
    from jsonb_array_elements(p_dados -> ''itens'') x join financeiro.mov_titulo q on q.id = (x ->> ''titulo_id'')::uuid and q.empresa_id = p_empresa;');
  execute d;
end $$;
