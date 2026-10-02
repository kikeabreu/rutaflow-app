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
      query: `?user_id=eq.${encodeURIComponent(user.id)}&status=in.(active,trialing,past_due,unpaid,paused)&select=stripe_subscription_id,status,price_id,current_period_end,cancel_at_period_end&order=updated_at.desc&limit=1`,
    });
    const subscription = subscriptions?.[0] || null;
    const monthly = process.env.STRIPE_PRICE_ID_MONTHLY || "";
    const annual = process.env.STRIPE_PRICE_ID_ANNUAL || "";
    const interval = subscription?.price_id && subscription.price_id === annual ? "annual" : subscription?.price_id && subscription.price_id === monthly ? "monthly" : null;
    return res.status(200).json({
      manageable: Boolean(subscription),
      subscription: subscription ? {
        status: subscription.status,
        interval,
        price_id: subscription.price_id || null,
        current_period_end: subscription.current_period_end || null,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        can_upgrade_annual: interval === "monthly" && Boolean(annual),
      } : null,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
