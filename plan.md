# MÉMORA — Build Plan (reverse-engineered from Revila)

> Purpose of this file: a self-contained spec that any coding agent can pick up to build **Mémora** — a printed photo with an embedded NFC chip that opens a personal video when a phone touches it.
> Reference product: **Revila** (revila.fr / boutique.revila.fr / editeasy.revila.fr), analysed on 2026-10-11 by browsing the live site and reading its public front-end JS bundles.
> Brand context lives in `memoria.md` and `identity/` (logo, guidelines). Copy, colors and tone must come from there, **not** from Revila.

Legend: **[OBSERVED]** = seen directly on Revila. **[INFERRED]** = deduced from code/behaviour, not 100% confirmed. **[DECISION]** = a recommendation for Mémora that agents should follow unless the founders say otherwise.

---

## 0. TL;DR — the whole system in one picture

```
 Customer (desktop or phone)
   │
   ├─► Marketing site (static)         revila.fr        → Astro
   │
   ├─► Shop / order funnel (app)        boutique.*       → Next.js (App Router)
   │      1. Video  → resumable chunked upload → object storage (Cloudflare R2)
   │      2. Photo  → crop to print format (or grab a frame from the video)
   │      3. Cart   → quantities, formats, frames, gifts to several recipients
   │      4. Delivery (home / relay point / letter) → address autocomplete
   │      5. Payment (Stripe PaymentElement + Apple/Google Pay, manual capture)
   │      6. Confirmation → order number + emails
   │
   ├─► Auto-edit tool (separate app)    editeasy.*       → Python backend + vanilla JS
   │      photos+videos+music → server render job → MP4 → sent back into the shop draft
   │
   └─► Cross-device upload ("scan QR with your phone")   shared by shop + editor

 Back-office (not public) [INFERRED]
   order → print photo + program NFC tag with unique URL → ship → tracking email

 Recipient
   touches photo with phone → NFC opens https://<short-domain>/<tagId> → video plays (no app, no QR)
```

---

## 1. Product facts observed on Revila

### 1.1 Concept [OBSERVED]
- Printed photo with an invisible NFC chip. User places phone on the photo → a system notification appears → tap → video opens in the browser.
- Marketing claims: **no app, no QR code, iPhone and Android**. Usage instructions are printed **on the back** of every photo (so a gift recipient understands it alone).
- Use cases pushed: birth, family, pets, holidays, wedding, adventure; B2B: greeting cards, company anniversaries, inaugurations, events.
- "Pas de durée maximum pour la vidéo": **8 minutes included**, then a per-minute surcharge.
- Delivery in **5–7 days**. Data "secured, stored in Europe".

### 1.2 Product catalogue & prices [OBSERVED from UI + JS constants]
| Product | Base price | Notes |
|---|---|---|
| Revila Classique (photo card 10×15) | 14.50 € | NFC + video hosting + print included |
| Revila Magnet | 19.95 € | same + magnetic back |
| Revila 20×30 framed | 119 € | pre-order |
| Gift card | free amount (25/50/100/250/custom) | valid 12 months, balance usable over several orders; email free, postal +3 € |
| Custom format | quote | mailto link |

Volume pricing (price per unit, tier chosen by **total quantity**):

| Qty | Classique | Magnet |
|---|---|---|
| 1–4 | 14.50 | 19.95 |
| 5–9 | 12.50 (−14%) | 16.95 (−15%) |
| 10–49 | 9.50 (−34%) | 12.95 (−35%) |
| 50–99 | 7.50 (−48%) | 9.95 (−50%) |
| 100+ | 5.90 (−59%) | 7.95 (−60%) |
| >500 | quote | quote |

Code shape (from bundle):
```js
tiers = [{minQty:1,unitPriceTTC:19.95},{minQty:5,unitPriceTTC:16.95},...]
unitPrice(format, qty) = last tier where qty >= minQty
```

Other constants found in the bundle:
- Free shipping threshold: **79 €**.
- Video: `INCLUDED_SECONDS = 480`, `SURCHARGE_CENTS_PER_MIN = 50` (× quantity), `MAX_DURATION = 1800 s` (30 min; UI error "Ta vidéo dure plus de 30 minutes").
- Max upload size: **5 GB** desktop, **1.5 GB** via phone hand-off.
- Accepted video mimes: `video/mp4, video/quicktime, video/webm, video/x-matroska, video/x-msvideo`.
- Item weights (grams) for shipping calc: 10×15 = 32, 20×30 = 15, 30×45 = 25, magnet = 40; NFC chip 2 g + label 1 g; frames 10×15 = 140, 20×30 = 300, 30×45 = 450.
- Surcharge formula: `minutes = ceil((duration - 480)/60); surchargeCents = minutes * 50 * quantity`.

