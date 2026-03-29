# Architecture — citynerve

> 🎯 5th Place — GDG Build With AI NYC Hackathon 2026
> Live: https://smart311-frontend-446616000971.us-east1.run.app

## System Overview

```
  Citizen                  Backend                    AI Layer
    │                         │                          │
    ├─ Submit report ─────────▶│                          │
    │  (text + image)         │                          │
    │                         ├─ Image → Gemini Vision ──▶│
    │                         │                          ├─ Severity Score
    │                         │◀──── Triage Result ──────┤
    │                         │                          │  • Priority 1-5
    │                         │                          │  • Category
    │                         │                          │  • Cluster Warning
    │                         │                          │
    │                         ├─ Spatial Analysis ───────▶│
    │                         │                          ├─ Heatmap
    │                         │◀──── Priority Queue ─────┤  Nearby incidents
    │                         │                          │
    ▼                         ▼                          ▼
  Dashboard              GCP Cloud Run              Gemini Pro/Vision
  Priority Queue         Cloud Spanner              Vertex AI
  Tactical Map           Cloud Run Jobs
```

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | TypeScript, React, Mapbox GL |
| Backend | Python, FastAPI |
| AI | Google Gemini Vision + Pro |
| Infrastructure | GCP Cloud Run, Docker |
| Database | Cloud Spanner / Firestore |
