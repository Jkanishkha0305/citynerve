from tools.severity_engine import calculate_severity
from tools.spatial_tool import NearbyFacilities

def test_gas_leak_near_hospital():
    nearby = NearbyFacilities(
        hospitals=[{"name": "Test Hospital", "distance_m": 100}],
        schools=[],
        subway_entrances=[],
        fire_stations=[],
        prior_complaints_30d=0
    )
    res = calculate_severity("gas leak", 40.7, -74.0, 12, nearby)
    assert res.score >= 80
    assert res.label == "CRITICAL"
    assert "Hospital within 100m" in res.reasons[1]

def test_noise_low_hour():
    nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[], fire_stations=[], prior_complaints_30d=0)
    res = calculate_severity("noise", 40.7, -74.0, 12, nearby)
    assert res.score <= 25
    assert res.label == "LOW"

def test_cluster_override():
    nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[], fire_stations=[], prior_complaints_30d=0)
    res = calculate_severity("pothole", 40.7, -74.0, 12, nearby, cluster_count=5)
    assert res.score >= 85
    assert "CLUSTER ALERT" in res.reasons[1]

def test_fire_station_proximity():
    nearby = NearbyFacilities(
        hospitals=[],
        schools=[],
        subway_entrances=[],
        fire_stations=[{"name": "Engine 54", "distance_m": 250}],
        prior_complaints_30d=0
    )
    res = calculate_severity("pothole", 40.7, -74.0, 12, nearby)
    # pothole=25, fire station=15 -> 40
    assert res.score == 40
    assert "Fire station 250m away" in res.reasons[1]

def test_prior_complaints_pattern():
    nearby = NearbyFacilities(
        hospitals=[],
        schools=[],
        subway_entrances=[],
        fire_stations=[],
        prior_complaints_30d=12
    )
    res = calculate_severity("noise", 40.7, -74.0, 12, nearby)
    # noise=20, prior=20 -> 40
    assert res.score == 40
    assert "Pattern alert: 12 complaints" in res.reasons[1]

def test_department_routing():
    nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[], fire_stations=[], prior_complaints_30d=0)
    res = calculate_severity("pothole", 40.7, -74.0, 12, nearby)
    assert res.department == "NYC DOT"
