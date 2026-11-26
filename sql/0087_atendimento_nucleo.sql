-- 0087_atendimento_nucleo.sql
-- Central de Atendimento (caixa de entrada omnichannel) — núcleo.
-- Plano: claude/plano-central-atendimento-omnichannel.md (Fases 1 e 2, MVP) + respostas prontas com variáveis.
-- Padrões: schema próprio, empresa_id + RLS (só app_worker), front acessa via api.* com api._exigir.
-- Envio: respeita engine.cfg_integracao (desligado/simulado/real), allowlist e janela de resposta do canal.

create schema if not exists atendimento;
revoke all on schema atendimento from public;
grant usage on schema atendimento to app_worker;

-- 1. Fonte de evento bruto para mensagens diretas
alter table engine.log_evento_bruto drop constraint log_evento_bruto_fonte_check;
alter table engine.log_evento_bruto add constraint log_evento_bruto_fonte_check
  check (fonte = any (array['meta_live','meta_comentarios','meta_dm','bling','gateway','whatsapp','manual','link_publico']));

-- 2. Conversas
create table atendimento.mov_conversa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  cliente_id uuid not null references crm.cad_cliente(id),
  canal text not null check (canal in ('instagram','whatsapp','facebook','email')),
  estado text not null default 'aberta' check (estado in ('aberta','pendente','adiada','resolvida')),
  atendente_id uuid references crm.cad_usuario(id),
  em_atendimento_por uuid references crm.cad_usuario(id),
  em_atendimento_desde timestamptz,
  adiada_ate timestamptz,
  janela_ate timestamptz,           -- janela padrão de resposta livre (24 h após a última mensagem da cliente)
  janela_humana_ate timestamptz,    -- Instagram: etiqueta HUMAN_AGENT (até 7 dias) [validar permissão na Meta]
  ultima_mensagem_em timestamptz,
  ultima_entrada_em timestamptz,
  ultima_previa text,
  nao_lidas int not null default 0,
  primeira_resposta_em timestamptz,
  resolvida_em timestamptz,
  origem text not null default 'piloto' check (origem in ('piloto','producao')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (estado <> 'adiada' or adiada_ate is not null)
);
create unique index mov_conversa_uma_aberta on atendimento.mov_conversa (empresa_id, cliente_id, canal) where estado <> 'resolvida';
create index mov_conversa_lista on atendimento.mov_conversa (empresa_id, estado, ultima_mensagem_em desc);
create index mov_conversa_cliente on atendimento.mov_conversa (cliente_id);

-- 3. Mensagens
create table atendimento.mov_mensagem (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references crm.cad_empresa(id),
  conversa_id uuid not null references atendimento.mov_conversa(id) on delete cascade,
  canal text not null,
  direcao text not null check (direcao in ('entrada','saida','nota')),
  autor_tipo text not null check (autor_tipo in ('cliente','atendente','sistema','automacao','app_nativo')),
  autor_usuario_id uuid references crm.cad_usuario(id),
  tipo text not null default 'texto' check (tipo in ('texto','imagem','audio','video','arquivo','figurinha','compartilhamento','story','reacao','outro')),
  conteudo text,
  midia jsonb not null default '[]'::jsonb,
  resposta_pronta_id uuid,
  id_externo text,
  estado_entrega text not null default 'recebida'
    check (estado_entrega in ('recebida','simulada','bloqueada','pendente','enviada','entregue','lida','erro')),
  erro jsonb,
  outbox_id bigint,
  evento_id bigint,
  criado_em timestamptz not null default now(),
  unique (empresa_id, canal, id_externo)
);
create index mov_mensagem_conversa on atendimento.mov_mensagem (conversa_id, id);
create index mov_mensagem_outbox on atendimento.mov_mensagem (outbox_id) where outbox_id is not null;

-- 4. Etiquetas
create table atendimento.cad_etiqueta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  nome text not null,
  cor text not null default '#b8975a',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index cad_etiqueta_nome on atendimento.cad_etiqueta (empresa_id, lower(nome));
create table atendimento.rel_conversa_etiqueta (
  conversa_id uuid not null references atendimento.mov_conversa(id) on delete cascade,
  etiqueta_id uuid not null references atendimento.cad_etiqueta(id) on delete cascade,
  empresa_id uuid not null references crm.cad_empresa(id),
  criado_em timestamptz not null default now(),
  primary key (conversa_id, etiqueta_id)
);

-- 5. Catálogo de variáveis (global: é o vocabulário do sistema, não dado da empresa)
create table atendimento.cfg_variavel (
  chave text primary key check (chave ~ '^[a-z_]+\.[a-z_]+$'),
  grupo text not null,
  rotulo text not null,
  descricao text not null,
  exemplo text not null,
  ordem int not null default 0
);
insert into atendimento.cfg_variavel (chave, grupo, rotulo, descricao, exemplo, ordem) values
 ('cliente.nome','Cliente','Nome da cliente','Nome cadastrado; sem nome, usa o @ do Instagram','Maria Souza',10),
 ('cliente.primeiro_nome','Cliente','Primeiro nome','Primeiro nome; sem nome, usa o @','Maria',11),
 ('cliente.instagram','Cliente','@ do Instagram','Usuário do Instagram com @','@maria.souza',12),
 ('atendente.nome','Atendente','Nome de quem responde','Usuário logado que envia a mensagem','Dione Batista',20),
 ('atendente.primeiro_nome','Atendente','Primeiro nome de quem responde','Primeiro nome do usuário logado','Dione',21),
 ('empresa.nome','Empresa','Nome da loja','Nome fantasia da empresa','Ane Brechó',30),
 ('reserva.peca','Reserva','Código da peça reservada','Código da peça na reserva ativa mais recente','A123',40),
 ('reserva.descricao','Reserva','Descrição da peça reservada','Nome e tamanho da peça','Vestido midi floral M',41),
 ('reserva.valor','Reserva','Valor da peça reservada','Preço da peça na reserva','R$ 89,90',42),
 ('reserva.link','Reserva','Link de pagamento da reserva','Link único da peça para pagar','https://…/p/A123',43),
 ('reserva.expira_em','Reserva','Horário limite da reserva','Hora (Brasília) em que a reserva vence','22:45',44),
 ('reserva.minutos_restantes','Reserva','Minutos restantes','Minutos até a reserva vencer','12',45),
 ('fila.peca','Fila','Peça da fila','Código da peça em que a cliente aguarda','A123',50),
 ('fila.posicao','Fila','Posição na fila','Posição atual da cliente na fila da peça','2',51),
 ('cobranca.valor','Cobrança','Valor do Pix/cobrança','Total da cobrança aberta','R$ 104,80',60),
 ('cobranca.link','Cobrança','Link do Pix/cobrança','Link de pagamento da cobrança aberta','https://…',61),
 ('cobranca.expira_em','Cobrança','Vencimento da cobrança','Hora (Brasília) em que a cobrança vence','23:10',62),
 ('pedido.numero','Pedido','Número do pedido','Pedido mais recente da cliente','1045',70),
 ('pedido.situacao','Pedido','Situação do pedido','Situação do pedido mais recente, em texto','Em separação',71),
 ('pedido.valor','Pedido','Valor do pedido','Itens + frete − desconto','R$ 129,70',72),
 ('envio.transportadora','Envio','Transportadora','Transportadora do envio do último pedido','Correios',80),
 ('envio.codigo_rastreio','Envio','Código de rastreio','Código de rastreio do último pedido','QB123456789BR',81),
 ('envio.link_rastreio','Envio','Link de rastreio','Link para acompanhar a entrega','https://…',82),
 ('envio.situacao','Envio','Situação da entrega','Situação do envio em texto','Em trânsito',83);

