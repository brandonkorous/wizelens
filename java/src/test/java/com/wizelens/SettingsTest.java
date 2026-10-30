package com.wizelens;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;
import io.opentelemetry.sdk.autoconfigure.internal.AutoConfigureUtil;
import io.opentelemetry.sdk.autoconfigure.spi.ConfigProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.logging.Handler;
import java.util.logging.LogRecord;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;

class SettingsTest {
  @Test
  void defaults() {
    WizeLensSettings s = WizeLensSettings.from(k -> null);
    assertTrue(s.enabled());
    assertEquals("http://localhost:5960", s.endpoint());
    assertEquals(1.0, s.sampleRate());
    assertEquals(1000.0, s.keepSlowMs());
    assertFalse(s.captureBody());
    assertTrue(s.captureSqlParameters());
  }

  @Test
  void readsTheWizeLensVariables() {
    Map<String, String> env = Map.of("WIZELENS_ENDPOINT", "https://app.wizelens.com/", "WIZELENS_TOKEN", "wl_ik_1",
        "WIZELENS_SAMPLE_RATE", "0.25", "WIZELENS_KEEP_SLOW_MS", "off", "WIZELENS_REDACT_KEYS", "ssn");
    WizeLensSettings s = WizeLensSettings.from(env::get);
    assertEquals("https://app.wizelens.com", s.endpoint());
    assertEquals("wl_ik_1", s.token());
    assertEquals(0.25, s.sampleRate());
    assertNull(s.keepSlowMs());
    assertTrue(s.isSensitive("customer_SSN"));
    assertEquals(1.0, WizeLensSettings.from(Map.of("WIZELENS_SAMPLE_RATE", "lots")::get).sampleRate());
  }

  @Test
  void oldSendNamesAreNotRead() {
    WizeLensSettings s = WizeLensSettings.from(Map.of("WIZELENS_HUB", "https://old.example", "WIZELENS_HUB_TOKEN", "old")::get);
    assertEquals("http://localhost:5960", s.endpoint());
    assertNull(s.token());
  }

  @Test
  void onOffValuesAndABadValueKeepsTheDefault() {
    for (String on : new String[] {"true", "1", "ON", "Yes"}) assertTrue(EnvFlag.parse("WIZELENS_TEST_ON", on, false));
    for (String off : new String[] {"false", "0", "Off", "NO"}) assertFalse(EnvFlag.parse("WIZELENS_TEST_OFF", off, true));
    List<LogRecord> warned = new ArrayList<>();
    Handler h = new Handler() {
      @Override public void publish(LogRecord r) { warned.add(r); }
      @Override public void flush() {}
      @Override public void close() {}
    };
    Logger.getLogger("com.wizelens").addHandler(h);
    assertTrue(EnvFlag.parse("WIZELENS_TEST_BAD", "maybe", true) && EnvFlag.parse("WIZELENS_TEST_BAD", "nah", true));
    Logger.getLogger("com.wizelens").removeHandler(h);
    assertEquals(1, warned.size());
    assertFalse(WizeLensSettings.from(Map.of("WIZELENS_PACKAGES", "off")::get).reportPackages());
    assertTrue(WizeLensSettings.from(Map.of("WIZELENS_CAPTURE_SQL_PARAMETERS", "sometimes")::get).captureSqlParameters());
  }

  @Test
  void agentDefaults() {
    Map<String, String> p = WizeLensDefaults.properties(WizeLensSettings.from(Map.of("WIZELENS_TOKEN", "t")::get));
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
