import { apiUrl } from "./apiClient";

function eventId(prefix, value) {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value || "anonymous"}-${id}`;
}

export async function trackMetaEvent(session, event) {
  if (!session?.access_token || !event?.event_name) return false;
  try {
    const response = await fetch(apiUrl("/api/meta/conversions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(event),
      keepalive: true,
    });
    return response.ok;
  } catch (error) {
    // La medición nunca debe romper el login o el registro.
    console.warn("Ruleto Meta event tracking failed", error?.message || error);
    return false;
  }
}

export function makeMetaEventId(prefix, value) {
  return eventId(prefix, value);
}
