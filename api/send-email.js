// api/send-email.js
const { Resend } = require('resend');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL              = process.env.APP_URL || 'https://kair.app';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email_required' });
  }

  const emailNorm = email.trim().toLowerCase();

  let perfil = null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/perfiles?email=eq.${encodeURIComponent(emailNorm)}&limit=1`;
    const r = await fetch(url, {
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    const data = await r.json();
    if (Array.isArray(data) && data.length > 0) perfil = data[0];
  } catch (e) {
    console.error('Supabase error:', e);
    return res.status(500).json({ error: 'db_error' });
  }

  // Respuesta neutral aunque no exista el email
  if (!perfil) return res.status(200).json({ ok: true });

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Kair <no-reply@kair.app>',
      to:   emailNorm,
      subject: 'Tu ID de Kair',
      text: `Hola,\n\nHas solicitado recuperar tu ID de Kair.\n\nTu ID es: ${perfil.uid}\n\nAccede aquí: ${APP_URL}\n\n— El equipo de Kair`,
      html: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head><body style="font-family:system-ui,sans-serif;background:#FAFAF8;margin:0;padding:40px 16px;"><div style="max-width:440px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e8e8e4;padding:32px 28px;"><p style="font-size:0.9rem;color:#6b7280;margin:0 0 20px;line-height:1.6;">Has solicitado recuperar tu ID de Kair.</p><div style="background:rgba(27,58,42,0.05);border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center;"><div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.14em;color:#9ca3af;margin-bottom:8px;">Tu ID personal</div><div style="font-size:1.5rem;font-weight:400;color:#1B3A2A;letter-spacing:0.1em;">${perfil.uid}</div></div><a href="${APP_URL}" style="display:block;text-align:center;padding:11px 20px;background:#1B3A2A;color:#fff;text-decoration:none;border-radius:8px;font-size:0.84rem;font-weight:500;">Acceder a la app</a></div></body></html>`,
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend error:', e);
    return res.status(500).json({ error: 'email_send_error' });
  }
};
