import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { MODULES, ROLES } from '@suraj/shared';
import { z } from 'zod';
import * as t from '../db/schema';
import { customers, drivers, joinRequests, organizations, users } from '../db/schema';
import { createCompany } from '../lib/company';
import { limiter } from '../lib/ratelimit';
import { badRequest, HttpError, me, notFound, requireRole, ser } from '../lib/util';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN, 'GSTIN should look like 08ABCDE1234F1Z5');
const phone10 = z
  .string()
  .transform((s) => s.replace(/\D/g, '').slice(-10))
  .refine((s) => /^[6-9]\d{9}$/.test(s), 'Enter a 10-digit Indian mobile number');

const Register = z.object({
  orgName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  password: z.string().min(8).max(100),
  phone: phone10.optional(),
  gstin: gstin.optional(),
});

/** Office staff log in with email; drivers with their mobile number. */
const Login = z.object({ email: z.string().trim().min(3).max(120), password: z.string().min(1).max(200) });

const NewUser = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  password: z.string().min(8).max(100),
  phone: phone10.optional(),
  role: z.enum(ROLES),
  lang: z.enum(['en', 'hi']).default('en'),
  customerId: z.string().uuid().optional(),
  /** For drivers: link to an existing driver record. */
  driverId: z.string().uuid().optional(),
});


// Ten tries per account and address in 15 minutes; five sign-ups an hour per address.
const loginLimit = limiter(10, 15 * 60_000);
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const signupLimit = limiter(5, 60 * 60_000);

function tooMany(retry: number) {
  return new HttpError(429, `Too many attempts. Try again in ${Math.ceil(retry / 60)} minutes.`, 'rate_limited');
}

