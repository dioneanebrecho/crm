-- desfaz o alerta de "CPF completo" no resumo: os documentos vindos do Bling já existem completos no espelho (aba Documento).
do $m$
declare d text := pg_get_functiondef('api.parceiro_resumo'::regproc); n text;
begin
  n := regexp_replace(d, ' if not exists \(select 1 from crm\.cad_parceiro_documento.*?end if;', '');
  if n = d then raise exception 'trecho não encontrado'; end if;
  execute n;
end $m$;
-- endereço do link de pagamento também conta no resumo (pessoa física sem cad_parceiro_dados)
do $m$
declare d text := pg_get_functiondef('api.parceiro_resumo'::regproc); n text;
begin
  n := replace(d, 'and nullif(d.codigo_municipio, '''') is not null and d.uf ~ ''^[A-Z]{2}$'';',
    'and nullif(d.codigo_municipio, '''') is not null and d.uf ~ ''^[A-Z]{2}$'';' ||
    ' v_end := v_end or exists (select 1 from crm.cad_parceiro_endereco e where e.parceiro_id = p_parceiro and e.ativo and e.codigo_municipio is not null and e.tipo in (''fiscal'',''ambos'',''entrega'') and e.principal);');
  if n = d then raise exception 'trecho do endereço não encontrado'; end if;
  execute n;
end $m$;
