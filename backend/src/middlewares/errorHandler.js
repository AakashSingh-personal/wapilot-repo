import { log } from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  const isPayloadTooLarge = err?.status === 413 || err?.statusCode === 413 || err?.type === 'entity.too.large';
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '25mb';

  log('error', 'request_failed', {
    path: req.path,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
  const status = isPayloadTooLarge ? 413 : (err.statusCode || err.status || 500);
  const body = {
    error: isPayloadTooLarge
      ? `Payload too large. Reduce request body size or increase JSON_BODY_LIMIT (current: ${jsonBodyLimit}).`
      : (err.publicMessage || (status === 500 ? 'Internal server error' : err.message)),
  };
  if (process.env.NODE_ENV === 'development' && err.message) {
    body.detail = err.message;
  }
  res.status(status).json(body);
}
