const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODELS = {
  advisor: "openai/gpt-oss-120b",
  parser: "openai/gpt-oss-20b",
  vision: "qwen/qwen3.6-27b",
};

const PARSER_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "rutaflow_movement",
    strict: true,
    schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["trip", "dead_km", "refuel", "tank_checkpoint", "unknown"] },
        fare: { type: "number" }, trip_km: { type: "number" }, dead_km: { type: "number" },
        amount: { type: "number" }, liters: { type: "number" }, tank_liters: { type: "number" }, odometer: { type: "number" },
        platform: { type: "string" }, note: { type: "string" },
      },
      required: ["type", "fare", "trip_km", "dead_km", "amount", "liters", "tank_liters", "odometer", "platform", "note"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPTS = {
  parser: `Convierte mensajes breves de un conductor en un movimiento de RutaFlow.
Responde unicamente JSON valido con esta forma:
{"type":"trip|dead_km|refuel|tank_checkpoint|unknown","fare":0,"trip_km":0,"dead_km":0,"amount":0,"liters":0,"tank_liters":0,"odometer":0,"platform":"didi|uber|inDrive|otra","note":""}
No inventes valores. Usa 0 cuando el usuario no los proporcione. "Sin pasaje", "vacio" o "muertos" significa dead_km. Una carga de combustible significa refuel. Una correccion del tanque o lectura actual significa tank_checkpoint.`,
  vision: `Extrae datos de una captura de Uber, DiDi, inDrive u otra plataforma.
Responde unicamente JSON valido con esta forma:
{"fare":0,"pickup_km":0,"pickup_min":0,"dest_km":0,"dest_min":0}
No inventes valores y usa 0 para cualquier dato que no sea visible.`,
};

function env(name, fallback) {
  return process.env[name] || (fallback ? process.env[fallback] : "");
}

async function authenticate(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;

  const supabaseUrl = env("SUPABASE_URL", "REACT_APP_SUPABASE_URL") || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env("SUPABASE_ANON_KEY", "REACT_APP_SUPABASE_ANON_KEY") || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
  });
  return response.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    if (!(await authenticate(req))) {
      return res.status(401).json({ error: "Inicia sesion nuevamente para usar la IA." });
    }

    const apiKey = env("GROQ_API_KEY", "REACT_APP_GROQ_API_KEY");
    if (!apiKey) {
      return res.status(503).json({ error: "Falta configurar GROQ_API_KEY en Vercel." });
    }

    const mode = ["advisor", "parser", "vision"].includes(req.body?.mode)
      ? req.body.mode
      : "advisor";
    const incoming = Array.isArray(req.body?.messages) ? req.body.messages.slice(-30) : [];
    if (!incoming.length) return res.status(400).json({ error: "Falta el mensaje para la IA." });

    const messages = SYSTEM_PROMPTS[mode]
      ? [{ role: "system", content: SYSTEM_PROMPTS[mode] }, ...incoming]
      : incoming;
    const maxTokens = Math.min(Math.max(Number(req.body?.max_tokens) || 700, 80), 6000);

    const requestCompletion = async completionMessages => fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELS[mode],
        messages: completionMessages,
        max_tokens: maxTokens,
        temperature: mode === "advisor" ? 0.35 : 0.1,
        ...(mode === "parser" ? { response_format: PARSER_SCHEMA, reasoning_effort: "low" } : {}),
        ...(mode === "vision" ? { response_format: { type: "json_object" }, reasoning_effort: "none" } : {}),
      }),
    });

    const response = await requestCompletion(messages);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rawDetail = data?.error?.message || `Groq respondio con error ${response.status}`;
      const detail = /failed_generation|failed to validate json/i.test(rawDetail)
        ? "La IA no pudo estructurar el movimiento. Intenta decirlo de forma breve, por ejemplo: 12 km sin pasajero."
        : rawDetail;
      return res.status(response.status).json({ error: detail });
    }

    let content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "Groq no devolvio una respuesta." });
    let finishReason = data?.choices?.[0]?.finish_reason;
    for (let part = 0; mode === "advisor" && finishReason === "length" && part < 2; part += 1) {
      const continuationMessages = [...messages, { role: "assistant", content }, { role: "user", content: "Continua exactamente desde donde terminaste, sin repetir lo anterior. Completa la respuesta." }];
      const continuationResponse = await requestCompletion(continuationMessages);
      const continuationData = await continuationResponse.json().catch(() => ({}));
      const continuation = continuationData?.choices?.[0]?.message?.content;
      if (!continuation) break;
      content += `\n\n${continuation}`;
      finishReason = continuationData?.choices?.[0]?.finish_reason;
    }
    return res.status(200).json({ content, model: MODELS[mode] });
  } catch (error) {
    console.error("RutaFlow Groq proxy error", error);
    return res.status(500).json({ error: "No se pudo conectar con la IA. Intenta de nuevo." });
  }
};
