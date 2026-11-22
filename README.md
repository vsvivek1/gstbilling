# Calecute GST billing

One GST billing service for every Calecute Technologies app (QuizKerala,
Recallio / Spaced Loop, ...) and for sales made outside the apps.

- **Apps send payments here.** After a payment is captured, the app calls
  `POST /api/invoices`. The bill is numbered, saved, emailed to the buyer, and
  its link is returned for the app to show.
- **One series per app** under the one GSTIN (CGST Rule 46(b) allows several
  series, each consecutive per financial year): `QK/26-27/000001`,
  `RC/26-27/000001`, and `MN/26-27/000001` for manual bills.
- **Admin** (`/admin`, password): every bill by month and app, totals, a
  form for manual bills (B2B with the buyer's GSTIN, or B2C; price with or
  without GST), and one GSTR-1 CSV across all apps (Tables 4 B2B, 5 B2C large,
  7 B2C others, 12 SAC summary split B2B/B2C, 13 documents issued per series).
- **Tax:** SAC 999293 at 18% by default. Buyer in Kerala (the seller's state)
  → CGST 9% + SGST 9%; any other state → IGST 18%. A registered buyer is taxed
  in their GSTIN's state. With no state given, the seller's state is used.
- **Records:** bills are never edited or deleted (keep for 72 months).

## Set up (Vercel)

1. Import this repo as a new Vercel project.
2. Add a Postgres database (Neon from the Vercel Marketplace); it sets `DATABASE_URL`.
3. Set the environment variables in `.env.example`: `AUTH_SECRET`,
   `ADMIN_PASSWORD`, `PUBLIC_URL`, `BILLING_APPS`, `GST_GSTIN`, `GST_ADDRESS`
   and the email settings.
4. Deploy. Migrations run in `vercel-build`.

Each app gets a key in `BILLING_APPS` (`SERIES:Name:KEY;...`). Make keys with
`openssl rand -hex 24`. A key can only issue bills in its own series.

## API

All calls send `Authorization: Bearer <app key>`. Amounts are in paise (₹1 = 100).

### Issue a bill

```http
POST /api/invoices
Content-Type: application/json

{
  "paymentRef": "pay_Nk3s9...",        // required; one bill per paymentRef per app
  "paymentMethod": "Razorpay",          // optional, default "Razorpay"
  "orderId": "order_Nk3...",            // optional
  "customerRef": "user_123",            // optional: the buyer's id in your app
  "product": "uss",                     // short product code
  "description": "USS course, 1 year",  // printed on the bill
  "amountPaise": 39900,                 // amount paid
  "amountIncludesGst": true,            // default true: GST is inside the amount
  "buyer": {
    "name": "Anu",
    "email": "anu@example.com",         // optional: the bill is emailed here
    "phone": "9xxxxxxxxx",              // optional
    "state": "32",                      // optional GST state code (32 = Kerala)
    "gstin": null,                      // optional: registered buyer (B2B)
    "address": null                     // optional
  },
  "sendEmail": true                     // default true
}
```

- `201` new bill, `200` a bill for this `paymentRef` already existed (safe to retry),
  `400` invalid input (`issues` lists what), `401` bad key, `503` GSTIN/address not set yet.
- Answer: `{ "invoice": { "id", "number", "issuedAt", "totalPaise", "total", "url", ... }, "created": true }`.
  `url` is the bill's private printable link; show it to the buyer.

### List bills

- `GET /api/invoices?customerRef=user_123`: that buyer's bills in your app, newest first.
- `GET /api/invoices?paymentRef=pay_...`: the bill for one payment (404 if none).

### Example: Supabase Edge Function (Recallio / Spaced Loop)

```ts
await fetch(`${Deno.env.get("BILLING_URL")}/api/invoices`, {
  method: "POST",
  headers: { authorization: `Bearer ${Deno.env.get("BILLING_KEY")}`, "content-type": "application/json" },
  body: JSON.stringify({
    paymentRef: payment.id,
    customerRef: user.id,
    product: "uss",
    description: "Recallio USS course",
    amountPaise: payment.amount,
    buyer: { name: profile.name, email: user.email, state: profile.state },
  }),
});
```

Call it from the Razorpay webhook (`payment.captured`) and, if you like, also
from the checkout handler: the second call returns the same bill.

## Develop

```sh
pnpm install
cp .env.example .env.local   # point DATABASE_URL at a local Postgres
pnpm db:migrate
pnpm dev
pnpm test                    # needs Postgres; uses TEST_DATABASE_URL (default gstbilling_test, wiped)
pnpm typecheck && pnpm lint
```

## Not yet

- Credit notes for refunds.
- Export invoices (Stripe / USD sales under LUT).
- More than one line per bill.
