package in.papertrade.app;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.*;
import java.time.*;

public final class NotificationDelivery {
  public static final String PREFS="papertrade_push_v3";
  public static volatile boolean foreground=false;
  public static JSONObject preferences(Context context) {
    try{return new JSONObject(context.getSharedPreferences(PREFS,0).getString("preferences","{}"));}catch(Exception e){return new JSONObject();}
  }
  public static Bitmap logo(Context context) {
    Drawable drawable=ContextCompat.getDrawable(context,R.mipmap.ic_launcher);
    Bitmap bitmap=Bitmap.createBitmap(128,128,Bitmap.Config.ARGB_8888);
    if(drawable!=null){drawable.setBounds(0,0,128,128);drawable.draw(new Canvas(bitmap));}
    return bitmap;
  }
  public static String safePath(String path) {
    return path!=null && (path.matches("/\\?screen=(ipo|pnl)")||path.matches("/ipo-allotment/(mufg|kfin|bigshare|bse)"))?path:"/";
  }
  public static synchronized void show(Context context, JSONObject notice) {
    try{
      JSONObject prefs=preferences(context);long now=System.currentTimeMillis();
      String kind=notice.optString("kind","trade"), key="allotment".equals(kind)?"allotment":"portfolio".equals(kind)?"reviews":"practice".equals(kind)?"practice":"ipo".equals(kind)?"ipo":"trades";
      if(prefs.optLong("pausedUntil",0)>now || !prefs.optBoolean(key,!"reviews".equals(key)&&!"practice".equals(key)))return;
      if(notice.optLong("expiresAt",now+60000)<=now)return;
      if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
      SharedPreferences state=context.getSharedPreferences(PREFS,0);
      JSONArray seen=new JSONArray(state.getString("seen","[]"));
      String id=notice.optString("id","event-"+now);
      for(int i=0;i<seen.length();i++)if(id.equals(seen.optString(i)))return;
      JSONArray next=new JSONArray();for(int i=Math.max(0,seen.length()-199);i<seen.length();i++)next.put(seen.get(i));next.put(id);
      JSONArray inbox=new JSONArray(state.getString("inbox","[]"));
      notice.put("createdAt",now);inbox.put(notice);
      JSONArray bounded=new JSONArray();for(int i=Math.max(0,inbox.length()-100);i<inbox.length();i++)bounded.put(inbox.get(i));
      state.edit().putString("seen",next.toString()).putString("inbox",bounded.toString()).apply();
      if(foreground)return;
      int hour=ZonedDateTime.now(ZoneId.of("Asia/Kolkata")).getHour();
      boolean silent=notice.optBoolean("silent",false)||hour>=21||hour<8;
      String channelId=silent?"papertrade_quiet_v3":"trade".equals(kind)?"papertrade_trades_v3":"papertrade_ipo_v3";
      NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
      if(manager==null)return;
      if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(channelId,silent?"Quiet updates":"trade".equals(kind)?"My paper trades":"IPO updates",silent?NotificationManager.IMPORTANCE_LOW:NotificationManager.IMPORTANCE_DEFAULT);channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);manager.createNotificationChannel(channel);}
      Intent intent=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("notificationPath",safePath(notice.optString("url")));
      PendingIntent pending=PendingIntent.getActivity(context,id.hashCode()&0x7fffffff,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      String body=notice.optString("body");
      if("trade".equals(kind)&&prefs.optBoolean("hideAmounts",true))body="A paper-trade protection event occurred. Open PaperTrade IN to review it.";
      NotificationCompat.Builder builder=new NotificationCompat.Builder(context,channelId).setSmallIcon(R.drawable.ic_stat_papertrade).setLargeIcon(logo(context)).setContentTitle(notice.optString("title","PaperTrade IN")).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true).setSilent(silent).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_STATUS).setGroup("papertrade-"+kind);
      manager.notify(id.hashCode()&0x7fffffff,builder.build());
    }catch(Exception ignored){/* Never interrupt trading if notification delivery fails. */}
  }
}
