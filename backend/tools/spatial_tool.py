import math, requests
from dataclasses import dataclass

FACILITIES_URL = "https://data.cityofnewyork.us/resource/ji82-xba5.json"
SUBWAY_URL = "https://data.ny.gov/resource/i9wp-a4ja.json"

@dataclass(frozen=True)
class NearbyFacilities:
    hospitals: list[dict]
    schools: list[dict]
    subway_entrances: list[dict]
    fire_stations: list[dict]
    prior_complaints_30d: int

def haversine_m(lat1, lon1, lat2, lon2) -> float:
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def get_nearby_facilities(lat: float, lon: float, radius_m: int = 500,
                          emit=None) -> NearbyFacilities:
    """Fetch hospitals, schools, subway entrances within radius_m meters.
    emit: optional callable(agent, status, msg) for streaming events.
    """
    def _emit(status: str, msg: str):
        if emit:
            emit("SpatialAgent", status, msg)

    def fetch_facilities(facgroup: str, local_radius: int = radius_m) -> list[dict]:
        label = facgroup.title()
        _emit("tool_call", f"→ querying DCP Facilities ({label})...")
        try:
            r = requests.get(FACILITIES_URL, params={
                "$where": f"facgroup='{facgroup}'",
                "$select": "facname,latitude,longitude",
                "$limit": "500"
            }, timeout=5)
            results = []
            for row in r.json():
                try:
                    d = haversine_m(lat, lon, float(row['latitude']), float(row['longitude']))
                    if d <= local_radius:
                        results.append({"name": row['facname'], "distance_m": int(d)})
                except (KeyError, ValueError):
                    pass
            results = sorted(results, key=lambda x: x['distance_m'])
            if results:
                _emit("tool_result", f"✓ {label}: {results[0]['name'].title()} at {results[0]['distance_m']}m" +
                      (f" (+{len(results)-1} more)" if len(results) > 1 else ""))
            else:
                _emit("tool_result", f"✓ {label}: none within {local_radius}m")
            return results
        except Exception:
            _emit("tool_result", f"✗ {label}: API timeout")
            return []

    def fetch_subway() -> list[dict]:
        _emit("tool_call", "→ querying MTA Subway Entrances API...")
        try:
            r = requests.get(SUBWAY_URL, params={"$limit": "2000", "$select": "stop_name,entrance_latitude,entrance_longitude"}, timeout=5)
            results = []
            seen = set()
            for row in r.json():
                try:
                    d = haversine_m(lat, lon, float(row['entrance_latitude']), float(row['entrance_longitude']))
                    name = row['stop_name']
                    if d <= radius_m and name not in seen:
                        results.append({"name": name, "distance_m": int(d)})
                        seen.add(name)
                except (KeyError, ValueError):
                    pass
            results = sorted(results, key=lambda x: x['distance_m'])
            if results:
                _emit("tool_result", f"✓ Subway: {results[0]['name']} at {results[0]['distance_m']}m")
            else:
                _emit("tool_result", "✓ Subway: no entrances within 500m")
            return results
        except Exception:
            _emit("tool_result", "✗ Subway API: timeout")
            return []

    def fetch_fire_stations():
        return fetch_facilities('FIRE SERVICES', local_radius=300)

    def fetch_311_history():
        _emit("tool_call", "→ querying NYC 311 history (30 days)...")
        URL = 'https://data.cityofnewyork.us/resource/erm2-nwe9.json'
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%S')
        try:
            r = requests.get(URL, params={
                "$select": 'count(*) AS total',
                "$where": f"latitude > '{lat-0.003}' AND latitude < '{lat+0.003}' AND longitude > '{lon-0.003}' AND longitude < '{lon+0.003}' AND created_date >= '{cutoff}'",
                "$limit": '1'
            }, timeout=5)
            data = r.json()
            count = 0
            if data and isinstance(data, list) and 'total' in data[0]:
                count = int(data[0]['total'])
            if count >= 5:
                _emit("tool_result", f"⚠ 311 History: {count} complaints at this location in 30 days")
            else:
                _emit("tool_result", f"✓ 311 History: {count} prior complaints")
            return count
        except Exception:
            _emit("tool_result", "✗ 311 History: API timeout")
            return 0

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=5) as executor:
        fut_hospitals = executor.submit(fetch_facilities, "HEALTH CARE")
        fut_schools = executor.submit(fetch_facilities, "SCHOOLS (K-12)")
        fut_subway = executor.submit(fetch_subway)
        fut_fire = executor.submit(fetch_fire_stations)
        fut_311 = executor.submit(fetch_311_history)
    return NearbyFacilities(
        hospitals=fut_hospitals.result(),
        schools=fut_schools.result(),
        subway_entrances=fut_subway.result(),
        fire_stations=fut_fire.result(),
        prior_complaints_30d=fut_311.result(),
    )
