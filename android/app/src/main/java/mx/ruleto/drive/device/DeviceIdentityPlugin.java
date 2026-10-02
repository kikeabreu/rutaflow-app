package mx.ruleto.drive.device;

import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// ANDROID_ID sobrevive a desinstalar y reinstalar Ruleto (solo cambia con un
// restablecimiento de fábrica). Es lo que permite que la prueba gratis y el
// "un celular a la vez" se apliquen al teléfono y no solo a la cuenta.
@CapacitorPlugin(name="RuletoDevice")
public class DeviceIdentityPlugin extends Plugin {
    @PluginMethod public void identity(PluginCall call){
        String id=Settings.Secure.getString(getContext().getContentResolver(),Settings.Secure.ANDROID_ID);
        JSObject out=new JSObject();
        out.put("id",id==null?"":id);
        out.put("manufacturer",Build.MANUFACTURER);
        out.put("model",Build.MODEL);
        call.resolve(out);
    }
}
