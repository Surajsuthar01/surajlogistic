import { boolean, customType, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { JoinDetails, ModuleKey, OrgSettings, QuoteLine, VehicleDocs } from '@suraj/shared';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();

/** Raw bytes. node-postgres returns a Buffer, PGlite a Uint8Array; callers wrap with Buffer.from. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  gstin: text('gstin'),
  plan: text('plan').notNull().default('Free'),
  modules: jsonb('modules').$type<ModuleKey[]>().notNull(),
  settings: jsonb('settings').$type<OrgSettings>().notNull(),
  createdAt: created(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    role: text('role').notNull(),
    lang: text('lang').notNull().default('en'),
    passwordHash: text('password_hash').notNull(),
    /** Logins issued before this moment stop working (set when the password changes). */
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    customerId: uuid('customer_id'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gstin: text('gstin'),
    phone: text('phone'),
    email: text('email'),
    city: text('city').notNull(),
    address: text('address'),
    creditDays: integer('credit_days'),
    createdAt: created(),
  },
  (t) => [index('customers_org_idx').on(t.orgId)],
);

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    regNo: text('reg_no').notNull(),
    type: text('type').notNull(),
    ownership: text('ownership').notNull().default('OWN'),
    status: text('status').notNull().default('IDLE'),
    capacityKg: integer('capacity_kg').notNull(),
    city: text('city').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    kmpl: doublePrecision('kmpl').notNull(),
    odometerKm: integer('odometer_km').notNull().default(0),
    docs: jsonb('docs').$type<VehicleDocs>().notNull().default({}),
    lastPingAt: ts('last_ping_at'),
    /** The truck owner's login, for trucks attached to the company. */
    partnerId: uuid('partner_id'),
    createdAt: created(),
  },
  (t) => [index('vehicles_org_idx').on(t.orgId), uniqueIndex('vehicles_org_reg_uq').on(t.orgId, t.regNo), index('vehicles_partner_idx').on(t.partnerId)],
);

export const drivers = pgTable(
  'drivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    licenseNo: text('license_no').notNull(),
    licenseExpiry: date('license_expiry', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('AVAILABLE'),
    rating: doublePrecision('rating').notNull().default(4.5),
    lang: text('lang').notNull().default('hi'),
    createdAt: created(),
  },
  (t) => [index('drivers_org_idx').on(t.orgId)],
);

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    tripNo: text('trip_no').notNull(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    driverId: uuid('driver_id').notNull().references(() => drivers.id),
    status: text('status').notNull().default('PLANNED'),
    originCity: text('origin_city').notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    originLng: doublePrecision('origin_lng').notNull(),
    destCity: text('dest_city').notNull(),
    destLat: doublePrecision('dest_lat').notNull(),
    destLng: doublePrecision('dest_lng').notNull(),
    plannedKm: integer('planned_km').notNull(),
    actualKm: integer('actual_km'),
    freightAmount: integer('freight_amount').notNull().default(0),
    fuelCost: integer('fuel_cost').notNull().default(0),
    tollCost: integer('toll_cost').notNull().default(0),
    driverAdvance: integer('driver_advance').notNull().default(0),
    otherCost: integer('other_cost').notNull().default(0),
    currentLat: doublePrecision('current_lat').notNull(),
    currentLng: doublePrecision('current_lng').notNull(),
    progress: doublePrecision('progress').notNull().default(0),
    etaAt: ts('eta_at').notNull(),
    promisedAt: ts('promised_at').notNull(),
    loadId: uuid('load_id'),
    plannedStart: ts('planned_start').notNull(),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    /** Lorry hire agreed with the owner of an attached truck, the advance paid at loading, and when the balance was paid. */
    hireAmount: integer('hire_amount'),
    hireAdvance: integer('hire_advance'),
    hireSettledAt: ts('hire_settled_at'),
    createdAt: created(),
  },
  (t) => [index('trips_org_status_idx').on(t.orgId, t.status)],
);

