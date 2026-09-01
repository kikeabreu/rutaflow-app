const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/groq");

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

test("uses strict structured output for quick-entry parsing", async () => {
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
      json: async () => ({ choices: [{ message: { content: '{"type":"dead_km","fare":0,"trip_km":0,"dead_km":12,"amount":0,"liters":0,"tank_liters":0,"odometer":0,"platform":"otra","note":""}' } }] }),
    };
  };

  try {
    const req = { method: "POST", headers: { authorization: "Bearer user-token" }, body: { mode: "parser", messages: [{ role: "user", content: "12 km sin pasajero" }] } };
    const res = responseRecorder();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const groqRequest = JSON.parse(calls[1].options.body);
    assert.equal(groqRequest.model, "openai/gpt-oss-20b");
    assert.equal(groqRequest.response_format.type, "json_schema");
    assert.equal(groqRequest.response_format.json_schema.strict, true);
    assert.equal(groqRequest.response_format.json_schema.schema.additionalProperties, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("preserves image content for vision requests", async () => {
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
      json: async () => ({ choices: [{ message: { content: '{"fare":120,"pickup_km":0,"pickup_min":0,"dest_km":7,"dest_min":18}' } }] }),
    };
  };

  try {
    const req = {
      method: "POST",
      headers: { authorization: "Bearer user-token" },
      body: {
        mode: "vision",
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,abc" } },
          { type: "text", text: "Extrae el viaje" },
        ] }],
      },
    };
    const res = responseRecorder();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    const groqRequest = JSON.parse(calls[1].options.body);
    assert.equal(groqRequest.model, "qwen/qwen3.6-27b");
    assert.equal(groqRequest.messages[1].content[0].type, "image_url");
    assert.equal(groqRequest.messages[1].content[0].image_url.url, "data:image/jpeg;base64,abc");
  } finally {
    global.fetch = originalFetch;
  }
});

test("continues advisor responses that reach the token limit", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.GROQ_API_KEY = "groq-test";
  let completionCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes("/auth/v1/user")) return { ok: true };
    completionCount += 1;
    return {
      ok: true,
      json: async () => completionCount === 1
        ? { choices: [{ message: { content: "Primera parte" }, finish_reason: "length" }] }
        : { choices: [{ message: { content: "Segunda parte" }, finish_reason: "stop" }] },
    };
  };

  try {
    const req = { method: "POST", headers: { authorization: "Bearer user-token" }, body: { mode: "advisor", messages: [{ role: "user", content: "Analiza mi jornada" }] } };
    const res = responseRecorder();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.content, "Primera parte\n\nSegunda parte");
    assert.equal(completionCount, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
