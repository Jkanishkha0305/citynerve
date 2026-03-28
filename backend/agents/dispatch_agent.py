import os, json, requests
from datetime import datetime
from tools.event_bus import agent_bus

VERTEX_ENDPOINT = os.environ.get("VERTEX_ENDPOINT", "https://aiplatform.googleapis.com/v1/publishers/google/models")
VERTEX_MODEL = os.environ.get("VERTEX_MODEL", "gemini-2.5-flash-lite")


def _emit(status: str, msg: str, report_id: str):
    agent_bus.publish({
        "agent": "DispatchAgent",
        "status": status,
        "msg": msg,
        "report_id": f"dispatch-{report_id}",
        "ts": datetime.now().isoformat(),
        "icon": "🚨",
        "color": "red",
    })


async def dispatch_report(report: dict, nearby: dict | None = None) -> dict:
    """Generate a structured AI resolution plan for a 311 report."""
    report_id = report.get("id", "unknown")
    complaint_type = report.get("complaint_type", "other")
    severity = report.get("severity", 0)
    label = report.get("label", "LOW")
    address = report.get("address", "unknown location")
    department = report.get("department", "NYC Dept")
    description = report.get("description", "")

    _emit("running", f"Initiating dispatch: {label} {complaint_type.upper()} @ {address}", report_id)

    nearby_lines = []
    if nearby:
        if nearby.get("hospitals"):
            h = nearby["hospitals"][0]
            nearby_lines.append(f"  - Hospital: {h.get('name','?')} at {h.get('distance_m','?')}m")
        if nearby.get("fire_stations"):
            fs = nearby["fire_stations"][0]
            nearby_lines.append(f"  - Fire Station: {fs.get('name','?')} at {fs.get('distance_m','?')}m")
        if nearby.get("schools"):
            s = nearby["schools"][0]
            nearby_lines.append(f"  - School: {s.get('name','?')} at {s.get('distance_m','?')}m")
        if nearby.get("subway_entrances"):
            sub = nearby["subway_entrances"][0]
            nearby_lines.append(f"  - Subway: {sub.get('name','?')} at {sub.get('distance_m','?')}m")
    nearby_str = "\n".join(nearby_lines) if nearby_lines else "  - No specific nearby facilities on record."

    prompt = f"""You are NYC's AI emergency dispatch coordinator. Generate a precise, actionable dispatch plan.

INCIDENT REPORT
  Type: {complaint_type.upper()}
  Severity: {severity}/100 ({label})
  Location: {address}
  Description: {description}
  Primary Agency: {department}

NEARBY INFRASTRUCTURE
{nearby_str}

Respond ONLY with this JSON (no markdown, no explanation):
{{
  "summary": "one-sentence action summary",
  "priority": "IMMEDIATE|HIGH|ROUTINE",
  "steps": [
    {{"step": 1, "action": "specific action", "agent": "NYC agency name", "eta": "e.g. 4-6 min"}},
    {{"step": 2, "action": "specific action", "agent": "NYC agency name", "eta": "e.g. 10-15 min"}},
    {{"step": 3, "action": "specific action", "agent": "NYC agency name", "eta": "e.g. 30 min"}}
  ],
  "notifications": ["agency1", "agency2"],
  "resources": ["resource1", "resource2", "resource3"]
}}

Use real NYC agencies: FDNY, NYPD, Con Edison, NYC DEP, NYC DOT, NYC EMS, NYC DOHMH, NYC OEM.
3-5 steps. Be specific to this incident type and location."""

    api_key = os.environ.get("VERTEX_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    plan = None

    if api_key:
        try:
            _emit("tool_call", f"🧠 Gemini analyzing incident + infrastructure context...", report_id)
            url = f"{VERTEX_ENDPOINT}/{VERTEX_MODEL}:generateContent?key={api_key}"
            resp = requests.post(url, json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            }, timeout=20)
            data = resp.json()
            if "error" not in data:
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if text:
                    plan = json.loads(text.strip())
                    step_count = len(plan.get("steps", []))
                    _emit("tool_result", f"✓ AI plan ready: {plan.get('priority','HIGH')} priority | {step_count} action steps", report_id)
        except Exception as e:
            _emit("error", f"Gemini error: {e} — using rule-based fallback", report_id)

    if not plan:
        plan = _fallback_plan(complaint_type, label, department)
        _emit("tool_result", f"✓ Rule-based plan: {plan.get('priority','HIGH')} | {len(plan.get('steps',[]))} steps", report_id)

    # Stream each step as an event
    for step in plan.get("steps", []):
        _emit("tool_call", f"→ Step {step['step']}: {step['action']} [{step['agent']} | ETA: {step['eta']}]", report_id)

    notifs = plan.get("notifications", [])
    if notifs:
        _emit("tool_result", f"📢 Alerting: {', '.join(notifs[:4])}", report_id)

    resources = plan.get("resources", [])
    if resources:
        _emit("tool_result", f"🚒 Deploying: {', '.join(resources[:3])}", report_id)

    _emit("done", f"✅ DISPATCH COMPLETE → {department}", report_id)
    return plan


