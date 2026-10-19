package com.wizelens;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class TraceSamplerTest {
  static final String IN = "0af7651916cd43dd8448eb2100000000";
  static final String OUT = "0af7651916cd43dd8448eb21ffffffff";
  final List<String> sent = new ArrayList<>();

  Runnable send(String name) {
    return () -> sent.add(name);
  }

  @Test
  void keepByRateMatchesTheAddOns() {
    assertTrue(TraceSampler.keepByRate(OUT, 1));
    assertFalse(TraceSampler.keepByRate(IN, 0));
    assertTrue(TraceSampler.keepByRate(IN, 0.5));
    assertFalse(TraceSampler.keepByRate(OUT, 0.5));
    assertTrue(TraceSampler.keepByRate("00000000000000000000000080000000", 0.6));
    assertFalse(TraceSampler.keepByRate("00000000000000000000000080000000", 0.4));
  }

  @Test
  void outsideTheRateWaitsForTheRootThenDrops() {
    TraceSampler s = new TraceSampler(0.5);
    s.offer(OUT, false, false, send("child"));
    assertEquals(1, s.pendingCount());
    s.offer(OUT, false, true, send("root"));
    s.offer(OUT, false, false, send("late"));
    assertEquals(List.of(), sent);
    assertEquals(0, s.pendingCount());
  }

  @Test
  void anErrorKeepsTheHeldSpans() {
    TraceSampler s = new TraceSampler(0);
    s.offer(OUT, false, false, send("query"));
    s.offer(OUT, true, false, send("failed"));
    s.offer(OUT, false, true, send("root"));
    assertEquals(List.of("query", "failed", "root"), sent);
  }

  @Test
  void anErrorAfterADropKeepsTheRest() {
    TraceSampler s = new TraceSampler(0);
    s.offer(OUT, false, true, send("root"));
    s.offer(OUT, true, false, send("error log"));
    s.offer(OUT, false, false, send("after"));
    assertEquals(List.of("error log", "after"), sent);
  }

  @Test
  void aTraceWhoseRootNeverEndsIsDroppedLater() {
    AtomicLong clock = new AtomicLong();
    TraceSampler s = new TraceSampler(0, clock::get);
    s.offer(OUT, false, false, send("orphan"));
    clock.set(TraceSampler.HOLD_NANOS + 1);
    s.offer(IN, false, true, send("other"));
    assertEquals(0, s.pendingCount());
    s.offer(OUT, false, false, send("late"));
    assertEquals(List.of(), sent);
  }
}
