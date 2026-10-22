// Deterministic demo dataset for "Suraj Logistic". The API seed script inserts it
// into Postgres; the web app's demo mode runs on it in the browser. Every company,
// person, GSTIN and vehicle number here is made up.
import { shipmentCo2Kg } from './carbon';
import { liveEta, predictEta } from './eta';
import { lerpPoint, nearestCity, requireCity, roadKm } from './geo';
import { deliveryOtp, invoiceNumber, makeAwb, mulberry32, shortCode, uuidFrom } from './ids';
import { DEFAULT_GST, quote } from './pricing';
import type {
  BidRec,
  CustomerRec,
  DemoDataset,
  DriverRec,
  FacilityRec,
  GpsPingRec,
  InventoryItemRec,
  InvoiceRec,
  LoadRec,
  OrgRec,
  ShipmentEventRec,
  ShipmentRec,
  StockMoveRec,
  TripRec,
  UserRec,
  VehicleRec,
} from './records';
import { rtoRisk } from './risk';
import type { PaymentMode, Service, ShipmentStatus, VehicleDocs } from './types';
import { VEHICLE_CLASSES, type VehicleType } from './vehicles';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_LOGINS = [
  { email: 'admin@surajlogistic.in', role: 'admin', label: 'Owner / admin' },
  { email: 'ops@surajlogistic.in', role: 'ops', label: 'Dispatcher' },
  { email: 'driver@surajlogistic.in', role: 'driver', label: 'Driver (Ramesh)' },
  { email: 'warehouse@surajlogistic.in', role: 'warehouse', label: 'Warehouse staff' },
  { email: 'shipper@shreetextiles.in', role: 'customer', label: 'Shipper (Shree Textiles)' },
] as const;

const H = 3600_000;
const D = 24 * H;

const PATH_HUB: ShipmentStatus[] = ['BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const PATH_FTL: ShipmentStatus[] = ['BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];

const NOTE: Record<ShipmentStatus, string> = {
  BOOKED: 'Booking confirmed and priced',
  PICKED_UP: 'Picked up from shipper',
  IN_TRANSIT: 'Departed on linehaul',
  AT_HUB: 'Arrived and sorted at hub',
  OUT_FOR_DELIVERY: 'Out for delivery with field executive',
  DELIVERED: 'Delivered, OTP verified',
  NDR: 'Receiver not available, reattempt requested',
  RTO: 'Returning to shipper after failed attempts',
  RTO_DELIVERED: 'Returned to shipper',
  CANCELLED: 'Cancelled by shipper',
};

function pathTo(service: Service, status: ShipmentStatus): ShipmentStatus[] {
  const main = service === 'FTL' ? PATH_FTL : PATH_HUB;
  const idx = main.indexOf(status);
  if (idx >= 0) return main.slice(0, idx + 1);
  const ofd = service === 'FTL' ? main.slice(0, 3) : main.slice(0, 5);
  if (status === 'NDR') return [...ofd, 'NDR'];
  if (status === 'RTO') return [...ofd, 'NDR', 'RTO'];
  if (status === 'RTO_DELIVERED') return [...ofd, 'NDR', 'RTO', 'RTO_DELIVERED'];
  if (status === 'CANCELLED') return ['BOOKED', 'CANCELLED'];
  return ['BOOKED'];
}

