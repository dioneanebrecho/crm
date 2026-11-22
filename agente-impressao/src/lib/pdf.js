const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Baixa o PDF de uma URL (Supabase Storage) para um arquivo temporario local,
 * que e o formato que o spooler do Windows / SumatraPDF esperam para imprimir.
 */
async function baixarPdf(url, tempDir) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar PDF da fila (HTTP ${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `${crypto.randomUUID()}.pdf`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = { baixarPdf };
