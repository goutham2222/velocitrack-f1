output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "application_url" {
  description = "Accessible URL to open VelociTrack F1 in a web browser"
  value       = "http://${aws_lb.main.dns_name}"
}

output "api_health_url" {
  description = "Direct health check probe endpoint for smoke testing"
  value       = "http://${aws_lb.main.dns_name}/health"
}

output "ecr_backend_url" {
  description = "Amazon ECR repository URL for the FastAPI backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  description = "Amazon ECR repository URL for the Next.js frontend"
  value       = aws_ecr_repository.frontend.repository_url
}

output "ecs_cluster_name" {
  description = "Name of the ECS Fargate cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "Name of the active ECS Fargate service"
  value       = aws_ecs_service.main.name
}

output "aws_region" {
  description = "AWS region hosting the infrastructure"
  value       = var.aws_region
}

