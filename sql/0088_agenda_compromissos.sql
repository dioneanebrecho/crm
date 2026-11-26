-- 0088_agenda_compromissos.sql (numerada 0086 no rascunho; 0086 e 0087 foram usadas por outra sessão)
-- Pedido de mudança 045: Agenda de compromissos (lives, follow-up, pós-venda, lembretes e tarefas)
-- Fase 1: modelo, API do painel, regra de encerramento com interação da cliente e convite de calendário por e-mail.
-- APLICADA em 25/11/2026 (23h17) com autorização do Dione. Testes: sql/testes/88_testes_agenda.sql.
-- Só aditivo, exceto o ajuste da matriz de permissões da tela 'agenda' (suporte, expedição e financeiro passam a editar).

create schema if not exists agenda;
revoke all on schema agenda from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Tipos de compromisso
-- ---------------------------------------------------------------------------
create table agenda.cad_tipo (
  codigo text primary key,
  nome text not null,
  cor text not null,                       -- variável de tema do painel
  exige_interacao_cliente boolean not null default false,  -- decisão 2 (25/11)
  ordem int not null default 0
);
insert into agenda.cad_tipo (codigo, nome, cor, exige_interacao_cliente, ordem) values
  ('live',      'Live',                 'dourado',  false, 10),
  ('follow_up', 'Follow-up de cliente', 'azul',     true,  20),
  ('pos_venda', 'Pós-venda',            'verde',    true,  30),
  ('lembrete',  'Lembrete',             'cinza',    false, 40),
  ('tarefa',    'Tarefa interna',       'roxo',     false, 50);

-- ---------------------------------------------------------------------------
-- 2. Configuração por empresa
-- ---------------------------------------------------------------------------
create table agenda.cfg_agenda (
  empresa_id uuid primary key references crm.cad_empresa(id),
  enviar_convite boolean not null default false,       -- liga o convite por e-mail depois do teste
  lembrete_padrao_min int[] not null default '{30}',   -- avisos do calendário (minutos antes)
  duracao_padrao_min int not null default 30,
  nome_cliente_no_convite boolean not null default false, -- LGPD: por padrão o convite não leva nome da cliente
  url_painel text not null default 'https://crm.evoconecta.io/#agenda',
  max_tentativas_sem_resposta int not null default 3,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Compromissos
-- ---------------------------------------------------------------------------
create table agenda.mov_compromisso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  tipo_codigo text not null references agenda.cad_tipo(codigo),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  descricao text,
  inicio_em timestamptz not null,
  fim_em timestamptz,
  dia_inteiro boolean not null default false,
  prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta')),
  responsavel_id uuid not null references crm.cad_usuario(id),
  criado_por uuid references crm.cad_usuario(id),
  -- vínculos opcionais (abrem o item no contexto certo)
  cliente_id uuid references crm.cad_cliente(id),
  pedido_id uuid references venda.mov_pedido(id),
  devolucao_id uuid references pos_venda.mov_devolucao(id),
  conversa_id uuid references atendimento.mov_conversa(id),
  live_id uuid references live.mov_live(id),
  -- ciclo de vida
  estado text not null default 'pendente'
    check (estado in ('pendente','aguardando_cliente','resolvido','encerrado','cancelado')),
  desfecho text,                -- o que foi resolvido / combinado
  motivo_encerramento text,     -- obrigatório em 'encerrado' e 'cancelado'
  concluido_em timestamptz,
  concluido_por uuid references crm.cad_usuario(id),
  -- automação (fase 3): regra que gerou e chave de idempotência
  origem_regra text,
  chave_regra text,
  -- convite de calendário
  lembrete_min int[],
  convite_seq int not null default 0,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim_em is null or fim_em >= inicio_em),
  check (estado not in ('encerrado','cancelado') or motivo_encerramento is not null)
);
create unique index mov_compromisso_chave_regra_uq on agenda.mov_compromisso (empresa_id, chave_regra) where chave_regra is not null;
create index mov_compromisso_periodo_ix on agenda.mov_compromisso (empresa_id, inicio_em);
create index mov_compromisso_resp_aberto_ix on agenda.mov_compromisso (empresa_id, responsavel_id, inicio_em)
  where estado in ('pendente','aguardando_cliente');
create index mov_compromisso_cliente_ix on agenda.mov_compromisso (cliente_id) where cliente_id is not null;

