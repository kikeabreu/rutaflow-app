const crypto = require("node:crypto");

const GRAPH_VERSION = () => process.env.META_GRAPH_API_VERSION || "v26.0";
const GRAPH_HOST = "https://graph.facebook.com";
const EVENT_NAMES = new Set([
  "PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout",
  "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration", "Subscribe",
  "StartTrial", "Login", "Contact", "Download",
]);
const ACTION_SOURCES = new Set(["website", "app"]);
const EVENT_ID_RE = /^[A-Za-z0-9_.:-]{8,200}$/;
const FBP_RE = /^fb\.\d{1,20}\.[A-Za-z0-9._:-]{1,180}$/;
const FBC_RE = /^fb\.\d{1,20}\.[A-Za-z0-9._:-]{1,220}$/;

function config() {
  return {
    datasetId: String(process.env.META_DATASET_ID || process.env.META_PIXEL_ID || "").trim(),
    accessToken: String(process.env.META_ACCESS_TOKEN || "").trim(),
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function hashEmail(value) {
  const email = normalized(value);
  return email && email.includes("@") ? sha256(email) : null;
}

function hashPhone(value) {
  const phone = String(value || "").replace(/\D/g, "");
  return phone.length >= 7 ? sha256(phone) : null;
}

function safeString(value, max = 200) {
  const result = String(value || "").trim();
  return result ? result.slice(0, max) : null;
}

function clientValue(value, regex, max = 240) {
  const result = safeString(value, max);
  return result && regex.test(result) ? result : null;
}

function eventSourceUrl(value) {
  const raw = safeString(value, 500);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["ruleto.mx", "www.ruleto.mx", "app.ruleto.mx"].includes(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function eventTime(value, now = Math.floor(Date.now() / 1000)) {
  if (value === undefined || value === null || value === "") return now;
  const result = Number(value);
  if (!Number.isInteger(result) || result < now - 7 * 24 * 60 * 60 || result > now + 300) {
    throw Object.assign(new Error("event_time fuera de rango"), { statusCode: 400 });
  }
  return result;
}

function customData(input) {
  if (input === undefined || input === null) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("custom_data inválido"), { statusCode: 400 });
  }
  const output = {};
  if (input.value !== undefined) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0 || value > 1000000000) throw Object.assign(new Error("value inválido"), { statusCode: 400 });
    output.value = value;
  }
  if (input.currency !== undefined) {
    const currency = String(input.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw Object.assign(new Error("currency inválida"), { statusCode: 400 });
    output.currency = currency;
  }
  if (input.content_type !== undefined) output.content_type = safeString(input.content_type, 80);
  if (input.order_id !== undefined) output.order_id = safeString(input.order_id, 200);
  if (input.num_items !== undefined) {
    const count = Number(input.num_items);
    if (!Number.isInteger(count) || count < 0 || count > 1000000) throw Object.assign(new Error("num_items inválido"), { statusCode: 400 });
    output.num_items = count;
  }
  if (input.content_ids !== undefined) {
    if (!Array.isArray(input.content_ids) || input.content_ids.length > 50) throw Object.assign(new Error("content_ids inválido"), { statusCode: 400 });
    output.content_ids = input.content_ids.map(value => safeString(value, 200)).filter(Boolean);
  }
  return Object.keys(output).length ? output : undefined;
}

function buildEvent(input, user, headers = {}, now) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("Evento inválido"), { statusCode: 400 });
  const eventName = String(input.event_name || "").trim();
  if (!EVENT_NAMES.has(eventName)) throw Object.assign(new Error("event_name no permitido"), { statusCode: 400 });
  const eventId = String(input.event_id || "").trim();
  if (!EVENT_ID_RE.test(eventId)) throw Object.assign(new Error("event_id inválido"), { statusCode: 400 });
  const actionSource = String(input.action_source || "website").trim();
  if (!ACTION_SOURCES.has(actionSource)) throw Object.assign(new Error("action_source no permitido"), { statusCode: 400 });

  const userData = {
    external_id: [sha256(user.id)],
  };
  const email = hashEmail(user.email);
  const phone = hashPhone(user.phone);
  if (email) userData.em = [email];
  if (phone) userData.ph = [phone];
  const fbp = clientValue(input.fbp, FBP_RE);
  const fbc = clientValue(input.fbc, FBC_RE);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  const userAgent = safeString(headers["user-agent"], 500);
  if (userAgent) userData.client_user_agent = userAgent;

  const event = {
    event_name: eventName,
    event_time: eventTime(input.event_time, now),
    event_id: eventId,
    user_data: userData,
    action_source: actionSource,
  };
  const sourceUrl = eventSourceUrl(input.event_source_url);
  if (sourceUrl) event.event_source_url = sourceUrl;
  const data = customData(input.custom_data);
  if (data) event.custom_data = data;
  return event;
}

async function sendEvent(event, { fetchImpl = global.fetch, testEventCode } = {}) {
  const { datasetId, accessToken } = config();
  if (!datasetId || !accessToken) throw Object.assign(new Error("Meta Conversions API no configurada"), { statusCode: 503 });
  const url = new URL(`${GRAPH_HOST}/${encodeURIComponent(GRAPH_VERSION())}/${encodeURIComponent(datasetId)}/events`);
  url.searchParams.set("access_token", accessToken);
  const body = { data: [event] };
  if (testEventCode && /^[A-Za-z0-9_-]{3,64}$/.test(String(testEventCode))) body.test_event_code = String(testEventCode);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Object.assign(new Error("Meta rechazó el evento"), { statusCode: 502, metaCode: result?.error?.code, fbtraceId: result?.fbtrace_id });
    throw error;
  }
  return { eventsReceived: Number(result?.events_received) || 0, fbtraceId: result?.fbtrace_id || null };
}

module.exports = { ACTION_SOURCES, EVENT_NAMES, buildEvent, config, customData, eventSourceUrl, eventTime, hashEmail, hashPhone, sendEvent, sha256 };
