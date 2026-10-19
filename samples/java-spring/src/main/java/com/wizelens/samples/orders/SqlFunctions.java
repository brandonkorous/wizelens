package com.wizelens.samples.orders;

/** Functions the sample's H2 database calls. */
public final class SqlFunctions {
  private SqlFunctions() {}

  /** SLEEP_MS(n): waits n ms, so the sample can show slow queries. */
  public static int sleepMs(int ms) throws InterruptedException {
    Thread.sleep(ms);
    return 0;
  }
}