export const gpsPings = pgTable(
  'gps_pings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    vehicleId: uuid('vehicle_id').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    speedKmph: doublePrecision('speed_kmph').notNull().default(0),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('gps_trip_at_idx').on(t.tripId, t.at)],
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    awb: text('awb').notNull(),
    service: text('service').notNull(),
    status: text('status').notNull().default('BOOKED'),
    customerId: uuid('customer_id'),
    shipperName: text('shipper_name').notNull(),
    shipperPhone: text('shipper_phone'),
    consigneeName: text('consignee_name').notNull(),
    consigneePhone: text('consignee_phone').notNull(),
    consigneeAddress: text('consignee_address').notNull(),
    originCity: text('origin_city').notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    originLng: doublePrecision('origin_lng').notNull(),
    destCity: text('dest_city').notNull(),
    destLat: doublePrecision('dest_lat').notNull(),
    destLng: doublePrecision('dest_lng').notNull(),
    weightKg: doublePrecision('weight_kg').notNull(),
    packages: integer('packages').notNull().default(1),
    declaredValue: integer('declared_value').notNull().default(0),
    paymentMode: text('payment_mode').notNull(),
    codAmount: integer('cod_amount').notNull().default(0),
    codCollected: boolean('cod_collected').notNull().default(false),
    price: integer('price').notNull(),
    priceBreakup: jsonb('price_breakup').$type<QuoteLine[]>().notNull(),
    gstRate: doublePrecision('gst_rate').notNull(),
    distanceKm: integer('distance_km').notNull(),
    co2Kg: doublePrecision('co2_kg').notNull().default(0),
    rtoScore: integer('rto_score').notNull().default(0),
    rtoLevel: text('rto_level').notNull().default('LOW'),
    ewaybillRequired: boolean('ewaybill_required').notNull().default(false),
    ewaybillNo: text('ewaybill_no'),
    vehicleType: text('vehicle_type'),
    tripId: uuid('trip_id'),
    invoiceId: uuid('invoice_id'),
    deliveryOtp: text('delivery_otp').notNull(),
    attempts: integer('attempts').notNull().default(0),
    currentLat: doublePrecision('current_lat').notNull(),
    currentLng: doublePrecision('current_lng').notNull(),
    promisedAt: ts('promised_at').notNull(),
    etaAt: ts('eta_at').notNull(),
    podReceiver: text('pod_receiver'),
    podPhotoUrl: text('pod_photo_url'),
    podSignatureUrl: text('pod_signature_url'),
    pickupAddress: text('pickup_address'),
    contents: text('contents'),
    shipperInvoiceNo: text('shipper_invoice_no'),
    deliveredAt: ts('delivered_at'),
    createdAt: created(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('shipments_awb_uq').on(t.awb), index('shipments_org_status_idx').on(t.orgId, t.status), index('shipments_trip_idx').on(t.tripId)],
);

export const shipmentEvents = pgTable(
  'shipment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id').notNull().references(() => shipments.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    note: text('note').notNull(),
    city: text('city'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('events_shipment_idx').on(t.shipmentId, t.at)],
);

export const loads = pgTable(
  'loads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    loadNo: text('load_no').notNull(),
    postedBy: text('posted_by').notNull(),
    contactPhone: text('contact_phone'),
    originCity: text('origin_city').notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    originLng: doublePrecision('origin_lng').notNull(),
    destCity: text('dest_city').notNull(),
    destLat: doublePrecision('dest_lat').notNull(),
    destLng: doublePrecision('dest_lng').notNull(),
    material: text('material').notNull(),
    weightKg: doublePrecision('weight_kg').notNull(),
    vehicleType: text('vehicle_type'),
    pickupDate: ts('pickup_date').notNull(),
    targetPrice: integer('target_price').notNull(),
    status: text('status').notNull().default('OPEN'),
    isPublic: boolean('is_public').notNull().default(true),
    awardedBidId: uuid('awarded_bid_id'),
    tripId: uuid('trip_id'),
    createdAt: created(),
  },
  (t) => [index('loads_status_idx').on(t.status, t.isPublic)],
);

