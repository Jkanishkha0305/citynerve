from typing import Callable, List


class EventBus:
    def __init__(self):
        self._subscribers: List[Callable] = []

    def publish(self, event: dict):
        for sub in list(self._subscribers):
            try:
                sub(event)
            except Exception:
                pass

    def subscribe(self, callback: Callable):
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable):
        if callback in self._subscribers:
            self._subscribers.remove(callback)


agent_bus = EventBus()
