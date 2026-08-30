const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("./groq");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("uses the current Groq model without exposing the API key", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.GROQ_API_KEY = "groq-test";
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes("/auth/v1/user")) return { ok: true };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Consejo listo" } }] }),
    };
  };

  const req = { method: "POST", headers: { authorization: "Bearer user-token" }, body: { mode: "advisor", messages: [{ role: "user", content: "Analiza hoy" }] } };
  const res = responseRecorder();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.content, "Consejo listo");
  const groqRequest = JSON.parse(calls[1].options.body);
  assert.equal(groqRequest.model, "openai/gpt-oss-120b");
  assert.equal(calls[1].options.headers.Authorization, "Bearer groq-test");
  global.fetch = originalFetch;
});

test("rejects requests without a RutaFlow session", async () => {
  const req = { method: "POST", headers: {}, body: { mode: "advisor", messages: [{ role: "user", content: "Hola" }] } };
  const res = responseRecorder();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});
