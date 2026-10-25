// Shared domain vocabulary for every SurajLogistic module.

export const SERVICES = ['COURIER', 'PTL', 'FTL'] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_LABEL: Record<Service, string> = {
  COURIER: 'Courier / parcel',
  PTL: 'Part truckload (PTL)',
  FTL: 'Full truckload (FTL)',
};

export const PAYMENT_MODES = ['PREPAID', 'COD', 'TO_PAY'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const SHIPMENT_STATUSES = [
  'REQUESTED',
  'BOOKED',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'NDR',
  'RTO',
  'RTO_DELIVERED',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  REQUESTED: 'Booking requested',
  BOOKED: 'Booked',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  AT_HUB: 'At hub',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  NDR: 'Delivery failed (NDR)',
  RTO: 'Returning to origin',
  RTO_DELIVERED: 'Returned to shipper',
  CANCELLED: 'Cancelled',
};

export const STATUS_LABEL_HI: Record<ShipmentStatus, string> = {
  REQUESTED: 'बुकिंग का अनुरोध',
  BOOKED: 'बुक हुआ',
  PICKED_UP: 'पिकअप हुआ',
  IN_TRANSIT: 'रास्ते में',
  AT_HUB: 'हब पर',
  OUT_FOR_DELIVERY: 'डिलीवरी के लिए निकला',
  DELIVERED: 'डिलीवर हुआ',
  NDR: 'डिलीवरी नहीं हुई',
  RTO: 'वापस भेजा जा रहा',
  RTO_DELIVERED: 'भेजने वाले को लौटाया',
  CANCELLED: 'रद्द',
};

/** Which next states are allowed from each state, per service. FTL skips hubs and last-mile. */
const COMMON: Partial<Record<ShipmentStatus, ShipmentStatus[]>> = {
  // A booking made on the website without a login waits for the team to confirm it.
  REQUESTED: ['BOOKED', 'CANCELLED'],
  BOOKED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT'],
  NDR: ['OUT_FOR_DELIVERY', 'RTO'],
  RTO: ['RTO_DELIVERED'],
};

const TRANSITIONS: Record<Service, Partial<Record<ShipmentStatus, ShipmentStatus[]>>> = {
  COURIER: {
    ...COMMON,
    IN_TRANSIT: ['AT_HUB', 'OUT_FOR_DELIVERY'],
    AT_HUB: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'NDR'],
  },
  PTL: {
    ...COMMON,
    IN_TRANSIT: ['AT_HUB', 'OUT_FOR_DELIVERY'],
    AT_HUB: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'NDR'],
  },
  FTL: {
    ...COMMON,
    IN_TRANSIT: ['DELIVERED', 'NDR'],
  },
};

export function nextStatuses(service: Service, from: ShipmentStatus): ShipmentStatus[] {
  return TRANSITIONS[service][from] ?? [];
}

export function canTransition(service: Service, from: ShipmentStatus, to: ShipmentStatus): boolean {
  return nextStatuses(service, from).includes(to);
}

export const ACTIVE_STATUSES: ShipmentStatus[] = ['REQUESTED', 'BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'NDR', 'RTO'];
export const MOVING_STATUSES: ShipmentStatus[] = ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'RTO'];

export const ROLES = ['admin', 'ops', 'driver', 'customer', 'warehouse', 'partner'] as const;
export type Role = (typeof ROLES)[number];

/** People who can ask to join from the website. The owner approves each one. */
export const JOIN_ROLES = ['partner', 'driver', 'customer', 'warehouse'] as const;
export type JoinRole = (typeof JOIN_ROLES)[number];
export const JOIN_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type JoinStatus = (typeof JOIN_STATUSES)[number];

export const VEHICLE_STATUSES = ['IDLE', 'ON_TRIP', 'MAINTENANCE'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const OWNERSHIP = ['OWN', 'ATTACHED', 'MARKET'] as const;
export type Ownership = (typeof OWNERSHIP)[number];

export const TRIP_STATUSES = ['PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const LOAD_STATUSES = ['OPEN', 'BOOKED', 'CANCELLED'] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const BID_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

export const STOCK_MOVE_TYPES = ['INBOUND', 'OUTBOUND', 'ADJUST'] as const;
export type StockMoveType = (typeof STOCK_MOVE_TYPES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const MODULES = ['trucking', 'courier', 'marketplace', 'warehouse', 'billing'] as const;
export type ModuleKey = (typeof MODULES)[number];

export interface Point {
  lat: number;
  lng: number;
}

/** Documents a commercial vehicle in India must keep valid. Dates are ISO yyyy-mm-dd. */
export interface VehicleDocs {
  insurance?: string;
  fitness?: string;
  permit?: string;
  puc?: string;
  roadTax?: string;
}
