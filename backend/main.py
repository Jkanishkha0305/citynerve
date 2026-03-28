import asyncio, os, json
from fastapi import FastAPI, WebSocket, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import random
from agents.orchestrator import submit_report, confirm_report, report_store
from tools.report_store import Report
from tools.severity_engine import calculate_severity
from tools.spatial_tool import NearbyFacilities

app = FastAPI(title="Smart311 Triage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReportRequest(BaseModel):
    transcript: str
    lat: float
    lon: float
    image_description: Optional[str] = None

class ConfirmRequest(BaseModel):
    report_id: str
    correction: Optional[str] = None

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/report")
async def api_submit_report(req: ReportRequest):
    return await submit_report(req.transcript, req.lat, req.lon, req.image_description)

@app.post("/api/confirm")
async def api_confirm_report(req: ConfirmRequest):
    return await confirm_report(req.report_id, req.correction)

@app.get("/api/queue")
async def get_queue():
    return report_store.get_all_dicts()

@app.get("/api/config")
async def get_config():
    """Returns public config for the frontend — only expose non-secret config."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
    return {"gemini_api_key": key, "geminiApiKey": key}

@app.post("/api/simulate")
async def simulate_cluster():
    """Submit 5 rapid gas leak reports near Times Square to trigger cluster detection."""
    base_lat, base_lon = 40.7580, -73.9855
    results = []
    for i in range(5):
        lat = base_lat + random.uniform(-0.001, 0.001)
        lon = base_lon + random.uniform(-0.001, 0.001)
        result = await submit_report(
            transcript=f"Strong gas smell near Times Square, definitely a gas leak, rotten egg odor everywhere {i+1}",
            lat=lat, lon=lon
        )
        results.append(result)
    return {"simulated": len(results), "reports": results}

@app.websocket("/ws/queue")
async def ws_queue(websocket: WebSocket):
    await websocket.accept()
    
    # Bridge sync ReportStore notify to async WebSocket send
    loop = asyncio.get_event_loop()
    async def send_update(data):
        try:
            await websocket.send_text(json.dumps({"type": "queue_update", "queue": data}))
        except Exception:
            pass

    def sync_send_update(data):
        asyncio.run_coroutine_threadsafe(send_update(data), loop)

    report_store.subscribe(sync_send_update)
    try:
        # Initial send
        await send_update(report_store.get_all_dicts())
        while True:
            await asyncio.sleep(1)
    except Exception:
        pass
    finally:
        report_store.unsubscribe(sync_send_update)

@app.on_event("startup")
async def seed_data():
    # Seed 5 demo reports in Midtown NYC
    demo_reports = [
        ("Water main burst, water gushing into street", 40.7527, -73.9772, "water main", 70, "HIGH", "NYC DEP", "42nd St & 8th Ave, Hell's Kitchen"),
        ("Giant pothole, 3 cars damaged this morning", 40.7536, -73.9832, "pothole", 25, "LOW", "NYC DOT", "Bryant Park, 6th Ave & 41st St"),
        ("Strong gas smell, rotten eggs everywhere", 40.7580, -73.9855, "gas leak", 85, "CRITICAL", "Con Edison / FDNY", "7th Ave & 46th St, Times Square"),
        ("Loud music from rooftop, been going 3 hours", 40.7549, -73.9840, "noise", 20, "LOW", "NYPD", "W 44th St & Broadway, Midtown"),
        ("Rats in subway entrance, daytime sighting", 40.7510, -73.9750, "rodent", 15, "LOW", "NYC DOHMH", "34th St Penn Station entrance"),
    ]
    
    # For seed data, use minimal nearby (no spatial call to avoid startup delay)
    empty_nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[])

    for i, (desc, lat, lon, c_type, _score, _label, _dept, address) in enumerate(demo_reports):
        severity = calculate_severity(c_type, lat, lon, 14, empty_nearby, 1)
        report = Report(
            id=f"demo-{i}",
            complaint_type=c_type,
            description=desc,
            lat=lat, lon=lon,
            address=address,
            severity=severity.score, label=severity.label,
            department=severity.department,
            reasons=severity.reasons + ["Demo seed data — Midtown NYC"],
            submitted_at=datetime.now(),
            status="PENDING"
        )
        report_store.add(report)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
