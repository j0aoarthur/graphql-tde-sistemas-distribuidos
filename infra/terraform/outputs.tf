output "frontend_url" {

  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}
output "frontend_bucket" {

  value = aws_s3_bucket.frontend.id
}
output "cloudfront_distribution_id" {

  value = aws_cloudfront_distribution.frontend.id
}
output "alb_dns_name" {

  value = aws_lb.main.dns_name
}
output "postgres_endpoint" {

  value = aws_db_instance.main.address
}
output "rds_admin_secret_arn" {

  value = aws_db_instance.main.master_user_secret[0].secret_arn
}
output "redis_endpoint" {

  value = aws_elasticache_cluster.main.cache_nodes[0].address
}
output "runtime_secret_arn" {

  value = aws_secretsmanager_secret.runtime.arn
}
output "github_deploy_role_arn" {

  value = aws_iam_role.github_deploy.arn
}
output "ecr_urls" {

  value = {
    for k, v in aws_ecr_repository.services : k => v.repository_url
  }
}
output "ecs_cluster_name" {

  value = aws_ecs_cluster.main.name
}
