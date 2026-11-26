// Documentação viva do painel: um verbete por tela, com explicação, caso de uso, dicas e
// os passos do tutorial guiado. É a fonte única da ajuda no app e do manual espelhado no
// conhecimento do projeto. A cada deploy, revise o verbete da tela que mudou e suba a VERSAO_DOC
// (o script scripts/verificar-ajuda.mjs recusa o build se uma tela ativa ficar sem verbete).

export interface PassoTour {
  // alvo: seletor CSS do elemento a destacar. Vazio = cartão central (sem holofote).
  // Para apontar o elemento da tela aberta, use o escopo '.aba-painel:not([hidden])'.
  alvo?: string
  titulo: string
  texto: string
}

export interface Verbete {
  titulo: string
  explicacao: string   // o que é a tela, em 1-3 frases
  casoDeUso: string    // um exemplo concreto do dia a dia da Ane Brechó
  dicas: string[]      // atalhos e cuidados
  passos: PassoTour[]  // tutorial guiado da tela
}

export const VERSAO_DOC = '0.13.0'
export const ATUALIZADO_EM = '2026-11-26'

// escopo da tela aberta (só o painel visível responde aos seletores)
const T = '.aba-painel:not([hidden])'

export const AJUDA: Record<string, Verbete> = {
  pecas: {
    titulo: 'Peças',
    explicacao:
      'Cadastro das peças do brechó e suas grades (tamanho, cor e demais atributos). Cada peça guarda custo, preço, categoria, marca, condição e fotos. É daqui que nascem as unidades físicas e os números curtos das etiquetas.',
    casoDeUso:
      'Chegou um lote novo: você cadastra a peça, define a grade (P, M, G), informa o custo pela nota de entrada e o preço com a margem mínima. Ao salvar com grade, o painel oferece gerar as etiquetas com QR e número curto.',
    dicas: [
      'Use a foto de capa para a peça ser reconhecida na live e na vitrine.',
      'O custo vem da nota de entrada; o preço sai da margem mínima configurada — confira antes de publicar.',
      'Categoria, marca e condição ajudam os filtros, os relatórios e as campanhas de itens semelhantes.',
    ],
    passos: [
      { titulo: 'Peças', texto: 'Esta é a tela de cadastro das peças. Tudo começa aqui: é a peça que vira unidade física, etiqueta e item de venda na live.' },
      { alvo: `${T} .topo button`, titulo: 'Nova peça', texto: 'Clique aqui para cadastrar uma peça. Você informa nome, categoria, marca, condição, custo e preço, e monta a grade.' },
      { alvo: `${T} .busca`, titulo: 'Localizar', texto: 'Busque por nome, código ou marca. Os filtros ajudam a achar o que precisa de foto, preço ou revisão.' },
      { alvo: `${T} table`, titulo: 'Lista de peças', texto: 'Cada linha é uma peça. Clique em Editar para ajustar dados, fotos e grade, ou para gerar as etiquetas.' },
    ],
  },
  estoque: {
    titulo: 'Estoque',
    explicacao:
      'As unidades físicas de cada peça e onde elas estão guardadas. Uma peça com três unidades no mesmo tamanho tem três unidades aqui, cada uma com seu número curto rastreável.',
    casoDeUso:
      'Para saber se ainda há a peça AB-0342 no tamanho M, você filtra por peça e vê as unidades disponíveis, reservadas ou já vendidas, e em qual local estão.',
    dicas: [
      'Cada unidade tem número próprio; ao sair do estoque, o número volta para a fila e pode ser reaproveitado.',
      'Mantenha o local correto (estoque, loja, live) para a vitrine só mostrar o que é vendável.',
    ],
    passos: [
      { titulo: 'Estoque', texto: 'Aqui ficam as unidades físicas das peças, com estado (disponível, reservada, vendida) e local.' },
      { alvo: `${T} .busca`, titulo: 'Filtrar', texto: 'Filtre por peça ou local para encontrar rápido a unidade certa.' },
      { alvo: `${T} table`, titulo: 'Unidades', texto: 'Cada linha é uma unidade com seu código. É o que o cliente cita na live pelo número curto.' },
    ],
  },
  etiquetas: {
    titulo: 'Etiquetas e impressão',
    explicacao:
      'Geração das etiquetas com QR e número curto (até 4 dígitos), fila de impressão, impressoras, modelos e agentes de impressão. O número curto é o que os clientes usam na live.',
    casoDeUso:
      'Depois de cadastrar uma peça com grade, você manda imprimir as etiquetas. Se reimprimir uma já impressa, o painel avisa e registra data, hora e usuário.',
    dicas: [
      'A numeração reinicia quando a peça sai do estoque — números livres são reaproveitados (teto de 9999 em estoque).',
      'A reimpressão pede motivo e fica registrada; use quando a etiqueta danificar.',
      'Configure a impressora e o agente local antes da primeira leva de impressão.',
    ],
    passos: [
      { titulo: 'Etiquetas', texto: 'Central das etiquetas: número curto, QR, fila de impressão e configuração de impressoras e agentes.' },
      { alvo: `${T} table`, titulo: 'Fila e histórico', texto: 'Acompanhe o que foi enviado para impressão e o que já foi impresso, com data, hora e usuário.' },
    ],
  },
  saneamento: {
    titulo: 'Produtos Bling',
    explicacao:
      'Espelho dos produtos lidos do Bling, para conferir e sanear o cadastro antes de usar no CRM. Mostra duplicidades, dados faltantes e situação de cada produto.',
    casoDeUso:
      'Antes de uma live, você revisa os produtos trazidos do Bling: ajusta o que está sem grade ou sem preço e marca o que precisa de atenção.',
    dicas: [
      'A carga traz os dados como estão; a padronização acontece depois, já dentro do CRM.',
      'Use os filtros de situação e alerta para achar o que precisa de correção.',
    ],
    passos: [
      { titulo: 'Produtos Bling', texto: 'Aqui você confere e saneia os produtos vindos do Bling antes de usá-los no dia a dia.' },
      { alvo: `${T} .busca`, titulo: 'Filtros', texto: 'Filtre por situação, formato, grade ou alerta para focar no que precisa de ajuste.' },
    ],
  },
  fiscal: {
    titulo: 'Notas Bling',
    explicacao:
      'Notas fiscais emitidas trazidas do Bling, com itens, valores e links do DANFE/PDF. Base para custo das peças e para as consultas de vendas.',
    casoDeUso:
      'Para conferir o custo de entrada de um lote, você abre a nota correspondente e vê os itens e valores; o assistente também cita estas notas nas respostas.',
    dicas: [
      'Use o filtro por período para encontrar notas de um intervalo.',
      'O link do DANFE abre o documento oficial quando disponível.',
    ],
    passos: [
      { titulo: 'Notas Bling', texto: 'As notas fiscais emitidas, lidas do Bling, com itens e valores.' },
      { alvo: `${T} .busca`, titulo: 'Período e busca', texto: 'Filtre por período ou busque por número/cliente para achar a nota.' },
      { alvo: `${T} table`, titulo: 'Notas', texto: 'Clique numa nota para ver os itens, os valores e o link do DANFE.' },
    ],
  },
  parceiros: {
    titulo: 'Parceiros',
    explicacao:
      'Cadastro único de pessoas e empresas: clientes, fornecedores, transportadoras e funcionários, com um ID por CPF/CNPJ. O mesmo parceiro pode ter vários papéis. Cada parceiro reúne os seus contatos (vários @ do Instagram, WhatsApp e e-mail), os dados fiscais para a NF-e, as notas, as compras e, como cliente, reservas, fila, cancelamentos e devoluções. Quem chega só pelo Instagram, WhatsApp ou vitrine fica como pré-cadastro até informar o CPF no link de pagamento. Substitui a antiga tela Clientes.',
    casoDeUso:
      'A filha comenta na live pelo próprio @ e paga com o CPF da mãe, que já é cliente: a nota sai no nome da mãe e, com o pagamento aprovado, o @ da filha passa a aparecer em Contatos da mãe como familiar, sem criar cadastro duplicado.',
    dicas: [
      'Abra o parceiro pela aba Resumo: ela mostra os papéis, o que falta para emitir NF-e e os números de cliente, fornecedor e financeiro.',
      'Em Contatos você define o @ principal, o vínculo (titular, familiar, terceiro) e move um contato para outro parceiro, com motivo registrado.',
      'Use o filtro “Pré-cadastro (sem CPF/CNPJ)” para achar quem ainda não informou documento; “Juntar a outro parceiro” une um pré-cadastro ao cadastro certo.',
      'A aba Cadastro fiscal mostra de onde veio o endereço: Correios (padronizado pelo CEP) ou XML. A aba Origem Bling é só para auditoria dos contatos repetidos do Bling.',
      'A aba Documento valida CPF/CNPJ e consulta a Receita para o CNPJ.',
      'O link de pagamento atualiza o cadastro: nome civil, CPF (guardado cifrado), e-mail e endereço conferido pelo CEP dos Correios aparecem no Resumo.',
      'Aba Regras: marque a cliente como VIP (acumula peças e paga no fim do dia ou da live, com limite de peças e de valor) ou coloque na lista de bloqueio (ignorada na live, vitrine e mensagens; as tentativas ficam contadas).',
      'O botão “Bloquear @ ou WhatsApp” bloqueia direto pelo contato, mesmo sem cadastro. Os filtros VIP e Lista de bloqueio mostram quem está em cada regra.',
    ],
    passos: [
      { titulo: 'Parceiros', texto: 'Clientes, fornecedores, transportadoras e funcionários num cadastro só.' },
      { alvo: `${T} .busca`, titulo: 'Buscar parceiro', texto: 'Busque por nome, @, WhatsApp, últimos dígitos do CPF/CNPJ ou ID do Bling, e filtre por papel.' },
      { alvo: `${T} table`, titulo: 'Abrir o parceiro', texto: 'Clique numa linha para ver o resumo, os contatos, o cadastro fiscal e as notas.' },
    ],
  },
  envios: {
    titulo: 'Expedição',
    explicacao:
      'Cada peça é paga na hora. Aqui os pedidos pagos da mesma cliente e do mesmo endereço viram um envio só. Você define o frete (ou marca grátis): o frete vira uma cobrança separada. Quando o frete estiver pago, o envio sai com o código de rastreio.',
    casoDeUso:
      'A cliente comprou três peças na live, cada uma paga no Pix na hora. No fim do dia, “A montar” mostra a cliente com 3 pedidos. Você clica em Montar envio, informa o frete do SEDEX e a cliente recebe a cobrança do frete. Com o frete pago, você embala, informa o rastreio e o pedido passa para Enviado.',
    dicas: [
      'Para treinar o time, clique em Simular: abre clientes e pedidos fictícios com um roteiro de passos que se marcam sozinhos. Nada é gravado, cobrado ou enviado.',
      'Se a cliente ainda tem peças reservadas, o aviso sugere esperar: o que ela pagar depois entra no mesmo envio aberto.',
      'Cliente VIP aparece com o selo VIP: ela paga o acumulado no fim do dia ou da live (configure em Parceiros > Regras).',
      'Frete grátis deixa o envio pronto na hora, sem cobrança.',
      '“Frete pago” é para quando a cliente pagou fora do link (dinheiro, Pix direto); informe como conferiu.',
      'Desfazer envio devolve os pedidos para “A montar”. Não dá para desfazer depois do frete pago ou do envio.',
    ],
    passos: [
      { titulo: 'Expedição', texto: 'Junte as peças pagas, cobre o frete e registre o rastreio.' },
      { alvo: `${T} table`, titulo: 'A montar', texto: 'Clientes com pedidos pagos agrupados por endereço. Clique em Montar envio.' },
    ],
  },
  vendas: {
    titulo: 'Central de vendas',
    explicacao:
      'Coração da operação de live: a fila por peça, as reservas, os links de pagamento e o acompanhamento até a entrega. Cada peça tem um link único; quem demonstra interesse entra na fila com o canal de origem.',
    casoDeUso:
      'Na live, uma peça é arrematada: o primeiro da fila ganha 15 minutos para pagar. Se não pagar, passa para o próximo, e quem estava na fila é avisado se a peça sai.',
    dicas: [
      'O prazo padrão de pagamento é 15 minutos, configurável em Preferências da vitrine.',
      'A fila é única por peça, não importa o canal (Instagram, WhatsApp, live).',
      'O histórico mostra vendas perdidas por falta de estoque — insumo para campanhas de itens semelhantes.',
      '“Marcar pago” confirma um pagamento conferido fora do link (Pix no extrato, loja): a peça vira vendida, o pedido sai no nome de quem pagou e a fila é avisada.',
    ],
    passos: [
      { titulo: 'Central de vendas', texto: 'Aqui você acompanha ao vivo a fila de cada peça, as reservas e os links de pagamento.' },
      { alvo: `${T}`, titulo: 'Jornada da peça', texto: 'Cada peça mostra quem está na fila, quem reservou, o prazo e o estado do pagamento até a entrega.' },
    ],
  },
  atendimento: {
    titulo: 'Caixa de entrada',
    explicacao:
      'Todas as conversas com as clientes numa tela só: Direct do Instagram hoje e WhatsApp quando o canal for ligado. A resposta sai pelo mesmo canal de onde a cliente escreveu, sem abrir o app. Ao lado da conversa aparecem a etapa da venda (fila, reserva, Pix, pago, enviado), o último pedido e o rastreio.',
    casoDeUso:
      'A cliente pergunta no Direct se o Pix já foi gerado. A atendente abre a conversa, digita /pix e a mensagem entra pronta com o valor e o link dela; confere a prévia e envia. Depois marca a conversa como resolvida.',
    dicas: [
      'No “Ver exemplo” aparece o Roteiro de treino: abrir, assumir, responder, nota, etiqueta, resolver, bloquear um perfil que só atrapalha e ver as tentativas bloqueadas. Nada é gravado nem enviado.',
      'Admin e gestor têm o botão Bloquear na conversa (com motivo). Desbloquear devolve a pessoa às filas, à live e à vitrine.',
      'A visão “Bloqueados” mostra as conversas de quem está na lista de bloqueio: ficam fora das filas, só para consulta. O número “Tentativas bloqueadas” conta as tentativas na live, vitrine e mensagens (passe o mouse para ver por origem).',
      'Digite / no campo de mensagem para buscar uma resposta pronta pelo atalho (ex.: /link, /pix, /rastreio). Setas escolhem, Enter usa.',
      'Se a cliente não tiver o dado de uma variável (ex.: sem reserva ativa), a prévia avisa e o envio fica travado até você ajustar o texto.',
      'O Instagram só deixa responder até 24 h depois da última mensagem da cliente; entre 24 h e 7 dias a resposta vai com a etiqueta de atendimento humano.',
      'No WhatsApp também vale a janela de 24 h; fora dela só modelo aprovado pela Meta. Cada número tem 1.000 respostas grátis por mês; depois, cada resposta é cobrada pela Meta — prefira uma mensagem completa a várias curtas.',
      '"Nota interna" grava um recado para a equipe na conversa, sem enviar nada à cliente.',
      'Cada conversa mostra como a cliente chegou: comentário na live, clique na vitrine (story, feed, grupo), link "Quero A123" ou mensagem direta. Filtre por origem e por canal para ver de onde vem o movimento.',
      'O botão "Ver exemplo" enche a tela com conversas fictícias para treinar a equipe e entender a visão. Nada é gravado nem enviado.',
      'A faixa do WhatsApp mostra quantas das 1.000 respostas grátis do mês já foram usadas; perto do limite, prefira responder pelo app Business.',
      'Se aparecer o aviso de que outra pessoa está com a conversa aberta, combinem antes de responder para não duplicar.',
      'Enquanto o canal estiver desligado ou em teste em Integrações, a mensagem fica registrada como "Não enviada" ou "Simulada", com o motivo.',
    ],
    passos: [
      { titulo: 'Caixa de entrada', texto: 'Aqui chegam as mensagens das clientes. As que esperam resposta ficam destacadas no topo da lista.' },
      { alvo: `${T} .at-visao`, titulo: 'Minhas e sem responsável', texto: 'Filtre as conversas que são suas ou as que ainda não têm ninguém cuidando. "Assumir" coloca a conversa no seu nome.' },
      { alvo: `${T} .at-lista`, titulo: 'Lista de conversas', texto: 'Cada conversa mostra o canal, a etapa da venda e as etiquetas. O número em destaque são mensagens não lidas.' },
    ],
  },
  respostas_prontas: {
    titulo: 'Respostas prontas',
    explicacao:
      'Biblioteca de mensagens padrão com variáveis, como {{cliente.primeiro_nome}}, {{reserva.link}}, {{cobranca.valor}} e {{envio.codigo_rastreio}}. Na Caixa de entrada, as variáveis são trocadas pelos dados reais da cliente na hora de enviar.',
    casoDeUso:
      'A administradora cria a resposta /rastreio: "Seu pedido {{pedido.numero}} foi enviado pela {{envio.transportadora}}. Código: {{envio.codigo_rastreio}}". A equipe responde a dúvida de entrega em segundos, sem copiar código de outro sistema.',
    dicas: [
      'Só o administrador cria e edita; a equipe usa todas pela Caixa de entrada.',
      'Clique numa variável para inseri-la onde está o cursor. A prévia mostra como a mensagem sai, com dados fictícios.',
      'Use atalhos curtos e fáceis de lembrar (pix, link, prazo, rastreio). O contador de usos mostra quais respostas a equipe mais usa.',
      'Desative em vez de apagar: a resposta some da equipe, mas o histórico das conversas continua mostrando qual foi usada.',
    ],
    passos: [
      { titulo: 'Respostas prontas', texto: 'Aqui ficam os modelos de mensagem da equipe, organizados por categoria.' },
      { alvo: `${T} .rp-vars`, titulo: 'Variáveis', texto: 'Veja quais dados podem entrar nas mensagens e de onde cada um vem (reserva, fila, Pix, pedido, envio).' },
    ],
  },
  agenda: {
    titulo: 'Agenda',
    explicacao:
      'Compromissos da operação em um só lugar: lives, follow-up de cliente, pós-venda, lembretes e tarefas internas. Qualquer pessoa da equipe cria e atribui a outra. Follow-up e pós-venda ficam abertos até serem resolvidos com a resposta da cliente registrada, ou encerrados com motivo. Com o convite ligado, cada compromisso chega ao e-mail do responsável para entrar no calendário (Gmail, Outlook, Apple).',
    casoDeUso:
      'A reserva de uma cliente venceu sem pagamento. A suporte cria um follow-up para amanhã às 10h vinculado à cliente, registra a tentativa pelo WhatsApp e, quando a cliente responde, anota o que foi combinado e resolve.',
    dicas: [
      'Comece o dia pela aba Minha fila: atrasados, hoje, aguardando cliente e próximos 7 dias.',
      'Registre cada tentativa de contato. Encerrar por falta de resposta exige o mínimo de tentativas definido na Configuração (padrão 3).',
      'Não escreva telefone, CPF ou endereço no título: ele vai para o calendário do e-mail.',
      'No calendário, os filtros de tipo e "Só os meus" ajudam a ver a semana de cada pessoa.',
      'Visões Dia, Semana e Mês (padrão) no canto do calendário; a escolha fica guardada. Clique num espaço vazio (dia, coluna da semana ou faixa de hora) para incluir um compromisso já com a data e a hora.',
      'Clique no compromisso para editar; arraste para outro dia para remarcar (a hora se mantém) ou, na visão Dia, para outra hora. Dá para desfazer logo depois.',
      'Cores: vermelho piscando é atraso, dourado piscando começa em até 30 min, âmbar aguarda resposta da cliente. A legenda fica abaixo do calendário.',
      'Os lembretes aparecem em qualquer tela do painel, no canto inferior direito: Abrir, Adiar 10 min ou Dispensar. Uma vez por dia aparece o resumo dos atrasados.',
    ],
    passos: [
      { titulo: 'Agenda', texto: 'Compromissos da equipe: lives, follow-up, pós-venda, lembretes e tarefas.' },
      { alvo: `${T} .abas-pagina`, titulo: 'Minha fila e Calendário', texto: 'Minha fila mostra o que é seu para fazer; o Calendário mostra o mês com todos os compromissos, por tipo e por pessoa.' },
      { alvo: `${T} .topo button`, titulo: 'Novo compromisso', texto: 'Escolha o tipo, a data e o responsável; vincule a cliente quando for follow-up ou pós-venda.' },
    ],
  },
  dashboards: {
    titulo: 'Painel de Gestão',
    explicacao:
      'Visão gerencial em duas abas. Vendas: pedidos (ou notas fiscais), cancelamentos, devoluções, venda líquida e ticket médio, por canal e comparados com o período anterior, com a lista de lançamentos ao clicar. Financeiro: contas a pagar, pagas, a receber e recebidas, fluxo de caixa e saldo.',
    casoDeUso:
      'No fechamento você vê quanto vendeu no mês, em que canal, quantos pedidos caíram, e clica na barra de uma semana para listar os pedidos. Na aba Financeiro cruza entradas e saídas dia a dia para ver se algum dia o caixa fica negativo e abre os títulos daquele dia.',
    dicas: [
      'Base “Pedidos” inclui vendas sem nota fiscal; “Notas fiscais” mostra só o que foi emitido. Devolução vem sempre das notas de entrada.',
      'Clique em cartões, barras, canais e dias do fluxo para abrir a grade de lançamentos ou de títulos.',
      'Canais: mapeie cada loja do Bling a um canal em “Mapear lojas”. Canais sem movimento aparecem zerados.',
      'Financeiro: informe o saldo da conta em uma data (parâmetro). Sem ele o fluxo parte de zero. “Recebido” usa o vencimento como data.',
      'Valores em R$ e a aba Financeiro são de administração, gestão e financeiro; os demais perfis veem quantidades.',
    ],
    passos: [
      { titulo: 'Painel de Gestão', texto: 'Resumo do negócio no período escolhido, comparado com o período anterior de mesma duração.' },
      { alvo: `${T} [data-ajuda="base"]`, titulo: 'Base das vendas', texto: 'Escolha entre pedidos de venda do Bling (inclui vendas sem nota) e notas fiscais de saída.' },
      { alvo: `${T} .gs-ctl`, titulo: 'Período', texto: 'Escolha um atalho ou um intervalo de datas. O período anterior tem a mesma duração, logo antes.' },
      { alvo: `${T} .gs-kpis`, titulo: 'Indicadores', texto: 'Cada cartão compara com o período anterior. Clique num cartão para listar os lançamentos por trás do número.' },
      { alvo: `${T} .gs-grade`, titulo: 'Canais e cascata', texto: 'Vendas por canal (todos os canais aparecem, mesmo zerados) e a cascata das vendas até a venda líquida. Clique para detalhar.' },
    ],
  },
  assistente: {
    titulo: 'Assistente de IA',
    explicacao:
      'Perguntas em linguagem natural sobre a operação. Responde com dados (vendas, estoque, fila, cobranças) e com conhecimento (regras e processos), sempre citando a fonte. O assistente só lê — nunca altera Bling, redes ou pagamentos.',
    casoDeUso:
      'Você pergunta “quanto vendemos nas últimas 4 lives?” ou “essa cliente já cancelou antes?” e recebe a resposta com os atalhos para as notas, clientes e pedidos citados.',
    dicas: [
      'Para números, seja específico (período, cliente, peça); para regras, pergunte “como” ou “por quê”.',
      'Clique nas fontes citadas para abrir a nota, o cliente ou o pedido referenciado.',
      'Dados sensíveis são mascarados antes de qualquer envio ao provedor de IA.',
    ],
    passos: [
      { titulo: 'Assistente', texto: 'Pergunte em português sobre vendas, estoque, fila e regras. Ele responde com dados e cita as fontes.' },
      { alvo: `${T}`, titulo: 'Converse', texto: 'Digite a pergunta. Use o histórico e os atalhos para abrir o que foi citado.' },
    ],
  },
  contas_receber: {
    titulo: 'Contas a receber',
    explicacao:
      'Títulos a receber de clientes: vendas, recibos, adiantamentos e renegociações. Cada título tem natureza, centro de resultado, tipo de título (PIX, cartão, boleto) e situação: em aberto, vencido, baixa parcial, baixado, conciliado com o banco, renegociado, provisão ou cancelado. Nada é enviado ao Bling.',
    casoDeUso:
      'Uma cliente fechou 3 peças em 2 parcelas no cartão. Lance o título com 2 parcelas e tipo Cartão de crédito. Quando a operadora pagar, selecione as duas parcelas e faça uma baixa só, com a taxa descontada; o valor líquido cai na conta escolhida.',
    dicas: [
      'Clique nos chips de situação para combinar filtros; os números mostram quantos títulos há em cada uma.',
      'Valor menor que o saldo faz baixa parcial: o restante continua em aberto no mesmo título.',
      'Selecione vários títulos para receber em lote (um movimento só na conta) ou renegociar (mesmo cliente).',
      'Parcelas de um parcelamento não se cancelam uma a uma: cancele o grupo inteiro ou a partir de uma parcela.',
      'O título renegociado continua visível; a aba Vínculos mostra os títulos novos e permite desfazer enquanto não houver baixa.',
      'Provisão é um valor estimado: efetive quando o documento real chegar ou substitua pelo título real.',
    ],
    passos: [
      { alvo: `${T} .fin-chips`, titulo: 'Situações', texto: 'Filtre por situação. Em aberto, vencido e baixa parcial vêm marcados por padrão.' },
      { alvo: `${T} .gd`, titulo: 'Títulos', texto: 'Marque a caixa para selecionar e clique na linha para abrir a composição, o rateio, as baixas e os vínculos.' },
      { titulo: 'Receber', texto: 'Com títulos selecionados, use “Receber”. Informe data, conta, juros, multa, desconto e taxa; o painel mostra quanto entra na conta.' },
      { titulo: 'Novo título', texto: 'Use “+ Novo título” para recibos, parcelamentos, recorrências ou saldos de implantação, com rateio por natureza, centro de resultado e projeto.' },
    ],
  },
  contas_pagar: {
    titulo: 'Contas a pagar',
    explicacao:
      'Títulos a pagar a fornecedores: parcelas das NF-e de compra (geradas na Entrada de mercadoria), NFS-e de serviços com retenções, boletos, guias de impostos, fretes, comissões e tarifas. Mesma lógica de situações, baixas, renegociação e vínculos de Contas a receber.',
    casoDeUso:
      'O contador emitiu uma NFS-e de R$ 1.000 com ISS retido de R$ 50. Lance como “NFS-e recebida”, informe o ISS e marque que a Ane recolhe: o fornecedor recebe R$ 950 e o CRM gera a guia de R$ 50 para a prefeitura, ligada ao título.',
    dicas: [
      'Títulos de NF-e de compra têm valor, fornecedor e vencimento travados: alterações são feitas na Entrada de mercadoria.',
      'Retenções da NFS-e entram na 1ª parcela e reduzem o valor líquido; as guias aparecem na aba Vínculos.',
      'Adiantamento a fornecedor registra a saída do dinheiro e cria um crédito a receber; use a compensação para abater na conta a pagar.',
      'Baixa já conciliada com o extrato não se estorna: desfaça a conciliação antes.',
    ],
    passos: [
      { alvo: `${T} .resumo-faixa`, titulo: 'Resumo', texto: 'Total em aberto, vencido e provisões do filtro atual.' },
      { alvo: `${T} .gd`, titulo: 'Títulos', texto: 'Selecione para pagar ou renegociar; clique para abrir o detalhe.' },
      { titulo: 'NFS-e', texto: 'Em “+ Novo título”, escolha “NFS-e recebida” para informar ISS, IRRF, INSS e PIS/COFINS/CSLL retidos.' },
    ],
  },
  contas_bancarias: {
    titulo: 'Contas e saldos',
    explicacao:
      'Saldo de cada conta bancária, caixa e carteira de gateway em uma data escolhida, em três visões: no sistema (todas as baixas até a data), conciliado (só o conferido com o extrato, pela data em que caiu no banco) e no extrato importado. Mostra os movimentos com saldo linha a linha e permite transferir entre contas.',
    casoDeUso:
      'No fim do mês, escolha o último dia em “Saldo em” e confira cada conta: se o conciliado é igual ao extrato, a conta está fechada. A diferença entre sistema e conciliado é o que ainda não apareceu no banco.',
    dicas: [
      'Clique no cartão da conta para ver os movimentos do período.',
      'Transferência entre contas não afeta o DRE; só se estorna enquanto não estiver conciliada.',
      'O saldo inicial de cada conta é cadastrado em Cadastros financeiros, na data de implantação.',
    ],
    passos: [
      { alvo: `${T} .fin-contas`, titulo: 'Contas', texto: 'Cada cartão mostra o saldo no sistema, o conciliado, o que falta conciliar e a comparação com o extrato.' },
      { titulo: 'Saldo em', texto: 'Mude a data para ver o saldo de qualquer dia passado.' },
    ],
  },
  conciliacao: {
    titulo: 'Conciliação bancária',
    explicacao:
      'Importa o extrato OFX do banco (lido no navegador) e liga cada linha a um movimento do sistema. Compara dia a dia o saldo do extrato com o saldo conciliado e confere o saldo final informado pelo banco com o calculado pelas linhas.',
    casoDeUso:
      'Baixe o OFX do Itaú da semana e importe. As linhas com o mesmo valor de uma baixa próxima já vêm com sugestão: clique em Conciliar. A tarifa do banco, que não existe no sistema, vira título com “Criar título”, já baixado e conciliado.',
    dicas: [
      'Ao conciliar, o movimento passa a contar no saldo conciliado pela data do banco, mesmo que a baixa tenha outra data.',
      'Importar o mesmo arquivo de novo não duplica linhas: o identificador de cada lançamento do banco é único.',
      'Na aba Saldo dia a dia, dias com diferença mostram onde falta conciliar.',
      'Use “Ignorar” só para linhas que não têm efeito no sistema (ex.: estorno do próprio banco no mesmo dia).',
    ],
    passos: [
      { titulo: 'Importar', texto: 'Escolha a conta e clique em “Importar OFX”. Confira o período e o saldo final antes de confirmar.' },
      { alvo: `${T} .resumo-faixa`, titulo: 'Saldos', texto: 'Extrato, conciliado e a diferença na data escolhida. “Confere” quando estão iguais.' },
      { alvo: `${T} .gd`, titulo: 'Linhas', texto: 'Concilie pela sugestão, escolha outro movimento, crie um título ou ignore a linha.' },
    ],
  },
  cadastros_financeiro: {
    titulo: 'Cadastros financeiros',
    explicacao:
      'Contas bancárias com saldo inicial, tipos de título (meio de pagamento, taxa, dias para compensar e conta padrão), projetos usados no rateio e os parâmetros que definem em qual natureza entram juros, multas, descontos, taxas, adiantamentos, retenções e transferências.',
    casoDeUso:
      'Na implantação, cadastre o Itaú, o caixa da loja e a carteira do Mercado Pago com o saldo do dia de corte. No tipo Cartão de crédito, informe a taxa da operadora para que a baixa calcule o valor líquido.',
    dicas: [
      'Contas e tipos não se excluem: inative.',
      'O código do tipo de título não muda depois de criado.',
      'Só administrador e gestor alteram os parâmetros; “Período fechado até” bloqueia lançamentos e baixas em datas já fechadas.',
    ],
    passos: [
      { alvo: `${T} .abas-pagina`, titulo: 'Quatro áreas', texto: 'Contas bancárias, Tipos de título, Projetos e Parâmetros.' },
      { titulo: 'Contas', texto: 'Clique em uma conta para editar ou use “+ Nova conta”.' },
    ],
  },
  naturezas: {
    titulo: 'Natureza financeira',
    explicacao:
      'Define o que é cada receita, custo ou despesa, em até 4 níveis (9.99.99.999). Só o 4º nível recebe lançamentos; os demais agrupam e somam. Cada natureza aponta para uma linha do DRE. Tudo é gerencial no CRM: nada é enviado ao Bling.',
    casoDeUso:
      'Uma conta de energia chega do Bling com uma categoria de utilidades. O De-Para leva essa categoria para a natureza correspondente e a regra por fornecedor indica o centro de resultado de administração.',
    dicas: [
      'O código é gerado sozinho ao criar uma natureza; ele e o pai não mudam depois.',
      'Natureza em uso (com lançamentos) não pode ser excluída nem perder o nível analítico: inative.',
      'Natureza de receita, dedução ou CMV só aceita centro de resultado de canal.',
      'Na aba De-Para, categorias em amarelo ainda não foram mapeadas.',
      'Regras não são excluídas: desligue a regra para parar de usá-la. Cada edição aumenta a versão.',
    ],
    passos: [
      { alvo: `${T} .abas-pagina`, titulo: 'Três áreas', texto: 'Árvore de naturezas, De-Para das categorias do Bling e Regras de apropriação.' },
      { titulo: 'Criar', texto: 'Use “+ Filha” na natureza pai (sintética). O sinal, o DRE e o centro padrão são herdados do pai e podem ser ajustados.' },
      { titulo: 'De-Para', texto: 'Escolha a natureza analítica de cada categoria do Bling ou marque “ignorar” para os grupos do Bling sem lançamento.' },
    ],
  },
  centros_resultado: {
    titulo: 'Centro de resultado',
    explicacao:
      'Define quem responde pelo resultado: área, departamento ou canal de venda (por exemplo Instagram Lives, WhatsApp, Loja física). Não é o tipo de gasto; isso é a Natureza. Cada lançamento recebe uma natureza e um centro de resultado.',
    casoDeUso:
      'Para ver quanto o Instagram realmente deixa de resultado, a receita e o CMV entram nos centros de canal e as despesas de marketing e expedição são apropriadas aos centros de apoio.',
    dicas: [
      'Receita só entra em centro analítico do tipo canal que aceita receita.',
      'O grupo 9 (Sem centro de resultado) é usado pelo motor para o que ainda não foi classificado e não pode ser excluído.',
      'Centro com lançamentos, regras ou filhos não pode ser excluído: inative.',
      'O código (9.99.99.999) é gerado automaticamente e não muda.',
    ],
    passos: [
      { titulo: 'Criar', texto: 'Use “+ Nova área” para o nível 1 ou “+ Filho” em um centro agrupador.' },
      { titulo: 'Canal', texto: 'Para um centro de canal que recebe receita, marque “Aceita receita” e escolha o canal do CRM.' },
    ],
  },
  entrada_compra: {
    titulo: 'Entrada de mercadoria (NF-e)',
    explicacao:
      'Importa o XML da NF-e de compra, cadastra as peças novas (grupo, marca, características e grade), rateia frete e despesas no custo, confere o financeiro da nota e dá entrada no estoque do CRM. Linhas que chegam sem tamanho nem cor são desmembradas em produtos por modelo/cor e tamanho. Nada é enviado ao Bling.',
    casoDeUso:
      'Nota completa: chegou a nota do fornecedor, você importa o XML, aceita as sugestões de cadastro, revisa cada peça e libera, confere as parcelas e confirma. As peças nascem com o custo fechado com a nota. ' +
      'Nota genérica (exemplo real, nota 19052 da Hush): 14 linhas e 230 peças, todas sem tamanho nem cor, como “BLUSA LESE DET/RENDA COM BOTOES”, 22 un. a R$ 13,00 (R$ 286,00). Em “Itens sem tamanho” você desmembra essa linha em produtos, por exemplo Blusa Renda Preto (P 3, M 5, G 2) e Blusa Renda Off-white (P 4, M 4, G 4). ' +
      'O contador mostra quantas faltam até fechar as 22 e o valor da linha se reparte sozinho, a R$ 13,00 cada. Repita para as outras linhas, use “Sugerir cadastro”, revise, libere, confira o financeiro e confirme.',
    dicas: [
      'Ao importar, o fornecedor (novo ou já cadastrado) recebe os dados do XML: CNPJ completo, inscrição, telefone e endereço. O endereço usa a descrição dos Correios pelo CEP; se o CEP não for confiável, fica o do XML. Veja na aba Cadastro do parceiro.',
      'A confirmação só libera com fornecedor vinculado, todas as peças revisadas e liberadas, diferença de R$ 0,00 e financeiro conferido.',
      'Qualquer mudança no rateio, nas rubricas ou no regime tira a liberação das peças afetadas: revise de novo.',
      'Se o fornecedor não existir, a importação oferece cadastrá-lo com o CNPJ da nota.',
      'Se o XML não trouxer parcelas, informe vencimento, valor, natureza e centro de resultado na seção Financeiro.',
      'O financeiro fica vinculado à nota (número e chave). Lançamentos criados direto, sem nota, não têm esse vínculo.',
      'Recomendação: desmembre os itens sem tamanho antes de revisar o resto. Enquanto a soma das quantidades não fechar com a da linha, o desmembramento não salva.',
      'Todo produto tem tipo de grade. O tipo vem sugerido pela descrição e pode ser trocado (ao trocar, somem as quantidades de tamanhos que a nova grade não tem). Peça sem tamanho usa “Acessório · tamanho único”, para a decisão ficar explícita e não ser esquecida.',
      'Use “Repartir o que falta igualmente” para dar um ponto de partida e “Duplicar” quando outro modelo ou cor tem a mesma grade; depois ajuste as quantidades à mão.',
      'Não confie no NCM para escolher a categoria: alguns fornecedores mandam NCM de tecido em peça pronta. A sugestão de grupo e de cor parte da descrição; confira e corrija se preciso.',
      'Os avisos da importação só informam, não bloqueiam: frete por conta do destinatário sem valor na nota (lance o frete pago à transportadora como rubrica extra), transportadora “O PROPRIO”, fornecedor do Simples sem crédito de ICMS (os três regimes dão o mesmo custo), nota emitida há mais de 90 dias (confirme que não deu entrada antes) e pagamento sem parcelas (informe os vencimentos).',
      'Código do fornecedor repetido em outra nota: só é lembrado quando a linha virou uma única peça. Linha desmembrada em várias peças não é memorizada, então cada nota é cadastrada de novo.',
    ],
    passos: [
      { titulo: 'Importar', texto: 'Clique em “Importar XML”, confira o resumo e o fornecedor e importe.' },
      { titulo: 'Itens sem tamanho', texto: 'Se houver linhas sem tamanho, clique em “Desmembrar”: inclua um produto por modelo ou cor, escolha o tipo de grade e informe a quantidade por tamanho até o contador fechar.' },
      { titulo: 'Peças', texto: 'As peças vêm abertas. Ajuste grupo, marca, características e grade, e use “Revisei: liberar peça”.' },
      { titulo: 'Rateio e financeiro', texto: 'Escolha o regime, lance rubricas extras se houver e confira as parcelas.' },
      { titulo: 'Confirmar', texto: 'Com todos os itens do checklist marcados, escolha o local do estoque e confirme.' },
    ],
  },
  grupos_produto: {
    titulo: 'Grupos de produto',
    explicacao:
      'Organiza o catálogo em até 4 níveis (departamento, família, tipo de peça e subtipo) para relatórios de venda, margem e estoque por grupo. Marca, material e comprimento ficam no produto, como características, e não na árvore. Tudo é gerencial no CRM: nada é enviado ao Bling.',
    casoDeUso:
      'Os produtos que o motor não reconheceu caem em “A classificar”. Você filtra por essa fila, seleciona os que são, por exemplo, “Tricô”, e move todos para o grupo certo de uma vez, marcando também o material.',
    dicas: [
      'Só grupos analíticos recebem produtos; grupos sintéticos apenas organizam a árvore.',
      'O que você altera à mão (grupo, marca ou característica) nunca é sobrescrito quando as regras são reaplicadas.',
      'Cadastre uma palavra na aba Regras para o motor classificar sozinho os próximos produtos parecidos, depois use “Reaplicar regras”.',
      'Com todos os itens da página marcados, aparece “Selecionar todos do filtro” para alterar milhares de uma vez (até 20.000 por operação).',
      'No campo Marca, ao clicar ou digitar aparecem as marcas já cadastradas: escolha da lista para manter o nome padronizado. Uma marca nova é cadastrada ao salvar.',
      '“Só com estoque” usa o estoque do CRM (unidades disponíveis ou reservadas das Peças). Produto do Bling que ainda não virou Peça aparece sem estoque.',
    ],
    passos: [
      { alvo: `${T} .abas-pagina`, titulo: 'Três áreas', texto: 'Produtos (classificação e lote), Árvore de grupos (cadastro) e Regras e características (palavras que o motor usa).' },
      { titulo: 'Fila “A classificar”', texto: 'A tela abre filtrada nos produtos pendentes. Filtre por busca, grupo, marca, característica ou estoque para achar os que quer ajustar.' },
      { titulo: 'Alterar em lote', texto: 'Marque os produtos, clique em “Alterar em lote…” e escolha grupo, marca e características. Cada campo pode ser mantido, definido ou removido.' },
      { titulo: 'Árvore', texto: 'Na aba Árvore de grupos você cria, move e inativa grupos. Um grupo só pode ser excluído quando não tem produtos nem subgrupos.' },
    ],
  },
  grades: {
    titulo: 'Grades e atributos',
    explicacao:
      'Configuração das grades (tamanhos, cores e outros atributos) e do vínculo com o Bling. Define as combinações que as peças podem assumir.',
    casoDeUso:
      'Você cria a grade de numeração de calçados ou de tamanhos de roupa para reaproveitar em todas as peças daquele tipo.',
    dicas: ['Padronize as grades antes de cadastrar muitas peças — evita retrabalho e divergência com o Bling.', 'Peça sem tamanho usa a grade “Acessório · tamanho único” (tamanho Único): a entrada de mercadoria exige tipo de grade em todo produto.'],
    passos: [
      { titulo: 'Grades', texto: 'Defina aqui os tamanhos, cores e atributos usados no cadastro das peças.' },
    ],
  },
  locais: {
    titulo: 'Locais',
    explicacao:
      'Locais onde as peças ficam guardadas (estoque principal, loja física, live). Cada unidade do estoque fica em um local, e o local diz se a peça é vendável.',
    casoDeUso:
      'Você cria o local “Live” para separar as peças que vão ao ar e manter o estoque principal organizado.',
    dicas: ['Marque como vendável só os locais de onde realmente se vende; a vitrine respeita isso.'],
    passos: [
      { titulo: 'Locais', texto: 'Cadastre os locais de estoque antes de registrar unidades.' },
      { alvo: `${T} .topo button`, titulo: 'Novo local', texto: 'Crie um local e defina se as peças dele podem ser vendidas.' },
    ],
  },
  preferencias_vitrine: {
    titulo: 'Preferências da vitrine',
    explicacao:
      'Parâmetros da vitrine pública e da central de reservas: ordem das fotos, o que a cliente vê na fila, prazo da reserva, aviso de peça vendida, tema e demais ajustes.',
    casoDeUso:
      'Você define o prazo de reserva em 15 minutos, liga o aviso “Avise-me” para peças vendidas e escolhe o tema da vitrine com as cores da Ane Brechó.',
    dicas: [
      'O prazo padrão recomendado é 15 minutos — ajuste conforme o ritmo das suas lives.',
      'O aviso de peça vendida pode sugerir peças parecidas e capturar interesse.',
    ],
    passos: [
      { titulo: 'Preferências da vitrine', texto: 'Ajuste aqui como a vitrine e a fila se comportam para o público.' },
      { alvo: `${T}`, titulo: 'Parâmetros', texto: 'Prazo da reserva, ordem de fotos, avisos e tema ficam todos nesta tela.' },
    ],
  },
  integracoes: {
    titulo: 'Integrações',
    explicacao:
      'Conexões externas: Bling, Meta/Instagram, WhatsApp, gateway de pagamento e IA (chat e vetor). Cada integração tem modo (desligado, simulado, real), parâmetros e teste. Alterar é só do administrador.',
    casoDeUso:
      'Você cola a chave de IA uma única vez, testa a conexão e só então muda o modo para real — a chave vai direto para o cofre, nunca volta para a tela.',
    dicas: [
      'Suba para o modo real só depois de um teste recente com sucesso.',
      'Segredos (chaves, tokens) são gravados no cofre e nunca aparecem de novo na tela.',
      'A URL base só aceita hosts conhecidos — é uma proteção contra desvio da chave.',
    ],
    passos: [
      { titulo: 'Integrações', texto: 'Conecte Bling, redes, pagamento e IA. Cada uma tem modo, parâmetros, segredo no cofre e teste.' },
      { alvo: `${T}`, titulo: 'Configurar e testar', texto: 'Preencha os parâmetros, salve o segredo e rode o teste antes de ir para o modo real.' },
    ],
  },
  conhecimento: {
    titulo: 'Base de conhecimento',
    explicacao:
      'Documentos e regras que o assistente consulta (busca por texto e por vetor). É aqui que entram políticas de reserva, cancelamento, comissão, frete e o roteiro da live.',
    casoDeUso:
      'Você sobe o documento de regras de devolução; a partir daí o assistente passa a responder dúvidas sobre devolução citando esse documento.',
    dicas: [
      'Quanto melhores os documentos, melhores as respostas do assistente.',
      'Dados sensíveis são mascarados antes de indexar (CPF, e-mail, telefone).',
      'Desativar uma fonte tira o conteúdo das respostas sem apagar o histórico.',
    ],
    passos: [
      { titulo: 'Base de conhecimento', texto: 'Suba aqui as regras e documentos que o assistente usa para responder.' },
      { alvo: `${T}`, titulo: 'Fontes', texto: 'Cada fonte vira trechos pesquisáveis. Ative/desative conforme a necessidade.' },
    ],
  },
  usuarios: {
    titulo: 'Usuários e acessos',
    explicacao:
      'Inclusão de usuários da equipe, com grupos de acesso e convite por e-mail para a pessoa criar a própria senha. Reúne quem entra no painel e com qual perfil.',
    casoDeUso:
      'Entrou uma consultora nova: você a convida por e-mail, escolhe o grupo de acesso e ela cria a senha pelo link do convite.',
    dicas: [
      'Use grupos de acesso para liberar várias telas de uma vez, em vez de permissão a permissão.',
      'O convite expira; se a pessoa demorar, reenvie um novo.',
    ],
    passos: [
      { titulo: 'Usuários e acessos', texto: 'Convide a equipe e defina o perfil de acesso de cada pessoa.' },
      { alvo: `${T} .topo button`, titulo: 'Convidar', texto: 'Envie o convite por e-mail; a pessoa cria a própria senha pelo link.' },
    ],
  },
  permissoes: {
    titulo: 'Permissões',
    explicacao:
      'Matriz de permissões por tela e papel. Define, para cada papel (gestor, suporte, apresentadora, expedição, financeiro, leitura), se vê, edita ou não acessa cada tela. O banco também aplica essas regras.',
    casoDeUso:
      'Você libera a Central de vendas para o suporte editar e deixa o financeiro só com visão, sem precisar mexer em código.',
    dicas: [
      'A matriz restringe o que o painel mostra; o banco continua protegendo por papel.',
      'Há um botão para restaurar o padrão por papel se algo ficar confuso.',
    ],
    passos: [
      { titulo: 'Permissões', texto: 'Defina quem vê e quem edita cada tela, por papel.' },
      { alvo: `${T}`, titulo: 'Matriz', texto: 'Marque ver/editar/nenhum para cada cruzamento de tela e papel e salve.' },
    ],
  },
  governanca: {
    titulo: 'Central de governança',
    explicacao:
      'Onde as dúvidas e ocorrências do uso do painel são registradas, triadas e resolvidas. Qualquer pessoa pode relatar pelo menu de Ajuda; a gestão acompanha o estado (aberto, em análise, resolvido, descartado) e deixa o aprendizado documentado. Dados sensíveis são mascarados no registro.',
    casoDeUso:
      'Uma apresentadora não entende por que uma peça saiu da fila; ela relata pela Ajuda. O item chega aqui com a tela de origem, é analisado, resolvido e vira nota de aprendizado para evitar a dúvida de novo.',
    dicas: [
      'Classifique entre dúvida, ocorrência (algo deu errado) e sugestão para priorizar certo.',
      'Resolva com uma nota clara: ela alimenta a base de conhecimento e reduz dúvidas repetidas.',
      'CPF, e-mail e telefone são mascarados automaticamente — não cole dados sensíveis no texto.',
    ],
    passos: [
      { titulo: 'Central de governança', texto: 'Aqui chegam as dúvidas e ocorrências relatadas no uso do painel, para triagem e resolução.' },
      { alvo: `${T} .busca`, titulo: 'Filtrar', texto: 'Filtre por tipo (dúvida, ocorrência, sugestão) e por estado para priorizar.' },
      { alvo: `${T} table`, titulo: 'Itens', texto: 'Abra um item para ver o contexto, mudar o estado e registrar a nota de resolução.' },
      { alvo: '[data-ajuda="ajuda"]', titulo: 'Como chega aqui', texto: 'Qualquer tela tem, no menu de Ajuda, o botão “Relatar dúvida ou ocorrência”. É por ali que a equipe alimenta esta central.' },
    ],
  },
  faixa: {
    titulo: 'Faixa informativa',
    explicacao:
      'A faixa no topo do painel alterna, com transição suave, data e hora e o tempo (temperatura e previsão do dia) da cidade de quem acessa, o dólar do dia (PTAX do Banco Central) e manchetes do setor de moda, brechó, confecção, calçados e bolsas, vindas de veículos confiáveis. Cada pessoa pode ocultá-la no “×” da própria faixa e trocar a cidade no botão ⌖ (padrão: Uberlândia-MG); esta tela define, para a empresa, se ela existe, quais fontes alimentam e quais filtros valem.',
    casoDeUso:
      'Antes de abrir a live, a equipe vê o dólar e uma notícia sobre a taxa das blusinhas para usar como assunto. Se uma manchete não combina com a marca, a gestão a oculta aqui ou bloqueia a palavra para não voltar.',
    dicas: [
      'Se a faixa atrapalhar o seu trabalho, clique no “×” dela: só você deixa de vê-la, e o botão “Mostrar faixa” a traz de volta.',
      'Manchete fora do tom? Oculte-a na lista ou adicione uma palavra em “Palavras bloqueadas”.',
      'Fontes com erro continuam tentando; as demais seguem funcionando. Use “Atualizar agora” para forçar uma nova leitura.',
      'A faixa mostra só título, veículo e link: ao clicar, a matéria abre no site de origem.',
    ],
    passos: [
      { alvo: '[data-ajuda="faixa"]', titulo: 'A faixa', texto: 'Aqui no topo alternam hora de Brasília, dólar e manchetes. Passe o mouse para pausar; o “×” oculta só para você.' },
      { alvo: `${T} .faixa-grade`, titulo: 'Exibição', texto: 'Ligue ou desligue a faixa para toda a empresa e escolha quais blocos aparecem.' },
      { alvo: `${T} table`, titulo: 'Fontes', texto: 'Cada fonte é um feed RSS ou uma busca de notícias. Veja o estado da última leitura e quantas manchetes foram aceitas.' },
      { alvo: `${T} .faixa-listas`, titulo: 'Filtros de qualidade', texto: 'Veículos permitidos, palavras do segmento e palavras bloqueadas mantêm só o que interessa à Ane Brechó.' },
    ],
  },
}

