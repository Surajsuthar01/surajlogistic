import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@suraj/shared';
import { ZodError, type ZodType } from 'zod';

/** Turn Date values into ISO strings so DB rows match the shared @suraj/shared records. */
export function ser<T>(row: T): any {
  if (row === null || row === undefined) return row;
  if (row instanceof Date) return row.toISOString();
  if (Array.isArray(row)) return row.map(ser);
  if (typeof row === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[k] = ser(v);
    return out;
  }
  return row;
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what, 'not_found');
export const badRequest = (msg: string) => new HttpError(400, msg, 'bad_request');
export const forbidden = (msg = 'You do not have access to this') => new HttpError(403, msg, 'forbidden');

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function errorHandler(err: Error & { statusCode?: number; code?: string; validation?: unknown }, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) {
    return reply.status(400).send({ error: 'validation', message: 'Some fields are missing or invalid', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.code, message: err.message });
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  return reply.status(status).send({ error: err.code ?? 'error', message: status >= 500 ? 'Something went wrong on our side' : err.message });
}

export interface AuthUser {
  sub: string;
  orgId: string;
  role: Role;
  name: string;
  customerId?: string | null;
  /** Password version the login was issued under (see passwordChangedAt). */
  pv?: number;
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest) => {
    const u = req.user as AuthUser | undefined;
    if (!u || !roles.includes(u.role)) throw forbidden();
  };
}

export const me = (req: FastifyRequest) => req.user as AuthUser;

/** What the customer pays and what the trip earns are for the office, not the driver's phone. */
const DRIVER_HIDDEN = ['freightAmount', 'hireAmount', 'hireAdvance', 'hireSettledAt', 'pnl', 'price', 'priceBreakup', 'declaredValue', 'gstRate', 'invoiceId', 'deliveryOtp'] as const;
export function forDriver<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of DRIVER_HIDDEN) delete out[k];
  return out as T;
}
