-- 0091f (pedido 047): link de pagamento v2. Endereços e CPF ficam no PARCEIRO; sugestões pelo histórico (mascaradas);
-- CEP pela base oficial (cache + consulta em segundo plano); nome de quem paga; e-mail; forma de pagamento.

create table crm.cad_parceiro_documento (
  parceiro_id uuid primary key references crm.cad_parceiro(id) on delete cascade,
  empresa_id uuid not null references crm.cad_empresa(id),
  tipo text not null check (tipo in ('cpf','cnpj')),
  documento_cifrado bytea not null, ultimos_digitos text not null,
  origem text not null default 'pagamento', coletado_em timestamptz not null default now(), purgar_apos timestamptz
);
comment on table crm.cad_parceiro_documento is 'CPF/CNPJ completo do parceiro, cifrado (mesma chave de venda._chave_documento). Necessário para a NF-e.';
alter table crm.cad_parceiro_documento enable row level security;
revoke all on crm.cad_parceiro_documento from anon, authenticated;

-- CEP pela página pública: devolve o que a base oficial já tem; se não tiver, agenda a consulta e a página usa a busca direta.
create or replace function api.publico_cep(p_token text, p_cep text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t record; v text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g'); c crm.cfg_cep_cache;
begin
  select * into t from venda._reserva_do_token(p_token);
  if t.cliente_id is null then return jsonb_build_object('erro', 'nao_encontrada'); end if;
  if v !~ '^[0-9]{8}$' then return jsonb_build_object('erro', 'cep_invalido'); end if;
  select * into c from crm.cfg_cep_cache where cep = v;
  if c.cep is null then perform crm.solicitar_cep(v); return jsonb_build_object('pendente', true); end if;
  if not c.encontrado then return jsonb_build_object('encontrado', false); end if;
  return jsonb_build_object('encontrado', true, 'oficial', true, 'logradouro', c.logradouro, 'bairro', c.bairro, 'municipio', c.municipio, 'uf', c.uf);
end $$;
revoke all on function api.publico_cep(text, text) from public;
grant execute on function api.publico_cep(text, text) to anon, authenticated;

create or replace function api.publico_entrega_obter(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare t record; v_p1 uuid; v_nome text; v_ult text; v_res live.mov_reserva;
begin
  select * into t from venda._reserva_do_token(p_token);
  if t.cliente_id is null then return jsonb_build_object('erro', 'nao_encontrada'); end if;
  select parceiro_id, split_part(coalesce(nullif(nome, ''), ''), ' ', 1) into v_p1, v_nome from crm.cad_cliente where id = t.cliente_id;
  select ultimos_digitos into v_ult from crm.cad_parceiro_documento where parceiro_id = v_p1;
  select r.* into v_res from live.mov_reserva r join venda.mov_acompanhamento a on a.interesse_id = r.interesse_id where a.token = p_token order by r.criada_em desc limit 1;
  return jsonb_build_object(
    'pode', t.reserva_ativa, 'nome', nullif(v_nome, ''),
    'cpf_final', v_ult,
    'forma', coalesce(v_res.forma_pagamento,
               (select r2.forma_pagamento from live.mov_reserva r2 where r2.cliente_id = any (crm.perfis_mesmo_parceiro(t.cliente_id)) and r2.forma_pagamento is not null order by r2.pagador_definido_em desc nulls last limit 1)),
    'pagar_url', (select c.link_url from venda.rel_cobranca_reserva cr join venda.mov_cobranca c on c.id = cr.cobranca_id where cr.reserva_id = v_res.id and c.estado = 'aberta' and c.link_url is not null limit 1),
    'definido', v_res.pagador_definido_em is not null,
    -- sugestões pelo histórico: rua e cidade visíveis, número e CEP parcialmente ocultos (o link é pessoal, mas pode ser repassado)
    'enderecos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'apelido', e.apelido, 'principal', e.principal,
        'resumo', e.logradouro || ', ' || left(e.numero, 1) || repeat('•', greatest(length(e.numero) - 1, 1)) || coalesce(' · ' || e.bairro, '') || ' · ' || e.municipio || '/' || e.uf,
        'cep_final', right(e.cep, 3), 'oficial', e.cep_situacao in ('padronizado','parcial')) order by e.principal desc, e.ultimo_uso_em desc nulls last)
      from (select * from crm.cad_parceiro_endereco where parceiro_id = v_p1 and ativo order by principal desc, ultimo_uso_em desc nulls last limit 5) e), '[]'::jsonb),
    -- compatibilidade com a página anterior
    'endereco', (select jsonb_build_object('resumo', e.logradouro || ', ' || left(e.numero, 1) || '•• — ' || e.municipio || '/' || e.uf, 'cep_final', right(e.cep, 3))
                   from crm.cad_parceiro_endereco e where e.parceiro_id = v_p1 and e.ativo order by e.principal desc, e.ultimo_uso_em desc nulls last limit 1)
  );
