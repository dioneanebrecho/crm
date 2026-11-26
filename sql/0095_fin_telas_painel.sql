-- Pedido 050: telas do financeiro de títulos no painel (aplicada como 0095_fin_telas_painel).
update crm.cad_tela set situacao = 'ativa', aplicacao = 'tela_e_banco', rotulo = case tela when 'conciliacao' then 'Conciliação bancária' else rotulo end,
  descricao = case tela when 'contas_receber' then 'Títulos a receber: baixa total, parcial e em lote, renegociação, adiantamentos, provisões e vínculos'
                        when 'contas_pagar' then 'Títulos a pagar: NF-e e NFS-e (retenções), boletos, guias, baixas, renegociação e vínculos'
                        when 'conciliacao' then 'Importação do OFX, saldo do extrato x conciliado dia a dia e conciliação das linhas' end
 where tela in ('contas_receber','contas_pagar','conciliacao');

insert into crm.cad_tela (tela, rotulo, grupo, ordem, situacao, nivel_max, aplicacao, descricao) values
  ('contas_bancarias', 'Contas e saldos', 'Financeiro', 155, 'ativa', 'editar', 'tela_e_banco', 'Saldo por conta em uma data (sistema, conciliado, extrato), movimentos e transferências'),
  ('cadastros_financeiro', 'Cadastros financeiros', 'Financeiro', 165, 'ativa', 'editar', 'tela_e_banco', 'Contas bancárias, tipos de título, projetos e parâmetros do financeiro')
on conflict (tela) do nothing;

do $$
declare d text := pg_get_functiondef('crm._padrao_nivel(text,text)'::regprocedure);
begin
  if position('contas_bancarias' in d) = 0 then
    d := replace(d, $q$('conciliacao','financeiro','editar'),$q$,
      $q$('conciliacao','financeiro','editar'),
    ('contas_bancarias','gestor','ver'),('contas_bancarias','financeiro','editar'),
    ('cadastros_financeiro','gestor','ver'),('cadastros_financeiro','financeiro','editar'),$q$);
    execute d;
  end if;
end $$;

select crm._semear_permissoes(e.id) from crm.cad_empresa e;