def _fallback_plan(complaint_type: str, label: str, department: str) -> dict:
    templates = {
        "gas leak": {
            "summary": "Immediate gas leak response — isolate, evacuate, and repair",
            "priority": "IMMEDIATE",
            "steps": [
                {"step": 1, "action": "FDNY Engine Company dispatched for gas investigation and area sweep", "agent": "FDNY", "eta": "4-6 min"},
                {"step": 2, "action": "Con Edison Emergency crew mobilized for pipe isolation", "agent": "Con Edison", "eta": "10-15 min"},
                {"step": 3, "action": "NYPD perimeter — 100m exclusion zone, traffic reroute", "agent": "NYPD", "eta": "8-10 min"},
                {"step": 4, "action": "Voluntary evacuation of nearby buildings initiated", "agent": "FDNY + NYPD", "eta": "15-20 min"},
            ],
            "notifications": ["FDNY Dispatch", "Con Edison Emergency (1-800-75-CONED)", "NYPD", "NYC OEM"],
            "resources": ["FDNY Engine Company", "Hazmat Unit", "Con Edison Emergency Van", "NYPD Patrol Cars", "OEM Mobile Command"],
        },
        "water main": {
            "summary": "Water main break — isolate valve and restore service",
            "priority": "HIGH",
            "steps": [
                {"step": 1, "action": "NYC DEP Emergency Crew dispatched to isolate shutoff valve", "agent": "NYC DEP", "eta": "15-20 min"},
                {"step": 2, "action": "NYC DOT Traffic Management — close affected street segment", "agent": "NYC DOT", "eta": "10 min"},
                {"step": 3, "action": "Con Edison underground utility check for secondary damage", "agent": "Con Edison", "eta": "20-30 min"},
                {"step": 4, "action": "Repair crew mobilized — estimated service restoration", "agent": "NYC DEP", "eta": "2-6 hours"},
            ],
            "notifications": ["NYC DEP Emergency Operations", "NYC DOT", "Con Edison"],
            "resources": ["DEP Emergency Repair Crew", "Valve Key Truck", "Traffic Cones + Barriers", "Bypass Pumping Equipment"],
        },
        "fire": {
            "summary": "Structure fire — immediate FDNY multi-unit response",
            "priority": "IMMEDIATE",
            "steps": [
                {"step": 1, "action": "FDNY Engine + Ladder companies dispatched", "agent": "FDNY", "eta": "2-4 min"},
                {"step": 2, "action": "NYPD crowd control and traffic clearance for apparatus", "agent": "NYPD", "eta": "3-5 min"},
                {"step": 3, "action": "NYC EMS staging for potential casualties", "agent": "NYC EMS", "eta": "4-6 min"},
                {"step": 4, "action": "Con Edison emergency crew on standby for utility shutoff", "agent": "Con Edison", "eta": "10-15 min"},
            ],
            "notifications": ["FDNY Dispatch", "NYPD", "NYC EMS", "Con Edison Emergency", "Red Cross (if displacement likely)"],
            "resources": ["FDNY Engine Company", "FDNY Ladder Company", "EMS Advanced Life Support Unit", "NYPD Patrol Cars"],
        },
        "flooding": {
            "summary": "Flooding reported — drainage response and traffic safety",
            "priority": "HIGH",
            "steps": [
                {"step": 1, "action": "NYC DEP Sewer crew dispatched to clear drain blockage", "agent": "NYC DEP", "eta": "20-30 min"},
                {"step": 2, "action": "NYC DOT road closure if unsafe flooding depth", "agent": "NYC DOT", "eta": "15 min"},
                {"step": 3, "action": "NYPD traffic redirect — alternate routes established", "agent": "NYPD", "eta": "10 min"},
            ],
            "notifications": ["NYC DEP Sewer Operations", "NYC DOT", "NYPD Traffic"],
            "resources": ["DEP Sewer Vactor Truck", "Traffic Barriers", "Water Pumps if needed"],
        },
        "pothole": {
            "summary": "Pothole repair — urgent if lane obstruction",
            "priority": "ROUTINE" if label in ("LOW", "MEDIUM") else "HIGH",
            "steps": [
                {"step": 1, "action": "NYC DOT inspection crew dispatched for assessment", "agent": "NYC DOT", "eta": "24-48 hours"},
                {"step": 2, "action": "Emergency patching if hazardous (>3in deep or lane blocking)", "agent": "NYC DOT", "eta": "48-72 hours"},
                {"step": 3, "action": "Traffic calming signage placed if needed", "agent": "NYC DOT", "eta": "Same day"},
            ],
            "notifications": ["NYC DOT Pothole Unit (nyc.gov/dot)"],
            "resources": ["DOT Inspection Vehicle", "Asphalt Patching Crew", "Road Signage"],
        },
        "rodent": {
            "summary": "Rodent infestation — inspection and baiting program",
            "priority": "ROUTINE",
            "steps": [
                {"step": 1, "action": "DOHMH vector inspector assigned to site", "agent": "NYC DOHMH", "eta": "2-5 business days"},
                {"step": 2, "action": "Baiting stations deployed in active rodent areas", "agent": "NYC DOHMH", "eta": "1 week"},
                {"step": 3, "action": "Building owner notice issued if harborage conditions found", "agent": "NYC DOHMH", "eta": "Same week"},
            ],
            "notifications": ["NYC DOHMH Rodent Control (nyc.gov/health)"],
            "resources": ["DOHMH Inspector", "Rodent Bait Stations", "Property Owner Notice"],
        },
        "noise": {
            "summary": "Noise complaint — NYPD response and enforcement",
            "priority": "ROUTINE",
            "steps": [
                {"step": 1, "action": "NYPD patrol unit dispatched to assess noise level", "agent": "NYPD", "eta": "20-40 min"},
                {"step": 2, "action": "Enforcement action if in violation of NYC Noise Code", "agent": "NYPD", "eta": "On scene"},
                {"step": 3, "action": "DEP Noise Enforcement follow-up if commercial violation", "agent": "NYC DEP", "eta": "Next business day"},
            ],
            "notifications": ["NYPD Precinct", "NYC DEP Noise Enforcement"],
            "resources": ["NYPD Patrol Unit", "Sound Level Meter", "DEP Noise Inspector if needed"],
        },
    }

    plan = templates.get(complaint_type)
    if not plan:
        plan = {
            "summary": f"{label} {complaint_type} — routing to {department}",
            "priority": "HIGH" if label in ("CRITICAL", "HIGH") else "ROUTINE",
            "steps": [
                {"step": 1, "action": f"Dispatch {department} field response team", "agent": department, "eta": "15-30 min"},
                {"step": 2, "action": "Field assessment and incident documentation", "agent": department, "eta": "30-60 min"},
                {"step": 3, "action": "Resolution and NYC 311 ticket close-out", "agent": department, "eta": "1-8 hours"},
            ],
            "notifications": [department, "NYC 311 Follow-up Team"],
            "resources": [f"{department} Field Crew", "311 Case Management System"],
        }
    return plan
