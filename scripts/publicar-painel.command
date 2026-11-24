#!/usr/bin/env bash
# Publica o painel CRM (https://crm.evoconecta.io): confere o repositório, roda o build local,
# envia a main ao GitHub e aciona o deploy no Coolify (que só abre por túnel SSH).
# Uso: duplo clique neste arquivo, ou  ./scripts/publicar-painel.command
#      ./scripts/publicar-painel.command --checar   (só confere; não faz push nem deploy)
#
# Para o deploy automático, crie uma vez o token da API do Coolify (veja a seção "TOKEN" abaixo).
# Sem o token, o script faz o push, abre o túnel e a página da aplicação no Coolify para você clicar em Redeploy.
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ="$(pwd)"
mkdir -p .tmp
exec > >(tee .tmp/publicar-painel.log) 2>&1

APP_UUID="r2g7ximgvf5p6nrycaekvnkk"                       # aplicação do painel no Coolify
PROJ_URL="http://localhost:8000/project/x91yxyfho3lwrokskr90qsii/environment/xqa6skdyvaf4njofvv3z11uk/application/$APP_UUID"
VPS="deploy@187.41.120.188"
SITE="https://crm.evoconecta.io"
TOKEN_FILE="$HOME/.config/painel-ane/coolify.env"         # fora do repositório; contém COOLIFY_TOKEN=...
SOCK="/tmp/painel-ane-tunel.sock"
CHECAR=0; [ "${1:-}" = "--checar" ] && CHECAR=1

fim() { read -r -t 15 -p "Fechando em 15s (Enter fecha já)" || true; }
erro() { echo; echo "ERRO: $*"; fim; exit 1; }
echo "== $(date '+%Y-%m-%d %H:%M:%S')"

# 1) branch e estado do repositório
[ "$(git branch --show-current)" = "main" ] || erro "você não está na main. Troque para main antes de publicar."
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  erro "há alterações não commitadas em arquivos rastreados. Faça commit antes (o Coolify só enxerga o que está no GitHub)."
fi
NOVOS="$(git ls-files --others --exclude-standard painel | grep -v '\.bak$' || true)"
if [ -n "$NOVOS" ]; then
  echo "$NOVOS"
  erro "há arquivos novos não versionados em painel/ (o primeiro deploy já falhou por isso). Faça git add + commit."
fi

echo ">> fetch"; git fetch origin main -q
BEHIND="$(git rev-list --count HEAD..origin/main)"; AHEAD="$(git rev-list --count origin/main..HEAD)"
if [ "$BEHIND" -gt 0 ]; then
  echo ">> o GitHub tem $BEHIND commit(s) novo(s); rebase"; git pull --rebase origin main
  AHEAD="$(git rev-list --count origin/main..HEAD)"
fi
echo ">> main local: $(git rev-parse --short HEAD) | à frente do GitHub: $AHEAD commit(s)"
if [ "$CHECAR" = 1 ]; then echo "OK (--checar): repositório pronto para publicar."; fim; exit 0; fi

# 2) build local (mesmo comando do Coolify: confere ajuda, tipos e empacota)
echo ">> build local (painel)"
( cd painel && { [ -d node_modules ] || npm ci; } && npm run build ) || erro "o build local falhou; corrija antes de publicar."

# 3) push
if [ "$AHEAD" -gt 0 ]; then
  echo ">> git push origin main (pede a passphrase da chave SSH)"
  git push origin main
else
  echo ">> nada novo para enviar ao GitHub"
fi

