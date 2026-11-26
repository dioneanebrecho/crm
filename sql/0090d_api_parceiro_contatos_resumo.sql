-- 0090d: API da tela Parceiros (Contatos, Resumo, mover/absorver) e filtros por pré-cadastro/sem papel.

create or replace function api.listar_parceiros(p_empresa uuid, p_busca text DEFAULT NULL::text, p_papel text DEFAULT NULL::text, p_ativo boolean DEFAULT NULL::boolean,
  p_tipo_pessoa text DEFAULT NULL::text, p_min_contatos integer DEFAULT NULL::integer, p_so_revisao boolean DEFAULT false, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
returns table(id uuid, nome text, tipo_pessoa text, ativo boolean, papeis text[], identificadores text[], qtd_contatos_bling bigint, tem_revisao boolean, criado_em timestamp with time zone, total bigint)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
declare v_busca text := case when nullif(trim(p_busca),'') is null then null else '%' || regexp_replace(trim(p_busca),'([\\%_])','\\\1','g') || '%' end;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  return query
  with base as (
    select p.id, p.nome, p.tipo_pessoa, p.ativo, p.criado_em,
      (select array_agg(r.papel order by r.papel) from crm.rel_parceiro_papel r where r.parceiro_id = p.id) papeis,
      (select array_agg(x order by o, x) from (
          select upper(i.tipo) || ' ***' || coalesce(i.ultimos_digitos,'') x, 0 o from crm.cad_parceiro_identificador i where i.parceiro_id = p.id and i.tipo in ('cpf','cnpj')
          union all
          select '@' || k.valor, case when k.principal then 1 else 2 end from crm.cad_parceiro_contato k
           where k.parceiro_id = p.id and k.tipo = 'instagram' and k.valor is not null and k.situacao <> 'inativo') s) ident,
      exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = p.id and i.tipo in ('cpf','cnpj')) tem_doc,
      (select count(*) from bling.rel_contato_parceiro m where m.parceiro_id = p.id) qtd,
      exists (select 1 from bling.rel_contato_parceiro m where m.parceiro_id = p.id and m.status = 'revisao') rev
    from crm.cad_parceiro p where p.empresa_id = p_empresa)
  select b.id, b.nome, b.tipo_pessoa, b.ativo, b.papeis, b.ident, b.qtd, b.rev, b.criado_em, count(*) over ()
    from base b
   where (v_busca is null or b.nome ilike v_busca
          or exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = b.id and (i.valor_hash ilike v_busca or i.ultimos_digitos ilike v_busca))
          or exists (select 1 from crm.cad_parceiro_contato k where k.parceiro_id = b.id and k.situacao <> 'inativo' and k.valor ilike v_busca)
          or exists (select 1 from bling.rel_contato_parceiro m join bling.cad_contato c using (empresa_id, bling_id)
                      where m.parceiro_id = b.id and (c.nome_cru ilike v_busca or c.bling_id::text ilike v_busca)))
     and (nullif(p_papel,'') is null
          or (p_papel = 'pre_cadastro' and not b.tem_doc)
          or (p_papel = 'sem_papel' and b.papeis is null)
          or p_papel = any (b.papeis))
     and (p_ativo is null or b.ativo = p_ativo)
     and (nullif(p_tipo_pessoa,'') is null or b.tipo_pessoa = p_tipo_pessoa)
     and (p_min_contatos is null or b.qtd >= p_min_contatos)
     and (not coalesce(p_so_revisao, false) or b.rev)
   order by b.qtd desc, b.nome, b.id
   limit least(greatest(coalesce(p_limite,50),1),200) offset greatest(coalesce(p_offset,0),0);
end $function$;

