-- No link de pagamento, o nome civil informado pelo titular (para a nota) é o dado mais recente: substitui o atual (com log).
do $m$
declare d text := pg_get_functiondef('api.publico_entrega_salvar(text, boolean, text, text, text, text, text, text, text, text, uuid, text, text, text)'::regprocedure); n text;
begin
  n := replace(d, 'if v_nome_atual ~ ''^(@|CPF \*\*\*|Contato WhatsApp|Instagram |Sem nome)'' or v_nome_atual !~ '' '' then',
                  'if lower(extensions.unaccent(v_nome_atual)) is distinct from lower(extensions.unaccent(crm.nome_civil_limpo(v_nome))) then');
  if n = d then raise exception 'trecho não encontrado'; end if;
  execute n;
end $m$;
