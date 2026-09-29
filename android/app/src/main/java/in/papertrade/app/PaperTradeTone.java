package in.papertrade.app;

import android.app.NotificationChannel;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;

/** Original short tu bundled with the app. A new channel id is required because Android locks a channel's sound. */
public final class PaperTradeTone {
  private PaperTradeTone() {}

  public static Uri uri(Context context) {
    return Uri.parse("android.resource://" + context.getPackageName() + "/raw/papertrade_tu");
  }

  public static void apply(Context context, NotificationChannel channel) {
    AudioAttributes attributes = new AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build();
    channel.setSound(uri(context), attributes);
  }
}
