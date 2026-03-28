import math, requests
from dataclasses import dataclass

FACILITIES_URL = "https://data.cityofnewyork.us/resource/ji82-xba5.json"
SUBWAY_URL = "https://data.ny.gov/resource/i9wp-a4ja.json"

@dataclass(frozen=True)
class NearbyFacilities:
    hospitals: list[dict]      # [{name, distance_m}]
    schools: list[dict]        # [{name, distance_m}]
    subway_entrances: list[dict]  # [{name, distance_m}]

def haversine_m(lat1, lon1, lat2, lon2) -> float:
    R = 6371000
    p1,p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2-lat1); dl = math.radians(lon2-lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def get_nearby_facilities(lat: float, lon: float, radius_m: int = 500) -> NearbyFacilities:
    """Fetch hospitals, schools, subway entrances within radius_m meters."""

    def fetch_facilities(facgroup: str) -> list[dict]:
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
                    if d <= radius_m:
                        results.append({"name": row['facname'], "distance_m": int(d)})
                except (KeyError, ValueError):
                    pass
            return sorted(results, key=lambda x: x['distance_m'])
        except Exception:
            return []

    def fetch_subway() -> list[dict]:
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
            return sorted(results, key=lambda x: x['distance_m'])
        except Exception:
            return []

    return NearbyFacilities(
        hospitals=fetch_facilities("HEALTH CARE"),
        schools=fetch_facilities("SCHOOLS (K-12)"),
        subway_entrances=fetch_subway(),
    )
