#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE DATABASE ocorrencias_db;
CREATE DATABASE viaturas_db;
SQL
