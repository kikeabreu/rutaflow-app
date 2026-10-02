const { allowAppOrigin, authenticate } = require("../billing/_shared.cjs");
const { buildEvent, config, sendEvent } = require("./_shared.cjs");

module.exports = async function handler(req, res) {
  allowAppOrigin(req, res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: "Sesión no válida." });
    if (!config().datasetId || !config().accessToken) {
      return res.status(503).json({ error: "Conversions API no está configurada." });
    }
    const event = buildEvent(req.body, user, req.headers || {});
    const result = await sendEvent(event, { testEventCode: process.env.META_TEST_EVENT_CODE });
    return res.status(202).json({ accepted: true, events_received: result.eventsReceived });
  } catch (error) {
    if ((error?.statusCode || 500) < 500) return res.status(error.statusCode).json({ error: error.message });
    console.error("Ruleto Meta Conversions API error", error?.metaCode || error?.message || error);
    return res.status(error?.statusCode || 502).json({ error: "No se pudo enviar el evento." });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: "32kb" } } };
