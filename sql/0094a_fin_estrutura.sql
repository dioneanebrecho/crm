-- 0094a_fin_estrutura.sql
-- Pedido de mudança 049: módulo financeiro (títulos a pagar e a receber, baixa, banco, conciliação).
-- Plano: claude/plano-modulo-financeiro-titulos.md (decisões D1 a D6 de 26/11/2026). Protótipo validado no canvas.
-- Parte A: cadastros, estrutura e dados iniciais. Só aditivo. APLICADA em 26/11/2026 com autorização do Dione.

-- ---------------------------------------------------------------------------
-- 1. Naturezas novas (neutras, fora do DRE): adiantamentos e impostos retidos
-- ---------------------------------------------------------------------------
insert into financeiro.cad_natureza (empresa_id, codigo, nome, sinal, reconhece_em, ordem)
select e.id, x.codigo, x.nome, 0, 'nao_dre', x.ordem
  from crm.cad_empresa e
  cross join (values
    ('8.05',        'Adiantamentos e retenções', 50),
    ('8.05.01',     'Adiantamentos', 10),
    ('8.05.01.001', 'Adiantamento de clientes', 10),
    ('8.05.01.002', 'Adiantamento a fornecedores', 20),
    ('8.05.02',     'Impostos retidos a recolher', 20),
    ('8.05.02.001', 'ISS retido', 10),
    ('8.05.02.002', 'IRRF retido', 20),
    ('8.05.02.003', 'INSS retido', 30),
    ('8.05.02.004', 'PIS/COFINS/CSLL retidos', 40)) as x(codigo, nome, ordem)
 where exists (select 1 from financeiro.cad_natureza n where n.empresa_id = e.id and n.codigo = '8')
order by e.id, x.codigo
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Numeração por empresa
-- ---------------------------------------------------------------------------
create table financeiro.cfg_sequencia (
  empresa_id uuid not null references crm.cad_empresa(id),
  chave text not null,
  ultimo bigint not null default 0,
  primary key (empresa_id, chave)
);

-- ---------------------------------------------------------------------------
-- 3. Cadastros
-- ---------------------------------------------------------------------------
create table financeiro.cad_conta_bancaria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  tipo text not null check (tipo in ('corrente','poupanca','caixa','carteira_gateway','cartao_receber','aplicacao')),
  banco_codigo text, agencia text, conta text,
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo_inicial date not null,
  permite_negativo boolean not null default true,
  ativa boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table financeiro.cad_tipo_titulo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  codigo text not null check (codigo ~ '^[A-Z0-9_]{2,30}$'),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  meio text not null check (meio in ('pix','cartao_credito','cartao_debito','boleto','dinheiro','transferencia','guia','debito_automatico','credito_loja','cheque','outros')),
  aplica_a text not null default 'A' check (aplica_a in ('R','D','A')),
  conta_padrao_id uuid references financeiro.cad_conta_bancaria(id),
  natureza_taxa_id uuid references financeiro.cad_natureza(id),
  taxa_pct numeric(7,4) not null default 0 check (taxa_pct >= 0 and taxa_pct < 100),
  taxa_fixa numeric(12,2) not null default 0 check (taxa_fixa >= 0),
  dias_compensacao int not null default 0 check (dias_compensacao between 0 and 400),
  baixa_automatica boolean not null default false,
  exige_codigo_barras boolean not null default false,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create table financeiro.cad_projeto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  codigo text not null check (length(btrim(codigo)) between 1 and 20),
  nome text not null check (length(btrim(nome)) between 1 and 100),
  inicio date, fim date,
  situacao text not null default 'ativo' check (situacao in ('ativo','encerrado')),
  responsavel_id uuid references crm.cad_usuario(id),
  orcamento numeric(14,2),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo),
  check (fim is null or inicio is null or fim >= inicio)
);

