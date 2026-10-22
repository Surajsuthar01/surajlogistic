import bcrypt from 'bcryptjs';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_GST, MODULES, ROLES } from '@suraj/core';
import { z } from 'zod';
import { customers, drivers, organizations, users } from '../db/schema';
import { badRequest, HttpError, me, requireRole, ser } from '../lib/util';

const Register = z.object({
  orgName: z.string().min(2).max(120),
  name: z.string().min(2).max(80),
  email: z.email(),
  password: z.string().min(8).max(100),
  phone: z.string().max(20).optional(),
  gstin: z.string().max(15).optional(),
});

const Login = z.object({ email: z.email(), password: z.string().min(1) });

const NewUser = z.object({
  name: z.string().min(2).max(80),
  email: z.email(),
  password: z.string().min(8).max(100),
  phone: z.string().max(20).optional(),
  role: z.enum(ROLES),
  lang: z.enum(['en', 'hi']).default('en'),
  customerId: z.string().uuid().optional(),
  /** For drivers: link to an existing driver record. */
  driverId: z.string().uuid().optional(),
});

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'org'
  );
}

export async function authRoutes(app: FastifyInstance) {
  const { db } = app;

  const issue = (u: { id: string; orgId: string; role: string; name: string; customerId?: string | null }) =>
    app.jwt.sign({ sub: u.id, orgId: u.orgId, role: u.role as any, name: u.name, customerId: u.customerId ?? null });

  app.post('/api/auth/register', async (req, reply) => {
    const body = Register.parse(req.body);
    const email = body.email.toLowerCase();
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists.length) throw new HttpError(409, 'An account with this email already exists', 'conflict');
    let slug = slugify(body.orgName);
    const taken = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
    if (taken.length) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const [org] = await db
      .insert(organizations)
      .values({ name: body.orgName, slug, gstin: body.gstin ?? null, plan: 'Free', modules: [...MODULES], settings: { dieselPrice: 90, gst: DEFAULT_GST } })
      .returning();
    const [user] = await db
      .insert(users)
      .values({ orgId: org!.id, name: body.name, email, phone: body.phone ?? null, role: 'admin', passwordHash: await bcrypt.hash(body.password, 10) })
      .returning();
    reply.status(201);
    return { token: issue(user!), user: publicUser(user!), org: ser(org) };
  });

  app.post('/api/auth/login', async (req) => {
    const body = Login.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) throw new HttpError(401, 'Wrong email or password', 'unauthorized');
    const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
    return { token: issue(user), user: publicUser(user), org: ser(org) };
  });

  app.get('/api/me', { preHandler: app.authenticate }, async (req) => {
    const u = me(req);
    const [user] = await db.select().from(users).where(eq(users.id, u.sub));
    const [org] = await db.select().from(organizations).where(eq(organizations.id, u.orgId));
    if (!user || !org) throw new HttpError(401, 'Please log in again', 'unauthorized');
    return { user: publicUser(user), org: ser(org) };
  });

  app.get('/api/users', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const rows = await db.select().from(users).where(eq(users.orgId, me(req).orgId)).orderBy(asc(users.createdAt));
    return rows.map(publicUser);
  });

  app.post('/api/users', { preHandler: [app.authenticate, requireRole('admin')] }, async (req, reply) => {
    const body = NewUser.parse(req.body);
    const orgId = me(req).orgId;
    const email = body.email.toLowerCase();
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists.length) throw new HttpError(409, 'An account with this email already exists', 'conflict');
    if (body.customerId) {
      const c = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, body.customerId), eq(customers.orgId, orgId)));
      if (!c.length) throw badRequest('Customer not found');
    }
    const [user] = await db
      .insert(users)
      .values({ orgId, name: body.name, email, phone: body.phone ?? null, role: body.role, lang: body.lang, customerId: body.customerId ?? null, passwordHash: await bcrypt.hash(body.password, 10) })
      .returning();
    if (body.role === 'driver' && body.driverId) {
      await db.update(drivers).set({ userId: user!.id }).where(and(eq(drivers.id, body.driverId), eq(drivers.orgId, orgId)));
    }
    reply.status(201);
    return publicUser(user!);
  });

  app.patch('/api/org/settings', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const body = z
      .object({
        dieselPrice: z.number().min(50).max(200).optional(),
        gstCourier: z.number().min(0).max(28).optional(),
        gstTransport: z.number().min(0).max(28).optional(),
        modules: z.array(z.enum(MODULES)).optional(),
      })
      .parse(req.body);
    const orgId = me(req).orgId;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const settings = { ...org!.settings };
    if (body.dieselPrice !== undefined) settings.dieselPrice = body.dieselPrice;
    settings.gst = { courier: body.gstCourier ?? settings.gst.courier, transport: body.gstTransport ?? settings.gst.transport };
    const [updated] = await db
      .update(organizations)
      .set({ settings, ...(body.modules ? { modules: body.modules } : {}) })
      .where(eq(organizations.id, orgId))
      .returning();
    return ser(updated);
  });
}

function publicUser(u: typeof users.$inferSelect) {
  const { passwordHash: _ignored, ...rest } = u;
  return ser(rest);
}
