package com.wizelens;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.logging.Logger;

/** The one parser for on/off variables: true/1/on/yes or false/0/off/no, any case. Anything else warns once and keeps the default. */
final class EnvFlag {
  private static final List<String> TRUE = List.of("true", "1", "on", "yes");
  private static final List<String> FALSE = List.of("false", "0", "off", "no");
  private static final Set<String> WARNED = ConcurrentHashMap.newKeySet();
  private static final Logger LOG = Logger.getLogger("com.wizelens");

  private EnvFlag() {}

  /** The variable's value from the lookup, parsed. */
  static boolean read(Function<String, String> env, String name, boolean fallback) {
    return parse(name, env.apply(name), fallback);
  }

  /** One value, parsed; the name is for the warning. */
  static boolean parse(String name, String value, boolean fallback) {
    String v = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    if (v.isEmpty()) return fallback;
    if (TRUE.contains(v)) return true;
    if (FALSE.contains(v)) return false;
    if (WARNED.add(name)) {
      LOG.warning(name + "=" + value + " is not true/false/1/0/on/off/yes/no; using " + fallback);
    }
    return fallback;
  }
}
