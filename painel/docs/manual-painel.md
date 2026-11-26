# Manual do painel Ane Brechó

Documentação v0.14.0 · atualizada em 26/11/2026. Gerado de src/ajuda/conteudo.ts; não edite este arquivo à mão.

## Início

### Painel de Gestão

**O que é.** Visão gerencial em duas abas. Vendas: pedidos (ou notas fiscais), cancelamentos, devoluções, venda líquida e ticket médio, por canal e comparados com o período anterior, com a lista de lançamentos ao clicar. Financeiro: contas a pagar, pagas, a receber e recebidas, fluxo de caixa e saldo.

**Caso de uso.** No fechamento você vê quanto vendeu no mês, em que canal, quantos pedidos caíram, e clica na barra de uma semana para listar os pedidos. Na aba Financeiro cruza entradas e saídas dia a dia para ver se algum dia o caixa fica negativo e abre os títulos daquele dia.

**Dicas**

- Base “Pedidos” inclui vendas sem nota fiscal; “Notas fiscais” mostra só o que foi emitido. Devolução vem sempre das notas de entrada.
- Clique em cartões, barras, canais e dias do fluxo para abrir a grade de lançamentos ou de títulos.
- Canais: mapeie cada loja do Bling a um canal em “Mapear lojas”. Canais sem movimento aparecem zerados.
- Financeiro: informe o saldo da conta em uma data (parâmetro). Sem ele o fluxo parte de zero. “Recebido” usa o vencimento como data.
- Valores em R$ e a aba Financeiro são de administração, gestão e financeiro; os demais perfis veem quantidades.

**Tutorial guiado**

1. **Painel de Gestão** — Resumo do negócio no período escolhido, comparado com o período anterior de mesma duração.
2. **Base das vendas** — Escolha entre pedidos de venda do Bling (inclui vendas sem nota) e notas fiscais de saída.
3. **Período** — Escolha um atalho ou um intervalo de datas. O período anterior tem a mesma duração, logo antes.
4. **Indicadores** — Cada cartão compara com o período anterior. Clique num cartão para listar os lançamentos por trás do número.
5. **Canais e cascata** — Vendas por canal (todos os canais aparecem, mesmo zerados) e a cascata das vendas até a venda líquida. Clique para detalhar.

### Assistente de IA

**O que é.** Perguntas em linguagem natural sobre a operação. Responde com dados (vendas, estoque, fila, cobranças) e com conhecimento (regras e processos), sempre citando a fonte. O assistente só lê — nunca altera Bling, redes ou pagamentos.

**Caso de uso.** Você pergunta “quanto vendemos nas últimas 4 lives?” ou “essa cliente já cancelou antes?” e recebe a resposta com os atalhos para as notas, clientes e pedidos citados.

**Dicas**

- Para números, seja específico (período, cliente, peça); para regras, pergunte “como” ou “por quê”.
- Clique nas fontes citadas para abrir a nota, o cliente ou o pedido referenciado.
- Dados sensíveis são mascarados antes de qualquer envio ao provedor de IA.

**Tutorial guiado**

1. **Assistente** — Pergunte em português sobre vendas, estoque, fila e regras. Ele responde com dados e cita as fontes.
2. **Converse** — Digite a pergunta. Use o histórico e os atalhos para abrir o que foi citado.

### Fluxo do processo

**O que é.** Mapa das etapas da operação, da nota do fornecedor ao fechamento do mês, em raias por área. Cada etapa mostra quem executa e quem apoia, a tela do painel, o procedimento, o que entrega, o impacto de errar e as regras. A equipe comenta cada etapa; gestão e administração alteram as etapas, e toda alteração vira uma revisão com a cópia completa do fluxo.

**Caso de uso.** Uma pessoa nova acumula Conferente e Expedição. Em Por pessoa ela marca os dois papéis e vê, em ordem, as etapas que executa e apoia, de quem recebe e para quem entrega, e copia o checklist. Se algo não bate com a prática, ela comenta na etapa; o gestor ajusta e a revisão fica registrada.

**Dicas**

- Uma pessoa pode exercer vários papéis: marque todos em Por pessoa para ver a sequência combinada.
- Use a busca e o filtro de situação para achar etapas em implantação ou planejadas.
- Comentário de ajuste: diga o que acontece na prática. CPF, telefone e e-mail são mascarados.
- Quem edita precisa descrever o que mudou e por quê: isso vira a revisão. "Comparar com a atual" mostra o que mudou desde uma versão; "Restaurar" volta sem apagar nada.
- Quem vê e quem edita esta tela é definido em Permissões, como nas outras telas.

**Tutorial guiado**

1. **Fluxo do processo** — As etapas da operação em ordem, por área e por papel, com comentários e revisões.
2. **Mapa em raias** — Cada coluna é uma área e a linha liga as etapas na ordem. Clique numa etapa para ver o detalhe e comentar.
3. **Por pessoa e revisões** — Em Por pessoa, marque um ou mais papéis. Em Revisões e comentários, veja o histórico e o que está em aberto.

## Compras e estoque

### Entrada de mercadoria (NF-e)

**O que é.** Importa o XML da NF-e de compra, cadastra as peças novas (grupo, marca, características e grade), rateia frete e despesas no custo, confere o financeiro da nota e dá entrada no estoque do CRM. Linhas que chegam sem tamanho nem cor são desmembradas em produtos por modelo/cor e tamanho. Nada é enviado ao Bling.

**Caso de uso.** Nota completa: chegou a nota do fornecedor, você importa o XML, aceita as sugestões de cadastro, revisa cada peça e libera, confere as parcelas e confirma. As peças nascem com o custo fechado com a nota. Nota genérica (exemplo real, nota 19052 da Hush): 14 linhas e 230 peças, todas sem tamanho nem cor, como “BLUSA LESE DET/RENDA COM BOTOES”, 22 un. a R$ 13,00 (R$ 286,00). Em “Itens sem tamanho” você desmembra essa linha em produtos, por exemplo Blusa Renda Preto (P 3, M 5, G 2) e Blusa Renda Off-white (P 4, M 4, G 4). O contador mostra quantas faltam até fechar as 22 e o valor da linha se reparte sozinho, a R$ 13,00 cada. Repita para as outras linhas, use “Sugerir cadastro”, revise, libere, confira o financeiro e confirme.

