# Pedido de mudança 045: Agenda de compromissos (live, follow-up, pós-venda, lembrete e tarefa)

Criado em 25/11/2026. Migrations `0088_agenda_compromissos` e `0088b_agenda_obter` (`sql/0088_agenda_compromissos.sql`), **aplicadas** em 25/11 (23h17) com autorização do Dione ("pode seguir a recomendação"). O rascunho era 0086; 0086 e 0087 foram usadas por outra sessão (expiração de reservas e atendimento), por isso 0088. Testes: `sql/testes/88_testes_agenda.sql` (bloco que termina em exceção; resultado `TESTES_OK`, 11 cenários). Avisos de segurança depois: só INFO de RLS sem policy (por desenho) e os 2 avisos antigos do Auth.

## Situação antes deste pedido
- A tela Agenda (painel v0.2) é só o componente `Calendario.tsx`, sem dados e sem criar evento. O `painel-front-v0.1` já registrava "eventos reais na agenda" como não incluído.
- No banco não havia tabela nem função de agenda. `live.mov_live` não tem data planejada (só `iniciada_em`/`encerrada_em`).
- O manual do painel promete "marque as próximas lives": corrigir o texto até esta entrega ir ao ar.
- Atendimento (adiar e lembrete) e central de reservas (avisos) planejavam lembretes próprios. **Este pedido centraliza:** todo compromisso com data mora em `agenda`, e os outros módulos criam itens nela.

## Decisões do Dione (25/11)
1. **Todos os papéis operacionais criam e atribuem compromissos entre si** (admin, gestor, apresentadora, suporte, expedição, financeiro). `leitura` só vê. A matriz `crm.cfg_permissao_tela` da tela `agenda` passa a `editar` para suporte, expedição e financeiro.
2. **Regras automáticas: só as que dependem de interação da cliente**, e o compromisso **fica aberto até ser resolvido ou encerrado**. Na prática:
   - Tipos `follow_up` e `pos_venda` têm `exige_interacao_cliente = true`.
   - **Resolvido** exige desfecho **e** uma resposta da cliente registrada.
   - Sem resposta, só **encerrado** com motivo; o motivo `sem_resposta` exige o número mínimo de tentativas registradas (`max_tentativas_sem_resposta`, padrão 3).
   - Checklist de live e reativação de cliente inativa **ficam fora** das regras automáticas (podem ser criados à mão).
3. **Lembrete no painel e no calendário do e-mail** (a equipe não usa Teams). Cada compromisso gera um **convite de calendário (.ics) por e-mail** para o responsável, que funciona com Gmail, Outlook e Apple sem pedir login em cada conta.

## Modelo (schema `agenda`)
| Tabela | Papel |
|---|---|
| `cad_tipo` | live, follow_up, pos_venda, lembrete, tarefa (cor e se exige interação da cliente) |
| `cfg_agenda` | por empresa: convite ligado/desligado (começa **desligado**), avisos padrão (30 min), duração padrão, nome da cliente no convite (padrão **não**), tentativas mínimas |
| `mov_compromisso` | título, descrição, início/fim, dia inteiro, prioridade, responsável, quem criou, vínculos opcionais (cliente, pedido, devolução, conversa, live), estado, desfecho, motivo, regra de origem e chave de idempotência (fase 3), `convite_seq` |
| `mov_interacao` | tentativa de contato, resposta da cliente ou nota, com canal e autor |
| `mov_convite` | saída de convites por e-mail (REQUEST/CANCEL), com tentativas e erro |

Estados: `pendente` → (tentativa) `aguardando_cliente` → (resposta) `pendente` → `resolvido` | `encerrado` | `cancelado`. Reabrir pede motivo. RLS ligada sem policies; auditoria (`audit.registrar`) e trava de origem nas tabelas `mov_`.

## API (`api.*`, security definer)
`agenda_listar` (mês/semana, até 62 dias, filtros por responsável e tipo) · `agenda_minha_fila` (atrasados, hoje, aguardando cliente, próximos 7 dias) · `agenda_salvar` (criar/editar; valida responsável e vínculos da mesma empresa) · `agenda_registrar_interacao` · `agenda_concluir` (regra da decisão 2) · `agenda_reabrir` · `agenda_interacoes` · `agenda_responsaveis` · `agenda_tipos` · `agenda_salvar_config` (admin/gestor) · `agenda_obter` (um compromisso pelo id, usado pelo link do convite) · `agenda_obter_config`.

