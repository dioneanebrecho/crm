-- 0090f: cadastro/edição de parceiro pela tela Parceiros (substitui o formulário da tela Clientes).
create or replace function api.parceiro_salvar(p_empresa uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_dados ->> 'id', '')::uuid; v_nome text := nullif(regexp_replace(btrim(coalesce(p_dados ->> 'nome', '')), '\s+', ' ', 'g'), '');
  v_tipo text := nullif(p_dados ->> 'tipo_pessoa', ''); v_doc text := regexp_replace(coalesce(p_dados ->> 'documento', ''), '\D', '', 'g');
  v_papeis text[] := array(select jsonb_array_elements_text(coalesce(p_dados -> 'papeis', '[]'::jsonb)));
  v_ig text := crm.norm_instagram(p_dados ->> 'instagram'); v_tel text := crm.norm_telefone(p_dados ->> 'whatsapp');
  v_dono uuid; v_tdoc text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte']);
  if v_nome is null or length(v_nome) > 160 or v_nome ~ '[<>]' then raise exception 'informe o nome (até 160 caracteres)' using errcode = '22023'; end if;
  if v_tipo is not null and v_tipo not in ('F','J','E') then raise exception 'tipo de pessoa inválido' using errcode = '22023'; end if;
  if cardinality(v_papeis) = 0 then raise exception 'escolha ao menos um papel' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_papeis) x where x not in (select papel from crm.cfg_papel_parceiro)) then raise exception 'papel inválido' using errcode = '22023'; end if;
  if nullif(p_dados ->> 'instagram', '') is not null and v_ig is null then raise exception '@ do Instagram inválido' using errcode = '22023'; end if;
  if nullif(p_dados ->> 'whatsapp', '') is not null and v_tel is null then raise exception 'WhatsApp inválido (use DDD + número)' using errcode = '22023'; end if;
  if v_doc <> '' then
    if length(v_doc) = 11 and venda._cpf_valido(v_doc) then v_tdoc := 'cpf';
    elsif length(v_doc) = 14 and bling.fn_cnpj_valido(v_doc) then v_tdoc := 'cnpj';
    else raise exception 'CPF/CNPJ inválido' using errcode = '22023'; end if;
    select parceiro_id into v_dono from crm.cad_parceiro_identificador where empresa_id = p_empresa and tipo = v_tdoc and valor_hash = bling.fn_hash_doc(v_doc);
    if v_dono is not null and v_dono is distinct from v_id then
      raise exception 'esse % já pertence a outro parceiro (%)', upper(v_tdoc), (select nome from crm.cad_parceiro where id = v_dono) using errcode = '23505';
    end if;
    v_tipo := case v_tdoc when 'cpf' then 'F' else 'J' end;
  end if;

  if v_id is null then
    insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, ativo, origem, observacao)
    values (p_empresa, v_nome, coalesce(v_tipo, 'F'), true, 'manual', nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '')) returning id into v_id;
  else
    update crm.cad_parceiro set nome = v_nome, tipo_pessoa = coalesce(v_tipo, tipo_pessoa), ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo),
           observacao = case when p_dados ? 'observacao' then nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '') else observacao end, atualizado_em = now()
     where id = v_id and empresa_id = p_empresa;
    if not found then raise exception 'parceiro não encontrado' using errcode = 'P0002'; end if;
  end if;

  if v_tdoc is not null and v_dono is null then
    if exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = v_id and tipo in ('cpf','cnpj')) then
      raise exception 'este parceiro já tem documento; para trocar, fale com o gestor' using errcode = '22023';
    end if;
    insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (p_empresa, v_id, v_tdoc, bling.fn_hash_doc(v_doc), right(v_doc, 4));
  end if;

  delete from crm.rel_parceiro_papel where parceiro_id = v_id and papel <> all (v_papeis);
  insert into crm.rel_parceiro_papel (parceiro_id, empresa_id, papel) select v_id, p_empresa, x from unnest(v_papeis) x on conflict do nothing;

  if v_ig is not null and crm._registrar_contato(p_empresa, v_id, 'instagram', v_ig, null, 'manual', null, 'titular') is null then
    raise exception 'o @ % já pertence a outro parceiro: use "Mover" na aba Contatos', v_ig using errcode = '23505';
  end if;
  if v_tel is not null and crm._registrar_contato(p_empresa, v_id, 'whatsapp', v_tel, null, 'manual', null, 'titular') is null then
    raise exception 'esse WhatsApp já pertence a outro parceiro: use "Mover" na aba Contatos' using errcode = '23505';
  end if;
  return v_id;
end $$;
revoke all on function api.parceiro_salvar(uuid, jsonb) from public, anon;
grant execute on function api.parceiro_salvar(uuid, jsonb) to authenticated;
