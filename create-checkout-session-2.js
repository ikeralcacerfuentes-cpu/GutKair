// api/create-checkout-session.js
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const PRICE_IDS = {
  bloom: process.env.STRIPE_PRICE_BLOOM || 'price_bloom_placeholder',
  root:  process.env.STRIPE_PRICE_ROOT  || 'price_root_placeholder',
};

const APP_URL = process.env.APP_URL || 'https://kair.app';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan, uid } = req.body;

  if (!plan || !uid) {
    return res.status(400).json({ error: 'plan y uid son obligatorios' });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(400).json({ error: 'Plan no válido' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { kair_uid: uid, kair_plan: plan },
      subscription_data: { metadata: { kair_uid: uid, kair_plan: plan } },
      success_url: `${APP_URL}?stripe_success=1&plan=${plan}`,
      cancel_url:  `${APP_URL}?stripe_cancel=1`,
      locale: 'auto',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Error creando sesión de pago' });
  }
};
