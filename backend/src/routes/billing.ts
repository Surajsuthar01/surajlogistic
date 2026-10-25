import type { FastifyInstance } from 'fastify';
import { financialYear, findCity, invoiceNumber, INVOICE_STATUSES } from '@suraj/shared';
import { z } from 'zod';
import { customers, invoices, organizations, shipments, users } from '../db/schema';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from '../lib/deps';
import { sendMessage } from '../lib/notify';
import { badRequest, me, notFound, requireRole, ser } from '../lib/util';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DAY = 86400_000;

const CustomerBody = z.object({
  name: z.string().trim().min(2, 'Business name is needed').max(120),
  gstin: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => GSTIN.test(s), 'GSTIN should look like 08ABCDE1234F1Z5')
    .optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.email().optional(),
  city: z.string().refine((c) => !!findCity(c), 'Unknown city'),
  address: z.string().trim().max(300).optional(),
  creditDays: z.number().int().min(0).max(180).optional(),
});

const ORDER: Record<string, number> = { DRAFT: 0, SENT: 1, PAID: 2 };

export async function billingRoutes(app: FastifyInstance) {
  const { db } = app;
  const staff = [app.authenticate, requireRole('admin', 'ops')];

  /** Per-customer numbers for the list and the detail page. */
  async function customerStats(orgId: string, ids?: string[]) {
    const since = new Date(Date.now() - 30 * DAY);
    const shipWhere = [eq(shipments.orgId, orgId), sql`${shipments.customerId} is not null`];
    if (ids) shipWhere.push(inArray(shipments.customerId, ids));
    const ship = await db
      .select({
        id: shipments.customerId,
        n30: sql<number>`count(*) filter (where ${shipments.createdAt} >= ${since} and ${shipments.status} <> 'CANCELLED')::int`,
        rev30: sql<number>`coalesce(sum(${shipments.price}) filter (where ${shipments.createdAt} >= ${since} and ${shipments.status} <> 'CANCELLED'), 0)::int`,
        last: sql<Date | null>`max(${shipments.createdAt})`,
      })
      .from(shipments)
      .where(and(...shipWhere))
      .groupBy(shipments.customerId);
    const owed = await db
      .select({ id: invoices.customerId, name: invoices.customerName, total: sql<number>`coalesce(sum(${invoices.total}), 0)::int` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), ne(invoices.status, 'PAID')))
      .groupBy(invoices.customerId, invoices.customerName);
    const logins = await db
      .select({ id: users.customerId, n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.role, 'customer')))
      .groupBy(users.customerId);
    return (c: { id: string; name: string }) => {
      const s = ship.find((x) => x.id === c.id);
      const last = s?.last ? new Date(s.last).toISOString() : null;
      return {
        shipments30d: s?.n30 ?? 0,
        revenue30d: s?.rev30 ?? 0,
        // Invoices made before customers had ids are matched by name.
        outstanding: owed.filter((o) => o.id === c.id || (!o.id && o.name === c.name)).reduce((a, o) => a + o.total, 0),
        lastShipmentAt: last,
        logins: logins.find((l) => l.id === c.id)?.n ?? 0,
      };
    };
  }

  app.get('/api/customers', { preHandler: staff }, async (req) => {
    const q = z.object({ stats: z.string().optional() }).parse(req.query);
    const orgId = me(req).orgId;
    const rows = await db.select().from(customers).where(eq(customers.orgId, orgId)).orderBy(asc(customers.name));
    if (!q.stats) return ser(rows);
    const stats = await customerStats(orgId);
    return rows.map((c) => ({ ...ser(c), ...stats(c) }));
  });

  app.get('/api/customers/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const orgId = me(req).orgId;
    const [c] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.orgId, orgId)));
    if (!c) throw notFound('Customer not found');
    const stats = (await customerStats(orgId, [c.id]))(c);
    const recent = await db.select().from(shipments).where(and(eq(shipments.orgId, orgId), eq(shipments.customerId, c.id))).orderBy(desc(shipments.createdAt)).limit(20);
    const inv = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), or(eq(invoices.customerId, c.id), and(isNull(invoices.customerId), eq(invoices.customerName, c.name)))))
      .orderBy(desc(invoices.createdAt));
    const logins = await db.select().from(users).where(and(eq(users.orgId, orgId), eq(users.customerId, c.id)));
    return {
      ...ser(c),
      ...stats,
      shipments: recent.map(({ deliveryOtp: _o, ...s }) => ser(s)),
      invoices: ser(inv),
      users: logins.map(({ passwordHash: _p, ...u }) => ser(u)),
    };
  });

  app.post('/api/customers', { preHandler: staff }, async (req, reply) => {
    const b = CustomerBody.parse(req.body);
    const [row] = await db
      .insert(customers)
      .values({ orgId: me(req).orgId, name: b.name, gstin: b.gstin ?? null, phone: b.phone ?? null, email: b.email ?? null, city: findCity(b.city)!.name, address: b.address ?? null, creditDays: b.creditDays ?? null })
      .returning();
    reply.status(201);
    return ser(row);
  });

  app.patch('/api/customers/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = CustomerBody.partial().parse(req.body);
    const patch: Partial<typeof customers.$inferInsert> = {};
    if (b.name !== undefined) patch.name = b.name;
    if ('gstin' in b) patch.gstin = b.gstin ?? null;
    if ('phone' in b) patch.phone = b.phone || null;
    if ('email' in b) patch.email = b.email ?? null;
    if (b.city !== undefined) patch.city = findCity(b.city)!.name;
    if ('address' in b) patch.address = b.address || null;
    if ('creditDays' in b) patch.creditDays = b.creditDays ?? null;
    const [row] = await db.update(customers).set(patch).where(and(eq(customers.id, id), eq(customers.orgId, me(req).orgId))).returning();
    if (!row) throw notFound('Customer not found');
    return ser(row);
  });

  /** Delivered shipments that have not been invoiced yet, grouped by shipper. */
  app.get('/api/billing/unbilled', { preHandler: staff }, async (req) => {
    const rows = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.orgId, me(req).orgId), eq(shipments.status, 'DELIVERED'), isNull(shipments.invoiceId)))
      .orderBy(asc(shipments.shipperName));
    const groups = new Map<string, { shipperName: string; customerId: string | null; shipments: unknown[]; total: number }>();
    for (const s of rows) {
      const key = s.customerId ?? s.shipperName;
      const g = groups.get(key) ?? { shipperName: s.shipperName, customerId: s.customerId, shipments: [], total: 0 };
      g.shipments.push({ id: s.id, awb: s.awb, service: s.service, originCity: s.originCity, destCity: s.destCity, price: s.price, deliveredAt: s.deliveredAt?.toISOString() });
      g.total += s.price;
      groups.set(key, g);
    }
    return [...groups.values()];
  });

  /** Staff see every invoice; a customer login sees its own once they are sent. */
  async function visibleTo(req: Parameters<typeof me>[0]) {
    const u = me(req);
    if (u.role !== 'customer') return [eq(invoices.orgId, u.orgId)];
    if (!u.customerId) return null;
    const [c] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, u.customerId));
    return [eq(invoices.orgId, u.orgId), ne(invoices.status, 'DRAFT'), or(eq(invoices.customerId, u.customerId), and(isNull(invoices.customerId), eq(invoices.customerName, c?.name ?? '')))!];
  }

  app.get('/api/invoices', { preHandler: [app.authenticate, requireRole('admin', 'ops', 'customer')] }, async (req) => {
    const where = await visibleTo(req);
    if (!where) return [];
    return ser(await db.select().from(invoices).where(and(...where)).orderBy(desc(invoices.createdAt)));
  });

  app.get('/api/invoices/:id', { preHandler: [app.authenticate, requireRole('admin', 'ops', 'customer')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const where = await visibleTo(req);
    const [inv] = where ? await db.select().from(invoices).where(and(eq(invoices.id, id), ...where)) : [];
    if (!inv) throw notFound('Invoice not found');
    const [cust] = inv.customerId
      ? await db.select().from(customers).where(eq(customers.id, inv.customerId))
      : await db.select().from(customers).where(and(eq(customers.orgId, inv.orgId), eq(customers.name, inv.customerName)));
    const lines = inv.shipmentIds.length ? await db.select().from(shipments).where(and(eq(shipments.orgId, inv.orgId), inArray(shipments.id, inv.shipmentIds))) : [];
    return {
      ...ser(inv),
      customerCity: cust?.city ?? null,
      customerAddress: cust?.address ?? null,
      lines: lines.map((s) => ({ awb: s.awb, service: s.service, lane: `${s.originCity}–${s.destCity}`, weightKg: s.weightKg, gstRate: s.gstRate, taxable: Math.round((s.price * 100) / (100 + s.gstRate)), total: s.price, deliveredAt: s.deliveredAt?.toISOString() })),
    };
  });

  app.post('/api/invoices', { preHandler: staff }, async (req, reply) => {
    const b = z.object({ shipmentIds: z.array(z.string().uuid()).min(1).max(500), dueInDays: z.number().int().min(0).max(180).optional() }).parse(req.body);
    const orgId = me(req).orgId;
    const list = await db.select().from(shipments).where(and(eq(shipments.orgId, orgId), inArray(shipments.id, b.shipmentIds)));
    if (list.length !== new Set(b.shipmentIds).size) throw badRequest('Some shipments were not found');
    if (list.some((s) => s.status !== 'DELIVERED')) throw badRequest('Only delivered shipments can be invoiced');
    if (list.some((s) => s.invoiceId)) throw badRequest('Some shipments are already invoiced');
    if (new Set(list.map((s) => s.customerId ?? s.shipperName)).size > 1) throw badRequest('One invoice can only have one customer');
    const first = list[0]!;
    const [cust] = first.customerId ? await db.select().from(customers).where(eq(customers.id, first.customerId)) : [undefined];
    const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
    const subtotal = list.reduce((a, s) => a + Math.round((s.price * 100) / (100 + s.gstRate)), 0);
    const total = list.reduce((a, s) => a + s.price, 0);
    const gst = total - subtotal;
    const rates = new Set(list.map((s) => s.gstRate));
    const now = new Date();
    const fy = financialYear(now);
    const days = b.dueInDays ?? cust?.creditDays ?? org?.settings.paymentTermsDays ?? 15;
    const inv = await db.transaction(async (tx) => {
      // Numbers must run without gaps inside a financial year, so take a lock per company.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'invoice:' + orgId}))`);
      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), sql`${invoices.invoiceNo} like ${`SL/${fy}/%`}`))) as [{ n: number }];
      const [row] = await tx
        .insert(invoices)
        .values({
          orgId,
          invoiceNo: invoiceNumber(n + 1, now),
          customerId: cust?.id ?? null,
          customerName: cust?.name ?? first.shipperName,
          customerGstin: cust?.gstin ?? null,
          shipmentIds: list.map((s) => s.id),
          subtotal,
          gstRate: rates.size === 1 ? first.gstRate : Math.round((gst / Math.max(1, subtotal)) * 1000) / 10,
          gst,
          total,
          status: 'DRAFT',
          dueDate: new Date(now.getTime() + days * DAY).toISOString().slice(0, 10),
        })
        .returning();
      await tx.update(shipments).set({ invoiceId: row!.id }).where(inArray(shipments.id, list.map((s) => s.id)));
      return row!;
    });
    app.bus.emit(orgId, 'invoice.updated', { id: inv.id, invoiceNo: inv.invoiceNo, status: inv.status, total: inv.total });
    reply.status(201);
    return ser(inv);
  });

  app.patch('/api/invoices/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z
      .object({
        status: z.enum(INVOICE_STATUSES),
        paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        paymentMode: z.enum(['UPI', 'NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH']).optional(),
        paymentRef: z.string().trim().max(60).optional(),
      })
      .parse(req.body);
    const orgId = me(req).orgId;
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)));
    if (!inv) throw notFound('Invoice not found');
    if (ORDER[b.status]! < ORDER[inv.status]!) throw badRequest('An invoice cannot go back a step');
    const patch: Partial<typeof invoices.$inferInsert> = { status: b.status };
    if (b.status === 'PAID' && inv.status !== 'PAID') {
      const paid = b.paidAt ? new Date(`${b.paidAt}T12:00:00+05:30`) : new Date();
      if (paid.getTime() > Date.now() + DAY) throw badRequest('The payment date cannot be in the future');
      Object.assign(patch, { paidAt: paid, paymentMode: b.paymentMode ?? null, paymentRef: b.paymentRef || null });
    }
    const [row] = await db.update(invoices).set(patch).where(eq(invoices.id, id)).returning();
    if (b.status === 'SENT' && inv.status === 'DRAFT') {
      const [cust] = inv.customerId ? await db.select().from(customers).where(eq(customers.id, inv.customerId)) : [undefined];
      const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
      if (cust?.phone) await sendMessage(db, orgId, cust.phone, 'invoice_sent', `Invoice ${inv.invoiceNo} for ₹${inv.total.toLocaleString('en-IN')} from ${org?.name ?? 'us'}, due ${inv.dueDate}.`);
    }
    app.bus.emit(orgId, 'invoice.updated', { id: row!.id, invoiceNo: row!.invoiceNo, status: row!.status, total: row!.total });
    return ser(row);
  });
}
