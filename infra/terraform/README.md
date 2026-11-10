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

## Custo e ciclo subir/destruir (demonstração)

- `monthly_budget_usd` padrão: **US$ 20**. O AWS Budget **só avisa por e-mail** (e apenas se `alert_email` estiver preenchido); ele não impede gastos.
- Estimativa aproximada (preços de lista, não verificados na AWS Pricing Calculator): infraestrutura base (ALB, RDS, Redis, IPv4) ~US$ 50/mês; com todos os serviços Fargate ~US$ 200–240/mês (~US$ 0,35/hora). **Rodar 24h/dia não cabe em US$ 20.** O uso previsto é subir só para a demonstração e destruir em seguida.
- `scripts/demo-up.sh` executa a fase 1 (`deploy_services=false`) e, com `--services <TAG>`, a fase 2. `scripts/demo-down.sh` oferece snapshot do RDS e destrói tudo. Ambos mostram o plano e pedem confirmação. Exigem Terraform >= 1.10 e credenciais AWS com permissão de escrita.
- Para o destroy funcionar com dados dentro, o código usa `force_delete` nos repositórios ECR, `force_destroy` no bucket S3 do frontend e `recovery_window_in_days = 0` no segredo `sdv/runtime`.
- **O RDS é apagado sem snapshot final** (`skip_final_snapshot = true`). O seed recria os dados da simulação; para guardar o estado, aceite o snapshot oferecido pelo `demo-down.sh`.
- Cada subida muda a URL do CloudFront, o nome do bucket e o endpoint do banco: atualize as variáveis do GitHub com os novos outputs. As imagens do ECR são destruídas junto e precisam ser publicadas de novo.
- Teste local sem custo: o emulador Floci (`floci/floci`) conseguiu criar os 51 recursos e destruí-los, mas não valida IAM, OIDC, rede nem CloudFront real, e seu ECR exige acesso ao Docker. Não substitui a primeira subida real.

## Atenção

- CloudFront HTTPS ao navegador, mas CloudFront → ALB HTTP neste desenho sem domínio. **Não utilizar com dados reais**, obter TLS fim-a-fim via domínio próprio e certificado ACM antes de uso não acadêmico.
- Tarefas ECS em subnet pública com IP de saída mas **sem ingresso direto**; security group recebe tráfego apenas do ALB e de tarefas da mesma security group.
- Single-AZ não suporta falha total de zona; Redis de nó único pode perder mensagens. Backend precisa continuar idempotente e reconciliar estados persistidos.
- OIDC do GitHub assume subject imutável; se sua conta emitir outro subject, ajuste trust policy com comprovação da origem antes de aplicar.
- Validação registrada (2026-11-10): `terraform fmt -check` e `terraform validate` passaram e `terraform plan -var='deploy_services=false'` completou na conta AWS real (51 recursos a criar), todos numa cópia com `required_version` relaxado para 1.5 (o Terraform local era 1.5.7, e o código exige >= 1.10). **Nenhum `terraform apply` foi executado na AWS real.** O `plan` não valida permissões de escrita, o `sub` do OIDC nem custo.
