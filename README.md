# Smart311 AI Triage

**An AI-powered civic issue reporting and routing system for NYC — built with Google Cloud, Gemini, and real NYC Open Data.**

Built for the **Build With AI NYC Hackathon** — a command center that lets 311 operators see real complaints, AI-calculated severity scores, intelligent department routing, and AI-generated dispatch plans on a live map.

---

## Live Demo

| Component | URL |
|-----------|-----|
| **Command Center Dashboard** | https://smart311-frontend-446616000971.us-east1.run.app/dashboard |
| **Backend API** | https://smart311-backend-446616000971.us-east1.run.app |
| **Citizen Reporting App** | https://smart311-frontend-446616000971.us-east1.run.app |

---

## What It Does

```
Citizen reports issue (voice/text/image)
         │
         ▼
┌─────────────────────────────────────────────┐
│            INTAKE AGENT                       │
│  Gemini 2.0 Flash classifies complaint type   │
│  Extracts: type, description, address        │
└────────────────────┬────────────────────────┘
                     │ + spatial scan (parallel)
         ┌──────────┴──────────────────┐
         ▼                              ▼
┌─────────────────────┐    ┌────────────────────────┐
│   SPATIAL AGENT     │    │   SEVERITY ENGINE      │
│  NYC Open Data API  │    │  Contextual scoring   │
│  ─────────────────  │    │  ──────────────────   │
│  • Hospitals (500m)│    │  Base score by type   │
│  • Schools (200m)  │    │  + Proximity modifiers│
│  • Subway (150m)   │    │  + Rush hour factor   │
│  • Fire stations   │    │  + Cluster detection  │
│  • 311 history     │    │                       │
└─────────┬───────────┘    └───────────┬──────────┘
          │                            │
          └─────────────┬──────────────┘
                        ▼
            ┌───────────────────────┐
            │   ROUTING DECISION    │
            │  ──────────────────   │
            │  CRITICAL → FDNY/EMS │
            │  HIGH     → ConEd/DOT │
            │  MEDIUM   → DEP/DOHMH │
            │  LOW      → 311 Queue │
            └───────────────────────┘
                        │
                        ▼
            ┌─────────────────────────┐
            │   DISPATCH AGENT       │
            │  ──────────────────    │
            │  AI-powered dispatch   │
            │  plans with steps,    │
            │  ETAs, and resources  │
            └────────────┬──────────┘
                        ▼
            ┌─────────────────────────┐
            │   LIVE COMMAND CENTER   │
            │  Map + Queue + AI Feed │
            └─────────────────────────┘
```

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, Tailwind CSS, Framer Motion, Leaflet Maps |
| **Backend** | FastAPI (Python 3.12), asyncio |
| **AI** | Google Gemini 2.0 Flash (Live API + classification) |
| **Orchestration** | Google ADK (Agent Development Kit), A2A Protocol |
| **Infrastructure** | Google Cloud Run, Docker |
| **Data** | NYC Open Data API, MTA Open Data |

### Agent System

The system uses a multi-agent architecture following Google's A2A (Agent-to-Agent) protocol:

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| **IntakeAgent** | Classifies citizen reports | Voice/text transcript | `complaint_type`, `description`, `address_hint` |
| **SpatialAgent** | Scans nearby infrastructure | `lat`, `lon` | Hospitals, schools, subway, fire stations, 311 history |
| **SeverityEngine** | Calculates contextual severity | All above + time | Score 0-100, label, department |
| **DispatchAgent** | Generates AI dispatch plans | Report + severity | Steps, ETAs, resources, notifications |
| **Orchestrator** | Coordinates the pipeline | Raw report | Final routed `Report` object |

### A2A Capability Cards

Each agent exposes a standard `.well-known/agent.json` capability card:

```bash
GET /agents/intake/.well-known/agent.json
GET /agents/spatial/.well-known/agent.json
GET /agents/severity/.well-known/agent.json
GET /agents/orchestrator/.well-known/agent.json
```

---

## Severity Scoring Algorithm

```
Base Score (by complaint type):
  fire, gas leak    → 80    (immediate danger)
  water main        → 70    (infrastructure)
  flooding          → 65    (property damage)
  heat              → 45    (health risk)
  pothole           → 25    (infrastructure)
  noise, street light → 20  (quality of life)
  rodent            → 15    (sanitation)
  other             → 30    (default)

Modifiers:
  +50 → Hospital within 500m
  +30 → School nearby during school hours (7am-4pm)
  +20 → Subway entrance within 150m
  +15 → Fire station within 300m
  +20 → Rush hour (7-9am, 5-7pm)
  +20 → 10+ prior complaints in 30 days
  +15 → Cluster of 3+ reports
  ≥85 → Cluster of 5+ reports (forced critical)
```

---

## Dispatch Plans

The DispatchAgent generates AI-powered resolution plans with:

- **Priority Level**: IMMEDIATE / HIGH / ROUTINE
- **Action Steps**: Each with agent, ETA, and specific action
- **Notifications**: Relevant NYC agencies alerted
- **Resources**: Equipment and personnel deployed

### Fallback Plans (when Gemini unavailable)

Pre-defined dispatch templates for each complaint type with realistic ETAs and agency assignments.

---

## Data Sources

| Dataset | API Endpoint | Used For |
|---------|--------------|----------|
| **NYC 311 Complaints** | `data.cityofnewyork.us/resource/erm2-nwe9.json` | Real complaint types, addresses, locations |
| **NYC DCP Facilities** | `data.cityofnewyork.us/resource/ji82-xba5.json` | Hospitals, schools, fire stations |
| **MTA Subway Entrances** | `data.ny.gov/resource/i9wp-a4ja.json` | Subway proximity scoring |

---

## Project Structure

