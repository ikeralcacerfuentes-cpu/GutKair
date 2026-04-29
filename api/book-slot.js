// api/book-slot.js
// Crea una solicitud de cita para el slot seleccionado.
// NOTA: La API v2 de Calendly no expone directamente un endpoint simple
// para crear un evento desde un available_time.
// Este endpoint registra la reserva en Supabase y, si existe scheduling_url,
// envía emails al profesional y al paciente.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function insertBooking(data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/citas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Supabase insert error: ${body}`);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { professional_id, slot, name, email, uid, lang } = req.body || {};

  if (!professional_id || !slot || !slot.start_time || !name || !email) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  let professionals = [];

  try {
    professionals = JSON.parse(process.env.PROFESSIONALS_JSON || '[]');
  } catch (_) {
    professionals = [];
  }

  const pro = professionals.find((p) => p.id === professional_id);

  try {
    await insertBooking({
      uid: uid || null,
      professional_id,
      professional_name: pro ? pro.name : professional_id,
      specialty: pro ? pro.specialty : null,
      patient_name: name,
      patient_email: email,
      slot_start: slot.start_time,
      scheduling_url: slot.scheduling_url || null,
      status: 'pending',
      lang: lang || 'es',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('DB insert error:', err);
    return res.status(500).json({ error: 'Error guardando cita' });
  }

  if (slot.scheduling_url && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      const proEmail = process.env[`PRO_EMAIL_${professional_id}`];
      const appUrl = process.env.APP_URL || 'https://kair.app';

      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safeProName = escapeHtml(pro ? pro.name : 'el especialista');
      const safeSchedulingUrl = escapeHtml(slot.scheduling_url);
      const safeAppUrl = escapeHtml(appUrl);

      const formattedDate = new Date(slot.start_time).toLocaleString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const safeFormattedDate = escapeHtml(formattedDate);

      if (proEmail) {
        await resend.emails.send({
          from: 'Kair <no-reply@kair.app>',
          to: proEmail,
          subject: `Nueva solicitud de cita — ${name}`,
          text:
`Hola,

Has recibido una nueva solicitud de cita a través de Kair.

Paciente: ${name}
Email: ${email}
Horario solicitado: ${new Date(slot.start_time).toLocaleString('es-ES')}

Para confirmar o gestionar la cita: ${slot.scheduling_url}

— Kair`,
          html:
`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
</head>
<body style="font-family:system-ui,sans-serif;background:#FAFAF8;padding:40px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #e8e8e4;padding:28px 24px;">
    <p style="font-size:0.88rem;color:#111820;margin-bottom:16px;font-weight:400;">
      Nueva solicitud de cita en <strong>Kair</strong>
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:0.82rem;color:#6b7280;">
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0ec;"><strong>Paciente</strong></td>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0ec;">${safeName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0ec;"><strong>Email</strong></td>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0ec;">${safeEmail}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;"><strong>Horario solicitado</strong></td>
        <td style="padding:6px 0;">${safeFormattedDate}</td>
      </tr>
    </table>

    <a href="${safeSchedulingUrl}" style="display:block;text-align:center;padding:11px 20px;background:#1B3A2A;color:#fff;text-decoration:none;border-radius:8px;font-size:0.84rem;font-weight:500;margin-bottom:14px;">
      Confirmar o gestionar cita
    </a>

    <p style="font-size:0.72rem;color:#9ca3af;line-height:1.5;text-align:center;">
      Este mensaje ha sido generado automáticamente por Kair. Si tienes alguna duda, escríbenos a hola@kair.app
    </p>
  </div>
</body>
</html>`,
        });
      }

      await resend.emails.send({
        from: 'Kair <no-reply@kair.app>',
        to: email,
        subject: 'Solicitud de cita enviada — Kair',
        text:
`Hola ${name},

Hemos recibido tu solicitud de cita con ${pro ? pro.name : 'el especialista'} el ${new Date(slot.start_time).toLocaleString('es-ES')}.

El profesional revisará tu solicitud y recibirás confirmación por correo electrónico.

— El equipo de Kair`,
        html:
`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
</head>
<body style="font-family:system-ui,sans-serif;background:#FAFAF8;padding:40px 16px;">
  <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #e8e8e4;padding:28px 24px;">
    <p style="font-size:0.88rem;color:#111820;margin-bottom:6px;">
      Hola <strong>${safeName}</strong>,
    </p>

    <p style="font-size:0.82rem;color:#6b7280;line-height:1.6;margin-bottom:20px;">
      Hemos recibido tu solicitud de cita con <strong>${safeProName}</strong>.
    </p>

    <div style="background:rgba(27,58,42,0.04);border-radius:10px;padding:14px 16px;margin-bottom:20px;font-size:0.82rem;color:#111820;">
      <strong>Horario solicitado</strong><br>
      ${safeFormattedDate}
    </div>

    <p style="font-size:0.78rem;color:#6b7280;line-height:1.6;">
      El profesional confirmará tu cita en las próximas horas. Recibirás un correo de confirmación cuando esté lista.
    </p>

    <p style="font-size:0.68rem;color:#9ca3af;margin-top:20px;">
      — El equipo de Kair · <a href="${safeAppUrl}" style="color:#1B3A2A;">kair.app</a>
    </p>
  </div>
</body>
</html>`,
      });
    } catch (emailErr) {
      console.error('Email error:', emailErr);
    }
  }

  return res.status(200).json({ ok: true });
};
