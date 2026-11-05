resource "aws_iam_openid_connect_provider" "github" {
  url="https://token.actions.githubusercontent.com"
  client_id_list=["sts.amazonaws.com"]
}
resource "aws_iam_role" "github_deploy" {
  name="${var.project}-github-deploy"
  assume_role_policy=jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Federated=aws_iam_openid_connect_provider.github.arn},Action="sts:AssumeRoleWithWebIdentity",Condition={StringEquals={"token.actions.githubusercontent.com:aud"="sts.amazonaws.com","token.actions.githubusercontent.com:sub"="repo:j0aoarthur@121466923/graphql-tde-sistemas-distribuidos@1370611182:ref:refs/heads/main"}}}]})
}
resource "aws_iam_role_policy" "github_deploy" {
  name="${var.project}-github-deploy-policy"
role=aws_iam_role.github_deploy.id
  policy=jsonencode({Version="2012-10-17",Statement=[
    {Effect="Allow",Action=["ecr:GetAuthorizationToken"],Resource="*"},
    {Effect="Allow",Action=["ecr:BatchCheckLayerAvailability","ecr:CompleteLayerUpload","ecr:InitiateLayerUpload","ecr:PutImage","ecr:UploadLayerPart","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],Resource=[for r in aws_ecr_repository.services:r.arn]},
    {Effect="Allow",Action=["ecs:DescribeTaskDefinition","ecs:RegisterTaskDefinition","ecs:DescribeServices","ecs:UpdateService"],Resource="*"},
    {Effect="Allow",Action=["iam:PassRole"],Resource=[aws_iam_role.execution.arn,aws_iam_role.task.arn]},
    {Effect="Allow",Action=["s3:ListBucket"],Resource=[aws_s3_bucket.frontend.arn]},
    {Effect="Allow",Action=["s3:PutObject","s3:DeleteObject","s3:GetObject"],Resource=["${aws_s3_bucket.frontend.arn}/*"]},
    {Effect="Allow",Action=["cloudfront:CreateInvalidation"],Resource=[aws_cloudfront_distribution.frontend.arn]}
  ]})
}
resource "aws_budgets_budget" "monthly" {
  name="${var.project}-academic-monthly"
  budget_type="COST"
  limit_amount=tostring(var.monthly_budget_usd)
  limit_unit="USD"
  time_unit="MONTHLY"
  dynamic "notification" {
    for_each=var.alert_email==""?[]:[80,100]
    content {
      comparison_operator="GREATER_THAN"
      threshold=notification.value
      threshold_type="PERCENTAGE"
      notification_type="ACTUAL"
      subscriber_email_addresses=[var.alert_email]
    }
  }
}
