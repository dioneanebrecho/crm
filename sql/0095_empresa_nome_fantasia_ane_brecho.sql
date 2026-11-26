-- 0095_empresa_nome_fantasia_ane_brecho.sql (aplicada em 26/11/2026)
-- Nome de exibição da loja (respostas prontas {{empresa.nome}}, cabeçalho do painel). Razão social e dados fiscais não mudam.
update crm.cad_empresa set nome_fantasia = 'Ane Brechó' where id = '19ae21c1-001d-4a64-bbb4-a3dfe3aa4fda' and nome_fantasia = 'ANE BRECHO';
