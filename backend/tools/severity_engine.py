from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from tools.spatial_tool import NearbyFacilities

DEPARTMENT_ROUTING = {
    "pothole": "NYC DOT",
    "water main": "NYC DEP",
    "noise": "NYPD",
    "rodent": "NYC DOHMH",
    "street light": "NYC DOT",
    "gas leak": "Con Edison / FDNY",
    "heat": "NYC HPD",
    "flooding": "NYC DEP",
    "fire": "FDNY",
    "other": "NYC 311",
}

BASE_SCORES = {
    "gas leak": 80, "fire": 80,
    "water main": 70, "flooding": 65,
    "heat": 45, "pothole": 25,
    "noise": 20, "street light": 20, "rodent": 15,
}

@dataclass(frozen=True)
class SeverityResult:
    score: int
    label: str   # LOW / MEDIUM / HIGH / CRITICAL
    reasons: list[str]
    department: str

def calculate_severity(complaint_type: str, lat: float, lon: float,
                       hour: int, nearby: "NearbyFacilities",
                       cluster_count: int = 1) -> SeverityResult:
    t = complaint_type.lower().strip()
    score = BASE_SCORES.get(t, 30)
    reasons = []

    if t in BASE_SCORES:
        reasons.append(f"{complaint_type.title()} — base priority issue")

    # Location modifiers
    if any(h["distance_m"] <= 500 for h in nearby.hospitals):
        score += 50
        closest = min(nearby.hospitals, key=lambda x: x["distance_m"])
        reasons.append(f"Hospital within {closest['distance_m']}m ({closest['name'].title()})")

    if any(s["distance_m"] <= 200 for s in nearby.schools) and 7 <= hour < 16:
        score += 30
        closest = min(nearby.schools, key=lambda x: x["distance_m"])
        reasons.append(f"School within {closest['distance_m']}m during school hours")

    if any(s["distance_m"] <= 150 for s in nearby.subway_entrances):
        score += 20
        closest = min(nearby.subway_entrances, key=lambda x: x["distance_m"])
        reasons.append(f"Subway entrance within {closest['distance_m']}m ({closest['name']})")

    # Fire station proximity
    if nearby.fire_stations and any(f['distance_m'] <= 300 for f in nearby.fire_stations):
        score += 15
        closest = min(nearby.fire_stations, key=lambda x: x['distance_m'])
        reasons.append(f"Fire station {closest['distance_m']}m away — rapid response zone")

    # Prior complaint pattern
    if nearby.prior_complaints_30d >= 10:
        score += 20
        reasons.append(f"Pattern alert: {nearby.prior_complaints_30d} complaints at this location in 30 days")
    elif nearby.prior_complaints_30d >= 5:
        score += 10
        reasons.append(f"{nearby.prior_complaints_30d} prior complaints at this location this month")

    if 7 <= hour <= 9 or 17 <= hour <= 19:
        score += 20
        reasons.append("Rush hour — high public impact")

    # Cluster override
    if cluster_count >= 5:
        score = max(score, 85)
        reasons.append(f"CLUSTER ALERT: {cluster_count} reports in same area — possible emergency")
    elif cluster_count >= 3:
        score += 15
        reasons.append(f"Cluster of {cluster_count} reports detected nearby")

    score = min(score, 100)
    label = "CRITICAL" if score >= 80 else "HIGH" if score >= 55 else "MEDIUM" if score >= 30 else "LOW"
    dept = DEPARTMENT_ROUTING.get(t, "NYC 311")
    return SeverityResult(score=score, label=label, reasons=reasons, department=dept)