### 1.3 Shipping logic [OBSERVED from bundle]
- Country → zone mapping: `FR` (FR, MC, AD), `A` (EU + CH), `B` (Maghreb/Balkans/Turkey/Ukraine incl. **TN, MA, DZ**), `OM1`/`OM2` (French overseas), `C` (rest of world), `UK` → quote only, `BLOCKED` (sanctioned countries).
- France modes: **Lettre Suivie La Poste** (few flat cards), **Colissimo** (parcel, if frames/large), **Mondial Relay** pickup point (via Boxtal parcel-point map widget).
- International: "Lettre suivie internationale" or "Colissimo International". Zone prices e.g. A: 16.90 (<500 g) / 21.90, B: 25.90, C: 37.90, OM: 13.90. Light vs frame base: FR 3.90/4.90, INTL 7.90/9.90.
- Weight brackets (g → €): ≤49 → 2.95, ≤99 → 3.95, ≤249 → 6.30, ≤499 → 8.50, ≤999 → 10.50, ≤2999 → 10.90, ≤4999 → 14.90.
- Non-EU banner: customs duties paid by recipient.
- **Multi-recipient gifting**: in the cart you can allocate copies of each photo to other recipients, each shipped **at home** directly; remaining copies come to you; only *you* may use a relay point.

### 1.4 Tech stack observed
| Layer | Revila uses |
|---|---|
| Marketing site | **Astro** static (`/_astro/*.js`), Cloudflare in front |
| Shop | **Next.js App Router** (`/_next/static/chunks`, `main-app`) |
| Object storage | **Cloudflare R2** (multipart, also stated on B2B page) |
| Payments | **Stripe**: `PaymentElement`, `ExpressCheckoutElement` (Apple Pay/Google Pay), `LinkAuthenticationElement`, `AddressElement`; PaymentIntent with idempotency key; accepts `succeeded` **or `requires_capture`** (manual capture) |
| Relay points | **Boxtal** `BoxtalParcelPointMap` widget, token from `/api/preview/relay-token` (503 → "unconfigured") |
| Video metadata in browser | **mediainfo.js@0.3.7** from jsDelivr (duration/codec before upload) |
| iPhone photos | HEIC → JPEG conversion in browser ("Conversion de ta photo iPhone…") |
| Analytics | Microsoft Clarity (after consent), PostHog (surveys, product tours), Cloudflare Web Analytics, gtag |
| Errors | Sentry |
| Support | Chat bubble with AI auto-answer + "talk to a human" (`/api/chatbot`, `/api/feedback`) |
| Email | Resend [INFERRED from bundle strings] |
| Auto-editor | Separate server-rendered app (`/static/*.css`, inline vanilla JS, form-POST `/process`, job polling). Very likely Python (FastAPI/Flask) + FFmpeg [INFERRED] |
| Legal docs | Google Docs links (CGV, mentions légales) |

---

## 2. The order workflow ("passing a command") in detail

### 2.1 Entry: `/commander` (product picker) [OBSERVED]
- Top bar: "Free delivery from 79 €".
- 4 product cards + "custom format" row. Each card: **Create** button + **See prices** (opens right-side drawer with tier table and "Start creation" CTA).
- Below: reassurance (no max duration, 5–7 days, EU data, instructions on back), 3-step explainer, auto-edit promo, templates promo, "what if the recipient doesn't know how to use it" (flip card showing the back), reviews/UGC videos, footer.
- Clicking **Create** → `/commander?support=carte` (or `magnet`) → client calls `POST /api/preview/draft {payload:{}}` → returns `{draftId (32 hex), token}` → URL rewritten with `history.replaceState` to `?support=carte&draft=<id>&t=<token>`.
  - **Why it matters:** the draft is server-side and the URL is the resume link. Refresh / switch device / come back from the editor and nothing is lost. Fallback when API is down: local id `"loc"+random hex`.

### 2.2 Funnel stepper: **1 Vidéo → 2 Photo → 3 Panier**
Internal screen state machine found in code (`revilaScreen`, synced with `history` so the browser Back button moves between steps):
`accueil → tunnel (video/photo per item) → gallery (all items) → format → cart → delivery/shipping (need_address) → payment → confirmation`.
On `popstate`, if files are still uploading it blocks navigation and warns.