**Dicas**

- Ao importar, o fornecedor (novo ou já cadastrado) recebe os dados do XML: CNPJ completo, inscrição, telefone e endereço. O endereço usa a descrição dos Correios pelo CEP; se o CEP não for confiável, fica o do XML. Veja na aba Cadastro do parceiro.
- A confirmação só libera com fornecedor vinculado, todas as peças revisadas e liberadas, diferença de R$ 0,00 e financeiro conferido.
- Qualquer mudança no rateio, nas rubricas ou no regime tira a liberação das peças afetadas: revise de novo.
- Se o fornecedor não existir, a importação oferece cadastrá-lo com o CNPJ da nota.
- Se o XML não trouxer parcelas, informe vencimento, valor, natureza e centro de resultado na seção Financeiro.
- O financeiro fica vinculado à nota (número e chave). Lançamentos criados direto, sem nota, não têm esse vínculo.
- Recomendação: desmembre os itens sem tamanho antes de revisar o resto. Enquanto a soma das quantidades não fechar com a da linha, o desmembramento não salva.
- Todo produto tem tipo de grade. O tipo vem sugerido pela descrição e pode ser trocado (ao trocar, somem as quantidades de tamanhos que a nova grade não tem). Peça sem tamanho usa “Acessório · tamanho único”, para a decisão ficar explícita e não ser esquecida.
- Use “Repartir o que falta igualmente” para dar um ponto de partida e “Duplicar” quando outro modelo ou cor tem a mesma grade; depois ajuste as quantidades à mão.
- Não confie no NCM para escolher a categoria: alguns fornecedores mandam NCM de tecido em peça pronta. A sugestão de grupo e de cor parte da descrição; confira e corrija se preciso.
- Os avisos da importação só informam, não bloqueiam: frete por conta do destinatário sem valor na nota (lance o frete pago à transportadora como rubrica extra), transportadora “O PROPRIO”, fornecedor do Simples sem crédito de ICMS (os três regimes dão o mesmo custo), nota emitida há mais de 90 dias (confirme que não deu entrada antes) e pagamento sem parcelas (informe os vencimentos).
- Código do fornecedor repetido em outra nota: só é lembrado quando a linha virou uma única peça. Linha desmembrada em várias peças não é memorizada, então cada nota é cadastrada de novo.

**Tutorial guiado**

1. **Importar** — Clique em “Importar XML”, confira o resumo e o fornecedor e importe.
2. **Itens sem tamanho** — Se houver linhas sem tamanho, clique em “Desmembrar”: inclua um produto por modelo ou cor, escolha o tipo de grade e informe a quantidade por tamanho até o contador fechar.
3. **Peças** — As peças vêm abertas. Ajuste grupo, marca, características e grade, e use “Revisei: liberar peça”.
4. **Rateio e financeiro** — Escolha o regime, lance rubricas extras se houver e confira as parcelas.
5. **Confirmar** — Com todos os itens do checklist marcados, escolha o local do estoque e confirme.

### Peças

**O que é.** Cadastro das peças do brechó e suas grades (tamanho, cor e demais atributos). Cada peça guarda custo, preço, categoria, marca, condição e fotos. É daqui que nascem as unidades físicas e os números curtos das etiquetas.

**Caso de uso.** Chegou um lote novo: você cadastra a peça, define a grade (P, M, G), informa o custo pela nota de entrada e o preço com a margem mínima. Ao salvar com grade, o painel oferece gerar as etiquetas com QR e número curto.

**Dicas**

- Use a foto de capa para a peça ser reconhecida na live e na vitrine.
- O custo vem da nota de entrada; o preço sai da margem mínima configurada — confira antes de publicar.
- Categoria, marca e condição ajudam os filtros, os relatórios e as campanhas de itens semelhantes.

**Tutorial guiado**

1. **Peças** — Esta é a tela de cadastro das peças. Tudo começa aqui: é a peça que vira unidade física, etiqueta e item de venda na live.
2. **Nova peça** — Clique aqui para cadastrar uma peça. Você informa nome, categoria, marca, condição, custo e preço, e monta a grade.
3. **Localizar** — Busque por nome, código ou marca. Os filtros ajudam a achar o que precisa de foto, preço ou revisão.
4. **Lista de peças** — Cada linha é uma peça. Clique em Editar para ajustar dados, fotos e grade, ou para gerar as etiquetas.

### Estoque

**O que é.** As unidades físicas de cada peça e onde elas estão guardadas. Uma peça com três unidades no mesmo tamanho tem três unidades aqui, cada uma com seu número curto rastreável.

**Caso de uso.** Para saber se ainda há a peça AB-0342 no tamanho M, você filtra por peça e vê as unidades disponíveis, reservadas ou já vendidas, e em qual local estão.

**Dicas**

- Cada unidade tem número próprio; ao sair do estoque, o número volta para a fila e pode ser reaproveitado.
- Mantenha o local correto (estoque, loja, live) para a vitrine só mostrar o que é vendável.

**Tutorial guiado**

1. **Estoque** — Aqui ficam as unidades físicas das peças, com estado (disponível, reservada, vendida) e local.
2. **Filtrar** — Filtre por peça ou local para encontrar rápido a unidade certa.
3. **Unidades** — Cada linha é uma unidade com seu código. É o que o cliente cita na live pelo número curto.

### Grupos de produto

