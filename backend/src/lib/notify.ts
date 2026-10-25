import type { OrgNotify } from '@suraj/shared';
import type { DB } from '../db/client';
import { messages, organizations } from '../db/schema';
import { desc, eq } from './deps';
import { ser } from './util';

/** Which org setting switches each template on or off. Templates not listed always go. */
const SWITCH: Record<string, keyof OrgNotify> = {
  booking_confirmed: 'booked',
  out_for_delivery: 'outForDelivery',
  delivered: 'delivered',
  ndr_reschedule: 'failed',
};

/**
 * Send a WhatsApp/SMS. In mock mode the message is only recorded; plug a WhatsApp
 * Business API provider in here and keep the row as the delivery log.
 */
export async function sendMessage(db: DB, orgId: string, to: string, template: string, text: string, opts: { shipmentId?: string; channel?: 'whatsapp' | 'sms' } = {}) {
  const key = SWITCH[template];
  if (key) {
    const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
    if (o?.settings.notify?.[key] === false) return null;
  }
  const [row] = await db
    .insert(messages)
    .values({ orgId, to, template, text, channel: opts.channel ?? 'whatsapp', status: 'SENT', shipmentId: opts.shipmentId ?? null })
    .returning();
  return ser(row);
}

export async function recentMessages(db: DB, orgId: string, limit = 200) {
  const rows = await db.select().from(messages).where(eq(messages.orgId, orgId)).orderBy(desc(messages.at)).limit(limit);
  return ser(rows);
}
