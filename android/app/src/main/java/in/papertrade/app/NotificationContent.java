package in.papertrade.app;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** Notification wording and automatic-alert rules shared by native delivery paths. */
public final class NotificationContent {
  private NotificationContent() {}
  public static boolean automaticEmaAllowed(String id, boolean ema21, boolean ema5) {
    return !(id.startsWith("ema21-") && !ema21) && !(id.startsWith("ema5-") && !ema5);
  }
  public static String ipoTitle(String name, String event) {
    String issuer = name.replaceFirst("(?i)\\s+IPO$", "").replaceFirst("(?i)\\s+(Limited|Ltd\\.?)$", "").trim();
    int room = Math.max(1, 42 - 5 - (" — " + event).length());
    if (issuer.length() > room) issuer = issuer.substring(0, room - 1).trim() + "…";
    return "IPO: " + issuer + " — " + event;
  }
  public static String date(String value) {
    try { return LocalDate.parse(value).format(DateTimeFormatter.ofPattern("dd MMM uuuu", Locale.ENGLISH)); }
    catch (Exception ignored) { return "date not confirmed"; }
  }
  public static boolean freshGmp(String updatedAt, long now) {
    try { long updated = Instant.parse(updatedAt).toEpochMilli(); return updated <= now && now - updated <= 36L * 3600000; }
    catch (Exception ignored) { return false; }
  }
  public static String updatedTime(String updatedAt) {
    return Instant.parse(updatedAt).atZone(ZoneId.of("Asia/Kolkata")).format(DateTimeFormatter.ofPattern("dd MMM, HH:mm", Locale.ENGLISH)) + " IST";
  }
}
