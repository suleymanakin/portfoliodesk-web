/**
 * Ortam değişkenlerini .env dosyasından yükler.
 * Vercel'de çalıştırmıyoruz; Vercel zaten env'leri enjekte ediyor ve dotenv paketi
 * serverless bundle'da olmayabilir.
 */
if (typeof process.env.VERCEL === 'undefined') {
  await import('dotenv/config');
}
