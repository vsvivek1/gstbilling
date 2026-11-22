CREATE TABLE "invoice_counters" (
	"series" text NOT NULL,
	"fy" text NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "invoice_counters_series_fy_pk" PRIMARY KEY("series","fy")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series" text NOT NULL,
	"number" text NOT NULL,
	"fy" text NOT NULL,
	"seq" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_ref" text,
	"payment_method" text,
	"order_id" text,
	"customer_ref" text,
	"product" text NOT NULL,
	"description" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_email" text,
	"buyer_phone" text,
	"buyer_gstin" text,
	"buyer_address" text,
	"place_of_supply" text NOT NULL,
	"seller_gstin" text NOT NULL,
	"seller_state" text NOT NULL,
	"sac" text NOT NULL,
	"rate_percent" integer NOT NULL,
	"taxable_paise" integer NOT NULL,
	"cgst_paise" integer NOT NULL,
	"sgst_paise" integer NOT NULL,
	"igst_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"emailed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_series_fy_seq_idx" ON "invoices" USING btree ("series","fy","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_series_payment_idx" ON "invoices" USING btree ("series","payment_ref") WHERE "invoices"."payment_ref" is not null;--> statement-breakpoint
CREATE INDEX "invoices_issued_idx" ON "invoices" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("series","customer_ref");