**O que é.** Organiza o catálogo em até 4 níveis (departamento, família, tipo de peça e subtipo) para relatórios de venda, margem e estoque por grupo. Marca, material e comprimento ficam no produto, como características, e não na árvore. Tudo é gerencial no CRM: nada é enviado ao Bling.

**Caso de uso.** Os produtos que o motor não reconheceu caem em “A classificar”. Você filtra por essa fila, seleciona os que são, por exemplo, “Tricô”, e move todos para o grupo certo de uma vez, marcando também o material.

**Dicas**

- Só grupos analíticos recebem produtos; grupos sintéticos apenas organizam a árvore.
- O que você altera à mão (grupo, marca ou característica) nunca é sobrescrito quando as regras são reaplicadas.
- Cadastre uma palavra na aba Regras para o motor classificar sozinho os próximos produtos parecidos, depois use “Reaplicar regras”.
- Com todos os itens da página marcados, aparece “Selecionar todos do filtro” para alterar milhares de uma vez (até 20.000 por operação).
- No campo Marca, ao clicar ou digitar aparecem as marcas já cadastradas: escolha da lista para manter o nome padronizado. Uma marca nova é cadastrada ao salvar.
- “Só com estoque” usa o estoque do CRM (unidades disponíveis ou reservadas das Peças). Produto do Bling que ainda não virou Peça aparece sem estoque.

**Tutorial guiado**

1. **Três áreas** — Produtos (classificação e lote), Árvore de grupos (cadastro) e Regras e características (palavras que o motor usa).
2. **Fila “A classificar”** — A tela abre filtrada nos produtos pendentes. Filtre por busca, grupo, marca, característica ou estoque para achar os que quer ajustar.
3. **Alterar em lote** — Marque os produtos, clique em “Alterar em lote…” e escolha grupo, marca e características. Cada campo pode ser mantido, definido ou removido.
4. **Árvore** — Na aba Árvore de grupos você cria, move e inativa grupos. Um grupo só pode ser excluído quando não tem produtos nem subgrupos.

## Preparar live

### Agenda

**O que é.** Compromissos da operação em um só lugar: lives, follow-up de cliente, pós-venda, lembretes e tarefas internas. Qualquer pessoa da equipe cria e atribui a outra. Follow-up e pós-venda ficam abertos até serem resolvidos com a resposta da cliente registrada, ou encerrados com motivo. Com o convite ligado, cada compromisso chega ao e-mail do responsável para entrar no calendário (Gmail, Outlook, Apple).

**Caso de uso.** A reserva de uma cliente venceu sem pagamento. A suporte cria um follow-up para amanhã às 10h vinculado à cliente, registra a tentativa pelo WhatsApp e, quando a cliente responde, anota o que foi combinado e resolve.

**Dicas**

- Comece o dia pela aba Minha fila: atrasados, hoje, aguardando cliente e próximos 7 dias.
- Registre cada tentativa de contato. Encerrar por falta de resposta exige o mínimo de tentativas definido na Configuração (padrão 3).
- Não escreva telefone, CPF ou endereço no título: ele vai para o calendário do e-mail.
- No calendário, os filtros de tipo e "Só os meus" ajudam a ver a semana de cada pessoa.
- Visões Dia, Semana e Mês (padrão) no canto do calendário; a escolha fica guardada. Clique num espaço vazio (dia, coluna da semana ou faixa de hora) para incluir um compromisso já com a data e a hora.
- Clique no compromisso para editar; arraste para outro dia para remarcar (a hora se mantém) ou, na visão Dia, para outra hora. Dá para desfazer logo depois.
- Cores: vermelho piscando é atraso, dourado piscando começa em até 30 min, âmbar aguarda resposta da cliente. A legenda fica abaixo do calendário.
- Os lembretes aparecem em qualquer tela do painel, no canto inferior direito: Abrir, Adiar 10 min ou Dispensar. Uma vez por dia aparece o resumo dos atrasados.

**Tutorial guiado**

1. **Agenda** — Compromissos da equipe: lives, follow-up, pós-venda, lembretes e tarefas.
2. **Minha fila e Calendário** — Minha fila mostra o que é seu para fazer; o Calendário mostra o mês com todos os compromissos, por tipo e por pessoa.
3. **Novo compromisso** — Escolha o tipo, a data e o responsável; vincule a cliente quando for follow-up ou pós-venda.

### Etiquetas e impressão

**O que é.** Geração das etiquetas com QR e número curto (até 4 dígitos), fila de impressão, impressoras, modelos e agentes de impressão. O número curto é o que os clientes usam na live.

**Caso de uso.** Depois de cadastrar uma peça com grade, você manda imprimir as etiquetas. Se reimprimir uma já impressa, o painel avisa e registra data, hora e usuário.

**Dicas**

- A numeração reinicia quando a peça sai do estoque — números livres são reaproveitados (teto de 9999 em estoque).
- A reimpressão pede motivo e fica registrada; use quando a etiqueta danificar.
- Configure a impressora e o agente local antes da primeira leva de impressão.

**Tutorial guiado**

1. **Etiquetas** — Central das etiquetas: número curto, QR, fila de impressão e configuração de impressoras e agentes.
2. **Fila e histórico** — Acompanhe o que foi enviado para impressão e o que já foi impresso, com data, hora e usuário.

### Preferências da vitrine

**O que é.** Parâmetros da vitrine pública e da central de reservas: ordem das fotos, o que a cliente vê na fila, prazo da reserva, aviso de peça vendida, tema e demais ajustes.

**Caso de uso.** Você define o prazo de reserva em 15 minutos, liga o aviso “Avise-me” para peças vendidas e escolhe o tema da vitrine com as cores da Ane Brechó.

**Dicas**

- O prazo padrão recomendado é 15 minutos — ajuste conforme o ritmo das suas lives.
- O aviso de peça vendida pode sugerir peças parecidas e capturar interesse.

**Tutorial guiado**

1. **Preferências da vitrine** — Ajuste aqui como a vitrine e a fila se comportam para o público.
2. **Parâmetros** — Prazo da reserva, ordem de fotos, avisos e tema ficam todos nesta tela.