-- Interações registradas (tentativas de contato, resposta da cliente, notas)
create table agenda.mov_interacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  compromisso_id uuid not null references agenda.mov_compromisso(id) on delete cascade,
  tipo text not null check (tipo in ('tentativa','resposta_cliente','nota')),
  canal text check (canal in ('whatsapp','instagram','telefone','email','loja','outro')),
  texto text,
  registrado_por uuid references crm.cad_usuario(id),
  registrado_em timestamptz not null default now(),
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao'))
);
create index mov_interacao_comp_ix on agenda.mov_interacao (compromisso_id, registrado_em);

-- Saída de convites de calendário (e-mail .ics via Resend)
create table agenda.mov_convite (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references crm.cad_empresa(id),
  compromisso_id uuid not null references agenda.mov_compromisso(id) on delete cascade,
  usuario_id uuid not null references crm.cad_usuario(id),
  email text not null,
  metodo text not null check (metodo in ('REQUEST','CANCEL')),
  sequencia int not null,
  criado_em timestamptz not null default now(),
  req_id bigint, ultima_tentativa timestamptz, tentativas int not null default 0,
  enviado_em timestamptz, erro text
);
create index mov_convite_pendente_ix on agenda.mov_convite (id) where enviado_em is null;
create index mov_convite_comp_ix on agenda.mov_convite (compromisso_id, usuario_id, id);

alter table agenda.cad_tipo enable row level security;
alter table agenda.cfg_agenda enable row level security;
alter table agenda.mov_compromisso enable row level security;
alter table agenda.mov_interacao enable row level security;
alter table agenda.mov_convite enable row level security;
-- Sem policies, por desenho: o acesso é só pelas funções api.* (security definer).

create trigger auditoria after insert or update or delete on agenda.mov_compromisso
  for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on agenda.mov_interacao
  for each row execute function audit.registrar();
create trigger guarda_origem before insert on agenda.mov_compromisso
  for each row execute function engine.guarda_origem();
create trigger guarda_origem before insert on agenda.mov_interacao
  for each row execute function engine.guarda_origem();

-- ---------------------------------------------------------------------------
-- 4. Convite de calendário (.ics)
-- ---------------------------------------------------------------------------
create function agenda._ics_txt(p text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(coalesce(p,''), E'\\', E'\\\\'), ';', E'\\;'), ',', E'\\,'), E'\n', E'\\n')
$$;

