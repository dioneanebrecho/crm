#!/usr/bin/env bash
# Publica as Edge Functions de integração no Supabase da Ane Brechó.
# Uso:  bash scripts/publicar-funcoes.sh            (publica todas)
#       bash scripts/publicar-funcoes.sh integracao-testar   (publica só uma)
set -euo pipefail

REF="gikudypnbnnugduphbpb"
PAINEL="${PAINEL_URL:-http://localhost:5173}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

# 1) CLI instalada?
if ! command -v supabase >/dev/null 2>&1; then
  echo ">> CLI do Supabase não encontrada. Instalando com Homebrew..."
  command -v brew >/dev/null 2>&1 || { echo "ERRO: Homebrew não está instalado (https://brew.sh). Instale-o e rode de novo."; exit 1; }
  brew install supabase/tap/supabase
fi
echo ">> CLI: $(supabase --version)"

# 2) Login com a conta que enxerga o projeto da Ane (conta dedicada, diferente da Zaya)
if ! supabase projects list 2>/dev/null | grep -q "$REF"; then
  echo ">> A conta logada na CLI não enxerga o projeto $REF."
  echo ">> Saindo da conta atual e abrindo o login. No navegador, entre com a conta Supabase DEDICADA da Ane Brechó."
  supabase logout --yes 2>/dev/null || true
  supabase login
  supabase projects list 2>/dev/null | grep -q "$REF" || { echo "ERRO: esta conta também não enxerga o projeto $REF. Confira qual conta Supabase é dona do projeto crm_anebrecho."; exit 1; }
fi

# 3) Vínculo com o projeto da Ane
echo ">> Vinculando ao projeto $REF"
supabase link --project-ref "$REF"

# 4) Segredos não sensíveis das funções
echo ">> Configurando PAINEL_URL=$PAINEL"
supabase secrets set PAINEL_URL="$PAINEL" PAINEL_ORIGENS="$PAINEL"

# 5) Publicar
FUNCOES=("integracao-salvar-segredo" "integracao-testar" "bling-oauth-callback" "conhecimento" "assistente-ia" "usuario-convidar")
[ "$#" -gt 0 ] && FUNCOES=("$@")
for f in "${FUNCOES[@]}"; do
  echo ">> Publicando $f"
  if [ "$f" = "bling-oauth-callback" ]; then
    supabase functions deploy "$f" --project-ref "$REF" --no-verify-jwt
  else
    supabase functions deploy "$f" --project-ref "$REF"
  fi
done

echo ">> Pronto. Funções no projeto:"
supabase functions list --project-ref "$REF"
