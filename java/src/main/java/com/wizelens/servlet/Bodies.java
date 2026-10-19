package com.wizelens.servlet;

import com.wizelens.WizeLensSettings;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Body previews: text and JSON only, the first 16 KB, sensitive JSON keys redacted. */
public final class Bodies {
  private Bodies() {}

  public static final int LIMIT = 16 * 1024;
  public static final String REQUEST_BODY = "wizelens.request.body";
  public static final String RESPONSE_BODY = "wizelens.response.body";

  // A JSON member: "key": value, where the value is a string, or anything up to the next comma or bracket.
  private static final Pattern MEMBER = Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"\\s*:\\s*(\"(?:[^\"\\\\]|\\\\.)*\"|[^,{}\\[\\]\\s]+)");

  /** True for text and JSON bodies, the ones WizeLens keeps. */
  public static boolean isText(String contentType) {
    if (contentType == null) return false;
    String t = contentType.split(";")[0].trim().toLowerCase(Locale.ROOT);
    return t.startsWith("text/") || t.equals("application/json") || t.equals("application/xml")
        || t.equals("application/x-www-form-urlencoded") || t.equals("application/graphql") || t.endsWith("+json") || t.endsWith("+xml");
  }

  /** The body text. In JSON, members whose key is sensitive get "[redacted]". */
  public static String redact(String text, WizeLensSettings settings) {
    String trimmed = text.stripLeading();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return text;
    Matcher m = MEMBER.matcher(text);
    StringBuilder out = new StringBuilder();
    while (m.find()) {
      String replacement = settings.isSensitive(m.group(1))
          ? "\"" + m.group(1) + "\": \"" + WizeLensSettings.REDACTED + "\""
          : m.group();
      m.appendReplacement(out, Matcher.quoteReplacement(replacement));
    }
    m.appendTail(out);
    return out.toString();
  }
}