-- 6. Respostas prontas (templates com variáveis)
create table atendimento.cad_resposta_pronta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  atalho text not null check (atalho ~ '^[a-z0-9_-]{2,30}$'),
  titulo text not null,
  categoria text not null default 'geral'
    check (categoria in ('saudacao','venda','pagamento','envio','pos_venda','geral')),
  corpo text not null check (length(corpo) between 1 and 1000),
  canais text[],                         -- null = todos os canais
  ativo boolean not null default true,
  versao int not null default 1,
  usos int not null default 0,
  ultimo_uso_em timestamptz,
  criado_por uuid references crm.cad_usuario(id),
  atualizado_por uuid references crm.cad_usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, atalho)
);
alter table atendimento.mov_mensagem
  add constraint mov_mensagem_resposta_fk foreign key (resposta_pronta_id) references atendimento.cad_resposta_pronta(id) on delete set null;

-- 7. Busca de perfil (username/nome) de quem escreve só por DM
create table atendimento.mov_perfil_busca (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references crm.cad_empresa(id),
  cliente_id uuid not null references crm.cad_cliente(id),
  requisicao_id bigint,
  estado text not null default 'enviada' check (estado in ('enviada','ok','erro')),
  criado_em timestamptz not null default now()
);
create index mov_perfil_busca_cliente on atendimento.mov_perfil_busca (cliente_id, criado_em desc);

-- 8. RLS (somente worker; usuários passam pelas funções api.*)
do $$ declare t text; begin
  foreach t in array array['mov_conversa','mov_mensagem','cad_etiqueta','rel_conversa_etiqueta','cfg_variavel','cad_resposta_pronta','mov_perfil_busca'] loop
    execute format('alter table atendimento.%I enable row level security', t);
    execute format('create policy worker_total on atendimento.%I for all to app_worker using (true) with check (true)', t);
    execute format('revoke all on atendimento.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on atendimento.%I to app_worker', t);
  end loop;
end $$;

-- 9. Funções de domínio -------------------------------------------------------

create or replace function atendimento.fmt_moeda(p numeric) returns text
language sql immutable set search_path to '' as $$
  select case when p is null then null else 'R$ ' || translate(to_char(p, 'FM999,999,990.00'), ',.', '.,') end
$$;