```
smart311-triage/
├── backend/
│   ├── main.py                    # FastAPI app + all endpoints
│   ├── agents/
│   │   ├── orchestrator.py       # Main pipeline (parallel async)
│   │   ├── intake_agent.py       # Gemini classification
│   │   ├── dispatch_agent.py     # AI dispatch planning
│   │   └── adk_agent.py         # Google ADK agent skeleton
│   └── tools/
│       ├── severity_engine.py     # Scoring algorithm
│       ├── spatial_tool.py        # NYC facilities API
│       ├── nyc_311_tool.py       # Real 311 data fetcher
│       ├── report_store.py        # In-memory queue
│       └── event_bus.py          # Real-time agent events
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Citizen voice/video reporter
│   │   └── dashboard/
│   │       └── page.tsx          # Command center (3-column)
│   ├── components/
│   │   ├── LiveMap.tsx           # Leaflet NYC map
│   │   ├── QueueRow.tsx          # Report queue item
│   │   └── DraftCard.tsx         # Report confirmation
│   └── hooks/
│       ├── useQueue.ts            # Queue polling/WebSocket
│       ├── useGeminiLive.ts       # Gemini Live audio/video
│       └── useAgentEvents.ts      # Agent activity feed
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Google Cloud account (for deployment)
- Gemini API key

### Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
export GEMINI_API_KEY=your_key_here
export GOOGLE_API_KEY=your_google_api_key  # Alternative
python main.py
# Server runs on http://localhost:8080
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:3000
```

### Environment Variables

**Backend (`backend/.env`):**
```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_API_KEY=your_google_api_key
PORT=8080
```

**Frontend (`frontend/.env.local`):**
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

### Load Real NYC 311 Data

```bash
curl -X POST https://smart311-backend-446616000971.us-east1.run.app/api/load-311
```

This fetches the latest 100 Manhattan complaints from NYC Open Data and adds them to the queue with AI-calculated severity scores.

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/queue` | Get all reports in queue |
| `POST` | `/api/report` | Submit a new report |
| `POST` | `/api/confirm` | Confirm/correct a report |
| `POST` | `/api/dispatch/{report_id}` | Generate dispatch plan |
| `POST` | `/api/load-311` | Load real NYC 311 complaints |
| `POST` | `/api/simulate` | Simulate cluster scenario |
| `GET` | `/api/config` | Get frontend config |

### A2A Task Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/agents/intake/tasks` | Run IntakeAgent |
| `POST` | `/agents/spatial/tasks` | Run SpatialAgent |
| `POST` | `/agents/severity/tasks` | Run SeverityEngine |
| `GET` | `/agents` | List all agents |

### WebSocket Endpoints

| Endpoint | Description |
|----------|-------------|
| `/ws/queue` | Real-time queue updates |
| `/ws/agents` | Real-time agent activity |

---

## Deployment

### Deploy Backend to Cloud Run

```bash
cd backend
gcloud run deploy smart311-backend \
  --source . \
  --region us-east1 \
  --allow-unauthenticated
```

### Deploy Frontend to Cloud Run

```bash
cd frontend
gcloud run deploy smart311-frontend \
  --source . \
  --region us-east1 \
  --port 3000 \
  --allow-unauthenticated
```

---

## The Hackathon Demo

### Citizen App (`/`)
- Voice recording with Gemini Live API
- Camera capture with vision analysis
- Real-time transcription and classification
- Draft report confirmation
- Web Speech API fallback for STT

### Command Center (`/dashboard`)
- **3-column command center layout:**
  - Left (280px): Report Queue — compact rows, scrollable
  - Center (flex): Live NYC Map with markers
  - Right (280px): AI Agent Activity Feed
- **"Load NYC 311" button** — pulls real complaints from NYC Open Data
- **Real-time updates** via REST polling (Cloud Run compatible)
- **Click any report** to see full details + severity breakdown
- **Dispatch button** — generates AI-powered resolution plans

---

## Key Features

- **Real Data**: Pulls actual NYC 311 complaints from Open Data API
- **AI Classification**: Gemini 2.0 Flash for NLP classification
- **Spatial Awareness**: 5 parallel API calls to find nearby critical infrastructure
- **Contextual Severity**: Score adjusts based on proximity, time, and patterns
- **Cluster Detection**: 3+ same-type reports in area → automatic escalation
- **Department Routing**: Routes to correct NYC agency based on severity + type
- **AI Dispatch Planning**: Gemini generates actionable dispatch plans with ETAs
- **Rule-Based Fallbacks**: Pre-defined dispatch templates when AI unavailable
- **Live Dashboard**: Real-time command center with map visualization
- **A2A Protocol**: Standard agent capability cards for interoperability

---

## Challenges Solved

1. **NYC Open Data API timeouts**: Complex WHERE clauses caused timeouts → fetch 200 records, filter in Python
2. **WebSocket incompatibility**: Cloud Run uses HTTP/2 → implemented REST polling fallback
3. **API key in frontend**: NEXT_PUBLIC_ vars embedded at build time → runtime detection for production
4. **Real-time updates**: WebSocket bridge to sync in-memory store → polling with 3-second intervals
5. **API rate limits**: Fallback to keyword matching when Gemini unavailable

---

## Future Enhancements

- [ ] Wire Google ADK agent into production pipeline
- [ ] Add historical trend analysis on dashboard
- [ ] Implement actual 311 dispatch system integration
- [ ] Add multi-borough support (all 5 NYC boroughs)
- [ ] Natural disaster/emergency mode
- [ ] Rate limiting and caching
- [ ] Persistent storage (Cloud SQL/Cloud Firestore)

---

## License

MIT — Built for the Build With AI NYC Hackathon 2026.

---

**Built with Google Cloud, Gemini, and real NYC data.**