// Tour de boas-vindas: roda uma vez por usuário, destacando a estrutura do painel.
export const TOUR_BOAS_VINDAS: PassoTour[] = [
  { titulo: 'Bem-vinda(o) ao painel da Ane Brechó', texto: 'Um tour rápido de 30 segundos pela estrutura. Você pode pular a qualquer momento e reabrir pelo menu de Ajuda.' },
  { alvo: '[data-ajuda="menu"]', titulo: 'Menu', texto: 'As telas seguem o ciclo da operação: Compras e estoque, Preparar live, Live e vendas, Clientes e pós-venda, Financeiro, Cadastros e Configuração. Só o grupo da tela aberta fica expandido; clique no título de outro grupo para abri-lo.' },
  { alvo: '[data-ajuda="busca"]', titulo: 'Busca rápida', texto: 'Não sabe em que grupo está a tela? Digite o que quer fazer (nota fiscal, etiqueta, fornecedor, rastreio) e abra direto. Atalho: Ctrl K (⌘ K no Mac) ou a tecla /.' },
  { alvo: '[data-ajuda="abas"]', titulo: 'Abas de trabalho', texto: 'Cada tela aberta vira uma aba aqui em cima. Troque entre elas sem perder os filtros.' },
  { alvo: '[data-ajuda="empresa"]', titulo: 'Empresa', texto: 'Tudo que você vê é da empresa selecionada aqui.' },
  { alvo: '[data-ajuda="tema"]', titulo: 'Tema', texto: 'Alterne entre o tema escuro e o tema claro com as cores da Ane Brechó.' },
  { alvo: '[data-ajuda="ajuda"]', titulo: 'Ajuda', texto: 'Este é o menu de Ajuda. De qualquer tela você vê a explicação, exemplos e dicas, inicia o tutorial e relata dúvidas ou ocorrências.' },
  { alvo: '[data-ajuda="perfil"]', titulo: 'Seu acesso', texto: 'Seu nome e papel. O que você vê e edita depende das permissões do seu perfil.' },
]
