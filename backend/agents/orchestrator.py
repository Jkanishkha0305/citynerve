import asyncio, uuid, logging
from datetime import datetime
from agents.intake_agent import process_intake
from tools.spatial_tool import get_nearby_facilities
from tools.severity_engine import calculate_severity, BASE_SCORES
from tools.report_store import Report, ReportStore
from tools.event_bus import agent_bus

logger = logging.getLogger(__name__)
report_store = ReportStore()

_ICONS = {"IntakeAgent": "🤖", "SpatialAgent": "📡", "SeverityEngine": "⚡", "Orchestrator": "🎯"}
_COLORS = {"IntakeAgent": "blue", "SpatialAgent": "purple", "SeverityEngine": "green", "Orchestrator": "orange"}

def _emit(agent: str, status: str, msg: str, report_id: str = ""):
    agent_bus.publish({
        "agent": agent,
        "status": status,
        "msg": msg,
        "report_id": report_id,
        "ts": datetime.now().isoformat(),
        "icon": _ICONS.get(agent, "•"),
        "color": _COLORS.get(agent, "gray"),
    })

async def submit_report(transcript: str, lat: float, lon: float,
                        image_description: str | None = None,
                        image_b64: str | None = None) -> dict:
    report_id = str(uuid.uuid4())[:8]
    _emit("Orchestrator", "running", "Fan-out: intake + spatial scan (parallel)", report_id)

    async def run_intake():
        if image_b64:
            _emit("IntakeAgent", "running", "Analyzing visual evidence (Vision Scan)...", report_id)
        else:
            _emit("IntakeAgent", "running", f'Reading: "{transcript[:60]}..."', report_id)
        result = await process_intake(transcript, image_description, lat, lon, image_b64)
        _emit("IntakeAgent", "tool_result", f"→ complaint type: {result['complaint_type']}", report_id)
        if result.get("address_hint"):
            _emit("IntakeAgent", "tool_result", f"→ address hint: {result['address_hint']}", report_id)
        _emit("IntakeAgent", "done", f"classified → {result['complaint_type']}", report_id)
        return result

    async def run_spatial():
        _emit("SpatialAgent", "running", f"Scanning 500m radius @ {lat:.4f}, {lon:.4f}", report_id)

        def emit_spatial(agent, status, msg):
            _emit(agent, status, msg, report_id)

        result = await asyncio.to_thread(get_nearby_facilities, lat, lon, 500, emit_spatial)
        h, s, sub = len(result.hospitals), len(result.schools), len(result.subway_entrances)
        _emit("SpatialAgent", "done",
              f"Found: {h} hospitals, {s} schools, {sub} subway stops, {result.prior_complaints_30d} prior complaints",
              report_id)
        return result

    try:
        intake, nearby = await asyncio.gather(run_intake(), run_spatial())
    except Exception as e:
        _emit("Orchestrator", "error", f"Pipeline error: {e}", report_id)
        logger.error(f"Orchestrator error: {e}")
        raise

    clusters = report_store.find_clusters(lat, lon)

    # Severity with detailed breakdown
    _emit("SeverityEngine", "running", "Computing contextual severity...", report_id)
    hour = datetime.now().hour
    t = intake["complaint_type"].lower().strip()
    base = BASE_SCORES.get(t, 30)
    _emit("SeverityEngine", "tool_call", f"base({intake['complaint_type']}) = {base}", report_id)

    if any(h["distance_m"] <= 500 for h in nearby.hospitals):
        closest = min(nearby.hospitals, key=lambda x: x["distance_m"])
        _emit("SeverityEngine", "tool_call",
              f"+ hospital {closest['distance_m']}m → +50", report_id)
    if any(s["distance_m"] <= 200 for s in nearby.schools) and 7 <= hour < 16:
        _emit("SeverityEngine", "tool_call", "+ school nearby (school hours) → +30", report_id)
    if any(s["distance_m"] <= 150 for s in nearby.subway_entrances):
        _emit("SeverityEngine", "tool_call", "+ subway entrance <150m → +20", report_id)
    if 7 <= hour <= 9 or 17 <= hour <= 19:
        _emit("SeverityEngine", "tool_call", "+ rush hour → +20", report_id)
    if nearby.prior_complaints_30d >= 10:
        _emit("SeverityEngine", "tool_call",
              f"+ {nearby.prior_complaints_30d} prior complaints (30d) → +20 ⚠", report_id)
    if len(clusters) >= 4:
        _emit("SeverityEngine", "tool_call",
              f"+ CLUSTER: {len(clusters)+1} reports in area → score forced ≥85 🚨", report_id)

    severity = calculate_severity(t, lat, lon, hour, nearby, len(clusters) + 1)
    _emit("SeverityEngine", "done",
          f"= {severity.score}/100 → {severity.label} → {severity.department}", report_id)

    report = Report(
        id=report_id,
        complaint_type=intake["complaint_type"],
        description=intake["description"],
        lat=lat, lon=lon,
        address=intake.get("address_hint") or f"{lat:.4f}, {lon:.4f}",
        severity=severity.score, label=severity.label,
        department=severity.department, reasons=severity.reasons,
        submitted_at=datetime.now()
    )
    report_store.add(report)
    _emit("Orchestrator", "done", f"✓ Dispatched → {severity.department}", report_id)

    draft = _draft_text(report, nearby, len(clusters)+1)
    return {**report.to_dict(), "draft_text": draft, "nearby": {
        "hospitals": nearby.hospitals[:2],
        "schools": nearby.schools[:2],
        "subway_entrances": nearby.subway_entrances[:2],
        "fire_stations": nearby.fire_stations[:1],
        "prior_complaints_30d": nearby.prior_complaints_30d,
    }}

async def confirm_report(report_id: str, correction: str | None = None) -> dict:
    report = report_store.get_by_id(report_id)
    if not report: return {"error": "Not found"}
    if correction:
        nearby = await asyncio.to_thread(get_nearby_facilities, report.lat, report.lon)
        clusters = report_store.find_clusters(report.lat, report.lon)
        severity = calculate_severity(correction, report.lat, report.lon,
                                      datetime.now().hour, nearby, len(clusters)+1)
        report_store.update(report_id, complaint_type=correction,
                            severity=severity.score, label=severity.label,
                            department=severity.department, reasons=severity.reasons)
    report_store.update(report_id, status="DISPATCHED")
    return report_store.get_by_id(report_id).to_dict()

def _draft_text(report: Report, nearby, cluster_count: int) -> str:
    parts = [f"I've drafted a {report.label} severity report for a {report.complaint_type} at {report.address}."]
    if nearby.hospitals: parts.append(f"I'm noting {nearby.hospitals[0]['name'].title()} is {nearby.hospitals[0]['distance_m']}m away.")
    if nearby.schools and 7 <= datetime.now().hour < 16: parts.append("A school is nearby during school hours.")
    if cluster_count > 1: parts.append(f"There are {cluster_count} related reports in this area.")
    parts.append(f"Severity is {report.severity}/100, routing to {report.department}. Ready to submit?")
    return " ".join(parts)
