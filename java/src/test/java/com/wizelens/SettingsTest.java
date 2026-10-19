package com.wizelens;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;
import io.opentelemetry.sdk.autoconfigure.internal.AutoConfigureUtil;
import io.opentelemetry.sdk.autoconfigure.spi.ConfigProperties;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SettingsTest {
  @Test
  void defaults() {
    WizeLensSettings s = WizeLensSettings.from(k -> null);
    assertTrue(s.enabled());
    assertEquals("http://localhost:5960", s.hub());
    assertEquals(1.0, s.sampleRate());
    assertEquals(1000.0, s.keepSlowMs());
    assertFalse(s.captureBody());
    assertTrue(s.captureSqlParameters());
  }

  @Test
  void readsTheWizeLensVariables() {
    Map<String, String> env = Map.of("WIZELENS_HUB", "https://app.wizelens.com/", "WIZELENS_HUB_TOKEN", "wl_ik_1",
        "WIZELENS_SAMPLE_RATE", "0.25", "WIZELENS_KEEP_SLOW_MS", "off", "WIZELENS_REDACT_KEYS", "ssn");
    WizeLensSettings s = WizeLensSettings.from(env::get);
    assertEquals("https://app.wizelens.com", s.hub());
    assertEquals(0.25, s.sampleRate());
    assertNull(s.keepSlowMs());
    assertTrue(s.isSensitive("customer_SSN"));
    assertEquals(1.0, WizeLensSettings.from(Map.of("WIZELENS_SAMPLE_RATE", "lots")::get).sampleRate());
  }

  @Test
  void agentDefaults() {
    Map<String, String> p = WizeLensDefaults.properties(WizeLensSettings.from(Map.of("WIZELENS_HUB_TOKEN", "t")::get));
    assertEquals("http://localhost:5960", p.get("otel.exporter.otlp.endpoint"));
    assertEquals("Authorization=Bearer t", p.get("otel.exporter.otlp.headers"));
    assertEquals("true", p.get("otel.instrumentation.jdbc.experimental.capture-query-parameters"));
    assertEquals("true", WizeLensDefaults.properties(WizeLensSettings.from(Map.of("WIZELENS_ENABLED", "false")::get)).get("otel.sdk.disabled"));
  }

  @Test
  void autoconfigureLoadsTheCustomizer() {
    AutoConfiguredOpenTelemetrySdk sdk = AutoConfiguredOpenTelemetrySdk.builder()
        .addPropertiesSupplier(() -> Map.of("otel.traces.exporter", "none", "otel.metrics.exporter", "none", "otel.logs.exporter", "none"))
        .addPropertiesSupplier(() -> Map.of("otel.service.name", "orders-api"))
        .build();
    ConfigProperties config = AutoConfigureUtil.getConfig(sdk);
    assertEquals("http://localhost:5960", config.getString("otel.exporter.otlp.endpoint"));
    assertEquals("parentbased_always_on", config.getString("otel.traces.sampler"));
    sdk.getOpenTelemetrySdk().close();
  }
}
