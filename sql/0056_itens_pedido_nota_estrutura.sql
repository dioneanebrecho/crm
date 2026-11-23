-- STATUS: APLICADO em 2026-11-23 (migration 20261123053311).
-- 0056_itens_pedido_nota_estrutura (pedido de mudança 032, etapa 1)
-- Só ADITIVO: colunas novas anuláveis e tabelas novas no schema bling. RLS ligada, sem política, sem acesso direto
-- (acesso só por funções SECURITY DEFINER), igual às demais tabelas do schema bling.
-- Não espelha: linkPDF, linkDanfe, xml, endereço completo, telefone, documento completo, observações em texto.

-- ===== bling.cad_pedido: colunas novas =====
alter table bling.cad_pedido
  add column if not exists desconto_valor      numeric,
  add column if not exists desconto_unidade    text,
  add column if not exists outras_despesas     numeric,
  add column if not exists frete_transporte    numeric,
  add column if not exists custo_frete         numeric,
  add column if not exists taxa_comissao       numeric,
  add column if not exists taxa_valor_base     numeric,
  add column if not exists total_icms          numeric,
  add column if not exists total_ipi           numeric,
  add column if not exists intermediador_nome  text,
  add column if not exists numero_loja         text,
  add column if not exists frete_por_conta     integer,
  add column if not exists categoria_id        bigint,
  add column if not exists nota_tipo           text,
  add column if not exists itens_qtd           integer,
  add column if not exists itens_lidos         boolean not null default false;

-- ===== bling.cad_pedido_item =====
create table if not exists bling.cad_pedido_item (
  empresa_id           uuid        not null,
  pedido_bling_id      bigint      not null,
  seq                  integer     not null,
  item_bling_id        bigint,
  produto_bling_id     bigint,
  codigo               text,
  descricao            text,
  unidade              text,
  quantidade           numeric,
  valor_unit           numeric,
  desconto             numeric,
  valor_total          numeric,      -- quantidade * valor_unit - desconto
  aliquota_ipi         numeric,
  comissao_base        numeric,
  comissao_valor       numeric,
  comissao_aliquota    numeric,
  natureza_id          bigint,
  custo_unit_snapshot  numeric,      -- custo ATUAL do produto no momento do espelho (não o da época)
  custo_fonte          text,         -- 'produto_atual' | null
  match_status         text,         -- 'ok' | 'sem_produto' | 'sem_custo'
  atualizado_em        timestamptz not null default now(),
  primary key (empresa_id, pedido_bling_id, seq)
);
create index if not exists ix_cad_pedido_item_produto on bling.cad_pedido_item (produto_bling_id) where produto_bling_id is not null;
alter table bling.cad_pedido_item enable row level security;
revoke all on table bling.cad_pedido_item from public, anon, authenticated, service_role;

-- ===== bling.cad_pedido_parcela =====
create table if not exists bling.cad_pedido_parcela (
  empresa_id         uuid    not null,
  pedido_bling_id    bigint  not null,
  seq                integer not null,
  parcela_bling_id   bigint,
  valor              numeric,
  vencimento         date,
  forma_pagamento_id bigint,
  observacoes        text,
  atualizado_em      timestamptz not null default now(),
  primary key (empresa_id, pedido_bling_id, seq)
);
alter table bling.cad_pedido_parcela enable row level security;
revoke all on table bling.cad_pedido_parcela from public, anon, authenticated, service_role;

-- ===== bling.cad_nfe: colunas novas =====
alter table bling.cad_nfe
  add column if not exists data_operacao        timestamp,
  add column if not exists tipo_nota            text,
  add column if not exists numero_pedido_loja   text,
  add column if not exists pedido_bling_id      bigint,
  add column if not exists frete_por_conta      integer,
  add column if not exists transportador_nome   text,
  add column if not exists intermediador_nome   text,
  add column if not exists total_tributos_aprox numeric,
  add column if not exists outras_despesas      numeric,
  add column if not exists desconto_valor       numeric;

-- ===== bling.cad_nfe_item: colunas novas =====
alter table bling.cad_nfe_item
  add column if not exists cest                  text,
  add column if not exists peso_bruto            numeric,
  add column if not exists peso_liquido          numeric,
  add column if not exists icms_valor            numeric,
  add column if not exists icms_aliquota         numeric,
  add column if not exists icms_st               numeric,
  add column if not exists icms_origem           integer,
  add column if not exists icms_modalidade       integer,
  add column if not exists valor_aprox_tributos  numeric,
  add column if not exists custo_unit_snapshot   numeric,
  add column if not exists custo_fonte           text;
-- ATENÇÃO: bling.processar_nfe apaga e recria TODOS os itens de nota a cada execução; as colunas novas de
-- cad_nfe_item voltam a nulo e são repreenchidas por bling.processar_nfe_extra (job próprio). custo_fonte nulo = ainda não preenchido.

-- ===== bling.cad_nfe_parcela =====
create table if not exists bling.cad_nfe_parcela (
  empresa_id         uuid    not null,
  nfe_bling_id       bigint  not null,
  seq                integer not null,
  valor              numeric,
  vencimento         date,
  forma_pagamento_id bigint,
  observacoes        text,
  atualizado_em      timestamptz not null default now(),
  primary key (empresa_id, nfe_bling_id, seq)
);
alter table bling.cad_nfe_parcela enable row level security;
revoke all on table bling.cad_nfe_parcela from public, anon, authenticated, service_role;

create index if not exists ix_cad_nfe_pedido on bling.cad_nfe (pedido_bling_id) where pedido_bling_id is not null;

/* ===== ROLLBACK (manual) =====
drop table if exists bling.cad_nfe_parcela, bling.cad_pedido_parcela, bling.cad_pedido_item;
drop index if exists bling.ix_cad_nfe_pedido;
alter table bling.cad_nfe_item drop column if exists cest, drop column if exists peso_bruto, drop column if exists peso_liquido,
  drop column if exists icms_valor, drop column if exists icms_aliquota, drop column if exists icms_st, drop column if exists icms_origem,
  drop column if exists icms_modalidade, drop column if exists valor_aprox_tributos, drop column if exists custo_unit_snapshot, drop column if exists custo_fonte;
alter table bling.cad_nfe drop column if exists data_operacao, drop column if exists tipo_nota, drop column if exists numero_pedido_loja,
  drop column if exists pedido_bling_id, drop column if exists frete_por_conta, drop column if exists transportador_nome,
  drop column if exists intermediador_nome, drop column if exists total_tributos_aprox, drop column if exists outras_despesas, drop column if exists desconto_valor;
alter table bling.cad_pedido drop column if exists desconto_valor, drop column if exists desconto_unidade, drop column if exists outras_despesas,
  drop column if exists frete_transporte, drop column if exists custo_frete, drop column if exists taxa_comissao, drop column if exists taxa_valor_base,
  drop column if exists total_icms, drop column if exists total_ipi, drop column if exists intermediador_nome, drop column if exists numero_loja,
  drop column if exists frete_por_conta, drop column if exists categoria_id, drop column if exists nota_tipo, drop column if exists itens_qtd, drop column if exists itens_lidos;
*/