-- Contatos do parceiro (WhatsApp e e-mail só para quem vê dado pessoal)
create or replace function api.parceiro_contatos(p_empresa uuid, p_parceiro uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pii boolean;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  v_pii := (select api.tem_papel(p_empresa, array['admin','gestor','suporte']));
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', k.id, 'tipo', k.tipo,
      'valor', case when k.tipo = 'instagram' or v_pii then k.valor
                    when k.tipo = 'whatsapp' then '***' || right(k.valor, 4) else '***' end,
      'tem_igsid', k.igsid is not null, 'nome_exibicao', k.nome_exibicao, 'vinculo', k.vinculo, 'situacao', k.situacao,
      'principal', k.principal, 'origem', k.origem, 'criado_em', k.criado_em, 'ultimo_uso_em', k.ultimo_uso_em,
      'perfis_cliente', (select count(*) from crm.cad_cliente c where c.parceiro_id = k.parceiro_id
                           and ((k.igsid is not null and c.instagram_igsid = k.igsid) or (k.tipo = 'instagram' and c.instagram_username = k.valor))))
    order by k.situacao = 'inativo', k.tipo, k.principal desc, k.criado_em)
    from crm.cad_parceiro_contato k where k.empresa_id = p_empresa and k.parceiro_id = p_parceiro), '[]'::jsonb);
end $$;

