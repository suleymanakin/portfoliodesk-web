/**
 * Vercel Serverless Function — Express API'yi /api/* altında sunar.
 * Yerel çalıştırmada kullanılmaz; sadece Vercel deploy'da devreye girer.
 */
import app from '../backend/src/app.js';

export default function handler(req, res) {
  return app(req, res);
}