create or replace function atendimento.fmt_hora(p timestamptz) returns text
language sql stable set search_path to '' as $$
  select case when p is null then null
    when (p at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
      then to_char(p at time zone 'America/Sao_Paulo', 'HH24:MI')
    else to_char(p at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end
$$;

-- Etapa da venda da cliente (visão "funil" no estilo Kommo, derivada do motor de venda)
create or replace function atendimento.etapa_venda(p_cliente uuid) returns text
language sql stable security definer set search_path to '' as $$
  select coalesce(
    (select 'pix_gerado' from venda.mov_cobranca where cliente_id = p_cliente and estado = 'aberta' limit 1),
    (select 'reservada' from live.mov_reserva where cliente_id = p_cliente and estado = 'ativa' limit 1),
    (select 'na_fila' from live.mov_fila_espera where cliente_id = p_cliente and estado = 'aguardando' limit 1),
    (select case when p.estado = 'entregue' or e.estado = 'entregue' then 'entregue'
                 when p.estado = 'cancelado' then null
                 when p.estado = 'expedido' or e.estado in ('postado','em_transito','saiu_para_entrega','aguardando_retirada') then 'enviada'
                 else 'paga' end
       from venda.mov_pedido p
       left join lateral (select estado from venda.mov_envio where pedido_id = p.id order by criado_em desc limit 1) e on true
      where p.cliente_id = p_cliente and p.criado_em > now() - interval '30 days'
      order by p.criado_em desc limit 1))
$$;

-- Valores das variáveis para uma conversa (somente chaves com valor)
create or replace function atendimento.variaveis_contexto(p_conversa uuid, p_usuario uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare cv atendimento.mov_conversa; c crm.cad_cliente; v jsonb := '{}'::jsonb;
  r record; f record; cb record; pd record; ev record; v_nome text; v_user text; v_pos int;
begin
  select * into cv from atendimento.mov_conversa where id = p_conversa;
  if not found then return '{}'::jsonb; end if;
  select * into c from crm.cad_cliente where id = cv.cliente_id;

  v_nome := coalesce(nullif(btrim(c.nome), ''), case when c.instagram_username is not null then '@' || c.instagram_username end);
  v := v || jsonb_build_object(
    'cliente.nome', v_nome,
    'cliente.primeiro_nome', coalesce(nullif(split_part(btrim(c.nome), ' ', 1), ''), case when c.instagram_username is not null then '@' || c.instagram_username end),
    'cliente.instagram', case when c.instagram_username is not null then '@' || c.instagram_username end,
    'empresa.nome', (select coalesce(nullif(nome_fantasia, ''), razao_social) from crm.cad_empresa where id = cv.empresa_id));

  select nome into v_user from crm.cad_usuario where id = p_usuario;
  v := v || jsonb_build_object('atendente.nome', v_user, 'atendente.primeiro_nome', nullif(split_part(btrim(v_user), ' ', 1), ''));

  select it.codigo_live, it.preco, rs.expira_em, pc.nome, va.tamanho,
         (select lv.url from venda.cad_link_venda lv
           where lv.url is not null and (lv.item_id = it.id or lv.variacao_id = it.variacao_id)
           order by (lv.item_id = it.id) desc, lv.criado_em desc limit 1) as link
    into r
    from live.mov_reserva rs
    join live.mov_item it on it.id = rs.item_id
    left join catalogo.cad_variacao va on va.id = it.variacao_id
    left join catalogo.cad_peca pc on pc.id = va.peca_id
   where rs.cliente_id = cv.cliente_id and rs.estado = 'ativa'
   order by rs.criada_em desc limit 1;
  if found then
    v := v || jsonb_build_object(
      'reserva.peca', r.codigo_live,
      'reserva.descricao', nullif(btrim(coalesce(r.nome, '') || coalesce(' ' || r.tamanho, '')), ''),
      'reserva.valor', atendimento.fmt_moeda(r.preco),
      'reserva.link', r.link,
      'reserva.expira_em', atendimento.fmt_hora(r.expira_em),
      'reserva.minutos_restantes', greatest(0, ceil(extract(epoch from r.expira_em - now()) / 60))::int::text);
  end if;

  select fe.*, it.codigo_live into f
    from live.mov_fila_espera fe join live.mov_item it on it.id = fe.item_id
   where fe.cliente_id = cv.cliente_id and fe.estado = 'aguardando'
   order by fe.entrou_em desc limit 1;
  if found then
    select count(*) into v_pos from live.mov_fila_espera o
     where o.item_id = f.item_id and o.estado = 'aguardando'
       and (o.ordem_comentado_em, o.ordem_recebido_em, o.ordem_interesse_id) <= (f.ordem_comentado_em, f.ordem_recebido_em, f.ordem_interesse_id);
    v := v || jsonb_build_object('fila.peca', f.codigo_live, 'fila.posicao', v_pos::text);
  end if;

  select * into cb from venda.mov_cobranca where cliente_id = cv.cliente_id and estado = 'aberta' order by criada_em desc limit 1;
  if found then
    v := v || jsonb_build_object('cobranca.valor', atendimento.fmt_moeda(cb.valor_total),
                                 'cobranca.link', cb.link_url, 'cobranca.expira_em', atendimento.fmt_hora(cb.expira_em));
  end if;

  select * into pd from venda.mov_pedido where cliente_id = cv.cliente_id order by criado_em desc limit 1;
  if found then
    v := v || jsonb_build_object(
      'pedido.numero', coalesce(nullif(pd.numero_loja, ''), pd.numero::text),
      'pedido.valor', atendimento.fmt_moeda(coalesce(pd.valor_itens,0) + coalesce(pd.frete,0) - coalesce(pd.desconto,0)),
      'pedido.situacao', case pd.estado
        when 'pago' then 'Pagamento confirmado' when 'contato_ok' then 'Pagamento confirmado'
        when 'criado_no_bling' then 'Em separação' when 'situacao_ok' then 'Em separação'
        when 'nfe_gerada' then 'Nota fiscal em emissão' when 'nfe_enviada' then 'Nota fiscal em emissão'
        when 'nfe_autorizada' then 'Pronto para envio' when 'expedido' then 'Enviado'
        when 'entregue' then 'Entregue' when 'cancelado' then 'Cancelado' else 'Em análise' end);
    select * into ev from venda.mov_envio where pedido_id = pd.id order by criado_em desc limit 1;
    if found then
      v := v || jsonb_build_object(
        'envio.transportadora', ev.transportadora, 'envio.codigo_rastreio', ev.codigo_rastreio,
        'envio.link_rastreio', ev.url_rastreio,
        'envio.situacao', case ev.estado
          when 'a_postar' then 'Aguardando postagem' when 'postado' then 'Postado'
          when 'em_transito' then 'Em trânsito' when 'saiu_para_entrega' then 'Saiu para entrega'
          when 'entregue' then 'Entregue' when 'nao_entregue' then 'Tentativa de entrega sem sucesso'
          when 'aguardando_retirada' then 'Aguardando retirada' when 'devolvido' then 'Devolvido' end);
    end if;
  end if;

  return jsonb_strip_nulls(v);
end $$;

-- Substitui {{chave}} pelos valores; devolve o texto e as chaves sem valor
create or replace function atendimento.renderizar(p_texto text, p_vars jsonb) returns jsonb
language plpgsql immutable set search_path to '' as $$
declare v_out text := coalesce(p_texto, ''); m text[]; k text; v_falt text[] := '{}';
begin
  for m in select regexp_matches(coalesce(p_texto, ''), '\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}', 'g') loop
    k := m[1];
    if coalesce(p_vars ->> k, '') <> '' then
      v_out := regexp_replace(v_out, '\{\{\s*' || replace(k, '.', '\.') || '\s*\}\}', replace(p_vars ->> k, '\', '\\'), 'g');
    elsif not k = any (v_falt) then
      v_falt := array_append(v_falt, k);
    end if;
  end loop;
  return jsonb_build_object('texto', v_out, 'faltantes', to_jsonb(v_falt));
end $$;

-- Chaves usadas num texto que não existem no catálogo
create or replace function atendimento.variaveis_desconhecidas(p_texto text) returns text[]
language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(distinct btrim(m[1])), '{}')
    from regexp_matches(coalesce(p_texto, ''), '\{\{([^}]*)\}\}', 'g') m
   where not exists (select 1 from atendimento.cfg_variavel where chave = btrim(m[1]))
$$;

-- Ingestão de mensagem do Instagram (um item de entry.messaging já gravado no log bruto)
create or replace function atendimento.processar_mensagem_meta(p_evento bigint) returns text
language plpgsql security definer set search_path to '' as $$
declare e engine.log_evento_bruto; it jsonb; m jsonb; v_eco boolean; v_emp uuid; v_igsid text; v_cli uuid;
  v_conv atendimento.mov_conversa; v_ts timestamptz; v_tipo text; v_texto text; v_mid text; v_previa text;
begin
  select * into e from engine.log_evento_bruto where id = p_evento for update;
  it := e.payload -> 'item';
  v_ts := coalesce(to_timestamp((it ->> 'timestamp')::bigint / 1000.0), e.recebido_em);

  -- leitura pela cliente
  if it ? 'read' then
    update atendimento.mov_mensagem set estado_entrega = 'lida'
     where canal = 'instagram' and direcao = 'saida' and id_externo = it -> 'read' ->> 'mid'
       and estado_entrega in ('enviada','entregue');
    update engine.log_evento_bruto set processado_em = now(), resultado = 'leitura' where id = p_evento;
    return 'leitura';
  end if;
  if not it ? 'message' then
    update engine.log_evento_bruto set processado_em = now(), resultado = 'ignorado' where id = p_evento;
    return 'ignorado';
  end if;

  m := it -> 'message';
  v_mid := m ->> 'mid';
  v_eco := coalesce((m ->> 'is_echo')::boolean, false);
  select id into v_emp from crm.cad_empresa
   where instagram_user_id_esperado = case when v_eco then it -> 'sender' ->> 'id' else it -> 'recipient' ->> 'id' end;
  if v_emp is null then
    update engine.log_evento_bruto set processado_em = now(), resultado = 'empresa_desconhecida' where id = p_evento;
    return 'empresa_desconhecida';
  end if;
  update engine.log_evento_bruto set empresa_id = v_emp where id = p_evento and empresa_id is null;
  v_igsid := case when v_eco then it -> 'recipient' ->> 'id' else it -> 'sender' ->> 'id' end;

  -- eco de mensagem que nós mesmos enviamos: já está registrada
  if v_eco and exists (select 1 from atendimento.mov_mensagem where empresa_id = v_emp and canal = 'instagram' and id_externo = v_mid) then
    update engine.log_evento_bruto set processado_em = now(), resultado = 'eco_conhecido' where id = p_evento;
    return 'eco_conhecido';
  end if;

  insert into crm.cad_cliente (empresa_id, instagram_igsid)
  values (v_emp, v_igsid)
  on conflict (empresa_id, instagram_igsid) do update set atualizado_em = now()
  returning id into v_cli;
  insert into crm.rel_cliente_canal (empresa_id, cliente_id, canal, identificador)
  values (v_emp, v_cli, 'instagram', v_igsid) on conflict (empresa_id, canal, identificador) do nothing;

  select * into v_conv from atendimento.mov_conversa
   where empresa_id = v_emp and cliente_id = v_cli and canal = 'instagram' and estado <> 'resolvida' for update;
  if not found then
    insert into atendimento.mov_conversa (empresa_id, cliente_id, canal, estado)
    values (v_emp, v_cli, 'instagram', 'aberta') returning * into v_conv;
  end if;

  v_tipo := case
    when m ? 'reaction' then 'reacao'
    when jsonb_array_length(coalesce(m -> 'attachments', '[]')) = 0 then 'texto'
    else case m -> 'attachments' -> 0 ->> 'type'
      when 'image' then 'imagem' when 'video' then 'video' when 'audio' then 'audio' when 'file' then 'arquivo'
      when 'sticker' then 'figurinha' when 'share' then 'compartilhamento' when 'ig_reel' then 'compartilhamento'
      when 'story_mention' then 'story' else 'outro' end end;
  v_texto := m ->> 'text';
  v_previa := coalesce(left(v_texto, 140), '[' || v_tipo || ']');

  insert into atendimento.mov_mensagem (empresa_id, conversa_id, canal, direcao, autor_tipo, tipo, conteudo, midia,
                                        id_externo, estado_entrega, evento_id, criado_em)
  values (v_emp, v_conv.id, 'instagram', case when v_eco then 'saida' else 'entrada' end,
          case when v_eco then 'app_nativo' else 'cliente' end, v_tipo, v_texto,
          coalesce(m -> 'attachments', '[]'), v_mid, case when v_eco then 'enviada' else 'recebida' end, e.id, v_ts)
  on conflict (empresa_id, canal, id_externo) do nothing;

  if v_eco then
    update atendimento.mov_conversa set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, v_ts), v_ts),
           ultima_previa = v_previa, primeira_resposta_em = coalesce(primeira_resposta_em, v_ts), atualizado_em = now()
     where id = v_conv.id;
  else
    update atendimento.mov_conversa set
           estado = case when estado in ('pendente','adiada') then 'aberta' else estado end,
           adiada_ate = case when estado = 'adiada' then null else adiada_ate end,
           ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, v_ts), v_ts),
           ultima_entrada_em = greatest(coalesce(ultima_entrada_em, v_ts), v_ts),
           janela_ate = greatest(coalesce(janela_ate, v_ts), v_ts + interval '24 hours'),
           janela_humana_ate = greatest(coalesce(janela_humana_ate, v_ts), v_ts + interval '7 days'),
           ultima_previa = v_previa, nao_lidas = nao_lidas + 1, atualizado_em = now()
     where id = v_conv.id;
  end if;

  update engine.log_evento_bruto set processado_em = now(), resultado = case when v_eco then 'eco_app' else 'mensagem' end where id = p_evento;
  return case when v_eco then 'eco_app' else 'mensagem' end;