#### Step 1 — Add video
Options:
1. **From gallery** (file picker, any video format).
2. **From another phone** → modal with QR code (valid ~2 h, countdown "VIDÉO · VALABLE 1 H 59"), fallback "can't scan? show URL".
3. **Auto-edit** ("Montage automatique", NEW, free) → opens EditEasy with `origin=boutique&sessionId=...&draft=...&draftToken=...`.

Client-side checks before upload: mime, size ≤ 5 GB, duration via mediainfo.js (≤ 30 min), shows "8 first minutes included" + "see calculation detail" for surcharge.

#### Step 2 — Add photo (front side print)
Options:
1. **From gallery** (HEIC auto-converted).
2. **Capture from your video** → scrubber: "Navigate the video and pick the exact moment that becomes your photo".
3. **Create a photo collage** (templates: "Créer à partir d'un modèle").
Then **crop editor**: zoom, rotation, orientation, locked to the chosen print aspect ratio → "Valider la photo".

#### Step 3 — Cart
- List of items (photo + video pairs). Per item: quantity, format (10×15 / 20×30 / 30×45 / magnet), framed qty vs unframed qty.
- **Duplicate a card**: "same photo, other video" or "other photo, same video".
- Tier discount auto-applied ("max discount applied", "discount already deducted"); >500 → quote CTA.
- Promo code (`/api/promo/validate`, `/api/promo/resolve`), gift card code (`/api/giftcard/validate`).
- Gifts: add recipients, allocate N copies of each photo per recipient.

#### Step 4 — Delivery
- Customer info: first name, last name, email, phone.
- Address with autocomplete (`/api/address/search`) + "enter manually (address not listed)" + address complement.
- Mode selection with price + estimated delay per option ("indication, excluding carrier delays"): home / relay point (map) / letter.
- Rules: UK → quote; blocked countries → no shipping; non-EU → customs notice.

#### Step 5 — Payment
- Legal consent checkbox (CGV + withdrawal right + privacy policy).
- `POST /api/preview/create-payment-intent` with header `Idempotency-Key: <uuid>` and body:
```json
{
  "legalConsent": true,
  "subtotal": 0, "shippingCost": 0, "promoDiscount": 0,
  "promoCode": "...", "giftCardCode": "...",
  "items": [{ "photoItemId": "...", "photoKey": "r2/...", "videoKey": "r2/...",
              "quantity": 2, "withFrame": false, "format": "10x15", "videoDurationSec": 95 }],
  "customer": { "firstName": "", "lastName": "", "email": "", "phone": "" },
  "shipping": { "address": "", "postalCode": "", "city": "", "country": "FR",
                "carrier": "colissimo|lettre|mondial_relay", "relayCode": "", "relayAddress": "" },
  "allocations": [ ... ], "recipients": [ ... ],
  "draftId": "...", "draftToken": "..."
}
```
  - **Server recomputes all prices** (client totals are display-only). If total = 0 (gift card covers all) the response has `free: true` and skips Stripe.
- Stripe `confirmPayment` → if status `succeeded` or `requires_capture` → `POST /api/preview/confirm {orderId, paymentIntentId}` → returns `orderNumber` (non-blocking: webhook is source of truth).

#### Step 6 — Confirmation
Order number, recap, "check your email". Feedback widget ("your feedback matters… what almost stopped you from buying").

### 2.3 Funnel analytics [OBSERVED]
`POST /api/parcours {draftId, token, stage, recette}` with `keepalive:true` on each stage change, only if analytics consent given. `?recette=1` flags QA/test sessions (stored in sessionStorage) so they're excluded from stats. → Gives a per-draft funnel / abandoned-cart table.

---

## 3. Upload pipeline (the hardest part — copy this carefully)

### 3.1 Resumable chunked upload to R2 [OBSERVED]
1. `POST /api/media/create`
   headers: `x-draft-token`
   body: `{draftId, kind: "video"|"photo", size, name, mime, fingerprint, protocol: "r2-multipart-v1"}`
   → `{mediaId, transport: "r2_multipart" | "tus-like"}`
   errors: 413 too big, 400/422 invalid, 401/403 unauthorized, **429 "too many files for this cart"** (quota per draft).
   Retries with exponential backoff: `min(30s, 1s·2^n) × jitter(0.75–1.25)`.
