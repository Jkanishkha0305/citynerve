from tools.report_store import Report, ReportStore
from datetime import datetime

def test_sorted_by_severity():
    store = ReportStore()
    r1 = Report("1", "pothole", "", 0, 0, "", 20, "LOW", "DOT", [], datetime.now())
    r2 = Report("2", "gas leak", "", 0, 0, "", 80, "CRITICAL", "FDNY", [], datetime.now())
    store.add(r1)
    store.add(r2)
    queue = store.get_queue()
    assert queue[0].id == "2"
    assert queue[1].id == "1"

def test_cluster_detection():
    store = ReportStore()
    # Midtown locations
    r1 = Report("1", "pothole", "", 40.75, -73.98, "", 20, "LOW", "DOT", [], datetime.now())
    store.add(r1)
    
    # Within 300m
    clusters = store.find_clusters(40.7501, -73.9801)
    assert len(clusters) == 1
    
    # Far away
    clusters = store.find_clusters(40.80, -73.90)
    assert len(clusters) == 0

def test_websocket_subscriber_called():
    store = ReportStore()
    called = False
    def cb(data):
        nonlocal called
        called = True
    
    store.subscribe(cb)
    store.add(Report("1", "pothole", "", 0, 0, "", 20, "LOW", "DOT", [], datetime.now()))
    assert called == True
