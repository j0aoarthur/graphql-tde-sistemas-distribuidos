# SDV — Sistema Distribuído de Despacho de Viaturas

Monorepo acadêmico **GraphQL Federation + NestJS + PostgreSQL + Redis Streams + React + OSRM + Terraform/AWS**. Duas centrais ADMIN cadastradas via CLI operam um conjunto de viaturas fictícias em Feira de Santana, BA. Nenhuma interface de motorista existe.

> **Status**: entrega integrada de código-fonte, ainda **não homologada em runtime**. Foram realizados testes unitários offline e validações de sintaxe. A execução Docker/PostgreSQL/Redis/OSRM, integração GraphQL, build npm, `terraform validate` e deploy AWS requerem ambiente com dependências e credenciais; **não foram executados nesta entrega**. Nunca utilizar para emergências reais.

## Funcionalidades implementadas em código

- **Frontend React responsivo:** login; visão geral; mapa em Leaflet/OpenStreetMap; abertura de ocorrências com seleção de ponto; lista e detalhes; encerramento/cancelamento; painel da frota e cadastro; histórico dos despachos; laboratório de simulação com pausa, velocidade e falha de sinal; reconexão de subscription; feedback e estados vazios.
- **API:** Apollo Gateway + subgraphs federados NestJS (`ocorrencias`/`viaturas`), queries seletivas, JWT ADMIN e autorização nos resolvers, DTOs validados nos endpoints.
- **Consistência:** ocorrência+outbox em uma transação; Redis Streams com XREADGROUP, XACK pós-efeito, XAUTOCLAIM; idempotência por chave de requisição e unicidade de despacho; lock Redis SET NX PX com token, seguido de update condicional e índice único parcial PostgreSQL.
- **Reconciliação:** consumer reprocessa ocorrências RECEBIDA/AGUARDANDO, finais pendentes e eventos da outbox de Viaturas, cobrindo crash depois de commits; eventuais atualizações entre DBs são reconciliadas, sem transação distribuída.
- **Tempo real:** servidor GraphQL WebSocket `/subscriptions` com Pub/Sub Redis; eventos provocam refetch do snapshot GraphQL. Fallback por polling a cada 12 segundos.
- **Roteamento:** worker GPS calcula a rota OSRM sobre ruas reais de Feira, persiste geometria/distância/duração, avança posição com compare-and-swap e marca chegada. Nunca desenha uma rota reta como se fosse viária. OSRM indisponível deixa rota pendente, sem falsificar trânsito real.
- **Infra:** Docker, migrations SQL de versão, seeds idempotentes, Terraform AWS (`us-east-1`, workloads e banco Single-AZ, ALB 2 subnets exigidas, RDS, ElastiCache, ECS, ECR, CloudFront/S3, IAM/OIDC, Secrets Manager, CloudWatch, AWS Budgets), GitHub Actions CI e deploy da aplicação.

## Estrutura

```text
apps/
  gateway/                Apollo Gateway + assinatura GraphQL WS
  ocorrencias-service/    NestJS, Prisma, PostgreSQL, autenticação e Outbox
  viaturas-service/       NestJS, Prisma, Redis lock, ciclo do despacho
  dispatch-worker/        Redis Streams, reentregas, reconciliação, outbox
  gps-simulator/          OSRM, movimento simulado, CAS no banco
  painel-frontend/        React Vite, mapa, todas telas ADMIN
packages/shared/          geodistância e geometria de percurso
scripts/                  seed, bootstrap bancos e dados OSRM
tests/                    testes unitários e concorrência E2E
infra/terraform/          Single-AZ + ALB 2 AZ, ECS, RDS, Redis, CloudFront
infra/docker/             imagens de produção, nginx, OSRM
.github/workflows/         CI + deploy AWS via OIDC
```

## Desenvolvimento local (backend real)

**Requisitos:** Node.js 22+, npm, Docker Desktop + Compose, `psql` opcional para inspeção, RAM suficiente para OSRM pré-processado (recomendado 4 GiB). Preparar dados geográficos envolve baixar ~424 MB do Nordeste e precisa de conexão e espaço em disco.

