-- 0085_vitrine_publica.sql — página pública da vitrine (araras com cabides), WhatsApp da loja e dados de entrega.
-- Pedido de mudança 044. Base: mockup "Ane Brechó — Vitrine com cabides" (validado em 22/11) e pedido 020 (0034).
-- Tudo aditivo: 1 coluna nova (venda.cfg_vitrine.whatsapp_loja) e funções novas; salvar_preferencias_vitrine ganha o campo novo.

-- 1) WhatsApp da loja (55 + DDD + número), usado nos botões "Continuar/Pagar pelo WhatsApp" da página pública
alter table venda.cfg_vitrine add column if not exists whatsapp_loja text
  constraint cfg_vitrine_whatsapp_loja_check check (whatsapp_loja is null or whatsapp_loja ~ '^55[1-9][0-9]9?[0-9]{8}$');

create or replace function api.salvar_preferencias_vitrine(p_empresa uuid, p_valores jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_antes jsonb; v_depois jsonb; v_dif jsonb; k text; v_wa text;
  v_perm text[] := array['tema','animacao','etiqueta_codigo','etiqueta_preco','ordem_midias','video_auto','prazo_reserva_min',
                         'carencia_pix_min','fila_visibilidade','limite_reservas','regra_horario','avisar_fila','qtd_parecidas','aviseme','url_base',
                         'whatsapp_loja'];
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' then raise exception 'valores inválidos' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_valores) loop
    if not (k = any (v_perm)) then raise exception 'campo não permitido: %', k using errcode = '22023'; end if;
  end loop;
  if p_valores ? 'whatsapp_loja' then
    v_wa := regexp_replace(coalesce(p_valores ->> 'whatsapp_loja', ''), '\D', '', 'g');
    if length(v_wa) in (10, 11) then v_wa := '55' || v_wa; end if;
    if v_wa <> '' and v_wa !~ '^55[1-9][0-9]9?[0-9]{8}$' then
      raise exception 'WhatsApp da loja inválido: informe DDD e número' using errcode = '22023';
    end if;
  end if;
  insert into venda.cfg_vitrine (empresa_id) values (p_empresa) on conflict do nothing;
  select to_jsonb(c) into v_antes from venda.cfg_vitrine c where empresa_id = p_empresa for update;
  update venda.cfg_vitrine c set
    tema = coalesce(p_valores ->> 'tema', c.tema),
    animacao = coalesce(p_valores ->> 'animacao', c.animacao),
    etiqueta_codigo = coalesce((p_valores ->> 'etiqueta_codigo')::boolean, c.etiqueta_codigo),
    etiqueta_preco = coalesce((p_valores ->> 'etiqueta_preco')::boolean, c.etiqueta_preco),
    ordem_midias = coalesce((select array_agg(x order by n) from jsonb_array_elements_text(p_valores -> 'ordem_midias') with ordinality t(x, n)), c.ordem_midias),
    video_auto = coalesce((p_valores ->> 'video_auto')::boolean, c.video_auto),
    prazo_reserva_min = coalesce((p_valores ->> 'prazo_reserva_min')::int, c.prazo_reserva_min),
    carencia_pix_min = coalesce((p_valores ->> 'carencia_pix_min')::int, c.carencia_pix_min),
    fila_visibilidade = coalesce(p_valores ->> 'fila_visibilidade', c.fila_visibilidade),
    limite_reservas = coalesce((p_valores ->> 'limite_reservas')::int, c.limite_reservas),
    regra_horario = coalesce(p_valores ->> 'regra_horario', c.regra_horario),
    avisar_fila = coalesce((p_valores ->> 'avisar_fila')::boolean, c.avisar_fila),
    qtd_parecidas = coalesce((p_valores ->> 'qtd_parecidas')::int, c.qtd_parecidas),
    aviseme = coalesce((p_valores ->> 'aviseme')::boolean, c.aviseme),
    url_base = case when p_valores ? 'url_base' then nullif(p_valores ->> 'url_base', '') else c.url_base end,
    whatsapp_loja = case when p_valores ? 'whatsapp_loja' then nullif(v_wa, '') else c.whatsapp_loja end,
    atualizado_por = (select auth.uid()), atualizado_em = now()
   where empresa_id = p_empresa;
  select to_jsonb(c) into v_depois from venda.cfg_vitrine c where empresa_id = p_empresa;
  select coalesce(jsonb_object_agg(key, jsonb_build_object('antes', v_antes -> key, 'depois', value)), '{}'::jsonb) into v_dif
    from jsonb_each(v_depois) where key <> all (array['atualizado_por','atualizado_em','empresa_id']) and v_antes -> key is distinct from value;
  if v_dif <> '{}'::jsonb then
    insert into venda.log_cfg_vitrine (empresa_id, usuario_id, alteracoes) values (p_empresa, (select auth.uid()), v_dif);
  end if;
  -- o prazo novo vale para reservas novas; as ativas mantêm o expira_em com que nasceram
  update live.mov_live set prazo_pagamento_min = (v_depois ->> 'prazo_reserva_min')::int
   where empresa_id = p_empresa and tipo = 'vitrine';
  return api.obter_preferencias_vitrine(p_empresa);
end $$;

-- 2) Arara: lista pública das peças publicadas na vitrine (sem dado pessoal)
create or replace function api.publico_vitrine(p_canal text default null, p_empresa uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_cfg venda.cfg_vitrine; v_loja text; v_itens jsonb;
begin
  if p_empresa is not null then
    select l.empresa_id into v_emp from live.mov_live l where l.tipo = 'vitrine' and l.empresa_id = p_empresa limit 1;
  elsif (select count(distinct l.empresa_id) from live.mov_live l where l.tipo = 'vitrine') = 1 then
    select l.empresa_id into v_emp from live.mov_live l where l.tipo = 'vitrine' limit 1;
  end if;
  if v_emp is null then return jsonb_build_object('situacao', 'nao_encontrada'); end if;
  select * into v_cfg from venda.cfg_vitrine where empresa_id = v_emp;
  select coalesce(e.nome_fantasia, e.razao_social) into v_loja from crm.cad_empresa e where e.id = v_emp;

  select coalesce(jsonb_agg(x.j order by x.ordem, x.criado_em desc), '[]'::jsonb) into v_itens from (
    select jsonb_build_object(
             'codigo', l.codigo_curto, 'codigo_live', i.codigo_live,
             'nome', coalesce(c.aprovado ->> 'titulo', p.nome),
             'categoria', coalesce(nullif(trim(p.categoria), ''), 'Outros'),
             'tamanho', va.tamanho, 'preco', i.preco, 'condicao', p.condicao,
             'foto', coalesce((select m ->> 'url' from jsonb_array_elements(coalesce(c.aprovado -> 'midias', '[]'::jsonb)) m
                                where coalesce(m ->> 'tipo', 'foto') <> 'video' order by (m ->> 'capa')::boolean desc nulls last limit 1),
                              p.fotos -> 0 ->> 'url'),
             'situacao', s.st ->> 'situacao',
             'fila_total', case when v_cfg.fila_visibilidade in ('total','nomes') then (s.st ->> 'fila')::int end) j,
           case s.st ->> 'situacao' when 'disponivel' then 0 when 'reservada' then 1 else 2 end ordem,
           i.criado_em
      from live.mov_item i
      join live.mov_live lv on lv.id = i.live_id and lv.tipo = 'vitrine'
      join venda.cad_link_venda l on l.item_id = i.id
      join catalogo.cad_variacao va on va.id = i.variacao_id
      join catalogo.cad_peca p on p.id = va.peca_id
      left join venda.cad_conteudo c on c.item_id = i.id
      cross join lateral (select venda._status_oferta(i.id) st) s
     where i.empresa_id = v_emp and i.estado = 'aberto'
     limit 500) x;

  return jsonb_build_object(
    'situacao', 'ok', 'loja', v_loja,
    'canal', case when exists (select 1 from venda.cad_canal where codigo = p_canal) then p_canal else 'link' end,
    'whatsapp', v_cfg.whatsapp_loja,
    'aparencia', jsonb_build_object('tema', v_cfg.tema, 'animacao', v_cfg.animacao, 'etiqueta_codigo', v_cfg.etiqueta_codigo,
              'etiqueta_preco', v_cfg.etiqueta_preco, 'ordem_midias', to_jsonb(v_cfg.ordem_midias), 'video_auto', v_cfg.video_auto),
    'regras', jsonb_build_object('prazo_min', v_cfg.prazo_reserva_min, 'fila_visibilidade', v_cfg.fila_visibilidade,
              'aviseme', v_cfg.aviseme, 'qtd_parecidas', v_cfg.qtd_parecidas),
    'itens', v_itens);
end $$;

-- 3) Dados de entrega (CPF + endereço), só para quem está com a reserva ativa
create or replace function venda._chave_documento() returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'chave_documento';
  if v is null then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'chave_documento', 'Cifra de CPF/CNPJ de clientes');
    select decrypted_secret into v from vault.decrypted_secrets where name = 'chave_documento';
  end if;
  return v;
