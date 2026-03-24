/**
 * Vercel Serverless Function — Express API'yi /api/* altında sunar.
 * Yanıt gönderilene kadar Promise döndürür; hata olursa JSON ile döner.
 */
import { execFile } from 'node:child_process';

let _migrationsEnsured = false;
let _migrationsPromise = null;

async function ensureMigrations() {
  if (_migrationsEnsured) return;
  if (_migrationsPromise) return _migrationsPromise;

  _migrationsPromise = new Promise((resolve, reject) => {
    const cwd = process.cwd();
    const prismaBin = `${cwd}/node_modules/.bin/prisma`;
    const args = ['migrate', 'deploy', '--schema=backend/prisma/schema.prisma'];

    execFile(
      prismaBin,
      args,
      {
        cwd,
        env: process.env,
        timeout: 10 * 60 * 1000,
      },
      (err, stdout, stderr) => {
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
        if (err) return reject(err);
        _migrationsEnsured = true;
        resolve();
      }
    );
  });

  return _migrationsPromise;
}

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
    // Schema kolonu eksikleri (örn. prod DB migration'ı uygulanmadıysa) oluşmasın diye
    // cold start'ta tek sefer migration çalıştırmayı deniyoruz.
    // Not: Vercel environment'da prisma wasm eksik kalırsa ENOENT verebiliyor;
    // bu durumda API'yi çalışır durumda tutmak için hatayı bastırıyoruz.
    try {
      await ensureMigrations();
    } catch (e) {
      console.warn('[migrations] skip:', e?.message || String(e));
    }

    const { default: app } = await import('../backend/src/app.js');
    app(req, res);
  } catch (err) {
    const msg = err?.message || String(err);
    sendJsonError(res, 500, `API başlatılamadı: ${msg}`);
  }

  await waitEnd;
}
