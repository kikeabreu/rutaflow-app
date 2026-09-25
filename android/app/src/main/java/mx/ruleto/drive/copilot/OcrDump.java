package mx.ruleto.drive.copilot;

import android.content.Context;
import android.graphics.Rect;

import com.google.mlkit.vision.text.Text;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Vuelca el resultado crudo de ML Kit con su geometria a disco.
 *
 * El parser actual solo recibe result.getText(), que aplana la pantalla y pierde las
 * cajas de cada linea. Estos volcados son el insumo para reconstruir el parser sobre
 * posicion y tamano de texto en vez de expresiones regulares sobre un string plano.
 */
final class OcrDump {
    static final String DIR = "ocr-dumps";
    private static final int MAX_FILES = 40;

    private OcrDump() {}

    /** @return ruta del archivo escrito, o null si no se pudo escribir. */
    static String write(Context context, Text result, int screenWidth, int screenHeight) {
        File dir = new File(context.getExternalFilesDir(null), DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) return null;
        if (countDumps(dir) >= MAX_FILES) return null;

        try {
            JSONObject root = new JSONObject();
            root.put("capturedAt", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.US).format(new Date()));
            root.put("screenWidth", screenWidth);
            root.put("screenHeight", screenHeight);
            root.put("flatText", result.getText());

            JSONArray blocks = new JSONArray();
            for (Text.TextBlock block : result.getTextBlocks()) {
                JSONObject blockJson = new JSONObject();
                blockJson.put("text", block.getText());
                blockJson.put("box", box(block.getBoundingBox()));

                JSONArray lines = new JSONArray();
                for (Text.Line line : block.getLines()) {
                    JSONObject lineJson = new JSONObject();
                    lineJson.put("text", line.getText());
                    lineJson.put("box", box(line.getBoundingBox()));
                    lineJson.put("angle", line.getAngle());
                    lineJson.put("confidence", line.getConfidence());

                    JSONArray elements = new JSONArray();
                    for (Text.Element element : line.getElements()) {
                        JSONObject elementJson = new JSONObject();
                        elementJson.put("text", element.getText());
                        elementJson.put("box", box(element.getBoundingBox()));
                        elements.put(elementJson);
                    }
                    lineJson.put("elements", elements);
                    lines.put(lineJson);
                }
                blockJson.put("lines", lines);
                blocks.put(blockJson);
            }
            root.put("blocks", blocks);

            File file = new File(dir, "ocr-" + System.currentTimeMillis() + ".json");
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(root.toString(2).getBytes(StandardCharsets.UTF_8));
            }
            return file.getAbsolutePath();
        } catch (JSONException | IOException e) {
            return null;
        }
    }

    /**
     * Alto y ancho de la caja. ML Kit devuelve null en getBoundingBox() cuando no puede
     * ubicar el texto, asi que el volcado lo registra explicitamente en vez de omitirlo.
     */
    private static Object box(Rect rect) throws JSONException {
        if (rect == null) return JSONObject.NULL;
        JSONObject json = new JSONObject();
        json.put("left", rect.left);
        json.put("top", rect.top);
        json.put("right", rect.right);
        json.put("bottom", rect.bottom);
        json.put("width", rect.width());
        json.put("height", rect.height());
        return json;
    }

    private static int countDumps(File dir) {
        String[] names = dir.list();
        return names == null ? 0 : names.length;
    }
}