## Live e vendas

### Central de vendas

**O que é.** Coração da operação de live: a fila por peça, as reservas, os links de pagamento e o acompanhamento até a entrega. Cada peça tem um link único; quem demonstra interesse entra na fila com o canal de origem.

**Caso de uso.** Na live, uma peça é arrematada: o primeiro da fila ganha 15 minutos para pagar. Se não pagar, passa para o próximo, e quem estava na fila é avisado se a peça sai.

**Dicas**

- O prazo padrão de pagamento é 15 minutos, configurável em Preferências da vitrine.
- A fila é única por peça, não importa o canal (Instagram, WhatsApp, live).
- O histórico mostra vendas perdidas por falta de estoque — insumo para campanhas de itens semelhantes.
- “Marcar pago” confirma um pagamento conferido fora do link (Pix no extrato, loja): a peça vira vendida, o pedido sai no nome de quem pagou e a fila é avisada.

**Tutorial guiado**

1. **Central de vendas** — Aqui você acompanha ao vivo a fila de cada peça, as reservas e os links de pagamento.
2. **Jornada da peça** — Cada peça mostra quem está na fila, quem reservou, o prazo e o estado do pagamento até a entrega.

### Caixa de entrada

**O que é.** Todas as conversas com as clientes numa tela só: Direct do Instagram hoje e WhatsApp quando o canal for ligado. A resposta sai pelo mesmo canal de onde a cliente escreveu, sem abrir o app. Ao lado da conversa aparecem a etapa da venda (fila, reserva, Pix, pago, enviado), o último pedido e o rastreio.

**Caso de uso.** A cliente pergunta no Direct se o Pix já foi gerado. A atendente abre a conversa, digita /pix e a mensagem entra pronta com o valor e o link dela; confere a prévia e envia. Depois marca a conversa como resolvida.

**Dicas**

- No “Ver exemplo” aparece o Roteiro de treino: abrir, assumir, responder, nota, etiqueta, resolver, bloquear um perfil que só atrapalha e ver as tentativas bloqueadas. Nada é gravado nem enviado.
- Admin e gestor têm o botão Bloquear na conversa (com motivo). Desbloquear devolve a pessoa às filas, à live e à vitrine.
- A visão “Bloqueados” mostra as conversas de quem está na lista de bloqueio: ficam fora das filas, só para consulta. O número “Tentativas bloqueadas” conta as tentativas na live, vitrine e mensagens (passe o mouse para ver por origem).
- Digite / no campo de mensagem para buscar uma resposta pronta pelo atalho (ex.: /link, /pix, /rastreio). Setas escolhem, Enter usa.
- Se a cliente não tiver o dado de uma variável (ex.: sem reserva ativa), a prévia avisa e o envio fica travado até você ajustar o texto.
- O Instagram só deixa responder até 24 h depois da última mensagem da cliente; entre 24 h e 7 dias a resposta vai com a etiqueta de atendimento humano.
- No WhatsApp também vale a janela de 24 h; fora dela só modelo aprovado pela Meta. Cada número tem 1.000 respostas grátis por mês; depois, cada resposta é cobrada pela Meta — prefira uma mensagem completa a várias curtas.
- "Nota interna" grava um recado para a equipe na conversa, sem enviar nada à cliente.
- Cada conversa mostra como a cliente chegou: comentário na live, clique na vitrine (story, feed, grupo), link "Quero A123" ou mensagem direta. Filtre por origem e por canal para ver de onde vem o movimento.
- O botão "Ver exemplo" enche a tela com conversas fictícias para treinar a equipe e entender a visão. Nada é gravado nem enviado.
- A faixa do WhatsApp mostra quantas das 1.000 respostas grátis do mês já foram usadas; perto do limite, prefira responder pelo app Business.
- Se aparecer o aviso de que outra pessoa está com a conversa aberta, combinem antes de responder para não duplicar.
- Enquanto o canal estiver desligado ou em teste em Integrações, a mensagem fica registrada como "Não enviada" ou "Simulada", com o motivo.

**Tutorial guiado**

1. **Caixa de entrada** — Aqui chegam as mensagens das clientes. As que esperam resposta ficam destacadas no topo da lista.
2. **Minhas e sem responsável** — Filtre as conversas que são suas ou as que ainda não têm ninguém cuidando. "Assumir" coloca a conversa no seu nome.
3. **Lista de conversas** — Cada conversa mostra o canal, a etapa da venda e as etiquetas. O número em destaque são mensagens não lidas.

## Clientes e pós-venda

### Expedição

**O que é.** Cada peça é paga na hora. Aqui os pedidos pagos da mesma cliente e do mesmo endereço viram um envio só. Você define o frete (ou marca grátis): o frete vira uma cobrança separada. Quando o frete estiver pago, o envio sai com o código de rastreio.

**Caso de uso.** A cliente comprou três peças na live, cada uma paga no Pix na hora. No fim do dia, “A montar” mostra a cliente com 3 pedidos. Você clica em Montar envio, informa o frete do SEDEX e a cliente recebe a cobrança do frete. Com o frete pago, você embala, informa o rastreio e o pedido passa para Enviado.

**Dicas**

- Para treinar o time, clique em Simular: abre clientes e pedidos fictícios com um roteiro de passos que se marcam sozinhos. Nada é gravado, cobrado ou enviado.
- Se a cliente ainda tem peças reservadas, o aviso sugere esperar: o que ela pagar depois entra no mesmo envio aberto.
- Cliente VIP aparece com o selo VIP: ela paga o acumulado no fim do dia ou da live (configure em Parceiros > Regras).
- Frete grátis deixa o envio pronto na hora, sem cobrança.
- “Frete pago” é para quando a cliente pagou fora do link (dinheiro, Pix direto); informe como conferiu.
- Desfazer envio devolve os pedidos para “A montar”. Não dá para desfazer depois do frete pago ou do envio.

