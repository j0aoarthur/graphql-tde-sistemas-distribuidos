# Terraform — SDV AWS (Single-AZ)

Infraestrutura parametrizada para **us-east-1** com aplicação na AZ informada; ALB e subnets de DB são provisionados em duas AZs por exigência dos serviços gerenciados. **Não há instâncias standby Multi-AZ nem distribuição dos workloads em duas AZs.**

## Recursos

- VPC, Internet Gateway, duas subnets públicas e duas subnets privadas para os requisitos de ALB e RDS;
- Security groups segmentando gateway, ECS, RDS e ElastiCache; ALB somente origens CloudFront;
- RDS PostgreSQL 16 Single-AZ, criptografado, backups diários e senha administrada por AWS;
- ElastiCache Redis Single-AZ, único nó;
- ECS Fargate: Gateway, Ocorrências, Viaturas, Worker (2 réplicas), Simulador e OSRM;
- Cloud Map para DNS privado, ECR, CloudWatch, Secrets Manager;
- S3 privado com CloudFront padrão HTTPS, paths `/graphql` e `/subscriptions` até ALB;
- IAM OIDC GitHub Actions restrito à main e à identidade imutável deste repositório;
- AWS Budgets (limite inicial configurável).

## Procedimento

1. Configure CLI AWS com credenciais autorizadas; verifique `aws sts get-caller-identity`.
2. Opcional, ative state remoto com `../../scripts/bootstrap-tf-state.sh`, copie `backend.tf.example` → `backend.tf` e use `terraform init -backend-config` conforme instruções do script. Proteja o state, que pode conter dados sensíveis.
3. Copie `terraform.tfvars.example` → `terraform.tfvars`, ajuste `alert_email`, `monthly_budget_usd`, classe RDS e tipo de nó Redis. Não comite tfvars contendo dados reais.
4. `terraform init && terraform fmt && terraform validate && terraform plan -var='deploy_services=false'`.
5. Revise todos os custos antes de `terraform apply -var='deploy_services=false'`. **Mesmo false cria recursos com cobrança** (RDS, Redis, ALB, CloudFront etc.).
6. Configure em `sdv/runtime` os segredos runtime do README raiz; bootstrap bancos, migrações e seed numa task com acesso interno ao RDS. Nenhum segredo é escrito em Terraform code ou state explicitamente.
7. Publique previamente imagens SHA imutáveis e OSRM no ECR; depois `terraform apply -var='deploy_services=true' -var='image_tag=SHA_PUBLICADO'`.
8. Configure GitHub variables com outputs AWS e faça deploy via `deploy.yml`.

## Atenção

- CloudFront HTTPS ao navegador, mas CloudFront → ALB HTTP neste desenho sem domínio. **Não utilizar com dados reais**, obter TLS fim-a-fim via domínio próprio e certificado ACM antes de uso não acadêmico.
- Tarefas ECS em subnet pública com IP de saída mas **sem ingresso direto**; security group recebe tráfego apenas do ALB e de tarefas da mesma security group.
- Single-AZ não suporta falha total de zona; Redis de nó único pode perder mensagens. Backend precisa continuar idempotente e reconciliar estados persistidos.
- OIDC do GitHub assume subject imutável; se sua conta emitir outro subject, ajuste trust policy com comprovação da origem antes de aplicar.
- O pacote **não foi validado por `terraform validate` neste ambiente**. Execute esse comando e corrija quaisquer diferenças de versão/provedor antes de aplicar. **Nenhum `terraform apply` foi executado.**
