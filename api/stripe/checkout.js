// api/stripe/checkout.js
// Vercel Serverless Function to create a Stripe Checkout Session or Customer Portal

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ 
      error: 'Stripe no está configurado en el servidor (falta STRIPE_SECRET_KEY).' 
    });
  }

  try {
    const { userId, userEmail, action = 'checkout', returnUrl } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: 'Falta userId' });
    }

    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    const domain = returnUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://rutaflow-app.vercel.app';

    if (action === 'portal') {
      // Billing Customer Portal
      // First find customer by metadata or email
      const customers = await stripe.customers.search({
        query: `metadata['user_id']:'${userId}'`
      });

      let customerId = customers?.data?.[0]?.id;
      if (!customerId && userEmail) {
        const byEmail = await stripe.customers.list({ email: userEmail, limit: 1 });
        customerId = byEmail?.data?.[0]?.id;
      }

      if (!customerId) {
        return res.status(404).json({ error: 'No se encontró un cliente de Stripe para este usuario.' });
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${domain}/`
      });

      return res.status(200).json({ url: portalSession.url });
    }

    // Default: Checkout Session for Subscription
    const priceId = STRIPE_PRICE_ID || req.body?.priceId;
    if (!priceId) {
      return res.status(400).json({ 
        error: 'Falta configurar STRIPE_PRICE_ID en las variables de entorno.' 
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: userEmail || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        user_id: userId,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
        },
      },
      success_url: `${domain}/?session_id={CHECKOUT_SESSION_ID}&upgrade=success`,
      cancel_url: `${domain}/?upgrade=cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({ error: error.message || 'Error al iniciar sesión de Stripe' });
  }
}
