resource "aws_db_subnet_group" "main" { name="${var.project}-db"
 subnet_ids=[aws_subnet.db_a.id,aws_subnet.db_b.id] }
resource "aws_db_instance" "main" {
  identifier="${var.project}-postgres"
  engine="postgres"
 engine_version="16"
 instance_class=var.db_instance_class
  allocated_storage=20
 max_allocated_storage=50
 storage_type="gp3"
 storage_encrypted=true
  username="sdv"
 manage_master_user_password=true
  db_name="postgres"
 db_subnet_group_name=aws_db_subnet_group.main.name
  availability_zone=var.availability_zone
 multi_az=false
  vpc_security_group_ids=[aws_security_group.database.id]
  publicly_accessible=false
 deletion_protection=false
  backup_retention_period=3
 skip_final_snapshot=true
  auto_minor_version_upgrade=true
}
resource "aws_elasticache_subnet_group" "main" { name="${var.project}-redis"
 subnet_ids=[aws_subnet.db_a.id,aws_subnet.db_b.id] }
resource "aws_elasticache_cluster" "main" {
  cluster_id="${var.project}-redis"
  engine="redis"
 engine_version="7.1"
  node_type=var.redis_node_type
 num_cache_nodes=1
  parameter_group_name="default.redis7"
  port=6379
 subnet_group_name=aws_elasticache_subnet_group.main.name
  security_group_ids=[aws_security_group.redis.id]
  availability_zone=var.availability_zone
  snapshot_retention_limit=1
}
resource "aws_secretsmanager_secret" "runtime" {
  name="${var.project}/runtime"
  description="JSON com JWT_SECRET, INTERNAL_SERVICE_TOKEN, OCC_DATABASE_URL, VIATURAS_DATABASE_URL e REDIS_URL; preencher manualmente apos Terraform."
  recovery_window_in_days=7
}
resource "aws_service_discovery_private_dns_namespace" "internal" { name="sdv.internal"
 vpc=aws_vpc.main.id }
resource "aws_service_discovery_service" "backend" {
  for_each=toset(["ocorrencias","viaturas","osrm"])
  name=each.key
  dns_config { namespace_id=aws_service_discovery_private_dns_namespace.internal.id
 routing_policy="MULTIVALUE"
 dns_records { ttl=10
 type="A" } }
  health_check_custom_config { failure_threshold=1 }
}