export async function authRoutes(app: FastifyInstance) {
  const { db } = app;

  const issue = (u: { id: string; orgId: string; role: string; name: string; customerId?: string | null; passwordChangedAt?: Date | null }) =>
    app.jwt.sign({ sub: u.id, orgId: u.orgId, role: u.role as any, name: u.name, customerId: u.customerId ?? null, pv: u.passwordChangedAt?.getTime() ?? 0 });

  app.post('/api/auth/register', async (req, reply) => {
    if (!app.allowCompanySignup) throw new HttpError(403, 'New company accounts are closed. Ask to join as a truck owner, driver, customer or warehouse staff instead.', 'signup_closed');
    if (!signupLimit.hit(req.ip)) throw tooMany(signupLimit.retryAfter(req.ip));
    const body = Register.parse(req.body);
    const email = body.email.toLowerCase();
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists.length) throw new HttpError(409, 'An account with this email already exists', 'conflict');
    const { org, user } = await createCompany(db, { orgName: body.orgName, gstin: body.gstin ?? null, owner: { name: body.name, email, password: body.password, phone: body.phone ?? null } });
    reply.status(201);
    return { token: issue(user!), user: publicUser(user!), org: ser(org) };
  });

  app.post('/api/auth/login', async (req) => {
    const body = Login.parse(req.body);
    const id = body.email.toLowerCase();
    const key = `${req.ip}|${id}`;
    if (!loginLimit.hit(key)) throw tooMany(loginLimit.retryAfter(key));
    const digits = id.replace(/\D/g, '');
    const byPhone = !id.includes('@') && digits.length >= 10;
    const found = byPhone ? await db.select().from(users).where(eq(users.phone, digits.slice(-10))) : await db.select().from(users).where(eq(users.email, id));
    if (found.length > 1) throw new HttpError(400, 'More than one login uses this mobile number. Log in with your email.', 'ambiguous');
    const user = found[0];
    // Compare against a dummy hash when nobody matches, so timing does not reveal which emails exist.
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user) {
      // Someone who asked to join gets told where their request stands, once they prove it is them.
      const asked = byPhone
        ? await db.select().from(joinRequests).where(eq(joinRequests.phone, digits.slice(-10))).orderBy(desc(joinRequests.createdAt)).limit(1)
        : await db.select().from(joinRequests).where(eq(joinRequests.email, id)).orderBy(desc(joinRequests.createdAt)).limit(1);
      const r = asked[0];
      if (r && r.status !== 'APPROVED' && (await bcrypt.compare(body.password, r.passwordHash))) {
        if (r.status === 'PENDING') throw new HttpError(403, 'Your request to join is waiting for approval. We will message you when your login is ready.', 'pending');
        throw new HttpError(403, `Your request to join was not approved${r.note ? `: ${r.note}` : ''}. Call us if you think this is a mistake.`, 'rejected');
      }
    }
    if (!user || !ok) throw new HttpError(401, 'Wrong email, mobile number or password', 'unauthorized');
    loginLimit.reset(key);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
    return { token: issue(user), user: publicUser(user), org: ser(org) };
  });

  app.get('/api/me', { preHandler: app.authenticate }, async (req) => {
    const u = me(req);
    if (u.sub.startsWith('apikey:')) {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, u.orgId));
      return { user: { id: u.sub, orgId: u.orgId, name: u.name, role: u.role, email: null, phone: null, lang: 'en' }, org: ser(org) };
    }
    const [user] = await db.select().from(users).where(eq(users.id, u.sub));
    const [org] = await db.select().from(organizations).where(eq(organizations.id, u.orgId));
    if (!user || !org) throw new HttpError(401, 'Please log in again', 'unauthorized');
    return { user: publicUser(user), org: ser(org) };
  });

  /** A person edits their own name, mobile and language. Email and role stay with the owner. */
  app.patch('/api/me', { preHandler: app.authenticate }, async (req) => {
    const u = me(req);
    if (u.sub.startsWith('apikey:')) throw new HttpError(403, 'An API key has no profile', 'forbidden');
    const b = z.object({ name: z.string().trim().min(2).max(80).optional(), phone: z.union([phone10, z.literal('')]).optional(), lang: z.enum(['en', 'hi']).optional() }).parse(req.body);
    const patch: Partial<typeof users.$inferInsert> = {};
    if (b.name) patch.name = b.name;
    if (b.phone !== undefined) {
      if (b.phone) {
        const clash = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, b.phone), ne(users.id, u.sub)));
        if (clash.length) throw new HttpError(409, 'Another login already uses this mobile number', 'conflict');
      }
      patch.phone = b.phone || null;
    }
    if (b.lang) patch.lang = b.lang;
    if (!Object.keys(patch).length) throw badRequest('Nothing to change');
    const [row] = await db.update(users).set(patch).where(eq(users.id, u.sub)).returning();
    if (!row) throw new HttpError(401, 'Please log in again', 'unauthorized');
    app.forgetUser(u.sub);
    return publicUser(row);
  });

  /** Change your own password; the current one is required. */
  app.post('/api/me/password', { preHandler: app.authenticate }, async (req) => {
    const u = me(req);
    if (u.sub.startsWith('apikey:')) throw new HttpError(403, 'An API key has no password', 'forbidden');
    const b = z.object({ current: z.string().min(1).max(100), next: z.string().min(8, 'Use at least 8 characters').max(100) }).parse(req.body);
    const key = `pw|${u.sub}`;
    if (!loginLimit.hit(key)) throw tooMany(loginLimit.retryAfter(key));
    const [row] = await db.select().from(users).where(eq(users.id, u.sub));
    if (!row || !(await bcrypt.compare(b.current, row.passwordHash))) throw new HttpError(400, 'Your current password is not right', 'bad_password');
    if (b.current === b.next) throw badRequest('Pick a password different from the current one');
    // Every other phone or browser signed in as this person is signed out; this one gets a fresh login.
    const [updated] = await db.update(users).set({ passwordHash: await bcrypt.hash(b.next, 10), passwordChangedAt: new Date() }).where(eq(users.id, u.sub)).returning();
    loginLimit.reset(key);
    app.forgetUser(u.sub);
    return { changed: true, token: issue(updated!) };
  });

  // ---------- People ----------

  app.get('/api/users', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const orgId = me(req).orgId;
    const rows = await db.select({ u: users, customerName: customers.name }).from(users).leftJoin(customers, eq(customers.id, users.customerId)).where(eq(users.orgId, orgId)).orderBy(asc(users.createdAt));
    return rows.map((r) => ({ ...publicUser(r.u), customerName: r.customerName ?? null }));
  });

  app.post('/api/users', { preHandler: [app.authenticate, requireRole('admin')] }, async (req, reply) => {
    const body = NewUser.parse(req.body);
    const orgId = me(req).orgId;
    const email = body.email.toLowerCase();
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists.length) throw new HttpError(409, 'An account with this email already exists', 'conflict');
    if (body.phone && body.role === 'driver') {
      const clash = await db.select({ id: users.id }).from(users).where(eq(users.phone, body.phone));
      if (clash.length) throw new HttpError(409, 'This mobile number already has a login', 'conflict');
    }
    if (body.role === 'customer' && !body.customerId) throw badRequest('Pick the customer this login belongs to');
    if (body.customerId) {
      const c = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, body.customerId), eq(customers.orgId, orgId)));
      if (!c.length) throw badRequest('Customer not found');
    }
    if (body.driverId) {
      const d = await db.select({ id: drivers.id, userId: drivers.userId }).from(drivers).where(and(eq(drivers.id, body.driverId), eq(drivers.orgId, orgId)));
      if (!d.length) throw badRequest('Driver not found');
      if (d[0]!.userId) throw new HttpError(409, 'This driver already has a login', 'conflict');
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

  app.patch('/api/users/:id', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ password: z.string().min(8).max(100).optional(), role: z.enum(['admin', 'ops', 'warehouse']).optional(), name: z.string().trim().min(2).max(80).optional() }).parse(req.body);
    const u = me(req);
    const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, u.orgId)));
    if (!target) throw notFound('Person not found');
    if (b.role && id === u.sub) throw badRequest('You cannot change your own role');
    if (b.role && !['admin', 'ops', 'warehouse'].includes(target.role)) throw badRequest('Drivers and customers keep their role');
    const patch: Partial<typeof users.$inferInsert> = {};
    if (b.password) {
      patch.passwordHash = await bcrypt.hash(b.password, 10);
      // The owner set a new password: the person's old logins stop working.
      patch.passwordChangedAt = new Date();
    }
    if (b.role) patch.role = b.role;
    if (b.name) patch.name = b.name;
    const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    app.forgetUser(id);
    return publicUser(row!);
  });

  app.delete('/api/users/:id', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    if (id === u.sub) throw badRequest('You cannot remove your own login');
    const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, u.orgId)));
    if (!target) throw notFound('Person not found');
    if (target.role === 'admin') {
      const others = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, u.orgId), eq(users.role, 'admin'), ne(users.id, id)));
      if (!others.length) throw badRequest('The company needs at least one owner');
    }
    await db.update(drivers).set({ userId: null }).where(and(eq(drivers.orgId, u.orgId), eq(drivers.userId, id)));
    await db.delete(users).where(eq(users.id, id));
    // Their tokens stop working on the next request.
    app.forgetUser(id);
    return { removed: true };
  });

  // ---------- Company ----------

  app.patch('/api/org/settings', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const text = (max: number) => z.string().trim().max(max);
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        gstin: z.union([gstin, z.literal(''), z.null()]).optional(),
        dieselPrice: z.number().min(50).max(200).optional(),
        gstCourier: z.number().min(0).max(40).optional(),
        gstTransport: z.number().min(0).max(40).optional(),
        modules: z.array(z.enum(MODULES)).optional(),
        profile: z.object({ address: text(300).optional(), city: text(60).optional(), phone: text(20).optional(), email: z.union([z.email(), z.literal('')]).optional() }).optional(),
        bank: z.object({ name: text(120).optional(), account: z.string().regex(/^\d{0,18}$/, 'Account number is digits only').optional(), ifsc: z.union([z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks like SBIN0001234'), z.literal('')]).optional(), upi: z.union([z.string().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'UPI ID looks like name@bank'), z.literal('')]).optional() }).optional(),
        notify: z.object({ booked: z.boolean().optional(), outForDelivery: z.boolean().optional(), delivered: z.boolean().optional(), failed: z.boolean().optional() }).optional(),
        paymentTermsDays: z.number().int().min(0).max(180).optional(),
      })
      .parse(req.body);
    const orgId = me(req).orgId;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const settings = { ...org!.settings };
    if (body.dieselPrice !== undefined) settings.dieselPrice = body.dieselPrice;
    settings.gst = { courier: body.gstCourier ?? settings.gst.courier, transport: body.gstTransport ?? settings.gst.transport };
    if (body.profile) settings.profile = { ...settings.profile, ...body.profile };
    if (body.bank) settings.bank = { ...settings.bank, ...body.bank };
    if (body.notify) settings.notify = { ...settings.notify, ...body.notify };
    if (body.paymentTermsDays !== undefined) settings.paymentTermsDays = body.paymentTermsDays;
    const [updated] = await db
      .update(organizations)
      .set({ settings, ...(body.modules ? { modules: body.modules } : {}), ...(body.name ? { name: body.name } : {}), ...(body.gstin !== undefined ? { gstin: body.gstin || null } : {}) })
      .where(eq(organizations.id, orgId))
      .returning();
    return ser(updated);
  });

  /** Everything the company has with us, for the DPDP right to a copy. Passwords and file bytes stay out. */
  app.get('/api/org/export', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const orgId = me(req).orgId;
    const by = <T extends { orgId: unknown }>(table: any) => db.select().from(table).where(eq(table.orgId, orgId)) as Promise<T[]>;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const [us, cu, ve, dr, tr, sh, ev, lo, fa, it, mv, inv, msg, exp] = await Promise.all([
      by<typeof users.$inferSelect>(t.users),
      by(t.customers),
      by(t.vehicles),
      by(t.drivers),
      by(t.trips),
      by(t.shipments),
      by(t.shipmentEvents),
      by(t.loads),
      by(t.facilities),
      by(t.inventoryItems),
      by(t.stockMoves),
      by(t.invoices),
      by(t.messages),
      by(t.tripExpenses),
    ]);
    return ser({
      exportedAt: new Date(),
      org,
      users: us.map((u) => publicUser(u)),
      customers: cu,
      vehicles: ve,
      drivers: dr,
      trips: tr,
      shipments: sh,
      shipmentEvents: ev,
      loads: lo,
      facilities: fa,
      inventory: it,
      stockMoves: mv,
      invoices: inv,
      messages: msg,
      tripExpenses: exp,
    });
  });

  /** Deletes the company and everything in it. The owner must type the company name. */
  app.delete('/api/org', { preHandler: [app.authenticate, requireRole('admin')] }, async (req) => {
    const b = z.object({ confirm: z.string() }).parse(req.body ?? {});
    const orgId = me(req).orgId;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    if (!org || b.confirm.trim() !== org.name) throw badRequest('Type the company name exactly to confirm');
    await db.delete(organizations).where(eq(organizations.id, orgId));
    app.forgetUser();
    return { deleted: true };
  });
}

function publicUser(u: typeof users.$inferSelect) {
  const { passwordHash: _ignored, ...rest } = u;
  return ser(rest);
}

