package com.wizelens.servlet;

import com.wizelens.WizeLensSettings;
import io.opentelemetry.api.trace.Span;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Puts request and response bodies (text and JSON, first 16 KB) on the server span the OpenTelemetry agent opened.
 * Register it as a servlet filter (in Spring Boot, a bean). It does nothing unless WIZELENS_CAPTURE_BODY=true.
 */
public class WizeLensBodyFilter implements Filter {
  private final WizeLensSettings settings;

  public WizeLensBodyFilter() {
    this(WizeLensSettings.fromEnvironment());
  }

  public WizeLensBodyFilter(WizeLensSettings settings) {
    this.settings = settings;
  }

  @Override
  public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
    if (!settings.enabled() || !settings.captureBody() || !(req instanceof HttpServletRequest http) || !(res instanceof HttpServletResponse out)) {
      chain.doFilter(req, res);
      return;
    }
    Span span = Span.current();
    CapturingRequest request = new CapturingRequest(http);
    CapturingResponse response = new CapturingResponse(out);
    try {
      chain.doFilter(request, response);
    } finally {
      response.finish();
      record(span, Bodies.REQUEST_BODY, request.body, http.getContentType(), http.getCharacterEncoding());
      record(span, Bodies.RESPONSE_BODY, response.body, response.getContentType(), response.getCharacterEncoding());
    }
  }

  private void record(Span span, String key, BodyBuffer body, String contentType, String charset) {
    if (body.isEmpty() || !Bodies.isText(contentType) || !span.isRecording()) return;
    String text = body.text(charset);
    span.setAttribute(key, body.truncated() ? text : Bodies.redact(text, settings));
    if (body.truncated()) span.setAttribute(key + ".truncated", true);
  }
}