create function agenda._ics_data(p timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"')
$$;

create function agenda._ics(p_comp agenda.mov_compromisso, p_metodo text, p_seq int, p_email text, p_remetente text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_cfg agenda.cfg_agenda; v_tipo text; v_titulo text; v_fim timestamptz; v_alarmes text := ''; m int; v_cli text;
begin
  select * into v_cfg from agenda.cfg_agenda where empresa_id = p_comp.empresa_id;
  select nome into v_tipo from agenda.cad_tipo where codigo = p_comp.tipo_codigo;
  v_titulo := '[' || v_tipo || '] ' || p_comp.titulo;
  if coalesce(v_cfg.nome_cliente_no_convite, false) and p_comp.cliente_id is not null then
    select split_part(nome, ' ', 1) into v_cli from crm.cad_cliente where id = p_comp.cliente_id;
    if v_cli is not null then v_titulo := v_titulo || ' · ' || v_cli; end if;
  end if;
  v_fim := coalesce(p_comp.fim_em, p_comp.inicio_em + make_interval(mins => coalesce(v_cfg.duracao_padrao_min, 30)));
  if p_metodo = 'REQUEST' then
    foreach m in array coalesce(p_comp.lembrete_min, v_cfg.lembrete_padrao_min, '{30}'::int[]) loop
      v_alarmes := v_alarmes || E'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:' || agenda._ics_txt(v_titulo)
                   || E'\r\nTRIGGER:-PT' || m || E'M\r\nEND:VALARM\r\n';
    end loop;
  end if;
  return E'BEGIN:VCALENDAR\r\nPRODID:-//Ane Brecho//CRM Agenda//PT-BR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nMETHOD:' || p_metodo
    || E'\r\nBEGIN:VEVENT\r\nUID:' || p_comp.id || '@crm.anebrecho'
    || E'\r\nSEQUENCE:' || p_seq
    || E'\r\nDTSTAMP:' || agenda._ics_data(now())
    || case when p_comp.dia_inteiro
         then E'\r\nDTSTART;VALUE=DATE:' || to_char(p_comp.inicio_em at time zone 'America/Sao_Paulo', 'YYYYMMDD')
           || E'\r\nDTEND;VALUE=DATE:' || to_char((v_fim at time zone 'America/Sao_Paulo') + interval '1 day', 'YYYYMMDD')
         else E'\r\nDTSTART:' || agenda._ics_data(p_comp.inicio_em) || E'\r\nDTEND:' || agenda._ics_data(v_fim) end
    || E'\r\nSUMMARY:' || agenda._ics_txt(v_titulo)
    || E'\r\nDESCRIPTION:' || agenda._ics_txt(coalesce(p_comp.descricao || E'\n\n', '') || 'Abrir no painel: ' || coalesce(v_cfg.url_painel, '') || '?c=' || p_comp.id)
    || E'\r\nURL:' || coalesce(v_cfg.url_painel, '') || '?c=' || p_comp.id
    || E'\r\nORGANIZER;CN=Ane Brecho CRM:mailto:' || p_remetente
    || E'\r\nATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:' || p_email
    || E'\r\nSTATUS:' || case when p_metodo = 'CANCEL' then 'CANCELLED' else 'CONFIRMED' end
    || E'\r\n' || v_alarmes || E'END:VEVENT\r\nEND:VCALENDAR\r\n';
end $$;
revoke all on function agenda._ics(agenda.mov_compromisso, text, int, text, text) from public, anon, authenticated;

-- Enfileira convite quando data, título, responsável ou estado mudam
create function agenda._apos_compromisso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_on boolean; v_email text; v_email_ant text; v_seq int;
begin
  select enviar_convite into v_on from agenda.cfg_agenda where empresa_id = new.empresa_id;
  if not coalesce(v_on, false) then return null; end if;
  v_seq := new.convite_seq;
  select email into v_email from crm.cad_usuario where id = new.responsavel_id and ativo;

  if tg_op = 'INSERT' then
    if v_email is not null and new.estado in ('pendente','aguardando_cliente') then
      insert into agenda.mov_convite (empresa_id, compromisso_id, usuario_id, email, metodo, sequencia)
      values (new.empresa_id, new.id, new.responsavel_id, v_email, 'REQUEST', v_seq);
    end if;
    return null;
  end if;

  -- responsável trocou: cancela no calendário do anterior
  if new.responsavel_id is distinct from old.responsavel_id then
    select email into v_email_ant from crm.cad_usuario where id = old.responsavel_id;
    if v_email_ant is not null then
      insert into agenda.mov_convite (empresa_id, compromisso_id, usuario_id, email, metodo, sequencia)
      values (new.empresa_id, new.id, old.responsavel_id, v_email_ant, 'CANCEL', v_seq);
    end if;
  end if;

  if v_email is null then return null; end if;
  if new.estado in ('resolvido','encerrado','cancelado') and old.estado in ('pendente','aguardando_cliente') then
    insert into agenda.mov_convite (empresa_id, compromisso_id, usuario_id, email, metodo, sequencia)
    values (new.empresa_id, new.id, new.responsavel_id, v_email, 'CANCEL', v_seq);
  elsif new.estado in ('pendente','aguardando_cliente') and (
        new.inicio_em is distinct from old.inicio_em or new.fim_em is distinct from old.fim_em
     or new.titulo is distinct from old.titulo or new.dia_inteiro is distinct from old.dia_inteiro
     or new.responsavel_id is distinct from old.responsavel_id or new.lembrete_min is distinct from old.lembrete_min
     or old.estado in ('resolvido','encerrado','cancelado')) then
    insert into agenda.mov_convite (empresa_id, compromisso_id, usuario_id, email, metodo, sequencia)
    values (new.empresa_id, new.id, new.responsavel_id, v_email, 'REQUEST', v_seq);
  end if;
  return null;
end $$;

-- A sequência do convite sobe a cada mudança relevante (o calendário só aceita atualização com SEQUENCE maior)
create function agenda._antes_compromisso() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and (new.inicio_em, new.fim_em, new.titulo, new.dia_inteiro, new.responsavel_id, new.estado, new.lembrete_min)
       is distinct from (old.inicio_em, old.fim_em, old.titulo, old.dia_inteiro, old.responsavel_id, old.estado, old.lembrete_min) then
    new.convite_seq := old.convite_seq + 1;
  end if;
  return new;
end $$;

create trigger antes_salvar before insert or update on agenda.mov_compromisso
  for each row execute function agenda._antes_compromisso();
create trigger convite after insert or update on agenda.mov_compromisso
  for each row execute function agenda._apos_compromisso();

-- Envio pelo Resend (mesma chave e remetente dos alertas). Roda no pg_cron a cada minuto.
create function agenda.job_enviar_convites() returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text; c record; v_comp agenda.mov_compromisso; v_rem text; v_ics text; v_req bigint;
begin
  update agenda.mov_convite m set enviado_em = now(), erro = null, req_id = null
    from net._http_response h where h.id = m.req_id and m.enviado_em is null and h.status_code between 200 and 299;
  update agenda.mov_convite m set tentativas = m.tentativas + 1, req_id = null,
         erro = left(coalesce(h.status_code::text, h.error_msg, 'sem resposta') || ' ' || coalesce(left(h.content, 150), ''), 250)
    from net._http_response h where h.id = m.req_id and m.enviado_em is null and not (coalesce(h.status_code, 0) between 200 and 299);
  update agenda.mov_convite set req_id = null, tentativas = tentativas + 1, erro = 'sem resposta'
   where enviado_em is null and req_id is not null and ultima_tentativa < now() - interval '5 minutes'
     and not exists (select 1 from net._http_response h where h.id = req_id);

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'email_resend_api_key';
  if v_key is null then return; end if;

  for c in select * from agenda.mov_convite
            where enviado_em is null and req_id is null and tentativas < 5
              and (ultima_tentativa is null or ultima_tentativa < now() - interval '5 minutes')
            order by id limit 10 loop
    -- convite superado por um mais novo do mesmo compromisso e pessoa: descarta
    if exists (select 1 from agenda.mov_convite n where n.compromisso_id = c.compromisso_id and n.usuario_id = c.usuario_id and n.id > c.id) then
      update agenda.mov_convite set enviado_em = now(), erro = 'superado' where id = c.id;
      continue;
    end if;
    select * into v_comp from agenda.mov_compromisso where id = c.compromisso_id;
    select remetente into v_rem from engine.cfg_alerta where empresa_id = c.empresa_id and ativo;
    if v_rem is null then continue; end if;
    v_ics := agenda._ics(v_comp, c.metodo, c.sequencia, c.email, coalesce(substring(v_rem from '<([^>]+)>'), btrim(v_rem)));
    v_req := net.http_post(url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', v_rem, 'to', jsonb_build_array(c.email),
        'subject', case c.metodo when 'CANCEL' then 'Cancelado: ' else 'Compromisso: ' end || v_comp.titulo
                   || ' · ' || to_char(v_comp.inicio_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
        'text', 'Compromisso da agenda do CRM Ane Brechó. Abra o anexo para adicionar ao seu calendário.',
        'attachments', jsonb_build_array(jsonb_build_object(
            'filename', 'compromisso.ics',
            'content', replace(encode(convert_to(v_ics, 'UTF8'), 'base64'), E'\n', ''),
            'content_type', 'text/calendar; charset=utf-8; method=' || c.metodo))),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      timeout_milliseconds := 15000);
    update agenda.mov_convite set req_id = v_req, ultima_tentativa = now() where id = c.id;
  end loop;
end $$;
revoke all on function agenda.job_enviar_convites() from public, anon, authenticated;

select cron.schedule('agenda-enviar-convites', '* * * * *', 'select agenda.job_enviar_convites()');

-- ---------------------------------------------------------------------------
-- 5. API do painel
-- Decisão 1 (25/11): todos os papéis operacionais criam e atribuem compromissos entre si.
-- ---------------------------------------------------------------------------
create function api._agenda_editores() returns text[]
language sql immutable set search_path = '' as $$
  select array['admin','gestor','apresentadora','suporte','expedicao','financeiro']
$$;

create function api._agenda_json(c agenda.mov_compromisso) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'tipo', c.tipo_codigo, 'tipo_nome', t.nome, 'cor', t.cor,
    'exige_interacao_cliente', t.exige_interacao_cliente,
    'titulo', c.titulo, 'descricao', c.descricao,
    'inicio_em', c.inicio_em, 'fim_em', c.fim_em, 'dia_inteiro', c.dia_inteiro,
    'prioridade', c.prioridade, 'estado', c.estado,
    'atrasado', c.estado in ('pendente','aguardando_cliente') and coalesce(c.fim_em, c.inicio_em) < now(),
    'responsavel_id', c.responsavel_id, 'responsavel_nome', u.nome,
    'criado_por_nome', cp.nome,
    'cliente_id', c.cliente_id, 'cliente_nome', cl.nome,
    'pedido_id', c.pedido_id, 'devolucao_id', c.devolucao_id, 'conversa_id', c.conversa_id, 'live_id', c.live_id,
    'desfecho', c.desfecho, 'motivo_encerramento', c.motivo_encerramento, 'concluido_em', c.concluido_em,
    'origem_regra', c.origem_regra, 'lembrete_min', c.lembrete_min,
    'qtd_tentativas', (select count(*) from agenda.mov_interacao i where i.compromisso_id = c.id and i.tipo = 'tentativa'),
    'teve_resposta', exists (select 1 from agenda.mov_interacao i where i.compromisso_id = c.id and i.tipo = 'resposta_cliente'))
  from agenda.cad_tipo t
  left join crm.cad_usuario u on u.id = c.responsavel_id
  left join crm.cad_usuario cp on cp.id = c.criado_por
  left join crm.cad_cliente cl on cl.id = c.cliente_id
  where t.codigo = c.tipo_codigo
$$;
revoke all on function api._agenda_json(agenda.mov_compromisso) from public, anon, authenticated;

-- Calendário (mês/semana)
create function api.agenda_listar(p_empresa uuid, p_de timestamptz, p_ate timestamptz,
                                  p_responsavel uuid default null, p_tipos text[] default null,
                                  p_incluir_concluidos boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._agenda_editores() || array['leitura']);
  if p_ate - p_de > interval '62 days' then raise exception 'período máximo de 62 dias'; end if;
  return coalesce((
    select jsonb_agg(api._agenda_json(c) order by c.inicio_em)
      from agenda.mov_compromisso c
     where c.empresa_id = p_empresa and c.inicio_em >= p_de and c.inicio_em < p_ate
       and (p_responsavel is null or c.responsavel_id = p_responsavel)
       and (p_tipos is null or c.tipo_codigo = any (p_tipos))
       and (p_incluir_concluidos or c.estado in ('pendente','aguardando_cliente'))), '[]'::jsonb);
end $$;

-- "Minha fila de hoje": atrasados, hoje, aguardando cliente e próximos 7 dias
create function api.agenda_minha_fila(p_empresa uuid, p_usuario uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_u uuid := coalesce(p_usuario, (select auth.uid()));
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        v_ini timestamptz := (v_hoje::timestamp at time zone 'America/Sao_Paulo');
begin
  perform api._exigir(p_empresa, api._agenda_editores() || array['leitura']);
  return jsonb_build_object(
    'atrasados', coalesce((select jsonb_agg(api._agenda_json(c) order by c.inicio_em) from agenda.mov_compromisso c
       where c.empresa_id = p_empresa and c.responsavel_id = v_u and c.estado = 'pendente' and coalesce(c.fim_em, c.inicio_em) < v_ini), '[]'),
    'hoje', coalesce((select jsonb_agg(api._agenda_json(c) order by c.inicio_em) from agenda.mov_compromisso c
       where c.empresa_id = p_empresa and c.responsavel_id = v_u and c.estado = 'pendente'
         and c.inicio_em < v_ini + interval '1 day' and coalesce(c.fim_em, c.inicio_em) >= v_ini), '[]'),
    'aguardando_cliente', coalesce((select jsonb_agg(api._agenda_json(c) order by c.inicio_em) from agenda.mov_compromisso c
       where c.empresa_id = p_empresa and c.responsavel_id = v_u and c.estado = 'aguardando_cliente'), '[]'),
    'proximos', coalesce((select jsonb_agg(api._agenda_json(c) order by c.inicio_em) from agenda.mov_compromisso c
       where c.empresa_id = p_empresa and c.responsavel_id = v_u and c.estado = 'pendente'
         and c.inicio_em >= v_ini + interval '1 day' and c.inicio_em < v_ini + interval '8 days'), '[]'));
end $$;

-- Pessoas que podem receber compromisso
create function api.agenda_responsaveis(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._agenda_editores() || array['leitura']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'tem_email', u.email is not null) order by u.nome)
    from crm.cad_usuario u
   where u.ativo and exists (select 1 from crm.rel_usuario_empresa r where r.usuario_id = u.id and r.empresa_id = p_empresa and r.ativo)), '[]');
