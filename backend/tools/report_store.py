import threading, uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable

@dataclass
class Report:
    id: str
    complaint_type: str
    description: str
    lat: float; lon: float; address: str
    severity: int; label: str; department: str
    reasons: list[str]
    submitted_at: datetime
    status: str = "PENDING"

    def to_dict(self) -> dict:
        return {**self.__dict__, "submitted_at": self.submitted_at.isoformat()}

class ReportStore:
    def __init__(self):
        self._reports: list[Report] = []
        self._lock = threading.Lock()
        self._subscribers: list[Callable] = []

    def subscribe(self, cb: Callable): self._subscribers.append(cb)
    def unsubscribe(self, cb: Callable):
        if cb in self._subscribers: self._subscribers.remove(cb)

    def add(self, r: Report):
        with self._lock:
            self._reports.append(r)
            self._reports.sort(key=lambda x: x.severity, reverse=True)
        self._notify()

    def update(self, report_id: str, **kwargs):
        with self._lock:
            for r in self._reports:
                if r.id == report_id:
                    for k, v in kwargs.items(): setattr(r, k, v)
                    self._reports.sort(key=lambda x: x.severity, reverse=True)
                    break
        self._notify()

    def get_queue(self) -> list[Report]:
        with self._lock: return list(self._reports)

    def get_all_dicts(self) -> list[dict]:
        with self._lock: return [r.to_dict() for r in self._reports]

    def find_clusters(self, lat, lon, radius_m=300, minutes=15) -> list[Report]:
        from tools.spatial_tool import haversine_m
        now = datetime.now()
        with self._lock:
            return [r for r in self._reports
                    if haversine_m(lat, lon, r.lat, r.lon) <= radius_m
                    and (now - r.submitted_at).total_seconds() / 60 <= minutes]

    def _notify(self):
        data = self.get_all_dicts()
        for cb in list(self._subscribers):
            try: cb(data)
            except Exception: pass

    def get_by_id(self, report_id: str) -> Report | None:
        with self._lock:
            return next((r for r in self._reports if r.id == report_id), None)
