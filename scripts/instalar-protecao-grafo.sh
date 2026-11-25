#!/bin/sh
# instalar-protecao-grafo.sh — instala o aviso de grafo desatualizado no repositório atual.
# Rode uma vez por projeto (ou use o modelo global — ver comentário no fim).
RAIZ=$(git rev-parse --show-toplevel) || { echo "Rode dentro de um repositório git"; exit 1; }
cd "$RAIZ"
mkdir -p scripts .git/hooks
ORIGEM="$(cd "$(dirname "$0")" && pwd)/verificar-grafo.sh"
[ "$ORIGEM" = "$RAIZ/scripts/verificar-grafo.sh" ] || cp "$ORIGEM" scripts/verificar-grafo.sh
cat > .git/hooks/pre-push <<'HOOK'
#!/bin/sh
# Aviso de grafo desatualizado (padrão Zaya). GRAFO_BLOQUEAR=1 bloqueia o push.
[ -f scripts/verificar-grafo.sh ] || exit 0
if ! sh scripts/verificar-grafo.sh; then
  [ "${GRAFO_BLOQUEAR:-0}" = "1" ] && { echo "Push bloqueado: atualize o grafo." >&2; exit 1; }
fi
exit 0
HOOK
chmod +x .git/hooks/pre-push scripts/verificar-grafo.sh
echo "Proteção instalada em $RAIZ (pre-push + scripts/verificar-grafo.sh)"
# Para todos os projetos novos (modelo global, rodar uma vez no Mac):
#   mkdir -p ~/.git-templates/hooks && cp .git/hooks/pre-push ~/.git-templates/hooks/ \
#     && git config --global init.templateDir ~/.git-templates
# (repositórios já existentes: rodar este instalador em cada um)
