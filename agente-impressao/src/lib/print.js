const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { execFile } = require('child_process');
const { print } = require('pdf-to-printer');

/**
 * pdf-to-printer procura o SumatraPDF.exe do lado de dentro do proprio
 * pacote (path.join(__dirname, 'SumatraPDF-...exe')). Isso funciona rodando
 * com "node src/index.js" (modo dev), mas quebra no executavel unico gerado
 * com pkg: o __dirname interno aponta para dentro do snapshot, de onde nao
 * da pra executar um .exe. Nesse caso o instalador deixa uma copia de
 * SumatraPDF.exe do lado do zstock-print-agent.exe, e apontamos pra ela
 * explicitamente via a opcao sumatraPdfPath (suportada nativamente pelo
 * pdf-to-printer para isso).
 */
function resolveSumatraPath() {
  if (process.pkg) {
    return path.join(path.dirname(process.execPath), 'SumatraPDF.exe');
  }
  return undefined;
}

const ESCALAS = ['noscale', 'shrink', 'fit'];
const ORIENTACOES = ['portrait', 'landscape'];

/**
 * Impressao de PDF via spooler do Windows - tipo_conexao = 'windows' (e
 * fallback de 'zpl_windows' para etiquetas que ainda nao tem gerador ZPL).
 *
 * v2.1 (24/09/2026): antes o SumatraPDF era chamado sem -print-settings e
 * usava "shrink" + o papel padrao do driver. Numa termica 80x60 isso girava a
 * etiqueta 90 graus e reduzia para ~75% (texto/barras serrilhados). Agora:
 *  - escala: 'noscale' por padrao (tamanho real do PDF, sem reamostrar);
 *  - orientacao: so e forcada se a impressora estiver cadastrada com
 *    portrait/landscape ('auto' deixa o driver decidir);
 *  - monochrome: termica nao tem cor, evita meio-tom no texto.
 * O TAMANHO do papel continua vindo do driver - por isso os "Padroes de
 * impressao" da impressora (Propriedades > Avancado) precisam ter o tamanho
 * da etiqueta (ver LEIA-ME.txt).
 */
async function imprimirWindows(pdfPath, nomeImpressora, copias = 1, opcoes = {}) {
  const escala = ESCALAS.includes(opcoes.escala) ? opcoes.escala : 'noscale';
  const orientacao = ORIENTACOES.includes(opcoes.orientacao) ? opcoes.orientacao : undefined;
  await print(pdfPath, {
    printer: nomeImpressora,
    copies: Math.max(1, copias || 1),
    silent: true,
    scale: escala,
    orientation: orientacao,
    monochrome: true,
    sumatraPdfPath: resolveSumatraPath(),
  });
}

/** Repete o conteudo N vezes (copias) - vale para ZPL e qualquer linguagem de termica. */
function repetir(conteudo, copias) {
  const n = Math.max(1, Math.min(Number(copias) || 1, 99));
  return n === 1 ? conteudo : Array(n).fill(conteudo).join('\n');
}

/**
 * Impressao direta via socket TCP - tipo_conexao = 'zpl_tcp'.
 * Usada por impressoras termicas dedicadas (Zebra/Argox/Elgin) que aceitam
 * ZPL cru na porta 9100, sem depender de driver nenhum do Windows.
 * `hostPorta` no formato "IP:PORTA" (porta padrao 9100 se omitida).
 */