1. Copie `.env.example` para `.env`. Substitua `JWT_SECRET` e `INTERNAL_SERVICE_TOKEN` por segredos independentes (32+ caracteres), e defina `DEMO_ADMIN_PASSWORD` com 12+ caracteres.
2. Execute `docker compose up -d --wait` para PostgreSQL e Redis.
3. Execute `npm install`, `node scripts/bootstrap-databases.mjs`, `npm run db:generate`, `npm run db:migrate`, `npm run seed`.
4. Execute `./scripts/prepare-osrm.sh` **uma vez** (Geofabrik Nordeste + extrato da região + OSRM MLD). Depois inicie OSRM: `docker run --rm -v "$PWD/data/osrm:/data:ro" -p 127.0.0.1:5000:5000 ghcr.io/project-osrm/osrm-backend:latest osrm-routed --algorithm mld /data/feira.osrm`.
5. Execute em terminais independentes (carregando variáveis de `.env`): `npm run dev:ocorrencias`, `npm run dev:viaturas`, `npm run dev:gateway`, `npm run dev:worker`, `npm run dev:simulator`, `npm run dev:frontend`.
6. Acesse http://localhost:5173, faça login com `central-a@sdv.local` ou `central-b@sdv.local`, usando a senha definida no seed.

**Modo prévia da interface sem backend:** `npm run dev:preview -w @sdv/frontend`, depois http://localhost:5173 → “Explorar prévia visual sem backend”. Nesse modo, posições e linhas de percurso são **ilustrativas**, claramente sinalizadas. A prévia não grava nada em bancos nem valida o algoritmo de despacho. Em produção `VITE_ENABLE_DEMO=false`.

**Docker Compose completo:** após gerar os dados OSRM e executar `npm run db:migrate && npm run seed` no host, você também pode iniciar os serviços com `docker compose -f compose.yaml -f compose.full.yaml up --build -d`. Abra http://localhost:8080. O YAML original continua servindo só infraestrutura de banco/Redis e não foi substituído.

**Nota:** em produção as migrations são obrigatórias. O antigo script `constraints.sql` é redundante após `prisma migrate deploy` porque o índice crítico já consta em migration SQL. Não execute `prisma db push` em produção.

## Testes

- `npm test` — valida ranking Haversine, coordenadas e interpolação de rota.
- `NODE_ENV=test npm run test:concurrency` — com as duas centrais, DBs e workers isolados já ativos, dispara mutations simultâneas e valida IDs distintos e ausência de duplicidade.
- `npm run build` — build TS/React; exige npm install e clients Prisma gerados.
- GitHub Actions `ci.yml` executa build e teste de concorrência com PostgreSQL+Redis reais, além de validar Terraform.
- Testes de falha RDS, ElastiCache, AZ e recursos pagos devem ser executados manualmente em ambiente de laboratório com orçamento aprovado.

## AWS us-east-1, sem domínio e sem Multi-AZ

A infraestrutura (`infra/terraform/`) define **tarefas e banco em uma única AZ**. ALB exige pelo menos duas sub-redes em AZs distintas; a segunda não executa workloads nem standby RDS. Sem domínio próprio, a UI usa `https://*.cloudfront.net`.

**Atenção à segurança da origem:** sem DNS/certificado ACM próprio, a conexão **CloudFront → ALB** está HTTP neste perfil acadêmico, embora o navegador acesse CloudFront via HTTPS e o ALB aceite tráfego apenas da lista de IPs de origem CloudFront. Não transportar dados reais ou credenciais pessoais de produção antes de configurar TLS fim-a-fim e controles adicionais. O custo de Fargate, RDS, ElastiCache, ALB, armazenamento e transferências é contínuo; créditos AWS não eliminam necessidade de monitorar a conta. O orçamento criado pelo Terraform emite alertas, **não desliga os serviços automaticamente**.

### Provisionamento seguro em duas etapas