# 4) túnel SSH para o Coolify (a porta 8000 nunca é pública)
ABRIU_TUNEL=0
tunel_ok() { curl -fsS --max-time 4 http://localhost:8000/api/health >/dev/null 2>&1; }
if ! tunel_ok; then
  echo ">> abrindo túnel SSH para o Coolify (pede a passphrase da chave)"
  ssh -f -N -M -S "$SOCK" -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 8000:localhost:8000 "$VPS" || erro "não consegui abrir o túnel SSH ($VPS)."
  ABRIU_TUNEL=1
  for i in 1 2 3 4 5; do tunel_ok && break; sleep 1; done
  tunel_ok || erro "o túnel abriu, mas o Coolify não respondeu em localhost:8000."
fi
fechar_tunel() { [ "$ABRIU_TUNEL" = 1 ] && ssh -S "$SOCK" -O exit "$VPS" >/dev/null 2>&1 || true; }
trap fechar_tunel EXIT

# 5) deploy
if [ ! -f "$TOKEN_FILE" ]; then
  echo
  echo "Sem token da API do Coolify ($TOKEN_FILE). Deploy manual:"
  echo "  1) abrindo a aplicação no Coolify; clique em Redeploy;"
  echo "  2) para automatizar: veja a seção TOKEN no cabeçalho de scripts/publicar-painel.command."
  open "$PROJ_URL" 2>/dev/null || true
  echo "O túnel fica aberto enquanto esta janela estiver aberta; feche-a quando o deploy terminar."
  read -r -p "Enter para fechar o túnel e sair" || true
  exit 0
fi
# shellcheck disable=SC1090
. "$TOKEN_FILE"
[ -n "${COOLIFY_TOKEN:-}" ] || erro "COOLIFY_TOKEN vazio em $TOKEN_FILE."

echo ">> acionando deploy no Coolify"
RESP="$(curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" "http://localhost:8000/api/v1/deploy?uuid=$APP_UUID&force=false")" || erro "o Coolify recusou o pedido de deploy (token inválido ou API desligada?)."
DEP="$(printf '%s' "$RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.deployments&&j.deployments[0]&&j.deployments[0].deployment_uuid)||"")}catch(e){console.log("")}})')"
[ -n "$DEP" ] || erro "resposta inesperada do Coolify: $RESP"
echo ">> deploy $DEP na fila; acompanhando (até 10 min)"

STATUS=""
for i in $(seq 1 120); do
  sleep 5
  R="$(curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" "http://localhost:8000/api/v1/deployments/$DEP" 2>/dev/null || true)"
  STATUS="$(printf '%s' "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).status||"")}catch(e){console.log("")}})')"
  printf '   [%ss] %s\n' "$((i*5))" "${STATUS:-?}"
  case "$STATUS" in finished|failed|cancelled-by-user) break;; esac
done

echo
if [ "$STATUS" = "finished" ]; then
  echo "DEPLOY_OK commit=$(git rev-parse --short HEAD)"
  curl -sI "$SITE" | grep -iE '^(HTTP|last-modified|date)' || true
  echo "Valide: abra $SITE, faça login e confira as telas."
  open "$SITE" 2>/dev/null || true
else
  echo "DEPLOY_FALHOU status=${STATUS:-desconhecido}. Veja os logs: $PROJ_URL/deployment/$DEP"
  open "$PROJ_URL/deployment/$DEP" 2>/dev/null || true
fi
fim
[ "$STATUS" = "finished" ]

# ---------------------------------------------------------------------------------------------
# TOKEN (uma vez só):
#  1. Abra o túnel (este script abre sozinho; ou: ssh -L 8000:localhost:8000 deploy@187.41.120.188).
#  2. No Coolify (http://localhost:8000): Settings > Advanced > marque "API Access" e salve.
#  3. Keys & Tokens > API tokens > crie um token com permissão de deploy (nome: painel-publicar).
#  4. No Terminal do Mac:
#       mkdir -p ~/.config/painel-ane && chmod 700 ~/.config/painel-ane
#       printf 'COOLIFY_TOKEN=COLE_O_TOKEN_AQUI\n' > ~/.config/painel-ane/coolify.env
#       chmod 600 ~/.config/painel-ane/coolify.env
#     O token fica só no seu Mac, fora do repositório. Não o envie em chat nem faça commit dele.
# ---------------------------------------------------------------------------------------------
