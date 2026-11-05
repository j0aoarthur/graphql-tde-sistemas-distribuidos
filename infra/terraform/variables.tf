variable "aws_region" {

  type    = string
  default = "us-east-1"

}
variable "project" {

  type    = string
  default = "sdv"

}
variable "github_repository" {

  type    = string
  default = "j0aoarthur/graphql-tde-sistemas-distribuidos"

}
variable "availability_zone" {

  type    = string
  default = "us-east-1a"

}
variable "deploy_services" {

  type        = bool
  default     = false
  description = "Somente habilitar apos publicar imagens e popular segredos AWS. Cria recursos com custo continuo."

}
variable "image_tag" {

  type    = string
  default = "bootstrap"

}
variable "db_instance_class" {

  type    = string
  default = "db.t4g.micro"

}
variable "redis_node_type" {

  type    = string
  default = "cache.t4g.micro"

}
variable "monthly_budget_usd" {

  type    = number
  default = 60

}
variable "alert_email" {

  type        = string
  default     = ""
  description = "E-mail para alertas de orcamento, se informado."

}
variable "desired_counts" {


  type = map(number)
  default = {
    gateway = 2, ocorrencias = 1, viaturas = 1, worker = 2, simulador = 1, osrm = 1
  }

}
