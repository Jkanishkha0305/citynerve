import asyncio, uuid, logging
from datetime import datetime
from agents.intake_agent import process_intake
from tools.spatial_tool import get_nearby_facilities
from tools.severity_engine import calculate_severity
from tools.report_store import Report, ReportStore

logger = logging.getLogger(__name__)
report_store = ReportStore()

async def submit_report(transcript: str, lat: float, lon: float,
                        image_description: str | None = None) -> dict:
    # 1. Parallel: intake + spatial
    try:
        intake, nearby = await asyncio.gather(
            process_intake(transcript, image_description, lat, lon),
            asyncio.to_thread(get_nearby_facilities, lat, lon)
        )
    except Exception as e:
        logger.error(f"Orchestrator error: {e}")
        raise
    # 2. Cluster check
    clusters = report_store.find_clusters(lat, lon)
    # 3. Severity
    severity = calculate_severity(
        intake["complaint_type"], lat, lon,
        datetime.now().hour, nearby, len(clusters) + 1
    )
    # 4. Store
    report = Report(
        id=str(uuid.uuid4())[:8],
        complaint_type=intake["complaint_type"],
        description=intake["description"],
        lat=lat, lon=lon,
        address=intake.get("address_hint") or f"{lat:.4f}, {lon:.4f}",
        severity=severity.score, label=severity.label,
        department=severity.department, reasons=severity.reasons,
        submitted_at=datetime.now()
    )
    report_store.add(report)
    # 5. Generate spoken draft
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
