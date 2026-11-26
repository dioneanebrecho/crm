-- 0095a (pedido 050): tela "Fluxo do processo". Etapas do processo da operação no banco, editáveis por quem tem nível
-- editar na tela, com revisão automática (cópia completa) a cada alteração, e comentários da equipe por etapa.
-- Acesso pela camada de permissões das demais telas (crm.cad_tela + crm.cfg_permissao_tela + api.nivel_tela).

-- papéis do PROCESSO (comprador, conferente...). Não são os papéis de acesso; uma pessoa pode exercer vários.
create table crm.cad_fluxo_funcao (
  empresa_id uuid not null references crm.cad_empresa(id),
  codigo text not null check (codigo ~ '^[a-z_]{3,30}$'),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  descricao text not null default '',
  ordem int not null default 0,
  ativa boolean not null default true,
  primary key (empresa_id, codigo)
);

create table crm.cad_fluxo_etapa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  codigo text not null check (codigo ~ '^E[0-9]{2,3}$'),   -- estável: comentários e revisões apontam para ele
  ordem int not null check (ordem > 0),
  fase int not null check (fase between 1 and 6),
  area text not null check (area in ('compras','estoque','cadastro','mkt','live','fat','exp','fin')),
  titulo text not null check (length(btrim(titulo)) between 3 and 120),
  responsavel text not null,
  apoio text[] not null default '{}',
  tela text not null default '',
  entrada text not null default '',
  procedimento text[] not null default '{}',
  entrega text not null default '',
  impacto text not null default '',
  regras text not null default '',
  situacao text not null default 'plan' check (situacao in ('uso','impl','plan','man')),
  ativa boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (empresa_id, codigo),
  foreign key (empresa_id, responsavel) references crm.cad_fluxo_funcao(empresa_id, codigo)
);
create index on crm.cad_fluxo_etapa (empresa_id, ordem);

create table crm.mov_fluxo_comentario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  etapa_codigo text not null,
  tipo text not null default 'comentario' check (tipo in ('comentario','ajuste','duvida')),
  texto text not null check (length(texto) between 1 and 4000),
  mascarados int not null default 0,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  resolvido boolean not null default false,
  resolvido_por uuid, resolvido_em timestamptz,
  foreign key (empresa_id, etapa_codigo) references crm.cad_fluxo_etapa(empresa_id, codigo)
);
create index on crm.mov_fluxo_comentario (empresa_id, etapa_codigo);

create table crm.log_fluxo_revisao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  versao text not null check (versao ~ '^[0-9]+\.[0-9]+$'),
  descricao text not null check (length(btrim(descricao)) between 3 and 2000),
  etapas text[] not null default '{}',
  tipo text not null default 'edicao' check (tipo in ('inicial','edicao','restauracao','anotacao')),
  copia jsonb not null,                      -- todas as etapas ativas e inativas depois da mudança
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (empresa_id, versao)
);
create index on crm.log_fluxo_revisao (empresa_id, criado_em desc);

-- acesso só por funções SECURITY DEFINER (padrão do projeto)
alter table crm.cad_fluxo_funcao enable row level security;
alter table crm.cad_fluxo_etapa enable row level security;
alter table crm.mov_fluxo_comentario enable row level security;
alter table crm.log_fluxo_revisao enable row level security;
revoke all on crm.cad_fluxo_funcao, crm.cad_fluxo_etapa, crm.mov_fluxo_comentario, crm.log_fluxo_revisao from anon, authenticated;

-- tela e permissões padrão: gestor edita; demais papéis veem e comentam; admin sempre edita (api.nivel_tela)
insert into crm.cad_tela (tela, rotulo, grupo, ordem, situacao, nivel_max, aplicacao, descricao)
values ('fluxo', 'Fluxo do processo', 'Inteligência', 195, 'ativa', 'editar', 'tela_e_banco',
        'Mapa das etapas da operação por área e por papel, com procedimento, impacto, comentários e revisões')
on conflict (tela) do nothing;

create or replace function crm._padrao_nivel(p_tela text, p_papel text)
 returns text language sql immutable set search_path to '' as $function$
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
    ('auditoria','gestor','ver'),
    ('vendas','gestor','editar'),('vendas','suporte','editar'),('vendas','apresentadora','editar'),('vendas','expedicao','ver'),('vendas','financeiro','ver'),('vendas','leitura','ver'),
    ('preferencias_vitrine','gestor','editar'),('preferencias_vitrine','suporte','ver'),('preferencias_vitrine','apresentadora','ver'),
    ('fluxo','gestor','editar'),('fluxo','suporte','ver'),('fluxo','apresentadora','ver'),('fluxo','expedicao','ver'),('fluxo','financeiro','ver'),('fluxo','leitura','ver')
  ) v(t, p, n) where v.t = p_tela and v.p = p_papel), 'nenhum') $function$;

insert into crm.cfg_permissao_tela (empresa_id, tela, papel, nivel)
select e.id, 'fluxo', r.papel, crm._padrao_nivel('fluxo', r.papel)
  from crm.cad_empresa e cross join unnest(array['gestor','suporte','apresentadora','expedicao','financeiro','leitura']) r(papel)
on conflict do nothing;