end $$;

-- 10. Portas do serviço (Edge Function) ------------------------------------

create or replace function api.svc_ingerir_mensagem_meta(p_payload jsonb, p_assinatura_valida boolean, p_cabecalhos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint; it jsonb; v_ext text;
begin
  it := p_payload -> 'item';
  v_ext := coalesce(it -> 'message' ->> 'mid',
                    case when it ? 'read' then 'read:' || coalesce(it -> 'read' ->> 'mid', '') || ':' || coalesce(it ->> 'timestamp', '') end,
                    md5(it::text));
  insert into engine.log_evento_bruto (fonte, origem, tipo, id_externo, payload, cabecalhos, assinatura_valida, recebido_em)
  values ('meta_dm', 'piloto', 'messaging', v_ext, p_payload, coalesce(p_cabecalhos, '{}'), coalesce(p_assinatura_valida, false), now())
  on conflict (fonte, id_externo) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('resultado', 'duplicado'); end if;
  if not coalesce(p_assinatura_valida, false) then
    update engine.log_evento_bruto set processado_em = now(), resultado = 'assinatura_invalida' where id = v_id;
    return jsonb_build_object('evento_id', v_id, 'resultado', 'assinatura_invalida');
  end if;
  return jsonb_build_object('evento_id', v_id, 'resultado', atendimento.processar_mensagem_meta(v_id));
end $$;
revoke all on function api.svc_ingerir_mensagem_meta(jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function api.svc_ingerir_mensagem_meta(jsonb, boolean, jsonb) to service_role;

-- 11. Portas do painel ---------------------------------------------------------

-- Papéis que usam a caixa
create or replace function atendimento.papeis_caixa() returns text[] language sql immutable as $$
  select array['admin','gestor','suporte','apresentadora','expedicao','financeiro']
$$;

create or replace function api.atendimento_conversas(p_empresa uuid, p_visao text default 'todas', p_estado text default null,
  p_canal text default null, p_busca text default null, p_limite int default 100)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  select coalesce(jsonb_agg(s.x order by s.ord desc nulls last), '[]') into v from (
    select c.ultima_mensagem_em as ord, jsonb_build_object(
      'id', c.id, 'cliente_id', c.cliente_id, 'canal', c.canal, 'estado', c.estado,
      'cliente_nome', coalesce(nullif(cl.nome, ''), case when cl.instagram_username is not null then '@' || cl.instagram_username end, 'Cliente sem nome'),
      'cliente_instagram', cl.instagram_username,
      'atendente_id', c.atendente_id, 'atendente_nome', u.nome,
      'em_atendimento_por', case when c.em_atendimento_desde > now() - interval '3 minutes' then up.nome end,
      'ultima_previa', c.ultima_previa, 'ultima_mensagem_em', c.ultima_mensagem_em,
      'ultima_entrada_em', c.ultima_entrada_em, 'nao_lidas', c.nao_lidas,
      'janela_ate', c.janela_ate, 'adiada_ate', c.adiada_ate,
      'aguardando_resposta', c.ultima_entrada_em is not null and c.ultima_entrada_em >= coalesce(
          (select max(criado_em) from atendimento.mov_mensagem mm where mm.conversa_id = c.id and mm.direcao = 'saida'), '-infinity'),
      'etapa_venda', atendimento.etapa_venda(c.cliente_id),
      'etiquetas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by e.nome)
                               from atendimento.rel_conversa_etiqueta re join atendimento.cad_etiqueta e on e.id = re.etiqueta_id
                              where re.conversa_id = c.id), '[]')) as x
      from atendimento.mov_conversa c
      join crm.cad_cliente cl on cl.id = c.cliente_id
      left join crm.cad_usuario u on u.id = c.atendente_id
      left join crm.cad_usuario up on up.id = c.em_atendimento_por
     where c.empresa_id = p_empresa
       and (p_estado is null and c.estado <> 'resolvida' or c.estado = p_estado)
       and (p_canal is null or c.canal = p_canal)
       and (coalesce(p_visao, 'todas') = 'todas'
            or (p_visao = 'minhas' and c.atendente_id = v_uid)
            or (p_visao = 'nao_atribuidas' and c.atendente_id is null))
       and (nullif(btrim(p_busca), '') is null
            or cl.nome ilike '%' || btrim(p_busca) || '%'
            or cl.instagram_username ilike '%' || ltrim(btrim(p_busca), '@') || '%'
            or c.ultima_previa ilike '%' || btrim(p_busca) || '%')
     order by c.ultima_mensagem_em desc nulls last
     limit least(greatest(coalesce(p_limite, 100), 1), 300)) s;
  return v;
end $$;

create or replace function api.atendimento_resumo(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  select jsonb_build_object(
    'abertas', count(*) filter (where estado = 'aberta'),
    'pendentes', count(*) filter (where estado = 'pendente'),
    'adiadas', count(*) filter (where estado = 'adiada'),
    'minhas', count(*) filter (where estado <> 'resolvida' and atendente_id = v_uid),
    'nao_atribuidas', count(*) filter (where estado <> 'resolvida' and atendente_id is null),
    'nao_lidas', coalesce(sum(nao_lidas) filter (where estado <> 'resolvida'), 0))
    into v from atendimento.mov_conversa where empresa_id = p_empresa;
  return v;
end $$;

create or replace function api.atendimento_conversa(p_empresa uuid, p_conversa uuid, p_marcar_lida boolean default true)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); c atendimento.mov_conversa; cl crm.cad_cliente; v jsonb;
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  select * into c from atendimento.mov_conversa where id = p_conversa and empresa_id = p_empresa;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  if p_marcar_lida then
    update atendimento.mov_conversa set nao_lidas = 0, em_atendimento_por = v_uid, em_atendimento_desde = now() where id = c.id;
  end if;
  select * into cl from crm.cad_cliente where id = c.cliente_id;
  v := jsonb_build_object(
    'conversa', jsonb_build_object('id', c.id, 'canal', c.canal, 'estado', c.estado, 'atendente_id', c.atendente_id,
       'atendente_nome', (select nome from crm.cad_usuario where id = c.atendente_id),
       'em_atendimento_por', case when c.em_atendimento_por <> v_uid and c.em_atendimento_desde > now() - interval '3 minutes'
                                  then (select nome from crm.cad_usuario where id = c.em_atendimento_por) end,
       'janela_ate', c.janela_ate, 'janela_humana_ate', c.janela_humana_ate, 'adiada_ate', c.adiada_ate,
       'janela_aberta', coalesce(c.janela_ate > now(), false), 'criado_em', c.criado_em),
    'cliente', jsonb_build_object('id', cl.id, 'nome', cl.nome, 'instagram', cl.instagram_username,
       'telefone', cl.telefone, 'email', cl.email, 'observacao', cl.observacao_interna,
       'canais', coalesce((select jsonb_agg(jsonb_build_object('canal', canal, 'identificador', identificador))
                            from crm.rel_cliente_canal where cliente_id = cl.id), '[]')),
    'etapa_venda', atendimento.etapa_venda(cl.id),
    'variaveis', atendimento.variaveis_contexto(c.id, v_uid),
    'historico', jsonb_build_object(
       'pedidos', (select count(*) from venda.mov_pedido where cliente_id = cl.id and estado <> 'cancelado'),
       'total_comprado', (select coalesce(sum(coalesce(valor_itens,0)+coalesce(frete,0)-coalesce(desconto,0)),0) from venda.mov_pedido where cliente_id = cl.id and estado <> 'cancelado'),
       'reservas_vencidas', (select count(*) from live.mov_reserva where cliente_id = cl.id and estado = 'expirada'),
       'cancelamentos', (select count(*) from venda.mov_pedido where cliente_id = cl.id and estado = 'cancelado')),
    'etiquetas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by e.nome)
                            from atendimento.rel_conversa_etiqueta re join atendimento.cad_etiqueta e on e.id = re.etiqueta_id
                           where re.conversa_id = c.id), '[]'),
    'mensagens', coalesce((select jsonb_agg(x order by (x->>'id')::bigint) from (
        select jsonb_build_object('id', m.id, 'direcao', m.direcao, 'autor_tipo', m.autor_tipo,
               'autor_nome', u.nome, 'tipo', m.tipo, 'conteudo', m.conteudo, 'midia', m.midia,
               'estado_entrega', m.estado_entrega, 'erro', m.erro, 'criado_em', m.criado_em,
               'resposta_pronta', rp.atalho) as x
          from atendimento.mov_mensagem m
          left join crm.cad_usuario u on u.id = m.autor_usuario_id
          left join atendimento.cad_resposta_pronta rp on rp.id = m.resposta_pronta_id
         where m.conversa_id = c.id order by m.id desc limit 200) s), '[]'));
  return v;
