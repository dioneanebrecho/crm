-- 0032 (aplicada em 22/11/2026): tela "Etiquetas e impressão" e permissões por papel.
insert into crm.cad_tela (tela, grupo, ordem, rotulo, situacao, aplicacao, descricao, nivel_max)
values ('etiquetas', 'Catálogo', 25, 'Etiquetas e impressão', 'ativa', 'tela_e_banco',
        'Número curto, etiquetas com QR, fila de impressão, impressoras, modelos e agentes de impressão', 'editar')
on conflict (tela) do nothing;
insert into crm.cfg_permissao_tela (empresa_id, tela, papel, nivel)
select e.id, 'etiquetas', p.papel, p.nivel from crm.cad_empresa e
 cross join (values ('gestor','editar'), ('expedicao','editar'), ('suporte','ver'), ('apresentadora','ver'), ('leitura','ver')) p(papel, nivel)
on conflict do nothing;
-- 0033 (aplicada): api.agente_registrar passa a recusar novo pareamento quando há 200 pendentes (a função é pública por desenho).
