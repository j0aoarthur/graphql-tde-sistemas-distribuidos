data "aws_availability_zones" "available" { state = "available" }
data "aws_ec2_managed_prefix_list" "cloudfront" { name = "com.amazonaws.global.cloudfront.origin-facing" }
locals { second_az = element([for az in data.aws_availability_zones.available.names:az if az != var.availability_zone],0) }
resource "aws_vpc" "main" {
  cidr_block = "10.48.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support = true
  tags = { Name = "${var.project}-vpc" }
}
resource "aws_internet_gateway" "main" { vpc_id = aws_vpc.main.id
 tags = { Name = "${var.project}-igw" } }
resource "aws_subnet" "public_a" { vpc_id = aws_vpc.main.id
 availability_zone = var.availability_zone
 cidr_block = "10.48.10.0/24"
 map_public_ip_on_launch = true
 tags = { Name = "${var.project}-public-a" } }
resource "aws_subnet" "public_b" { vpc_id = aws_vpc.main.id
 availability_zone = local.second_az
 cidr_block = "10.48.20.0/24"
 map_public_ip_on_launch = true
 tags = { Name = "${var.project}-alb-b" } }
resource "aws_subnet" "db_a" { vpc_id = aws_vpc.main.id
 availability_zone = var.availability_zone
 cidr_block = "10.48.30.0/24"
 tags = { Name = "${var.project}-db-a" } }
resource "aws_subnet" "db_b" { vpc_id = aws_vpc.main.id
 availability_zone = local.second_az
 cidr_block = "10.48.40.0/24"
 tags = { Name = "${var.project}-db-b" } }
resource "aws_route_table" "public" { vpc_id = aws_vpc.main.id
 route { cidr_block = "0.0.0.0/0"
 gateway_id = aws_internet_gateway.main.id } }
resource "aws_route_table_association" "a" { subnet_id=aws_subnet.public_a.id
 route_table_id=aws_route_table.public.id }
resource "aws_route_table_association" "b" { subnet_id=aws_subnet.public_b.id
 route_table_id=aws_route_table.public.id }
resource "aws_security_group" "alb" {
  name = "${var.project}-alb"
 vpc_id = aws_vpc.main.id
  ingress { description="CloudFront origins only"
 from_port=80
 to_port=80
 protocol="tcp"
 prefix_list_ids=[data.aws_ec2_managed_prefix_list.cloudfront.id] }
  egress { from_port=0
 to_port=0
 protocol="-1"
 cidr_blocks=["0.0.0.0/0"] }
}
resource "aws_security_group" "tasks" {
  name = "${var.project}-ecs-tasks"
 vpc_id = aws_vpc.main.id
  ingress { description="ALB gateway"
 from_port=4000
 to_port=4000
 protocol="tcp"
 security_groups=[aws_security_group.alb.id] }
  ingress { description="Internal services"
 from_port=4001
 to_port=5000
 protocol="tcp"
 self=true }
  egress { from_port=0
 to_port=0
 protocol="-1"
 cidr_blocks=["0.0.0.0/0"] }
}
resource "aws_security_group" "database" {
  name = "${var.project}-rds"
 vpc_id = aws_vpc.main.id
  ingress { from_port=5432
 to_port=5432
 protocol="tcp"
 security_groups=[aws_security_group.tasks.id] }
}
resource "aws_security_group" "redis" {
  name = "${var.project}-redis"
 vpc_id = aws_vpc.main.id
  ingress { from_port=6379
 to_port=6379
 protocol="tcp"
 security_groups=[aws_security_group.tasks.id] }
}
