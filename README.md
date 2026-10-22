# AMC Desk

React (Vite) dashboard + Node/Express API + Supabase (Postgres + Storage).

```
client/    React app (dashboard, New AMC form)
server/    Express API (validation, Supabase access)
supabase/  schema.sql — tables, create_amc() function, storage bucket
```

## Setup

1. **Database** — in the Supabase dashboard open *SQL Editor*, paste
   `supabase/schema.sql` and run it. (If you ran the first draft of the
   schema earlier, run `supabase/drop_previous_draft.sql` first.)
2. **API**
   ```bash
   cd server
   cp .env.example .env   # fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   npm install
   npm run dev            # http://localhost:4000
   ```
   The service-role key is found under *Project Settings → API*. It stays on
   the server; the browser never sees it.
3. **Client**
   ```bash
   cd client
   npm install
   npm run dev            # http://localhost:5173 (proxies /api to :4000)
   ```

## API

| Method | Path             | Purpose                                              |
| ------ | ---------------- | ---------------------------------------------------- |
| GET    | `/api/options`   | Dropdown / checkbox options for the New AMC form     |
| GET    | `/api/dashboard` | Stats cards + expiries table                         |
| POST   | `/api/amcs`      | Create an AMC (multipart: `data` JSON + `agreement`) |

## Data model

```
clients 1─N sites 1─N contracts ─N contract_scope_items / contract_reminder_offsets / contract_reminder_channels
              ├─N assets
              └─N access_refs
```

Every dropdown is a lookup table (`platforms`, `plans`, `gst_rates`, …)
referenced by foreign key.

## Changing dropdown options

Insert, update or delete rows in the lookup tables (Supabase → Table Editor).
The form reads them from `/api/options` (cached for 60 seconds), and the API
only accepts values that exist there. No code change is needed.

## Notes

- Overdue invoices and Sites down always show 0. Invoicing and uptime
  monitoring are not built yet.
- Creating an AMC is one database transaction (`create_amc`). An existing
  client (same name, case-insensitive) and site (same URL) are reused. A URL
  already registered to a different client is rejected.
- Signed agreements (PDF/PNG/JPG, max 10 MB) go to the private `agreements`
  storage bucket.

## Production build

```bash
cd client && npm run build    # static files in client/dist
cd server && npm start
```
Serve `client/dist` from any static host. If the API is on another origin, set
`VITE_API_URL` when building the client and `CORS_ORIGIN` on the server.
