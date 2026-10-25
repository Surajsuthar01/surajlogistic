import { tripPnl } from './analytics';
import type { CustomerRec, DriverRec, ShipmentRec, TripRec } from './records';
import type { Service } from './types';

export interface Report {
  from: string;
  to: string;
  summary: {
    shipments: number;
    revenue: number;
    delivered: number;
    onTimeRate: number;
    returned: number;
    rtoRate: number;
    trips: number;
    freight: number;
    tripCost: number;
    tripProfit: number;
    margin: number;
    km: number;
    co2Kg: number;
  };
  byService: { service: Service; shipments: number; revenue: number }[];
  lanes: { lane: string; origin: string; dest: string; shipments: number; revenue: number; trips: number; tripProfit: number; onTimeRate: number | null }[];
  customers: { name: string; customerId: string | null; shipments: number; revenue: number; share: number }[];
  drivers: { driverId: string; name: string; trips: number; km: number; onTimeRate: number | null; profit: number; rating: number }[];
  months: { month: string; revenue: number; shipments: number }[];
}

const GRACE_MS = 2 * 3600_000;
const onTime = (done: string | null, promised: string) => !!done && new Date(done).getTime() <= new Date(promised).getTime() + GRACE_MS;
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** Business report for a date range (inclusive, IST calendar days given as YYYY-MM-DD). */
export function computeReport(d: { shipments: ShipmentRec[]; trips: TripRec[]; drivers: DriverRec[]; customers: CustomerRec[] }, fromDay: string, toDay: string): Report {
  const from = new Date(`${fromDay}T00:00:00+05:30`).getTime();
  const to = new Date(`${toDay}T23:59:59.999+05:30`).getTime();
  const inRange = (iso: string | null) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() <= to;

  const ships = d.shipments.filter((s) => inRange(s.createdAt) && s.status !== 'CANCELLED');
  const delivered = d.shipments.filter((s) => s.status === 'DELIVERED' && inRange(s.deliveredAt));
  const returned = ships.filter((s) => s.status === 'RTO' || s.status === 'RTO_DELIVERED');
  const parcels = ships.filter((s) => s.service === 'COURIER');
  const trips = d.trips.filter((t) => t.status === 'COMPLETED' && inRange(t.completedAt));
  const pnl = trips.map((t) => ({ t, p: tripPnl(t) }));
  const revenue = ships.reduce((a, s) => a + s.price, 0);
  const freight = trips.reduce((a, t) => a + t.freightAmount, 0);
  const tripCost = pnl.reduce((a, x) => a + x.p.cost, 0);

  const laneMap = new Map<string, Report['lanes'][number] & { onTimeN: number; doneN: number }>();
  const laneOf = (o: string, z: string) => {
    const key = `${o}–${z}`;
    let l = laneMap.get(key);
    if (!l) {
      l = { lane: key, origin: o, dest: z, shipments: 0, revenue: 0, trips: 0, tripProfit: 0, onTimeRate: null, onTimeN: 0, doneN: 0 };
      laneMap.set(key, l);
    }
    return l;
  };
  for (const s of ships) {
    const l = laneOf(s.originCity, s.destCity);
    l.shipments += 1;
    l.revenue += s.price;
  }
  for (const s of delivered) {
    const l = laneOf(s.originCity, s.destCity);
    l.doneN += 1;
    if (onTime(s.deliveredAt, s.promisedAt)) l.onTimeN += 1;
  }
  for (const { t, p } of pnl) {
    const l = laneOf(t.originCity, t.destCity);
    l.trips += 1;
    l.tripProfit += p.profit;
  }
  const lanes = [...laneMap.values()]
    .map(({ onTimeN, doneN, ...l }) => ({ ...l, onTimeRate: doneN ? pctOf(onTimeN, doneN) : null }))
    .sort((a, b) => b.revenue + b.tripProfit - (a.revenue + a.tripProfit))
    .slice(0, 25);

  const custMap = new Map<string, Report['customers'][number]>();
  for (const s of ships) {
    const key = s.customerId ?? s.shipperName;
    const c = custMap.get(key) ?? { name: d.customers.find((x) => x.id === s.customerId)?.name ?? s.shipperName, customerId: s.customerId, shipments: 0, revenue: 0, share: 0 };
    c.shipments += 1;
    c.revenue += s.price;
    custMap.set(key, c);
  }
  const customers = [...custMap.values()].map((c) => ({ ...c, share: pctOf(c.revenue, revenue) })).sort((a, b) => b.revenue - a.revenue);

  const drivers = d.drivers
    .map((dr) => {
      const mine = pnl.filter((x) => x.t.driverId === dr.id);
      return {
        driverId: dr.id,
        name: dr.name,
        trips: mine.length,
        km: mine.reduce((a, x) => a + (x.t.actualKm ?? x.t.plannedKm), 0),
        onTimeRate: mine.length ? pctOf(mine.filter((x) => onTime(x.t.completedAt, x.t.promisedAt)).length, mine.length) : null,
        profit: mine.reduce((a, x) => a + x.p.profit, 0),
        rating: dr.rating,
      };
    })
    .sort((a, b) => b.trips - a.trips || b.km - a.km);

  const byService = (['COURIER', 'PTL', 'FTL'] as Service[]).map((service) => {
    const xs = ships.filter((s) => s.service === service);
    return { service, shipments: xs.length, revenue: xs.reduce((a, s) => a + s.price, 0) };
  });

  // Six calendar months ending with the month of `toDay`, in IST.
  const months: Report['months'] = [];
  const [ty, tm] = toDay.split('-').map(Number) as [number, number];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(ty, tm - 1 - i, 1));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    const xs = d.shipments.filter((s) => s.status !== 'CANCELLED' && istMonth(s.createdAt) === key);
    months.push({ month: key, revenue: xs.reduce((a, s) => a + s.price, 0), shipments: xs.length });
  }

  return {
    from: fromDay,
    to: toDay,
    summary: {
      shipments: ships.length,
      revenue,
      delivered: delivered.length,
      onTimeRate: pctOf(delivered.filter((s) => onTime(s.deliveredAt, s.promisedAt)).length, delivered.length),
      returned: returned.length,
      rtoRate: pctOf(returned.filter((s) => s.service === 'COURIER').length, parcels.length),
      trips: trips.length,
      freight,
      tripCost,
      tripProfit: freight - tripCost,
      margin: pctOf(freight - tripCost, freight),
      km: trips.reduce((a, t) => a + (t.actualKm ?? t.plannedKm), 0),
      co2Kg: Math.round(ships.reduce((a, s) => a + s.co2Kg, 0)),
    },
    byService,
    lanes,
    customers,
    drivers,
    months,
  };
}

function istMonth(iso: string) {
  const t = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Today's date in India as YYYY-MM-DD. */
export function istToday(now = new Date()) {
  const t = new Date(now.getTime() + 5.5 * 3600_000);
  return t.toISOString().slice(0, 10);
}
