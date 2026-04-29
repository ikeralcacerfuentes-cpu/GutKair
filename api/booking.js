// api/booking.js
// Devuelve slots disponibles de Calendly para un profesional dado.
// El professional_id viene del frontend; el token de Calendly y el
// event_type_uri viven únicamente en variables de entorno del servidor.

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { professional_id } = req.query;

  if (!professional_id) {
    return res.status(400).json({ error: 'professional_id requerido' });
  }

  // Mapeo professional_id → credenciales Calendly, solo en servidor.
  // Variables esperadas en Vercel:
  // CALENDLY_TOKEN_pro_001
  // CALENDLY_EVENT_URI_pro_001
  const token = process.env[`CALENDLY_TOKEN_${professional_id}`];
  const eventUri = process.env[`CALENDLY_EVENT_URI_${professional_id}`];

  if (!token || !eventUri) {
    return res.status(200).json({ slots: [] });
  }

  try {
    const meRes = await fetch('https://api.calendly.com/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!meRes.ok) {
      throw new Error('Calendly auth failed');
    }

    const meData = await meRes.json();
    const userUri = meData.resource.uri;

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);

    const params = new URLSearchParams({
      user: userUri,
      event_type: eventUri,
      min_start_time: now.toISOString(),
      max_start_time: end.toISOString(),
      status: 'active',
    });

    const slotsRes = await fetch(
      `https://api.calendly.com/event_type_available_times?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!slotsRes.ok) {
      const errBody = await slotsRes.text();
      console.error('Calendly slots error:', errBody);
      return res.status(200).json({ slots: [] });
    }

    const slotsData = await slotsRes.json();

    const slots = (slotsData.collection || []).map((s) => ({
      start_time: s.start_time,
      scheduling_url: s.scheduling_url || null,
      status: s.status,
    }));

    return res.status(200).json({ slots });
  } catch (err) {
    console.error('booking.js error:', err);
    return res.status(200).json({ slots: [] });
  }
};
