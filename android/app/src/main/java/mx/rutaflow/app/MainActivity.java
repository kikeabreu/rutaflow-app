package mx.rutaflow.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import mx.rutaflow.app.copilot.CopilotPlugin;
import mx.rutaflow.app.location.NativeTrackingPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CopilotPlugin.class);
        registerPlugin(NativeTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
