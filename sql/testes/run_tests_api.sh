#!/usr/bin/env bash
# Recria o banco local, aplica harness + 0011 e roda os testes da camada api.* (e a concorrência de criar_unidades).
export PGHOST=/tmp PGPORT=5433 PGUSER=pgtest
cd "$(dirname "$0")"
dropdb --if-exists ane_api 2>/dev/null; createdb ane_api
psql -d ane_api -v ON_ERROR_STOP=1 -q -f 10_harness_api.sql >/dev/null || { echo "ERRO no harness"; exit 1; }
psql -d ane_api -v ON_ERROR_STOP=1 -q -f ../0011_api_cadastros.sql >/dev/null || { echo "ERRO na 0011"; exit 1; }
psql -d ane_api -At -q -f 11_testes_api.sql 2>&1 | grep -E "^(FAIL|TODOS|HÁ|psql:|ERROR)" || true
psql -d ane_api -At -c "select 'total: '||count(*)||'  passou: '||count(*) filter (where ok)||'  falhou: '||count(*) filter (where not ok) from t.resultado"

# concorrência: 2 sessões criando 25 unidades cada na mesma variação
VAR=$(psql -d ane_api -At -c "select id from catalogo.cad_variacao limit 1")
LOC=$(psql -d ane_api -At -c "select id from catalogo.cad_local limit 1")
printf "set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';\nselect count(*) from api.criar_unidades('aaaaaaaa-0000-0000-0000-000000000001', '%s', '%s', 25);\n" "$VAR" "$LOC" > /tmp/conc.sql
psql -d ane_api -At -q -f /tmp/conc.sql >/tmp/c1.txt 2>&1 &
psql -d ane_api -At -q -f /tmp/conc.sql >/tmp/c2.txt 2>&1 &
wait
echo "concorrência: sessão1=$(tr -d '\n' </tmp/c1.txt) sessão2=$(tr -d '\n' </tmp/c2.txt)"
psql -d ane_api -At -c "select 'unidades: '||count(*)||'  códigos distintos: '||count(distinct codigo) from catalogo.cad_unidade"
