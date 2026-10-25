// Plain record shapes shared by the API (database rows) and the web demo store.
import type { GstConfig, QuoteLine } from './pricing';
import type {
  BidStatus,
  InvoiceStatus,
  JoinRole,
  JoinStatus,
  LoadStatus,
  ModuleKey,
  Ownership,
  PaymentMode,
  Role,
  Service,
  ShipmentStatus,
  StockMoveType,
  TripStatus,
  VehicleDocs,
  VehicleStatus,
} from './types';
import type { VehicleType } from './vehicles';

export interface OrgProfile {
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
}

export interface OrgBank {
  name?: string;
  account?: string;
  ifsc?: string;
  upi?: string;
}

/** Which WhatsApp/SMS messages go out automatically. Missing means on. */
export interface OrgNotify {
  booked?: boolean;
  outForDelivery?: boolean;
  delivered?: boolean;
  failed?: boolean;
}

export interface OrgSettings {
  dieselPrice: number;
  gst: GstConfig;
  brandColor?: string;
  profile?: OrgProfile;
  bank?: OrgBank;
  notify?: OrgNotify;
  /** Days a customer has to pay an invoice. */
  paymentTermsDays?: number;
}

export interface OrgRec {
  id: string;
  name: string;
  slug: string;
  gstin: string | null;
  plan: string;
  modules: ModuleKey[];
  settings: OrgSettings;
  createdAt: string;
}

export interface UserRec {
  id: string;
  orgId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  lang: 'en' | 'hi';
  passwordHash?: string;
  customerId?: string | null;
  createdAt: string;
}

export interface CustomerRec {
  id: string;
  orgId: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  city: string;
  address?: string | null;
  /** Days to pay an invoice; falls back to the company's payment terms. */
  creditDays?: number | null;
  createdAt: string;
}

