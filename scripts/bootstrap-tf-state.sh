#!/usr/bin/env bash
# Bootstrap opcional para backend remoto Terraform. Requer aws CLI com credenciais de administrador autorizadas.
set -euo pipefail
REGION=us-east-1
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="sdv-terraform-state-${ACCOUNT_ID}"
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null || true
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
echo "Backend criado: $BUCKET"
echo "Configure terraform init -backend-config=bucket=$BUCKET -backend-config=key=sdv/terraform.tfstate -backend-config=region=$REGION -backend-config=use_lockfile=true"
