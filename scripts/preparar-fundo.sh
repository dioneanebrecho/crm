#!/usr/bin/env bash
# Prepara as fotos do fundo da tela de login (até 10) a partir de uma pasta com as imagens.
# Uso: scripts/preparar-fundo.sh ~/Downloads/fotos-instagram
# Redimensiona (lado maior 1600 px, JPEG leve) para painel/public/fundo/01.jpg… e recria fundo.json.
# Depois edite painel/public/fundo/fundo.json para preencher as legendas (opcional).
set -euo pipefail
origem="${1:?Informe a pasta com as fotos}"
destino="$(cd "$(dirname "$0")/.." && pwd)/painel/public/fundo"
mkdir -p "$destino"
rm -f "$destino"/[0-9][0-9].jpg
n=0
json="["
while IFS= read -r f; do
  n=$((n + 1)); [ "$n" -gt 10 ] && break
  nome=$(printf '%02d.jpg' "$n")
  sips -Z 1600 -s format jpeg -s formatOptions 78 "$f" --out "$destino/$nome" >/dev/null
  json+="$([ "$n" -gt 1 ] && echo ,){\"arquivo\":\"$nome\",\"legenda\":\"\"}"
done < <(find "$origem" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.heic' \) | sort)
echo "$json]" > "$destino/fundo.json"
echo "$((n > 10 ? 10 : n)) foto(s) em $destino"
