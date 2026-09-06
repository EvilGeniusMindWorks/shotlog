// Light per-IP rate limit for the PUBLIC endpoints (enroll, forgot/reset
// password): 20 requests per IP per minute. In-memory on purpose — one
// server instance, and the goal is to blunt casual abuse, not to be a WAF.
import type { NextFunction, Request, Response } from 'express';

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (++entry.count > 20) {
    res.status(429).json({ error: 'slow down' });
    return;
  }
  next();
}
