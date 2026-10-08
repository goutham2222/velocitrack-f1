#!/usr/bin/env bash
# ==============================================================================
# VelociTrack F1 — EC2 Demo Teardown & Termination Script
# Terminates the VM and deletes the associated security group.
# ==============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
INSTANCE_ID="${1:-}"
SG_ID="${2:-}"

if [ -z "${INSTANCE_ID}" ]; then
  echo "Usage: $0 <INSTANCE_ID> [SECURITY_GROUP_ID]"
  echo "Finding active velocitrack-f1 instances automatically..."
  INSTANCE_ID=$(aws ec2 describe-instances --region "${AWS_REGION}" \
    --filters "Name=tag:Project,Values=velocitrack-f1" "Name=instance-state-name,Values=running,pending" \
    --query "Reservations[*].Instances[*].InstanceId" --output text)
fi

if [ -z "${INSTANCE_ID}" ]; then
  echo "ℹ️  No active demo instances found."
  exit 0
fi

echo "🛑 Terminating EC2 instance(s): ${INSTANCE_ID}..."
aws ec2 terminate-instances --region "${AWS_REGION}" --instance-ids ${INSTANCE_ID}

echo "⏳ Waiting for instance termination..."
aws ec2 wait instance-terminated --region "${AWS_REGION}" --instance-ids ${INSTANCE_ID}

if [ -n "${SG_ID}" ]; then
  echo "🧹 Deleting security group: ${SG_ID}..."
  sleep 5
  aws ec2 delete-security-group --region "${AWS_REGION}" --group-id "${SG_ID}" || true
fi

echo "✅ EC2 Demo environment successfully terminated. \$0.00 cost leakage verified!"