-- Parâmetros: natureza de cada componente da baixa, adiantamentos, retenções e fechamento
create table financeiro.cfg_financeiro (
  empresa_id uuid primary key references crm.cad_empresa(id),
  nat_juros_recebidos_id uuid references financeiro.cad_natureza(id),
  nat_multa_recebida_id uuid references financeiro.cad_natureza(id),
  nat_desconto_concedido_id uuid references financeiro.cad_natureza(id),
  nat_taxa_receber_id uuid references financeiro.cad_natureza(id),
  nat_juros_pagos_id uuid references financeiro.cad_natureza(id),
  nat_multa_paga_id uuid references financeiro.cad_natureza(id),
  nat_desconto_obtido_id uuid references financeiro.cad_natureza(id),
  nat_tarifa_pagar_id uuid references financeiro.cad_natureza(id),
  nat_adiant_cliente_id uuid references financeiro.cad_natureza(id),
  nat_adiant_fornecedor_id uuid references financeiro.cad_natureza(id),
  nat_iss_id uuid references financeiro.cad_natureza(id),
  nat_irrf_id uuid references financeiro.cad_natureza(id),
  nat_inss_id uuid references financeiro.cad_natureza(id),
  nat_pcc_id uuid references financeiro.cad_natureza(id),
  nat_transferencia_id uuid references financeiro.cad_natureza(id),
  cr_financeiro_id uuid references financeiro.cad_centro_resultado(id),
  parceiro_prefeitura_id uuid references crm.cad_parceiro(id),
  parceiro_receita_id uuid references crm.cad_parceiro(id),
  dia_vencimento_retencao int not null default 20 check (dia_vencimento_retencao between 1 and 28),
  data_fechamento date,
  janela_conciliacao_dias int not null default 5 check (janela_conciliacao_dias between 0 and 30),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Movimento
-- ---------------------------------------------------------------------------
create table financeiro.mov_grupo_titulo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  tipo text not null check (tipo in ('parcelamento','contrato','recorrente','nota','renegociacao')),
  descricao text not null,
  total numeric(14,2),
  parcelas int not null check (parcelas between 1 and 360),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal','quinzenal','semanal','dias')),
  intervalo_dias int,
  criado_por uuid,
  criado_em timestamptz not null default now()
);

create table financeiro.mov_adiantamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  numero bigint not null,
  tipo text not null check (tipo in ('cliente','fornecedor')),
  parceiro_id uuid not null references crm.cad_parceiro(id),
  valor numeric(14,2) not null check (valor > 0),
  data date not null,
  conta_id uuid not null references financeiro.cad_conta_bancaria(id),
  historico text,
  situacao text not null default 'aberto' check (situacao in ('aberto','compensado','cancelado')),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table financeiro.mov_renegociacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  numero bigint not null,
  tipo char(1) not null check (tipo in ('R','D')),
  parceiro_id uuid not null references crm.cad_parceiro(id),
  total_original numeric(14,2) not null,
  juros numeric(14,2) not null default 0 check (juros >= 0),
  desconto numeric(14,2) not null default 0 check (desconto >= 0),
  novo_total numeric(14,2) not null check (novo_total > 0),
  historico text,
  situacao text not null default 'ativa' check (situacao in ('ativa','desfeita')),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  desfeita_em timestamptz, desfeita_por uuid, motivo_desfazer text,
  unique (empresa_id, numero)
);

