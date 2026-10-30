package com.wizelens;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/** What WizeLens turns on, read from WIZELENS_* environment variables (or wizelens.* system properties). */
public record WizeLensSettings(
    boolean enabled,
    String endpoint,
    String token,
    String project,
    double sampleRate,
    boolean keepErrors,
    Double keepSlowMs,
    boolean captureBody,
    boolean captureSqlParameters,
    boolean reportPackages,
    List<String> redactKeys) {

  /** Key fragments whose values are replaced with "[redacted]". */
  public static final List<String> DEFAULT_REDACT_KEYS =
      List.of("authorization", "cookie", "password", "passwd", "secret", "token", "apikey", "api_key", "connectionstring");

  public static final String REDACTED = "[redacted]";

  /** Settings from the process environment and system properties. */
  public static WizeLensSettings fromEnvironment() {
    return from(name -> {
      String prop = System.getProperty(name.toLowerCase(Locale.ROOT).replace('_', '.'));
      return prop != null ? prop : System.getenv(name);
    });
  }

  /** Settings from any lookup of WIZELENS_* names. */
  public static WizeLensSettings from(Function<String, String> env) {
    List<String> redact = new ArrayList<>(DEFAULT_REDACT_KEYS);
    String extra = env.apply("WIZELENS_REDACT_KEYS");
    if (extra != null) {
      for (String k : extra.split(",")) if (!k.isBlank()) redact.add(k.trim().toLowerCase(Locale.ROOT));
    }
    String endpoint = blank(env.apply("WIZELENS_ENDPOINT")) ? "http://localhost:5960" : env.apply("WIZELENS_ENDPOINT").replaceAll("/+$", "");
    return new WizeLensSettings(
        EnvFlag.read(env, "WIZELENS_ENABLED", true),
        endpoint,
        blank(env.apply("WIZELENS_TOKEN")) ? null : env.apply("WIZELENS_TOKEN"),
        blank(env.apply("WIZELENS_PROJECT")) ? null : env.apply("WIZELENS_PROJECT"),
        rate(env.apply("WIZELENS_SAMPLE_RATE")),
        EnvFlag.read(env, "WIZELENS_KEEP_ERRORS", true),
        slow(env.apply("WIZELENS_KEEP_SLOW_MS")),
        EnvFlag.read(env, "WIZELENS_CAPTURE_BODY", false),
        EnvFlag.read(env, "WIZELENS_CAPTURE_SQL_PARAMETERS", true),
        EnvFlag.read(env, "WIZELENS_PACKAGES", true),
        List.copyOf(redact));
  }

  /** True when the key (case-insensitive) contains a sensitive fragment. */
  public boolean isSensitive(String key) {
    String k = key.toLowerCase(Locale.ROOT);
    return redactKeys.stream().anyMatch(k::contains);
  }

  private static boolean blank(String v) {
    return v == null || v.isBlank();
  }

  private static double rate(String v) {
    try {
      double r = blank(v) ? 1 : Double.parseDouble(v.trim());
      return Double.isNaN(r) ? 1 : Math.min(1, Math.max(0, r));
    } catch (NumberFormatException e) {
      return 1;
    }
  }

  private static Double slow(String v) {
    if (blank(v)) return 1000.0;
    if (List.of("off", "none", "null", "false").contains(v.trim().toLowerCase(Locale.ROOT))) return null;
    try {
      return Double.parseDouble(v.trim());
    } catch (NumberFormatException e) {
      return 1000.0;
    }
  }
}
