import requests
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional
import math

NYC_311_URL = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"

@dataclass
class NYC311Complaint:
    unique_key: str
    complaint_type: str
    descriptor: Optional[str]
    created_date: str
    latitude: float
    longitude: float
    address: str
    borough: str
    agency: str
    status: str

def map_complaint_type(nyc_type: str) -> str:
    """Map NYC 311 complaint types to our internal types."""
    t = nyc_type.lower()
    if "pothole" in t or "street" in t:
        return "pothole"
    elif "water" in t or "leak" in t or "main" in t:
        return "water main"
    elif "noise" in t:
        return "noise"
    elif "rodent" in t or "rat" in t or "vermin" in t:
        return "rodent"
    elif "street light" in t or "light" in t:
        return "street light"
    elif "gas" in t or "smell" in t:
        return "gas leak"
    elif "heat" in t or "no heat" in t:
        return "heat"
    elif "flood" in t or "drain" in t:
        return "flooding"
    elif "fire" in t or "smoke" in t:
        return "fire"
    elif "graffiti" in t:
        return "other"
    else:
        return "other"

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two points."""
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def fetch_nyc_311_data(limit: int = 100, hours: int = 24, borough_filter: str = "MANHATTAN") -> list[NYC311Complaint]:
    """
    Fetch real 311 complaints from NYC Open Data.
    
    Args:
        limit: Maximum number of complaints to fetch
        hours: How many hours back to fetch (currently fetches 100 most recent)
        borough_filter: Filter by borough (MANHATTAN, BROOKLYN, etc.)
    
    Returns:
        List of NYC311Complaint objects
    """
    cutoff = (datetime.now() - timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%S')
    
    # Fetch more data and filter in Python (API is slow with complex WHERE clauses)
    params = {
        "$select": "unique_key,complaint_type,descriptor,created_date,latitude,longitude,incident_address,borough,agency,status",
        "$order": "created_date DESC",
        "$limit": "200"  # Fetch more, filter in Python
    }
    
    try:
        response = requests.get(NYC_311_URL, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()
        
        complaints = []
        for row in data:
            try:
                lat = float(row.get('latitude', 0))
                lon = float(row.get('longitude', 0))
                
                if lat == 0 or lon == 0:
                    continue
                
                # Filter by borough if specified
                if borough_filter and row.get('borough', '') != borough_filter:
                    continue
                
                complaint = NYC311Complaint(
                    unique_key=row.get('unique_key', ''),
                    complaint_type=map_complaint_type(row.get('complaint_type', '')),
                    descriptor=row.get('descriptor', ''),
                    created_date=row.get('created_date', ''),
                    latitude=lat,
                    longitude=lon,
                    address=row.get('incident_address', f"{lat:.4f}, {lon:.4f}"),
                    borough=row.get('borough', borough_filter),
                    agency=row.get('agency', '311'),
                    status=row.get('status', 'Open')
                )
                complaints.append(complaint)
                
                if len(complaints) >= limit:
                    break
                    
            except (ValueError, TypeError):
                continue
        
        return complaints
        
    except Exception as e:
        print(f"Error fetching NYC 311 data: {e}")
        return []

def get_complaints_by_borough(borough: str = "MANHATTAN", limit: int = 100) -> list[NYC311Complaint]:
    """Get complaints for a specific borough."""
    return fetch_nyc_311_data(limit=limit, hours=24, borough_filter=borough)

def get_complaints_all_boroughs(limit_per_borough: int = 50) -> list[NYC311Complaint]:
    """Get complaints from all major boroughs."""
    boroughs = ["MANHATTAN", "BROOKLYN", "BRONX", "QUEENS", "STATEN ISLAND"]
    all_complaints = []
    
    for borough in boroughs:
        complaints = fetch_nyc_311_data(
            limit=limit_per_borough, 
            hours=24, 
            borough_filter=borough
        )
        all_complaints.extend(complaints)
    
    return all_complaints

def get_complaints_near_location(lat: float, lon: float, radius_meters: int = 1000, limit: int = 50) -> list[NYC311Complaint]:
    """Get complaints near a specific location."""
    all_complaints = get_complaints_all_boroughs(limit_per_borough=100)
    
    nearby = []
    for complaint in all_complaints:
        distance = haversine_m(lat, lon, complaint.latitude, complaint.longitude)
        if distance <= radius_meters:
            nearby.append(complaint)
    
    return nearby[:limit]