**Tutorial guiado**

1. **Expedição** — Junte as peças pagas, cobre o frete e registre o rastreio.
2. **A montar** — Clientes com pedidos pagos agrupados por endereço. Clique em Montar envio.

## Financeiro

### Movimentação financeira

**O que é.** Receitas (a receber) e despesas (a pagar) na mesma tela: vendas, recibos, parcelas das NF-e de compra, NFS-e com retenções, boletos, guias, adiantamentos e renegociações. Cada título tem natureza, centro de resultado, tipo de título e situação (em aberto, vencido, baixa parcial, baixado, conciliado, renegociado, provisão ou cancelado). O resumo mostra a receber, a pagar e o saldo previsto. O que cada usuário vê e faz é liberado por usuário. Nada é enviado ao Bling.

**Caso de uso.** A cliente que também vende peças para a Ane tem R$ 300 a receber e R$ 120 a pagar. Selecione os dois títulos e clique em Compensar: as duas baixas saem juntas e só R$ 180 entram na conta.

**Dicas**

- Use Receitas e despesas / Receitas / Despesas para separar; a coluna Efeito no caixa soma receita e subtrai despesa (o total é o saldo previsto do filtro).
- Valor menor que o saldo faz baixa parcial: o restante continua em aberto no mesmo título.
- Receita e despesa juntas só se compensam quando são do mesmo parceiro; renegociação agrupa títulos do mesmo parceiro e do mesmo tipo.
- Parcelas de um parcelamento não se cancelam uma a uma: cancele o grupo inteiro ou a partir de uma parcela.
- Títulos de NF-e de compra têm valor, fornecedor e vencimento travados: alterações são feitas na Entrada de mercadoria.
- Botões que não aparecem dependem de permissão: o administrador libera em Cadastros financeiros › Permissões por usuário.

**Tutorial guiado**

1. **Resumo** — A receber, a pagar, saldo previsto, vencidos e provisões do filtro atual.
2. **Tipo e situação** — Escolha receitas, despesas ou ambas e combine as situações; os números mostram quantos títulos há em cada uma.
3. **Títulos** — Marque a caixa para selecionar e clique na linha para abrir composição, rateio, baixas e vínculos.
4. **Baixar ou compensar** — Com títulos selecionados, use Receber, Pagar ou Compensar. Informe data, conta, juros, multa, desconto e taxa; o painel mostra o efeito na conta.
5. **Lançar** — Use “+ Receita” ou “+ Despesa” para recibos, parcelamentos, recorrências, NFS-e com retenções ou saldos de implantação.

### Contas e saldos

**O que é.** Saldo de cada conta bancária, caixa e carteira de gateway em uma data escolhida, em três visões: no sistema (todas as baixas até a data), conciliado (só o conferido com o extrato, pela data em que caiu no banco) e no extrato importado. Mostra os movimentos com saldo linha a linha e permite transferir entre contas.

**Caso de uso.** No fim do mês, escolha o último dia em “Saldo em” e confira cada conta: se o conciliado é igual ao extrato, a conta está fechada. A diferença entre sistema e conciliado é o que ainda não apareceu no banco.

**Dicas**

- Clique no cartão da conta para ver os movimentos do período.
- Transferência entre contas não afeta o DRE; só se estorna enquanto não estiver conciliada.
- O saldo inicial de cada conta é cadastrado em Cadastros financeiros, na data de implantação.

**Tutorial guiado**

1. **Contas** — Cada cartão mostra o saldo no sistema, o conciliado, o que falta conciliar e a comparação com o extrato.
2. **Saldo em** — Mude a data para ver o saldo de qualquer dia passado.

### Conciliação bancária

**O que é.** Importa o extrato OFX do banco (lido no navegador) e liga cada linha a um movimento do sistema. Compara dia a dia o saldo do extrato com o saldo conciliado e confere o saldo final informado pelo banco com o calculado pelas linhas.

**Caso de uso.** Baixe o OFX do Itaú da semana e importe. As linhas com o mesmo valor de uma baixa próxima já vêm com sugestão: clique em Conciliar. A tarifa do banco, que não existe no sistema, vira título com “Criar título”, já baixado e conciliado.

**Dicas**

- Ao conciliar, o movimento passa a contar no saldo conciliado pela data do banco, mesmo que a baixa tenha outra data.
- Importar o mesmo arquivo de novo não duplica linhas: o identificador de cada lançamento do banco é único.
- Na aba Saldo dia a dia, dias com diferença mostram onde falta conciliar.
- Use “Ignorar” só para linhas que não têm efeito no sistema (ex.: estorno do próprio banco no mesmo dia).

**Tutorial guiado**

1. **Importar** — Escolha a conta e clique em “Importar OFX”. Confira o período e o saldo final antes de confirmar.
2. **Saldos** — Extrato, conciliado e a diferença na data escolhida. “Confere” quando estão iguais.
3. **Linhas** — Concilie pela sugestão, escolha outro movimento, crie um título ou ignore a linha.

### Cadastros financeiros

**O que é.** Contas bancárias com saldo inicial, tipos de título (meio de pagamento, taxa, dias para compensar e conta padrão), projetos usados no rateio e os parâmetros que definem em qual natureza entram juros, multas, descontos, taxas, adiantamentos, retenções e transferências.

**Caso de uso.** Na implantação, cadastre o Itaú, o caixa da loja e a carteira do Mercado Pago com o saldo do dia de corte. No tipo Cartão de crédito, informe a taxa da operadora para que a baixa calcule o valor líquido.

**Dicas**

- Contas e tipos não se excluem: inative.
- Na aba Permissões por usuário (só administrador) libere para cada pessoa: ver receitas, ver despesas, lançar, editar, baixar, estornar, renegociar, cancelar e conciliar.
- O código do tipo de título não muda depois de criado.
- Só administrador e gestor alteram os parâmetros; “Período fechado até” bloqueia lançamentos e baixas em datas já fechadas.