2. Transport `r2_multipart`: for each part → `POST /api/media/{id}/parts {partNumber}` returns a presigned PUT URL → browser PUTs the chunk directly to R2. `GET /api/media/{id}/parts` lists already-uploaded parts (resume).
   Fallback transport: `PATCH` with `upload-offset` header (tus-style), **8 MiB chunks**, 180 s timeout per chunk.
3. `POST /api/media/{id}/complete` → server completes the multipart upload and moves to `processing`; client polls `/api/media/status` until ready.
4. **Resume**: `fingerprint` (hash of name+size+lastModified [INFERRED]) lets the user re-select the same file after a crash and continue; 401/403/404/410 on parts → "this upload can't be resumed, replace the file".
5. Progress bar per file; user can continue to the photo step while video uploads in background.

### 3.2 Cross-device ("scan with your phone") [OBSERVED]
- Desktop: `POST /api/mobile-upload/create` → `{sessionId}`; shows QR to `https://<shop>/mobile-upload/<sessionId>`.
- Desktop polls `GET /api/mobile-upload/{sid}/status?consume=1` every ~1–2 s →
  `{"status":"pending|uploading|ready|expired", "mediaType":"video", "expiresAt":"…", "acceptedMimes":[…], "maxSizeBytes":1610612736}`.
- Phone page uploads the file; when `ready`, desktop gets the media key (`consume=1` marks it as taken). Also `/download` and `/cancel` endpoints (used by EditEasy).
- Session TTL ≈ 2 h.

### 3.3 Photo handling
- Upload original to R2, store crop params (x, y, zoom, rotation, aspect) alongside → server renders the print-ready file (300 dpi, bleed) at order time [DECISION].
- `/api/preview/r2-image` serves previews of uploaded images [OBSERVED name].

---

## 4. EditEasy — the free auto-editor (separate app)

Purpose: user has many photos/clips but no edited video → produce one MP4 automatically, then inject it into the order.

### 4.1 UI sections (accordion; each collapses into a summary line) [OBSERVED]
1. **Upload**: dropzone (photos+videos), or "from phone" (same mobile-upload system), thumbnail strip, "keep my order" toggle (`preserve_order`), reorder button. Per-video **trim** tool (timeline, start/end handles, multiple keep-windows as chips).
2. **Music**: Automatic (smart selection) / By style (library grouped by mood, sorted by intensity, preview play) / My music (MP3, M4A, WAV, AAC, OGG, ≤50 MB) / no music.
3. **Options**: pace = `full` (keep whole clips) or `dynamic` (shortened, rhythmic) with estimated duration; orientation (backend detects landscape/portrait/`mixed` and pre-selects); photo display duration (default 2.5 s, ±).
4. **Progress**: progress bar, step label, %, ETA, reassurance text; optional "email me when ready" (`/email`) so user can close the tab.
5. **Done**: AI editor summary text, video player, download, **"Send to my Revila"** (`POST /api/boutique/send-to-session/{jobId}/{sessionId}`), phone mock-up preview showing the photo + video, "edit project" to go back.

### 4.2 Backend API [OBSERVED]
- `POST /api/transfers {files:[{name,size}], boutique_session_id}` → upload session; then `/complete`.
- `GET /api/music` → `{tracks:[{id, title, style/mood, intensity, previewUrl}]}`.
- `POST /process` (multipart form): `job_id, music_choice, orientation, preserve_order, pace, photo_duration, video_edits (JSON {filename:[{from,to}]}), music_file, boutique_session_id, draft_id, draft_token`. Returns duration estimate.
- `GET /status/{jobId}` polled; states `uploading → processing → done | error`; 404 tolerated N times; hard timeout 45 min.
- If `draft_id + draft_token` were sent, **the render pipeline itself calls the shop when finished** (attaches the video to the draft + emails the user), so it works even if the tab was closed.
- Shop side: `/api/preview/promote-editeasy {editeasySid, boutiqueSid, draftToken}` imports the finished render into the draft ("EditEasy import failed → retry").

---

## 5. NFC & playback (not visible publicly — design for Mémora) [DECISION]

1. Each physical card gets an **NTAG213/215/216** sticker programmed with an NDEF URL record: `https://<short-domain>/<shortId>` (short domain, ~8-char base62 id). Lock the tag after writing.
   - iPhone (XS+) and Android read NDEF URL records in the background → notification → opens browser. That's the "no app" magic.