create table financeiro.mov_titulo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  numero bigint not null,
  tipo char(1) not null check (tipo in ('R','D')),
  parceiro_id uuid not null references crm.cad_parceiro(id),
  documento text,
  historico text,
  emissao date not null,
  competencia date not null,
  vencimento date not null,
  vencimento_original date not null,
  valor_original numeric(14,2) not null check (valor_original > 0),
  ret_iss numeric(14,2) not null default 0 check (ret_iss >= 0),
  ret_irrf numeric(14,2) not null default 0 check (ret_irrf >= 0),
  ret_inss numeric(14,2) not null default 0 check (ret_inss >= 0),
  ret_pcc numeric(14,2) not null default 0 check (ret_pcc >= 0),
  valor_liquido numeric(14,2) generated always as (valor_original - ret_iss - ret_irrf - ret_inss - ret_pcc) stored,
  retencao_recolhe boolean not null default false,
  saldo numeric(14,2) not null default 0,
  situacao text not null default 'aberto' check (situacao in ('aberto','parcial','baixado','cancelado','renegociado')),
  provisao boolean not null default false,
  tipo_titulo_id uuid references financeiro.cad_tipo_titulo(id),
  conta_prevista_id uuid references financeiro.cad_conta_bancaria(id),
  juros_dia_pct numeric(7,4) check (juros_dia_pct >= 0),
  multa_pct numeric(7,4) check (multa_pct >= 0),
  desconto_ate date,
  desconto_valor numeric(14,2) check (desconto_valor >= 0),
  codigo_barras text,
  pix_copia_cola text,
  origem_tipo text not null default 'manual' check (origem_tipo in
    ('manual','nfe_entrada','nfse_entrada','venda','renegociacao','adiantamento','recorrente','parcelamento','duplicado','retencao','extrato','implantacao')),
  entrada_id uuid references compra.mov_entrada(id),
  entrada_parcela_id uuid references compra.mov_entrada_parcela(id),
  pedido_id uuid references venda.mov_pedido(id),
  cobranca_id uuid references venda.mov_cobranca(id),
  pagamento_id uuid references venda.mov_pagamento(id),
  nfe_chave text,
  grupo_id uuid references financeiro.mov_grupo_titulo(id),
  parcela_num int, parcela_total int,
  titulo_origem_id uuid references financeiro.mov_titulo(id),
  retencao_de_id uuid references financeiro.mov_titulo(id),
  provisao_substituida_id uuid references financeiro.mov_titulo(id),
  adiantamento_id uuid references financeiro.mov_adiantamento(id),
  adiantamento_papel text check (adiantamento_papel in ('entrada','contrapartida')),
  cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, numero),
  check (valor_liquido > 0),
  check ((grupo_id is null) = (parcela_num is null)),
  check (situacao <> 'cancelado' or motivo_cancelamento is not null),
  check (adiantamento_id is null or adiantamento_papel is not null)
);
create unique index mov_titulo_entrada_parcela_uq on financeiro.mov_titulo (entrada_parcela_id) where entrada_parcela_id is not null and situacao <> 'cancelado';
create index mov_titulo_aberto_ix on financeiro.mov_titulo (empresa_id, tipo, vencimento) where situacao in ('aberto','parcial');
create index mov_titulo_parceiro_ix on financeiro.mov_titulo (empresa_id, parceiro_id);
create index mov_titulo_grupo_ix on financeiro.mov_titulo (grupo_id) where grupo_id is not null;
create index mov_titulo_entrada_ix on financeiro.mov_titulo (entrada_id) where entrada_id is not null;
create index mov_titulo_pedido_ix on financeiro.mov_titulo (pedido_id) where pedido_id is not null;
create index mov_titulo_adiant_ix on financeiro.mov_titulo (adiantamento_id) where adiantamento_id is not null;
create index mov_titulo_retencao_ix on financeiro.mov_titulo (retencao_de_id) where retencao_de_id is not null;

-- Vínculo N:N da renegociação (um título pode ser renegociado de novo, agrupado com outros)
create table financeiro.rel_renegociacao_titulo (
  renegociacao_id uuid not null references financeiro.mov_renegociacao(id),
  titulo_id uuid not null references financeiro.mov_titulo(id),
  papel text not null check (papel in ('original','novo')),
  saldo_renegociado numeric(14,2),
  primary key (renegociacao_id, titulo_id)
);
create index rel_reneg_titulo_ix on financeiro.rel_renegociacao_titulo (titulo_id);

create table financeiro.rel_titulo_rateio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  titulo_id uuid not null references financeiro.mov_titulo(id) on delete cascade,
  natureza_id uuid not null references financeiro.cad_natureza(id),
  cr_id uuid not null references financeiro.cad_centro_resultado(id),
  projeto_id uuid references financeiro.cad_projeto(id),
  percentual numeric(9,6) not null check (percentual > 0 and percentual <= 100),
  criado_em timestamptz not null default now()
);
create index rel_titulo_rateio_titulo_ix on financeiro.rel_titulo_rateio (titulo_id);
create index rel_titulo_rateio_nat_ix on financeiro.rel_titulo_rateio (natureza_id);
create index rel_titulo_rateio_cr_ix on financeiro.rel_titulo_rateio (cr_id);
create index rel_titulo_rateio_proj_ix on financeiro.rel_titulo_rateio (projeto_id) where projeto_id is not null;

