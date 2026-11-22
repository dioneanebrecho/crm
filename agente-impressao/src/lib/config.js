/**
 * Configuracao fixa do agente. NADA aqui e segredo:
 *  - a URL do projeto e publica;
 *  - a anon key e a mesma chave publica embutida no app web do CRM Ane Brecho.
 * O agente nao usa mais service key: ele so conversa com a Edge Function
 * impressao-agente, autenticado pela credencial gerada no pareamento
 * (ver credencial.js).
 *
 * Para desenvolvimento, e possivel apontar para outro projeto via variaveis
 * de ambiente ANE_SUPABASE_URL / ANE_ANON_KEY (nunca necessario em
 * producao).
 */
const path = require('path');

const SUPABASE_URL = process.env.ANE_SUPABASE_URL || 'https://gikudypnbnnugduphbpb.supabase.co';
const ANON_KEY =
  process.env.ANE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdpa3VkeXBuYm5udWdkdXBoYnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyNzI0NzAsImV4cCI6MjExMDg0ODQ3MH0.UqjzWZihUl7FZH-DbubXPcYPCL6iLl7cc1HjKfzr2oU';

const API_URL = `${SUPABASE_URL}/functions/v1/impressao-agente`;

// Pasta onde o agente guarda a credencial e os PDFs temporarios: ao lado do
// .exe quando empacotado (pkg), ou a raiz do projeto em modo dev.
const PASTA_BASE = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..');

const VERSAO = require('../../package.json').version;

module.exports = {
  API_URL,
  ANON_KEY,
  PASTA_BASE,
  VERSAO,
  ARQUIVO_CREDENCIAL: path.join(PASTA_BASE, 'credencial.dat'),
  TEMP_DIR: path.join(PASTA_BASE, 'tmp'),
};