function imprimirZplTcp(zpl, hostPorta, copias = 1, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const [host, portaStr] = String(hostPorta).split(':');
    const porta = Number(portaStr) || 9100;
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout ao conectar em ${host}:${porta}.`));
    }, timeoutMs);

    socket.connect(porta, host, () => {
      socket.write(repetir(zpl, copias), 'latin1', (err) => {
        clearTimeout(timer);
        if (err) {
          socket.destroy();
          return reject(err);
        }
        socket.end();
        resolve();
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Script PowerShell que envia bytes crus (RAW) para uma impressora instalada
 * no Windows, pela API do spooler (winspool.drv: OpenPrinter / StartDocPrinter
 * com datatype "RAW" / WritePrinter). E o mesmo caminho que o ZebraDesigner e
 * o BarTender usam para mandar ZPL/PPLB por USB: o driver nao renderiza nada,
 * os comandos chegam intactos na impressora. Nome da impressora e arquivo vem
 * por variavel de ambiente (sem risco de quebrar aspas).
 */
const PS_RAW = String.raw`
$ErrorActionPreference = 'Stop'
$src = @"
using System;
using System.Runtime.InteropServices;
public static class ZStockRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr h, IntPtr def);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("Impressora '" + printer + "' nao encontrada neste PC (erro " + Marshal.GetLastWin32Error() + ").");
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "ZStock etiqueta";
      di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) {
        int e = Marshal.GetLastWin32Error();
        if (e == 1804) throw new Exception("O driver desta impressora nao aceita envio RAW (erro 1804). Use o driver do fabricante (nao o 'Generic / Text Only' v4) ou a conexao Windows (PDF).");
        throw new Exception("StartDocPrinter falhou (erro " + e + ").");
      }
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter falhou (erro " + Marshal.GetLastWin32Error() + ").");
        int w;
        if (!WritePrinter(h, data, data.Length, out w) || w != data.Length)
          throw new Exception("WritePrinter falhou (erro " + Marshal.GetLastWin32Error() + ", " + w + "/" + data.Length + " bytes).");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $src -Language CSharp
[ZStockRaw]::Send($env:ZSTOCK_RAW_PRINTER, [System.IO.File]::ReadAllBytes($env:ZSTOCK_RAW_FILE))
`;

const PS_RAW_ENCODED = Buffer.from(PS_RAW, 'utf16le').toString('base64');

/**
 * v2.1.1 (29/09/2026): o envio RAW passou a usar o utilitario
 * ZStockRawPrint.exe (C#/.NET 4, 6 KB, instalado ao lado do agente). Na v2.1.0
 * era via powershell.exe, e no primeiro cliente (PETMATRIZ-PC15) o Windows
 * negou criar o processo do PowerShell a partir do servico ("spawn EPERM" -
 * politica/antivirus). O PowerShell fica so como plano B se o .exe faltar.
 */
function resolveRawHelper() {
  const base = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..', 'vendor');
  const exe = path.join(base, 'ZStockRawPrint.exe');
  return fs.existsSync(exe) ? exe : null;
}

function executar(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (!err) return resolve(String(stdout || ''));
      const linhas = String(stderr || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const e = new Error(linhas.find((l) => /nao encontrada|RAW|falhou/i.test(l)) || linhas[0] || err.message);
      e.code = err.code;
      reject(e);
    });
  });
}

/** Nomes das impressoras instaladas neste PC (para mensagens de erro). '' se nao conseguir. */
async function listarImpressoras() {
  const helper = resolveRawHelper();
  if (!helper || process.platform !== 'win32') return '';
  try {
    return (await executar(helper, ['--listar'], { timeout: 15000 })).trim();
  } catch {
    return '';
  }
}

/**
 * Impressao em linguagem nativa (ZPL) pela fila do Windows - tipo_conexao =
 * 'zpl_windows'. Para termicas USB (ex.: ELGIN L42PRO FULL em emulacao
 * PPLZ/ZPL) ou instaladas pelo IP no PC do agente. Texto sai com fonte da
 * propria impressora e o codigo de barras e gerado por ela - nitido, sem
 * rasterizar PDF.
 */
async function imprimirRawWindows(conteudo, nomeImpressora, copias = 1, tmpDir = path.join(os.tmpdir(), 'zstock-print-agent'), timeoutMs = 45000) {
  if (process.platform !== 'win32') {
    throw new Error('Impressao RAW (zpl_windows) so funciona no Windows.');
  }
  fs.mkdirSync(tmpDir, { recursive: true });
  const arquivo = path.join(tmpDir, `${crypto.randomUUID()}.prn`);
  fs.writeFileSync(arquivo, Buffer.from(repetir(conteudo, copias), 'latin1'));
  try {
    const helper = resolveRawHelper();
    if (helper) {
      await executar(helper, ['--imprimir', nomeImpressora, arquivo], { timeout: timeoutMs });
      return;
    }
    await executar(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', PS_RAW_ENCODED],
      { timeout: timeoutMs, env: { ...process.env, ZSTOCK_RAW_PRINTER: nomeImpressora, ZSTOCK_RAW_FILE: arquivo } },
    );
  } catch (err) {
    throw new Error(`Falha no envio RAW: ${err.message}`);
  } finally {
    fs.unlink(arquivo, () => {});
  }
}

module.exports = { imprimirWindows, imprimirZplTcp, imprimirRawWindows, listarImpressoras };
