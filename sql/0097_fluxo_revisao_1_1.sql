-- 0097 (pedido 053): revisão 1.1 do fluxo do processo, com o que entrou nos pedidos 049 (expedição e financeiro),
-- 051 (telas do financeiro) e 052 (Movimentação financeira com permissão por usuário).
-- Só dados: altera as etapas e registra UMA revisão (tipo edição) com a cópia completa, como faz a tela.

do $m$
declare e uuid;
begin
  for e in select distinct empresa_id from crm.cad_fluxo_etapa loop

    -- E08: as parcelas da NF-e viram títulos a pagar na confirmação (0094b)
    update crm.cad_fluxo_etapa set situacao = 'uso',
      procedimento = array[
        'Conferir parcelas, vencimentos e valores; informar quando o XML não trouxer.',
        'Escolher natureza financeira e centro de resultado de cada parcela.',
        'Marcar as rubricas que geram título para a transportadora (frete, CT-e).',
        'Na confirmação, cada parcela e cada rubrica vira um título a pagar ligado à nota, visível na Movimentação financeira.'],
      entrega = 'Títulos a pagar ligados à nota (número e chave), um por parcela e rubrica',
      regras = 'O checklist da confirmação exige o financeiro conferido. Título de NF-e não se altera nem se cancela pelo financeiro: valor, parceiro e tipo só mudam pela entrada.',
      atualizado_em = now()
     where empresa_id = e and codigo = 'E08';

    update crm.cad_fluxo_etapa set
      entrega = 'Unidades físicas no estoque do CRM, cada uma com número curto, e títulos a pagar da nota',
      regras = 'Estorno só é possível se nenhum título da entrada tiver baixa; nesse caso os títulos são cancelados juntos.',
      atualizado_em = now()
     where empresa_id = e and codigo = 'E09';

    -- E23: o envio montado vai para a bancada de conferência (0094a)
    update crm.cad_fluxo_etapa set
      procedimento = array[
        'Ver os pedidos pagos agrupados por cliente e endereço (aba A montar).',
        'Montar o envio: peças pagas em momentos diferentes viram um envio só.',
        'Conferir o aviso de peças ainda reservadas da cliente antes de seguir.',
        'O envio vai para a aba Conferência.'],
      entrega = 'Envio aguardando conferência',
      regras = 'Situações: aguardando conferência → conferida → frete cobrado → pronta → enviada → entregue. Se entrar peça nova depois da conferência, o envio volta para a bancada.',
      atualizado_em = now()
     where empresa_id = e and codigo = 'E23';

    -- E25 vem antes do frete e passa a ser a conferência por bipagem na Expedição
    update crm.cad_fluxo_etapa set ordem = 24, area = 'exp', responsavel = 'conferente', apoio = array['expedicao'],
      titulo = 'Conferir as peças, pesar e medir a caixa',
      tela = 'Clientes e pós-venda › Expedição › Conferência',
      entrada = 'Envio aguardando conferência',
      procedimento = array[
        'Bipar o código de barras da etiqueta de cada peça (leitor, coletor ou "Ler com a câmera" no celular); o código curto da live também localiza o envio.',
        'Conferir peça, cor, tamanho e estado contra o pedido; separar o que não bater.',
        'Embalar, pesar e medir a caixa (peso e dimensões reais).',
        'Fechar a conferência; se precisar refazer, reabrir.'],
      entrega = 'Envio conferido, com peso e medidas da caixa',
      impacto = 'Peça trocada gera devolução e frete em dobro. Peso chutado faz o frete cobrado não bater com o custo da postagem.',
      regras = 'Não se define frete de envio não conferido. A leitura pela câmera exige o painel em https. A unidade sai do estoque e o número curto volta a ficar livre.',
      situacao = 'uso', atualizado_em = now()
     where empresa_id = e and codigo = 'E25';

    -- E24: frete depois da conferência; título a receber nasce com a cobrança (0094e)
    update crm.cad_fluxo_etapa set ordem = 25,
      entrada = 'Envio conferido (peso e medidas)',
      procedimento = array[
        'Definir o valor, o serviço e o prazo do frete com o peso real, ou frete grátis para VIP.',
        'O frete vira cobrança própria (Pix ou link da Getnet) e nasce o título a receber do frete.',
        'Quando a Getnet confirma, o título é baixado e o envio fica pronto; Pix conferido à mão: "Frete pago".'],
      entrega = 'Envio pronto, com o frete recebido',
      regras = 'Só expede com o frete pago ou grátis. A cotação automática pelo Melhor Envio está cadastrada em Integrações › Fretes, mas ainda não consulta a API (só na simulação).',
      atualizado_em = now()
     where empresa_id = e and codigo = 'E24';

    -- E27: rastreio unificado e custo da postagem no financeiro (0094d e 0094e)
    update crm.cad_fluxo_etapa set
      procedimento = array[
        'Postar na transportadora.',
        'Em "Enviar", informar transportadora e código de rastreio: o rastreio fica em cada pedido com o link da transportadora.',
        'Registrar o custo da postagem: nasce o título a pagar (com baixa, se já foi pago).',
        'Avisar a cliente com /rastreio (agora preenche transportadora, código e link).',
        'Se errou antes de postar, "Desfazer envio" e corrigir.'],
      entrega = 'Envio enviado com rastreio e custo da postagem lançado',
      impacto = 'Sem rastreio o suporte não responde a cliente; sem o custo da postagem o resultado do frete fica inflado.',
      regras = 'A diferença entre o frete recebido e o custo da postagem aparece no envio como resultado do frete. Aviso automático no WhatsApp e rastreio pelo Melhor Envio ainda não existem.',
      atualizado_em = now()
     where empresa_id = e and codigo = 'E27';

    update crm.cad_fluxo_etapa set
      procedimento = array[
        'Acompanhar o rastreio até a entrega e marcar o envio como entregue.',
        'Criar compromisso de pós-venda e registrar a resposta da cliente.',
        'Encerrar só com resposta ou com o mínimo de tentativas.'],
      tela = 'Expedição › Enviadas; Agenda (pós-venda); Caixa de entrada; Parceiros',
      atualizado_em = now()
     where empresa_id = e and codigo = 'E28';

    update crm.cad_fluxo_etapa set
      procedimento = array[
        'Registrar o motivo no histórico da cliente.',
        'Faturista emite ou recebe a nota de devolução (entrada) no Bling.',
        'Conferente reconfere a peça e devolve ao estoque com nova etiqueta, se preciso.',
        'Financeiro estorna a baixa, devolve o valor ou gera adiantamento (crédito de loja) na Movimentação financeira.'],
      atualizado_em = now()
     where empresa_id = e and codigo = 'E29';

    -- financeiro: uma tela só (Movimentação financeira), permissão por usuário (052)
    update crm.cad_fluxo_etapa set
      titulo = 'Receitas: títulos a receber, baixas e taxas',
      tela = 'Financeiro › Movimentação financeira (filtro Receitas)',
      entrada = 'Cobranças pagas (frete hoje; peças quando o gateway estiver ligado) e lançamentos manuais',
      procedimento = array[
        'Conferir os títulos a receber: o do frete nasce com a cobrança e é baixado quando a Getnet confirma.',
        'Venda de balcão ou recebimento fora do gateway: + Receita e baixar com o tipo de título (a taxa entra na baixa).',
        'Cartão parcelado: um título por parcela, baixado no repasse; antecipação = baixa em lote.',
        'Adiantamento de cliente (sinal, crédito de loja): + Adiantamento e compensar na venda.'],
      entrega = 'Receita com natureza e centro de resultado do canal, baixada na conta',
      impacto = 'Taxa não lançada infla a margem da live.',
      regras = 'Cada pessoa só vê e faz o que foi liberado para ela (ver receitas, lançar, baixar, estornar...). Títulos das peças vendidas ainda não nascem sozinhos no pagamento do gateway: lançar à mão até lá.',
      situacao = 'impl', atualizado_em = now()
     where empresa_id = e and codigo = 'E30';

    update crm.cad_fluxo_etapa set
      titulo = 'Despesas: títulos a pagar e baixas',
      tela = 'Financeiro › Movimentação financeira (filtro Despesas)',
      procedimento = array[
        'Conferir os títulos que nasceram sozinhos: parcelas das NF-e de compra, rubricas e custo das postagens.',
        'Lançar despesas avulsas, parceladas e recorrentes (aluguel, software) e NFS-e com retenções (a guia nasce junto).',
        'Pagar: baixa simples, parcial, em lote ou compensação com receita do mesmo parceiro.',
        'Renegociar ou estornar quando preciso; nada se apaga, tudo fica no histórico do título.'],
      entrega = 'Despesas pagas e saldo por conta atualizado',
      regras = 'Permissão por usuário, ação por ação (Cadastros financeiros › Permissões por usuário). Período fechado bloqueia baixa e edição com data anterior. Provisão não se baixa: efetive ou substitua.',
      situacao = 'uso', atualizado_em = now()
     where empresa_id = e and codigo = 'E31';

    update crm.cad_fluxo_etapa set
      tela = 'Financeiro › Conciliação bancária; Contas e saldos',
      procedimento = array[
        'Importar o extrato OFX e conferir a prévia (período, entradas, saídas, saldo final).',
        'Aceitar as sugestões por valor, data e sentido, ou escolher o título.',
        'Criar título direto da linha para tarifa, IOF e DAS; ignorar o que não é da empresa.',
        'Conferir em Contas e saldos: saldo do sistema, conciliado e do extrato na data.',
        'Repasses da Getnet: conciliar pela linha do extrato (relatório de repasses pela API ainda não existe).'],
      regras = 'Movimento conciliado não se estorna: desconcilie antes. Conciliar exige a ação Conciliar liberada para o usuário.',
      situacao = 'uso', atualizado_em = now()
     where empresa_id = e and codigo = 'E32';

    update crm.cad_fluxo_etapa set
      tela = 'Início › Painel de Gestão; Financeiro › Contas e saldos, Natureza e Centro de resultado',
      procedimento = array[
        'Mapear categorias do Bling às naturezas (De-Para) e revisar as não mapeadas.',
        'Ver vendas, cancelamentos, devoluções e venda líquida por canal.',
        'Conferir o saldo de cada conta e o fluxo de caixa por dia.',
        'Fechar o período em Cadastros financeiros (bloqueia alterações com data anterior).',
        'Decidir as compras do próximo ciclo: volta à etapa 1.'],
      atualizado_em = now()
     where empresa_id = e and codigo = 'E33';

    perform crm._fluxo_revisar(e,
      'Atualização pelos pedidos 049, 051 e 052: conferência por bipagem antes do frete (etapa 24, antes era 25), título a receber do frete, custo da postagem e rastreio unificado na expedição; '
      || 'títulos a pagar automáticos da NF-e; financeiro em uma tela só (Movimentação financeira) com permissão por usuário, Contas e saldos e Conciliação bancária em uso.',
      array['E08','E09','E23','E24','E25','E27','E28','E29','E30','E31','E32','E33'], 'edicao');
  end loop;
end $m$;