end $$;
revoke all on function venda._chave_documento() from public, anon, authenticated;

create or replace function venda._cpf_valido(p text) returns boolean language plpgsql immutable set search_path = '' as $$
declare d int[]; s int; r1 int; r2 int; i int;
begin
  if p is null or p !~ '^[0-9]{11}$' or p ~ '^(.)\1{10}$' then return false; end if;
  d := array(select substr(p, g, 1)::int from generate_series(1, 11) g);
  s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r1 := (s * 10) % 11; if r1 = 10 then r1 := 0; end if;
  s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r2 := (s * 10) % 11; if r2 = 10 then r2 := 0; end if;
  return r1 = d[10] and r2 = d[11];
end $$;

-- interesse + reserva ativa a partir do token de acompanhamento
create or replace function venda._reserva_do_token(p_token text, out empresa_id uuid, out cliente_id uuid, out reserva_ativa boolean)
language sql stable security definer set search_path = '' as $$
  select a.empresa_id, a.cliente_id,
         exists (select 1 from live.mov_reserva r where r.interesse_id = a.interesse_id and r.estado = 'ativa' and r.expira_em > now())
    from venda.mov_acompanhamento a
   where p_token ~ '^[0-9a-f]{64}$' and a.token = p_token and a.expira_em > now()