end $$;

-- Prévia do texto com variáveis resolvidas para a conversa
create or replace function api.atendimento_previa(p_empresa uuid, p_conversa uuid, p_texto text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  if not exists (select 1 from atendimento.mov_conversa where id = p_conversa and empresa_id = p_empresa) then
    raise exception 'conversa não encontrada' using errcode = 'P0002';
  end if;
  return atendimento.renderizar(p_texto, atendimento.variaveis_contexto(p_conversa, auth.uid()))
         || jsonb_build_object('desconhecidas', to_jsonb(atendimento.variaveis_desconhecidas(p_texto)));
end $$;

-- Enviar resposta (ou nota interna)
create or replace function api.atendimento_enviar(p_empresa uuid, p_conversa uuid, p_texto text,
  p_resposta_pronta uuid default null, p_nota boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); c atendimento.mov_conversa; r jsonb; v_texto text; v_integ text;
  ci engine.cfg_integracao; v_dest text; v_estado text; v_erro jsonb; v_msg bigint; v_ob bigint; v_tag boolean := false; v_obst text;
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  select * into c from atendimento.mov_conversa where id = p_conversa and empresa_id = p_empresa for update;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  if nullif(btrim(p_texto), '') is null then raise exception 'mensagem vazia' using errcode = '22023'; end if;
  if length(p_texto) > 1000 then raise exception 'mensagem acima de 1000 caracteres' using errcode = '22023'; end if;

  if p_nota then
    insert into atendimento.mov_mensagem (empresa_id, conversa_id, canal, direcao, autor_tipo, autor_usuario_id, conteudo, estado_entrega)
    values (p_empresa, c.id, c.canal, 'nota', 'atendente', v_uid, btrim(p_texto), 'recebida') returning id into v_msg;
    return jsonb_build_object('mensagem_id', v_msg, 'estado_entrega', 'nota');
  end if;

  r := atendimento.renderizar(p_texto, atendimento.variaveis_contexto(c.id, v_uid));
  if jsonb_array_length(r -> 'faltantes') > 0 then
    raise exception 'variáveis sem valor para esta cliente: %', (select string_agg(x, ', ') from jsonb_array_elements_text(r -> 'faltantes') x)
      using errcode = '22023';
  end if;
  v_texto := btrim(r ->> 'texto');

  -- janela de resposta livre do canal
  if c.janela_ate is null or c.janela_ate <= now() then
    if c.canal = 'instagram' and c.janela_humana_ate > now() then
      v_tag := true;   -- usa a etiqueta HUMAN_AGENT da Meta (resposta humana até 7 dias)
    else
      raise exception 'janela de resposta fechada: a cliente precisa escrever de novo%',
        case when c.canal = 'whatsapp' then ' (ou use um modelo aprovado)' else '' end using errcode = '22023';
    end if;
  end if;

  v_integ := case c.canal when 'instagram' then 'meta_dm' when 'whatsapp' then 'whatsapp' when 'facebook' then 'facebook' end;
  select * into ci from engine.cfg_integracao where empresa_id = p_empresa and integracao = v_integ;
  select identificador into v_dest from crm.rel_cliente_canal where cliente_id = c.cliente_id and canal = c.canal order by criado_em limit 1;
  if v_dest is null and c.canal = 'instagram' then select instagram_igsid into v_dest from crm.cad_cliente where id = c.cliente_id; end if;

  if v_integ is null or ci.modo is null or ci.modo = 'desligado' then
    v_estado := 'bloqueada'; v_erro := jsonb_build_object('motivo', 'integracao_desligada', 'integracao', v_integ);
  elsif ci.modo = 'simulado' then
    v_estado := 'simulada';
  elsif v_dest is null then
    v_estado := 'bloqueada'; v_erro := jsonb_build_object('motivo', 'sem_identificador_no_canal');
  elsif ci.somente_allowlist and not exists (select 1 from engine.cfg_allowlist_destinatario
                                              where empresa_id = p_empresa and canal = c.canal and identificador = v_dest) then
    v_estado := 'bloqueada'; v_erro := jsonb_build_object('motivo', 'fora_da_allowlist');
  else
    v_estado := 'pendente';
  end if;

  insert into atendimento.mov_mensagem (empresa_id, conversa_id, canal, direcao, autor_tipo, autor_usuario_id, conteudo,
                                        resposta_pronta_id, estado_entrega, erro)
  values (p_empresa, c.id, c.canal, 'saida', 'atendente', v_uid, v_texto, p_resposta_pronta, v_estado, v_erro)
  returning id into v_msg;

  if v_estado = 'pendente' then
    v_ob := engine.enfileirar(p_empresa, v_integ, 'enviar_mensagem_atendimento', 'msg:' || c.id || ':' || v_msg,
                              'mensagem', v_msg::text,
                              jsonb_build_object('destinatario', v_dest, 'texto', v_texto, 'human_agent', v_tag), 1);
    select estado into v_obst from engine.mov_outbox where id = v_ob;
    if v_obst in ('bloqueado','aguardando_aprovacao') then
      v_estado := 'bloqueada'; v_erro := jsonb_build_object('motivo', 'politica_de_envio', 'outbox', v_obst);
    end if;
    update atendimento.mov_mensagem set outbox_id = v_ob, estado_entrega = v_estado, erro = v_erro where id = v_msg;
  end if;

  if p_resposta_pronta is not null then
    update atendimento.cad_resposta_pronta set usos = usos + 1, ultimo_uso_em = now()
     where id = p_resposta_pronta and empresa_id = p_empresa;
  end if;
  update atendimento.mov_conversa set ultima_mensagem_em = now(), ultima_previa = left(v_texto, 140),
         primeira_resposta_em = coalesce(primeira_resposta_em, now()),
         atendente_id = coalesce(atendente_id, v_uid), nao_lidas = 0,
         em_atendimento_por = v_uid, em_atendimento_desde = now(), atualizado_em = now()
   where id = c.id;
  return jsonb_build_object('mensagem_id', v_msg, 'estado_entrega', v_estado, 'erro', v_erro, 'texto', v_texto, 'human_agent', v_tag);
end $$;

-- Ações na conversa: assumir, atribuir, estado, adiar, etiqueta_add, etiqueta_rem
create or replace function api.atendimento_acao(p_empresa uuid, p_conversa uuid, p_acao text, p_valor text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); c atendimento.mov_conversa;
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  select * into c from atendimento.mov_conversa where id = p_conversa and empresa_id = p_empresa for update;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;

  if p_acao = 'assumir' then
    update atendimento.mov_conversa set atendente_id = v_uid, atualizado_em = now() where id = c.id;
  elsif p_acao = 'atribuir' then
    if p_valor is not null and not exists (select 1 from crm.rel_usuario_empresa
                                            where usuario_id = p_valor::uuid and empresa_id = p_empresa and ativo) then
      raise exception 'usuário não pertence à empresa' using errcode = '22023';
    end if;
    update atendimento.mov_conversa set atendente_id = p_valor::uuid, atualizado_em = now() where id = c.id;
  elsif p_acao = 'estado' then
    if p_valor not in ('aberta','pendente','resolvida') then raise exception 'estado inválido' using errcode = '22023'; end if;
    if p_valor <> 'resolvida' and c.estado = 'resolvida' and exists (
         select 1 from atendimento.mov_conversa o where o.empresa_id = c.empresa_id and o.cliente_id = c.cliente_id
           and o.canal = c.canal and o.estado <> 'resolvida' and o.id <> c.id) then
      raise exception 'a cliente já tem outra conversa aberta neste canal' using errcode = '22023';
    end if;
    update atendimento.mov_conversa set estado = p_valor, adiada_ate = null,
           resolvida_em = case when p_valor = 'resolvida' then now() end, atualizado_em = now() where id = c.id;
  elsif p_acao = 'adiar' then
    if p_valor::timestamptz <= now() then raise exception 'escolha um horário futuro' using errcode = '22023'; end if;
    update atendimento.mov_conversa set estado = 'adiada', adiada_ate = p_valor::timestamptz, atualizado_em = now() where id = c.id;
  elsif p_acao = 'etiqueta_add' then
    insert into atendimento.rel_conversa_etiqueta (conversa_id, etiqueta_id, empresa_id)
    select c.id, e.id, p_empresa from atendimento.cad_etiqueta e where e.id = p_valor::uuid and e.empresa_id = p_empresa
    on conflict do nothing;
  elsif p_acao = 'etiqueta_rem' then
    delete from atendimento.rel_conversa_etiqueta where conversa_id = c.id and etiqueta_id = p_valor::uuid;
  else
    raise exception 'ação desconhecida: %', p_acao using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Abrir (ou reabrir) conversa a partir da ficha da cliente (ex.: Central de vendas)
create or replace function api.atendimento_abrir(p_empresa uuid, p_cliente uuid, p_canal text default 'instagram')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  if not exists (select 1 from crm.cad_cliente where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'cliente não encontrada' using errcode = 'P0002';
  end if;
  select id into v_id from atendimento.mov_conversa
   where empresa_id = p_empresa and cliente_id = p_cliente and canal = p_canal and estado <> 'resolvida';
  if v_id is null then
    select id into v_id from atendimento.mov_conversa
     where empresa_id = p_empresa and cliente_id = p_cliente and canal = p_canal order by criado_em desc limit 1;
    if v_id is null then
      insert into atendimento.mov_conversa (empresa_id, cliente_id, canal, estado, atendente_id)
      values (p_empresa, p_cliente, p_canal, 'aberta', auth.uid()) returning id into v_id;
    else
      update atendimento.mov_conversa set estado = 'aberta', resolvida_em = null where id = v_id;
    end if;
  end if;
  return jsonb_build_object('conversa_id', v_id);
end $$;

-- Respostas prontas: listar (todos da caixa) e salvar (admin)
create or replace function api.atendimento_respostas(p_empresa uuid, p_incluir_inativas boolean default false)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform api._exigir(p_empresa, atendimento.papeis_caixa());
  return jsonb_build_object(
    'respostas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'atalho', atalho, 'titulo', titulo, 'categoria', categoria,
        'corpo', corpo, 'canais', canais, 'ativo', ativo, 'versao', versao, 'usos', usos, 'ultimo_uso_em', ultimo_uso_em,
        'atualizado_em', atualizado_em) order by categoria, atalho)
      from atendimento.cad_resposta_pronta where empresa_id = p_empresa and (ativo or p_incluir_inativas)), '[]'),
    'variaveis', (select jsonb_agg(jsonb_build_object('chave', chave, 'grupo', grupo, 'rotulo', rotulo,
        'descricao', descricao, 'exemplo', exemplo) order by ordem) from atendimento.cfg_variavel),
    'etiquetas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'cor', cor) order by nome)
      from atendimento.cad_etiqueta where empresa_id = p_empresa and ativo), '[]'),
    'pode_editar', api.tem_papel(p_empresa, array['admin']));
