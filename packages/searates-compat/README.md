# SeaRates ocean-tracking compatibility gateway

This package exposes a small SeaRates-compatible HTTP surface backed only by
Terminal49's public JSON:API. It is a compatibility gateway for ocean container,
Bill of Lading (BOL), and booking tracking. It is not a clone of SeaRates'
rates, schedules, air, parcel, road, route-history, or Automatic Identification
System (AIS) products.

## Endpoints

- `GET /tracking`
- `GET /info/sealines`

The Vercel deployment maps these paths to `api/tracking.ts` and
`api/info/sealines.ts`. `/info/terminals` is intentionally omitted because the
Terminal49 public API can fetch a known terminal but does not provide a
supported-terminals list.

## Configure authentication

Choose one of two modes:

### Pass-through mode

Leave `T49_SEARATES_API_TOKEN` unset. The gateway treats the SeaRates `api_key`
query parameter as a Terminal49 API key and sends it upstream as
`Authorization: Bearer <api_key>`.

### Service-token mode

Set both values:

```bash
T49_SEARATES_API_TOKEN=YOUR_T49_API_KEY
T49_SEARATES_CLIENT_SECRET=YOUR_GATEWAY_KEY
```

Clients send `YOUR_GATEWAY_KEY` as `api_key`. The gateway compares it in
constant time and uses `T49_SEARATES_API_TOKEN` only for requests to the public
Terminal49 API. This is one shared deployment credential, not a multi-tenant
billing or key-management system.

Optional settings:

```bash
T49_API_BASE_URL=https://api.terminal49.com/v2
T49_SEARATES_POLL_TIMEOUT_MS=4000
T49_SEARATES_POLL_INTERVAL_MS=500
```

## Point an existing client at the gateway

Change the SeaRates base URL and keep the existing query parameters:

```bash
curl "https://YOUR_GATEWAY.example.com/tracking?api_key=YOUR_GATEWAY_KEY&number=MSCU1234567&type=CT&sealine=MSCU"
```

The gateway accepts `type=CT`, `type=BL`, and `type=BK`, plus `force_update`,
`route`, and `ais`. `force_update=true` requests a Terminal49 container refresh
when a tracked container already exists. The compatibility response always
includes SeaRates' route summary. Detailed route geometry and AIS pins are not
implemented.

Fetch the carrier dictionary with:

```bash
curl "https://YOUR_GATEWAY.example.com/info/sealines?api_key=YOUR_GATEWAY_KEY"
```

In service-token mode, `/info/sealines` also works without `api_key`, matching
SeaRates' public dictionary behavior. Its rows are generated from Terminal49
`GET /shipping_lines`; they are not a hardcoded sample.

## Asynchronous tracking behavior

Terminal49 creates tracking requests asynchronously. On a cache miss, the
gateway:

1. creates or reuses a Terminal49 tracking request;
2. polls it for a short, bounded interval;
3. returns the full SeaRates envelope if the shipment becomes available; or
4. returns SeaRates' successful empty-data outcome:
   `status: "success"`, `message: "SEALINE_HASNT_PROVIDE_INFO"`,
   `metadata.status: "UNKNOWN"`, and empty data arrays.

SeaRates has no documented pending response, so the gateway does not invent one.
Retry the same `GET /tracking` request after the empty-data outcome. The gateway
reuses the existing Terminal49 tracking request instead of creating another one.
Terminal49 failure reasons are translated to SeaRates-style messages such as
`WRONG_NUMBER`, `AUTO_CANT_DETECT_SEALINE`, and
`SEALINE_HASNT_PROVIDE_INFO`.

## Compatibility limits

- Timestamps are rendered in SeaRates' `YYYY-MM-DD HH:MM:SS` shape but remain
  UTC because Terminal49 stores canonical event timestamps in UTC.
- SeaRates quota counters and cache expiration have no Terminal49 equivalent,
  so those fields are `null`.
- Equipment ISO codes are reconstructed for common dry, reefer, open-top,
  flat-rack, hard-top, and tank combinations. Unknown combinations are `null`.
- Holds, fees, Last Free Day (LFD), and other Terminal49-only terminal
  intelligence are deliberately excluded.
