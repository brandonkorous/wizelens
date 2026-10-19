package com.wizelens.servlet;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.Charset;

/** A response whose body is copied (up to the limit) as the app writes it. */
final class CapturingResponse extends HttpServletResponseWrapper {
  final BodyBuffer body = new BodyBuffer(Bodies.LIMIT);
  private ServletOutputStream stream;
  private PrintWriter writer;

  CapturingResponse(HttpServletResponse response) {
    super(response);
  }

  @Override
  public ServletOutputStream getOutputStream() throws IOException {
    if (stream == null) stream = new Tee(super.getOutputStream(), body);
    return stream;
  }

  @Override
  public PrintWriter getWriter() throws IOException {
    if (writer == null) writer = new PrintWriter(new OutputStreamWriter(getOutputStream(), Charset.forName(getCharacterEncoding())), false);
    return writer;
  }

  /** Push what the writer holds into the stream, so the copy is complete. */
  void finish() {
    if (writer != null) writer.flush();
  }

  private static final class Tee extends ServletOutputStream {
    private final ServletOutputStream out;
    private final BodyBuffer body;

    Tee(ServletOutputStream out, BodyBuffer body) {
      this.out = out;
      this.body = body;
    }

    @Override
    public void write(int b) throws IOException {
      out.write(b);
      body.add(b);
    }

    @Override
    public void write(byte[] b, int off, int len) throws IOException {
      out.write(b, off, len);
      body.add(b, off, len);
    }

    @Override
    public void flush() throws IOException {
      out.flush();
    }

    @Override
    public boolean isReady() {
      return out.isReady();
    }

    @Override
    public void setWriteListener(WriteListener listener) {
      out.setWriteListener(listener);
    }
  }
}
