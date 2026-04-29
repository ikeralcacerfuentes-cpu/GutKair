// api/config.js
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(200).json({
    SUPABASE_URL:           process.env.SUPABASE_URL           || '',
    SUPABASE_ANON_KEY:      process.env.SUPABASE_ANON_KEY      || '',
    GEMINI_API_KEY:         process.env.GEMINI_API_KEY         || '',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',

    // Configuración de profesionales.
    // Este JSON se define como variable de entorno en Vercel.
    // No incluir aquí tokens privados de Calendly.
    PROFESSIONALS_JSON:     process.env.PROFESSIONALS_JSON     || '[]',
  });
};
