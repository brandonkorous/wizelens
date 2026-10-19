package com.wizelens;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * Decides per trace, with the same rules as the Node and .NET add-ons. A trace outside the rate waits until its local root
 * span ends, then stays only when it had an error or a slow span. An error after a drop keeps the rest of the trace.
 */
public final class TraceSampler {
  static final int MAX_DECIDED = 20_000;
  static final int MAX_PENDING = 2000;
  static final long HOLD_NANOS = 60_000_000_000L;

  private final double rate;
  private final LongSupplier now;
  private final LinkedHashMap<String, Boolean> decided = new LinkedHashMap<>();
  private final LinkedHashMap<String, Pending> pending = new LinkedHashMap<>();

  private static final class Pending {
    final List<Runnable> items = new ArrayList<>();
    final long since;

    Pending(long since) {
      this.since = since;
    }
  }

  public TraceSampler(double rate) {
    this(rate, System::nanoTime);
  }

  TraceSampler(double rate, LongSupplier now) {
    this.rate = rate;
    this.now = now;
  }

  /** True when the trace falls inside the rate. Reads the last 8 hex digits, so every service keeps the same traces. */
  public static boolean keepByRate(String traceId, double rate) {
    if (rate >= 1) return true;
    if (!(rate > 0) || traceId.length() < 8) return false;
    try {
      return Long.parseLong(traceId.substring(traceId.length() - 8), 16) / 4294967296.0 < rate;
    } catch (NumberFormatException e) {
      return false;
    }
  }

  /** One span (root: it starts this process's part of the trace) or log line. {@code forward} sends it on. */
  public void offer(String traceId, boolean important, boolean root, Runnable forward) {
    List<Runnable> run;
    synchronized (this) {
      run = decide(traceId, important, root, forward);
    }
    for (Runnable r : run) r.run();
  }

  private List<Runnable> decide(String traceId, boolean important, boolean root, Runnable forward) {
    expire();
    Boolean known = decided.get(traceId);
    if (Boolean.TRUE.equals(known)) return List.of(forward);
    if (Boolean.FALSE.equals(known)) {
      if (!important) return List.of();
      remember(traceId, true);
      return List.of(forward);
    }
    if (keepByRate(traceId, rate)) {
      remember(traceId, true);
      return List.of(forward);
    }
    Pending p = hold(traceId);
    if (important) {
      pending.remove(traceId);
      remember(traceId, true);
      List<Runnable> all = new ArrayList<>(p.items);
      all.add(forward);
      return all;
    }
    if (!root) {
      p.items.add(forward);
      return List.of();
    }
    pending.remove(traceId);
    remember(traceId, false);
    return List.of();
  }

  private Pending hold(String traceId) {
    Pending p = pending.get(traceId);
    if (p != null) return p;
    p = new Pending(now.getAsLong());
    pending.put(traceId, p);
    if (pending.size() > MAX_PENDING) {
      String oldest = pending.keySet().iterator().next();
      pending.remove(oldest);
      remember(oldest, false);
    }
    return p;
  }

  private void remember(String traceId, boolean keep) {
    decided.remove(traceId);
    decided.put(traceId, keep);
    if (decided.size() > MAX_DECIDED) decided.remove(decided.keySet().iterator().next());
  }

  // A trace whose root never ended (a lost request, a job with no root) is dropped after a while.
  private void expire() {
    long cutoff = now.getAsLong() - HOLD_NANOS;
    Iterator<Map.Entry<String, Pending>> it = pending.entrySet().iterator();
    while (it.hasNext()) {
      Map.Entry<String, Pending> e = it.next();
      if (e.getValue().since >= cutoff) return;
      it.remove();
      remember(e.getKey(), false);
    }
  }

  /** Traces waiting for their root span. */
  public synchronized int pendingCount() {
    return pending.size();
  }
}