export interface ShipmentRec {
  id: string;
  orgId: string;
  awb: string;
  service: Service;
  status: ShipmentStatus;
  customerId: string | null;
  shipperName: string;
  shipperPhone: string | null;
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  originCity: string;
  originLat: number;
  originLng: number;
  destCity: string;
  destLat: number;
  destLng: number;
  weightKg: number;
  packages: number;
  declaredValue: number;
  paymentMode: PaymentMode;
  codAmount: number;
  codCollected: boolean;
  price: number;
  priceBreakup: QuoteLine[];
  gstRate: number;
  distanceKm: number;
  co2Kg: number;
  rtoScore: number;
  rtoLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  ewaybillRequired: boolean;
  ewaybillNo: string | null;
  vehicleType: VehicleType | null;
  tripId: string | null;
  invoiceId: string | null;
  deliveryOtp: string;
  attempts: number;
  currentLat: number;
  currentLng: number;
  promisedAt: string;
  etaAt: string;
  podReceiver: string | null;
  podPhotoUrl: string | null;
  podSignatureUrl?: string | null;
  pickupAddress?: string | null;
  contents?: string | null;
  shipperInvoiceNo?: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentEventRec {
  id: string;
  orgId: string;
  shipmentId: string;
  status: ShipmentStatus;
  note: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  at: string;
}

export interface VehicleRec {
  id: string;
  orgId: string;
  regNo: string;
  type: VehicleType;
  ownership: Ownership;
  status: VehicleStatus;
  capacityKg: number;
  city: string;
  lat: number;
  lng: number;
  kmpl: number;
  odometerKm: number;
  docs: VehicleDocs;
  lastPingAt: string | null;
  /** The truck owner's login, for attached trucks. */
  partnerId?: string | null;
  createdAt: string;
}

export type DriverStatus = 'AVAILABLE' | 'ON_TRIP' | 'OFF';

export interface DriverRec {
  id: string;
  orgId: string;
  userId: string | null;
  name: string;
  phone: string;
  licenseNo: string;
  licenseExpiry: string;
  status: DriverStatus;
  rating: number;
  lang: 'en' | 'hi';
  createdAt: string;
}

export interface TripRec {
  id: string;
  orgId: string;
  tripNo: string;
  vehicleId: string;
  driverId: string;
  status: TripStatus;
  originCity: string;
  originLat: number;
  originLng: number;
  destCity: string;
  destLat: number;
  destLng: number;
  plannedKm: number;
  actualKm: number | null;
  freightAmount: number;
  fuelCost: number;
  tollCost: number;
  driverAdvance: number;
  otherCost: number;
  currentLat: number;
  currentLng: number;
  progress: number;
  etaAt: string;
  promisedAt: string;
  loadId: string | null;
  plannedStart: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Lorry hire agreed with the owner of an attached truck, the advance paid, and when the balance was paid. */
  hireAmount?: number;
  hireAdvance?: number;
  hireSettledAt?: string | null;
  createdAt: string;
}

export interface GpsPingRec {
  id: string;
  orgId: string;
  tripId: string;
  vehicleId: string;
  lat: number;
  lng: number;
  speedKmph: number;
  at: string;
}

export interface LoadRec {
  id: string;
  orgId: string;
  loadNo: string;
  postedBy: string;
  contactPhone: string | null;
  originCity: string;
  originLat: number;
  originLng: number;
  destCity: string;
  destLat: number;
  destLng: number;
  material: string;
  weightKg: number;
  vehicleType: VehicleType | null;
  pickupDate: string;
  targetPrice: number;
  status: LoadStatus;
  isPublic: boolean;
  awardedBidId: string | null;
  tripId: string | null;
  createdAt: string;
}

export interface BidRec {
  id: string;
  loadId: string;
  orgId: string;
  carrierName: string;
  carrierPhone: string | null;
  vehicleId: string | null;
  amount: number;
  etaHours: number;
  note: string | null;
  status: BidStatus;
  createdAt: string;
}

export interface FacilityRec {
  id: string;
  orgId: string;
  type: 'HUB' | 'WAREHOUSE';
  code: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  capacitySqft: number;
  createdAt: string;
}

export interface InventoryItemRec {
  id: string;
  orgId: string;
  facilityId: string;
  sku: string;
  name: string;
  clientName: string;
  qty: number;
  unit: string;
  bin: string;
  reorderLevel: number;
  updatedAt: string;
}

export interface StockMoveRec {
  id: string;
  orgId: string;
  itemId: string;
  type: StockMoveType;
  qty: number;
  ref: string | null;
  at: string;
}

export interface InvoiceRec {
  id: string;
  orgId: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName: string;
  customerGstin: string | null;
  shipmentIds: string[];
  subtotal: number;
  gstRate: number;
  gst: number;
  total: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string | null;
  createdAt: string;
}

/** What a person tells us when they ask to join. */
export interface JoinDetails {
  /** Drivers. */
  licenseNo?: string;
  licenseExpiry?: string;
  /** Customers. */
  companyName?: string;
  gstin?: string;
  address?: string;
  /** Truck owners. */
  trucks?: { regNo: string; type: VehicleType }[];
  /** Anything else they want the owner to know. */
  message?: string;
}

export interface JoinRequestRec {
  id: string;
  orgId: string;
  role: JoinRole;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  details: JoinDetails;
  status: JoinStatus;
  note: string | null;
  userId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface DemoDataset {
  org: OrgRec;
  users: UserRec[];
  customers: CustomerRec[];
  vehicles: VehicleRec[];
  drivers: DriverRec[];
  trips: TripRec[];
  pings: GpsPingRec[];
  shipments: ShipmentRec[];
  events: ShipmentEventRec[];
  loads: LoadRec[];
  bids: BidRec[];
  facilities: FacilityRec[];
  items: InventoryItemRec[];
  moves: StockMoveRec[];
  invoices: InvoiceRec[];
  joinRequests: JoinRequestRec[];
}
