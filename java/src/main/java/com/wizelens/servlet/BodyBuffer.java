package com.wizelens.servlet;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/** Keeps the first bytes of a body and notes when there was more. */
final class BodyBuffer {
  private final ByteArrayOutputStream data = new ByteArrayOutputStream();
  private final int limit;
  private boolean truncated;

  BodyBuffer(int limit) {
    this.limit = limit;
  }

  synchronized void add(byte[] b, int off, int len) {
    if (len <= 0) return;
    int room = limit - data.size();
    if (room > 0) data.write(b, off, Math.min(room, len));
    if (len > room) truncated = true;
  }

  synchronized void add(int b) {
    add(new byte[] {(byte) b}, 0, 1);
  }

  synchronized boolean isEmpty() {
    return data.size() == 0;
  }

  synchronized boolean truncated() {
    return truncated;
  }

  synchronized String text(String charset) {
    Charset cs;
    try {
      cs = charset == null ? StandardCharsets.UTF_8 : Charset.forName(charset);
    } catch (RuntimeException e) {
      cs = StandardCharsets.UTF_8;
    }
    return data.toString(cs);
  }
}