## Convite por e-mail (decisão 3)
- Reaproveita o envio que já funciona: chave `email_resend_api_key` no Vault e o remetente de `engine.cfg_alerta` (2 alertas já entregues). Job `agenda-enviar-convites` no `pg_cron`, a cada minuto, 10 por ciclo, até 5 tentativas.
- Mesmo `UID` por compromisso e `SEQUENCE` crescente: mudar data/título/responsável **atualiza** o evento no calendário; concluir ou cancelar envia `CANCEL` e o evento sai do calendário; trocar responsável cancela no calendário do anterior.
- **LGPD:** o convite leva título, tipo e link para o painel; **não** leva telefone nem CPF, e o nome da cliente só com `nome_cliente_no_convite = true`. Oriente a equipe a não escrever dado pessoal no título.
- **[validar]** Gmail e Outlook reconhecerem o anexo `text/calendar; method=REQUEST` enviado pelo Resend como convite (com botão "Adicionar"). O Google Calendar costuma **ignorar o VALARM** do convite e usar o aviso padrão da própria conta; o Outlook respeita. Testar com os e-mails reais antes de ligar `enviar_convite`.
- Mensagem para a **cliente** continua fora: é escrita externa (D12) e esbarra na janela de 24 h da Meta. A agenda só lembra a equipe.

## Painel (a fazer, código em `painel/src`)
1. **Agenda › Calendário:** clicar no dia abre "Novo compromisso" (tipo, título, data/hora ou dia inteiro, responsável, prioridade, vínculo com cliente/pedido/live, avisos). Cores por tipo; atrasados destacados; filtro "só meus" e por tipo.
2. **Agenda › Minha fila:** quatro blocos (atrasados, hoje, aguardando cliente, próximos 7 dias), com ações Registrar tentativa, Registrar resposta, Resolver e Encerrar.
3. **Detalhe:** linha do tempo das interações; Resolver bloqueado com aviso claro quando falta resposta da cliente.
4. **Ficha da cliente e do pedido:** botão "Agendar follow-up" com o vínculo preenchido e lista dos compromissos.
5. **Integrações › Agenda:** ligar o convite, avisos padrão, tentativas mínimas e "botão enviar convite de teste".
6. Corrigir o texto do manual (seção Agenda).

## Fases
| Fase | Entrega | Situação |
|---|---|---|
| 1 | Este pedido: modelo, API, regra de encerramento, convite por e-mail (desligado até o teste) e telas 1 a 3 e 5 | **Entregue** (banco aplicado; painel no código, sem commit nem deploy) |
| 2 | Tela 4 (ficha da cliente e do pedido); live passa a nascer da agenda (compromisso tipo live com `live_id`) | Próxima |
| 3 | Regras automáticas com interação da cliente, via `chave_regra` única: reserva expirada sem pagamento → follow-up no dia seguinte (D+1); pedido entregue → pós-venda em D+3; devolução solicitada → pós-venda com prazo. **Prazos aprovados pelo Dione em 25/11** | A expiração automática de reservas já existe (migration 0086 da outra sessão); falta o rastreio para o D+3 |
| 4 | Aviso à cliente pelo canal, se a política D12 e as regras da Meta permitirem | Futuro |

## O que foi entregue no painel (`painel/src`)
- `apiAgenda.ts` (novo): tipos e chamadas `agenda_*`; lê o `?c=<id>` do link do convite na carga do app.
- `pages/Agenda.tsx` (reescrito) e `pages/agenda.css` (novo, isolado do `styles.css`):
  - **Minha fila:** atrasados, hoje, aguardando cliente e próximos 7 dias.
  - **Calendário:** títulos coloridos por tipo dentro do dia, filtros por tipo, "Só os meus" e "Mostrar concluídos"; painel do dia com "+ Novo neste dia".
  - **Novo/editar:** tipo, título (aviso de LGPD), data, início/término ou dia todo, responsável (qualquer pessoa da empresa), prioridade, cliente (busca), descrição e avisos do calendário. Perto da meia-noite, a sugestão passa para o dia seguinte.
  - **Detalhe:** dados, aviso da regra de interação, ações (registrar tentativa, cliente respondeu, anotar, editar, cancelar, encerrar com motivo, resolver; reabrir) e histórico. "Resolver" fica bloqueado em follow-up e pós-venda sem resposta da cliente.
  - **Configuração** (admin e gestor): convite por e-mail, avisos padrão, duração padrão, tentativas mínimas e nome da cliente no convite.