export function buildDemoData(now = new Date()): DemoDataset {
  const rand = mulberry32(20261022);
  const id = () => uuidFrom(rand);
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const day = (offsetDays: number) => new Date(now.getTime() + offsetDays * D).toISOString().slice(0, 10);
  const createdAt = iso(120 * D);

  const org: OrgRec = {
    id: id(),
    name: 'Suraj Logistic',
    slug: 'suraj',
    gstin: '23AAKFS0000A1Z0',
    plan: '3PL Pro',
    modules: ['trucking', 'courier', 'marketplace', 'warehouse', 'billing'],
    settings: { dieselPrice: 92, gst: DEFAULT_GST, brandColor: '#f59e0b' },
    createdAt,
  };
  const o = org.id;

  // Customers (shippers who pay us).
  const cust = (name: string, city: string, gstin: string | null, phone: string): CustomerRec => ({ id: id(), orgId: o, name, gstin, phone, email: null, city, createdAt });
  const customers = [
    cust('Shree Textiles', 'Bhilwara', '08AAAAA0000A1Z1', '9829000011'),
    cust('Malwa Agro Foods', 'Ratlam', '23BBBBB0000B1Z2', '9425000022'),
    cust('Jaipur Handicrafts Co.', 'Jaipur', '08CCCCC0000C1Z3', '9414000033'),
    cust('Indore Pharma Distributors', 'Indore', '23DDDDD0000D1Z4', '9826000044'),
    cust('Saurashtra Ceramics', 'Rajkot', '24EEEEE0000E1Z5', '9879000055'),
    cust('BharatKart (online seller)', 'Jaipur', '08FFFFF0000F1Z6', '9001000066'),
  ];
  const [shree, malwa, handicrafts, pharma, ceramics, bharatkart] = customers as [CustomerRec, CustomerRec, CustomerRec, CustomerRec, CustomerRec, CustomerRec];

  const users: UserRec[] = [
    { id: id(), orgId: o, name: 'Suraj (Owner)', email: 'admin@surajlogistic.in', phone: '9000000001', role: 'admin', lang: 'en', createdAt },
    { id: id(), orgId: o, name: 'Ankit Sharma', email: 'ops@surajlogistic.in', phone: '9000000002', role: 'ops', lang: 'en', createdAt },
    { id: id(), orgId: o, name: 'Ramesh Yadav', email: 'driver@surajlogistic.in', phone: '9000000003', role: 'driver', lang: 'hi', createdAt },
    { id: id(), orgId: o, name: 'Neha Jain', email: 'warehouse@surajlogistic.in', phone: '9000000004', role: 'warehouse', lang: 'en', createdAt },
    { id: id(), orgId: o, name: 'Shree Textiles desk', email: 'shipper@shreetextiles.in', phone: '9829000011', role: 'customer', lang: 'en', customerId: shree.id, createdAt },
  ];
  const driverUser = users[2]!;

  // Fleet.
  const docs = (ins: number, fit: number, permit: number, puc: number): VehicleDocs => ({ insurance: day(ins), fitness: day(fit), permit: day(permit), puc: day(puc), roadTax: day(200) });
  const veh = (regNo: string, type: VehicleType, city: string, status: VehicleRec['status'], d: VehicleDocs, ownership: VehicleRec['ownership'] = 'OWN'): VehicleRec => {
    const c = requireCity(city);
    return {
      id: id(), orgId: o, regNo, type, ownership, status, capacityKg: VEHICLE_CLASSES[type].capacityKg, city: c.name, lat: c.lat, lng: c.lng,
      kmpl: VEHICLE_CLASSES[type].kmpl, odometerKm: 40000 + Math.floor(rand() * 260000), docs: d, lastPingAt: iso(Math.floor(rand() * 40) * 60_000), createdAt,
    };
  };
  const vehicles: VehicleRec[] = [
    veh('RJ14 GA 4521', 'TRUCK_19FT', 'Jaipur', 'ON_TRIP', docs(160, 300, 240, 70)),
    veh('MP43 H 7781', 'CONTAINER_32FT_MXL', 'Ratlam', 'ON_TRIP', docs(90, 180, 120, 40)),
    veh('MP09 GH 2210', 'LCV_14FT', 'Indore', 'IDLE', docs(210, 330, 300, 25)),
    veh('RJ27 GB 1189', 'TRUCK_22FT', 'Udaipur', 'IDLE', docs(120, 260, 21, 60)),
    veh('GJ01 KT 5532', 'CONTAINER_32FT_SXL', 'Ahmedabad', 'ON_TRIP', docs(75, 140, 200, 33), 'ATTACHED'),
    veh('MP43 C 3390', 'TATA_ACE', 'Ratlam', 'IDLE', docs(9, 220, 180, 50)),
    veh('RJ14 CB 8812', 'PICKUP_1_5T', 'Jaipur', 'ON_TRIP', docs(140, 280, 260, 80)),
    veh('MH04 LM 6610', 'TRUCK_19FT', 'Mumbai', 'IDLE', docs(190, 310, 150, 45)),
    veh('DL1L AB 4410', 'TRAILER_40FT', 'Delhi', 'MAINTENANCE', docs(60, 12, 90, 20)),
    veh('MP09 KL 9044', 'TRUCK_22FT', 'Indore', 'ON_TRIP', docs(230, 340, 310, 90)),
    veh('RJ06 GC 7215', 'LCV_14FT', 'Bhilwara', 'IDLE', docs(170, 250, 220, 55), 'ATTACHED'),
    veh('GJ05 BZ 3301', 'TRUCK_19FT', 'Surat', 'IDLE', docs(130, 210, 170, -3), 'MARKET'),
  ];
  const V = (reg: string) => vehicles.find((v) => v.regNo === reg)!;

  const drv = (name: string, phone: string, licenseExpiryDays: number, status: DriverRec['status'], userId: string | null = null, lang: 'en' | 'hi' = 'hi'): DriverRec => ({
    id: id(), orgId: o, userId, name, phone, licenseNo: `${['RJ', 'MP', 'GJ', 'MH'][Math.floor(rand() * 4)]}${String(10 + Math.floor(rand() * 80))}20${String(10 + Math.floor(rand() * 15))}00${String(Math.floor(rand() * 90000) + 10000)}`,
    licenseExpiry: day(licenseExpiryDays), status, rating: Math.round((4 + rand()) * 10) / 10, lang, createdAt,
  });
  const drivers: DriverRec[] = [
    drv('Ramesh Yadav', '9000000003', 900, 'ON_TRIP', driverUser.id),
    drv('Suresh Meena', '9414100002', 700, 'ON_TRIP'),
    drv('Mohd. Irfan', '9425100003', 15, 'AVAILABLE'),
    drv('Gurpreet Singh', '9876100004', 1200, 'ON_TRIP'),
    drv('Rajesh Patel', '9879100005', 500, 'AVAILABLE', null, 'en'),
    drv('Vikram Choudhary', '9829100006', 650, 'ON_TRIP'),
    drv('Anil Gurjar', '9001100007', 820, 'ON_TRIP'),
    drv('Sanjay Kushwah', '9826100008', 400, 'AVAILABLE'),
    drv('Harish Rathore', '9460100009', 1000, 'AVAILABLE'),
    drv('Dinesh Solanki', '9898100010', 300, 'OFF'),
  ];
  const Dr = (name: string) => drivers.find((d) => d.name === name)!;

  // Trips.
  const trips: TripRec[] = [];
  const pings: GpsPingRec[] = [];
  const trip = (reg: string, driverName: string, from: string, to: string, status: TripRec['status'], progress: number, startedHoursAgo: number, freight: number): TripRec => {
    const v = V(reg);
    const a = requireCity(from);
    const b = requireCity(to);
    const km = roadKm(a, b);
    const vc = VEHICLE_CLASSES[v.type];
    const startMs = now.getTime() - startedHoursAgo * H;
    const plan = predictEta({ service: 'FTL', distanceKm: km, vehicleType: v.type, departAt: new Date(startMs), destination: b });
    const promised = new Date(plan.arriveAt).getTime();
    const pos = lerpPoint(a, b, progress);
    // A moving truck's ETA comes from where it is now, exactly as the live API computes it.
    const etaAt = status === 'IN_TRANSIT' ? liveEta(pos, b, v.type, now).arriveAt : new Date(promised).toISOString();
    const t: TripRec = {
      id: id(), orgId: o, tripNo: shortCode('TRP', rand, 5), vehicleId: v.id, driverId: Dr(driverName).id, status,
      originCity: a.name, originLat: a.lat, originLng: a.lng, destCity: b.name, destLat: b.lat, destLng: b.lng,
      plannedKm: km, actualKm: status === 'COMPLETED' ? Math.round(km * 1.04) : null, freightAmount: freight,
      fuelCost: Math.round((km / vc.kmpl) * org.settings.dieselPrice), tollCost: Math.round(km * vc.tollPerKm), driverAdvance: status === 'PLANNED' ? 0 : 5000, otherCost: status === 'COMPLETED' ? 1200 : 0,
      currentLat: pos.lat, currentLng: pos.lng, progress, etaAt, promisedAt: new Date(promised).toISOString(),
      loadId: null, plannedStart: new Date(startMs).toISOString(), startedAt: status === 'PLANNED' ? null : new Date(startMs).toISOString(),
      completedAt: status === 'COMPLETED' ? new Date(Math.min(now.getTime() - 2 * H, promised)).toISOString() : null, createdAt: new Date(startMs - 6 * H).toISOString(),
    };
    trips.push(t);
    if (status === 'IN_TRANSIT' || status === 'COMPLETED') {
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const f = (progress * i) / steps;
        const p = lerpPoint(a, b, f);
        pings.push({ id: id(), orgId: o, tripId: t.id, vehicleId: v.id, lat: p.lat, lng: p.lng, speedKmph: Math.round(vc.avgKmph * (0.7 + rand() * 0.6)), at: new Date(startMs + f * (promised - startMs)).toISOString() });
      }
      v.lat = pos.lat;
      v.lng = pos.lng;
      if (status === 'COMPLETED') {
        v.city = b.name;
        v.lat = b.lat;
        v.lng = b.lng;
      } else {
        v.city = nearestCity(pos).name;
      }
    }
    return t;
  };
  const tJaipurAhd = trip('RJ14 GA 4521', 'Ramesh Yadav', 'Jaipur', 'Ahmedabad', 'IN_TRANSIT', 0.55, 9, 38000);
  const tRatlamMum = trip('MP43 H 7781', 'Suresh Meena', 'Ratlam', 'Mumbai', 'IN_TRANSIT', 0.35, 6, 72000);
  // This one is behind schedule: past its promised time with a fifth of the lane left.
  const tAhdLdh = trip('GJ01 KT 5532', 'Gurpreet Singh', 'Ahmedabad', 'Ludhiana', 'IN_TRANSIT', 0.8, 58, 64000);
  const tIdrPune = trip('MP09 KL 9044', 'Vikram Choudhary', 'Indore', 'Pune', 'IN_TRANSIT', 0.2, 3, 52000);
  const tJprAjmer = trip('RJ14 CB 8812', 'Anil Gurjar', 'Jaipur', 'Ajmer', 'IN_TRANSIT', 0.6, 2, 6500);
  const tIdrMum = trip('MH04 LM 6610', 'Rajesh Patel', 'Indore', 'Mumbai', 'COMPLETED', 1, 30, 41000);
  trip('MP09 GH 2210', 'Sanjay Kushwah', 'Indore', 'Bhopal', 'PLANNED', 0, -14, 14500);

  // Shipments.
  const shipments: ShipmentRec[] = [];
  const events: ShipmentEventRec[] = [];
  interface ShipSpec {
    service: Service;
    from: string;
    to: string;
    kg: number;
    pay: PaymentMode;
    cod?: number;
    value: number;
    customer: CustomerRec;
    consignee: string;
    phone: string;
    address: string;
    status: ShipmentStatus;
    hoursAgo: number;
    trip?: TripRec;
    vehicleType?: VehicleType;
  }
  const ship = (s: ShipSpec): ShipmentRec => {
    const a = requireCity(s.from);
    const b = requireCity(s.to);
    const created = now.getTime() - s.hoursAgo * H;
    const q = quote({ service: s.service, origin: a.name, destination: b.name, weightKg: s.kg, declaredValue: s.value, paymentMode: s.pay, codAmount: s.cod, dieselPrice: org.settings.dieselPrice, vehicleType: s.vehicleType });
    const risk = rtoRisk({ paymentMode: s.pay, codAmount: s.cod, consigneePhone: s.phone, address: s.address, destination: b.name });
    const eta = predictEta({ service: s.service, distanceKm: q.distanceKm, vehicleType: q.vehicleType, departAt: new Date(created), destination: b });
    const path = pathTo(s.service, s.status);
    // Most deliveries land a little before the promise; a few run late, as in real life.
    const span = Math.max(1, Math.min(s.hoursAgo * 0.9, eta.hours * (0.78 + rand() * 0.3)));
    const hub = nearestCity(lerpPoint(a, b, 0.5));
    let pos = { lat: a.lat, lng: a.lng };
    const shipId = id();
    path.forEach((st, i) => {
      const at = new Date(created + (span * i) / Math.max(1, path.length - 1) * H);
      let city = a.name;
      let p = { lat: a.lat, lng: a.lng };
      if (st === 'IN_TRANSIT') { p = s.trip ? { lat: s.trip.currentLat, lng: s.trip.currentLng } : lerpPoint(a, b, 0.45); city = nearestCity(p).name; }
      if (st === 'AT_HUB') { p = hub; city = hub.name; }
      if (['OUT_FOR_DELIVERY', 'DELIVERED', 'NDR'].includes(st)) { p = b; city = b.name; }
      if (st === 'RTO') { p = lerpPoint(b, a, 0.3); city = nearestCity(p).name; }
      if (st === 'RTO_DELIVERED') { p = a; city = a.name; }
      pos = p;
      events.push({ id: id(), orgId: o, shipmentId: shipId, status: st, note: NOTE[st], city, lat: p.lat, lng: p.lng, at: at.toISOString() });
    });
    const delivered = s.status === 'DELIVERED';
    const rec: ShipmentRec = {
      id: shipId, orgId: o, awb: makeAwb(rand), service: s.service, status: s.status, customerId: s.customer.id,
      shipperName: s.customer.name, shipperPhone: s.customer.phone, consigneeName: s.consignee, consigneePhone: s.phone, consigneeAddress: s.address,
      originCity: a.name, originLat: a.lat, originLng: a.lng, destCity: b.name, destLat: b.lat, destLng: b.lng,
      weightKg: s.kg, packages: s.service === 'COURIER' ? 1 : Math.max(1, Math.round(s.kg / 40)), declaredValue: s.value, paymentMode: s.pay,
      codAmount: s.cod ?? 0, codCollected: delivered && s.pay === 'COD', price: q.total, priceBreakup: q.lines, gstRate: q.gstRate,
      distanceKm: q.distanceKm, co2Kg: shipmentCo2Kg(s.service, q.distanceKm, s.kg, q.vehicleType), rtoScore: risk.score, rtoLevel: risk.level,
      ewaybillRequired: s.value > 50000, ewaybillNo: s.value > 50000 && s.status !== 'BOOKED' ? String(Math.floor(100000000000 + rand() * 899999999999)) : null,
      vehicleType: q.vehicleType ?? (s.trip ? vehicles.find((v) => v.id === s.trip!.vehicleId)!.type : null), tripId: s.trip?.id ?? null, invoiceId: null,
      deliveryOtp: deliveryOtp(rand), attempts: s.status === 'NDR' ? 1 : ['RTO', 'RTO_DELIVERED'].includes(s.status) ? 3 : delivered ? 1 : 0,
      currentLat: pos.lat, currentLng: pos.lng, promisedAt: eta.arriveAt,
      etaAt: s.trip ? s.trip.etaAt : eta.arriveAt,
      podReceiver: delivered ? s.consignee : null, podPhotoUrl: null, deliveredAt: delivered ? events[events.length - 1]!.at : null,
      createdAt: new Date(created).toISOString(), updatedAt: events[events.length - 1]!.at,
    };
    shipments.push(rec);
    return rec;
  };

  // FTL and PTL on live trips.
  ship({ service: 'FTL', from: 'Ratlam', to: 'Mumbai', kg: 14500, pay: 'TO_PAY', value: 980000, customer: malwa, consignee: 'Vashi APMC Traders', phone: '9820011122', address: 'Shed 14, APMC Market Phase 2, Vashi, Navi Mumbai 400703', status: 'IN_TRANSIT', hoursAgo: 7, trip: tRatlamMum, vehicleType: 'CONTAINER_32FT_MXL' });
  ship({ service: 'FTL', from: 'Ahmedabad', to: 'Ludhiana', kg: 7000, pay: 'PREPAID', value: 620000, customer: ceramics, consignee: 'Punjab Tiles Bazaar', phone: '9815022233', address: 'Plot 44, Focal Point Phase 8, Ludhiana 141010', status: 'IN_TRANSIT', hoursAgo: 59, trip: tAhdLdh, vehicleType: 'CONTAINER_32FT_SXL' });
  ship({ service: 'FTL', from: 'Indore', to: 'Pune', kg: 9500, pay: 'PREPAID', value: 450000, customer: pharma, consignee: 'Chakan Distribution Centre', phone: '9822033344', address: 'Gat No. 112, Chakan MIDC Phase 1, Pune 410501', status: 'IN_TRANSIT', hoursAgo: 4, trip: tIdrPune, vehicleType: 'TRUCK_22FT' });
  ship({ service: 'PTL', from: 'Jaipur', to: 'Ahmedabad', kg: 1800, pay: 'PREPAID', value: 240000, customer: handicrafts, consignee: 'Gujarat Home Decor', phone: '9824044455', address: '22 Sindhu Bhavan Road, Bodakdev, Ahmedabad 380054', status: 'IN_TRANSIT', hoursAgo: 10, trip: tJaipurAhd });
  ship({ service: 'PTL', from: 'Jaipur', to: 'Ahmedabad', kg: 2600, pay: 'TO_PAY', value: 310000, customer: shree, consignee: 'Narol Fabrics', phone: '9825055566', address: 'Shop 5, Narol Cloth Market, Ahmedabad 382405', status: 'IN_TRANSIT', hoursAgo: 11, trip: tJaipurAhd });
  ship({ service: 'PTL', from: 'Jaipur', to: 'Udaipur', kg: 900, pay: 'PREPAID', value: 85000, customer: handicrafts, consignee: 'Lake City Emporium', phone: '9829066677', address: '7 City Palace Road, Udaipur 313001', status: 'IN_TRANSIT', hoursAgo: 9, trip: tJaipurAhd });
  ship({ service: 'FTL', from: 'Indore', to: 'Mumbai', kg: 6800, pay: 'PREPAID', value: 380000, customer: pharma, consignee: 'Bhiwandi Pharma Warehouse', phone: '9833077788', address: 'Building B3, Rajlaxmi Complex, Bhiwandi 421302', status: 'DELIVERED', hoursAgo: 34, trip: tIdrMum, vehicleType: 'TRUCK_19FT' });

  // Parcels on the Jaipur-Ajmer run and the courier network.
  const parcels: Array<Omit<ShipSpec, 'service' | 'customer'> & { customer?: CustomerRec }> = [
    { from: 'Jaipur', to: 'Ajmer', kg: 1.5, pay: 'COD', cod: 1299, value: 1299, consignee: 'Pooja Rawat', phone: '9001234561', address: '14 Vaishali Nagar, near Shiv Mandir, Ajmer 305006', status: 'IN_TRANSIT', hoursAgo: 3, trip: tJprAjmer },
    { from: 'Jaipur', to: 'Ajmer', kg: 0.8, pay: 'PREPAID', value: 699, consignee: 'Imran Khan', phone: '9001234562', address: '3/21 Adarsh Nagar, Ajmer 305008', status: 'IN_TRANSIT', hoursAgo: 3, trip: tJprAjmer },
    { from: 'Jaipur', to: 'Delhi', kg: 2, pay: 'COD', cod: 2499, value: 2499, consignee: 'Rohit Malhotra', phone: '9811234563', address: 'B-204, Sector 62, Noida 201309', status: 'OUT_FOR_DELIVERY', hoursAgo: 40 },
    { from: 'Jaipur', to: 'Mumbai', kg: 1, pay: 'PREPAID', value: 1899, consignee: 'Sneha Kulkarni', phone: '9821234564', address: 'Flat 9, Shanti Niwas, Dadar West, Mumbai 400028', status: 'AT_HUB', hoursAgo: 30 },
    { from: 'Jaipur', to: 'Bengaluru', kg: 3, pay: 'COD', cod: 4299, value: 4299, consignee: 'Karthik R', phone: '98451', address: 'Koramangala', status: 'BOOKED', hoursAgo: 2 },
    { from: 'Jaipur', to: 'Lucknow', kg: 0.5, pay: 'COD', cod: 549, value: 549, consignee: 'Anjali Verma', phone: '9415234566', address: '12 Gomti Nagar Extension, Lucknow 226010', status: 'NDR', hoursAgo: 70 },
    { from: 'Jaipur', to: 'Patna', kg: 1, pay: 'COD', cod: 1749, value: 1749, consignee: 'Rahul Kumar', phone: '9431234567', address: 'Boring Road', status: 'RTO', hoursAgo: 150 },
    { from: 'Jaipur', to: 'Kota', kg: 2.5, pay: 'COD', cod: 999, value: 999, consignee: 'Meena Sharma', phone: '9413234568', address: '45 Talwandi, Sector A, Kota 324005', status: 'DELIVERED', hoursAgo: 50 },
    { from: 'Jaipur', to: 'Hyderabad', kg: 1.2, pay: 'PREPAID', value: 3499, consignee: 'Sai Prasad', phone: '9849234569', address: 'Plot 88, Madhapur, Hyderabad 500081', status: 'DELIVERED', hoursAgo: 110 },
    { from: 'Jaipur', to: 'Chennai', kg: 4, pay: 'COD', cod: 5999, value: 5999, consignee: 'Lakshmi N', phone: '9840234570', address: '21 2nd Cross, T Nagar, Chennai 600017', status: 'IN_TRANSIT', hoursAgo: 26 },
    { from: 'Jaipur', to: 'Guwahati', kg: 1, pay: 'COD', cod: 1299, value: 1299, consignee: 'Bikash Das', phone: '9435234571', address: 'Zoo Road', status: 'BOOKED', hoursAgo: 1 },
    { from: 'Jaipur', to: 'Pune', kg: 0.7, pay: 'PREPAID', value: 899, consignee: 'Aditya Joshi', phone: '9822234572', address: 'A-12 Kalyani Nagar, Pune 411006', status: 'DELIVERED', hoursAgo: 130 },
    { from: 'Jaipur', to: 'Indore', kg: 1.8, pay: 'COD', cod: 1599, value: 1599, consignee: 'Priya Agrawal', phone: '9826234573', address: '108 Scheme No. 54, Vijay Nagar, Indore 452010', status: 'DELIVERED', hoursAgo: 90 },
    { from: 'Jaipur', to: 'Jaipur', kg: 0.5, pay: 'COD', cod: 399, value: 399, consignee: 'Vivek Jain', phone: '9414234574', address: '56 Malviya Nagar, Jaipur 302017', status: 'OUT_FOR_DELIVERY', hoursAgo: 5 },
    { from: 'Jaipur', to: 'Kolkata', kg: 2.2, pay: 'PREPAID', value: 2799, consignee: 'Arijit Sen', phone: '9830234575', address: '19 Lake Road, Kolkata 700029', status: 'PICKED_UP', hoursAgo: 4 },
    { from: 'Jaipur', to: 'Ludhiana', kg: 1.1, pay: 'COD', cod: 1199, value: 1199, consignee: 'Harpreet Kaur', phone: '9814234576', address: '233 Model Town, Ludhiana 141002', status: 'RTO_DELIVERED', hoursAgo: 260 },
    { from: 'Indore', to: 'Ratlam', kg: 3.5, pay: 'PREPAID', value: 4200, consignee: 'Jain Medical Stores', phone: '9425234577', address: '7 Station Road, Ratlam 457001', status: 'DELIVERED', hoursAgo: 60, customer: pharma },
    { from: 'Indore', to: 'Ujjain', kg: 6, pay: 'PREPAID', value: 12500, consignee: 'Mahakal Pharma', phone: '9425234578', address: '15 Freeganj, Ujjain 456010', status: 'OUT_FOR_DELIVERY', hoursAgo: 20, customer: pharma },
    { from: 'Indore', to: 'Mandsaur', kg: 8, pay: 'PREPAID', value: 18000, consignee: 'Gupta Medicos', phone: '9425234579', address: '32 Gandhi Chowk, Mandsaur 458001', status: 'AT_HUB', hoursAgo: 22, customer: pharma },
    { from: 'Ratlam', to: 'Neemuch', kg: 12, pay: 'TO_PAY', value: 9000, consignee: 'Neemuch Kirana Bhandar', phone: '9425234580', address: 'Main Bazar, Neemuch 458441', status: 'DELIVERED', hoursAgo: 80, customer: malwa },
  ];
  for (const p of parcels) ship({ ...p, service: 'COURIER', customer: p.customer ?? bharatkart });

  // Older delivered freight for revenue history (last 30 days).
  const lanes: Array<[string, string, Service, number, CustomerRec]> = [
    ['Bhilwara', 'Ludhiana', 'PTL', 2200, shree], ['Bhilwara', 'Surat', 'FTL', 6500, shree], ['Ratlam', 'Ahmedabad', 'FTL', 9000, malwa],
    ['Ratlam', 'Delhi', 'PTL', 1500, malwa], ['Jaipur', 'Delhi', 'PTL', 1200, handicrafts], ['Indore', 'Nagpur', 'PTL', 2400, pharma],
    ['Rajkot', 'Jaipur', 'FTL', 7000, ceramics], ['Indore', 'Bhopal', 'PTL', 800, pharma], ['Bhilwara', 'Kolkata', 'PTL', 3000, shree],
    ['Ratlam', 'Indore', 'FTL', 3800, malwa], ['Jaipur', 'Mumbai', 'PTL', 1600, handicrafts], ['Rajkot', 'Indore', 'FTL', 6800, ceramics],
  ];
  lanes.forEach(([from, to, service, kg, customer], i) => {
    ship({ service, from, to, kg, pay: i % 3 === 0 ? 'TO_PAY' : 'PREPAID', value: kg * (service === 'FTL' ? 60 : 110), customer, consignee: `${requireCity(to).name} consignee ${i + 1}`, phone: `98${String(10000000 + i * 7311).slice(0, 8)}`, address: `Transport Nagar, Plot ${10 + i}, ${to}`, status: 'DELIVERED', hoursAgo: 72 + i * 50 });
  });

  // Marketplace loads posted by shippers and other transporters.
  const loads: LoadRec[] = [];
  const bids: BidRec[] = [];
  const load = (postedBy: string, from: string, to: string, material: string, kg: number, vt: VehicleType | null, pickupInHours: number, price: number, status: LoadRec['status'] = 'OPEN'): LoadRec => {
    const a = requireCity(from);
    const b = requireCity(to);
    const l: LoadRec = {
      id: id(), orgId: o, loadNo: shortCode('LD', rand, 5), postedBy, contactPhone: `98${Math.floor(10000000 + rand() * 89999999)}`,
      originCity: a.name, originLat: a.lat, originLng: a.lng, destCity: b.name, destLat: b.lat, destLng: b.lng, material, weightKg: kg, vehicleType: vt,
      pickupDate: new Date(now.getTime() + pickupInHours * H).toISOString(), targetPrice: price, status, isPublic: true, awardedBidId: null, tripId: null,
      createdAt: iso(Math.floor(rand() * 20) * H),
    };
    loads.push(l);
    return l;
  };
  const l1 = load('Bhiwandi Textile Traders', 'Mumbai', 'Indore', 'Cotton fabric rolls', 6500, 'TRUCK_19FT', 10, 36000);
  load('Navi Mumbai FMCG Depot', 'Mumbai', 'Ratlam', 'Packaged foods', 5800, null, 20, 34000);
  const l3 = load('Pune Auto Parts Pvt Ltd', 'Pune', 'Indore', 'Auto components', 8200, 'TRUCK_22FT', 30, 44000);
  load('Udaipur Marble House', 'Udaipur', 'Delhi', 'Marble slabs', 22000, 'TRAILER_40FT', 18, 88000);
  load('Kota Stone Exporters', 'Kota', 'Hyderabad', 'Kota stone tiles', 14000, 'CONTAINER_32FT_MXL', 36, 105000);
  load('Surat Synthetics', 'Surat', 'Jaipur', 'Polyester yarn', 6800, 'TRUCK_19FT', 14, 41000);
  load('Bhilwara Spinning Mills', 'Bhilwara', 'Ludhiana', 'Yarn cones', 3600, 'LCV_14FT', 26, 39000);
  load('Indore Soya Processors', 'Indore', 'Nagpur', 'Soya meal bags', 9800, 'TRUCK_22FT', 40, 42000);
  load('Ahmedabad Chemicals Ltd', 'Ahmedabad', 'Ratlam', 'Industrial chemicals (non-hazardous)', 7200, 'CONTAINER_32FT_SXL', 22, 33000);
  load('Delhi Electronics Mart', 'Delhi', 'Jaipur', 'Consumer electronics', 2800, 'LCV_14FT', 8, 21000);
  load('Malwa Agro Foods', 'Ratlam', 'Mumbai', 'Wheat flour bags', 14500, 'CONTAINER_32FT_MXL', -8, 72000, 'BOOKED');

  const bid = (l: LoadRec, carrier: string, amount: number, etaHours: number, status: BidRec['status'] = 'PENDING'): BidRec => {
    const b: BidRec = { id: id(), loadId: l.id, orgId: o, carrierName: carrier, carrierPhone: `94${Math.floor(10000000 + rand() * 89999999)}`, vehicleId: null, amount, etaHours, note: null, status, createdAt: iso(Math.floor(rand() * 10) * H) };
    bids.push(b);
    return b;
  };
  bid(l1, 'Shivam Roadlines', 37500, 18);
  bid(l1, 'Marwar Transport Co.', 35500, 20);
  bid(l3, 'Om Sai Logistics', 45500, 22);

  // Facilities and warehouse stock.
  const fac = (type: FacilityRec['type'], code: string, name: string, city: string, sqft: number): FacilityRec => {
    const c = requireCity(city);
    return { id: id(), orgId: o, type, code, name, city: c.name, lat: c.lat, lng: c.lng, capacitySqft: sqft, createdAt };
  };
  const facilities = [
    fac('HUB', 'JPR-H1', 'Jaipur Hub (Sitapura)', 'Jaipur', 18000),
    fac('HUB', 'RTM-H1', 'Ratlam Hub', 'Ratlam', 8000),
    fac('HUB', 'AMD-H1', 'Ahmedabad Hub (Aslali)', 'Ahmedabad', 15000),
    fac('WAREHOUSE', 'IDR-W1', 'Indore Warehouse (Sanwer Road)', 'Indore', 42000),
  ];
  const wh = facilities[3]!;
  const items: InventoryItemRec[] = [];
  const item = (sku: string, name: string, client: string, qty: number, unit: string, bin: string, reorder: number) =>
    items.push({ id: id(), orgId: o, facilityId: wh.id, sku, name, clientName: client, qty, unit, bin, reorderLevel: reorder, updatedAt: iso(Math.floor(rand() * 72) * H) });
  item('IPD-PCM-500', 'Paracetamol 500 mg (box of 100 strips)', pharma.name, 420, 'box', 'A-01-1', 150);
  item('IPD-ORS-21', 'ORS sachets (carton of 200)', pharma.name, 86, 'carton', 'A-01-2', 100);
  item('IPD-AMX-250', 'Amoxicillin 250 mg (box)', pharma.name, 260, 'box', 'A-02-1', 120);
  item('IPD-SYR-100', 'Cough syrup 100 ml (carton of 48)', pharma.name, 44, 'carton', 'A-02-3', 60);
  item('IPD-GLV-L', 'Nitrile gloves L (box of 100)', pharma.name, 910, 'box', 'A-03-1', 300);
  item('BK-TSH-M-BLU', 'Cotton T-shirt, M, blue', bharatkart.name, 1340, 'pcs', 'B-01-1', 400);
  item('BK-TSH-L-BLK', 'Cotton T-shirt, L, black', bharatkart.name, 260, 'pcs', 'B-01-2', 400);
  item('BK-KUR-XL', 'Printed kurta, XL', bharatkart.name, 520, 'pcs', 'B-02-1', 200);
  item('BK-BTL-1L', 'Steel water bottle 1 L', bharatkart.name, 75, 'pcs', 'B-03-1', 150);
  item('BK-BAG-JUT', 'Jute shopping bag', bharatkart.name, 2100, 'pcs', 'B-03-4', 500);
  item('MAF-ATA-10', 'Wheat flour 10 kg bag', malwa.name, 3200, 'bag', 'C-01-1', 1000);
  item('MAF-SOY-1L', 'Soybean oil 1 L pouch (carton of 12)', malwa.name, 640, 'carton', 'C-02-1', 250);
  item('MAF-POH-500', 'Indori poha 500 g (carton of 20)', malwa.name, 180, 'carton', 'C-02-2', 200);
  item('MAF-NMK-200', 'Ratlami sev 200 g (carton of 40)', malwa.name, 390, 'carton', 'C-03-1', 150);
  const moves: StockMoveRec[] = [];
  items.slice(0, 10).forEach((it, i) => {
    moves.push({ id: id(), orgId: o, itemId: it.id, type: i % 3 === 0 ? 'OUTBOUND' : 'INBOUND', qty: 20 + Math.floor(rand() * 200), ref: i % 3 === 0 ? `SO-${4100 + i}` : `GRN-${2200 + i}`, at: iso((i + 1) * 5 * H) });
  });

  // Invoices from delivered freight.
  const deliveredFreight = shipments.filter((s) => s.status === 'DELIVERED' && s.service !== 'COURIER');
  const invoices: InvoiceRec[] = [];
  const byCustomer = new Map<string, ShipmentRec[]>();
  for (const s of deliveredFreight) byCustomer.set(s.shipperName, [...(byCustomer.get(s.shipperName) ?? []), s]);
  let seq = 1;
  for (const [name, list] of byCustomer) {
    const c = customers.find((x) => x.name === name)!;
    const subtotal = list.reduce((sum, s) => sum + Math.round((s.price * 100) / (100 + s.gstRate)), 0);
    const gstRate = list[0]!.gstRate;
    const gst = Math.round((subtotal * gstRate) / 100);
    const createdMs = now.getTime() - (40 - seq * 7) * D;
    const status: InvoiceRec['status'] = seq === 1 ? 'PAID' : seq === 2 ? 'PAID' : seq === 3 ? 'SENT' : 'DRAFT';
    const inv: InvoiceRec = {
      id: id(), orgId: o, invoiceNo: invoiceNumber(seq, new Date(createdMs)), customerName: name, customerGstin: c.gstin, shipmentIds: list.map((s) => s.id),
      subtotal, gstRate, gst, total: subtotal + gst, status, dueDate: new Date(createdMs + 15 * D).toISOString().slice(0, 10), createdAt: new Date(createdMs).toISOString(),
    };
    list.forEach((s) => (s.invoiceId = inv.id));
    invoices.push(inv);
    seq++;
  }

  return { org, users, customers, vehicles, drivers, trips, pings, shipments, events, loads, bids, facilities, items, moves, invoices };
}
