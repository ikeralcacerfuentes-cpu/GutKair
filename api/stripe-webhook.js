// api/stripe-webhook.js
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET       = process.env.STRIPE_WEBHOOK_SECRET;

async function updatePerfil(uid, data) {
  const url = `${SUPABASE_URL}/rest/v1/perfiles?uid=eq.${encodeURIComponent(uid)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase PATCH error: ${body}`);
  }
}

module.exports = {
  config: { api: { bodyParser: false } },
  default: async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const uid  = session.metadata?.kair_uid;
          const plan = session.metadata?.kair_plan;
          if (!uid || !plan) break;
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          await updatePerfil(uid, {
            plan,
            stripe_customer_id:     session.customer,
            stripe_subscription_id: session.subscription,
            plan_expires_at:        expiresAt.toISOString(),
          });
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          if (invoice.billing_reason !== 'subscription_cycle') break;
          const sub = await stripe.subscriptions.retrieve(invoice.subscription);
          const uid = sub.metadata?.kair_uid;
          if (!uid) break;
          await updatePerfil(uid, { plan_expires_at: new Date(sub.current_period_end * 1000).toISOString() });
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const uid = sub.metadata?.kair_uid;
          if (!uid) break;
          await updatePerfil(uid, { plan: 'seed', stripe_subscription_id: null, plan_expires_at: null });
          break;
        }
        case 'invoice.payment_failed':
          console.warn(`Pago fallido — invoice ${event.data.object.id}`);
          break;
        default:
          break;
      }
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Error procesando webhook:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
};
