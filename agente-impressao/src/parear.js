/**
 * Pareamento do agente com a painel do Ane Brecho (aba Etiquetas > Agentes) (modo "--parear").
 *
 * Fluxo (estilo "codigo de TV"):
 *  1. Gera um segredo aleatorio NESTE PC e envia so o SHA-256 dele.
 *  2. O servidor devolve um codigo curto (ex.: K7QF-29XM), valido por 15 min.
 *  3. Um admin/supervisor da empresa digita o codigo em
 *     Configuracoes > Impressoras > Agentes de impressao > Aprovar.
 *     A aprovacao amarra este agente a empresa (CNPJ) de quem aprovou.
 *  4. Ao detectar a aprovacao, grava credencial.dat (DPAPI) e sai com codigo 0.
 *
 * Nenhuma chave ou senha e digitada ou gravada em texto neste PC.
 */
const os = require('os');
const { chamar, ErroApi } = require('./lib/api');
const { gerarSegredo, hashSegredo, salvarCredencial, carregarCredencial } = require('./lib/credencial');
const { VERSAO } = require('./lib/config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const formatarCodigo = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

async function statusCredencialAtual() {
  let cred;
  try {
    cred = carregarCredencial();
  } catch (err) {
    console.log(`Credencial existente ilegivel (${err.message}) - sera gerada uma nova.`);
    return null;
  }
  if (!cred) return null;
  try {
    const r = await chamar('status_pareamento', {}, { credencial: cred });
    return r.status;
  } catch (err) {
    if (err instanceof ErroApi && err.status === 401) return null;
    throw err;
  }
}

async function parear({ forcar = false } = {}) {
  console.log('');
  console.log('==================================================');
  console.log('  Ane Brecho - Agente de Impressao - Pareamento');
  console.log('==================================================');

  if (!forcar) {
    const atual = await statusCredencialAtual();
    if (atual === 'ativo') {
      console.log('Este PC ja esta pareado e aprovado. Nada a fazer.');
      console.log('(Para parear de novo, rode: ane-print-agent.exe --parear --forcar)');
      return 0;
    }
    if (atual === 'revogado') {
      console.log('O pareamento anterior deste PC foi REVOGADO na retaguarda. Gerando um novo codigo...');
    }
  }

  for (let rodada = 1; rodada <= 3; rodada++) {
    const segredo = gerarSegredo();
    const r = await chamar('solicitar_pareamento', {
      hostname: os.hostname(),
      versao: VERSAO,
      secret_hash: hashSegredo(segredo),
    });
    const credencial = { agente_id: r.agente_id, segredo };
    const expiraEm = new Date(r.expira_em);

    console.log('');
    console.log('  +--------------------------------------+');
    console.log(`  |   CODIGO DE PAREAMENTO:  ${formatarCodigo(r.codigo)}   |`);
    console.log('  +--------------------------------------+');
    console.log('');
    console.log('  Na painel do Ane Brecho (aba Etiquetas > Agentes), com um usuario admin ou supervisor');
    console.log('  da empresa correta, abra:');
    console.log('    Configuracoes > Impressoras > Agentes de impressao');
    console.log('  e clique em "Aprovar agente" informando o codigo acima.');
    console.log('');
    console.log(`  Computador: ${os.hostname()}`);
    console.log(`  Valido ate: ${expiraEm.toLocaleTimeString('pt-BR')}`);
    console.log('');
    process.stdout.write('  Aguardando aprovacao');

    while (Date.now() < expiraEm.getTime() + 5000) {
      await sleep(3000);
      process.stdout.write('.');
      let st;
      try {
        st = await chamar('status_pareamento', {}, { credencial });
      } catch (err) {
        if (err instanceof ErroApi && err.codigo === 'rede') continue;
        throw err;
      }
      if (st.status === 'ativo') {
        salvarCredencial(credencial);
        console.log('');
        console.log('');
        console.log(`  APROVADO! Agente "${st.nome}" vinculado a empresa: ${st.nome_empresa || '-'}`);
        console.log('  Credencial gravada e protegida neste computador.');
        console.log('');
        return 0;
      }
      if (st.status === 'expirado' || st.status === 'revogado') break;
    }
    console.log('');
    console.log('  Codigo expirou sem aprovacao.' + (rodada < 3 ? ' Gerando um novo...' : ''));
  }
  console.log('  Pareamento nao concluido. Rode o instalador novamente quando o admin estiver disponivel.');
  return 2;
}

module.exports = { parear };
