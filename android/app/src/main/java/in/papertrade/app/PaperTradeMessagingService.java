package in.papertrade.app;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;
public class PaperTradeMessagingService extends FirebaseMessagingService {
  @Override public void onMessageReceived(RemoteMessage message) {
    NotificationDelivery.show(this,new JSONObject(message.getData()));
  }
  @Override public void onNewToken(String token) {
    getSharedPreferences(NotificationDelivery.PREFS,0).edit().putString("token",token).apply();
  }
}