end $$;

create function api.agenda_tipos()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_agg(jsonb_build_object('codigo', codigo, 'nome', nome, 'cor', cor,
                   'exige_interacao_cliente', exige_interacao_cliente) order by ordem) from agenda.cad_tipo
$$;

-- Criar ou editar (p_dados.id presente = editar)
create function api.agenda_salvar(p_empresa uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_dados ->> 'id', '')::uuid; v_resp uuid; v_atual agenda.mov_compromisso;
begin
  perform api._exigir(p_empresa, api._agenda_editores());
  v_resp := coalesce(nullif(p_dados ->> 'responsavel_id', '')::uuid, (select auth.uid()));
  if not exists (select 1 from crm.rel_usuario_empresa r join crm.cad_usuario u on u.id = r.usuario_id
                  where r.usuario_id = v_resp and r.empresa_id = p_empresa and r.ativo and u.ativo) then
    raise exception 'responsável não pertence à empresa';
  end if;
  -- vínculos precisam ser da mesma empresa
  if (nullif(p_dados ->> 'cliente_id','') is not null and not exists
        (select 1 from crm.cad_cliente where id = (p_dados ->> 'cliente_id')::uuid and empresa_id = p_empresa))
  or (nullif(p_dados ->> 'pedido_id','') is not null and not exists
        (select 1 from venda.mov_pedido where id = (p_dados ->> 'pedido_id')::uuid and empresa_id = p_empresa))
  or (nullif(p_dados ->> 'devolucao_id','') is not null and not exists
        (select 1 from pos_venda.mov_devolucao where id = (p_dados ->> 'devolucao_id')::uuid and empresa_id = p_empresa))
  or (nullif(p_dados ->> 'conversa_id','') is not null and not exists
        (select 1 from atendimento.mov_conversa where id = (p_dados ->> 'conversa_id')::uuid and empresa_id = p_empresa))
  or (nullif(p_dados ->> 'live_id','') is not null and not exists
        (select 1 from live.mov_live where id = (p_dados ->> 'live_id')::uuid and empresa_id = p_empresa)) then
    raise exception 'vínculo inválido';
  end if;

  if v_id is null then
    insert into agenda.mov_compromisso (empresa_id, tipo_codigo, titulo, descricao, inicio_em, fim_em, dia_inteiro,
        prioridade, responsavel_id, criado_por, cliente_id, pedido_id, devolucao_id, conversa_id, live_id, lembrete_min)
    values (p_empresa, p_dados ->> 'tipo', btrim(p_dados ->> 'titulo'), nullif(p_dados ->> 'descricao', ''),
        (p_dados ->> 'inicio_em')::timestamptz, nullif(p_dados ->> 'fim_em', '')::timestamptz,
        coalesce((p_dados ->> 'dia_inteiro')::boolean, false), coalesce(p_dados ->> 'prioridade', 'normal'),
        v_resp, (select auth.uid()),
        nullif(p_dados ->> 'cliente_id','')::uuid, nullif(p_dados ->> 'pedido_id','')::uuid,
        nullif(p_dados ->> 'devolucao_id','')::uuid, nullif(p_dados ->> 'conversa_id','')::uuid,
        nullif(p_dados ->> 'live_id','')::uuid,
        case when jsonb_typeof(p_dados -> 'lembrete_min') = 'array' then array(select jsonb_array_elements_text(p_dados -> 'lembrete_min')::int) end)
    returning id into v_id;
  else
    select * into v_atual from agenda.mov_compromisso where id = v_id and empresa_id = p_empresa for update;
    if not found then raise exception 'compromisso não encontrado'; end if;
    if v_atual.estado not in ('pendente','aguardando_cliente') then raise exception 'compromisso já concluído; reabra antes de editar'; end if;
    update agenda.mov_compromisso set
      tipo_codigo = coalesce(p_dados ->> 'tipo', tipo_codigo),
      titulo = coalesce(btrim(p_dados ->> 'titulo'), titulo),
      descricao = case when p_dados ? 'descricao' then nullif(p_dados ->> 'descricao', '') else descricao end,
      inicio_em = coalesce((p_dados ->> 'inicio_em')::timestamptz, inicio_em),
      fim_em = case when p_dados ? 'fim_em' then nullif(p_dados ->> 'fim_em', '')::timestamptz else fim_em end,
      dia_inteiro = coalesce((p_dados ->> 'dia_inteiro')::boolean, dia_inteiro),
      prioridade = coalesce(p_dados ->> 'prioridade', prioridade),
      responsavel_id = case when p_dados ? 'responsavel_id' then v_resp else responsavel_id end,
      cliente_id = case when p_dados ? 'cliente_id' then nullif(p_dados ->> 'cliente_id','')::uuid else cliente_id end,
      pedido_id = case when p_dados ? 'pedido_id' then nullif(p_dados ->> 'pedido_id','')::uuid else pedido_id end,
      devolucao_id = case when p_dados ? 'devolucao_id' then nullif(p_dados ->> 'devolucao_id','')::uuid else devolucao_id end,
      conversa_id = case when p_dados ? 'conversa_id' then nullif(p_dados ->> 'conversa_id','')::uuid else conversa_id end,
      live_id = case when p_dados ? 'live_id' then nullif(p_dados ->> 'live_id','')::uuid else live_id end,
      lembrete_min = case when p_dados ? 'lembrete_min' then
        case when jsonb_typeof(p_dados -> 'lembrete_min') = 'array' then array(select jsonb_array_elements_text(p_dados -> 'lembrete_min')::int) end
        else lembrete_min end
    where id = v_id;
  end if;
  return v_id;