2. `GET /<shortId>` → lightweight page (no framework, < 50 KB) that:
   - looks up `tag → order_item → video`, streams HLS or progressive MP4 from CDN (R2 + Cloudflare) with a signed, short-lived URL;
   - autoplays muted with big "tap for sound" button, full-screen on tap;
   - shows brand footer + "Create your own Mémora" link (viral loop);
   - optional "save video" button.
3. Transcode on upload completion: H.264/AAC MP4 720p + 1080p (+ HLS if long). Generate poster from photo.
4. Tag states: `unassigned → assigned → active → disabled`. Backend allows **re-pointing** a tag to a new video (B2B "update remotely without reprinting").
5. Optional privacy: PIN code per video; noindex headers; unguessable ids; rate limit.
6. Count views (`tag_scans` table) → powers B2B statistics.

---

## 6. B2B offering (phase 2) [OBSERVED on /espace-entreprise]
- Free personalised samples; < 500 cards without options → normal online order; > 500 or options → quote.
- Options: remote video update, end-of-video CTA button to company site, contact-collection form, notify subscribers when a new video is published, viewing statistics, web dashboard to manage content.
- Formats: 10×15 card, business card, magnet; customisable back instructions; customer provides front visual + video; hosting included.

---

## 7. Mémora target architecture [DECISION]

Keep it close to Revila (proven) but simpler for a 2-person team.

| Concern | Choice | Why |
|---|---|---|
| Monorepo | pnpm + Turborepo: `apps/web` (marketing+shop in one Next.js), `apps/editor` (phase 2), `apps/play` (playback, can be a route in web), `packages/pricing`, `packages/db` | one deploy pipeline |
| Frontend | Next.js 15 App Router + TypeScript + Tailwind | same as reference |
| DB | PostgreSQL (Neon/Supabase) + Drizzle or Prisma | relational orders |
| Storage/CDN | Cloudflare R2 (S3 API, no egress fees) | video heavy |
| Uploads | S3 multipart with presigned part URLs (Uppy `@uppy/aws-s3` multipart or custom) | resumable |
| Video processing | Worker (Node or Python) with FFmpeg, job queue (BullMQ/Redis or Cloudflare Queues) | transcode + editor |
| Payments | **Tunisia:** Konnect / Flouci / Paymee (TND, local cards, e-Dinar) + **cash on delivery**. **EU customers:** Stripe via an EU entity, or Lemon Squeezy/Paddle. Wrap behind a `PaymentProvider` interface. | Stripe doesn't onboard Tunisian businesses directly |
| Shipping | Tunisia: Aramex / local couriers with COD / La Poste Tunisienne Rapid-Poste; International: Aramex/DHL. Table-driven rates like Revila. | local reality |
| Address | Simple form + Google Places autocomplete (optional) | |
| Email | Resend or Brevo | transactional |
| Analytics | PostHog (funnel + session replay) after consent | |
| Errors | Sentry | |
| i18n | `fr` (default), `ar`, `en` via next-intl; RTL support for Arabic | Tunisian market |
| Currency | TND primary, EUR for international; prices stored in minor units (millimes/cents) | |

> ⚠️ Assumptions to confirm with founders: target market (Tunisia only at launch vs. also France/EU), payment provider, carrier, whether EditEasy-style auto-editor is in MVP, exact local prices.

---

## 8. Data model

