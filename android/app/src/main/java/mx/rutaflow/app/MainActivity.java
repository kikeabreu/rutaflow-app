package mx.rutaflow.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import mx.rutaflow.app.copilot.CopilotPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CopilotPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
