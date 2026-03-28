from tools.severity_engine import calculate_severity
from tools.spatial_tool import NearbyFacilities

def test_gas_leak_near_hospital():
    nearby = NearbyFacilities(
        hospitals=[{"name": "Test Hospital", "distance_m": 100}],
        schools=[],
        subway_entrances=[]
    )
    res = calculate_severity("gas leak", 40.7, -74.0, 12, nearby)
    assert res.score >= 80
    assert res.label == "CRITICAL"
    assert "Hospital within 100m" in res.reasons[1]

def test_noise_low_hour():
    nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[])
    res = calculate_severity("noise", 40.7, -74.0, 12, nearby)
    assert res.score <= 25
    assert res.label == "LOW"

def test_cluster_override():
    nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[])
    res = calculate_severity("pothole", 40.7, -74.0, 12, nearby, cluster_count=5)
    assert res.score >= 85
    assert "CLUSTER ALERT" in res.reasons[1]

def test_department_routing():
    nearby = NearbyFacilities(hospitals=[], schools=[], subway_entrances=[])
    res = calculate_severity("pothole", 40.7, -74.0, 12, nearby)
    assert res.department == "NYC DOT"
