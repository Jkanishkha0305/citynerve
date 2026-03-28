from tools.spatial_tool import haversine_m, get_nearby_facilities, NearbyFacilities

def test_haversine_known():
    # Times Square: 40.7580, -73.9855
    # Empire State: 40.7484, -73.9857
    d = haversine_m(40.7580, -73.9855, 40.7484, -73.9857)
    # Approx 1067m according to some sources, let's check a tighter pair or just check it's within 10%
    # Using 40.7580, -73.9855 to 40.7484, -73.9857 is about 1.07km
    assert 1000 <= d <= 1100

def test_nearby_returns_dataclass():
    # We won't call the actual network for this simple unit test if we mock it, 
    # but the tool has try/except blocks.
    res = get_nearby_facilities(40.75, -73.98)
    assert isinstance(res, NearbyFacilities)
    assert hasattr(res, 'fire_stations')
    assert hasattr(res, 'prior_complaints_30d')