end $$;

create or replace function api.atendimento_resposta_salvar(p_empresa uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_id uuid := nullif(p_dados ->> 'id', '')::uuid; v_desc text[]; v_canais text[];
begin
  perform api._exigir(p_empresa, array['admin']);
  v_desc := atendimento.variaveis_desconhecidas(p_dados ->> 'corpo');
  if cardinality(v_desc) > 0 then
    raise exception 'variáveis inexistentes: %', array_to_string(v_desc, ', ') using errcode = '22023';
  end if;
  if jsonb_typeof(p_dados -> 'canais') = 'array' and jsonb_array_length(p_dados -> 'canais') > 0 then
    select array_agg(x) into v_canais from jsonb_array_elements_text(p_dados -> 'canais') x;
  end if;
  if v_id is null then
    insert into atendimento.cad_resposta_pronta (empresa_id, atalho, titulo, categoria, corpo, canais, ativo, criado_por, atualizado_por)
    values (p_empresa, lower(btrim(p_dados ->> 'atalho')), btrim(p_dados ->> 'titulo'), coalesce(nullif(p_dados ->> 'categoria', ''), 'geral'),
            p_dados ->> 'corpo', v_canais, coalesce((p_dados ->> 'ativo')::boolean, true), v_uid, v_uid)
    returning id into v_id;
  else
    update atendimento.cad_resposta_pronta set
      atalho = lower(btrim(p_dados ->> 'atalho')), titulo = btrim(p_dados ->> 'titulo'),
      categoria = coalesce(nullif(p_dados ->> 'categoria', ''), 'geral'), corpo = p_dados ->> 'corpo',
      canais = v_canais, ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo),
      versao = versao + case when corpo is distinct from p_dados ->> 'corpo' then 1 else 0 end,
      atualizado_por = v_uid, atualizado_em = now()
     where id = v_id and empresa_id = p_empresa;
    if not found then raise exception 'resposta não encontrada' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function api.atendimento_etiqueta_salvar(p_empresa uuid, p_nome text, p_cor text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  insert into atendimento.cad_etiqueta (empresa_id, nome, cor) values (p_empresa, btrim(p_nome), coalesce(p_cor, '#b8975a'))
  on conflict (empresa_id, lower(nome)) do update set ativo = true, cor = coalesce(p_cor, atendimento.cad_etiqueta.cor)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'api.atendimento_conversas(uuid,text,text,text,text,int)', 'api.atendimento_resumo(uuid)',
    'api.atendimento_conversa(uuid,uuid,boolean)', 'api.atendimento_previa(uuid,uuid,text)',
    'api.atendimento_enviar(uuid,uuid,text,uuid,boolean)', 'api.atendimento_acao(uuid,uuid,text,text)',
    'api.atendimento_abrir(uuid,uuid,text)', 'api.atendimento_respostas(uuid,boolean)',
    'api.atendimento_resposta_salvar(uuid,jsonb)', 'api.atendimento_etiqueta_salvar(uuid,text,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema atendimento from public, anon, authenticated;

-- 12. Worker de envio (Instagram) + reabrir adiadas + perfil -----------------

-- job_meta_dm passa a reconciliar só o link de reserva (o atendimento tem o seu próprio)
create or replace function engine.job_meta_dm()
 returns void language plpgsql security definer set search_path to '' as $function$
declare
  v_emp uuid := '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda';
  v_tok text; v_igid text; v_ver text;
  o record; v_req bigint;
  v_comment text; v_codigo text; v_link text; v_text text;
begin
  with done as (
    update engine.mov_outbox ob set estado='ok', concluido_em=now(), ultimo_erro=null
      from net._http_response h
     where h.id = ob.id_externo::bigint and ob.integracao='meta_dm' and ob.tipo='enviar_link_reserva' and ob.estado='em_andamento'
       and ob.id_externo ~ '^\d+$' and h.status_code between 200 and 299
    returning ob.entidade_id, ob.entidade_tipo
  )
  update live.mov_interesse mi set private_reply_estado='usada'
    from live.mov_reserva r
   where r.id::text in (select entidade_id from done where entidade_tipo='reserva') and mi.id = r.interesse_id;

  update engine.mov_outbox ob
     set estado = case when ob.tentativas >= ob.max_tentativas then 'erro_negocio' else 'pendente' end,
         ultimo_erro = jsonb_build_object('status', h.status_code, 'erro', left(coalesce(h.error_msg, left(h.content,200), 'erro'),250)),
         id_externo = null, proxima_tentativa_em = now() + interval '1 minute'
    from net._http_response h
   where h.id = ob.id_externo::bigint and ob.integracao='meta_dm' and ob.tipo='enviar_link_reserva' and ob.estado='em_andamento'
     and ob.id_externo ~ '^\d+$' and not (coalesce(h.status_code,0) between 200 and 299);

  update engine.mov_outbox ob
     set estado='pendente', id_externo=null,
         ultimo_erro=jsonb_build_object('erro','sem_resposta'), proxima_tentativa_em=now()+interval '1 minute'
   where ob.integracao='meta_dm' and ob.tipo='enviar_link_reserva' and ob.estado='em_andamento' and ob.id_externo is not null and ob.id_externo ~ '^\d+$'
     and ob.proxima_tentativa_em < now() - interval '5 minutes'
     and not exists (select 1 from net._http_response h where h.id = ob.id_externo::bigint);

  select ds.decrypted_secret into v_tok
    from private.cad_credencial c join vault.decrypted_secrets ds on ds.id = c.segredo_id
   where c.empresa_id = v_emp and c.nome in ('meta_dm.access_token','meta_live.access_token')
   order by case c.nome when 'meta_dm.access_token' then 0 else 1 end limit 1;
  if v_tok is null then return; end if;
  v_tok := btrim(v_tok);

  select coalesce(
    (select nullif(parametros->>'instagram_user_id','') from engine.cfg_integracao where empresa_id=v_emp and integracao='meta_dm'),
    (select nullif(parametros->>'instagram_user_id','') from engine.cfg_integracao where empresa_id=v_emp and integracao='meta_live'))
  into v_igid;
  if v_igid is null then return; end if;

  select coalesce((select nullif(parametros->>'graph_version','') from engine.cfg_integracao where empresa_id=v_emp and integracao='meta_live'),'v27.0')
  into v_ver;

  for o in select * from engine.mov_outbox
            where empresa_id=v_emp and integracao='meta_dm' and estado='pendente'
              and tipo='enviar_link_reserva'
              and (proxima_tentativa_em is null or proxima_tentativa_em <= now())
              and tentativas < max_tentativas
            order by prioridade, id limit 5 for update skip locked loop

    select i.comentario_id_externo, it.codigo_live,
           (select url from venda.cad_link_venda lv where lv.item_id = it.id and lv.url is not null order by lv.criado_em desc limit 1)
      into v_comment, v_codigo, v_link
      from live.mov_reserva r
      join live.mov_interesse i on i.id = r.interesse_id
      join live.mov_item it on it.id = r.item_id
     where r.id = o.entidade_id::uuid;

    if v_comment is null then
      update engine.mov_outbox set estado='erro_negocio', tentativas=tentativas+1,
             ultimo_erro=jsonb_build_object('erro','sem_comentario') where id=o.id;
      continue;
    end if;

    v_text := 'Oi! Vi seu interesse na peca ' || coalesce(v_codigo,'') || '. ' ||
              coalesce('Garanta aqui: ' || v_link, 'Nosso time ja te envia o link de pagamento.');

    select net.http_post(
      url := 'https://graph.facebook.com/' || v_ver || '/' || v_igid || '/messages',
      body := jsonb_build_object('recipient', jsonb_build_object('comment_id', v_comment),
                                 'message', jsonb_build_object('text', v_text)),
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_tok),
      timeout_milliseconds := 15000) into v_req;

    update engine.mov_outbox set estado='em_andamento', id_externo=v_req::text,
           tentativas=tentativas+1, proxima_tentativa_em=now() where id=o.id;
  end loop;
