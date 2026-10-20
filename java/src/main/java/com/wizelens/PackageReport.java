package com.wizelens;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.sdk.resources.Resource;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarInputStream;

/** The Maven packages on the class path (also inside a Spring Boot or WAR jar), sent to the hub once at start. */
public final class PackageReport {
  private PackageReport() {}

  static final int MAX_PACKAGES = 5000;
  private static final int RETRIES = 5;
  private static final long RETRY_MS = 60_000;
  private static final AtomicBoolean STARTED = new AtomicBoolean();

  /** One package: Maven names it {@code groupId:artifactId}. */
  public record Pkg(String name, String version) {}

  /** The packages of every jar on a class path, once per name and version. */
  public static List<Pkg> list(String classPath) {
    Map<String, Pkg> found = new LinkedHashMap<>();
    for (String path : classPath.split(File.pathSeparator)) {
      if (!path.endsWith(".jar") || !new File(path).isFile()) continue;
      try (JarFile jar = new JarFile(path)) {
        for (JarEntry e : jar.stream().toList()) {
          if (found.size() >= MAX_PACKAGES) break;
          if (isPom(e.getName())) add(found, jar.getInputStream(e));
          else if (isNestedJar(e.getName())) nested(found, jar.getInputStream(e));
        }
      } catch (IOException ignored) {
        // A jar that cannot be read adds nothing.
      }
    }
    return new ArrayList<>(found.values());
  }

  static boolean isPom(String name) {
    return name.startsWith("META-INF/maven/") && name.endsWith("/pom.properties");
  }

  private static boolean isNestedJar(String name) {
    return name.endsWith(".jar") && (name.startsWith("BOOT-INF/lib/") || name.startsWith("WEB-INF/lib/"));
  }

  private static void nested(Map<String, Pkg> found, InputStream in) throws IOException {
    try (JarInputStream jar = new JarInputStream(in)) {
      for (JarEntry e = jar.getNextJarEntry(); e != null; e = jar.getNextJarEntry()) {
        if (isPom(e.getName())) add(found, jar);
      }
    }
  }

  private static void add(Map<String, Pkg> found, InputStream in) throws IOException {
    Properties p = new Properties();
    p.load(in);
    String group = p.getProperty("groupId");
    String artifact = p.getProperty("artifactId");
    String version = p.getProperty("version");
    if (group == null || artifact == null || version == null) return;
    Pkg pkg = new Pkg(group + ":" + artifact, version);
    found.put(pkg.name() + "@" + version, pkg);
  }

  /** The report body: the sender from the resource, and the packages. */
  static String body(WizeLensSettings s, Resource resource, List<Pkg> packages) {
    StringBuilder b = new StringBuilder("{\"sender\":{\"service\":").append(json(text(resource, "service.name", "unknown_service")));
    b.append(",\"runtime\":\"otlp java\"");
    if (s.project() != null) b.append(",\"project\":").append(json(s.project()));
    String release = text(resource, "service.version", null);
    if (release != null) b.append(",\"release\":").append(json(release));
    b.append("},\"packages\":[");
    for (int i = 0; i < packages.size(); i++) {
      Pkg p = packages.get(i);
      b.append(i == 0 ? "" : ",").append("{\"ecosystem\":\"Maven\",\"name\":").append(json(p.name())).append(",\"version\":").append(json(p.version())).append('}');
    }
    return b.append("]}").toString();
  }

  private static String text(Resource r, String key, String fallback) {
    String v = r.getAttribute(AttributeKey.stringKey(key));
    return v == null || v.isBlank() ? fallback : v;
  }

  static String json(String v) {
    StringBuilder b = new StringBuilder("\"");
    for (char c : v.toCharArray()) {
      if (c == '"' || c == '\\') b.append('\\').append(c);
      else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
      else b.append(c);
    }
    return b.append('"').toString();
  }

  private static boolean post(WizeLensSettings s, byte[] body) {
    try {
      HttpURLConnection c = (HttpURLConnection) URI.create(s.hub() + "/_wizelens/api/packages").toURL().openConnection();
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setConnectTimeout(5000);
      c.setReadTimeout(10_000);
      c.setRequestProperty("Content-Type", "application/json");
      if (s.token() != null) c.setRequestProperty("Authorization", "Bearer " + s.token());
      try (OutputStream out = c.getOutputStream()) {
        out.write(body);
      }
      int code = c.getResponseCode();
      return code < 500 && code != 429;
    } catch (IOException e) {
      return false;
    }
  }

  /** Send the report from a daemon thread, retrying a few times while the hub cannot be reached. Runs once per process. */
  public static void start(WizeLensSettings s, Resource resource) {
    String off = System.getProperty("wizelens.packages", System.getenv("WIZELENS_PACKAGES"));
    if ("false".equalsIgnoreCase(off) || !STARTED.compareAndSet(false, true)) return;
    Thread t = new Thread(() -> {
      byte[] body = body(s, resource, list(System.getProperty("java.class.path", ""))).getBytes(StandardCharsets.UTF_8);
      for (int i = 0; i < RETRIES && !post(s, body); i++) {
        try {
          Thread.sleep(RETRY_MS);
        } catch (InterruptedException e) {
          return;
        }
      }
    }, "wizelens-packages");
    t.setDaemon(true);
    t.start();
  }
}
