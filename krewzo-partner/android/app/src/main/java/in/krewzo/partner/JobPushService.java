package in.krewzo.partner;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

// Replaces the plugin's FCM service: job offers ring natively; everything else reaches the plugin as before.
public class JobPushService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage m) {
        Map<String, String> d = m.getData();
        String type = d.get("type");
        if ("job_taken".equals(type)) { JobAlerts.dismiss(this, d.get("booking_id")); return; }
        if ("job_offer".equals(type) && !MainActivity.visible) { JobAlerts.show(this, d); return; }
        super.onMessageReceived(m); // app open: the in-app alert (socket) handles it
    }
}
