# Manual do painel Ane Brechó

Documentação v0.9.3 · atualizada em 24/11/2026. Gerado de src/ajuda/conteudo.ts; não edite este arquivo à mão.

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

## Compras e estoque

### Entrada de mercadoria (NF-e)

**O que é.** Importa o XML da NF-e de compra, cadastra as peças novas (grupo, marca, características e grade), rateia frete e despesas no custo, confere o financeiro da nota e dá entrada no estoque do CRM. Nada é enviado ao Bling.

**Caso de uso.** Chegou a nota do fornecedor: você importa o XML, aceita as sugestões de cadastro, revisa cada peça e libera, confere as parcelas e confirma. As peças nascem com o custo fechado com a nota.

**Dicas**

- A confirmação só libera com fornecedor vinculado, todas as peças revisadas e liberadas, diferença de R$ 0,00 e financeiro conferido.
- Qualquer mudança no rateio, nas rubricas ou no regime tira a liberação das peças afetadas: revise de novo.
- Se o fornecedor não existir, a importação oferece cadastrá-lo com o CNPJ da nota.
- Se o XML não trouxer parcelas, informe vencimento, valor, natureza e centro de resultado na seção Financeiro.
- O financeiro fica vinculado à nota (número e chave). Lançamentos criados direto, sem nota, não têm esse vínculo.

**Tutorial guiado**

1. **Importar** — Clique em “Importar XML”, confira o resumo e o fornecedor e importe.
2. **Peças** — As peças vêm abertas. Ajuste grupo, marca, características e grade, e use “Revisei: liberar peça”.
3. **Rateio e financeiro** — Escolha o regime, lance rubricas extras se houver e confira as parcelas.
4. **Confirmar** — Com todos os itens do checklist marcados, escolha o local do estoque e confirme.

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

**O que é.** Calendário das lives e compromissos da operação. Serve para planejar as transmissões e organizar a rotina da equipe.

**Caso de uso.** Você marca a live de sábado e a equipe de suporte já sabe quando se preparar para atender a fila.

**Dicas**

- Use a agenda para antecipar as peças da próxima live e evitar correria de última hora.

**Tutorial guiado**

1. **Agenda** — O calendário das lives e compromissos.
2. **Planejar** — Navegue pelos meses e marque as próximas lives.

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

**Tutorial guiado**

1. **Central de vendas** — Aqui você acompanha ao vivo a fila de cada peça, as reservas e os links de pagamento.
2. **Jornada da peça** — Cada peça mostra quem está na fila, quem reservou, o prazo e o estado do pagamento até a entrega.

## Clientes e pós-venda

### Clientes

**O que é.** Cadastro e contato dos clientes, base do relacionamento e das campanhas. Reúne dados de identificação, endereço e canais (Instagram, WhatsApp).

**Caso de uso.** Uma cliente recorrente volta numa live: você confirma os dados já cadastrados e segue direto para o link de pagamento, sem repetir tudo.

**Dicas**

- Documento e contato aparecem conforme a sua permissão — dados sensíveis ficam protegidos.
- Mantenha o cadastro saneado: é o que alimenta o histórico de compras e as ações de venda.

**Tutorial guiado**

1. **Clientes** — A base de clientes da Ane Brechó, com contato, endereço e canais de atendimento.
2. **Buscar cliente** — Encontre por nome, documento ou contato.

## Financeiro

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

**O que é.** Fornecedores, consignantes e demais parceiros, com documento (CPF/CNPJ), contatos e histórico de notas. Inclui validação de dígitos e consulta de CNPJ.

**Caso de uso.** Ao receber peças em consignação, você cadastra o parceiro, valida o documento e acompanha as notas vinculadas a ele.

**Dicas**

- A aba Documento valida CPF/CNPJ e consulta a Receita para o CNPJ.
- Use os filtros de repetidos e contato principal para manter o cadastro limpo.

**Tutorial guiado**

1. **Parceiros** — Fornecedores e consignantes, com documento, contatos e notas.
2. **Buscar parceiro** — Filtre por nome, papel, tipo ou documento.

### Grades e atributos

**O que é.** Configuração das grades (tamanhos, cores e outros atributos) e do vínculo com o Bling. Define as combinações que as peças podem assumir.

**Caso de uso.** Você cria a grade de numeração de calçados ou de tamanhos de roupa para reaproveitar em todas as peças daquele tipo.

**Dicas**

- Padronize as grades antes de cadastrar muitas peças — evita retrabalho e divergência com o Bling.

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
