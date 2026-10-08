#!/usr/bin/env bash
# ==============================================================================
# VelociTrack F1 — EC2 User-Data Bootstrapper (Ubuntu 22.04 / 24.04 LTS)
# Installs Docker, Docker Compose, clones the repo, and boots containers.
# ==============================================================================

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# Update system packages
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git

# Install Docker Engine & Docker Compose Plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl start docker
systemctl enable docker

# Clone repository on deploy/aws-demo branch
cd /opt
git clone -b deploy/aws-demo https://github.com/goutham2222/velocitrack-f1.git || \
git clone https://github.com/goutham2222/velocitrack-f1.git

cd /opt/velocitrack-f1

# Launch containers via Docker Compose
docker compose up --build -d

# Verify health status
sleep 15
curl -s http://localhost:8000/health || true