end $$;

-- Registrar tentativa de contato, resposta da cliente ou nota.
-- Tentativa leva o compromisso para 'aguardando_cliente'; resposta volta para 'pendente' (a equipe decide o desfecho).
create function api.agenda_registrar_interacao(p_empresa uuid, p_compromisso uuid, p_tipo text,
                                               p_canal text default null, p_texto text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_c agenda.mov_compromisso; v_id uuid;
begin
  perform api._exigir(p_empresa, api._agenda_editores());
  select * into v_c from agenda.mov_compromisso where id = p_compromisso and empresa_id = p_empresa for update;
  if not found then raise exception 'compromisso não encontrado'; end if;
  if v_c.estado not in ('pendente','aguardando_cliente') then raise exception 'compromisso já concluído'; end if;
  insert into agenda.mov_interacao (empresa_id, compromisso_id, tipo, canal, texto, registrado_por)
  values (p_empresa, p_compromisso, p_tipo, p_canal, nullif(btrim(p_texto), ''), (select auth.uid()))
  returning id into v_id;
  if p_tipo = 'tentativa' and v_c.estado = 'pendente' then
    update agenda.mov_compromisso set estado = 'aguardando_cliente' where id = p_compromisso;
  elsif p_tipo = 'resposta_cliente' and v_c.estado = 'aguardando_cliente' then
    update agenda.mov_compromisso set estado = 'pendente' where id = p_compromisso;
  end if;
  return v_id;
end $$;

-- Concluir. Decisão 2 (25/11): tipos que exigem interação da cliente só ficam 'resolvido'
-- com resposta da cliente registrada; sem resposta, só 'encerrado' com motivo
-- (ex.: 'sem_resposta' depois do número de tentativas configurado).
create function api.agenda_concluir(p_empresa uuid, p_compromisso uuid, p_estado text,
                                    p_desfecho text default null, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_c agenda.mov_compromisso; v_exige boolean; v_tent int; v_max int;
begin
  perform api._exigir(p_empresa, api._agenda_editores());
  if p_estado not in ('resolvido','encerrado','cancelado') then raise exception 'estado inválido'; end if;
  select * into v_c from agenda.mov_compromisso where id = p_compromisso and empresa_id = p_empresa for update;
  if not found then raise exception 'compromisso não encontrado'; end if;
  if v_c.estado not in ('pendente','aguardando_cliente') then raise exception 'compromisso já concluído'; end if;
  select exige_interacao_cliente into v_exige from agenda.cad_tipo where codigo = v_c.tipo_codigo;

  if p_estado = 'resolvido' then
    if nullif(btrim(p_desfecho), '') is null then raise exception 'informe o desfecho'; end if;
    if v_exige and not exists (select 1 from agenda.mov_interacao
                                where compromisso_id = p_compromisso and tipo = 'resposta_cliente') then
      raise exception 'registre a resposta da cliente antes de resolver, ou encerre com motivo';
    end if;
  else
    if nullif(btrim(p_motivo), '') is null then raise exception 'informe o motivo'; end if;
    if p_estado = 'encerrado' and v_exige and p_motivo = 'sem_resposta' then
      select count(*) into v_tent from agenda.mov_interacao where compromisso_id = p_compromisso and tipo = 'tentativa';
      select coalesce(max_tentativas_sem_resposta, 3) into v_max from agenda.cfg_agenda where empresa_id = p_empresa;
      if v_tent < coalesce(v_max, 3) then
        raise exception 'encerrar por falta de resposta exige % tentativas registradas (há %)', coalesce(v_max, 3), v_tent;
      end if;
    end if;
  end if;

  update agenda.mov_compromisso
     set estado = p_estado, desfecho = nullif(btrim(p_desfecho), ''), motivo_encerramento = nullif(btrim(p_motivo), ''),
         concluido_em = now(), concluido_por = (select auth.uid())
   where id = p_compromisso;
end $$;

-- Reabrir (com motivo, fica na auditoria)
create function api.agenda_reabrir(p_empresa uuid, p_compromisso uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._agenda_editores());
  if nullif(btrim(p_motivo), '') is null then raise exception 'informe o motivo'; end if;
  update agenda.mov_compromisso
     set estado = 'pendente', concluido_em = null, concluido_por = null, desfecho = null,
         motivo_encerramento = null
   where id = p_compromisso and empresa_id = p_empresa and estado in ('resolvido','encerrado','cancelado');
  if not found then raise exception 'compromisso não encontrado ou ainda aberto'; end if;
  insert into agenda.mov_interacao (empresa_id, compromisso_id, tipo, texto, registrado_por)
  values (p_empresa, p_compromisso, 'nota', 'Reaberto: ' || btrim(p_motivo), (select auth.uid()));
end $$;

-- Linha do tempo do compromisso
create function api.agenda_interacoes(p_empresa uuid, p_compromisso uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._agenda_editores() || array['leitura']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tipo', i.tipo, 'canal', i.canal, 'texto', i.texto,
            'registrado_por', u.nome, 'registrado_em', i.registrado_em) order by i.registrado_em)
    from agenda.mov_interacao i left join crm.cad_usuario u on u.id = i.registrado_por
   where i.compromisso_id = p_compromisso and i.empresa_id = p_empresa), '[]');
