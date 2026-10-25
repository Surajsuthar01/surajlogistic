import bcrypt from 'bcryptjs';
import { DEFAULT_GST, MODULES, type OrgProfile } from '@suraj/shared';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { organizations, users } from '../db/schema';

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'org'
  );
}

export interface NewCompany {
  orgName: string;
  slug?: string;
  gstin?: string | null;
  profile?: OrgProfile;
  owner: { name: string; email: string; password: string; phone?: string | null };
}

/** Creates a company with its first owner login. Used by sign-up and by the first start of a server. */
export async function createCompany(db: DB, c: NewCompany) {
  let slug = c.slug ? slugify(c.slug) : slugify(c.orgName);
  const taken = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
  if (taken.length) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const [org] = await db
    .insert(organizations)
    .values({
      name: c.orgName,
      slug,
      gstin: c.gstin ?? null,
      plan: 'Free',
      modules: [...MODULES],
      settings: { dieselPrice: 90, gst: DEFAULT_GST, paymentTermsDays: 15, ...(c.profile ? { profile: c.profile } : {}) },
    })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ orgId: org!.id, name: c.owner.name, email: c.owner.email.toLowerCase(), phone: c.owner.phone ?? null, role: 'admin', passwordHash: await bcrypt.hash(c.owner.password, 10) })
    .returning();
  return { org: org!, user: user! };
}
