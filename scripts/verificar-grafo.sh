#!/bin/sh
# verificar-grafo.sh — confere se o grafo (graphify-out) acompanha o último commit.
# Padrão para TODOS os projetos que usam graphify. Funciona em qualquer repositório git:
# se o repositório não tem graphify-out/, sai em silêncio (nada a verificar).
#
# Uso:   sh scripts/verificar-grafo.sh          -> avisa e sai com código 1 se o grafo está atrasado
#        GRAFO_BLOQUEAR=1 (no pre-push)         -> o push é bloqueado quando o grafo está atrasado
# Regra: grafo "em dia" = graph.json foi regravado depois do último commit que alterou arquivos
#        fora de graphify-out/ (o rebuild do gancho roda logo após o commit).

RAIZ=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$RAIZ" || exit 0
[ -d graphify-out ] || exit 0

_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }

GRAFO="graphify-out/graph.json"
LOG="${HOME}/.cache/graphify-rebuild.log"

# Último commit que mexeu em algo além do próprio grafo
ULT=$(git log -1 --format=%H -- . ':(exclude)graphify-out' 2>/dev/null)
[ -n "$ULT" ] || exit 0
T_COMMIT=$(git log -1 --format=%ct "$ULT")
CURTO=$(git log -1 --format='%h %s' "$ULT")

if [ ! -f "$GRAFO" ]; then
  MOTIVO="graph.json não existe"
  T_GRAFO=0
else
  T_GRAFO=$(_mtime "$GRAFO"); T_GRAFO=${T_GRAFO:-0}
  MOTIVO=""
fi

if [ -z "$MOTIVO" ] && [ "$T_GRAFO" -ge "$T_COMMIT" ]; then
  echo "[grafo] OK — graphify-out atualizado depois do commit $CURTO"
  exit 0
fi

[ -z "$MOTIVO" ] && MOTIVO="o grafo é mais antigo que o último commit"
PEND=$(git log --format='  - %h %s' --since="@$T_GRAFO" -- . ':(exclude)graphify-out' 2>/dev/null | head -15)
[ "$T_GRAFO" -eq 0 ] && PEND="  - (grafo inexistente)"

{
  echo ""
  echo "=================================================================="
  echo " ATENÇÃO: GRAFO DESATUALIZADO ($MOTIVO)"
  echo " Último commit: $CURTO"
  echo " Commits fora do grafo:"
  echo "$PEND"
  echo ""
  echo " Para atualizar, rode no terminal do Mac (onde o graphify está instalado):"
  echo "   cd \"$RAIZ\" && sh .git/hooks/post-commit"
  [ -f "$LOG" ] && echo " Log do último rebuild: $LOG"
  echo "=================================================================="
  echo ""
} >&2
exit 1
