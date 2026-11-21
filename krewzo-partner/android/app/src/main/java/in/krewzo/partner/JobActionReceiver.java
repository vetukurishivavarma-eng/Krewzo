package in.krewzo.partner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// "Skip" button on the job notification (no screen needed, so a receiver is fine).
public class JobActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id");
        if (id != null && "SKIP".equals(i.getAction())) JobAlerts.skip(c, id);
    }
}