end $function$;

create or replace function engine.job_atendimento()
returns void language plpgsql security definer set search_path to '' as $$
declare o record; h record; v_emp uuid; v_tok text; v_igid text; v_ver text; v_req bigint; v_mid text; p record; v_body jsonb;
begin
  -- a) conversas adiadas que venceram voltam para a fila
  update atendimento.mov_conversa set estado = 'aberta', adiada_ate = null, atualizado_em = now()
   where estado = 'adiada' and adiada_ate <= now();

  -- b) reconciliar envios em andamento
  for o in select ob.*, hr.status_code, hr.content, hr.error_msg
             from engine.mov_outbox ob join net._http_response hr on hr.id = ob.id_externo::bigint
            where ob.integracao = 'meta_dm' and ob.tipo = 'enviar_mensagem_atendimento'
              and ob.estado = 'em_andamento' and ob.id_externo ~ '^\d+$' loop
    if coalesce(o.status_code, 0) between 200 and 299 then
      v_mid := (case when o.content ~ '^\s*\{' then o.content::jsonb end) ->> 'message_id';
      update engine.mov_outbox set estado = 'ok', concluido_em = now(), ultimo_erro = null where id = o.id;
      if v_mid is not null then
        -- o eco do Instagram pode ter chegado antes da resposta: remove a cópia "app_nativo"
        delete from atendimento.mov_mensagem where empresa_id = o.empresa_id and canal = 'instagram'
           and id_externo = v_mid and autor_tipo = 'app_nativo';
      end if;
      update atendimento.mov_mensagem set estado_entrega = 'enviada', id_externo = coalesce(v_mid, id_externo), erro = null
       where id = o.entidade_id::bigint;
    else
      update engine.mov_outbox set
             estado = case when tentativas >= max_tentativas or coalesce(o.status_code,0) between 400 and 499 then 'erro_negocio' else 'pendente' end,
             ultimo_erro = jsonb_build_object('status', o.status_code, 'erro', left(coalesce(o.error_msg, left(o.content, 300), 'erro'), 300)),
             id_externo = null, proxima_tentativa_em = now() + interval '1 minute'
       where id = o.id;
      update atendimento.mov_mensagem set
             estado_entrega = case when o.tentativas >= o.max_tentativas or coalesce(o.status_code,0) between 400 and 499 then 'erro' else 'pendente' end,
             erro = jsonb_build_object('status', o.status_code, 'detalhe', left(coalesce(o.error_msg, o.content, ''), 300))
       where id = o.entidade_id::bigint;
    end if;
  end loop;

  -- c) disparar pendentes (por empresa, com o token do Vault)
  for v_emp in select distinct empresa_id from engine.mov_outbox
                where integracao = 'meta_dm' and tipo = 'enviar_mensagem_atendimento' and estado = 'pendente' loop
    v_tok := null;
    select btrim(ds.decrypted_secret) into v_tok
      from private.cad_credencial c join vault.decrypted_secrets ds on ds.id = c.segredo_id
     where c.empresa_id = v_emp and c.nome in ('meta_dm.access_token','meta_live.access_token')
     order by case c.nome when 'meta_dm.access_token' then 0 else 1 end limit 1;
    select coalesce(
      (select nullif(parametros->>'instagram_user_id','') from engine.cfg_integracao where empresa_id = v_emp and integracao = 'meta_dm'),
      (select nullif(parametros->>'instagram_user_id','') from engine.cfg_integracao where empresa_id = v_emp and integracao = 'meta_live'))
      into v_igid;
    select coalesce((select nullif(parametros->>'graph_version','') from engine.cfg_integracao where empresa_id = v_emp and integracao = 'meta_live'), 'v27.0')
      into v_ver;
    if v_tok is null or v_igid is null then continue; end if;

    for o in select * from engine.mov_outbox
              where empresa_id = v_emp and integracao = 'meta_dm' and tipo = 'enviar_mensagem_atendimento' and estado = 'pendente'
                and proxima_tentativa_em <= now() and tentativas < max_tentativas
              order by prioridade, id limit 20 for update skip locked loop
      v_body := jsonb_build_object('recipient', jsonb_build_object('id', o.payload ->> 'destinatario'),
                                   'message', jsonb_build_object('text', o.payload ->> 'texto'));
      if coalesce((o.payload ->> 'human_agent')::boolean, false) then
        v_body := v_body || jsonb_build_object('messaging_type', 'MESSAGE_TAG', 'tag', 'HUMAN_AGENT');
      end if;
      select net.http_post(url := 'https://graph.facebook.com/' || v_ver || '/' || v_igid || '/messages',
               body := v_body,
               headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok),
               timeout_milliseconds := 15000) into v_req;
      update engine.mov_outbox set estado = 'em_andamento', id_externo = v_req::text, tentativas = tentativas + 1,
             proxima_tentativa_em = now() where id = o.id;
    end loop;

    -- d) completar perfil (username/nome) de quem só escreveu por DM
    for p in select pb.* , hr.status_code, hr.content from atendimento.mov_perfil_busca pb
               join net._http_response hr on hr.id = pb.requisicao_id
              where pb.empresa_id = v_emp and pb.estado = 'enviada' loop
      if coalesce(p.status_code, 0) between 200 and 299 and p.content ~ '^\s*\{' then
        update crm.cad_cliente set instagram_username = coalesce(instagram_username, p.content::jsonb ->> 'username'),
               nome = coalesce(nome, nullif(p.content::jsonb ->> 'name', '')), atualizado_em = now()
         where id = p.cliente_id;
        update atendimento.mov_perfil_busca set estado = 'ok' where id = p.id;
      else
        update atendimento.mov_perfil_busca set estado = 'erro' where id = p.id;
      end if;
    end loop;
    for p in select distinct cl.id, cl.instagram_igsid from atendimento.mov_conversa cv
               join crm.cad_cliente cl on cl.id = cv.cliente_id
              where cv.empresa_id = v_emp and cv.canal = 'instagram' and cl.instagram_username is null and cl.instagram_igsid is not null
                and not exists (select 1 from atendimento.mov_perfil_busca pb where pb.cliente_id = cl.id
                                  and pb.criado_em > now() - interval '1 day')
              limit 5 loop
      select net.http_get(url := 'https://graph.facebook.com/' || v_ver || '/' || p.instagram_igsid || '?fields=username,name',
               headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok), timeout_milliseconds := 15000) into v_req;
      insert into atendimento.mov_perfil_busca (empresa_id, cliente_id, requisicao_id) values (v_emp, p.id, v_req);
    end loop;
  end loop;
