-- 0014: IA (Gemini para resposta, Voyage para vetor), configuração do assistente e permissões por tela
-- Princípios: segredo só no Vault (mesmo caminho da 0012); o painel nunca lê segredo; mudar parâmetro ou chave volta o modo
-- para 'desligado'. Nada aqui escreve em sistema externo (D12). Permissão por tela: a matriz controla o que o painel mostra
-- e é consultável no banco (api.pode_tela); nas telas atuais o banco mantém as regras fixas por papel (a matriz só restringe).

-- ---------------------------------------------------------------- 1. integrações de IA
alter table engine.cfg_integracao drop constraint cfg_integracao_integracao_check;
alter table engine.cfg_integracao add constraint cfg_integracao_integracao_check
  check (integracao in ('meta_dm','meta_live','bling','gateway','whatsapp','nfe','facebook','ia_chat','ia_embedding'));

insert into engine.cfg_integracao (empresa_id, integracao)
select e.id, x from crm.cad_empresa e cross join unnest(array['ia_chat','ia_embedding']) x on conflict do nothing;

create or replace function engine._chaves_param(p_integracao text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_integracao
    when 'bling'        then array['client_id','empresa_id_bling']
    when 'meta_live'    then array['app_id','instagram_user_id','api_version']
    when 'meta_dm'      then array['app_id','instagram_user_id','api_version']
    when 'facebook'     then array['app_id','page_id','api_version']
    when 'whatsapp'     then array['waba_id','phone_number_id','api_version']
    when 'gateway'      then array['provedor','merchant_id']
    when 'ia_chat'      then array['provedor','modelo']
    when 'ia_embedding' then array['provedor','modelo']
    else '{}'::text[] end $$;

create or replace function engine._segredos_painel(p_integracao text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_integracao
    when 'bling'        then array['client_secret']
    when 'meta_live'    then array['app_secret','access_token','verify_token']
    when 'meta_dm'      then array['app_secret','access_token','verify_token']
    when 'facebook'     then array['app_secret','page_token','verify_token']
    when 'whatsapp'     then array['access_token','app_secret','verify_token']
    when 'gateway'      then array['api_key','webhook_secret']
    when 'ia_chat'      then array['api_key']
    when 'ia_embedding' then array['api_key']
    else '{}'::text[] end $$;

-- mesma função da 0012, com a validação de provedor e de nome de modelo (o nome entra na URL da chamada ao provedor)
create or replace function api.salvar_integracao(p_empresa uuid, p_integracao text, p_parametros jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb; v_txt text; v_ok text[]; v_novo jsonb := '{}'::jsonb; v_bling text; v_ig text;
begin
  perform api._exigir(p_empresa, array['admin']);
  v_ok := engine._chaves_param(p_integracao);
  if cardinality(v_ok) = 0 then raise exception 'integração não configurável: %', p_integracao using errcode = '22023'; end if;
  if p_parametros is null or jsonb_typeof(p_parametros) <> 'object' then
    raise exception 'parâmetros inválidos' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p_parametros) loop
    if not (k = any (v_ok)) then raise exception 'campo não permitido: %', k using errcode = '22023'; end if;
    if jsonb_typeof(v) not in ('string','null') then raise exception 'valor inválido em %', k using errcode = '22023'; end if;
    v_txt := nullif(trim(v #>> '{}'), '');
    if v_txt is not null and length(v_txt) > 200 then raise exception 'valor longo demais em %', k using errcode = '22023'; end if;
    if v_txt is not null and v_txt ~ '[\r\n]' then raise exception 'valor inválido em %', k using errcode = '22023'; end if;
    if k = 'provedor' and v_txt is not null then
      if p_integracao = 'ia_chat' and v_txt <> 'google_gemini' then
        raise exception 'provedor de resposta não suportado: %', v_txt using errcode = '22023'; end if;
      if p_integracao = 'ia_embedding' and v_txt not in ('voyage','google_gemini') then
        raise exception 'provedor de vetor não suportado: %', v_txt using errcode = '22023'; end if;
    end if;
    if k = 'modelo' and v_txt is not null and v_txt !~ '^[A-Za-z0-9._-]{1,80}$' then
      raise exception 'nome de modelo inválido (use letras, números, ponto, hífen e sublinhado)' using errcode = '22023'; end if;
    if k = 'empresa_id_bling' then v_bling := v_txt;
    elsif k = 'instagram_user_id' then v_ig := v_txt;
    elsif v_txt is not null then v_novo := v_novo || jsonb_build_object(k, v_txt);
    end if;
  end loop;
  if v_bling is not null and v_bling !~ '^[0-9]+$' then raise exception 'ID da empresa no Bling deve ser numérico' using errcode = '22023'; end if;
  if v_ig is not null and v_ig !~ '^[0-9]+$' then raise exception 'ID da conta do Instagram deve ser numérico' using errcode = '22023'; end if;
  if p_parametros ? 'empresa_id_bling' then
    update crm.cad_empresa set bling_empresa_id_esperado = v_bling where id = p_empresa; end if;
  if p_parametros ? 'instagram_user_id' then
    update crm.cad_empresa set instagram_user_id_esperado = v_ig where id = p_empresa; end if;
  update engine.cfg_integracao set
     parametros = (parametros - (select coalesce(array_agg(key), '{}'::text[]) from jsonb_each(p_parametros)
                                  where nullif(trim(value #>> '{}'), '') is null)) || v_novo,
     status = 'configurada', ultimo_teste_ok = null, ultimo_teste_em = null, ultimo_teste_resumo = null,
     modo = 'desligado', atualizado_em = now(), atualizado_por = (select auth.uid())
   where empresa_id = p_empresa and integracao = p_integracao;
  if not found then raise exception 'integração não encontrada' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------- 2. configuração do assistente (por empresa)
create table engine.cfg_assistente (
  empresa_id uuid primary key references crm.cad_empresa(id) on delete cascade,
  retencao_dias int not null default 90 check (retencao_dias between 7 and 3650),
  usar_whatsapp boolean not null default true,
  usar_instagram_dm boolean not null default true,
  exigir_consentimento boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table engine.cfg_assistente enable row level security;
revoke all on engine.cfg_assistente from public, anon, authenticated;
create trigger auditoria after insert or update or delete on engine.cfg_assistente
  for each row execute function audit.registrar();
insert into engine.cfg_assistente (empresa_id) select id from crm.cad_empresa on conflict do nothing;

create function api.obter_config_assistente(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  return coalesce((
    select jsonb_build_object('retencao_dias', retencao_dias, 'usar_whatsapp', usar_whatsapp,
             'usar_instagram_dm', usar_instagram_dm, 'exigir_consentimento', exigir_consentimento, 'atualizado_em', atualizado_em)
      from engine.cfg_assistente where empresa_id = p_empresa),
    jsonb_build_object('retencao_dias', 90, 'usar_whatsapp', true, 'usar_instagram_dm', true,
                       'exigir_consentimento', true, 'atualizado_em', null));
end $$;

create function api.salvar_config_assistente(p_empresa uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb; v_dias int; v_wa boolean; v_dm boolean; v_cons boolean;
begin
  perform api._exigir(p_empresa, array['admin']);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p_dados) loop
    if k = 'retencao_dias' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,4}$' then
        raise exception 'a retenção deve ser um número inteiro de dias' using errcode = '22023'; end if;
      v_dias := (v #>> '{}')::int;
      if v_dias < 7 or v_dias > 3650 then raise exception 'a retenção deve ficar entre 7 e 3650 dias' using errcode = '22023'; end if;
    elsif k in ('usar_whatsapp','usar_instagram_dm','exigir_consentimento') then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'valor inválido em %', k using errcode = '22023'; end if;
      if k = 'usar_whatsapp' then v_wa := (v #>> '{}')::boolean;
      elsif k = 'usar_instagram_dm' then v_dm := (v #>> '{}')::boolean;
      else v_cons := (v #>> '{}')::boolean; end if;
    else
      raise exception 'campo não permitido: %', k using errcode = '22023';
    end if;
  end loop;
  insert into engine.cfg_assistente as c (empresa_id, retencao_dias, usar_whatsapp, usar_instagram_dm, exigir_consentimento, atualizado_por)
  values (p_empresa, coalesce(v_dias, 90), coalesce(v_wa, true), coalesce(v_dm, true), coalesce(v_cons, true), (select auth.uid()))
  on conflict (empresa_id) do update set
     retencao_dias = coalesce(v_dias, c.retencao_dias), usar_whatsapp = coalesce(v_wa, c.usar_whatsapp),
     usar_instagram_dm = coalesce(v_dm, c.usar_instagram_dm), exigir_consentimento = coalesce(v_cons, c.exigir_consentimento),
     atualizado_em = now(), atualizado_por = (select auth.uid());
end $$;

-- ---------------------------------------------------------------- 3. permissões por tela
create table crm.cad_tela (
  tela text primary key check (tela ~ '^[a-z_]{2,40}$'),
  rotulo text not null,
  grupo text not null,
  ordem int not null,
  situacao text not null check (situacao in ('ativa','planejada')),
  nivel_max text not null default 'editar' check (nivel_max in ('nenhum','ver','editar')),
  aplicacao text not null default 'tela' check (aplicacao in ('tela','tela_e_banco')),
  descricao text
);
create table crm.cfg_permissao_tela (
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  tela text not null references crm.cad_tela(tela) on update cascade,
  papel text not null check (papel in ('gestor','suporte','apresentadora','expedicao','financeiro','leitura')),
  nivel text not null check (nivel in ('nenhum','ver','editar')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (empresa_id, tela, papel)
);
alter table crm.cad_tela enable row level security;
alter table crm.cfg_permissao_tela enable row level security;
revoke all on crm.cad_tela, crm.cfg_permissao_tela from public, anon, authenticated;
create trigger auditoria after insert or update or delete on crm.cfg_permissao_tela
  for each row execute function audit.registrar();

-- catálogo completo: as telas que já existem e todas as previstas (o menu só mostra as ativas)
insert into crm.cad_tela (tela, rotulo, grupo, ordem, situacao, nivel_max, descricao) values
 ('pecas',           'Peças',                           'Catálogo',          10, 'ativa',     'editar', 'Cadastro de peças e grade'),
 ('estoque',         'Estoque',                         'Catálogo',          20, 'ativa',     'editar', 'Unidades físicas e locais'),
 ('clientes',        'Clientes',                        'Relacionamento',    30, 'ativa',     'editar', 'Cadastro e contato dos clientes'),
 ('atendimento',     'Central de atendimento',          'Relacionamento',    40, 'planejada', 'editar', 'Conversas de Instagram e WhatsApp'),
 ('pos_venda',       'Cancelamentos e devoluções',      'Relacionamento',    50, 'planejada', 'editar', 'Desistências e devoluções com motivo'),
 ('saneamento',      'Saneamento cadastral',            'Relacionamento',    60, 'planejada', 'editar', 'Duplicidades e dados inválidos vindos do Bling'),
 ('agenda',          'Agenda',                          'Live',              70, 'ativa',     'editar', 'Calendário de lives'),
 ('lives',           'Lives',                           'Live',              80, 'planejada', 'editar', 'Transmissões, itens e lances'),
 ('fila',            'Fila de espera',                  'Live',              90, 'planejada', 'editar', 'Clientes aguardando a peça'),
 ('reservas',        'Reservas',                        'Live',             100, 'planejada', 'editar', 'Reservas ativas, prazos e expiração'),
 ('cobrancas',       'Cobranças e links de pagamento',  'Live',             110, 'planejada', 'editar', 'Links enviados e pagamentos'),
 ('pedidos',         'Pedidos',                         'Vendas e expedição',120, 'planejada', 'editar', 'Pedidos criados após o pagamento'),
 ('envios',          'Envios e rastreio',               'Vendas e expedição',130, 'planejada', 'editar', 'Etiquetas e código de rastreio'),
 ('contas_receber',  'Contas a receber',                'Financeiro',       140, 'planejada', 'editar', 'Recebimentos e baixas'),
 ('contas_pagar',    'Contas a pagar',                  'Financeiro',       150, 'planejada', 'editar', 'Fretes, comissões e tarifas'),
 ('conciliacao',     'Conciliação',                     'Financeiro',       160, 'planejada', 'editar', 'Divergências entre CRM, gateway e Bling'),
 ('fiscal',          'Notas fiscais',                   'Financeiro',       170, 'planejada', 'editar', 'NF-e emitidas, rejeitadas e canceladas'),
 ('dashboards',      'Dashboards',                      'Inteligência',     180, 'planejada', 'ver',    'Indicadores de vendas, estoque e clientes'),
 ('assistente',      'Assistente de IA',                'Inteligência',     190, 'planejada', 'editar', 'Perguntas em linguagem natural sobre a operação'),
 ('conhecimento',    'Base de conhecimento',            'Inteligência',     200, 'planejada', 'editar', 'Documentos e regras usados pelo assistente'),
 ('locais',          'Locais',                          'Configuração',     210, 'ativa',     'editar', 'Locais de estoque'),
 ('integracoes',     'Integrações',                     'Configuração',     220, 'ativa',     'ver',    'Bling, Meta, WhatsApp e IA (alterar é só do administrador)'),
 ('lgpd',            'Solicitações do titular',         'Configuração',     230, 'planejada', 'editar', 'Pedidos de acesso, correção e exclusão de dados'),
 ('auditoria',       'Auditoria',                       'Configuração',     240, 'planejada', 'ver',    'Histórico de alterações'),
 ('usuarios',        'Usuários e acessos',              'Configuração',     250, 'planejada', 'nenhum', 'Só o administrador'),
 ('permissoes',      'Permissões',                      'Configuração',     260, 'ativa',     'nenhum', 'Só o administrador');

create function crm._rank_nivel(p text) returns int language sql immutable set search_path = '' as $$
  select case p when 'editar' then 2 when 'ver' then 1 else 0 end $$;

-- padrão inicial por tela e papel (o que não está listado é 'nenhum'). Espelha as regras fixas das telas atuais.
create function crm._padrao_nivel(p_tela text, p_papel text) returns text
language sql immutable set search_path = '' as $$
  select coalesce((select v.n from (values
    ('pecas','gestor','editar'),('pecas','suporte','ver'),('pecas','apresentadora','ver'),('pecas','expedicao','ver'),('pecas','financeiro','ver'),('pecas','leitura','ver'),
    ('estoque','gestor','editar'),('estoque','expedicao','editar'),('estoque','suporte','ver'),('estoque','apresentadora','ver'),('estoque','financeiro','ver'),('estoque','leitura','ver'),
    ('clientes','gestor','editar'),('clientes','suporte','editar'),('clientes','apresentadora','ver'),('clientes','expedicao','ver'),('clientes','financeiro','ver'),('clientes','leitura','ver'),
    ('agenda','gestor','editar'),('agenda','apresentadora','editar'),('agenda','suporte','ver'),('agenda','expedicao','ver'),('agenda','financeiro','ver'),('agenda','leitura','ver'),
    ('locais','gestor','editar'),('locais','suporte','ver'),('locais','apresentadora','ver'),('locais','expedicao','ver'),('locais','financeiro','ver'),('locais','leitura','ver'),
    ('integracoes','gestor','ver'),
    ('atendimento','gestor','editar'),('atendimento','suporte','editar'),('atendimento','leitura','ver'),
    ('pos_venda','gestor','editar'),('pos_venda','suporte','editar'),('pos_venda','financeiro','ver'),('pos_venda','leitura','ver'),
    ('saneamento','gestor','editar'),('saneamento','suporte','ver'),
    ('lives','gestor','editar'),('lives','apresentadora','editar'),('lives','suporte','ver'),('lives','expedicao','ver'),('lives','leitura','ver'),
    ('fila','gestor','editar'),('fila','suporte','editar'),('fila','apresentadora','editar'),('fila','leitura','ver'),
    ('reservas','gestor','editar'),('reservas','suporte','editar'),('reservas','apresentadora','editar'),('reservas','leitura','ver'),
    ('cobrancas','gestor','editar'),('cobrancas','suporte','editar'),('cobrancas','financeiro','ver'),('cobrancas','leitura','ver'),
    ('pedidos','gestor','editar'),('pedidos','suporte','ver'),('pedidos','expedicao','ver'),('pedidos','financeiro','ver'),('pedidos','leitura','ver'),
    ('envios','gestor','editar'),('envios','expedicao','editar'),('envios','suporte','ver'),('envios','leitura','ver'),
    ('contas_receber','gestor','ver'),('contas_receber','financeiro','editar'),
    ('contas_pagar','gestor','ver'),('contas_pagar','financeiro','editar'),
    ('conciliacao','gestor','ver'),('conciliacao','financeiro','editar'),
    ('fiscal','gestor','ver'),('fiscal','financeiro','editar'),
    ('dashboards','gestor','ver'),('dashboards','financeiro','ver'),('dashboards','leitura','ver'),
    ('assistente','gestor','editar'),('assistente','suporte','ver'),('assistente','financeiro','ver'),
    ('conhecimento','gestor','editar'),('conhecimento','suporte','ver'),
    ('lgpd','gestor','editar'),('lgpd','suporte','ver'),
    ('auditoria','gestor','ver')
  ) v(t, p, n) where v.t = p_tela and v.p = p_papel), 'nenhum') $$;

create function crm._semear_permissoes(p_empresa uuid) returns void
language sql security definer set search_path = '' as $$
  insert into crm.cfg_permissao_tela (empresa_id, tela, papel, nivel)
  select p_empresa, t.tela, r.papel, crm._padrao_nivel(t.tela, r.papel)
    from crm.cad_tela t cross join unnest(array['gestor','suporte','apresentadora','expedicao','financeiro','leitura']) r(papel)
  on conflict do nothing $$;

select crm._semear_permissoes(id) from crm.cad_empresa;

-- o provisionamento passa a criar também as integrações de IA, a configuração do assistente e a matriz padrão
create or replace function crm.provisionar_empresa(p_empresa uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into crm.cfg_empresa (empresa_id) values (p_empresa) on conflict do nothing;
  insert into engine.cfg_integracao (empresa_id, integracao)
  select p_empresa, x from unnest(array['meta_dm','meta_live','bling','gateway','whatsapp','nfe','facebook','ia_chat','ia_embedding']) x
  on conflict do nothing;
  insert into engine.cfg_assistente (empresa_id) values (p_empresa) on conflict do nothing;
  perform crm._semear_permissoes(p_empresa);
end $$;

-- nível efetivo do usuário logado numa tela: admin e superadmin sempre 'editar'; os demais, o maior nível entre os papéis ativos
create function api.nivel_tela(p_empresa uuid, p_tela text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when (select api.tem_papel(p_empresa, array['admin'])) then 'editar'
    else coalesce((
      select case max(crm._rank_nivel(p.nivel)) when 2 then 'editar' when 1 then 'ver' else 'nenhum' end
        from crm.cfg_permissao_tela p
        join crm.rel_usuario_empresa r on r.empresa_id = p.empresa_id and r.papel = p.papel
       where p.empresa_id = p_empresa and p.tela = p_tela and r.usuario_id = (select auth.uid()) and r.ativo), 'nenhum')
  end $$;

create function api.pode_tela(p_empresa uuid, p_tela text, p_nivel text default 'ver') returns boolean
language sql stable security definer set search_path = '' as $$
  select crm._rank_nivel((select api.nivel_tela(p_empresa, p_tela))) >= crm._rank_nivel(p_nivel) and p_nivel in ('ver','editar') $$;

create function api.minhas_permissoes(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','leitura']);
  return coalesce((select jsonb_object_agg(t.tela, (select api.nivel_tela(p_empresa, t.tela))) from crm.cad_tela t), '{}'::jsonb);
end $$;

create function api.listar_permissoes(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin']);
  return jsonb_build_object(
    'papeis', to_jsonb(array['gestor','suporte','apresentadora','expedicao','financeiro','leitura']),
    'telas', coalesce((select jsonb_agg(to_jsonb(t) order by t.ordem)
                         from (select tela, rotulo, grupo, ordem, situacao, nivel_max, aplicacao, descricao from crm.cad_tela) t), '[]'::jsonb),
    'matriz', coalesce((select jsonb_object_agg(x.tela, x.m)
                          from (select tela, jsonb_object_agg(papel, nivel) m from crm.cfg_permissao_tela
                                 where empresa_id = p_empresa group by tela) x), '{}'::jsonb));
end $$;

create function api.salvar_permissoes(p_empresa uuid, p_itens jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare i jsonb; v_tela text; v_papel text; v_nivel text; v_max text; n int := 0;
begin
  perform api._exigir(p_empresa, array['admin']);
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  if jsonb_array_length(p_itens) > 500 then raise exception 'itens demais' using errcode = '22023'; end if;
  for i in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(i) <> 'object' then raise exception 'item inválido' using errcode = '22023'; end if;
    v_tela := i ->> 'tela'; v_papel := i ->> 'papel'; v_nivel := i ->> 'nivel';
    select nivel_max into v_max from crm.cad_tela where tela = v_tela;
    if v_max is null then raise exception 'tela desconhecida: %', coalesce(v_tela, '?') using errcode = '22023'; end if;
    if v_papel is null or v_papel not in ('gestor','suporte','apresentadora','expedicao','financeiro','leitura') then
      raise exception 'papel inválido: %', coalesce(v_papel, '?') using errcode = '22023'; end if;
    if v_nivel is null or v_nivel not in ('nenhum','ver','editar') then raise exception 'nível inválido' using errcode = '22023'; end if;
    if crm._rank_nivel(v_nivel) > crm._rank_nivel(v_max) then
      raise exception 'esta tela aceita no máximo o nível "%"', v_max using errcode = '22023'; end if;
    insert into crm.cfg_permissao_tela as c (empresa_id, tela, papel, nivel, atualizado_por)
    values (p_empresa, v_tela, v_papel, v_nivel, (select auth.uid()))
    on conflict (empresa_id, tela, papel) do update set nivel = excluded.nivel, atualizado_em = now(), atualizado_por = (select auth.uid())
      where c.nivel is distinct from excluded.nivel;
    n := n + 1;
  end loop;
  return n;
end $$;

create function api.restaurar_permissoes_padrao(p_empresa uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin']);
  delete from crm.cfg_permissao_tela where empresa_id = p_empresa;
  perform crm._semear_permissoes(p_empresa);
end $$;

-- ---------------------------------------------------------------- 4. privilégios
revoke all on function
  crm._rank_nivel(text), crm._padrao_nivel(text, text), crm._semear_permissoes(uuid),
  api.obter_config_assistente(uuid), api.salvar_config_assistente(uuid, jsonb),
  api.nivel_tela(uuid, text), api.pode_tela(uuid, text, text), api.minhas_permissoes(uuid),
  api.listar_permissoes(uuid), api.salvar_permissoes(uuid, jsonb), api.restaurar_permissoes_padrao(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  api.obter_config_assistente(uuid), api.salvar_config_assistente(uuid, jsonb),
  api.nivel_tela(uuid, text), api.pode_tela(uuid, text, text), api.minhas_permissoes(uuid),
  api.listar_permissoes(uuid), api.salvar_permissoes(uuid, jsonb), api.restaurar_permissoes_padrao(uuid)
  to authenticated;
