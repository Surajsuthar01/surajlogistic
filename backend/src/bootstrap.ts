import { asc } from 'drizzle-orm';
import type { Config } from './config';
import type { DB } from './db/client';
import { organizations } from './db/schema';
import { createCompany } from './lib/company';

/**
 * First start of an empty database: create the company and its owner from ADMIN_EMAIL and
 * ADMIN_PASSWORD. Runs only while there is no company at all, so restarting the server never
 * changes a password or adds a second owner.
 */
export async function ensureCompany(db: DB, cfg: Config['bootstrap'], homeSlug?: string): Promise<'created' | 'exists' | 'missing'> {
  const any = await db.select({ id: organizations.id }).from(organizations).orderBy(asc(organizations.createdAt)).limit(1);
  if (any.length) return 'exists';
  if (!cfg.adminEmail || !cfg.adminPassword) return 'missing';
  await createCompany(db, {
    orgName: cfg.companyName,
    slug: homeSlug,
    gstin: cfg.companyGstin ?? null,
    profile: {
      ...(cfg.companyPhone ? { phone: cfg.companyPhone } : {}),
      ...(cfg.companyCity ? { city: cfg.companyCity } : {}),
      ...(cfg.companyAddress ? { address: cfg.companyAddress } : {}),
      email: cfg.adminEmail,
    },
    owner: { name: cfg.adminName, email: cfg.adminEmail, password: cfg.adminPassword, phone: cfg.adminPhone ?? null },
  });
  return 'created';
}
