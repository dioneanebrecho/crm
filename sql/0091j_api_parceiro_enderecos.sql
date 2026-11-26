create or replace function api.parceiro_enderecos(p_empresa uuid, p_parceiro uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pii boolean;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_pii := (select api.tem_papel(p_empresa, array['admin','gestor','suporte','expedicao']));
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'tipo', e.tipo, 'apelido', e.apelido, 'principal', e.principal, 'origem', e.origem, 'cep_situacao', e.cep_situacao,
      'cep', case when v_pii then e.cep else '•••••-' || right(e.cep, 3) end,
      'logradouro', e.logradouro, 'numero', case when v_pii then e.numero else '•••' end,
      'complemento', case when v_pii then e.complemento end, 'bairro', e.bairro, 'municipio', e.municipio, 'uf', e.uf,
      'codigo_municipio', e.codigo_municipio, 'ultimo_uso_em', e.ultimo_uso_em, 'criado_em', e.criado_em)
    order by e.principal desc, e.ultimo_uso_em desc nulls last)
    from crm.cad_parceiro_endereco e where e.empresa_id = p_empresa and e.parceiro_id = p_parceiro and e.ativo), '[]'::jsonb);
end $$;
revoke all on function api.parceiro_enderecos(uuid, uuid) from public, anon;
grant execute on function api.parceiro_enderecos(uuid, uuid) to authenticated;
