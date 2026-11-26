-- 0094f: índices das chaves consultadas pelos vínculos e pela conciliação
create index if not exists mov_baixa_reneg_ix on financeiro.mov_baixa (renegociacao_id) where renegociacao_id is not null;
create index if not exists mov_baixa_conta_ix on financeiro.mov_baixa (conta_id) where conta_id is not null;
create index if not exists mov_titulo_origem_ix on financeiro.mov_titulo (titulo_origem_id) where titulo_origem_id is not null;
create index if not exists mov_titulo_prov_subst_ix on financeiro.mov_titulo (provisao_substituida_id) where provisao_substituida_id is not null;
create index if not exists mov_titulo_cobranca_ix on financeiro.mov_titulo (cobranca_id) where cobranca_id is not null;
create index if not exists mov_titulo_pagamento_ix on financeiro.mov_titulo (pagamento_id) where pagamento_id is not null;
create index if not exists mov_extrato_linha_extrato_ix on financeiro.mov_extrato_linha (extrato_id);
create index if not exists mov_extrato_conta_ix on financeiro.mov_extrato (conta_id, data_saldo);
create index if not exists mov_adiantamento_parceiro_ix on financeiro.mov_adiantamento (parceiro_id);
create index if not exists mov_renegociacao_parceiro_ix on financeiro.mov_renegociacao (parceiro_id);
create index if not exists mov_conta_movimento_par_ix on financeiro.mov_conta_movimento (transferencia_par_id) where transferencia_par_id is not null;
