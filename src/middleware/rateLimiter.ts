import { Request, Response, NextFunction } from 'express';

export function createRateLimiter(maxRpm: number) {
  const clients = new Map<string, number[]>();
  const windowMs = 60_000;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of clients) {
      const filtered = timestamps.filter((t) => now - t < windowMs);
      if (filtered.length === 0) clients.delete(key);
      else clients.set(key, filtered);
    }
  }, 60_000);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const timestamps = (clients.get(ip) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= maxRpm) {
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      res.status(429).json({
        error: 'Rate limit exceeded',
        error_code: 'RATE_LIMITED',
        retry_after_seconds: retryAfter,
      });
      return;
    }

    timestamps.push(now);
    clients.set(ip, timestamps);
    next();
  };
}
