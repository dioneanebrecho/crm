-- 0090b: resolver único de parceiro, registro de contatos sem "roubar" contato de outro parceiro, gatilhos e absorção de pré-cadastro.

create or replace function crm._registrar_contato(p_empresa uuid, p_parceiro uuid, p_tipo text, p_valor text, p_igsid text,
  p_origem text, p_nome_exibicao text default null, p_vinculo text default 'nao_informado')
returns uuid language plpgsql security definer set search_path = '' as $$
declare r1 crm.cad_parceiro_contato; r2 crm.cad_parceiro_contato; v_id uuid;
begin
  if p_valor is null and p_igsid is null then return null; end if;
  if p_igsid is not null then
    select * into r1 from crm.cad_parceiro_contato where empresa_id = p_empresa and igsid = p_igsid and situacao <> 'inativo';
  end if;
  if p_valor is not null then
    select * into r2 from crm.cad_parceiro_contato where empresa_id = p_empresa and tipo = p_tipo and valor = p_valor and situacao <> 'inativo';
  end if;

  -- contato já pertence a outro parceiro: nunca move sozinho; registra conflito para revisão
  if (r1.id is not null and r1.parceiro_id <> p_parceiro) or (r2.id is not null and r2.parceiro_id <> p_parceiro) then
    insert into crm.log_parceiro_contato (empresa_id, contato_id, parceiro_antes, parceiro_depois, acao, motivo, detalhe)
    values (p_empresa, coalesce(r1.id, r2.id), coalesce(r1.parceiro_id, r2.parceiro_id), p_parceiro, 'conflito',
            'contato já pertence a outro parceiro', jsonb_build_object('tipo', p_tipo, 'valor', p_valor, 'origem', p_origem));
    return null;
  end if;

  if r1.id is not null and r2.id is not null and r1.id <> r2.id then
    -- mesma conta: @ registrado sem igsid e igsid registrado sem @ (ou @ antigo) -> fica uma linha só
    update crm.cad_parceiro_contato set situacao = 'inativo', principal = false, atualizado_em = now() where id = r2.id;
    update crm.cad_parceiro_contato set valor = p_valor, principal = r1.principal or r2.principal, ultimo_uso_em = now(), atualizado_em = now() where id = r1.id;
    insert into crm.log_parceiro_contato (empresa_id, contato_id, parceiro_depois, acao, motivo)
    values (p_empresa, r1.id, p_parceiro, 'unificado', 'mesma conta do Instagram (igsid e @)');
    v_id := r1.id;
  elsif r1.id is not null then
    update crm.cad_parceiro_contato set valor = coalesce(p_valor, valor), nome_exibicao = coalesce(p_nome_exibicao, nome_exibicao),
           ultimo_uso_em = now(), atualizado_em = now() where id = r1.id;
    v_id := r1.id;
  elsif r2.id is not null then
    update crm.cad_parceiro_contato set igsid = coalesce(igsid, p_igsid), nome_exibicao = coalesce(p_nome_exibicao, nome_exibicao),
           ultimo_uso_em = now(), atualizado_em = now() where id = r2.id;
    v_id := r2.id;
  else
    insert into crm.cad_parceiro_contato (empresa_id, parceiro_id, tipo, valor, igsid, nome_exibicao, vinculo, situacao, principal, origem, confirmado_em, ultimo_uso_em)
    values (p_empresa, p_parceiro, p_tipo, p_valor, p_igsid, p_nome_exibicao, coalesce(p_vinculo, 'nao_informado'), 'confirmado',
            not exists (select 1 from crm.cad_parceiro_contato k where k.parceiro_id = p_parceiro and k.tipo = p_tipo and k.principal and k.situacao <> 'inativo'),
            p_origem, now(), now())
    returning id into v_id;
    insert into crm.log_parceiro_contato (empresa_id, contato_id, parceiro_depois, acao, motivo)
    values (p_empresa, v_id, p_parceiro, 'incluido', p_origem);
  end if;

  if p_tipo = 'instagram' and p_valor is not null then
    insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash)
    values (p_empresa, p_parceiro, 'instagram', p_valor) on conflict (empresa_id, tipo, valor_hash) do nothing;
  end if;
  return v_id;
