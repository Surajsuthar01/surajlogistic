import { MessageCircle, Search } from 'lucide-react';
import { useState } from 'react';
import { ButtonLink, Empty, Loading, PageHeader, Select, StatusMark } from '../components/ui';
import { useAuth } from '../lib/auth';
import { dt } from '../lib/format';
import { useApi } from '../lib/hooks';

interface Msg {
  id: string;
  to: string;
  template: string;
  text: string;
  at: string;
  channel: 'whatsapp' | 'sms';
  status?: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';
}

export const TEMPLATE_LABEL: Record<string, string> = {
  booking_confirmed: 'Booking confirmed',
  out_for_delivery: 'Out for delivery, with OTP',
  ndr_reschedule: 'Delivery failed, reschedule',
  delivered: 'Delivered',
  invoice_sent: 'Invoice sent',
  trip_assigned: 'Trip assigned to driver',
};

export function Messages() {
  const { user } = useAuth();
  const { data } = useApi<Msg[]>('/api/notifications', { liveTypes: ['shipment.status', 'shipment.created', 'invoice.updated'], debounceMs: 500 });
  const [tpl, setTpl] = useState('');
  const [q, setQ] = useState('');
  const list = (data ?? []).filter((m) => (!tpl || m.template === tpl) && (!q || m.to.includes(q) || m.text.toLowerCase().includes(q.toLowerCase())));
  const used = [...new Set((data ?? []).map((m) => m.template))];

  return (
    <div className="max-w-[960px]">
      <PageHeader
        title="Messages sent"
        sub="Every WhatsApp and SMS that went out to receivers, drivers and customers, newest first. Phone numbers are shown as typed at booking."
        actions={user?.role === 'admin' ? <ButtonLink to="/settings?tab=messages">Choose which messages go out</ButtonLink> : undefined}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input id="msg-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone number or AWB" aria-label="Search messages" className="h-11 w-full rounded-full border border-line bg-sheet-2 pr-4 pl-10 text-[15px] placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:bg-sheet focus:outline-none focus:ring-4 focus:ring-sign/15" />
        </div>
        <Select id="msg-tpl" aria-label="Message type" value={tpl} onChange={(e) => setTpl(e.target.value)} className="!w-auto">
          <option value="">All messages</option>
          {used.map((t) => (
            <option key={t} value={t}>
              {TEMPLATE_LABEL[t] ?? t}
            </option>
          ))}
        </Select>
      </div>
      {!data ? (
        <div className="sheet">
          <Loading rows={6} />
        </div>
      ) : list.length === 0 ? (
        <div className="sheet">
          <Empty title={data.length ? 'No message matches' : 'Nothing sent yet'}>{data.length ? 'Clear the search to see all.' : 'Book a shipment and the receiver gets a WhatsApp message with the tracking link. It shows up here.'}</Empty>
        </div>
      ) : (
        <ol className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className="sheet flex gap-3 px-4 py-3">
              <MessageCircle size={18} className="mt-0.5 shrink-0 text-go" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-[560]">{TEMPLATE_LABEL[m.template] ?? m.template}</span>
                  <span className="num text-[13.5px] text-muted">{dt(m.at)}</span>
                </div>
                <p className="mt-1 max-w-[70ch] rounded-[14px] rounded-tl-[3px] bg-go-soft px-3 py-2 text-[14.5px] leading-snug">{m.text}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[13.5px] text-muted">
                  <span className="num">To {m.to}</span>
                  <span>{m.channel === 'sms' ? 'SMS' : 'WhatsApp'}</span>
                  <StatusMark tone={m.status === 'FAILED' ? 'bad' : m.status === 'DELIVERED' ? 'done' : 'info'} label={m.status === 'FAILED' ? 'Failed' : m.status === 'DELIVERED' ? 'Delivered' : 'Sent'} className="text-[13.5px]" />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
