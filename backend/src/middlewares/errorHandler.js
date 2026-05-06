import { log } from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  log('error', 'request_failed', {
    path: req.path,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
  const status = err.statusCode || err.status || 500;
  const body = {
    error: err.publicMessage || (status === 500 ? 'Internal server error' : err.message),
  };
  if (process.env.NODE_ENV === 'development' && err.message) {
    body.detail = err.message;
  }
  res.status(status).json(body);
}
