package com.wizelens.servlet;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/** A request whose body is copied (up to the limit) as the app reads it. */
final class CapturingRequest extends HttpServletRequestWrapper {
  final BodyBuffer body = new BodyBuffer(Bodies.LIMIT);
  private ServletInputStream stream;
  private BufferedReader reader;

  CapturingRequest(HttpServletRequest request) {
    super(request);
  }

  @Override
  public ServletInputStream getInputStream() throws IOException {
    if (stream == null) stream = new Tee(super.getInputStream(), body);
    return stream;
  }

  @Override
  public BufferedReader getReader() throws IOException {
    if (reader == null) {
      String enc = getCharacterEncoding();
      Charset cs = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
      reader = new BufferedReader(new InputStreamReader(getInputStream(), cs));
    }
    return reader;
  }

  private static final class Tee extends ServletInputStream {
    private final ServletInputStream in;
    private final BodyBuffer body;

    Tee(ServletInputStream in, BodyBuffer body) {
      this.in = in;
      this.body = body;
    }

    @Override
    public int read() throws IOException {
      int b = in.read();
      if (b >= 0) body.add(b);
      return b;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
      int n = in.read(b, off, len);
      if (n > 0) body.add(b, off, n);
      return n;
    }

    @Override
    public boolean isFinished() {
      return in.isFinished();
    }

    @Override
    public boolean isReady() {
      return in.isReady();
    }

    @Override
    public void setReadListener(ReadListener listener) {
      in.setReadListener(listener);
    }
  }
}