```sql
drafts(id uuid pk, token_hash text, product text, payload jsonb, stage text,
       is_test bool, created_at, updated_at, expires_at)           -- resumable cart
media(id uuid pk, draft_id fk, kind enum('video','photo','music'), r2_key text,
      mime text, size_bytes bigint, fingerprint text, upload_id text,
      status enum('uploading','processing','ready','failed'),
      duration_sec int, width int, height int, created_at)
draft_items(id uuid pk, draft_id fk, photo_media_id fk, video_media_id fk,
            crop jsonb, format enum('10x15','20x30','30x45','magnet'),
            qty_unframed int, qty_framed int, position int)
recipients(id pk, draft_id fk, name, address jsonb)
allocations(draft_item_id fk, recipient_id fk, qty int)
mobile_upload_sessions(id text pk, draft_id fk, media_type, status, media_id fk null,
                       accepted_mimes text[], max_size bigint, expires_at, consumed_at)
orders(id uuid pk, number text unique, draft_id fk, customer jsonb, shipping jsonb,
       subtotal int, shipping_cost int, discount int, total int, currency text,
       promo_code text, gift_card_code text, payment_provider text, payment_ref text,
       status enum('pending_payment','paid','in_production','shipped','delivered','cancelled','refunded'),
       idempotency_key text unique, created_at)
order_items(id pk, order_id fk, draft_item_id fk, format, framed bool, qty int,
            unit_price int, video_surcharge int, print_file_key text)
shipments(id pk, order_id fk, recipient_id fk null, carrier, mode, relay_code, tracking_number, status)
nfc_tags(id text pk /* shortId */, uid text unique, order_item_id fk null,
         video_media_id fk null, status enum('unassigned','assigned','active','disabled'),
         pin_hash text null, created_at)
tag_scans(id bigserial, tag_id fk, ts timestamptz, ua text, country text)
promo_codes(code pk, type enum('percent','fixed','free_shipping'), value int,
            starts_at, ends_at, max_uses int, used int)
gift_cards(code pk, initial int, balance int, currency, expires_at /* +12 months */,
           delivery enum('email','post'), buyer jsonb, recipient jsonb)
funnel_events(draft_id fk, stage text, ts, is_test bool)
```

---

## 9. API surface (Mémora, mirroring Revila)

| Method & path | Purpose |
|---|---|
| `POST /api/drafts` | create draft → `{draftId, token}` |
| `GET/PATCH /api/drafts/:id` (header `x-draft-token`) | load/save cart payload |
| `POST /api/media` | create upload `{draftId, kind, size, name, mime, fingerprint}` → `{mediaId, uploadId, partSize}`; 429 on quota |
| `GET /api/media/:id/parts` | list uploaded parts (resume) |
| `POST /api/media/:id/parts` `{partNumber}` | presigned PUT URL |
| `POST /api/media/:id/complete` `{parts:[{n,etag}]}` | finish + enqueue processing |
| `GET /api/media/:id/status` | `uploading/processing/ready/failed`, duration |
| `GET /api/media/:id/preview` | signed preview URL |
| `POST /api/mobile-upload` | create phone hand-off session |
| `GET /api/mobile-upload/:sid/status?consume=1` | desktop polling |
| `GET /m/:sid` (page) | phone upload page |
| `POST /api/pricing/quote` | server-side price + shipping options for a payload |
| `GET /api/address/search?q=` | autocomplete |
| `POST /api/promo/validate`, `POST /api/giftcard/validate` | codes |
| `POST /api/checkout` (Idempotency-Key) | create order + payment session (or `free:true`, or COD) |
| `POST /api/checkout/confirm` | client-side confirm (non-blocking) |
| `POST /api/webhooks/<provider>` | **source of truth** for paid status |
| `POST /api/giftcard/purchase` | gift-card checkout |
| `POST /api/funnel` | stage tracking (consent-gated, keepalive) |
| `GET /:shortId` (play domain) | NFC landing / video player |
| Admin: `/admin/orders`, `/admin/orders/:id/print-pack`, `/admin/tags/assign` | ops |

---

## 10. Pricing module (`packages/pricing`) — pure, tested, shared client+server

```ts
type Format = '10x15'|'20x30'|'30x45'|'magnet';
interface Tier { minQty: number; unit: number }          // minor units
const TIERS: Record<Format, Tier[]>;
const INCLUDED_SECONDS = 480, SURCHARGE_PER_MIN = 50, MAX_DURATION = 1800;
const FREE_SHIPPING_THRESHOLD;                              // e.g. 79 € / local equivalent
unitPrice(format, totalQty): number
videoSurcharge(durationSec, qty): number                   // ceil((d-480)/60)*50*qty
weightGrams(counts): number                                // item + nfc(2) + label(1) + frames
zoneFor(countryCode): 'LOCAL'|'A'|'B'|'C'|'QUOTE'|'BLOCKED'
shippingOptions(country, counts, subtotal): {mode, carrier, price, etaDays}[]
quote(payload): {lines, subtotal, discount, shipping, total}
```
Rules: tier is chosen by **total quantity across all items of the same product family**; client uses it for display only; **server recomputes in `/api/checkout`** and rejects mismatches. Unit tests for every tier boundary (4/5, 9/10, 49/50, 99/100, 500 → quote), surcharge boundaries (480 s, 481 s, 540 s, 1800 s, 1801 s → reject), free-shipping threshold.

---