end $$;
revoke all on function engine.job_atendimento() from public, anon, authenticated;

select cron.schedule('atendimento-ciclo', '10 seconds', 'select engine.job_atendimento()');

-- 13. Política de envio, etiquetas e respostas iniciais por empresa ---------
insert into engine.cfg_politica_acao (empresa_id, integracao, tipo, modo, limite_por_hora, observacao, atualizado_por)
select e.id, i.integ, 'enviar_mensagem_atendimento', 'automatico', 300, 'Respostas da caixa de entrada (ação humana)', '0087'
  from crm.cad_empresa e cross join (values ('meta_dm'), ('whatsapp')) i(integ)
on conflict do nothing;

insert into atendimento.cad_etiqueta (empresa_id, nome, cor)
select e.id, x.nome, x.cor from crm.cad_empresa e cross join (values
  ('Dúvida de medida', '#7a9cc6'), ('Pagamento', '#b8975a'), ('Rastreio', '#6fa58b'),
  ('Troca/Devolução', '#c98a5a'), ('Reclamação', '#c0605a')) x(nome, cor)
on conflict do nothing;

insert into atendimento.cad_resposta_pronta (empresa_id, atalho, titulo, categoria, corpo)
select e.id, x.atalho, x.titulo, x.categoria, x.corpo from crm.cad_empresa e cross join (values
  ('ola', 'Saudação', 'saudacao', 'Oi, {{cliente.primeiro_nome}}! Aqui é {{atendente.primeiro_nome}}, da {{empresa.nome}}. Como posso te ajudar? 💛'),
  ('link', 'Link da reserva', 'venda', '{{cliente.primeiro_nome}}, a peça {{reserva.peca}} ({{reserva.descricao}}) está reservada para você por {{reserva.valor}}. Garanta pagando até {{reserva.expira_em}}: {{reserva.link}}'),
  ('prazo', 'Lembrete de prazo', 'venda', 'Passando para lembrar: sua reserva da peça {{reserva.peca}} vence em {{reserva.minutos_restantes}} min. O link é este: {{reserva.link}}'),
  ('fila', 'Posição na fila', 'venda', 'Você está na posição {{fila.posicao}} da fila da peça {{fila.peca}}. Se a reserva atual não for paga, te aviso na hora!'),
  ('pix', 'Pix gerado', 'pagamento', 'Seu Pix de {{cobranca.valor}} está aqui: {{cobranca.link}}. Ele vale até {{cobranca.expira_em}}.'),
  ('pago', 'Pagamento confirmado', 'pagamento', 'Pagamento confirmado, {{cliente.primeiro_nome}}! Já estamos separando seu pedido {{pedido.numero}}. Obrigada pela compra! 💛'),
  ('status', 'Situação do pedido', 'envio', 'Seu pedido {{pedido.numero}} está assim: {{pedido.situacao}}.'),
  ('rastreio', 'Código de rastreio', 'envio', 'Seu pedido {{pedido.numero}} foi enviado pela {{envio.transportadora}}. Código de rastreio: {{envio.codigo_rastreio}}. Acompanhe aqui: {{envio.link_rastreio}}'),
  ('medidas', 'Vou conferir medidas', 'geral', 'Vou conferir as medidas certinho e já te passo, tá bom?'),
  ('troca', 'Pedido de troca/devolução', 'pos_venda', 'Recebi sua solicitação, {{cliente.primeiro_nome}}. Vou verificar com a equipe e te retorno em breve com as próximas etapas.')
) x(atalho, titulo, categoria, corpo)
on conflict (empresa_id, atalho) do nothing;