$$;
revoke all on function venda._reserva_do_token(text) from public, anon, authenticated;

create or replace function api.publico_entrega_obter(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; e crm.cad_cliente_endereco; v_ult text; v_nome text;
begin
  select * into t from venda._reserva_do_token(p_token);
  if t.cliente_id is null then return jsonb_build_object('erro', 'nao_encontrada'); end if;
  select * into e from crm.cad_cliente_endereco x where x.cliente_id = t.cliente_id order by x.principal desc, x.criado_em desc limit 1;
  select d.ultimos_digitos into v_ult from crm.cad_cliente_documento d where d.cliente_id = t.cliente_id;
  select split_part(c.nome, ' ', 1) into v_nome from crm.cad_cliente c where c.id = t.cliente_id;
  return jsonb_build_object(
    'pode', t.reserva_ativa, 'nome', v_nome,
    'cpf_final', v_ult,
    'endereco', case when e.id is null then null else jsonb_build_object(
        'resumo', left(coalesce(e.logradouro, ''), 7) || '•••, ' || left(coalesce(e.numero, ''), 1) || '•• — ' || coalesce(e.municipio, '') || '/' || coalesce(e.uf, ''),
        'cep_final', right(coalesce(e.cep, ''), 3)) end);
end $$;

create or replace function api.publico_entrega_salvar(p_token text, p_usar_salvo boolean default false, p_cpf text default null,
  p_cep text default null, p_logradouro text default null, p_numero text default null, p_complemento text default null,
  p_bairro text default null, p_municipio text default null, p_uf text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; v_cpf text; v_cep text; v_tem_end boolean; v_tem_doc boolean;
  v_campos text[] := array[p_logradouro, p_numero, p_complemento, p_bairro, p_municipio];
begin
  select * into t from venda._reserva_do_token(p_token);
  if t.cliente_id is null then return jsonb_build_object('erro', 'nao_encontrada'); end if;
  if not t.reserva_ativa then return jsonb_build_object('erro', 'reserva_inativa'); end if;
  v_tem_end := exists (select 1 from crm.cad_cliente_endereco where cliente_id = t.cliente_id);
  v_tem_doc := exists (select 1 from crm.cad_cliente_documento where cliente_id = t.cliente_id);

  if coalesce(p_usar_salvo, false) then
    if not (v_tem_end and v_tem_doc) then return jsonb_build_object('erro', 'sem_dados_salvos'); end if;
    return jsonb_build_object('ok', true);
  end if;

  -- CPF (obrigatório se ainda não houver)
  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  if v_cpf = '' and not v_tem_doc then return jsonb_build_object('erro', 'cpf_invalido'); end if;
  if v_cpf <> '' and not venda._cpf_valido(v_cpf) then return jsonb_build_object('erro', 'cpf_invalido'); end if;

  -- endereço
  v_cep := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  if v_cep !~ '^[0-9]{8}$' then return jsonb_build_object('erro', 'cep_invalido'); end if;
  if nullif(trim(coalesce(p_numero, '')), '') is null or nullif(trim(coalesce(p_logradouro, '')), '') is null
     or nullif(trim(coalesce(p_municipio, '')), '') is null or coalesce(upper(trim(p_uf)), '') !~ '^[A-Z]{2}$' then
    return jsonb_build_object('erro', 'endereco_incompleto');
  end if;
  if exists (select 1 from unnest(v_campos) c where length(coalesce(c, '')) > 120 or c ~ '[<>]') then
    return jsonb_build_object('erro', 'endereco_invalido');
  end if;

  if v_cpf <> '' then
    insert into crm.cad_cliente_documento (cliente_id, empresa_id, documento_cifrado, documento_hash, ultimos_digitos, coletado_em)
    values (t.cliente_id, t.empresa_id, extensions.pgp_sym_encrypt(v_cpf, venda._chave_documento()), bling.fn_hash_doc(v_cpf), right(v_cpf, 2), now())
    on conflict (cliente_id) do update set documento_cifrado = excluded.documento_cifrado, documento_hash = excluded.documento_hash,
      ultimos_digitos = excluded.ultimos_digitos, coletado_em = now();
  end if;

  update crm.cad_cliente_endereco set principal = false, atualizado_em = now() where cliente_id = t.cliente_id and principal;
  insert into crm.cad_cliente_endereco (empresa_id, cliente_id, cep, logradouro, numero, complemento, bairro, municipio, uf, principal, origem)
  values (t.empresa_id, t.cliente_id, v_cep, trim(p_logradouro), trim(p_numero), nullif(trim(coalesce(p_complemento, '')), ''),
          nullif(trim(coalesce(p_bairro, '')), ''), trim(p_municipio), upper(trim(p_uf)), true, 'vitrine');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function api.publico_vitrine(text, uuid), api.publico_entrega_obter(text),
  api.publico_entrega_salvar(text, boolean, text, text, text, text, text, text, text, text) from public;
grant execute on function api.publico_vitrine(text, uuid), api.publico_entrega_obter(text),
  api.publico_entrega_salvar(text, boolean, text, text, text, text, text, text, text, text) to anon, authenticated;
