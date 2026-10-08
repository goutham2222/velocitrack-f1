#!/usr/bin/env bash
# ==============================================================================
# VelociTrack F1 — One-Click AWS ECS Fargate Deployment Script
# Provisions infrastructure, builds & pushes images, and verifies health.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TERRAFORM_DIR="${REPO_ROOT}/infra/terraform"

START_TIME=$(date +%s)

echo "=============================================================================="
echo "🏎️  VelociTrack F1 — AWS ECS Fargate Automated Cloud Deployment"
echo "=============================================================================="

# Pre-flight credential check
echo "🔍 [1/6] Verifying AWS Identity and CLI configuration..."
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "❌ Error: AWS CLI credentials not found or expired. Please run 'aws configure' or export AWS_PROFILE."
  exit 1
fi
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
CALLER_ARN=$(aws sts get-caller-identity --query "Arn" --output text)
echo "   Authenticated Account: ${ACCOUNT_ID}"
echo "   Caller Identity:       ${CALLER_ARN}"

# Step 2: Terraform Init & ECR Bootstrap
echo "📦 [2/6] Initializing Terraform and provisioning ECR Registries..."
cd "${TERRAFORM_DIR}"
terraform init -upgrade

# Target apply ECR repositories first to avoid chicken-and-egg container pull errors
terraform apply \
  -target=aws_ecr_repository.backend \
  -target=aws_ecr_repository.frontend \
  -auto-approve

# Step 3: Build & Push Images
echo "🐳 [3/6] Building and pushing Docker container images..."
bash "${SCRIPT_DIR}/build_and_push.sh"

# Step 4: Full Infrastructure Apply
echo "☁️  [4/6] Provisioning VPC, ALB, Target Groups, and ECS Fargate Service..."
cd "${TERRAFORM_DIR}"
terraform apply -auto-approve

# Step 5: Service Stabilization & Force Deployment
CLUSTER_NAME="$(terraform output -raw ecs_cluster_name)"
SERVICE_NAME="$(terraform output -raw ecs_service_name)"
ALB_DNS="$(terraform output -raw alb_dns_name)"
APP_URL="$(terraform output -raw application_url)"
HEALTH_URL="$(terraform output -raw api_health_url)"

echo "🔄 [5/6] Triggering ECS service deployment and awaiting task stabilization..."
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${SERVICE_NAME}" \
  --force-new-deployment >/dev/null

echo "   Awaiting ALB Target Group & Container health checks (this typically takes ~90-120s)..."
MAX_ATTEMPTS=30
ATTEMPT=1
IS_HEALTHY=false

while [ "${ATTEMPT}" -le "${MAX_ATTEMPTS}" ]; do
  STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" || echo "000")
  if [ "${STATUS_CODE}" -eq 200 ]; then
    IS_HEALTHY=true
    break
  fi
  echo "   Attempt ${ATTEMPT}/${MAX_ATTEMPTS}: Backend probe returned HTTP ${STATUS_CODE}. Retrying in 10s..."
  sleep 10
  ATTEMPT=$((ATTEMPT + 1))
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "=============================================================================="
if [ "${IS_HEALTHY}" = true ]; then
  echo "🎉 SUCCESS: VelociTrack F1 is live on AWS Fargate in ${ELAPSED} seconds!"
  echo ""
  echo "   🌐 Application URL: ${APP_URL}"
  echo "   🩺 API Health URL:  ${HEALTH_URL}"
  echo "   🏎️  Swagger Docs:    ${APP_URL}/docs"
  echo ""
  echo "💡 Next Steps for Recording / Demo:"
  echo "   1. Open ${APP_URL} in your browser (Chrome/Edge with WebGL enabled)."
  echo "   2. Click 'Demo Monaco GP' for instant zero-wait replay playback."
  echo "   3. Switch to Chase Cam, Orbit Cam, and 2D Tactical Radar."
  echo "   4. When done, execute 'bash infra/scripts/teardown.sh' to terminate all resources."
  echo "=============================================================================="
else
  echo "⚠️ Warning: Target groups still registering. Please inspect ECS task logs via:"
  echo "   aws logs tail /ecs/velocitrack-f1 --follow"
  echo "   Application URL: ${APP_URL}"
  echo "=============================================================================="
fi

