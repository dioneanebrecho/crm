/**
 * Credencial do agente (agente_id + segredo), gerada no pareamento.
 *
 * No Windows o arquivo credencial.dat e protegido com DPAPI no escopo
 * LocalMachine: so processos DESTE computador conseguem decifrar. Copiar o
 * arquivo para outro PC nao funciona. Alem disso, o ACL do arquivo e
 * restrito a SYSTEM e Administradores (o servico roda como LocalSystem).
 *
 * O segredo nunca sai daqui em claro: o servidor so conhece o SHA-256 dele,
 * e o acesso pode ser revogado a qualquer momento na retaguarda.
 *
 * Fora do Windows (apenas desenvolvimento) o arquivo e gravado em texto com
 * permissao 0600 e um aviso no log.
 */
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ARQUIVO_CREDENCIAL } = require('./config');

const IS_WINDOWS = process.platform === 'win32';
const PREFIXO_DPAPI = 'DPAPI1:';
// "Entropia" adicional do DPAPI: outro programa no mesmo PC precisa conhece-la
// para decifrar. Nao e segredo forte, so eleva a barra.
const ENTROPIA = 'ZStockPrintAgent/credencial/v1';

function powershellDpapi(operacao, entradaBase64) {
  const script =
    'Add-Type -AssemblyName System.Security;' +
    '$in=[Convert]::FromBase64String($env:ZS_IN);' +
    '$ent=[Text.Encoding]::UTF8.GetBytes($env:ZS_ENT);' +
    `$out=[Security.Cryptography.ProtectedData]::${operacao}($in,$ent,[Security.Cryptography.DataProtectionScope]::LocalMachine);` +
    '[Convert]::ToBase64String($out)';
  // Dados passam por variavel de ambiente, nunca pela linha de comando
  // (que fica visivel na lista de processos).
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ZS_IN: entradaBase64, ZS_ENT: ENTROPIA },
    windowsHide: true,
    encoding: 'utf8',
  }).trim();
}

function restringirAcl(arquivo) {
  if (!IS_WINDOWS) return;
  try {
    // S-1-5-18 = SYSTEM, S-1-5-32-544 = Administradores
    execFileSync('icacls', [arquivo, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    /* sem ACL restrito o DPAPI continua protegendo contra copia para outro PC */
  }
}

function gerarSegredo() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashSegredo(segredo) {
  return crypto.createHash('sha256').update(segredo).digest('hex');
}

function salvarCredencial({ agente_id, segredo }) {
  const json = JSON.stringify({ agente_id, segredo, gravado_em: new Date().toISOString() });
  let conteudo;
  if (IS_WINDOWS) {
    conteudo = PREFIXO_DPAPI + powershellDpapi('Protect', Buffer.from(json, 'utf8').toString('base64'));
  } else {
    console.warn('[credencial] AVISO: fora do Windows a credencial e gravada sem DPAPI (somente para desenvolvimento).');
    conteudo = json;
  }
  fs.writeFileSync(ARQUIVO_CREDENCIAL, conteudo, { encoding: 'utf8', mode: 0o600 });
  restringirAcl(ARQUIVO_CREDENCIAL);
}

/** Retorna {agente_id, segredo} ou null se nao houver credencial valida. */
function carregarCredencial() {
  if (!fs.existsSync(ARQUIVO_CREDENCIAL)) return null;
  const bruto = fs.readFileSync(ARQUIVO_CREDENCIAL, 'utf8').trim();
  let json;
  if (bruto.startsWith(PREFIXO_DPAPI)) {
    if (!IS_WINDOWS) throw new Error('credencial.dat protegida por DPAPI so pode ser lida no Windows.');
    json = Buffer.from(powershellDpapi('Unprotect', bruto.slice(PREFIXO_DPAPI.length)), 'base64').toString('utf8');
  } else {
    json = bruto;
  }
  const dados = JSON.parse(json);
  if (!dados.agente_id || !dados.segredo) return null;
  return { agente_id: dados.agente_id, segredo: dados.segredo };
}

function removerCredencial() {
  try { fs.unlinkSync(ARQUIVO_CREDENCIAL); } catch { /* nada a remover */ }
}

module.exports = { gerarSegredo, hashSegredo, salvarCredencial, carregarCredencial, removerCredencial };
