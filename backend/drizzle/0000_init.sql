CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"carrier_name" text NOT NULL,
	"carrier_phone" text,
	"vehicle_id" uuid,
	"amount" integer NOT NULL,
	"eta_hours" double precision NOT NULL,
	"note" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gstin" text,
	"phone" text,
	"email" text,
	"city" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"license_no" text NOT NULL,
	"license_expiry" date NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"rating" double precision DEFAULT 4.5 NOT NULL,
	"lang" text DEFAULT 'hi' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"capacity_sqft" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmph" double precision DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"client_name" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"bin" text NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_gstin" text,
	"shipment_ids" jsonb NOT NULL,
	"subtotal" integer NOT NULL,
	"gst_rate" double precision NOT NULL,
	"gst" integer NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"load_no" text NOT NULL,
	"posted_by" text NOT NULL,
	"contact_phone" text,
	"origin_city" text NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"dest_city" text NOT NULL,
	"dest_lat" double precision NOT NULL,
	"dest_lng" double precision NOT NULL,
	"material" text NOT NULL,
	"weight_kg" double precision NOT NULL,
	"vehicle_type" text,
	"pickup_date" timestamp with time zone NOT NULL,
	"target_price" integer NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"awarded_bid_id" uuid,
	"trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"gstin" text,
	"plan" text DEFAULT 'Free' NOT NULL,
	"modules" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text NOT NULL,
	"city" text,
	"lat" double precision,
	"lng" double precision,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"awb" text NOT NULL,
	"service" text NOT NULL,
	"status" text DEFAULT 'BOOKED' NOT NULL,
	"customer_id" uuid,
	"shipper_name" text NOT NULL,
	"shipper_phone" text,
	"consignee_name" text NOT NULL,
	"consignee_phone" text NOT NULL,
	"consignee_address" text NOT NULL,
	"origin_city" text NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"dest_city" text NOT NULL,
	"dest_lat" double precision NOT NULL,
	"dest_lng" double precision NOT NULL,
	"weight_kg" double precision NOT NULL,
	"packages" integer DEFAULT 1 NOT NULL,
	"declared_value" integer DEFAULT 0 NOT NULL,
	"payment_mode" text NOT NULL,
	"cod_amount" integer DEFAULT 0 NOT NULL,
	"cod_collected" boolean DEFAULT false NOT NULL,
	"price" integer NOT NULL,
	"price_breakup" jsonb NOT NULL,
	"gst_rate" double precision NOT NULL,
	"distance_km" integer NOT NULL,
	"co2_kg" double precision DEFAULT 0 NOT NULL,
	"rto_score" integer DEFAULT 0 NOT NULL,
	"rto_level" text DEFAULT 'LOW' NOT NULL,
	"ewaybill_required" boolean DEFAULT false NOT NULL,
	"ewaybill_no" text,
	"vehicle_type" text,
	"trip_id" uuid,
	"invoice_id" uuid,
	"delivery_otp" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"current_lat" double precision NOT NULL,
	"current_lng" double precision NOT NULL,
	"promised_at" timestamp with time zone NOT NULL,
	"eta_at" timestamp with time zone NOT NULL,
	"pod_receiver" text,
	"pod_photo_url" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"qty" integer NOT NULL,
	"ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trip_no" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"origin_city" text NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"dest_city" text NOT NULL,
	"dest_lat" double precision NOT NULL,
	"dest_lng" double precision NOT NULL,
	"planned_km" integer NOT NULL,
	"actual_km" integer,
	"freight_amount" integer DEFAULT 0 NOT NULL,
	"fuel_cost" integer DEFAULT 0 NOT NULL,
	"toll_cost" integer DEFAULT 0 NOT NULL,
	"driver_advance" integer DEFAULT 0 NOT NULL,
	"other_cost" integer DEFAULT 0 NOT NULL,
	"current_lat" double precision NOT NULL,
	"current_lng" double precision NOT NULL,
	"progress" double precision DEFAULT 0 NOT NULL,
	"eta_at" timestamp with time zone NOT NULL,
	"promised_at" timestamp with time zone NOT NULL,
	"load_id" uuid,
	"planned_start" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"password_hash" text NOT NULL,
	"customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reg_no" text NOT NULL,
	"type" text NOT NULL,
	"ownership" text DEFAULT 'OWN' NOT NULL,
	"status" text DEFAULT 'IDLE' NOT NULL,
	"capacity_kg" integer NOT NULL,
	"city" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"kmpl" double precision NOT NULL,
	"odometer_km" integer DEFAULT 0 NOT NULL,
	"docs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_ping_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_pings" ADD CONSTRAINT "gps_pings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_pings" ADD CONSTRAINT "gps_pings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bids_load_idx" ON "bids" USING btree ("load_id");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "drivers_org_idx" ON "drivers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "gps_trip_at_idx" ON "gps_pings" USING btree ("trip_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "items_facility_sku_uq" ON "inventory_items" USING btree ("facility_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_no_uq" ON "invoices" USING btree ("org_id","invoice_no");--> statement-breakpoint
CREATE INDEX "loads_status_idx" ON "loads" USING btree ("status","is_public");--> statement-breakpoint
CREATE INDEX "events_shipment_idx" ON "shipment_events" USING btree ("shipment_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_awb_uq" ON "shipments" USING btree ("awb");--> statement-breakpoint
CREATE INDEX "shipments_org_status_idx" ON "shipments" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "shipments_trip_idx" ON "shipments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trips_org_status_idx" ON "trips" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "vehicles_org_idx" ON "vehicles" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_org_reg_uq" ON "vehicles" USING btree ("org_id","reg_no");