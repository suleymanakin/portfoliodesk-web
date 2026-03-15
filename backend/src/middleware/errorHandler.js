/**
 * Global error handler middleware.
 * Express'e 4 argümanlı middleware olarak tanınır.
 */
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  } else {
    console.error(`[ERROR] ${status} - ${message}`);
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 handler — tüm route'lardan sonra mount edilir.
 */
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}
