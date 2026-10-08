variable "aws_region" {
  description = "Target AWS deployment region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment lifecycle environment name"
  type        = string
  default     = "demo"
}

variable "app_name" {
  description = "Application resource prefix"
  type        = string
  default     = "velocitrack-f1"
}

variable "vpc_cidr" {
  description = "CIDR block for the dedicated demo VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnets" {
  description = "Public subnet CIDRs distributed across distinct Availability Zones"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "fargate_cpu" {
  description = "Total CPU units reserved for the Fargate task (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "fargate_memory" {
  description = "Total memory (MiB) reserved for the Fargate task (2048 = 2 GiB)"
  type        = number
  default     = 2048
}

variable "backend_image_tag" {
  description = "Docker image tag for the FastAPI backend"
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  description = "Docker image tag for the Next.js frontend"
  type        = string
  default     = "latest"
}