end $$;

-- Ordem: igsid -> @ -> WhatsApp. Não achou: cria pré-cadastro (sem CPF) com papel cliente.
create or replace function crm.resolver_parceiro(p_empresa uuid, p_igsid text, p_instagram text, p_telefone text,
  p_nome text default null, p_origem text default 'outro')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ig text := crm.norm_instagram(p_instagram); v_tel text := crm.norm_telefone(p_telefone);
  v_igsid text := nullif(trim(coalesce(p_igsid, '')), ''); v_nome text := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
  v_p uuid; v_origem_p text; v_origem_c text;
begin
  if v_igsid is not null then
    select parceiro_id into v_p from crm.cad_parceiro_contato where empresa_id = p_empresa and igsid = v_igsid and situacao <> 'inativo';
  end if;
  if v_p is null and v_ig is not null then
    select parceiro_id into v_p from crm.cad_parceiro_contato where empresa_id = p_empresa and tipo = 'instagram' and valor = v_ig and situacao <> 'inativo';
    if v_p is null then
      select parceiro_id into v_p from crm.cad_parceiro_identificador where empresa_id = p_empresa and tipo = 'instagram' and valor_hash = v_ig;
    end if;
  end if;
  if v_p is null and v_tel is not null then
    select parceiro_id into v_p from crm.cad_parceiro_contato where empresa_id = p_empresa and tipo = 'whatsapp' and valor = v_tel and situacao <> 'inativo';
  end if;

  v_origem_p := case when p_origem in ('importacao_bling','manual','instagram','whatsapp','vitrine','pagamento','compra_nfe','outro') then p_origem else 'outro' end;
  v_origem_c := case v_origem_p when 'instagram' then 'meta_dm' when 'whatsapp' then 'whatsapp' when 'vitrine' then 'vitrine'
                  when 'pagamento' then 'pagamento' when 'manual' then 'manual' else 'perfil_cliente' end;

  if v_p is null then
    if v_igsid is null and v_ig is null and v_tel is null and v_nome is null then return null; end if;
    insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, ativo, origem, observacao)
    values (p_empresa, coalesce(v_nome, '@' || v_ig, 'Contato WhatsApp ' || right(v_tel, 4), 'Instagram ' || right(v_igsid, 6), 'Sem nome'),
            'F', true, v_origem_p, 'Pré-cadastro (sem CPF), criado automaticamente')
    returning id into v_p;
  end if;
  insert into crm.rel_parceiro_papel (parceiro_id, empresa_id, papel) values (v_p, p_empresa, 'cliente') on conflict do nothing;

  if v_igsid is not null or v_ig is not null then
    perform crm._registrar_contato(p_empresa, v_p, 'instagram', v_ig, v_igsid, v_origem_c);
  end if;
  if v_tel is not null then
    perform crm._registrar_contato(p_empresa, v_p, 'whatsapp', v_tel, null, v_origem_c);
  end if;
  return v_p;
end $$;