## 11. Back-office / fulfilment workflow [INFERRED + DECISION]

```
paid ──► in_production ──► printed ──► nfc_programmed ──► qa_checked ──► shipped ──► delivered
```
1. Webhook marks order `paid` → email "order confirmed" (+ to each gift recipient optionally).
2. Worker renders **print files** (cropped photo at 300 dpi + bleed, back side with instructions + optional custom message) → zipped "print pack" per order.
3. Operator prints, sticks NFC tag on back, scans each tag with a phone/USB reader in the admin "Assign tags" screen → app writes NDEF URL (Web NFC on Android Chrome works for this) and links `tag ↔ order_item`.
4. QA: tap each card → must open correct video.
5. Create shipment(s) per recipient, generate labels, enter tracking → email with tracking link.
6. Videos stay hosted indefinitely (state retention policy in CGV).

---

## 12. Cross-cutting requirements
- **Security**: draft token in header (never trust draftId alone), store only token hash; signed URLs for every R2 object; per-draft upload quota (429); mime + magic-byte validation server side; rate limits on create endpoints; idempotency keys on checkout; webhook signature verification.
- **Privacy/GDPR (+ Tunisian law 2004-63)**: cookie banner with categories (necessary / analytics / ads), analytics only after consent, privacy policy, data deletion on request.
- **Resilience**: everything resumable (draft URL, multipart, fingerprint); background upload while user continues; beforeunload/popstate guard while uploading.
- **Mobile first**: most customers have their videos on their phone → the phone flow must be perfect; desktop gets the QR hand-off.
- **Performance**: marketing pages static; playback page tiny; videos on CDN.
- **Accessibility**: keyboard-navigable stepper, labelled inputs, contrast from brand palette.
- **Legal pages**: CGV, mentions légales, privacy, withdrawal right note (personalised goods are usually exempt; confirm).

---

## 13. Build phases (each ends with a verifiable check)

**Phase 0 — Setup**
1. Monorepo, Next.js, Tailwind with brand tokens from `identity/logo-guidelines.md`, DB, R2 bucket, env schema (zod). → verify: `pnpm dev` runs, `/health` ok, CI lint+typecheck green.

**Phase 1 — Pricing core**
2. `packages/pricing` + unit tests (section 10). → verify: all boundary tests pass.

**Phase 2 — Draft + uploads**
3. Draft create/resume via URL (`?draft=&t=`). → verify: refresh keeps state; wrong token → 401.
4. Multipart resumable upload to R2 + status + client duration check (mediainfo.js). → verify: 2 GB file uploads; kill tab mid-way, reselect file, upload resumes; 31-min video rejected.
5. Mobile hand-off (QR + polling + phone page). → verify: upload from phone appears on desktop within 3 s; QR expires after TTL.

**Phase 3 — Funnel UI**
6. Product picker + price drawer. 7. Stepper Vidéo → Photo (gallery / frame-from-video / crop with aspect lock, HEIC) → Cart (qty, format, frames, duplicate, recipients/allocations). Back button = previous step. → verify: Playwright E2E full path to cart.

**Phase 4 — Checkout**
8. Address + shipping options from pricing module. 9. Payment provider adapter (+ COD) + webhook + order creation + idempotency + emails. 10. Promo codes & gift cards (incl. `free` path). → verify: test-mode payment creates exactly one order even on double click; webhook replay is harmless; totals tampered client-side are rejected.

**Phase 5 — NFC playback + ops**
11. Transcoding worker. 12. `/:shortId` player. 13. Admin: orders, print pack, tag assignment (Web NFC write), shipping/tracking. → verify: program a real NTAG215, tap with iPhone and Android → correct video plays with no app.

**Phase 6 — Growth**
14. Funnel tracking + abandoned-draft email. 15. Gift-card storefront. 16. Templates/collage. 17. AI/auto-editor (EditEasy clone: upload → music → pace/orientation → FFmpeg render job → inject into draft). 18. B2B dashboard (remote video swap, CTA, stats).

---

## 14. Things we could NOT observe (agents must not invent them as facts)
- Revila's backend code, DB schema, NFC URL format, print/fulfilment tooling, email templates, exact shipping tables per country beyond what the bundle exposed.
- Payment steps after entering card (no order was placed).
- Mobile phone upload page UI (only its URL pattern `/mobile-upload/<sessionId>`).
Everything in sections 5, 7–13 is a design proposal for Mémora built on the observed patterns.