create or replace function api.parceiro_contato_salvar(p_empresa uuid, p_parceiro uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_dados ->> 'id', '')::uuid; v_tipo text := p_dados ->> 'tipo'; v_valor text; v_k crm.cad_parceiro_contato;
  v_vinc text := coalesce(nullif(p_dados ->> 'vinculo', ''), 'nao_informado'); v_sit text := coalesce(nullif(p_dados ->> 'situacao', ''), 'confirmado');
  v_princ boolean := coalesce((p_dados ->> 'principal')::boolean, false);
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte']);
  if not exists (select 1 from crm.cad_parceiro where id = p_parceiro and empresa_id = p_empresa) then raise exception 'parceiro não encontrado' using errcode = 'P0002'; end if;
  if v_vinc not in ('titular','familiar','terceiro','nao_informado') or v_sit not in ('confirmado','pendente','inativo') then
    raise exception 'vínculo ou situação inválidos' using errcode = '22023';
  end if;
  if v_id is null then
    v_valor := case v_tipo when 'instagram' then crm.norm_instagram(p_dados ->> 'valor') when 'whatsapp' then crm.norm_telefone(p_dados ->> 'valor')
                 when 'telefone' then crm.norm_telefone(p_dados ->> 'valor')
                 when 'email' then case when lower(trim(p_dados ->> 'valor')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(trim(p_dados ->> 'valor')) end end;
    if v_valor is null then raise exception 'contato inválido' using errcode = '22023'; end if;
    select * into v_k from crm.cad_parceiro_contato where empresa_id = p_empresa and tipo = v_tipo and valor = v_valor and situacao <> 'inativo';
    if v_k.id is not null and v_k.parceiro_id <> p_parceiro then
      raise exception 'esse contato já pertence a outro parceiro: use "Mover"' using errcode = '23505';
    end if;
    v_id := crm._registrar_contato(p_empresa, p_parceiro, v_tipo, v_valor, null, 'manual', null, v_vinc);
  else
    select * into v_k from crm.cad_parceiro_contato where id = v_id and parceiro_id = p_parceiro and empresa_id = p_empresa for update;
    if v_k.id is null then raise exception 'contato não encontrado' using errcode = 'P0002'; end if;
  end if;
  if v_princ then
    update crm.cad_parceiro_contato set principal = false, atualizado_em = now()
     where parceiro_id = p_parceiro and tipo = (select tipo from crm.cad_parceiro_contato where id = v_id) and id <> v_id and principal;
  end if;
  update crm.cad_parceiro_contato set vinculo = v_vinc, situacao = v_sit, principal = v_princ and v_sit <> 'inativo',
         confirmado_em = case when v_sit = 'confirmado' then coalesce(confirmado_em, now()) end, atualizado_em = now()
   where id = v_id;
  insert into crm.log_parceiro_contato (empresa_id, contato_id, parceiro_depois, acao, detalhe)
  values (p_empresa, v_id, p_parceiro, 'editado', jsonb_build_object('vinculo', v_vinc, 'situacao', v_sit, 'principal', v_princ));
  return v_id;
end $$;

create or replace function api.parceiro_contato_mover(p_empresa uuid, p_contato uuid, p_destino uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_k crm.cad_parceiro_contato;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'informe o motivo' using errcode = '22023'; end if;
  select * into v_k from crm.cad_parceiro_contato where id = p_contato and empresa_id = p_empresa for update;
  if v_k.id is null or not exists (select 1 from crm.cad_parceiro where id = p_destino and empresa_id = p_empresa) then
    raise exception 'contato ou parceiro não encontrado' using errcode = 'P0002';
  end if;
  if v_k.parceiro_id = p_destino then return; end if;
  update crm.cad_parceiro_contato set parceiro_id = p_destino, principal = false, atualizado_em = now() where id = p_contato;
  if v_k.tipo = 'instagram' and v_k.valor is not null then
    update crm.cad_parceiro_identificador set parceiro_id = p_destino where empresa_id = p_empresa and tipo = 'instagram' and valor_hash = v_k.valor;
  end if;
  -- perfis de cliente da mesma conta acompanham o contato
  update crm.cad_cliente set parceiro_id = p_destino, atualizado_em = now()
   where empresa_id = p_empresa and parceiro_id = v_k.parceiro_id
     and ((v_k.igsid is not null and instagram_igsid = v_k.igsid) or (v_k.tipo = 'instagram' and instagram_username = v_k.valor));
  insert into crm.rel_parceiro_papel (parceiro_id, empresa_id, papel) values (p_destino, p_empresa, 'cliente') on conflict do nothing;
  insert into crm.log_parceiro_contato (empresa_id, contato_id, parceiro_antes, parceiro_depois, acao, motivo)
  values (p_empresa, p_contato, v_k.parceiro_id, p_destino, 'movido', p_motivo);
end $$;

create or replace function api.parceiro_absorver(p_empresa uuid, p_origem uuid, p_destino uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'informe o motivo' using errcode = '22023'; end if;
  if (select count(*) from crm.cad_parceiro where id in (p_origem, p_destino) and empresa_id = p_empresa) <> 2 then
    raise exception 'parceiro não encontrado' using errcode = 'P0002';
  end if;
  return crm.absorver_pre_cadastro(p_origem, p_destino, p_motivo);
end $$;

-- Resumo do parceiro: o que falta para NF-e e os números de relacionamento em todos os papéis
create or replace function api.parceiro_resumo(p_empresa uuid, p_parceiro uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p crm.cad_parceiro; d crm.cad_parceiro_dados; v_doc boolean; v_end boolean; v_faltas text[] := '{}'; v_bling bigint[];
  v_clientes uuid[];
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  select * into p from crm.cad_parceiro where id = p_parceiro and empresa_id = p_empresa;
  if p.id is null then raise exception 'parceiro não encontrado' using errcode = 'P0002'; end if;
  select * into d from crm.cad_parceiro_dados where parceiro_id = p_parceiro;
  select array_agg(bling_id) into v_bling from bling.rel_contato_parceiro where parceiro_id = p_parceiro;
  select array_agg(id) into v_clientes from crm.cad_cliente where parceiro_id = p_parceiro;
  v_doc := exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = p_parceiro and tipo in ('cpf','cnpj'));
  v_end := d.parceiro_id is not null and d.cep ~ '^[0-9]{8}$' and nullif(d.logradouro, '') is not null and nullif(d.numero, '') is not null
           and nullif(d.codigo_municipio, '') is not null and d.uf ~ '^[A-Z]{2}$';
  if not v_doc then v_faltas := v_faltas || 'CPF/CNPJ'; end if;
  if not v_end then v_faltas := v_faltas || 'endereço fiscal completo'; end if;
  if p.nome ~ '@' or p.nome !~ ' ' or p.nome ~ '^(CPF \*\*\*|Contato WhatsApp|Instagram |Sem nome)' then v_faltas := v_faltas || 'nome civil'; end if;

  return jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'tipo_pessoa', p.tipo_pessoa, 'ativo', p.ativo, 'origem', p.origem, 'observacao', p.observacao, 'criado_em', p.criado_em,
    'pre_cadastro', not v_doc,
    'papeis', coalesce((select jsonb_agg(papel order by papel) from crm.rel_parceiro_papel where parceiro_id = p_parceiro), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(upper(tipo) || ' ***' || coalesce(ultimos_digitos, '')) from crm.cad_parceiro_identificador
                             where parceiro_id = p_parceiro and tipo in ('cpf','cnpj')), '[]'::jsonb),
    'contatos', jsonb_build_object(
        'instagram', (select count(*) from crm.cad_parceiro_contato where parceiro_id = p_parceiro and tipo = 'instagram' and situacao <> 'inativo'),
        'whatsapp', (select count(*) from crm.cad_parceiro_contato where parceiro_id = p_parceiro and tipo = 'whatsapp' and situacao <> 'inativo'),
        'email', (select count(*) from crm.cad_parceiro_contato where parceiro_id = p_parceiro and tipo = 'email' and situacao <> 'inativo'),
        'arrobas', coalesce((select jsonb_agg('@' || valor order by principal desc, criado_em) from crm.cad_parceiro_contato
                               where parceiro_id = p_parceiro and tipo = 'instagram' and valor is not null and situacao <> 'inativo'), '[]'::jsonb)),
    'pronto_nfe', cardinality(v_faltas) = 0, 'faltas_nfe', to_jsonb(v_faltas),
    'bling', jsonb_build_object('contatos', coalesce(cardinality(v_bling), 0),
        'ativos', (select count(*) from bling.cad_contato c where c.empresa_id = p_empresa and c.bling_id = any (v_bling) and c.situacao = 'A' and not c.inativo_no_nome)),
    'notas', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(n.valor_nota), 0), 'primeira', min(n.data_emissao), 'ultima', max(n.data_emissao))
                from bling.cad_nfe n where n.empresa_id = p_empresa and n.contato_bling_id = any (v_bling)),
    'receber', (select jsonb_build_object('qtd', count(*)) from bling.cad_conta_receber r where r.empresa_id = p_empresa and r.contato_bling_id = any (v_bling)),
    'pagar', (select jsonb_build_object('qtd', count(*)) from bling.cad_conta_pagar r where r.empresa_id = p_empresa and r.contato_bling_id = any (v_bling)),
    'compras', (select jsonb_build_object('qtd', count(*), 'ultima', max(e.criado_em)) from compra.mov_entrada e where e.fornecedor_parceiro_id = p_parceiro),
    'cliente', jsonb_build_object(
        'perfis', coalesce(cardinality(v_clientes), 0),
        'reservas_ativas', (select count(*) from live.mov_reserva r where r.cliente_id = any (v_clientes) and r.estado = 'ativa'),
        'reservas_pagas', (select count(*) from live.mov_reserva r where r.cliente_id = any (v_clientes) and r.estado = 'paga'),
        'reservas_expiradas', (select count(*) from live.mov_reserva r where r.cliente_id = any (v_clientes) and r.estado = 'expirada'),
        'na_fila', (select count(*) from live.mov_fila_espera f where f.cliente_id = any (v_clientes) and f.estado = 'aguardando'),
        'pagou_para_terceiros', (select count(*) from live.mov_reserva r where r.parceiro_pagador_id = p_parceiro and r.pagador_situacao <> 'titular'),
        'cancelamentos', (select count(*) from pos_venda.mov_cancelamento c where c.cliente_id = any (v_clientes)),
        'devolucoes', (select count(*) from pos_venda.mov_devolucao c where c.cliente_id = any (v_clientes)),
        'bloqueado_ate', (select max(bloqueado_ate) from crm.cad_cliente where id = any (v_clientes)))
  );
end $$;

revoke all on function api.parceiro_contatos(uuid, uuid) from public, anon;
revoke all on function api.parceiro_contato_salvar(uuid, uuid, jsonb) from public, anon;
revoke all on function api.parceiro_contato_mover(uuid, uuid, uuid, text) from public, anon;
revoke all on function api.parceiro_absorver(uuid, uuid, uuid, text) from public, anon;
revoke all on function api.parceiro_resumo(uuid, uuid) from public, anon;
grant execute on function api.parceiro_contatos(uuid, uuid), api.parceiro_contato_salvar(uuid, uuid, jsonb),
  api.parceiro_contato_mover(uuid, uuid, uuid, text), api.parceiro_absorver(uuid, uuid, uuid, text), api.parceiro_resumo(uuid, uuid) to authenticated;