-- Gatilho: todo perfil de cliente nasce ligado a um parceiro (cobre DM, live, WhatsApp, vitrine e cadastro manual).
create or replace function crm.tg_cliente_parceiro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_origem text;
begin
  if new.anonimizado_em is not null then return new; end if;
  v_origem := case when new.instagram_igsid is not null or new.instagram_username is not null then 'instagram'
                   when new.telefone is not null then 'whatsapp' else 'manual' end;
  if new.parceiro_id is null then
    new.parceiro_id := crm.resolver_parceiro(new.empresa_id, new.instagram_igsid, new.instagram_username, new.telefone, new.nome, v_origem);
    if new.parceiro_id is null then
      insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, origem, observacao)
      values (new.empresa_id, 'Sem nome', 'F', 'outro', 'Pré-cadastro (sem CPF), criado automaticamente') returning id into new.parceiro_id;
      insert into crm.rel_parceiro_papel (parceiro_id, empresa_id, papel) values (new.parceiro_id, new.empresa_id, 'cliente') on conflict do nothing;
    end if;
  elsif tg_op = 'UPDATE' and (new.instagram_igsid is distinct from old.instagram_igsid or new.instagram_username is distinct from old.instagram_username
                               or new.telefone is distinct from old.telefone) then
    if new.instagram_igsid is not null or crm.norm_instagram(new.instagram_username) is not null then
      perform crm._registrar_contato(new.empresa_id, new.parceiro_id, 'instagram', crm.norm_instagram(new.instagram_username), new.instagram_igsid, 'perfil_cliente');
    end if;
    if crm.norm_telefone(new.telefone) is not null then
      perform crm._registrar_contato(new.empresa_id, new.parceiro_id, 'whatsapp', crm.norm_telefone(new.telefone), null, 'perfil_cliente');
    end if;
  end if;
  return new;
end $$;
create trigger tg_cliente_parceiro before insert or update of instagram_igsid, instagram_username, telefone, parceiro_id
  on crm.cad_cliente for each row execute function crm.tg_cliente_parceiro();

-- Gatilho: @ novo identificado pela reconciliação do Bling também aparece em Contatos.
create or replace function crm.tg_identificador_contato() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'instagram' and crm.norm_instagram(new.valor_hash) is not null
     and not exists (select 1 from crm.cad_parceiro_contato k where k.empresa_id = new.empresa_id and k.tipo = 'instagram'
                       and k.valor = crm.norm_instagram(new.valor_hash) and k.situacao <> 'inativo') then
    insert into crm.cad_parceiro_contato (empresa_id, parceiro_id, tipo, valor, situacao, principal, origem, confirmado_em)
    values (new.empresa_id, new.parceiro_id, 'instagram', crm.norm_instagram(new.valor_hash), 'confirmado',
            not exists (select 1 from crm.cad_parceiro_contato k where k.parceiro_id = new.parceiro_id and k.tipo = 'instagram' and k.principal and k.situacao <> 'inativo'),
            'bling', now());
  end if;
  return new;
end $$;
create trigger tg_identificador_contato after insert on crm.cad_parceiro_identificador
  for each row execute function crm.tg_identificador_contato();

-- Absorve um pré-cadastro (sem CPF/CNPJ) em outro parceiro: move contatos, @, perfis de cliente, vínculos Bling e papéis.
-- Não apaga nada: o pré-cadastro fica inativo com referência ao destino (reversível pelo log).
create or replace function crm.absorver_pre_cadastro(p_origem uuid, p_destino uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o crm.cad_parceiro; d crm.cad_parceiro; v_cont int; v_cli int; v_bling int;
begin
  select * into o from crm.cad_parceiro where id = p_origem for update;
  select * into d from crm.cad_parceiro where id = p_destino for update;
  if o.id is null or d.id is null or o.empresa_id <> d.empresa_id or o.id = d.id then raise exception 'parceiros inválidos' using errcode = '22023'; end if;
  if exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = p_origem and tipo in ('cpf','cnpj')) then
    raise exception 'a origem tem CPF/CNPJ: não é pré-cadastro' using errcode = '22023';
  end if;

  insert into crm.log_parceiro_contato (empresa_id, contato_id, parceiro_antes, parceiro_depois, acao, motivo)
  select empresa_id, id, p_origem, p_destino, 'absorcao', p_motivo from crm.cad_parceiro_contato where parceiro_id = p_origem;
  update crm.cad_parceiro_contato k set parceiro_id = p_destino,
         principal = k.principal and not exists (select 1 from crm.cad_parceiro_contato x where x.parceiro_id = p_destino and x.tipo = k.tipo and x.principal and x.situacao <> 'inativo'),
         atualizado_em = now()
   where k.parceiro_id = p_origem;
  get diagnostics v_cont = row_count;
  update crm.cad_parceiro_identificador set parceiro_id = p_destino where parceiro_id = p_origem;
  update crm.cad_cliente set parceiro_id = p_destino, atualizado_em = now() where parceiro_id = p_origem;
  get diagnostics v_cli = row_count;
  update bling.rel_contato_parceiro set parceiro_id = p_destino where parceiro_id = p_origem;
  get diagnostics v_bling = row_count;
  insert into crm.rel_parceiro_papel (parceiro_id, empresa_id, papel)
  select p_destino, empresa_id, papel from crm.rel_parceiro_papel where parceiro_id = p_origem on conflict do nothing;
  update live.mov_reserva set parceiro_pagador_id = p_destino where parceiro_pagador_id = p_origem;
  update venda.mov_cobranca set parceiro_pagador_id = p_destino where parceiro_pagador_id = p_origem;
  update venda.mov_pedido set parceiro_pagador_id = p_destino where parceiro_pagador_id = p_origem;
  update crm.cad_parceiro set ativo = false, atualizado_em = now(),
         observacao = concat_ws(' | ', observacao, 'Absorvido por ' || p_destino::text || ' em ' || to_char(now(), 'DD/MM/YYYY HH24:MI'))
   where id = p_origem;
  insert into crm.log_parceiro_contato (empresa_id, parceiro_antes, parceiro_depois, acao, motivo, detalhe)
  values (o.empresa_id, p_origem, p_destino, 'absorcao_parceiro', p_motivo,
          jsonb_build_object('contatos', v_cont, 'perfis_cliente', v_cli, 'contatos_bling', v_bling));
  return jsonb_build_object('contatos', v_cont, 'perfis_cliente', v_cli, 'contatos_bling', v_bling);
