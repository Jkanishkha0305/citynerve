import asyncio, os, json, random
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from agents.orchestrator import submit_report, confirm_report, report_store
from tools.report_store import Report
from tools.severity_engine import calculate_severity
from tools.spatial_tool import get_nearby_facilities, NearbyFacilities
from tools.nyc_311_tool import fetch_nyc_311_data
from tools.event_bus import agent_bus

load_dotenv()

app = FastAPI(title="Smart311 Triage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReportRequest(BaseModel):
    transcript: Optional[str] = None
    lat: float
    lon: float
    image_description: Optional[str] = None
    image_b64: Optional[str] = None

class ConfirmRequest(BaseModel):
    report_id: str
    correction: Optional[str] = None

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/report")
async def api_submit_report(req: ReportRequest):
    return await submit_report(req.transcript or "", req.lat, req.lon, req.image_description, req.image_b64)

@app.post("/api/confirm")
async def api_confirm_report(req: ConfirmRequest):
    return await confirm_report(req.report_id, req.correction)

@app.get("/api/queue")
async def get_queue():
    return report_store.get_all_dicts()

@app.post("/api/dispatch/{report_id}")
async def api_dispatch_report(report_id: str):
    from agents.dispatch_agent import dispatch_report
    report = report_store.get_by_id(report_id)
    if not report:
        return {"error": "Report not found"}
    nearby = await asyncio.to_thread(get_nearby_facilities, report.lat, report.lon, 500)
    nearby_dict = {
        "hospitals": nearby.hospitals[:2],
        "fire_stations": nearby.fire_stations[:1],
        "schools": nearby.schools[:2],
        "subway_entrances": nearby.subway_entrances[:2],
    }
    plan = await dispatch_report(report.to_dict(), nearby_dict)
    report_store.update(report_id, status="DISPATCHED")
    return {"plan": plan, "report_id": report_id, "status": "dispatched"}

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

@app.post("/api/load-311")
async def load_real_311():
    """
    Load real 311 complaints from NYC Open Data API.
    Pulls last 24 hours of Manhattan complaints and adds them to the queue.
    """
    borough = "MANHATTAN"
    limit = 100
    
    complaints = fetch_nyc_311_data(limit=limit, hours=24, borough_filter=borough)
    
    added_reports = []
    skipped_count = 0
    
    for complaint in complaints:
        hour = datetime.now().hour
        
        nearby = await asyncio.to_thread(get_nearby_facilities, complaint.latitude, complaint.longitude)
        
        existing = report_store.get_queue()
        cluster_count = sum(
            1 for r in existing 
            if abs(r.lat - complaint.latitude) < 0.005 
            and abs(r.lon - complaint.longitude) < 0.005
            and r.complaint_type == complaint.complaint_type
        ) + 1
        
        severity = calculate_severity(
            complaint.complaint_type,
            complaint.latitude,
            complaint.longitude,
            hour,
            nearby,
            cluster_count
        )
        
        report = Report(
            id=f"nyc-{complaint.unique_key[:8]}",
            complaint_type=complaint.complaint_type,
            description=complaint.descriptor or f"NYC 311: {complaint.complaint_type}",
            lat=complaint.latitude,
            lon=complaint.longitude,
            address=complaint.address,
            severity=severity.score,
            label=severity.label,
            department=severity.department,
            reasons=severity.reasons + [f"Source: NYC Open Data 311 API — {complaint.agency}"],
            submitted_at=datetime.now(),
            status="PENDING"
        )
        
        existing_ids = [r.id for r in report_store.get_queue()]
        if report.id not in existing_ids:
            report_store.add(report)
            added_reports.append(report)
        else:
            skipped_count += 1
    
    return {
        "loaded": len(added_reports),
        "skipped": skipped_count,
        "total_complaints_found": len(complaints),
        "source": "NYC Open Data 311 API",
        "filter": f"{borough}, last 24 hours"
    }

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

# ── A2A Agent Capability Cards ──────────────────────────────────────────────
# Each agent exposes a /.well-known/agent.json capability card per Google A2A spec

@app.get("/agents/intake/.well-known/agent.json")
async def intake_agent_card():
    return {
        "name": "smart311-intake-agent",
        "description": "Classifies NYC 311 complaints from voice transcripts using Gemini",
        "version": "1.0.0",
        "provider": {"organization": "Smart311 AI", "url": "https://smart311.ai"},
        "capabilities": {"streaming": False, "pushNotifications": False},
        "skills": [{
            "id": "classify_complaint",
            "name": "Classify Complaint",
            "description": "Extracts complaint_type, description, address from transcript",
            "inputModes": ["text"],
            "outputModes": ["application/json"],
            "tags": ["nlp", "classification", "gemini"]
        }]
    }

@app.get("/agents/spatial/.well-known/agent.json")
async def spatial_agent_card():
    return {
        "name": "smart311-spatial-agent",
        "description": "Scans NYC Open Data for nearby hospitals, schools, subway, fire stations",
        "version": "1.0.0",
        "provider": {"organization": "Smart311 AI", "url": "https://smart311.ai"},
        "capabilities": {"streaming": False, "pushNotifications": False},
        "skills": [{
            "id": "scan_vicinity",
            "name": "Scan Vicinity",
            "description": "Returns nearby infrastructure within 500m using 5 parallel NYC Open Data API calls",
            "inputModes": ["application/json"],
            "outputModes": ["application/json"],
            "tags": ["spatial", "nyc-open-data", "infrastructure"]
        }]
    }

@app.get("/agents/severity/.well-known/agent.json")
async def severity_agent_card():
    return {
        "name": "smart311-severity-engine",
        "description": "Computes contextual severity score and routes to NYC department",
        "version": "1.0.0",
        "provider": {"organization": "Smart311 AI", "url": "https://smart311.ai"},
        "capabilities": {"streaming": False, "pushNotifications": False},
        "skills": [{
            "id": "calculate_severity",
            "name": "Calculate Severity",
            "description": "Scores 0-100 using base type + proximity modifiers + cluster + rush hour",
            "inputModes": ["application/json"],
            "outputModes": ["application/json"],
            "tags": ["severity", "routing", "triage"]
        }]
    }

@app.get("/agents/orchestrator/.well-known/agent.json")
async def orchestrator_agent_card():
    return {
        "name": "smart311-orchestrator",
        "description": "ADK Orchestrator: fans out to intake + spatial agents, then severity engine",
        "version": "1.0.0",
        "provider": {"organization": "Smart311 AI", "url": "https://smart311.ai"},
        "capabilities": {"streaming": True, "pushNotifications": True},
        "skills": [{
            "id": "triage_report",
            "name": "Triage Report",
            "description": "End-to-end 311 report triage: intake → spatial (A2A) → severity → dispatch",
            "inputModes": ["text", "application/json"],
            "outputModes": ["application/json"],
            "tags": ["orchestration", "a2a", "adk", "triage"]
        }]
    }

# ── A2A Task Endpoints ────────────────────────────────────────────────────────

class IntakeTaskRequest(BaseModel):
    transcript: str
    image_description: Optional[str] = None
    lat: float = 0
    lon: float = 0

class SpatialTaskRequest(BaseModel):
    lat: float
    lon: float

class SeverityTaskRequest(BaseModel):
    complaint_type: str
    lat: float
    lon: float
    hospitals: list = []
    schools: list = []
    subway_entrances: list = []
    fire_stations: list = []
    prior_complaints_30d: int = 0
    cluster_count: int = 1

@app.post("/agents/intake/tasks")
async def intake_task(req: IntakeTaskRequest):
    from agents.intake_agent import process_intake
    result = await process_intake(req.transcript, req.image_description, req.lat, req.lon)
    return {"status": "completed", "result": result, "agent": "smart311-intake-agent"}

@app.post("/agents/spatial/tasks")
async def spatial_task(req: SpatialTaskRequest):
    nearby = await asyncio.to_thread(get_nearby_facilities, req.lat, req.lon)
    return {
        "status": "completed",
        "agent": "smart311-spatial-agent",
        "result": {
            "hospitals": nearby.hospitals[:3],
            "schools": nearby.schools[:3],
            "subway_entrances": nearby.subway_entrances[:3],
            "fire_stations": nearby.fire_stations[:2],
            "prior_complaints_30d": nearby.prior_complaints_30d,
        }
    }

@app.post("/agents/severity/tasks")
async def severity_task(req: SeverityTaskRequest):
    from tools.severity_engine import calculate_severity
    from tools.spatial_tool import NearbyFacilities
    nearby = NearbyFacilities(
        hospitals=req.hospitals, schools=req.schools,
        subway_entrances=req.subway_entrances, fire_stations=req.fire_stations,
        prior_complaints_30d=req.prior_complaints_30d
    )
    severity = calculate_severity(
        req.complaint_type, req.lat, req.lon,
        datetime.now().hour, nearby, req.cluster_count
    )
    return {
        "status": "completed",
        "agent": "smart311-severity-engine",
        "result": {
            "score": severity.score, "label": severity.label,
            "department": severity.department, "reasons": severity.reasons
        }
    }

@app.get("/agents")
async def list_agents():
    """List all registered A2A agents."""
    return {
        "agents": [
            {"name": "smart311-orchestrator", "card": "/agents/orchestrator/.well-known/agent.json", "tasks": "/agents/orchestrator/tasks"},
            {"name": "smart311-intake-agent", "card": "/agents/intake/.well-known/agent.json", "tasks": "/agents/intake/tasks"},
            {"name": "smart311-spatial-agent", "card": "/agents/spatial/.well-known/agent.json", "tasks": "/agents/spatial/tasks"},
            {"name": "smart311-severity-engine", "card": "/agents/severity/.well-known/agent.json", "tasks": "/agents/severity/tasks"},
        ]
    }

@app.websocket("/ws/agents")
async def ws_agents(websocket: WebSocket):
    await websocket.accept()
    loop = asyncio.get_event_loop()

    async def send_event(data):
        try:
            await websocket.send_text(json.dumps(data))
        except Exception:
            pass

    def sync_send(data):
        asyncio.run_coroutine_threadsafe(send_event(data), loop)

    agent_bus.subscribe(sync_send)
    try:
        while True:
            await asyncio.sleep(1)
    except Exception:
        pass
    finally:
        agent_bus.unsubscribe(sync_send)

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
    empty_nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[], fire_stations=[], prior_complaints_30d=0)

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
