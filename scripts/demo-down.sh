#!/usr/bin/env bash
# Destrói TODA a infraestrutura AWS do SDV gerenciada pelo Terraform em infra/terraform, parando a cobrança.
# DESTRUTIVO: o banco RDS é apagado (skip_final_snapshot=true). O script oferece um snapshot manual antes.
#
# Uso: scripts/demo-down.sh
# Antes de rodar, salve as evidências da demonstração (prints, logs, relatórios).
set -euo pipefail

cd "$(dirname "$0")/../infra/terraform"

command -v aws >/dev/null || { echo "aws CLI não encontrado." >&2; exit 1; }
command -v terraform >/dev/null || { echo "terraform não encontrado." >&2; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "Conta AWS: $ACCOUNT_ID | Região: us-east-1"
echo

terraform init -input=false

if ! terraform state list 2>/dev/null | grep -q .; then
  echo "State vazio: não há recursos gerenciados por este Terraform para destruir."
  echo "(Se você aplicou de outro diretório ou backend, rode este script no mesmo local do state.)"
  exit 0
fi

DB_ID="$(terraform output -raw postgres_endpoint 2>/dev/null | cut -d. -f1 || true)"
if [[ -n "$DB_ID" ]]; then
  read -r -p "Tirar snapshot manual do RDS '$DB_ID' antes de destruir? (custa centavos/mês) [s/N]: " SNAP
  if [[ "$SNAP" =~ ^[sS]$ ]]; then
    SNAP_ID="${DB_ID}-demo-$(date +%Y%m%d-%H%M%S)"
    aws rds create-db-snapshot --db-instance-identifier "$DB_ID" --db-snapshot-identifier "$SNAP_ID" >/dev/null
    echo "Aguardando snapshot $SNAP_ID ficar disponível..."
    aws rds wait db-snapshot-available --db-snapshot-identifier "$SNAP_ID"
    echo "Snapshot criado: $SNAP_ID (apague depois se não precisar: aws rds delete-db-snapshot --db-snapshot-identifier $SNAP_ID)"
  fi
fi

echo
terraform plan -destroy -out=demo-down.tfplan

echo
read -r -p "Digite o ID da conta ($ACCOUNT_ID) para confirmar a DESTRUIÇÃO: " ANSWER
if [[ "$ANSWER" != "$ACCOUNT_ID" ]]; then
  rm -f demo-down.tfplan
  echo "Cancelado. Nada foi destruído."
  exit 1
fi

terraform apply demo-down.tfplan
rm -f demo-down.tfplan

echo
echo "Infraestrutura destruída. Confira no console (Billing) se não restou nada cobrando: ALB, RDS, ElastiCache, CloudFront, IPs."
echo "O CloudFront pode levar vários minutos para finalizar a remoção."