**Tutorial guiado**

1. **Áreas** — Contas bancárias, Tipos de título, Projetos, Parâmetros e, para o administrador, Permissões por usuário.
2. **Contas** — Clique em uma conta para editar ou use “+ Nova conta”.

### Natureza financeira

**O que é.** Define o que é cada receita, custo ou despesa, em até 4 níveis (9.99.99.999). Só o 4º nível recebe lançamentos; os demais agrupam e somam. Cada natureza aponta para uma linha do DRE. Tudo é gerencial no CRM: nada é enviado ao Bling.

**Caso de uso.** Uma conta de energia chega do Bling com uma categoria de utilidades. O De-Para leva essa categoria para a natureza correspondente e a regra por fornecedor indica o centro de resultado de administração.

**Dicas**

- O código é gerado sozinho ao criar uma natureza; ele e o pai não mudam depois.
- Natureza em uso (com lançamentos) não pode ser excluída nem perder o nível analítico: inative.
- Natureza de receita, dedução ou CMV só aceita centro de resultado de canal.
- Na aba De-Para, categorias em amarelo ainda não foram mapeadas.
- Regras não são excluídas: desligue a regra para parar de usá-la. Cada edição aumenta a versão.

**Tutorial guiado**

1. **Três áreas** — Árvore de naturezas, De-Para das categorias do Bling e Regras de apropriação.
2. **Criar** — Use “+ Filha” na natureza pai (sintética). O sinal, o DRE e o centro padrão são herdados do pai e podem ser ajustados.
3. **De-Para** — Escolha a natureza analítica de cada categoria do Bling ou marque “ignorar” para os grupos do Bling sem lançamento.

### Centro de resultado

**O que é.** Define quem responde pelo resultado: área, departamento ou canal de venda (por exemplo Instagram Lives, WhatsApp, Loja física). Não é o tipo de gasto; isso é a Natureza. Cada lançamento recebe uma natureza e um centro de resultado.

**Caso de uso.** Para ver quanto o Instagram realmente deixa de resultado, a receita e o CMV entram nos centros de canal e as despesas de marketing e expedição são apropriadas aos centros de apoio.

**Dicas**

- Receita só entra em centro analítico do tipo canal que aceita receita.
- O grupo 9 (Sem centro de resultado) é usado pelo motor para o que ainda não foi classificado e não pode ser excluído.
- Centro com lançamentos, regras ou filhos não pode ser excluído: inative.
- O código (9.99.99.999) é gerado automaticamente e não muda.

**Tutorial guiado**

1. **Criar** — Use “+ Nova área” para o nível 1 ou “+ Filho” em um centro agrupador.
2. **Canal** — Para um centro de canal que recebe receita, marque “Aceita receita” e escolha o canal do CRM.

## Cadastros

### Parceiros

**O que é.** Cadastro único de pessoas e empresas: clientes, fornecedores, transportadoras e funcionários, com um ID por CPF/CNPJ. O mesmo parceiro pode ter vários papéis. Cada parceiro reúne os seus contatos (vários @ do Instagram, WhatsApp e e-mail), os dados fiscais para a NF-e, as notas, as compras e, como cliente, reservas, fila, cancelamentos e devoluções. Quem chega só pelo Instagram, WhatsApp ou vitrine fica como pré-cadastro até informar o CPF no link de pagamento. Substitui a antiga tela Clientes.

**Caso de uso.** A filha comenta na live pelo próprio @ e paga com o CPF da mãe, que já é cliente: a nota sai no nome da mãe e, com o pagamento aprovado, o @ da filha passa a aparecer em Contatos da mãe como familiar, sem criar cadastro duplicado.

**Dicas**

- Abra o parceiro pela aba Resumo: ela mostra os papéis, o que falta para emitir NF-e e os números de cliente, fornecedor e financeiro.
- Em Contatos você define o @ principal, o vínculo (titular, familiar, terceiro) e move um contato para outro parceiro, com motivo registrado.
- Use o filtro “Pré-cadastro (sem CPF/CNPJ)” para achar quem ainda não informou documento; “Juntar a outro parceiro” une um pré-cadastro ao cadastro certo.
- A aba Cadastro fiscal mostra de onde veio o endereço: Correios (padronizado pelo CEP) ou XML. A aba Origem Bling é só para auditoria dos contatos repetidos do Bling.
- A aba Documento valida CPF/CNPJ e consulta a Receita para o CNPJ.
- O link de pagamento atualiza o cadastro: nome civil, CPF (guardado cifrado), e-mail e endereço conferido pelo CEP dos Correios aparecem no Resumo.
- Aba Regras: marque a cliente como VIP (acumula peças e paga no fim do dia ou da live, com limite de peças e de valor) ou coloque na lista de bloqueio (ignorada na live, vitrine e mensagens; as tentativas ficam contadas).
- O botão “Bloquear @ ou WhatsApp” bloqueia direto pelo contato, mesmo sem cadastro. Os filtros VIP e Lista de bloqueio mostram quem está em cada regra.

**Tutorial guiado**

1. **Parceiros** — Clientes, fornecedores, transportadoras e funcionários num cadastro só.
2. **Buscar parceiro** — Busque por nome, @, WhatsApp, últimos dígitos do CPF/CNPJ ou ID do Bling, e filtre por papel.
3. **Abrir o parceiro** — Clique numa linha para ver o resumo, os contatos, o cadastro fiscal e as notas.

### Grades e atributos

**O que é.** Configuração das grades (tamanhos, cores e outros atributos) e do vínculo com o Bling. Define as combinações que as peças podem assumir.

**Caso de uso.** Você cria a grade de numeração de calçados ou de tamanhos de roupa para reaproveitar em todas as peças daquele tipo.

**Dicas**

