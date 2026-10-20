package com.wizelens;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.sdk.resources.Resource;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PackageReportTest {
  @TempDir Path dir;

  private static byte[] jar(Map<String, byte[]> entries) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (JarOutputStream out = new JarOutputStream(bytes)) {
      for (Map.Entry<String, byte[]> e : entries.entrySet()) {
        out.putNextEntry(new JarEntry(e.getKey()));
        out.write(e.getValue());
        out.closeEntry();
      }
    }
    return bytes.toByteArray();
  }

  private static byte[] pom(String group, String artifact, String version) {
    return ("groupId=" + group + "\nartifactId=" + artifact + "\nversion=" + version + "\n").getBytes(StandardCharsets.UTF_8);
  }

  private File write(String name, byte[] content) throws IOException {
    File f = dir.resolve(name).toFile();
    try (OutputStream out = new FileOutputStream(f)) {
      out.write(content);
    }
    return f;
  }

  @Test
  void findsPackagesInPlainAndNestedJars() throws IOException {
    File plain = write("plain.jar", jar(Map.of("META-INF/maven/org.yaml/snakeyaml/pom.properties", pom("org.yaml", "snakeyaml", "1.33"))));
    byte[] inner = jar(Map.of("META-INF/maven/com.fasterxml.jackson.core/jackson-databind/pom.properties", pom("com.fasterxml.jackson.core", "jackson-databind", "2.13.0")));
    File boot = write("app.jar", jar(Map.of("BOOT-INF/lib/jackson-databind-2.13.0.jar", inner)));
    List<PackageReport.Pkg> found = PackageReport.list(plain + File.pathSeparator + boot + File.pathSeparator + dir.resolve("missing.jar"));
    assertEquals(List.of(new PackageReport.Pkg("org.yaml:snakeyaml", "1.33"), new PackageReport.Pkg("com.fasterxml.jackson.core:jackson-databind", "2.13.0")), found);
  }

  @Test
  void buildsTheReportBody() {
    WizeLensSettings s = WizeLensSettings.from(n -> n.equals("WIZELENS_PROJECT") ? "shop" : null);
    Resource r = Resource.create(Attributes.of(AttributeKey.stringKey("service.name"), "orders", AttributeKey.stringKey("service.version"), "1.2.0"));
    String body = PackageReport.body(s, r, List.of(new PackageReport.Pkg("org.yaml:snakeyaml", "1.33")));
    assertEquals("{\"sender\":{\"service\":\"orders\",\"runtime\":\"otlp java\",\"project\":\"shop\",\"release\":\"1.2.0\"},"
        + "\"packages\":[{\"ecosystem\":\"Maven\",\"name\":\"org.yaml:snakeyaml\",\"version\":\"1.33\"}]}", body);
    assertEquals("\"a\\\"b\\\\c\\u000a\"", PackageReport.json("a\"b\\c\n"));
  }
}
