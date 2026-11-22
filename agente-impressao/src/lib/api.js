/**
 * Cliente da Edge Function impressao-agente.
 */
const { API_URL, ANON_KEY } = require('./config');

class ErroApi extends Error {
  constructor(mensagem, status, codigo) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

async function chamar(acao, corpo = {}, { credencial, timeoutMs = 30000 } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  };
  if (credencial) headers['x-agente-secret'] = credencial.segredo;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ acao, ...(credencial ? { agente_id: credencial.agente_id } : {}), ...corpo }),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new ErroApi(`Sem conexao com o servidor do Ane Brecho (${err.name === 'AbortError' ? 'timeout' : err.message}).`, 0, 'rede');
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErroApi(json.erro || `HTTP ${res.status}`, res.status, json.codigo);
  }
  return json;
}

module.exports = { chamar, ErroApi };
