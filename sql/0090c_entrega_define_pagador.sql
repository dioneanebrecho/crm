-- 0090c: perfil de cliente sempre ligado a parceiro; link de pagamento define o pagador pelo CPF.
alter table crm.cad_cliente alter column parceiro_id set not null;

create or replace function api.publico_entrega_salvar(p_token text, p_usar_salvo boolean DEFAULT false, p_cpf text DEFAULT NULL::text,
  p_cep text DEFAULT NULL::text, p_logradouro text DEFAULT NULL::text, p_numero text DEFAULT NULL::text, p_complemento text DEFAULT NULL::text,
  p_bairro text DEFAULT NULL::text, p_municipio text DEFAULT NULL::text, p_uf text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare t record; v_cpf text; v_cep text; v_tem_end boolean; v_tem_doc boolean; v_res uuid; v_p1 uuid; v_p2 uuid; v_p1_doc boolean;
  v_pagador uuid; v_sit text; v_salvar_doc boolean := false; v_hash text; v_nome text;
  v_campos text[] := array[p_logradouro, p_numero, p_complemento, p_bairro, p_municipio];
begin
  select * into t from venda._reserva_do_token(p_token);
  if t.cliente_id is null then return jsonb_build_object('erro', 'nao_encontrada'); end if;
  if not t.reserva_ativa then return jsonb_build_object('erro', 'reserva_inativa'); end if;
  select r.id into v_res from live.mov_reserva r join venda.mov_acompanhamento a on a.interesse_id = r.interesse_id
   where a.token = p_token and r.estado = 'ativa' order by r.criada_em desc limit 1;
  select parceiro_id, nome into v_p1, v_nome from crm.cad_cliente where id = t.cliente_id;
  v_tem_end := exists (select 1 from crm.cad_cliente_endereco where cliente_id = t.cliente_id);
  v_tem_doc := exists (select 1 from crm.cad_cliente_documento where cliente_id = t.cliente_id);

  if coalesce(p_usar_salvo, false) then
    if not (v_tem_end and v_tem_doc) then return jsonb_build_object('erro', 'sem_dados_salvos'); end if;
    -- documento salvo no perfil só existe quando o CPF é do próprio titular do perfil
    update live.mov_reserva set parceiro_pagador_id = v_p1, pagador_situacao = 'titular', pagador_definido_em = now() where id = v_res;
    return jsonb_build_object('ok', true);
  end if;

  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  if v_cpf = '' and not v_tem_doc then return jsonb_build_object('erro', 'cpf_invalido'); end if;
  if v_cpf <> '' and not venda._cpf_valido(v_cpf) then return jsonb_build_object('erro', 'cpf_invalido'); end if;

  v_cep := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  if v_cep !~ '^[0-9]{8}$' then return jsonb_build_object('erro', 'cep_invalido'); end if;
  if nullif(trim(coalesce(p_numero, '')), '') is null or nullif(trim(coalesce(p_logradouro, '')), '') is null
     or nullif(trim(coalesce(p_municipio, '')), '') is null or coalesce(upper(trim(p_uf)), '') !~ '^[A-Z]{2}$' then
    return jsonb_build_object('erro', 'endereco_incompleto');
  end if;
  if exists (select 1 from unnest(v_campos) c where length(coalesce(c, '')) > 120 or c ~ '[<>]') then
    return jsonb_build_object('erro', 'endereco_invalido');
  end if;

  -- quem paga: o dono do CPF digitado (o perfil que reservou pode ser de outra pessoa)
  if v_cpf = '' then
    v_pagador := v_p1; v_sit := 'titular';
  else
    v_hash := bling.fn_hash_doc(v_cpf);
    select parceiro_id into v_p2 from crm.cad_parceiro_identificador where empresa_id = t.empresa_id and tipo = 'cpf' and valor_hash = v_hash;
    v_p1_doc := exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = v_p1 and tipo in ('cpf','cnpj'));
    if v_p2 = v_p1 then
      v_pagador := v_p1; v_sit := 'titular'; v_salvar_doc := true;
    elsif v_p2 is null and not v_p1_doc then
      insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (t.empresa_id, v_p1, 'cpf', v_hash, right(v_cpf, 4));
      update crm.cad_parceiro set tipo_pessoa = 'F', atualizado_em = now(),
             observacao = nullif(replace(coalesce(observacao, ''), 'Pré-cadastro (sem CPF), criado automaticamente', ''), '') where id = v_p1;
      v_pagador := v_p1; v_sit := 'titular'; v_salvar_doc := true;
    elsif v_p2 is null then
      insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, origem, observacao)
      values (t.empresa_id, 'CPF ***' || right(v_cpf, 4), 'F', 'pagamento', 'Criado no link de pagamento: completar nome civil') returning id into v_pagador;
      insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (t.empresa_id, v_pagador, 'cpf', v_hash, right(v_cpf, 4));
      insert into crm.rel_parceiro_papel (parceiro_id, empresa_id, papel) values (v_pagador, t.empresa_id, 'cliente') on conflict do nothing;
      v_sit := 'terceiro';
    elsif not v_p1_doc then
      v_pagador := v_p2; v_sit := 'terceiro_confirmar';   -- o @ vira contato do dono do CPF quando o pagamento for aprovado
    else
      v_pagador := v_p2; v_sit := 'terceiro';
    end if;
  end if;
  update live.mov_reserva set parceiro_pagador_id = v_pagador, pagador_situacao = v_sit, pagador_definido_em = now() where id = v_res;

  -- o CPF só fica no perfil de quem reservou quando é dele mesmo (nunca grava o CPF da mãe no perfil da filha)
  if v_salvar_doc then
    insert into crm.cad_cliente_documento (cliente_id, empresa_id, documento_cifrado, documento_hash, ultimos_digitos, coletado_em)
    values (t.cliente_id, t.empresa_id, extensions.pgp_sym_encrypt(v_cpf, venda._chave_documento()), v_hash, right(v_cpf, 2), now())
    on conflict (cliente_id) do update set documento_cifrado = excluded.documento_cifrado, documento_hash = excluded.documento_hash,
      ultimos_digitos = excluded.ultimos_digitos, coletado_em = now();
  end if;

  -- endereço de entrega (de quem recebe), sem alterar o cadastro fiscal de outro parceiro
  update crm.cad_cliente_endereco set principal = false, atualizado_em = now() where cliente_id = t.cliente_id and principal;
  insert into crm.cad_cliente_endereco (empresa_id, cliente_id, cep, logradouro, numero, complemento, bairro, municipio, uf, principal, origem)
  values (t.empresa_id, t.cliente_id, v_cep, trim(p_logradouro), trim(p_numero), nullif(trim(coalesce(p_complemento, '')), ''),
          nullif(trim(coalesce(p_bairro, '')), ''), trim(p_municipio), upper(trim(p_uf)), true, 'vitrine');

  -- nunca devolve nome ou dado do dono do CPF
  return jsonb_build_object('ok', true, 'cpf_reconhecido', v_sit in ('terceiro_confirmar') or (v_sit = 'terceiro' and v_p2 is not null));
end $function$;
