-- Testes da 0011. Rodar com: psql -v ON_ERROR_STOP=1 -f 11_testes_api.sql (após harness + migration).
-- Cada bloco levanta exceção se algo divergir; no fim imprime "TODOS OS TESTES PASSARAM".
\set ON_ERROR_STOP on
create schema t;
create table t.resultado (n serial, ok boolean, msg text);
create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin insert into t.resultado (ok, msg) values (coalesce(p_cond, false), p_msg); end $$;
grant usage on schema t to authenticated, anon;
grant all on t.resultado to authenticated, anon;
grant usage on sequence t.resultado_n_seq to authenticated, anon;
grant execute on function t.ok(boolean, text) to authenticated, anon;

-- cenário (superusuário)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','admin_a@x'), ('00000000-0000-0000-0000-0000000000a2','suporte_a@x'),
 ('00000000-0000-0000-0000-0000000000a3','leitura_a@x'), ('00000000-0000-0000-0000-0000000000b1','admin_b@x'),
 ('00000000-0000-0000-0000-0000000000c1','sempapel@x'), ('00000000-0000-0000-0000-0000000000d1','super@x'),
 ('00000000-0000-0000-0000-0000000000a4','expedicao_a@x');
insert into crm.cad_usuario (id, nome, email, is_superadmin) values
 ('00000000-0000-0000-0000-0000000000a1','Admin A','admin_a@x',false), ('00000000-0000-0000-0000-0000000000a2','Suporte A','suporte_a@x',false),
 ('00000000-0000-0000-0000-0000000000a3','Leitura A','leitura_a@x',false), ('00000000-0000-0000-0000-0000000000b1','Admin B','admin_b@x',false),
 ('00000000-0000-0000-0000-0000000000c1','Sem Papel','sempapel@x',false), ('00000000-0000-0000-0000-0000000000d1','Super','super@x',true),
 ('00000000-0000-0000-0000-0000000000a4','Expedicao A','expedicao_a@x',false);
