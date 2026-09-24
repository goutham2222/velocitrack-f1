# VelociTrack F1 — 3D/2D Formula 1 Race Replay Engine

![VelociTrack F1](https://img.shields.io/badge/VelociTrack-F1%20Replay-red?style=for-the-badge&logo=formula1)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)
![Next.js 15](https://img.shields.io/badge/Frontend-Next.js%2015-black?style=for-the-badge&logo=nextdotjs)
![Three.js](https://img.shields.io/badge/Viewport-Three.js%20%2F%20R3F-000000?style=for-the-badge&logo=three.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**VelociTrack F1** is a production-grade, interactive, full-stack 3D/2D Formula 1 Race Replay Engine powered by FastF1 telemetry. Designed with a dark titanium slate broadcast aesthetic (`#0b0e14`), neon team accents, glassmorphic HUD overlays, and smooth 60 FPS Catmull-Rom spline interpolation.

---

## Key Features

- **High-Precision Multi-Car Telemetry Pipeline:**
  - FastF1 session integration with persistent disk caching.
  - Aligns telemetry from all 20 drivers onto a uniform 10 Hz time grid.
  - Columnar data serialization reduces network payload size by over 80%.
  - Zero-wait cold start with bundled Monaco Grand Prix high-fidelity demo dataset.
- **3D & 2D Tactical Viewports:**
  - **Three.js 3D Viewport (@react-three/fiber & @react-three/drei):** 3D extruded circuit mesh, kerb edging, DRS activation zones, sector splits, 3D driver pods with team liveries, floating acronym tags, and turn markers.
  - **Dynamic Chase Cam / Driver Lock:** Camera tracks behind the focused car with smooth cinematic damping.
  - **Free Orbit Camera:** Full 360-degree rotation, pitch, and zoom.
  - **2D Canvas Tactical Radar:** High-performance fallback radar view with real-time driver blips, gap labels, and pan/zoom controls.
- **Broadcast Telemetry HUD:**
  - **Dynamic Leaderboard:** Real-time running order, interval to leader, gap to car ahead, DRS threat indicator ($<1.0\text{s}$), tire compound badges (Soft, Medium, Hard, Inter, Wet), and lap tire age.
  - **Cockpit Telemetry Panel:** Bold speedometer (km/h & mph), large gear display (`1`–`8`, `N`), 15-segment LED tachometer rev limiter shift lights, throttle & brake traces, and DRS status.
  - **Weather & Race Control Widget:** Live track temp, air temp, humidity, wind velocity, and flag status (Green, Sector Yellow, Safety Car, VSC, Red Flag).
- **Interactive Timeline Controller:**
  - Global scrubber bar with lap milestones.
  - Speed multipliers: `0.5x`, `1x`, `2x`, `4x`, `8x`, `16x`.
  - Step jump controls (`-10s` / `+10s`), play/pause, and keyboard hotkeys.

---

## Architecture

```
velocitrack-f1/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── sessions.py       # Calendar, Grand Prix, and session endpoints
│   │   │   └── telemetry.py      # Downsampled replay REST & SSE stream endpoints
│   │   ├── models/
│   │   │   └── schemas.py        # Pydantic schemas for replay payload & geometry
│   │   ├── services/
│   │   │   ├── fastf1_client.py  # FastF1 disk cache & schedule manager
│   │   │   ├── interpolator.py   # Downsampler & uniform time grid aligner
│   │   │   └── demo_data.py      # High-fidelity bundled Monaco GP dataset
│   │   ├── config.py             # Environment settings
│   │   └── main.py               # FastAPI entrypoint with CORS & health checks
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Main replay dashboard
│   │   │   └── globals.css       # Titanium slate theme & glassmorphic styling
│   │   ├── components/
│   │   │   ├── viewport/
│   │   │   │   ├── Track3D.tsx           # Extruded circuit mesh with kerbs
│   │   │   │   ├── DriverMarker3D.tsx    # 3D team-colored nodes & billboards
│   │   │   │   ├── CameraRig.tsx         # OrbitControls & dynamic Chase Cam
│   │   │   │   ├── Track2D.tsx           # 2D Canvas tactical radar
│   │   │   │   └── ViewportContainer.tsx # Canvas wrapper & WebGL fallback
│   │   │   ├── hud/
│   │   │   │   ├── Leaderboard.tsx       # Running order tower & tyre badges
│   │   │   │   ├── DriverFocusPanel.tsx  # Cockpit HUD, speedometer, rev LEDs
│   │   │   │   └── WeatherWidget.tsx     # Weather & race control flags
│   │   │   └── controls/
│   │   │       ├── PlaybackControls.tsx  # Interactive scrubber & speed selector
│   │   │       ├── SessionPicker.tsx     # Cascading Season/GP/Session selector
│   │   │       └── ViewModeSelector.tsx  # 3D/2D, camera & unit toggles
│   │   ├── hooks/
│   │   │   └── usePlayback.ts    # 60 FPS rAF loop with Catmull-Rom interpolation
│   │   ├── services/
│   │   │   └── api.ts            # Type-safe client API
│   │   └── types/
│   │       └── telemetry.ts      # TypeScript interfaces matching backend models
│   ├── package.json
│   ├── tailwind.config.ts
│   └── Dockerfile
├── docker-compose.yml            # Single-command orchestration
├── .env.example
├── .gitignore
└── README.md
```

---

## Quickstart (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+ (Node 20+ recommended)
- Git

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/velocitrack-f1.git
cd velocitrack-f1
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Start Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend API is now live at `http://localhost:8000`. Swagger documentation is available at `http://localhost:8000/docs`.

### 4. Start Frontend
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Running with Docker Compose

To start both the FastAPI backend and Next.js frontend in isolated containers:
```bash
docker compose up --build
```
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- FastF1 Cache Volume: `fastf1_cache` mounted at `/app/.fastf1_cache`

---

## Cloud Deployment Guide

### Backend Deployment

#### Option A: Render (Web Service)
1. Fork or push this repository to GitHub.
2. Log into [Render](https://render.com) and create a **New Web Service**.
3. Connect your repository.
4. Configure service:
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add Environment Variables:
   - `FASTF1_CACHE_DIR`: `/tmp/.fastf1_cache` (or mount a persistent disk)
   - `ALLOWED_ORIGINS`: `https://your-frontend-domain.vercel.app`
   - `PORT`: `8000`

#### Option B: Fly.io
```bash
cd backend
fly launch --name velocitrack-f1-api
fly volumes create fastf1_cache --size 5
fly deploy
```

#### Option C: AWS ECS / Fargate
1. Build and push the Docker image to AWS ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   docker build -t velocitrack-backend ./backend
   docker tag velocitrack-backend:latest <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/velocitrack-backend:latest
   docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/velocitrack-backend:latest
   ```
2. Create an ECS Task Definition with 1 vCPU, 2GB RAM, and mount an EFS volume for `.fastf1_cache`.

---

### Frontend Deployment

#### Option A: Vercel (Recommended)
1. Go to [Vercel](https://vercel.com) and import the GitHub repository.
2. Set **Root Directory** to `frontend`.
3. Framework Preset: **Next.js**.
4. Set Environment Variable:
   - `NEXT_PUBLIC_API_URL`: `https://your-backend-service.onrender.com`
5. Click **Deploy**.

#### Option B: Cloudflare Pages
1. Create a project in Cloudflare Pages linked to your repository.
2. Root directory: `frontend`.
3. Build command: `npm run build`.
4. Output directory: `.next`.
5. Add `NEXT_PUBLIC_API_URL`.

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause Replay |
| `Arrow Left` | Jump backward 5 seconds |
| `Arrow Right` | Jump forward 5 seconds |
| `Arrow Up` | Increase playback speed (up to 16x) |
| `Arrow Down` | Decrease playback speed (down to 0.5x) |

---

## License

This project is licensed under the MIT License. Formula 1 and F1 are trademarks of Formula One Licensing B.V. This open-source project is non-commercial and unaffiliated with Formula 1 or the FIA.