- Padronize as grades antes de cadastrar muitas peças — evita retrabalho e divergência com o Bling.
- Peça sem tamanho usa a grade “Acessório · tamanho único” (tamanho Único): a entrada de mercadoria exige tipo de grade em todo produto.

**Tutorial guiado**

1. **Grades** — Defina aqui os tamanhos, cores e atributos usados no cadastro das peças.

### Locais

**O que é.** Locais onde as peças ficam guardadas (estoque principal, loja física, live). Cada unidade do estoque fica em um local, e o local diz se a peça é vendável.

**Caso de uso.** Você cria o local “Live” para separar as peças que vão ao ar e manter o estoque principal organizado.

**Dicas**

- Marque como vendável só os locais de onde realmente se vende; a vitrine respeita isso.

**Tutorial guiado**

1. **Locais** — Cadastre os locais de estoque antes de registrar unidades.
2. **Novo local** — Crie um local e defina se as peças dele podem ser vendidas.

## Configuração

### Integrações

**O que é.** Conexões externas: Bling, Meta/Instagram, WhatsApp, gateway de pagamento e IA (chat e vetor). Cada integração tem modo (desligado, simulado, real), parâmetros e teste. Alterar é só do administrador.

**Caso de uso.** Você cola a chave de IA uma única vez, testa a conexão e só então muda o modo para real — a chave vai direto para o cofre, nunca volta para a tela.

**Dicas**

- Suba para o modo real só depois de um teste recente com sucesso.
- Segredos (chaves, tokens) são gravados no cofre e nunca aparecem de novo na tela.
- A URL base só aceita hosts conhecidos — é uma proteção contra desvio da chave.

**Tutorial guiado**

1. **Integrações** — Conecte Bling, redes, pagamento e IA. Cada uma tem modo, parâmetros, segredo no cofre e teste.
2. **Configurar e testar** — Preencha os parâmetros, salve o segredo e rode o teste antes de ir para o modo real.

### Produtos Bling

**O que é.** Espelho dos produtos lidos do Bling, para conferir e sanear o cadastro antes de usar no CRM. Mostra duplicidades, dados faltantes e situação de cada produto.

**Caso de uso.** Antes de uma live, você revisa os produtos trazidos do Bling: ajusta o que está sem grade ou sem preço e marca o que precisa de atenção.

**Dicas**

- A carga traz os dados como estão; a padronização acontece depois, já dentro do CRM.
- Use os filtros de situação e alerta para achar o que precisa de correção.

**Tutorial guiado**

1. **Produtos Bling** — Aqui você confere e saneia os produtos vindos do Bling antes de usá-los no dia a dia.
2. **Filtros** — Filtre por situação, formato, grade ou alerta para focar no que precisa de ajuste.

### Notas Bling

**O que é.** Notas fiscais emitidas trazidas do Bling, com itens, valores e links do DANFE/PDF. Base para custo das peças e para as consultas de vendas.

**Caso de uso.** Para conferir o custo de entrada de um lote, você abre a nota correspondente e vê os itens e valores; o assistente também cita estas notas nas respostas.

**Dicas**

- Use o filtro por período para encontrar notas de um intervalo.
- O link do DANFE abre o documento oficial quando disponível.

**Tutorial guiado**

1. **Notas Bling** — As notas fiscais emitidas, lidas do Bling, com itens e valores.
2. **Período e busca** — Filtre por período ou busque por número/cliente para achar a nota.
3. **Notas** — Clique numa nota para ver os itens, os valores e o link do DANFE.

### Respostas prontas

**O que é.** Biblioteca de mensagens padrão com variáveis, como {{cliente.primeiro_nome}}, {{reserva.link}}, {{cobranca.valor}} e {{envio.codigo_rastreio}}. Na Caixa de entrada, as variáveis são trocadas pelos dados reais da cliente na hora de enviar.

**Caso de uso.** A administradora cria a resposta /rastreio: "Seu pedido {{pedido.numero}} foi enviado pela {{envio.transportadora}}. Código: {{envio.codigo_rastreio}}". A equipe responde a dúvida de entrega em segundos, sem copiar código de outro sistema.

**Dicas**

- Só o administrador cria e edita; a equipe usa todas pela Caixa de entrada.
- Clique numa variável para inseri-la onde está o cursor. A prévia mostra como a mensagem sai, com dados fictícios.
- Use atalhos curtos e fáceis de lembrar (pix, link, prazo, rastreio). O contador de usos mostra quais respostas a equipe mais usa.
- Desative em vez de apagar: a resposta some da equipe, mas o histórico das conversas continua mostrando qual foi usada.

**Tutorial guiado**

1. **Respostas prontas** — Aqui ficam os modelos de mensagem da equipe, organizados por categoria.
2. **Variáveis** — Veja quais dados podem entrar nas mensagens e de onde cada um vem (reserva, fila, Pix, pedido, envio).

### Base de conhecimento

**O que é.** Documentos e regras que o assistente consulta (busca por texto e por vetor). É aqui que entram políticas de reserva, cancelamento, comissão, frete e o roteiro da live.

**Caso de uso.** Você sobe o documento de regras de devolução; a partir daí o assistente passa a responder dúvidas sobre devolução citando esse documento.

**Dicas**

- Quanto melhores os documentos, melhores as respostas do assistente.
- Dados sensíveis são mascarados antes de indexar (CPF, e-mail, telefone).
- Desativar uma fonte tira o conteúdo das respostas sem apagar o histórico.

**Tutorial guiado**

1. **Base de conhecimento** — Suba aqui as regras e documentos que o assistente usa para responder.
2. **Fontes** — Cada fonte vira trechos pesquisáveis. Ative/desative conforme a necessidade.

### Usuários e acessos

**O que é.** Inclusão de usuários da equipe, com grupos de acesso e convite por e-mail para a pessoa criar a própria senha. Reúne quem entra no painel e com qual perfil.

