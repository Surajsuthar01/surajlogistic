import { computeDashboard, docAlerts, isTripLate, vehiclesNear, type OpsSnapshot } from './analytics';
import { periodStart, type ParsedQuery, COPILOT_SUGGESTIONS } from './copilot';
import { findCity } from './geo';
import { findReturnLoads } from './matching';
import { inr, quote, type GstConfig } from './pricing';
import { STATUS_LABEL } from './types';
import { VEHICLE_CLASSES } from './vehicles';

export interface CopilotTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface CopilotAnswer {
  intent: ParsedQuery['intent'];
  lang: 'hi' | 'en';
  text: string;
  table?: CopilotTable;
  links?: { label: string; href: string }[];
  suggestions: string[];
  /** Facts the answer was built from — handed to an LLM for a more natural reply. */
  facts: Record<string, unknown>;
}

/**
 * Answers a parsed question from live operations data. Pure and deterministic, so
 * the same answer appears in the API, the browser demo and the tests.
 */
export function answerQuery(q: ParsedQuery, s: OpsSnapshot, opts: { now?: Date; dieselPrice?: number; gst?: GstConfig } = {}): CopilotAnswer {
  const now = opts.now ?? new Date();
  const hi = q.lang === 'hi';
  const t = (en: string, hin: string) => (hi ? hin : en);
  const base = { intent: q.intent, lang: q.lang, suggestions: COPILOT_SUGGESTIONS.slice(0, 4) } as const;

  switch (q.intent) {
    case 'TRACK': {
      const sh = q.awb ? s.shipments.find((x) => x.awb === q.awb) : undefined;
      if (!sh) return { ...base, text: t('Send the AWB number (it starts with SL) and I will track it.', 'AWB number bhejiye (SL se shuru hota hai), main track kar dunga.'), facts: {} };
      const late = new Date(sh.etaAt).getTime() > new Date(sh.promisedAt).getTime() + 2 * 3600_000;
      const eta = new Date(sh.etaAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      return {
        ...base,
        text: t(
          `${sh.awb} (${sh.originCity} → ${sh.destCity}) is ${STATUS_LABEL[sh.status].toLowerCase()}. ETA ${eta}${late ? ', running late' : ''}.`,
          `${sh.awb} (${sh.originCity} → ${sh.destCity}) abhi "${STATUS_LABEL[sh.status]}" hai. ETA ${eta}${late ? ', thoda late chal raha hai' : ''}.`,
        ),
        links: [{ label: t('Open shipment', 'Shipment kholein'), href: `/shipments/${sh.id}` }, { label: t('Public tracking page', 'Tracking page'), href: `/track/${sh.awb}` }],
        facts: { awb: sh.awb, status: sh.status, etaAt: sh.etaAt, late },
      };
    }

    case 'QUOTE': {
      const [from, to] = q.cities;
      if (!from || !to) return { ...base, text: t('Tell me both cities and the weight, e.g. "Indore to Mumbai 5 ton".', 'Dono city aur weight bataiye, jaise "Indore se Mumbai 5 ton".'), facts: {} };
      const kg = q.weightKg ?? 5000;
      const service = q.service ?? (kg >= 3000 ? 'FTL' : kg > 50 ? 'PTL' : 'COURIER');
      const quoteRes = quote({ service, origin: from, destination: to, weightKg: kg, dieselPrice: opts.dieselPrice, gst: opts.gst });
      const vt = quoteRes.vehicleType ? VEHICLE_CLASSES[quoteRes.vehicleType].label : undefined;
      return {
        ...base,
        text: t(
          `${service} ${from} → ${to}, ${kg.toLocaleString('en-IN')} kg${vt ? ` on a ${vt}` : ''}: ${inr(quoteRes.total)} incl. ${quoteRes.gstRate}% GST, about ${quoteRes.distanceKm} km and ${Math.round(quoteRes.etaHours)} h.`,
          `${service} ${from} se ${to}, ${kg.toLocaleString('en-IN')} kg${vt ? ` (${vt})` : ''}: ${inr(quoteRes.total)} GST ${quoteRes.gstRate}% ke saath. Lagbhag ${quoteRes.distanceKm} km, ${Math.round(quoteRes.etaHours)} ghante.`,
        ),
        table: { columns: [t('Charge', 'Charge'), '₹'], rows: [...quoteRes.lines.map((l) => [l.label, l.amount]), ['GST', quoteRes.gst], [t('Total', 'Kul'), quoteRes.total]] },
        links: [{ label: t('Book this shipment', 'Yeh shipment book karein'), href: `/shipments/new?service=${service}&from=${from}&to=${to}&kg=${kg}` }],
        facts: { quote: quoteRes },
      };
    }

    case 'RETURN_LOADS': {
      const city = findCity(q.city);
      const open = s.loads.filter((l) => l.status === 'OPEN').map((l) => ({ id: l.id, origin: { lat: l.originLat, lng: l.originLng, city: l.originCity }, destination: { lat: l.destLat, lng: l.destLng, city: l.destCity }, weightKg: l.weightKg, vehicleType: l.vehicleType, pickupDate: l.pickupDate, targetPrice: l.targetPrice }));
      const candidates = city
        ? s.vehicles.filter((v) => v.status !== 'MAINTENANCE').map((v) => ({ v, at: { lat: city.lat, lng: city.lng } }))
        : s.vehicles.filter((v) => v.status === 'IDLE').map((v) => ({ v, at: { lat: v.lat, lng: v.lng } }));
      const rows: (string | number)[][] = [];
      const seen = new Set<string>();
      for (const c of candidates) {
        for (const m of findReturnLoads({ id: c.v.id, type: c.v.type, at: c.at }, open).slice(0, 2)) {
          const key = `${c.v.id}-${m.load.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push([c.v.regNo, `${m.load.origin.city} → ${m.load.destination.city}`, m.load.targetPrice, m.deadheadKm, m.estProfit]);
        }
      }
      rows.sort((a, b) => Number(b[4]) - Number(a[4]));
      const top = rows.slice(0, 6);
      return {
        ...base,
        text: top.length
          ? t(`Found ${rows.length} return-load options${city ? ` near ${city.name}` : ' for idle trucks'}. Best pays ${inr(Number(top[0]![2]))} with ${top[0]![3]} km empty to pickup.`, `${city ? `${city.name} ke paas ` : 'Khali trucks ke liye '}${rows.length} return load mile. Sabse accha ${inr(Number(top[0]![2]))}, pickup tak ${top[0]![3]} km khali.`)
          : t('No matching loads right now. Post the truck as available on the marketplace.', 'Abhi koi load match nahi hua. Truck ko marketplace par available dikhaiye.'),
        table: top.length ? { columns: [t('Truck', 'Truck'), t('Load', 'Load'), t('Pays ₹', 'Bhada ₹'), t('Empty km', 'Khali km'), t('Est. profit ₹', 'Andaazan munafa ₹')], rows: top } : undefined,
        links: [{ label: t('Open marketplace', 'Marketplace kholein'), href: '/marketplace' }],
        facts: { options: rows.length },
      };
    }

    case 'IDLE_VEHICLES': {
      const city = findCity(q.city);
      const idle = s.vehicles.filter((v) => v.status === 'IDLE');
      const list = city ? vehiclesNear(idle, city, 250) : idle.map((v) => ({ ...v, km: 0 }));
      return {
        ...base,
        text: list.length
          ? t(`${list.length} idle truck${list.length > 1 ? 's' : ''}${city ? ` within 250 km of ${city.name}` : ''}.`, `${city ? `${city.name} ke 250 km mein ` : ''}${list.length} truck khali hain.`)
          : t(`No idle trucks${city ? ` near ${city.name}` : ''}.`, `${city ? `${city.name} ke paas ` : ''}koi truck khali nahi hai.`),
        table: list.length ? { columns: [t('Truck', 'Truck'), t('Type', 'Type'), t('At', 'Kahan'), ...(city ? [t('Distance km', 'Doori km')] : [])], rows: list.map((v) => [v.regNo, VEHICLE_CLASSES[v.type].label, v.city, ...(city ? [v.km] : [])]) } : undefined,
        links: [{ label: t('Open fleet', 'Fleet kholein'), href: '/fleet' }],
        facts: { idle: list.length, city: city?.name },
      };
    }

    case 'DELAYED_SHIPMENTS': {
      const late = s.trips.filter(isTripLate);
      const ndr = s.shipments.filter((x) => x.status === 'NDR');
      const rows: (string | number)[][] = [
        ...late.map((tr) => [tr.tripNo, `${tr.originCity} → ${tr.destCity}`, t('Trip running late', 'Trip late hai'), `${Math.round((new Date(tr.etaAt).getTime() - new Date(tr.promisedAt).getTime()) / 3600_000)} h`]),
        ...ndr.map((x) => [x.awb, `${x.originCity} → ${x.destCity}`, t('Delivery failed', 'Delivery nahi hui'), `${x.attempts} ${t('attempt', 'koshish')}`]),
      ];
      return {
        ...base,
        text: rows.length ? t(`${late.length} trip${late.length === 1 ? '' : 's'} running late and ${ndr.length} failed deliver${ndr.length === 1 ? 'y' : 'ies'} need action.`, `${late.length} trip late hain aur ${ndr.length} delivery fail hui hain — inpar action chahiye.`) : t('Nothing is running late right now.', 'Abhi kuch bhi late nahi hai.'),
        table: rows.length ? { columns: [t('Ref', 'Ref'), t('Lane', 'Route'), t('Issue', 'Dikkat'), t('Size', 'Kitna')], rows } : undefined,
        links: [{ label: t('Open control tower', 'Control tower kholein'), href: '/' }],
        facts: { lateTrips: late.length, ndr: ndr.length },
      };
    }

    case 'COD_OUTSTANDING': {
      const field = s.shipments.filter((x) => x.paymentMode === 'COD' && !x.codCollected && !['CANCELLED', 'RTO_DELIVERED'].includes(x.status));
      const collected = s.shipments.filter((x) => x.paymentMode === 'COD' && x.codCollected);
      const fieldSum = field.reduce((a, x) => a + x.codAmount, 0);
      const collSum = collected.reduce((a, x) => a + x.codAmount, 0);
      return {
        ...base,
        text: t(`${inr(fieldSum)} COD is still in the field across ${field.length} parcels; ${inr(collSum)} collected and due to remit to shippers.`, `${field.length} parcels par ${inr(fieldSum)} COD abhi baaki hai; ${inr(collSum)} collect ho chuka hai, shippers ko bhejna hai.`),
        table: { columns: ['AWB', t('To', 'Kahan'), t('Status', 'Status'), 'COD ₹'], rows: field.slice(0, 8).map((x) => [x.awb, x.destCity, STATUS_LABEL[x.status], x.codAmount]) },
        facts: { fieldSum, collSum },
      };
    }

    case 'RTO_RISK': {
      const risky = s.shipments.filter((x) => ['BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'NDR'].includes(x.status) && x.rtoLevel !== 'LOW').sort((a, b) => b.rtoScore - a.rtoScore);
      return {
        ...base,
        text: risky.length ? t(`${risky.length} active parcels carry medium or high return risk. Confirm the top ones on WhatsApp before dispatch.`, `${risky.length} parcels mein return ka risk hai. Upar wale parcels ko dispatch se pehle WhatsApp par confirm karein.`) : t('No risky parcels right now.', 'Abhi koi risky parcel nahi hai.'),
        table: risky.length ? { columns: ['AWB', t('To', 'Kahan'), t('Risk', 'Risk'), 'COD ₹'], rows: risky.slice(0, 8).map((x) => [x.awb, x.destCity, `${x.rtoScore} (${x.rtoLevel})`, x.codAmount]) } : undefined,
        facts: { risky: risky.length },
      };
    }

    case 'DOC_EXPIRY': {
      const rows: (string | number)[][] = [];
      for (const v of s.vehicles) for (const a of docAlerts(v, now)) rows.push([v.regNo, a.label, a.days < 0 ? t(`expired ${-a.days} d ago`, `${-a.days} din pehle khatam`) : t(`in ${a.days} d`, `${a.days} din mein`)]);
      for (const d of s.drivers) {
        const days = Math.floor((new Date(d.licenseExpiry).getTime() - now.getTime()) / 86400_000);
        if (days <= 30) rows.push([d.name, t('Driving licence', 'Driving licence'), t(`in ${days} d`, `${days} din mein`)]);
      }
      return {
        ...base,
        text: rows.length ? t(`${rows.length} documents expire within 30 days or have already expired.`, `${rows.length} kagaz 30 din mein khatam ho rahe hain ya ho chuke hain.`) : t('All vehicle and driver documents are valid for the next 30 days.', 'Agle 30 din tak sab kagaz valid hain.'),
        table: rows.length ? { columns: [t('Vehicle / driver', 'Gaadi / driver'), t('Document', 'Kagaz'), t('When', 'Kab')], rows } : undefined,
        links: [{ label: t('Open fleet', 'Fleet kholein'), href: '/fleet' }],
        facts: { count: rows.length },
      };
    }

    case 'REVENUE': {
      const from = periodStart(q.period === 'all' ? 'month' : q.period, now)!;
      const list = s.shipments.filter((x) => x.status !== 'CANCELLED' && new Date(x.createdAt) >= from);
      const revenue = list.reduce((a, x) => a + x.price, 0);
      const tripProfit = s.trips.filter((tr) => tr.status !== 'CANCELLED' && new Date(tr.createdAt) >= from).reduce((a, tr) => a + tr.freightAmount - tr.fuelCost - tr.tollCost - tr.otherCost, 0);
      const label = q.period === 'today' ? t('today', 'aaj') : q.period === 'week' ? t('in the last 7 days', 'pichhle 7 din mein') : t('in the last 30 days', 'pichhle 30 din mein');
      return {
        ...base,
        text: t(`Booked revenue ${label}: ${inr(revenue)} from ${list.length} shipments. Trip profit after diesel and tolls: ${inr(tripProfit)}.`, `${label} ki booking: ${list.length} shipments se ${inr(revenue)}. Diesel aur toll ke baad trip munafa: ${inr(tripProfit)}.`),
        table: { columns: [t('Service', 'Service'), t('Shipments', 'Shipments'), '₹'], rows: (['COURIER', 'PTL', 'FTL'] as const).map((sv) => { const l = list.filter((x) => x.service === sv); return [sv, l.length, l.reduce((a, x) => a + x.price, 0)]; }) },
        facts: { revenue, shipments: list.length, tripProfit },
      };
    }

    case 'FLEET_STATUS': {
      const counts = { IDLE: 0, ON_TRIP: 0, MAINTENANCE: 0 };
      for (const v of s.vehicles) counts[v.status]++;
      const util = Math.round((counts.ON_TRIP / Math.max(1, s.vehicles.length - counts.MAINTENANCE)) * 100);
      return {
        ...base,
        text: t(`${s.vehicles.length} vehicles: ${counts.ON_TRIP} on trip, ${counts.IDLE} idle, ${counts.MAINTENANCE} in maintenance. Utilisation ${util}%.`, `${s.vehicles.length} gaadiyan: ${counts.ON_TRIP} trip par, ${counts.IDLE} khali, ${counts.MAINTENANCE} maintenance mein. Utilisation ${util}%.`),
        table: { columns: [t('Truck', 'Truck'), t('Status', 'Status'), t('At', 'Kahan')], rows: s.vehicles.map((v) => [v.regNo, v.status, v.city]) },
        links: [{ label: t('Open fleet', 'Fleet kholein'), href: '/fleet' }],
        facts: { ...counts, util },
      };
    }

    case 'TODAY_SUMMARY': {
      const d = computeDashboard(s, now);
      const k = d.kpis;
      const top = d.exceptions.slice(0, 3).map((e) => e.title);
      return {
        ...base,
        text: t(
          `Today: ${k.bookedToday} booked, ${k.deliveredToday} delivered, ${k.inTransit} moving. Fleet ${k.fleetUtilisation}% used with ${k.idleVehicles} idle. On-time ${k.onTimeRate}%. ${top.length ? `Top issues: ${top.join('; ')}.` : 'No open issues.'}`,
          `Aaj: ${k.bookedToday} booking, ${k.deliveredToday} delivery, ${k.inTransit} raste mein. Fleet ${k.fleetUtilisation}% chal rahi, ${k.idleVehicles} khali. On-time ${k.onTimeRate}%. ${top.length ? `Sabse zaroori: ${top.join('; ')}.` : 'Koi dikkat nahi.'}`,
        ),
        facts: { kpis: k, top },
      };
    }

    default:
      return {
        ...base,
        text: t('I can track shipments, quote prices, find idle trucks and return loads, flag delays, COD, risky parcels, expiring documents, and summarise revenue. Try one of these:', 'Main shipment track kar sakta hoon, bhada bata sakta hoon, khali truck aur return load dhoondh sakta hoon, late trips, COD, risky parcel, kagaz expiry aur kamai bata sakta hoon. Inme se kuch poochiye:'),
        suggestions: COPILOT_SUGGESTIONS,
        facts: {},
      };
  }
}
