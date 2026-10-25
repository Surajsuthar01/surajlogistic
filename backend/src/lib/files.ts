import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DB } from '../db/client';
import { files } from '../db/schema';
import { badRequest } from './util';

/** Photos we accept from phones, and how big they may be once decoded. */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 1_500_000;

/** Stored references look like "file:<uuid>"; links handed to browsers are signed and expire. */
export const FILE_PREFIX = 'file:';

export function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) throw badRequest('Send the photo as a base64 data URL');
  const mime = m[1]!.toLowerCase();
  if (!ALLOWED.has(mime)) throw badRequest('Only JPEG, PNG or WebP photos are accepted');
  const bytes = Buffer.from(m[2]!.replace(/\s+/g, ''), 'base64');
  if (!bytes.length) throw badRequest('The photo is empty');
  if (bytes.length > MAX_BYTES) throw badRequest('The photo is too large; keep it under 1.5 MB');
  // Check the first bytes really are the image type claimed.
  const sig = bytes.subarray(0, 12);
  const ok =
    (mime === 'image/jpeg' && sig[0] === 0xff && sig[1] === 0xd8) ||
    (mime === 'image/png' && sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) ||
    (mime === 'image/webp' && sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!ok) throw badRequest('That file is not the image it claims to be');
  return { mime, bytes };
}

export async function saveDataUrl(db: DB, orgId: string, kind: string, dataUrl: string, createdBy: string | null): Promise<string> {
  const { mime, bytes } = parseDataUrl(dataUrl);
  const [row] = await db.insert(files).values({ orgId, kind, mime, size: bytes.length, data: bytes, createdBy }).returning({ id: files.id });
  return FILE_PREFIX + row!.id;
}

function sign(secret: string, id: string, exp: number) {
  return createHmac('sha256', secret).update(`${id}.${exp}`).digest('base64url');
}

/** A link that works in an <img> tag for an hour, with no login header needed. */
export function signedFileUrl(secret: string, ref: string | null | undefined, ttlSec = 3600): string | null {
  if (!ref) return null;
  if (!ref.startsWith(FILE_PREFIX)) return ref;
  const id = ref.slice(FILE_PREFIX.length);
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `/api/files/${id}?exp=${exp}&sig=${sign(secret, id, exp)}`;
}

export function verifyFileSig(secret: string, id: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const want = Buffer.from(sign(secret, id, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
