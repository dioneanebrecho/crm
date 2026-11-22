# Agente de impressão — CRM Ane Brechó

Programa que roda no computador ligado à impressora térmica (ZPL). Ele busca a fila no servidor (Edge Function `impressao-agente`) e envia
cada etiqueta para a impressora. Adaptado do `zstock-print-agent`; só imprime ZPL (`zpl_windows` e `zpl_tcp`). PDF fica para a fase seguinte.

## Instalar e parear
1. No computador da impressora: Node 18+ instalado. Pasta do agente: `npm install`.
2. `node src/index.js --parear` mostra um código de 8 caracteres.
3. No painel: **Etiquetas > Agentes**, digitar o código e **Aprovar agente** (admin ou gestor).
4. `node src/index.js` deixa o agente imprimindo (ou use o instalador/serviço do Windows como no ZStock).
5. No painel: **Etiquetas > Impressoras**, cadastrar a impressora (nome exato do Windows, ou IP:9100) e usar **Imprimir teste**.

Para outro projeto Supabase (desenvolvimento): variáveis `ANE_SUPABASE_URL` e `ANE_ANON_KEY`. Nada aqui é segredo; a credencial do agente fica em `credencial.dat`, criptografada no Windows.