create table financeiro.mov_baixa_lote (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  numero bigint not null,
  tipo text not null check (tipo in ('agrupada','compensacao')),
  data date not null,
  conta_id uuid references financeiro.cad_conta_bancaria(id),
  valor_liquido numeric(14,2) not null,   -- + entra, − sai, 0 = compensação sem banco
  estornado boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table financeiro.mov_conta_movimento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  conta_id uuid not null references financeiro.cad_conta_bancaria(id),
  data date not null,                     -- data da baixa (saldo do sistema)
  valor numeric(14,2) not null check (valor <> 0),   -- + entrada, − saída
  tipo text not null check (tipo in ('baixa','transferencia','ajuste')),
  historico text,
  lote_id uuid references financeiro.mov_baixa_lote(id),
  transferencia_par_id uuid references financeiro.mov_conta_movimento(id),
  estornado boolean not null default false,
  estornado_em timestamptz, estornado_por uuid,
  conciliado boolean not null default false,
  data_conciliacao date,                  -- data do banco (saldo conciliado)
  conciliado_em timestamptz,              -- quando a conciliação foi feita (auditoria)
  conciliado_por uuid,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  check (not conciliado or data_conciliacao is not null),
  check (not (conciliado and estornado))
);
create index mov_conta_movimento_conta_ix on financeiro.mov_conta_movimento (conta_id, data) where not estornado;
create index mov_conta_movimento_lote_ix on financeiro.mov_conta_movimento (lote_id) where lote_id is not null;

create table financeiro.mov_baixa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  titulo_id uuid not null references financeiro.mov_titulo(id),
  lote_id uuid references financeiro.mov_baixa_lote(id),
  tipo text not null default 'normal' check (tipo in ('normal','compensacao','renegociacao')),
  data date not null,
  valor_principal numeric(14,2) not null check (valor_principal > 0),
  juros numeric(14,2) not null default 0 check (juros >= 0),
  multa numeric(14,2) not null default 0 check (multa >= 0),
  desconto numeric(14,2) not null default 0 check (desconto >= 0),
  taxa numeric(14,2) not null default 0 check (taxa >= 0),
  valor_movimentado numeric(14,2) not null,   -- no sentido do título (R entra, D sai)
  conta_id uuid references financeiro.cad_conta_bancaria(id),
  tipo_titulo_id uuid references financeiro.cad_tipo_titulo(id),
  movimento_id uuid references financeiro.mov_conta_movimento(id),
  renegociacao_id uuid references financeiro.mov_renegociacao(id),
  historico text,
  estornada boolean not null default false,
  estornada_em timestamptz, estornada_por uuid, motivo_estorno text,
  origem text not null default engine.origem_padrao() check (origem in ('piloto','producao')),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  check (tipo <> 'renegociacao' or (renegociacao_id is not null and conta_id is null)),
  check (not estornada or motivo_estorno is not null)
);
create index mov_baixa_titulo_ix on financeiro.mov_baixa (titulo_id);
create index mov_baixa_lote_ix on financeiro.mov_baixa (lote_id) where lote_id is not null;
create index mov_baixa_mov_ix on financeiro.mov_baixa (movimento_id) where movimento_id is not null;

create table financeiro.mov_extrato (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  conta_id uuid not null references financeiro.cad_conta_bancaria(id),
  arquivo_nome text,
  arquivo_hash text,
  periodo_ini date, periodo_fim date,
  saldo_final numeric(14,2),               -- LEDGERBAL do OFX
  data_saldo date,
  linhas_novas int not null default 0,
  linhas_repetidas int not null default 0,
  importado_por uuid,
  importado_em timestamptz not null default now()
);

create table financeiro.mov_extrato_linha (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  conta_id uuid not null references financeiro.cad_conta_bancaria(id),
  extrato_id uuid not null references financeiro.mov_extrato(id),
  fitid text not null,
  data date not null,
  valor numeric(14,2) not null check (valor <> 0),
  descricao text,
  tipo_ofx text,
  situacao text not null default 'pendente' check (situacao in ('pendente','conciliada','ignorada')),
  movimento_id uuid references financeiro.mov_conta_movimento(id),
  motivo_ignorar text,
  decidido_por uuid, decidido_em timestamptz,
  unique (conta_id, fitid),
  check ((situacao = 'conciliada') = (movimento_id is not null)),
  check (situacao <> 'ignorada' or motivo_ignorar is not null)
);
create unique index mov_extrato_linha_mov_uq on financeiro.mov_extrato_linha (movimento_id) where movimento_id is not null;
create index mov_extrato_linha_conta_ix on financeiro.mov_extrato_linha (conta_id, data);