**Caso de uso.** Entrou uma consultora nova: você a convida por e-mail, escolhe o grupo de acesso e ela cria a senha pelo link do convite.

**Dicas**

- Use grupos de acesso para liberar várias telas de uma vez, em vez de permissão a permissão.
- O convite expira; se a pessoa demorar, reenvie um novo.

**Tutorial guiado**

1. **Usuários e acessos** — Convide a equipe e defina o perfil de acesso de cada pessoa.
2. **Convidar** — Envie o convite por e-mail; a pessoa cria a própria senha pelo link.

### Permissões

**O que é.** Matriz de permissões por tela e papel. Define, para cada papel (gestor, suporte, apresentadora, expedição, financeiro, leitura), se vê, edita ou não acessa cada tela. O banco também aplica essas regras.

**Caso de uso.** Você libera a Central de vendas para o suporte editar e deixa o financeiro só com visão, sem precisar mexer em código.

**Dicas**

- A matriz restringe o que o painel mostra; o banco continua protegendo por papel.
- Há um botão para restaurar o padrão por papel se algo ficar confuso.

**Tutorial guiado**

1. **Permissões** — Defina quem vê e quem edita cada tela, por papel.
2. **Matriz** — Marque ver/editar/nenhum para cada cruzamento de tela e papel e salve.

### Central de governança

**O que é.** Onde as dúvidas e ocorrências do uso do painel são registradas, triadas e resolvidas. Qualquer pessoa pode relatar pelo menu de Ajuda; a gestão acompanha o estado (aberto, em análise, resolvido, descartado) e deixa o aprendizado documentado. Dados sensíveis são mascarados no registro.

**Caso de uso.** Uma apresentadora não entende por que uma peça saiu da fila; ela relata pela Ajuda. O item chega aqui com a tela de origem, é analisado, resolvido e vira nota de aprendizado para evitar a dúvida de novo.

**Dicas**

- Classifique entre dúvida, ocorrência (algo deu errado) e sugestão para priorizar certo.
- Resolva com uma nota clara: ela alimenta a base de conhecimento e reduz dúvidas repetidas.
- CPF, e-mail e telefone são mascarados automaticamente — não cole dados sensíveis no texto.

**Tutorial guiado**

1. **Central de governança** — Aqui chegam as dúvidas e ocorrências relatadas no uso do painel, para triagem e resolução.
2. **Filtrar** — Filtre por tipo (dúvida, ocorrência, sugestão) e por estado para priorizar.
3. **Itens** — Abra um item para ver o contexto, mudar o estado e registrar a nota de resolução.
4. **Como chega aqui** — Qualquer tela tem, no menu de Ajuda, o botão “Relatar dúvida ou ocorrência”. É por ali que a equipe alimenta esta central.

### Faixa informativa

**O que é.** A faixa no topo do painel alterna, com transição suave, data e hora e o tempo (temperatura e previsão do dia) da cidade de quem acessa, o dólar do dia (PTAX do Banco Central) e manchetes do setor de moda, brechó, confecção, calçados e bolsas, vindas de veículos confiáveis. Cada pessoa pode ocultá-la no “×” da própria faixa e trocar a cidade no botão ⌖ (padrão: Uberlândia-MG); esta tela define, para a empresa, se ela existe, quais fontes alimentam e quais filtros valem.

**Caso de uso.** Antes de abrir a live, a equipe vê o dólar e uma notícia sobre a taxa das blusinhas para usar como assunto. Se uma manchete não combina com a marca, a gestão a oculta aqui ou bloqueia a palavra para não voltar.

**Dicas**

- Se a faixa atrapalhar o seu trabalho, clique no “×” dela: só você deixa de vê-la, e o botão “Mostrar faixa” a traz de volta.
- Manchete fora do tom? Oculte-a na lista ou adicione uma palavra em “Palavras bloqueadas”.
- Fontes com erro continuam tentando; as demais seguem funcionando. Use “Atualizar agora” para forçar uma nova leitura.
- A faixa mostra só título, veículo e link: ao clicar, a matéria abre no site de origem.

**Tutorial guiado**

1. **A faixa** — Aqui no topo alternam hora de Brasília, dólar e manchetes. Passe o mouse para pausar; o “×” oculta só para você.
2. **Exibição** — Ligue ou desligue a faixa para toda a empresa e escolha quais blocos aparecem.
3. **Fontes** — Cada fonte é um feed RSS ou uma busca de notícias. Veja o estado da última leitura e quantas manchetes foram aceitas.
4. **Filtros de qualidade** — Veículos permitidos, palavras do segmento e palavras bloqueadas mantêm só o que interessa à Ane Brechó.

## Tour de boas-vindas

1. **Bem-vinda(o) ao painel da Ane Brechó** — Um tour rápido de 30 segundos pela estrutura. Você pode pular a qualquer momento e reabrir pelo menu de Ajuda.
2. **Menu** — As telas seguem o ciclo da operação: Compras e estoque, Preparar live, Live e vendas, Clientes e pós-venda, Financeiro, Cadastros e Configuração. Só o grupo da tela aberta fica expandido; clique no título de outro grupo para abri-lo.
3. **Busca rápida** — Não sabe em que grupo está a tela? Digite o que quer fazer (nota fiscal, etiqueta, fornecedor, rastreio) e abra direto. Atalho: Ctrl K (⌘ K no Mac) ou a tecla /.
4. **Abas de trabalho** — Cada tela aberta vira uma aba aqui em cima. Troque entre elas sem perder os filtros.
5. **Empresa** — Tudo que você vê é da empresa selecionada aqui.
6. **Tema** — Alterne entre o tema escuro e o tema claro com as cores da Ane Brechó.
7. **Ajuda** — Este é o menu de Ajuda. De qualquer tela você vê a explicação, exemplos e dicas, inicia o tutorial e relata dúvidas ou ocorrências.
8. **Seu acesso** — Seu nome e papel. O que você vê e edita depende das permissões do seu perfil.