- `Calendario.tsx`: aceita cor e título por evento e avisa a troca de mês (`onMudarMes`).
- `App.tsx` (2 linhas): passa `ctx` para a Agenda e aceita `#agenda?c=<id>` (antes, qualquer sufixo no hash abria Peças).
- `ajuda/conteudo.ts`: verbete da Agenda reescrito; `docs/manual-painel.md` regenerado (`verificar-ajuda.mjs`).
- Verificação: `tsc --noEmit` sem erros; tela aberta em `localhost:5173` (Minha fila, formulário e calendário), sem erro no console. **Nenhum compromisso foi criado pela tela** (o banco é o de produção).
- **Sem commit:** a árvore tem alterações em andamento de outra sessão (Atendimento) nos mesmos arquivos (`App.tsx`, manual). Commitar junto com elas ou separar por arquivo.

## Adendo 25/11 (23h34): editar no calendário, arrastar, cores e lembrete em qualquer tela
Pedido do Dione: clicar no compromisso da célula e já editar; arrastar para outro dia; cor com legenda para atraso e pendente de resposta, piscando suave; pop-up de lembrete onde quer que o painel esteja aberto. **Só painel, sem migration.**
- `Calendario.tsx`: célula virou `div` com papel de botão (os itens dentro são clicáveis); cada item tem `id`, `situacao` e pode ser arrastado (HTML5 drag and drop). Até 3 itens por dia, "+N" para o resto.
- `apiAgenda.ts`: `situacao()` calculada no navegador a cada 30 s: **atrasado** (término, ou início sem término, já passou; dia todo vence no fim do dia), **começa em breve** (até 30 min antes e enquanto acontece), **aguardando resposta da cliente**, pendente e concluído. `mover()` remarca mantendo a hora e levando o término junto. Toda gravação dispara o evento `ane:agenda-mudou` para as telas abertas recarregarem.
- `pages/Agenda.tsx`: clique no compromisso abre **Editar** (concluído abre o detalhe); arrastar mostra aviso "remarcado para…" com **Desfazer** (8 s); legenda abaixo do calendário e acima da Minha fila; o formulário de edição tem atalho para o histórico e as ações.
- `pages/agenda.css`: vermelho e dourado **piscam suavemente** (2,4 s) no item, na célula e na lista; âmbar fixo para aguardando; concluído riscado. Sem animação para quem ativou "reduzir movimento" no sistema.
- `LembretesAgenda.tsx` (novo, montado no `App.tsx` para quem tem acesso à Agenda): verifica a cada minuto e logo depois de qualquer gravação. Avisa nos minutos de antecedência do compromisso (ou o padrão da Configuração) e na hora do início; dia todo avisa às 8h; aviso vencido há mais de 6 h não aparece. Cartões no canto inferior direito com **Abrir** (vai à Agenda e abre o compromisso), **Adiar 10 min** e **Dispensar**; no máximo 4; o que já foi avisado fica marcado no navegador. Uma vez por dia, resumo dos atrasados com "Ver minha fila". Com a aba em segundo plano e a permissão dada pelo botão do próprio cartão, sai também notificação do sistema.
- `App.tsx`: `Agenda` recebe o atalho (`c:<id>` abre o compromisso; `fila` abre a Minha fila) e o componente de lembretes fica fixo fora das abas.
- Verificação: `tsc` sem erros; no navegador, com 2 compromissos de teste criados e apagados no banco: lembrete "começa em 10 min" e resumo de atrasado apareceram na tela Peças; "Abrir" levou ao detalhe; clique no item abriu Editar; arrastar do dia 25 para o 27 gravou e "Desfazer" voltou ao horário original (conferido no banco). O arrasto pelo mouse da automação não dispara o drag nativo do navegador; foi validado com eventos de arrasto disparados na página. **Testar com o mouse de verdade.**

## Pendências
1. **Testar o convite** antes de ligar: criar um compromisso para si com o convite ligado e ver no Gmail/Outlook se aparece como evento.
2. Ajustar `api._semear_permissoes` para empresas novas já nascerem com o padrão da decisão 1.
3. Fase 2 (ficha da cliente/pedido e live) e fase 3 (regras D+1 e D+3).
4. Commit e deploy do painel; grafo a atualizar depois do commit (`sh .git/hooks/post-commit` no Mac).

## Reversão
`select cron.unschedule('agenda-enviar-convites');` `drop function` das `api.agenda_*` (inclui `agenda_obter` e `agenda_obter_config`), `api._agenda_json`, `api._agenda_editores`; `drop schema agenda cascade;` e devolver `nivel = 'ver'` para suporte, expedição e financeiro na tela `agenda`.