1. Configure AWS CLI/SSO localmente (com autorização na conta). `aws sts get-caller-identity`; jamais adicione chaves à conversa ou ao repositório.
2. Opcional: `scripts/bootstrap-tf-state.sh`, copie `infra/terraform/backend.tf.example` para `infra/terraform/backend.tf`, execute `terraform init -backend-config=...` com o bucket exibido. Caso contrário, use state local protegido e nunca o versione.
3. Em `infra/terraform`, execute `terraform init`, `terraform fmt`, `terraform validate`, `terraform plan -var='deploy_services=false'`. Revise custos e recursos e só então `terraform apply -var='deploy_services=false'`. Esse primeiro apply **já cria recursos pagos** como RDS, ElastiCache, ALB e CloudFront.
4. Busque os outputs RDS/Redis e a senha RDS gerada (`rds_admin_secret_arn`). Monte o JSON no Secrets Manager `sdv/runtime`, com `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `OCC_DATABASE_URL`, `VIATURAS_DATABASE_URL`, `REDIS_URL`. Exemplo URLs: `postgresql://sdv:<SENHA>@<RDS_HOST>:5432/ocorrencias_db`, `postgresql://sdv:<SENHA>@<RDS_HOST>:5432/viaturas_db`, `redis://<REDIS_HOST>:6379`. Atenção a URL-encode na senha.
5. Faça bootstrap dos dois DBs via um runner dentro da VPC (`node scripts/bootstrap-databases.mjs`); execute as migrations e seed a partir de task ECS pontual ou runner autorizado com conectividade aos bancos. **Não exponha RDS/Redis** para fazer isso.
6. Prepare `data/osrm/feira.osrm*` no seu computador, `docker build -f infra/docker/Dockerfile.osrm -t <ECR_OSRM_URL>:bootstrap .`, `docker push`. Backend `osrm` é um serviço ECS independente.
7. Publique as imagens dos demais serviços no ECR com tag imutável SHA de commit. Use `terraform apply -var='deploy_services=true' -var='image_tag=<SHA_EXISTENTE>'` para criar as tarefas ECS (esse é o segundo apply e **aumenta custos**).
8. Configure variáveis do repositório GitHub: `AWS_ROLE_ARN` (output), `AWS_ACCOUNT_ID`, `FRONTEND_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`. `deploy.yml` usa OIDC e só aceita a branch `main`, publica imagens SHA, atualiza tasks ECS e faz sync/invalidation da UI S3/CloudFront.
9. Abra a URL `frontend_url` do Terraform. Valide login, gráfico/mapa, serviço OSRM, reentrega Redis, múltiplos workers e custo em Billing. Acesse logs via CloudWatch.

> GitHub OIDC: esta conta/repositório foi configurada para o formato de subject imutável do GitHub adotado em julho de 2026. Verifique o subject emitido pelo seu GitHub antes de habilitar o deploy. Se o provider já existir no IAM da conta, importe o resource no Terraform em vez de criá-lo novamente.

## Limites e próximos requisitos de homologação

- **Não foi realizado deploy nem provisionamento AWS.** Requer aprovação explícita sobre os recursos cobrados, segredos, conexão AWS e testes com a infraestrutura.
- **O executável não foi validado aqui**: indisponibilidade de npm registry/Docker/Terraform nesta sessão. CI deverá comprovar build, migrations e concorrência.
- **Não há RPO/RTO garantidos**: Single-AZ tem ponto único de falha de zona, e Redis de nó único pode perder mensagens. Outbox/varredura no DB atenua perda lógica, não substitui infraestrutura HA.
- **Tempo real** é um fluxo de eventos transitório; reconexões refazem o snapshot para convergência. O simulador é totalmente fictício, ainda que use ruas reais.
- **Refresh token, gestão de segredos rotações, testes de caos RDS, mapas com tiles licenciados para produção, limites GraphQL de profundidade/complexidade e performance sob carga** exigem endurecimento antes de uso não acadêmico.
- A aplicação não constitui sistema de segurança pública certificado. Não colocar em uso para emergências reais.
