const { adminRequest, allowAppOrigin, authenticate, findCustomerForUser, sendError } = require("./_shared.cjs");

module.exports = async function handler(req, res) {
  allowAppOrigin(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }
  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: "Sesión no válida." });
    const customer = await findCustomerForUser(user.id);
    if (!customer) return res.status(200).json({ manageable: false });
    const subscriptions = await adminRequest("billing_subscriptions", {
      query: `?user_id=eq.${encodeURIComponent(user.id)}&status=in.(active,trialing,past_due,unpaid,paused)&select=stripe_subscription_id&limit=1`,
    });
    return res.status(200).json({ manageable: Boolean(subscriptions?.length) });
  } catch (error) {
    return sendError(res, error);
  }
};