export const bids = pgTable(
  'bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loadId: uuid('load_id').notNull().references(() => loads.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    carrierName: text('carrier_name').notNull(),
    carrierPhone: text('carrier_phone'),
    vehicleId: uuid('vehicle_id'),
    amount: integer('amount').notNull(),
    etaHours: doublePrecision('eta_hours').notNull(),
    note: text('note'),
    status: text('status').notNull().default('PENDING'),
    createdAt: created(),
  },
  (t) => [index('bids_load_idx').on(t.loadId)],
);

export const facilities = pgTable('facilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  capacitySqft: integer('capacity_sqft').notNull().default(0),
  createdAt: created(),
});

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    facilityId: uuid('facility_id').notNull().references(() => facilities.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    clientName: text('client_name').notNull(),
    qty: integer('qty').notNull().default(0),
    unit: text('unit').notNull().default('pcs'),
    bin: text('bin').notNull(),
    reorderLevel: integer('reorder_level').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('items_facility_sku_uq').on(t.facilityId, t.sku)],
);

export const stockMoves = pgTable('stock_moves', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  qty: integer('qty').notNull(),
  ref: text('ref'),
  at: ts('at').notNull().defaultNow(),
});

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    invoiceNo: text('invoice_no').notNull(),
    customerId: uuid('customer_id'),
    customerName: text('customer_name').notNull(),
    customerGstin: text('customer_gstin'),
    shipmentIds: jsonb('shipment_ids').$type<string[]>().notNull(),
    subtotal: integer('subtotal').notNull(),
    gstRate: doublePrecision('gst_rate').notNull(),
    gst: integer('gst').notNull(),
    total: integer('total').notNull(),
    status: text('status').notNull().default('DRAFT'),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    paidAt: ts('paid_at'),
    paymentMode: text('payment_mode'),
    paymentRef: text('payment_ref'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('invoices_org_no_uq').on(t.orgId, t.invoiceNo)],
);

/** Photos and signatures: proof of delivery, fuel slips. Served only through signed links. */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
    createdBy: uuid('created_by'),
    createdAt: created(),
  },
  (t) => [index('files_org_idx').on(t.orgId)],
);

/** What the driver spends on the road: diesel, tolls, food, repairs. */
export const tripExpenses = pgTable(
  'trip_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    amount: integer('amount').notNull(),
    note: text('note'),
    photoFileId: uuid('photo_file_id'),
    createdBy: uuid('created_by'),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('expenses_trip_idx').on(t.tripId)],
);

/** Every WhatsApp/SMS sent (or that would have been sent, in mock mode). */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('whatsapp'),
    to: text('to').notNull(),
    template: text('template').notNull(),
    text: text('text').notNull(),
    status: text('status').notNull().default('SENT'),
    shipmentId: uuid('shipment_id'),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('messages_org_at_idx').on(t.orgId, t.at)],
);

/** Keys for customers' own systems to book and track. Only a SHA-256 of the key is kept. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    createdBy: uuid('created_by'),
    createdAt: created(),
    lastUsedAt: ts('last_used_at'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('api_keys_hash_uq').on(t.keyHash)],
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().notNull(),
    secret: text('secret').notNull(),
    active: boolean('active').notNull().default(true),
    lastStatus: integer('last_status'),
    lastAt: ts('last_at'),
    failCount: integer('fail_count').notNull().default(0),
    createdAt: created(),
  },
  (t) => [index('webhooks_org_idx').on(t.orgId)],
);

/** People who asked to join from the website. Nobody can log in until the owner approves. */
export const joinRequests = pgTable(
  'join_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    city: text('city').notNull(),
    details: jsonb('details').$type<JoinDetails>().notNull().default({}),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('PENDING'),
    note: text('note'),
    userId: uuid('user_id'),
    decidedBy: uuid('decided_by'),
    decidedAt: ts('decided_at'),
    createdAt: created(),
  },
  (t) => [index('join_requests_org_status_idx').on(t.orgId, t.status), index('join_requests_phone_idx').on(t.phone)],
);
