#!/usr/bin/env bash
# Recria o banco local, aplica harness + 0014 + 0021 e roda os testes da base de conhecimento (Fase A1).
# Precisa de Postgres 16 com pgvector (postgresql-16-pgvector) e unaccent (contrib).
export PGHOST="${PGHOST:-/var/run/postgresql}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-pgtest}"
cd "$(dirname "$0")"
dropdb --if-exists ane_conhecimento 2>/dev/null; createdb ane_conhecimento
psql -d ane_conhecimento -v ON_ERROR_STOP=1 -q -f 30_harness_ia.sql >/dev/null || { echo "ERRO no harness"; exit 1; }
psql -d ane_conhecimento -At -q -f 41_testes_conhecimento.sql 2>&1 | grep -E "^(FAIL|total|psql:|ERROR)"
