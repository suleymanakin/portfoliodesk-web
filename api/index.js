/**
 * Vercel Serverless Function — Express API'yi /api/* altında sunar.
 * Yanıt gönderilene kadar Promise döndürür; hata olursa JSON ile döner.
 */
function sendJsonError(res, status, message) {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json({ success: false, error: message });
  }
}

export default async function handler(req, res) {
  const waitEnd = new Promise((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
  });

  try {
    const { default: app } = await import('../backend/src/app.js');
    app(req, res);
  } catch (err) {
    const msg = err?.message || String(err);
    sendJsonError(res, 500, `API başlatılamadı: ${msg}`);
  }

  await waitEnd;
}