end $$;

create function api.agenda_obter_config(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, api._agenda_editores() || array['leitura']);
  return (select to_jsonb(c) - 'empresa_id' from agenda.cfg_agenda c where c.empresa_id = p_empresa);
end $$;

-- Configuração (admin e gestor)
create function api.agenda_salvar_config(p_empresa uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  insert into agenda.cfg_agenda (empresa_id) values (p_empresa) on conflict do nothing;
  update agenda.cfg_agenda set
    enviar_convite = coalesce((p_dados ->> 'enviar_convite')::boolean, enviar_convite),
    lembrete_padrao_min = case when jsonb_typeof(p_dados -> 'lembrete_padrao_min') = 'array'
      then array(select jsonb_array_elements_text(p_dados -> 'lembrete_padrao_min')::int) else lembrete_padrao_min end,
    duracao_padrao_min = coalesce((p_dados ->> 'duracao_padrao_min')::int, duracao_padrao_min),
    nome_cliente_no_convite = coalesce((p_dados ->> 'nome_cliente_no_convite')::boolean, nome_cliente_no_convite),
    max_tentativas_sem_resposta = coalesce((p_dados ->> 'max_tentativas_sem_resposta')::int, max_tentativas_sem_resposta),
    atualizado_em = now()
  where empresa_id = p_empresa;
end $$;

-- Permissões de execução: só usuários autenticados; a checagem real é o _exigir
do $$
declare f record;
begin
  for f in select p.oid::regprocedure s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname like 'agenda\_%' loop
    execute format('revoke all on function %s from public, anon', f.s);
    execute format('grant execute on function %s to authenticated', f.s);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Dados iniciais e matriz de permissões (decisão 1)
-- ---------------------------------------------------------------------------
insert into agenda.cfg_agenda (empresa_id) select id from crm.cad_empresa on conflict do nothing;

update crm.cfg_permissao_tela set nivel = 'editar', atualizado_em = now()
 where tela = 'agenda' and papel in ('suporte','expedicao','financeiro');
-- PENDENTE: ajustar também api._semear_permissoes para empresas novas nascerem com esse padrão.

-- 0088b_agenda_obter (aplicada em seguida): leitura de um compromisso pelo id (link do convite)
create function api.agenda_obter(p_empresa uuid, p_compromisso uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform api._exigir(p_empresa, api._agenda_editores() || array['leitura']);
  select api._agenda_json(c) into r from agenda.mov_compromisso c where c.id = p_compromisso and c.empresa_id = p_empresa;
  if r is null then raise exception 'compromisso não encontrado'; end if;
  return r;
end $$;
revoke all on function api.agenda_obter(uuid, uuid) from public, anon;
grant execute on function api.agenda_obter(uuid, uuid) to authenticated;
