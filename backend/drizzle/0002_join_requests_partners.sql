CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"city" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"user_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "hire_amount" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "hire_advance" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "hire_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "join_requests_org_status_idx" ON "join_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "join_requests_phone_idx" ON "join_requests" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "vehicles_partner_idx" ON "vehicles" USING btree ("partner_id");