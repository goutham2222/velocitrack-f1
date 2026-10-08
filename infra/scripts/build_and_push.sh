#!/usr/bin/env bash
# ==============================================================================
# VelociTrack F1 — Docker Multi-Stage Build & Amazon ECR Push Automation
# Builds linux/amd64 container images and pushes to Amazon ECR.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TERRAFORM_DIR="${REPO_ROOT}/infra/terraform"

echo "🏁 [1/5] Extracting Terraform deployment outputs & ECR endpoints..."
cd "${TERRAFORM_DIR}"
AWS_REGION="$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")"
ECR_BACKEND_URL="$(terraform output -raw ecr_backend_url)"
ECR_FRONTEND_URL="$(terraform output -raw ecr_frontend_url)"
ALB_DNS="$(terraform output -raw alb_dns_name 2>/dev/null || echo "")"

echo "   AWS Region:       ${AWS_REGION}"
echo "   Backend ECR:      ${ECR_BACKEND_URL}"
echo "   Frontend ECR:     ${ECR_FRONTEND_URL}"
echo "   Target ALB DNS:   ${ALB_DNS}"

echo "🔐 [2/5] Authenticating Docker CLI to Amazon ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ECR_BACKEND_URL%%/*}"

echo "🔨 [3/5] Building FastAPI Backend image (linux/amd64)..."
cd "${REPO_ROOT}/backend"
docker build \
  --platform linux/amd64 \
  -t "${ECR_BACKEND_URL}:latest" \
  -f Dockerfile .

echo "🔨 [4/5] Building Next.js 15 Frontend image (linux/amd64)..."
cd "${REPO_ROOT}/frontend"
# In unified ALB routing, NEXT_PUBLIC_API_URL can be empty (same-origin relative paths)
# or set to the public ALB URL: http://${ALB_DNS}
docker build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL="" \
  -t "${ECR_FRONTEND_URL}:latest" \
  -f Dockerfile .

echo "🚀 [5/5] Pushing container images to Amazon ECR..."
docker push "${ECR_BACKEND_URL}:latest"
docker push "${ECR_FRONTEND_URL}:latest"

echo "✅ Container images successfully built and pushed to Amazon ECR!"

