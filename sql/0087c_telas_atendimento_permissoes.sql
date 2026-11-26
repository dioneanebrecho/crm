-- 0087c_telas_atendimento_permissoes.sql — telas da Central de Atendimento na matriz de permissões
update crm.cad_tela set situacao = 'ativa', rotulo = 'Caixa de entrada', nivel_max = 'editar', aplicacao = 'tela_e_banco',
       descricao = 'Conversas de Instagram e WhatsApp numa caixa única, com respostas prontas e contexto da venda'
 where tela = 'atendimento';
insert into crm.cad_tela (tela, rotulo, grupo, ordem, situacao, nivel_max, aplicacao, descricao)
values ('respostas_prontas', 'Respostas prontas', 'Configuração', 217, 'ativa', 'editar', 'tela_e_banco',
        'Modelos de resposta com variáveis (cliente, reserva, Pix, pedido, rastreio) usados na Caixa de entrada')
on conflict (tela) do nothing;
-- linhas já existentes (tela era "planejada") foram mantidas como estavam
insert into crm.cfg_permissao_tela (empresa_id, papel, tela, nivel)
select e.id, x.papel, x.tela, x.nivel from crm.cad_empresa e cross join (values
  ('gestor','atendimento','editar'), ('suporte','atendimento','editar'), ('apresentadora','atendimento','editar'),
  ('expedicao','atendimento','editar'), ('financeiro','atendimento','editar'),
  ('gestor','respostas_prontas','ver'), ('suporte','respostas_prontas','ver'), ('apresentadora','respostas_prontas','ver')) x(papel, tela, nivel)
on conflict do nothing;
