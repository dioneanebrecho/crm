do $m$
declare d text := pg_get_functiondef('crm.absorver_pre_cadastro(uuid, uuid, text)'::regprocedure); n text;
begin
  n := replace(d, 'update crm.cad_parceiro_identificador set parceiro_id = p_destino where parceiro_id = p_origem;',
    'update crm.cad_parceiro_identificador set parceiro_id = p_destino where parceiro_id = p_origem;' ||
    ' update crm.cad_parceiro_endereco set parceiro_id = p_destino, principal = false, atualizado_em = now() where parceiro_id = p_origem;');
  if n = d then raise exception 'trecho não encontrado'; end if;
  execute n;
end $m$;