end $$;

-- Chamar quando o pagamento da reserva for aprovado (webhook de pagamento ou "Marcar pago").
-- Pagador terceiro + perfil da reserva ainda pré-cadastro -> o @ passa a ser contato do dono do CPF.
create or replace function crm.confirmar_pagador_reserva(p_reserva uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r live.mov_reserva; v_p1 uuid; v_res jsonb;
begin
  select * into r from live.mov_reserva where id = p_reserva for update;
  if r.id is null or r.parceiro_pagador_id is null then return jsonb_build_object('acao', 'nada'); end if;
  select parceiro_id into v_p1 from crm.cad_cliente where id = r.cliente_id;
  if r.pagador_situacao = 'terceiro_confirmar' and v_p1 is not null and v_p1 <> r.parceiro_pagador_id
     and not exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = v_p1 and tipo in ('cpf','cnpj')) then
    v_res := crm.absorver_pre_cadastro(v_p1, r.parceiro_pagador_id, 'pagamento aprovado com CPF do parceiro (reserva ' || r.id || ')');
    update crm.cad_parceiro_contato set vinculo = 'familiar', confirmado_em = now()
     where parceiro_id = r.parceiro_pagador_id and vinculo = 'nao_informado'
       and id in (select contato_id from crm.log_parceiro_contato where parceiro_antes = v_p1 and acao = 'absorcao');
    update live.mov_reserva set pagador_situacao = 'terceiro' where id = r.id;
    return jsonb_build_object('acao', 'absorvido') || v_res;
  end if;
  return jsonb_build_object('acao', 'nada');
end $$;

revoke all on function crm._registrar_contato(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function crm.resolver_parceiro(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function crm.absorver_pre_cadastro(uuid, uuid, text) from public, anon, authenticated;
revoke all on function crm.confirmar_pagador_reserva(uuid) from public, anon, authenticated;
revoke all on function crm.tg_cliente_parceiro() from public, anon, authenticated;
revoke all on function crm.tg_identificador_contato() from public, anon, authenticated;

-- liga os perfis de cliente existentes e torna o vínculo obrigatório
update crm.cad_cliente c set parceiro_id = crm.resolver_parceiro(c.empresa_id, c.instagram_igsid, c.instagram_username, c.telefone, c.nome, 'manual')
 where c.parceiro_id is null and c.anonimizado_em is null;
