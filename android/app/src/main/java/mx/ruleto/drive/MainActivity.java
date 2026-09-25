package mx.ruleto.drive;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import mx.ruleto.drive.copilot.CopilotPlugin;
import mx.ruleto.drive.location.NativeTrackingPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CopilotPlugin.class);
        registerPlugin(NativeTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
