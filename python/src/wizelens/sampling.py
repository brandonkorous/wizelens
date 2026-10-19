"""Trace sampling that keeps errors and slow traces, the same rules as the Node and .NET add-ons."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Callable, List, Optional

Forward = Callable[[], None]

MAX_DECIDED = 20_000
MAX_PENDING = 2000
HOLD_SECONDS = 60.0
_SPAN = 0x1_0000_0000


def keep_by_rate(trace_id: str, rate: float) -> bool:
    """True when the trace falls inside the rate. Reads the last 8 hex digits, so every service keeps the same traces."""
    if rate >= 1:
        return True
    if not rate > 0:
        return False
    try:
        return int(trace_id[-8:], 16) / _SPAN < rate
    except ValueError:
        return False


class _Pending:
    __slots__ = ("items", "since")

    def __init__(self, since: float) -> None:
        self.items: List[Forward] = []
        self.since = since


class TraceSampler:
    """Decides per trace. A trace outside the rate waits until its local root span ends, then stays only when it had an error or a slow span."""

    def __init__(self, rate: float, now: Callable[[], float] = time.monotonic) -> None:
        self.rate = rate
        self._now = now
        self._lock = threading.Lock()
        self._decided: "OrderedDict[str, bool]" = OrderedDict()
        self._pending: "OrderedDict[str, _Pending]" = OrderedDict()

    def offer(self, trace_id: str, important: bool, root: bool, forward: Forward) -> None:
        """One span (root: it starts this process's part of the trace) or log line. `forward` sends it on."""
        with self._lock:
            run = self._offer(trace_id, important, root, forward)
        for f in run:
            f()

    def _offer(self, trace_id: str, important: bool, root: bool, forward: Forward) -> List[Forward]:
        self._expire()
        decided = self._decided.get(trace_id)
        if decided is True:
            return [forward]
        if decided is False:
            # An error after a drop keeps the rest of the trace.
            if important:
                self._decide(trace_id, True)
                return [forward]
            return []
        if keep_by_rate(trace_id, self.rate):
            self._decide(trace_id, True)
            return [forward]
        pending = self._hold(trace_id)
        if important:
            del self._pending[trace_id]
            self._decide(trace_id, True)
            return pending.items + [forward]
        if not root:
            pending.items.append(forward)
            return []
        del self._pending[trace_id]
        self._decide(trace_id, False)
        return []

    def _hold(self, trace_id: str) -> _Pending:
        pending = self._pending.get(trace_id)
        if pending is None:
            pending = _Pending(self._now())
            self._pending[trace_id] = pending
            if len(self._pending) > MAX_PENDING:
                oldest, _ = self._pending.popitem(last=False)
                self._decide(oldest, False)
        return pending

    def _decide(self, trace_id: str, keep: bool) -> None:
        self._decided.pop(trace_id, None)
        self._decided[trace_id] = keep
        if len(self._decided) > MAX_DECIDED:
            self._decided.popitem(last=False)

    def _expire(self) -> None:
        # A trace whose root never ended (a lost request, a job with no root) is dropped after a while.
        cutoff = self._now() - HOLD_SECONDS
        while self._pending:
            trace_id, pending = next(iter(self._pending.items()))
            if pending.since >= cutoff:
                return
            del self._pending[trace_id]
            self._decide(trace_id, False)

    def pending_count(self) -> int:
        with self._lock:
            return len(self._pending)


def is_slow(duration_ms: float, keep_slow_ms: Optional[float]) -> bool:
    return keep_slow_ms is not None and duration_ms >= keep_slow_ms
