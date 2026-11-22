#!/usr/bin/env bash
# Recria o banco local, aplica harness + 0014 e roda os testes de IA, assistente e permissões por tela.
# Precisa de um Postgres 16 acessível (variáveis PGHOST/PGPORT/PGUSER do ambiente; padrão: socket local, usuário pgtest).
export PGHOST="${PGHOST:-/var/run/postgresql}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-pgtest}"
cd "$(dirname "$0")"
dropdb --if-exists ane_ia 2>/dev/null; createdb ane_ia
psql -d ane_ia -v ON_ERROR_STOP=1 -q -f 30_harness_ia.sql >/dev/null || { echo "ERRO no harness"; exit 1; }
psql -d ane_ia -At -q -f 31_testes_ia_permissoes.sql 2>&1 | grep -E "^(FAIL|total|psql:|ERROR)"
