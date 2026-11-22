/**
 * Ane Brecho Print Agent v2
 *
 * Modos:
 *   ane-print-agent.exe --parear [--forcar]   pareamento interativo (usado pelo instalar.bat)
 *   ane-print-agent.exe                        servico: consome a fila e imprime
 *
 * O agente nao tem nenhuma chave do banco. Ele conversa apenas com a Edge
 * Function impressao-agente usando a credencial do pareamento, e so
 * enxerga jobs da empresa que o aprovou.
 */
const fs = require('fs');
const os = require('os');
const { chamar, ErroApi } = require('./lib/api');
const { carregarCredencial } = require('./lib/credencial');
const { baixarPdf } = require('./lib/pdf');
const { imprimirWindows, imprimirZplTcp, imprimirRawWindows, listarImpressoras } = require('./lib/print');
const { VERSAO, TEMP_DIR } = require('./lib/config');
const { parear } = require('./parear');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(msg) {
  console.log(`[${new Date().toLocaleString('pt-BR')}] ${msg}`);
}

async function imprimirPdf(job, copias) {
  if (!job.conteudo_pdf_url) throw new Error('Job sem conteudo_pdf_url para impressora windows.');
  const pdfPath = await baixarPdf(job.conteudo_pdf_url, TEMP_DIR);
  try {
    await imprimirWindows(pdfPath, job.caminho_rede, copias, {
      escala: job.escala,
      orientacao: job.orientacao,
    });
  } catch (err) {
    // SumatraPDF sai com codigo 1 e sem mensagem quando o nome da impressora
    // nao existe - mostra o que o Windows deste PC tem instalado.
    const instaladas = await listarImpressoras();
    throw new Error(`Falha ao imprimir PDF em "${job.caminho_rede}"${instaladas ? ` - impressoras neste PC: ${instaladas}` : ''} (${String(err.message || err).split('\n')[0].slice(0, 160)})`);
  } finally {
    fs.unlink(pdfPath, () => {});
  }
}

async function imprimir(job) {
  const copias = job.copias || 1;
  if (job.tipo_conexao === 'zpl_tcp') {
    if (!job.conteudo_zpl) throw new Error('Job sem conteudo_zpl para impressora zpl_tcp (esta etiqueta ainda nao tem versao ZPL - use conexao Windows ou ZPL via Windows).');
    await imprimirZplTcp(job.conteudo_zpl, job.caminho_rede, copias);
    return;
  }
  // v2.1: termica USB/instalada no Windows recebendo ZPL cru pelo spooler.
  // Etiquetas sem ZPL (ex.: enderecamento com modelo livre) caem no PDF.
  if (job.tipo_conexao === 'zpl_windows' && job.conteudo_zpl) {
    try {
      await imprimirRawWindows(job.conteudo_zpl, job.caminho_rede, copias, TEMP_DIR);
      return;
    } catch (err) {
      // Impressora inexistente: nao adianta tentar PDF no mesmo nome
      if (/nao encontrada/i.test(err.message) || !job.conteudo_pdf_url) throw err;
      log(`  -> ZPL falhou (${err.message}); imprimindo o PDF pelo driver.`);
    }
  }
  await imprimirPdf(job, copias);
}

async function reportar(credencial, job, sucesso, erro) {
  for (let i = 0; i < 5; i++) {
    try {
      await chamar('resultado', { job_id: job.id, sucesso, erro }, { credencial });
      return;
    } catch (err) {
      if (err instanceof ErroApi && err.codigo !== 'rede' && err.status < 500) {
        log(`  -> resultado nao aceito pelo servidor: ${err.message}`);
        return;
      }
      await sleep(2000 * (i + 1));
    }
  }
  log('  -> nao foi possivel reportar o resultado (sem rede); o job volta para a fila em 5 min.');
}

async function aguardarCredencial() {
  let avisou = false;
  while (true) {
    try {
      const cred = carregarCredencial();
      if (cred) return cred;
    } catch (err) {
      if (!avisou) log(`Erro ao ler credencial.dat: ${err.message}`);
    }
    if (!avisou) {
      log('Agente ainda nao pareado. Rode "instalar.bat" como administrador para gerar o codigo de pareamento.');
      avisou = true;
    }
    await sleep(60000);
  }
}

async function servico() {
  log(`=== Ane Brecho Print Agent v${VERSAO} (${os.hostname()}) ===`);
  let credencial = await aguardarCredencial();
  log(`Credencial carregada (agente ${credencial.agente_id.slice(0, 8)}...). Aguardando etiquetas.`);

  let ultimoErroLog = '';
  while (true) {
    try {
      const { jobs } = await chamar(
        'proximos_jobs',
        { espera_ms: 20000, versao: VERSAO },
        { credencial, timeoutMs: 40000 },
      );
      if (ultimoErroLog) {
        log('Conexao com o servidor restabelecida.');
        ultimoErroLog = '';
      }
      for (const job of jobs || []) {
        const formato = job.tipo_conexao !== 'windows' && job.conteudo_zpl ? 'ZPL' : `PDF ${job.escala || 'noscale'}/${job.orientacao || 'auto'}`;
        log(`Imprimindo job ${job.id} -> "${job.impressora_nome}" (${job.tipo_conexao}, ${formato}) x${job.copias || 1}`);
        try {
          await imprimir(job);
          log('  -> OK');
          await reportar(credencial, job, true);
        } catch (err) {
          log(`  -> ERRO: ${err.message}`);
          await reportar(credencial, job, false, err.message);
        }
      }
    } catch (err) {
      const msg = err.message || String(err);
      if (msg !== ultimoErroLog) {
        log(`Aviso: ${msg}`);
        ultimoErroLog = msg;
      }
      if (err instanceof ErroApi && (err.codigo === 'revogado' || err.codigo === 'credencial_invalida' || err.codigo === 'nao_aprovado')) {
        log('Este agente nao esta autorizado. Rode "instalar.bat" para parear novamente. Nova verificacao em 60s.');
        await sleep(60000);
        // Permite que um novo pareamento (credencial.dat nova) entre em vigor sem reiniciar o servico
        try { credencial = carregarCredencial() || credencial; } catch { /* mantem a atual */ }
      } else {
        await sleep(5000);
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--parear')) {
    const codigo = await parear({ forcar: args.includes('--forcar') });
    process.exit(codigo);
  }
  if (args.includes('--versao')) {
    console.log(VERSAO);
    return;
  }
  await servico();
}

main().catch((err) => {
  log(`Erro fatal: ${err.message}`);
  process.exit(1);
});
