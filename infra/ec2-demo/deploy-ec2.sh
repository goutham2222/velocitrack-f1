#!/usr/bin/env bash
# ==============================================================================
# VelociTrack F1 — Rapid EC2 Single-Instance Deployment Script
# Provisions a t3.medium VM running Docker Compose for quick 2-3 hour demos.
# ==============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
INSTANCE_TYPE="t3.medium"
APP_NAME="velocitrack-f1-ec2-demo"

echo "🏎️  Launching EC2 Demo Instance in ${AWS_REGION} (${INSTANCE_TYPE})..."

# Lookup latest Ubuntu 22.04 LTS AMI
AMI_ID=$(aws ec2 describe-images --region "${AWS_REGION}" \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
            "Name=state,Values=available" \
  --query "reverse(sort_by(Images, &CreationDate))[0].ImageId" \
  --output text)

echo "   Found AMI: ${AMI_ID}"

# Create temporary security group
VPC_ID=$(aws ec2 describe-vpcs --region "${AWS_REGION}" --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
SG_ID=$(aws ec2 create-security-group --region "${AWS_REGION}" \
  --group-name "${APP_NAME}-sg-$(date +%s)" \
  --description "Security group for VelociTrack F1 demo" \
  --vpc-id "${VPC_ID}" \
  --output text)

# Authorize ports 3000 (frontend) and 8000 (backend API)
aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" --group-id "${SG_ID}" --protocol tcp --port 3000 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" --group-id "${SG_ID}" --protocol tcp --port 8000 --cidr 0.0.0.0/0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Launch instance
INSTANCE_ID=$(aws ec2 run-instances --region "${AWS_REGION}" \
  --image-id "${AMI_ID}" \
  --instance-type "${INSTANCE_TYPE}" \
  --security-group-ids "${SG_ID}" \
  --user-data "file://${SCRIPT_DIR}/user-data.sh" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${APP_NAME}},{Key=Project,Value=velocitrack-f1},{Key=Ephemeral,Value=true}]" \
  --query "Instances[0].InstanceId" \
  --output text)

echo "   Instance launched: ${INSTANCE_ID}"
echo "   Waiting for public IPv4 address assignment..."

aws ec2 wait instance-running --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}"

PUBLIC_IP=$(aws ec2 describe-instances --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)

echo "=============================================================================="
echo "🎉 EC2 Instance is Running!"
echo "   Public IP:        ${PUBLIC_IP}"
echo "   Frontend Web UI:  http://${PUBLIC_IP}:3000"
echo "   Backend Health:   http://${PUBLIC_IP}:8000/health"
echo "   Swagger Docs:     http://${PUBLIC_IP}:8000/docs"
echo ""
echo "⏳ Note: User-data is currently installing Docker and building images."
echo "   This takes ~3-4 minutes on a t3.medium. Poll health with:"
echo "   curl -I http://${PUBLIC_IP}:8000/health"
echo ""
echo "🛑 When finished with your demo recording, run:"
echo "   bash infra/ec2-demo/teardown-ec2.sh ${INSTANCE_ID} ${SG_ID}"
echo "=============================================================================="