-- ---------------------------------------------------------------------------
-- 5. Segurança, auditoria e ambiente
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['cfg_sequencia','cad_conta_bancaria','cad_tipo_titulo','cad_projeto','cfg_financeiro','mov_grupo_titulo',
    'mov_adiantamento','mov_renegociacao','mov_titulo','rel_renegociacao_titulo','rel_titulo_rateio','mov_baixa_lote',
    'mov_conta_movimento','mov_baixa','mov_extrato','mov_extrato_linha'] loop
    execute format('alter table financeiro.%I enable row level security', t);
    execute format('revoke all on financeiro.%I from anon, authenticated', t);
    if t <> 'cfg_sequencia' then
      execute format('create trigger auditoria after insert or update or delete on financeiro.%I for each row execute function audit.registrar()', t);
    end if;
  end loop;
  foreach t in array array['mov_titulo','mov_baixa','mov_conta_movimento'] loop
    execute format('create trigger guarda_origem before insert on financeiro.%I for each row execute function engine.guarda_origem()', t);
  end loop;
end $$;
-- Sem policies, por desenho: o acesso é só pelas funções api.* (security definer).

-- ---------------------------------------------------------------------------
-- 6. Dados iniciais: tipos de título (taxas zeradas: preencher com as reais) e parâmetros
-- ---------------------------------------------------------------------------
insert into financeiro.cad_tipo_titulo (empresa_id, codigo, nome, meio, aplica_a, natureza_taxa_id, dias_compensacao, baixa_automatica, exige_codigo_barras, ordem)
select e.id, x.codigo, x.nome, x.meio, x.aplica, (select n.id from financeiro.cad_natureza n where n.empresa_id = e.id and n.codigo = x.nat),
       x.dias, x.auto, x.barras, x.ordem
  from crm.cad_empresa e
  cross join (values
    ('PIX',               'PIX',                         'pix',               'A', '4.01.02.003', 0,  false, false, 10),
    ('CARTAO_CREDITO',    'Cartão de crédito',           'cartao_credito',    'R', '4.01.02.001', 30, false, false, 20),
    ('CARTAO_DEBITO',     'Cartão de débito',            'cartao_debito',     'R', '4.01.02.002', 1,  false, false, 30),
    ('BOLETO',            'Boleto',                      'boleto',            'A', null,          1,  false, true,  40),
    ('DINHEIRO',          'Dinheiro',                    'dinheiro',          'A', null,          0,  true,  false, 50),
    ('TRANSFERENCIA',     'Transferência / TED',         'transferencia',     'A', null,          0,  false, false, 60),
    ('GUIA',              'Guia (DAS, DARF, ISS)',       'guia',              'D', null,          0,  false, true,  70),
    ('DEBITO_AUTOMATICO', 'Débito automático',           'debito_automatico', 'D', null,          0,  false, false, 80),
    ('CREDITO_LOJA',      'Crédito de loja / adiantamento', 'credito_loja',   'A', null,          0,  false, false, 90)
  ) as x(codigo, nome, meio, aplica, nat, dias, auto, barras, ordem)
on conflict do nothing;

insert into financeiro.cfg_financeiro (empresa_id, nat_juros_recebidos_id, nat_multa_recebida_id, nat_desconto_concedido_id, nat_taxa_receber_id,
  nat_juros_pagos_id, nat_multa_paga_id, nat_desconto_obtido_id, nat_tarifa_pagar_id, nat_adiant_cliente_id, nat_adiant_fornecedor_id,
  nat_iss_id, nat_irrf_id, nat_inss_id, nat_pcc_id, nat_transferencia_id, cr_financeiro_id)
select e.id,
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '1.02.02.001'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '1.02.02.002'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '5.01.03.001'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '4.01.02.003'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '5.01.01.001'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '5.01.01.002'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '1.02.03.001'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '5.01.02.001'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '8.05.01.001'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '8.05.01.002'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '8.05.02.001'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '8.05.02.002'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '8.05.02.003'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '8.05.02.004'),
  (select id from financeiro.cad_natureza where empresa_id = e.id and codigo = '8.01.01.001'),
  (select id from financeiro.cad_centro_resultado where empresa_id = e.id and codigo = '3.01')
  from crm.cad_empresa e
on conflict do nothing;
