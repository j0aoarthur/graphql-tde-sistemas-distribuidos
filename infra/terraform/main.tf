resource "aws_ecr_repository" "services" {
  for_each=toset(["gateway","ocorrencias","viaturas","worker","simulador","osrm"])
  name="${var.project}/${each.key}"
  image_tag_mutability="IMMUTABLE"
  image_scanning_configuration { scan_on_push=true }
  encryption_configuration { encryption_type="AES256" }
}
resource "aws_ecs_cluster" "main" { name="${var.project}-cluster"
 setting {name="containerInsights"
value="enabled"} }
resource "aws_cloudwatch_log_group" "services" {
  for_each=aws_ecr_repository.services
  name="/ecs/${var.project}/${each.key}"
  retention_in_days=7
}
resource "aws_iam_role" "execution" {
  name="${var.project}-ecs-execution"
  assume_role_policy=jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Service="ecs-tasks.amazonaws.com"},Action="sts:AssumeRole"}]})
}
resource "aws_iam_role_policy_attachment" "execution" { role=aws_iam_role.execution.name
 policy_arn="arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" }
resource "aws_iam_role_policy" "secrets" {
  name="${var.project}-read-runtime-secret"
role=aws_iam_role.execution.id
  policy=jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Action=["secretsmanager:GetSecretValue"],Resource=[aws_secretsmanager_secret.runtime.arn]}]})
}
resource "aws_iam_role" "task" {
  name="${var.project}-ecs-task"
  assume_role_policy=jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Service="ecs-tasks.amazonaws.com"},Action="sts:AssumeRole"}]})
}
locals {
  backends={gateway=4000,ocorrencias=4001,viaturas=4002,worker=0,simulador=0,osrm=5000}
  secrets=["JWT_SECRET","INTERNAL_SERVICE_TOKEN","OCC_DATABASE_URL","VIATURAS_DATABASE_URL","REDIS_URL"]
  common_env=[{name="NODE_ENV",value="production"},{name="OCCORRENCIAS_URL",value="http://ocorrencias.sdv.internal:4001/graphql"},{name="VIATURAS_URL",value="http://viaturas.sdv.internal:4002/graphql"},{name="VIATURAS_INTERNAL_URL",value="http://viaturas.sdv.internal:4002/internal/dispatch"},{name="OSRM_URL",value="http://osrm.sdv.internal:5000"},{name="FRONTEND_ORIGIN",value="*"}]
}
resource "aws_ecs_task_definition" "services" {
  for_each=var.deploy_services ? local.backends : {}
  family="${var.project}-${each.key}"
  requires_compatibilities=["FARGATE"]
  network_mode="awsvpc"
  cpu=each.key=="osrm"?"1024":"512"
  memory=each.key=="osrm"?"2048":"1024"
  execution_role_arn=aws_iam_role.execution.arn
  task_role_arn=aws_iam_role.task.arn
  container_definitions=jsonencode([{
    name=each.key
    image="${aws_ecr_repository.services[each.key].repository_url}:${var.image_tag}"
    essential=true
    portMappings=each.value>0?[{containerPort=each.value,hostPort=each.value,protocol="tcp"}]:[]
    environment=concat(local.common_env,[{name="PORT",value=tostring(each.value)}])
    secrets=each.key=="osrm"?[]:[for key in local.secrets:{name=key,valueFrom="${aws_secretsmanager_secret.runtime.arn}:${key}::"}]
    logConfiguration={logDriver="awslogs",options={"awslogs-group"=aws_cloudwatch_log_group.services[each.key].name,"awslogs-region"=var.aws_region,"awslogs-stream-prefix"="app"}}
  }])
}
resource "aws_lb" "main" {
  name="${var.project}-alb"
 load_balancer_type="application"
  security_groups=[aws_security_group.alb.id]
  subnets=[aws_subnet.public_a.id,aws_subnet.public_b.id]
  enable_deletion_protection=false
}
resource "aws_lb_target_group" "gateway" {
  name="${var.project}-gateway"
vpc_id=aws_vpc.main.id
  port=4000
protocol="HTTP"
target_type="ip"
  health_check { path="/health"
matcher="200"
healthy_threshold=2
unhealthy_threshold=3
interval=30 }
}
resource "aws_lb_listener" "http" {
  load_balancer_arn=aws_lb.main.arn
port=80
protocol="HTTP"
  default_action {type="forward"
target_group_arn=aws_lb_target_group.gateway.arn}
}
resource "aws_ecs_service" "services" {
  for_each=var.deploy_services ? local.backends : {}
  name="${var.project}-${each.key}"
  cluster=aws_ecs_cluster.main.id
  task_definition=aws_ecs_task_definition.services[each.key].arn
  desired_count=lookup(var.desired_counts,each.key,1)
  launch_type="FARGATE"
  deployment_circuit_breaker {enable=true
 rollback=true}
  deployment_minimum_healthy_percent=50
  deployment_maximum_percent=200
  health_check_grace_period_seconds=each.key=="gateway"?60:null
  network_configuration {subnets=[aws_subnet.public_a.id]
security_groups=[aws_security_group.tasks.id]
assign_public_ip=true}
  dynamic "load_balancer" {for_each=each.key=="gateway"?[1]:[]
 content {target_group_arn=aws_lb_target_group.gateway.arn
container_name=each.key
container_port=4000}}
  dynamic "service_registries" {for_each=contains(["ocorrencias","viaturas","osrm"],each.key)?[1]:[]
content {registry_arn=aws_service_discovery_service.backend[each.key].arn}}
  depends_on=[aws_lb_listener.http,aws_iam_role_policy_attachment.execution,aws_iam_role_policy.secrets]
  lifecycle { ignore_changes=[task_definition,desired_count] }
}
