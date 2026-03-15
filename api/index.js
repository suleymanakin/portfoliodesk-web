/**
 * Vercel Serverless Function — Express API'yi /api/* altında sunar.
 * Yerel çalıştırmada kullanılmaz; sadece Vercel deploy'da devreye girer.
 * Hata durumunda her zaman JSON dönülür (HTML hata sayfası önlenir).
 */
import app from '../backend/src/app.js';

function sendJsonError(res, status, message) {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json({ success: false, error: message });
  }
}

export default function handler(req, res) {
  try {
    app(req, res);
  } catch (err) {
    sendJsonError(res, 500, err.message || 'Sunucu hatası.');
  }
}
