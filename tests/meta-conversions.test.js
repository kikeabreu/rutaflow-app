const test = require("node:test");
const assert = require("node:assert/strict");

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { this.ended = true; return this; },
  };
}

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

test("builds a controlled event and hashes email, phone, and external id", () => {
  const { buildEvent, sha256 } = require("../api/meta/_shared.cjs");
  const event = buildEvent({
    event_name: "CompleteRegistration",
    event_id: "registration-1234",
    action_source: "website",
    event_source_url: "https://app.ruleto.mx/?auth=register",
    custom_data: { currency: "mxn", value: 0, content_ids: ["ruleto-drive"] },
    fbp: "fb.1.1234567890.abcDEF",
  }, { id: "user-1", email: " User@Example.COM ", phone: "+52 (999) 123-4567" }, { "user-agent": "test-agent" }, 1760000000);

  assert.equal(event.event_name, "CompleteRegistration");
  assert.equal(event.event_time, 1760000000);
  assert.equal(event.user_data.em[0], sha256("user@example.com"));
  assert.equal(event.user_data.ph[0], sha256("529991234567"));
  assert.equal(event.user_data.external_id[0], sha256("user-1"));
  assert.equal(event.user_data.client_user_agent, "test-agent");
  assert.equal(event.custom_data.currency, "MXN");
  assert.equal(event.custom_data.value, 0);
  assert.equal(event.user_data.fbp, "fb.1.1234567890.abcDEF");
});

test("rejects arbitrary event names and untrusted source URLs", () => {
  const { buildEvent } = require("../api/meta/_shared.cjs");
  assert.throws(() => buildEvent({ event_name: "DeleteEverything", event_id: "event-1234" }, { id: "u" }), /event_name no permitido/);
  const event = buildEvent({ event_name: "Login", event_id: "login-1234", event_source_url: "https://evil.example/steal" }, { id: "u" });
  assert.equal(event.event_source_url, undefined);
});

test("sends only the server-built event and keeps the access token out of the body", async () => {
  process.env.META_DATASET_ID = "123456789";
  process.env.META_ACCESS_TOKEN = "secret-token";
  process.env.META_GRAPH_API_VERSION = "v26.0";
  const { sendEvent } = require("../api/meta/_shared.cjs");
  let request;
  const result = await sendEvent({ event_name: "Login", event_time: 1760000000, event_id: "login-1234", action_source: "app", user_data: { external_id: ["hash"] } }, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: "trace" }) };
    },
    testEventCode: "TEST123",
  });
  assert.deepEqual(result, { eventsReceived: 1, fbtraceId: "trace" });
  assert.match(request.url, /graph\.facebook\.com\/v26\.0\/123456789\/events/);
  assert.match(request.url, /access_token=secret-token/);
  assert.equal(JSON.parse(request.options.body).data.length, 1);
  assert.equal(JSON.parse(request.options.body).test_event_code, "TEST123");
  assert.equal(request.options.body.includes("secret-token"), false);
});

test("endpoint requires a Supabase session and forwards a validated event", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.META_DATASET_ID = "123456789";
  process.env.META_ACCESS_TOKEN = "secret-token";
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/user")) return { ok: true, json: async () => ({ id: "u1", email: "u@example.com" }) };
    return { ok: true, status: 200, json: async () => ({ events_received: 1 }) };
  };
  delete require.cache[require.resolve("../api/meta/conversions.js")];
  const handler = require("../api/meta/conversions.js");
  const res = response();
  await handler({ method: "POST", headers: { authorization: "Bearer user-token", origin: "https://app.ruleto.mx", "user-agent": "test" }, body: { event_name: "Login", event_id: "login-1234" } }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.accepted, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.body.includes("secret-token"), false);
});

test.after(() => {
  global.fetch = originalFetch;
  resetEnv();
});