insert into crm.cad_empresa (id, razao_social, nome_fantasia) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Empresa A Ltda','A'), ('bbbbbbbb-0000-0000-0000-000000000001','Empresa B Ltda','B');
insert into crm.rel_usuario_empresa (usuario_id, empresa_id, papel) values
 ('00000000-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('00000000-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001','suporte'),
 ('00000000-0000-0000-0000-0000000000a3','aaaaaaaa-0000-0000-0000-000000000001','leitura'),
 ('00000000-0000-0000-0000-0000000000a4','aaaaaaaa-0000-0000-0000-000000000001','expedicao'),
 ('00000000-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000001','admin');

-- helper para "esta chamada deve falhar com SQLSTATE X"
create function t.falha(p_sql text, p_estado text, p_msg text) returns void language plpgsql as $$
declare v_st text;
begin
  begin execute p_sql; perform t.ok(false, p_msg || ' (não falhou)');
  exception when others then get stacked diagnostics v_st = returned_sqlstate; perform t.ok(v_st = p_estado, p_msg || ' [' || v_st || ']');
  end;
end $$;
grant execute on function t.falha(text, text, text) to authenticated, anon;

-- ================= admin A: fluxo completo de cadastro
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;
insert into ctx select 'local', api.salvar_local('aaaaaaaa-0000-0000-0000-000000000001', 'Estoque principal', true);
insert into ctx select 'peca', api.salvar_peca('aaaaaaaa-0000-0000-0000-000000000001', 'VES-001', 'Vestido floral', null, 'Vestido midi', 'Vestidos', 'Zara', 'usada', 25.50, 89.90);
insert into ctx select 'varM', api.salvar_variacao('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='peca'), 'm');
select t.ok((select count(*) from api.criar_unidades('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='varM'), (select v from ctx where k='local'), 3)) = 3, 'criou 3 unidades');
select t.ok((select count(*) from api.criar_unidades('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='varM'), (select v from ctx where k='local'), 2, 'lote 2')) = 2, 'criou +2 unidades');
select t.ok((select string_agg(codigo, ',' order by codigo) from api.listar_unidades('aaaaaaaa-0000-0000-0000-000000000001'))
            = 'VES-001-M-001,VES-001-M-002,VES-001-M-003,VES-001-M-004,VES-001-M-005', 'códigos sequenciais sem lacuna');
select t.ok((select qtd_unidades = 5 and qtd_disponiveis = 5 and qtd_variacoes = 1 and custo = 25.50 and total = 1
               from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001')), 'listar_pecas conta e mostra custo ao admin');
select t.ok((select jsonb_array_length(api.obter_peca('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='peca'))->'variacoes') = 1), 'obter_peca traz variações');
select t.ok((select count(*) from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001', 'floral')) = 1, 'busca por nome');
select t.ok((select count(*) from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001', '100%')) = 0, 'busca com % é literal');
select t.ok((select count(*) from api.listar_unidades('aaaaaaaa-0000-0000-0000-000000000001', null, 'vendida')) = 0, 'filtro por estado');
insert into ctx select 'cli', api.salvar_cliente('aaaaaaaa-0000-0000-0000-000000000001', 'Maria', null, '@Maria_Silva', '11 99999-0000', 'MARIA@X.COM');
select t.ok((select instagram_username = 'maria_silva' and email = 'maria@x.com' and telefone = '11 99999-0000'
               from api.listar_clientes('aaaaaaaa-0000-0000-0000-000000000001')), 'cliente normalizado e visível ao admin');
select t.falha($q$select api.salvar_peca('aaaaaaaa-0000-0000-0000-000000000001', 'VES-001', 'Duplicada')$q$, '23505', 'código de peça duplicado');
select t.falha($q$select api.salvar_cliente('aaaaaaaa-0000-0000-0000-000000000001', 'Outra', null, 'maria_silva')$q$, '23505', '@ duplicado');
select t.falha($q$select api.salvar_cliente('aaaaaaaa-0000-0000-0000-000000000001')$q$, '22023', 'cliente sem nome nem @');
select t.falha($q$select api.salvar_variacao('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='peca'), ' m ')$q$, '23505', 'variação duplicada');
select t.falha($q$select * from api.criar_unidades('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='varM'), (select v from ctx where k='local'), 0)$q$, '22023', 'quantidade 0');
select t.falha($q$select api.salvar_peca('aaaaaaaa-0000-0000-0000-000000000001', 'X', 'Y', null, null, null, null, 'nova', -1)$q$, '22023', 'custo negativo');
-- edição
select api.salvar_peca('aaaaaaaa-0000-0000-0000-000000000001', 'VES-001', 'Vestido floral azul', (select v from ctx where k='peca'), null, 'Vestidos', 'Zara', 'usada', 30, 99);
select t.ok((select nome = 'Vestido floral azul' and preco_tabela = 99 from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001')), 'edição de peça');

-- ================= suporte A: lê, não vê custo, cadastra cliente, não cadastra peça
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select t.ok((select custo is null and qtd_unidades = 5 from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001')), 'suporte não vê custo');
select t.ok((select telefone is not null from api.listar_clientes('aaaaaaaa-0000-0000-0000-000000000001')), 'suporte vê contato do cliente');
select t.ok((select api.obter_peca('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='peca'))->'peca'->'custo') = 'null'::jsonb, 'obter_peca sem custo para suporte');
select t.falha($q$select api.salvar_peca('aaaaaaaa-0000-0000-0000-000000000001', 'Z-1', 'Nova')$q$, '42501', 'suporte não cadastra peça');
select t.falha($q$select api.salvar_local('aaaaaaaa-0000-0000-0000-000000000001', 'Loja')$q$, '42501', 'suporte não cadastra local');
select api.salvar_cliente('aaaaaaaa-0000-0000-0000-000000000001', 'Joana', null, 'joana');

-- ================= leitura A: sem contato, sem escrita
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select t.ok((select count(*) = 2 and bool_and(telefone is null and email is null and observacao_interna is null)
               from api.listar_clientes('aaaaaaaa-0000-0000-0000-000000000001')), 'leitura não vê contato');
select t.falha($q$select api.salvar_cliente('aaaaaaaa-0000-0000-0000-000000000001', 'X')$q$, '42501', 'leitura não escreve cliente');
select t.falha($q$select * from api.criar_unidades('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='varM'), (select v from ctx where k='local'), 1)$q$, '42501', 'leitura não cria unidade');

-- ================= expedição A: cria unidade, não edita peça
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select t.ok((select count(*) from api.criar_unidades('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='varM'), (select v from ctx where k='local'), 1)) = 1, 'expedição cria unidade');
select t.falha($q$select api.salvar_variacao('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='peca'), 'G')$q$, '42501', 'expedição não cria variação');

-- ================= admin B: isolamento entre empresas
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select t.falha($q$select * from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001')$q$, '42501', 'admin B não lê empresa A');
select t.falha($q$select api.obter_peca('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k='peca'))$q$, '42501', 'admin B não abre peça de A');
select t.falha($q$select api.obter_peca('bbbbbbbb-0000-0000-0000-000000000001', (select v from ctx where k='peca'))$q$, 'P0002', 'peça de A não aparece na empresa B');
select t.falha($q$select api.salvar_variacao('bbbbbbbb-0000-0000-0000-000000000001', (select v from ctx where k='peca'), 'P')$q$, 'P0002', 'variação em peça de outra empresa');
select t.falha($q$select api.salvar_peca('bbbbbbbb-0000-0000-0000-000000000001', 'X', 'Y', (select v from ctx where k='peca'))$q$, 'P0002', 'editar peça de A como B');
insert into ctx select 'localB', api.salvar_local('bbbbbbbb-0000-0000-0000-000000000001', 'Depósito B');
select t.falha($q$select * from api.criar_unidades('bbbbbbbb-0000-0000-0000-000000000001', (select v from ctx where k='varM'), (select v from ctx where k='localB'), 1)$q$, 'P0002', 'unidade com variação de outra empresa');
select t.ok((select count(*) from api.listar_pecas('bbbbbbbb-0000-0000-0000-000000000001')) = 0, 'B vê só o que é seu');

-- ================= sem papel, anon, superadmin
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select t.ok((select jsonb_array_length(api.me()->'empresas') = 0 and api.me()->'usuario' is not null), 'sem papel: me() sem empresas');
select t.falha($q$select * from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001')$q$, '42501', 'sem papel não lê');
select t.falha($q$select count(*) from catalogo.cad_peca$q$, '42501', 'tabela direta negada ao authenticated');
reset role; set role anon; set request.jwt.claim.sub = '';
select t.falha($q$select api.me()$q$, '42501', 'anon não executa api.me');
select t.falha($q$select * from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001')$q$, '42501', 'anon não lista peças');
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select t.ok((select jsonb_array_length(api.me()->'empresas') = 2 and (api.me()->'empresas'->0->'papeis') ? 'superadmin'), 'superadmin vê as duas empresas');
select t.ok((select count(*) from api.listar_pecas('aaaaaaaa-0000-0000-0000-000000000001')) = 1, 'superadmin lê A');
reset role; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;
select t.ok((select jsonb_array_length(api.me()->'empresas') = 1 and api.me()->'empresas'->0->'papeis' = '["admin"]'::jsonb), 'me() do admin A: 1 empresa, papel admin');

-- ================= auditoria (como superusuário)
reset role;
select t.ok((select count(*) from audit.log_alteracao where tabela = 'cad_peca' and operacao = 'I' and usuario_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'auditoria: insert de peça com ator');
select t.ok((select count(*) from audit.log_alteracao where tabela = 'cad_peca' and operacao = 'U' and 'preco_tabela' = any (campos_alterados)) = 1, 'auditoria: update de peça com campos alterados');
select t.ok((select count(*) from audit.log_alteracao where tabela = 'cad_unidade' and operacao = 'I') = 6, 'auditoria: 6 unidades');
select t.ok((select count(*) from audit.log_alteracao where tabela = 'cad_local') = 2, 'auditoria: locais');
select t.ok((select count(*) from catalogo.cad_unidade where origem = 'producao') = 6, 'origem padrão aplicada');

-- resultado
select case when ok then 'PASS' else 'FAIL' end as r, msg from t.resultado order by n;
select case when bool_and(ok) then 'TODOS OS TESTES PASSARAM (' || count(*) || ')' else 'HÁ FALHAS' end from t.resultado;
