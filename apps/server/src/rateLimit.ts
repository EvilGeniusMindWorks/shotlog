// Light in-memory rate limits for the PUBLIC endpoints (enroll, forgot/reset
// password, sign-in, refresh). One server instance, and the goal is to blunt
// casual abuse and password guessing, not to be a WAF.
//
// S10 (2026-09-09): sign-in is keyed by IP + email so a guessing script on
// one account cannot lock the whole crew out, and `trust proxy` in index.ts
// makes `req.ip` the real client behind Railway's load balancer.
import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

export interface RateLimitOptions {
  /** Requests allowed per key per minute */
  limit: number;
  /** What a bucket is keyed on — defaults to the client IP */
  keyOf?: (req: Request) => string;
  /** Name for the error body and the per-limiter store */
  name?: string;
}

export function makeRateLimit(opts: RateLimitOptions) {
  const hits = new Map<string, Bucket>();
  const keyOf = opts.keyOf ?? ((req: Request) => req.ip ?? 'unknown');
  const rateLimited = function rateLimited(req: Request, res: Response, next: NextFunction): void {
    const key = keyOf(req);
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    if (++entry.count > opts.limit) {
      res.status(429).json({ error: 'slow down', retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) });
      return;
    }
    next();
  };
  /** Forget a key's count — a successful sign-in clears its failures, so the
   *  limit throttles guessing, not a crew that signs in often */
  rateLimited.reset = (req: Request) => {
    hits.delete(keyOf(req));
  };
  return rateLimited;
}

/** The original public-endpoint limit: 20 per IP per minute */
export const rateLimit = makeRateLimit({ limit: 20, name: 'public' });

/** Sign-in: 10 attempts per minute per IP + email (lower-cased) */
export const loginRateLimit = makeRateLimit({
  limit: 10,
  name: 'login',
  keyOf: (req) => `${req.ip ?? 'unknown'}|${String((req.body as { email?: unknown })?.email ?? '').toLowerCase()}`,
});

/** Token refresh: generous per-IP cap — a crew's devices refresh hourly */
export const refreshRateLimit = makeRateLimit({ limit: 60, name: 'refresh' });
