from wizelens.sampling import HOLD_SECONDS, TraceSampler, keep_by_rate

IN = "0af7651916cd43dd8448eb2100000000"  # last 8 hex digits 0: inside any rate above 0
OUT = "0af7651916cd43dd8448eb21ffffffff"  # last 8 hex digits max: outside any rate below 1


class Sent(list):
    def forward(self, name):
        return lambda: self.append(name)


def test_keep_by_rate_matches_the_add_ons():
    assert keep_by_rate(OUT, 1) and not keep_by_rate(IN, 0)
    assert keep_by_rate(IN, 0.5) and not keep_by_rate(OUT, 0.5)
    assert keep_by_rate("00000000000000000000000080000000", 0.6)
    assert not keep_by_rate("00000000000000000000000080000000", 0.4)


def test_inside_the_rate_goes_straight_through():
    sent = Sent()
    s = TraceSampler(0.5)
    s.offer(IN, False, False, sent.forward("child"))
    assert sent == ["child"]


def test_outside_the_rate_waits_for_the_root_then_drops():
    sent = Sent()
    s = TraceSampler(0.5)
    s.offer(OUT, False, False, sent.forward("child"))
    assert sent == [] and s.pending_count() == 1
    s.offer(OUT, False, True, sent.forward("root"))
    assert sent == [] and s.pending_count() == 0
    s.offer(OUT, False, False, sent.forward("late"))
    assert sent == []


def test_an_error_keeps_the_held_spans():
    sent = Sent()
    s = TraceSampler(0)
    s.offer(OUT, False, False, sent.forward("query"))
    s.offer(OUT, True, False, sent.forward("failed"))
    s.offer(OUT, False, True, sent.forward("root"))
    assert sent == ["query", "failed", "root"]


def test_an_error_after_a_drop_keeps_the_rest():
    sent = Sent()
    s = TraceSampler(0)
    s.offer(OUT, False, True, sent.forward("root"))
    s.offer(OUT, True, False, sent.forward("error log"))
    s.offer(OUT, False, False, sent.forward("after"))
    assert sent == ["error log", "after"]


def test_a_trace_whose_root_never_ends_is_dropped_later():
    clock = [0.0]
    sent = Sent()
    s = TraceSampler(0, now=lambda: clock[0])
    s.offer(OUT, False, False, sent.forward("orphan"))
    clock[0] = HOLD_SECONDS + 1
    s.offer(IN, False, True, sent.forward("other"))
    assert s.pending_count() == 0
    s.offer(OUT, False, False, sent.forward("late"))
    assert sent == []
