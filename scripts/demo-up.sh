#!/usr/bin/env bash
# Sobe a infraestrutura AWS do SDV para uma demonstração (simulação acadêmica).
# CRIA RECURSOS COM COBRANÇA (RDS, Redis, ALB, CloudFront...). Destrua depois com scripts/demo-down.sh.
#
# Uso:
#   scripts/demo-up.sh                    fase 1: infraestrutura base (deploy_services=false)
#   scripts/demo-up.sh --services <TAG>   fase 2: serviços ECS com a imagem ECR <TAG> (SHA já publicado)
#
# Este script só cobre as fases Terraform. Imagens, segredo runtime, migrations/seed e frontend
# continuam sendo passos manuais (veja infra/terraform/README.md).
set -euo pipefail

cd "$(dirname "$0")/../infra/terraform"

SERVICES=false
IMAGE_TAG=""
if [[ "${1:-}" == "--services" ]]; then
  SERVICES=true
  IMAGE_TAG="${2:-}"
  if [[ -z "$IMAGE_TAG" || "$IMAGE_TAG" == "bootstrap" || "$IMAGE_TAG" == SET_TO_* ]]; then
    echo "Erro: informe a tag de uma imagem já publicada no ECR (SHA). Ex.: scripts/demo-up.sh --services abc1234" >&2
    exit 1
  fi
elif [[ $# -gt 0 ]]; then
  echo "Argumento desconhecido: $1" >&2
  exit 1
fi

command -v aws >/dev/null || { echo "aws CLI não encontrado." >&2; exit 1; }
command -v terraform >/dev/null || { echo "terraform não encontrado." >&2; exit 1; }

TF_VERSION="$(terraform version -json | sed -n 's/.*"terraform_version": *"\([0-9.]*\)".*/\1/p' | head -1)"
if [[ "$(printf '%s\n1.10.0\n' "$TF_VERSION" | sort -V | head -1)" != "1.10.0" ]]; then
  echo "Erro: Terraform $TF_VERSION < 1.10.0 (exigido em versions.tf). Atualize: brew upgrade terraform" >&2
  exit 1
fi

IDENTITY="$(aws sts get-caller-identity --query '[Account,Arn]' --output text)"
echo "Conta/usuário AWS: $IDENTITY"
echo "Região: us-east-1 | deploy_services=$SERVICES ${IMAGE_TAG:+| image_tag=$IMAGE_TAG}"
echo "Custo aproximado em execução: ~US\$ 0,35/hora com serviços; menos na fase 1. Lembre de rodar scripts/demo-down.sh."
echo

terraform init -input=false
terraform validate

ARGS=(-var="deploy_services=$SERVICES")
[[ -n "$IMAGE_TAG" ]] && ARGS+=(-var="image_tag=$IMAGE_TAG")

terraform plan "${ARGS[@]}" -out=demo-up.tfplan

echo
read -r -p "Digite 'sim' para aplicar este plano na conta acima (gera cobrança): " ANSWER
if [[ "$ANSWER" != "sim" ]]; then
  rm -f demo-up.tfplan
  echo "Cancelado. Nada foi criado."
  exit 1
fi

terraform apply demo-up.tfplan
rm -f demo-up.tfplan

echo
terraform output
echo
if [[ "$SERVICES" == "false" ]]; then
  echo "Fase 1 concluída. Próximos passos manuais:"
  echo "  1. Publicar imagens (tag SHA) no ECR; 2. preencher o segredo sdv/runtime;"
  echo "  3. rodar bootstrap de bancos, migrations e seed; 4. scripts/demo-up.sh --services <SHA>;"
  echo "  5. publicar o frontend no bucket S3 e invalidar o CloudFront; 6. atualizar as variáveis do GitHub com os outputs."
else
  echo "Serviços criados. Publique o frontend no S3, invalide o CloudFront e valide a aplicação."
fi