end $function$;

drop function api.publico_entrega_salvar(text, boolean, text, text, text, text, text, text, text, text);
create function api.publico_entrega_salvar(p_token text, p_usar_salvo boolean DEFAULT false, p_cpf text DEFAULT NULL, p_cep text DEFAULT NULL,
  p_logradouro text DEFAULT NULL, p_numero text DEFAULT NULL, p_complemento text DEFAULT NULL, p_bairro text DEFAULT NULL, p_municipio text DEFAULT NULL,
  p_uf text DEFAULT NULL, p_endereco_id uuid DEFAULT NULL, p_nome_pagador text DEFAULT NULL, p_email text DEFAULT NULL, p_forma text DEFAULT NULL)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare t record; v_cpf text; v_cep text; v_res uuid; v_p1 uuid; v_p2 uuid; v_p1_doc boolean; v_pagador uuid; v_sit text; v_hash text;
  v_nome text := nullif(regexp_replace(btrim(coalesce(p_nome_pagador, '')), '\s+', ' ', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_end uuid; v_endres jsonb; v_salvo boolean; v_nome_atual text;
  v_campos text[] := array[p_logradouro, p_numero, p_complemento, p_bairro, p_municipio];
begin
  select * into t from venda._reserva_do_token(p_token);
  if t.cliente_id is null then return jsonb_build_object('erro', 'nao_encontrada'); end if;
  if not t.reserva_ativa then return jsonb_build_object('erro', 'reserva_inativa'); end if;
  select r.id into v_res from live.mov_reserva r join venda.mov_acompanhamento a on a.interesse_id = r.interesse_id
   where a.token = p_token and r.estado = 'ativa' order by r.criada_em desc limit 1;
  select parceiro_id into v_p1 from crm.cad_cliente where id = t.cliente_id;
  v_salvo := exists (select 1 from crm.cad_parceiro_documento where parceiro_id = v_p1);

  if p_forma is not null and p_forma not in ('pix','cartao') then return jsonb_build_object('erro', 'forma_invalida'); end if;
  if v_email is not null and v_email !~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]{2,}$' then return jsonb_build_object('erro', 'email_invalido'); end if;
  if v_nome is not null and (length(v_nome) < 5 or length(v_nome) > 120 or v_nome !~ ' ' or v_nome ~ '[@0-9<>]') then return jsonb_build_object('erro', 'nome_invalido'); end if;

  -- endereço: escolhido do histórico (só do próprio parceiro) ou digitado
  if p_endereco_id is null and coalesce(p_usar_salvo, false) then
    select id into p_endereco_id from crm.cad_parceiro_endereco where parceiro_id = v_p1 and ativo order by principal desc, ultimo_uso_em desc nulls last limit 1;
    if p_endereco_id is null or not v_salvo then return jsonb_build_object('erro', 'sem_dados_salvos'); end if;
  end if;
  if p_endereco_id is not null then
    select id into v_end from crm.cad_parceiro_endereco where id = p_endereco_id and parceiro_id = v_p1 and ativo;
    if v_end is null then return jsonb_build_object('erro', 'endereco_nao_encontrado'); end if;
  else
    v_cep := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
    if v_cep !~ '^[0-9]{8}$' then return jsonb_build_object('erro', 'cep_invalido'); end if;
    if nullif(trim(coalesce(p_numero, '')), '') is null or nullif(trim(coalesce(p_logradouro, '')), '') is null
       or nullif(trim(coalesce(p_municipio, '')), '') is null or coalesce(upper(trim(p_uf)), '') !~ '^[A-Z]{2}$' then
      return jsonb_build_object('erro', 'endereco_incompleto');
    end if;
    if exists (select 1 from unnest(v_campos) c where length(coalesce(c, '')) > 120 or c ~ '[<>]') then return jsonb_build_object('erro', 'endereco_invalido'); end if;
  end if;

  -- CPF: digitado agora, ou o já salvo do próprio parceiro
  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  if v_cpf = '' and not v_salvo then return jsonb_build_object('erro', 'cpf_invalido'); end if;
  if v_cpf <> '' and not venda._cpf_valido(v_cpf) then return jsonb_build_object('erro', 'cpf_invalido'); end if;

  -- quem paga e recebe a nota: o dono do CPF
  if v_cpf = '' then
    v_pagador := v_p1; v_sit := 'titular';
  else
    v_hash := bling.fn_hash_doc(v_cpf);
    select parceiro_id into v_p2 from crm.cad_parceiro_identificador where empresa_id = t.empresa_id and tipo = 'cpf' and valor_hash = v_hash;
    v_p1_doc := exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = v_p1 and tipo in ('cpf','cnpj'));
    if v_p2 = v_p1 then
      v_pagador := v_p1; v_sit := 'titular';
    elsif v_p2 is null and not v_p1_doc then
      insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (t.empresa_id, v_p1, 'cpf', v_hash, right(v_cpf, 4));
      update crm.cad_parceiro set tipo_pessoa = 'F', atualizado_em = now(),
             observacao = nullif(btrim(replace(coalesce(observacao, ''), 'Pré-cadastro (sem CPF), criado automaticamente', '')), '') where id = v_p1;
      v_pagador := v_p1; v_sit := 'titular';
    elsif v_p2 is null then
      if v_nome is null then return jsonb_build_object('erro', 'nome_pagador'); end if;   -- CPF de outra pessoa ainda sem cadastro: pede o nome dela
      insert into crm.cad_parceiro (empresa_id, nome, tipo_pessoa, origem, observacao)
      values (t.empresa_id, crm.nome_civil_limpo(v_nome), 'F', 'pagamento', 'Criado no link de pagamento') returning id into v_pagador;
      insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (t.empresa_id, v_pagador, 'cpf', v_hash, right(v_cpf, 4));
      insert into crm.rel_parceiro_papel (parceiro_id, empresa_id, papel) values (v_pagador, t.empresa_id, 'cliente') on conflict do nothing;
      v_sit := 'terceiro';
    elsif not v_p1_doc then
      v_pagador := v_p2; v_sit := 'terceiro_confirmar';
    else
      v_pagador := v_p2; v_sit := 'terceiro';
    end if;
    -- CPF completo e cifrado no parceiro pagador (necessário para a NF-e); a página nunca o devolve
    insert into crm.cad_parceiro_documento (parceiro_id, empresa_id, tipo, documento_cifrado, ultimos_digitos, origem)
    values (v_pagador, t.empresa_id, 'cpf', extensions.pgp_sym_encrypt(v_cpf, venda._chave_documento()), right(v_cpf, 4), 'pagamento')
    on conflict (parceiro_id) do update set documento_cifrado = excluded.documento_cifrado, ultimos_digitos = excluded.ultimos_digitos, coletado_em = now();
  end if;

  -- cadastro mais recente: nome civil do titular quando o atual não é um nome de verdade
  if v_sit = 'titular' and v_nome is not null then
    select nome into v_nome_atual from crm.cad_parceiro where id = v_p1;
    if v_nome_atual ~ '^(@|CPF \*\*\*|Contato WhatsApp|Instagram |Sem nome)' or v_nome_atual !~ ' ' then
      insert into crm.log_parceiro_nome (empresa_id, parceiro_id, nome_antes, nome_depois, motivo) values (t.empresa_id, v_p1, v_nome_atual, crm.nome_civil_limpo(v_nome), 'link de pagamento');
      update crm.cad_parceiro set nome = crm.nome_civil_limpo(v_nome), atualizado_em = now() where id = v_p1;
    end if;
  end if;
  if v_email is not null then perform crm._registrar_contato(t.empresa_id, v_p1, 'email', v_email, null, 'pagamento'); end if;

  -- endereço de entrega no parceiro de quem recebe (o perfil que reservou)
  if v_end is null then
    v_endres := crm.salvar_endereco_parceiro(t.empresa_id, v_p1, jsonb_build_object('cep', v_cep, 'logradouro', trim(p_logradouro), 'numero', trim(p_numero),
      'complemento', nullif(trim(coalesce(p_complemento, '')), ''), 'bairro', nullif(trim(coalesce(p_bairro, '')), ''), 'municipio', trim(p_municipio), 'uf', upper(trim(p_uf))), 'vitrine', true);
    v_end := (v_endres ->> 'id')::uuid;
  else
    update crm.cad_parceiro_endereco set ultimo_uso_em = now() where id = v_end;
  end if;

  -- endereço fiscal do titular para a NF-e, quando ainda não há
  if v_sit = 'titular' and not exists (select 1 from crm.cad_parceiro_dados where parceiro_id = v_p1 and cep is not null) then
    insert into crm.cad_parceiro_dados (parceiro_id, empresa_id, email, cep, logradouro, numero, complemento, bairro, codigo_municipio, municipio, uf, pais, endereco_origem, cep_situacao, origem)
    select v_p1, t.empresa_id, v_email, e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.codigo_municipio, e.municipio, e.uf, 'Brasil',
           case when e.cep_situacao in ('padronizado','parcial') then 'correios' else 'manual' end, e.cep_situacao, 'manual'
      from crm.cad_parceiro_endereco e where e.id = v_end
    on conflict (parceiro_id) do update set cep = excluded.cep, logradouro = excluded.logradouro, numero = excluded.numero, complemento = excluded.complemento,
      bairro = excluded.bairro, codigo_municipio = excluded.codigo_municipio, municipio = excluded.municipio, uf = excluded.uf, pais = excluded.pais,
      endereco_origem = excluded.endereco_origem, cep_situacao = excluded.cep_situacao, email = coalesce(crm.cad_parceiro_dados.email, excluded.email), atualizado_em = now();
  end if;

  update live.mov_reserva set parceiro_pagador_id = v_pagador, pagador_situacao = v_sit, pagador_definido_em = now(),
         endereco_entrega_id = v_end, forma_pagamento = coalesce(p_forma, forma_pagamento) where id = v_res;
  update venda.mov_cobranca c set parceiro_pagador_id = v_pagador, forma_pagamento = coalesce(p_forma, c.forma_pagamento)
    from venda.rel_cobranca_reserva cr where cr.cobranca_id = c.id and cr.reserva_id = v_res and c.estado = 'aberta';

  -- nunca devolve nome ou dado do dono do CPF
  return jsonb_build_object('ok', true, 'cpf_reconhecido', v_sit = 'terceiro_confirmar' or (v_sit = 'terceiro' and v_p2 is not null),
    'cep_oficial', coalesce((select cep_situacao in ('padronizado','parcial') from crm.cad_parceiro_endereco where id = v_end), false));
end $function$;
revoke all on function api.publico_entrega_salvar(text, boolean, text, text, text, text, text, text, text, text, uuid, text, text, text) from public;
grant execute on function api.publico_entrega_salvar(text, boolean, text, text, text, text, text, text, text, text, uuid, text, text, text) to anon, authenticated;

-- resumo do parceiro: endereço de entrega também conta para "Pronto para NF-e" do cliente pessoa física
do $m$
declare d text := pg_get_functiondef('api.parceiro_resumo'::regproc); n text;
begin
  n := replace(d, 'v_doc := exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = p_parceiro and tipo in (''cpf'',''cnpj''));',
    'v_doc := exists (select 1 from crm.cad_parceiro_identificador where parceiro_id = p_parceiro and tipo in (''cpf'',''cnpj''));' ||
    ' if not exists (select 1 from crm.cad_parceiro_documento where parceiro_id = p_parceiro) and not exists (select 1 from crm.cad_parceiro_dados where parceiro_id = p_parceiro and documento is not null) and v_doc then v_faltas := array_append(v_faltas, ''CPF/CNPJ completo (temos só os 4 últimos)''::text); end if;');
  if n = d then raise exception 'parceiro_resumo: trecho não encontrado'; end if;
  execute n;
end $m$;
