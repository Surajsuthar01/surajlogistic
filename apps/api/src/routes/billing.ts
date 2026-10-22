import type { FastifyInstance } from 'fastify';
import { financialYear, findCity, invoiceNumber, INVOICE_STATUSES } from '@suraj/core';
import { z } from 'zod';
import { customers, invoices, shipments } from '../db/schema';
import { and, asc, desc, eq, inArray, isNull, sql } from '../lib/deps';
import { badRequest, me, notFound, requireRole, ser } from '../lib/util';

export async function billingRoutes(app: FastifyInstance) {
  const { db } = app;
  const staff = [app.authenticate, requireRole('admin', 'ops')];

  app.get('/api/customers', { preHandler: staff }, async (req) => ser(await db.select().from(customers).where(eq(customers.orgId, me(req).orgId)).orderBy(asc(customers.name))));

  app.post('/api/customers', { preHandler: staff }, async (req, reply) => {
    const b = z
      .object({ name: z.string().min(2).max(120), gstin: z.string().regex(/^\d{2}[A-Z0-9]{13}$/, 'GSTIN must be 15 characters').optional(), phone: z.string().max(20).optional(), email: z.email().optional(), city: z.string().refine((c) => !!findCity(c), 'Unknown city') })
      .parse(req.body);
    const [row] = await db.insert(customers).values({ ...b, gstin: b.gstin ?? null, phone: b.phone ?? null, email: b.email ?? null, city: findCity(b.city)!.name, orgId: me(req).orgId }).returning();
    reply.status(201);
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

  app.get('/api/invoices', { preHandler: staff }, async (req) => ser(await db.select().from(invoices).where(eq(invoices.orgId, me(req).orgId)).orderBy(desc(invoices.createdAt))));

  app.get('/api/invoices/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const orgId = me(req).orgId;
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)));
    if (!inv) throw notFound('Invoice not found');
    const lines = inv.shipmentIds.length ? await db.select().from(shipments).where(and(eq(shipments.orgId, orgId), inArray(shipments.id, inv.shipmentIds))) : [];
    return { ...ser(inv), lines: lines.map((s) => ({ awb: s.awb, service: s.service, lane: `${s.originCity} → ${s.destCity}`, weightKg: s.weightKg, gstRate: s.gstRate, taxable: Math.round((s.price * 100) / (100 + s.gstRate)), total: s.price, deliveredAt: s.deliveredAt?.toISOString() })) };
  });

  app.post('/api/invoices', { preHandler: staff }, async (req, reply) => {
    const b = z.object({ shipmentIds: z.array(z.string().uuid()).min(1).max(500), dueInDays: z.number().int().min(0).max(120).default(15) }).parse(req.body);
    const orgId = me(req).orgId;
    const list = await db.select().from(shipments).where(and(eq(shipments.orgId, orgId), inArray(shipments.id, b.shipmentIds)));
    if (list.length !== b.shipmentIds.length) throw badRequest('Some shipments were not found');
    if (list.some((s) => s.status !== 'DELIVERED')) throw badRequest('Only delivered shipments can be invoiced');
    if (list.some((s) => s.invoiceId)) throw badRequest('Some shipments are already invoiced');
    const shipper = new Set(list.map((s) => s.customerId ?? s.shipperName));
    if (shipper.size > 1) throw badRequest('All shipments on one invoice must be for the same customer');
    const first = list[0]!;
    const [cust] = first.customerId ? await db.select().from(customers).where(eq(customers.id, first.customerId)) : [undefined];
    const subtotal = list.reduce((a, s) => a + Math.round((s.price * 100) / (100 + s.gstRate)), 0);
    const total = list.reduce((a, s) => a + s.price, 0);
    const gst = total - subtotal;
    const rates = new Set(list.map((s) => s.gstRate));
    const now = new Date();
    const fy = financialYear(now);
    const [{ n }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), sql`${invoices.invoiceNo} like ${`SL/${fy}/%`}`))) as [{ n: number }];
    const due = new Date(now.getTime() + b.dueInDays * 86400_000).toISOString().slice(0, 10);
    const [inv] = await db
      .insert(invoices)
      .values({ orgId, invoiceNo: invoiceNumber(n + 1, now), customerName: cust?.name ?? first.shipperName, customerGstin: cust?.gstin ?? null, shipmentIds: list.map((s) => s.id), subtotal, gstRate: rates.size === 1 ? first.gstRate : Math.round((gst / Math.max(1, subtotal)) * 1000) / 10, gst, total, status: 'DRAFT', dueDate: due })
      .returning();
    await db.update(shipments).set({ invoiceId: inv!.id }).where(inArray(shipments.id, list.map((s) => s.id)));
    reply.status(201);
    return ser(inv);
  });

  app.patch('/api/invoices/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ status: z.enum(INVOICE_STATUSES) }).parse(req.body);
    const [row] = await db.update(invoices).set({ status: b.status }).where(and(eq(invoices.id, id), eq(invoices.orgId, me(req).orgId))).returning();
    if (!row) throw notFound('Invoice not found');
    return ser(row);
  });
}
