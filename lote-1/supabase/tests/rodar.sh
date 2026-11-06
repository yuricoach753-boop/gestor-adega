#!/usr/bin/env bash
# Uso: PGHOST=... PGPORT=... ./tests/rodar.sh   (Postgres 15+ local, usuário superuser)
set -e
cd "$(dirname "$0")/.."
P="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists teste_gestao" -c "create database teste_gestao"
$P -d teste_gestao -f tests/stub_supabase.sql
for f in migrations/*.sql; do $P -d teste_gestao -f "$f"; done
for t in tests/teste_*.sql; do echo "== $t"; $P -d teste_gestao -f "$t"; done
