# Krewzo progress

## RESUME HERE (2026-11-21)

**Done**
- Monorepo: shared / backend / krewzo-partner / krewzo-customer. All four modules complete.
- Backend: `npm test` = 6/6 green (pricing; book→accept→START colour-pin→END QR→PAID_OUT with escrow RELEASED_UPI; 5 wrong codes rotate the handshake; 3-worker B2B booking + GSTIN invoice + cancel refund; WhatsApp loop 2/1/ACCEPT/OTP/OTP; NBFC credit passbook key check).
- Both apps `vite build` clean. A dev smoke test logged in via both proxies, and the socket.io handshake OK.
- Worker-ease features: see PLAN.md.

**APKs (2026-11-21)**: `Downloads\krewzo-partner-1.0.apk` (in.krewzo.partner) + `Downloads\krewzo-customer-1.0.apk` (in.krewzo.customer). Capacitor 8.5.3 with the web build bundled inside (not loaded from a URL). Signed with `C:\Users\Shiva\krewzo-keystore` (keep it; losing it = no updates). Rebuild: `npm run apk -w krewzo-partner` (or -customer). APKs are built with `VITE_API_URL=https://krewzo-api.onrender.com` (set it again on every rebuild, or the app falls back to the ⚙️ Server field on the login screen).

**Backend on Render (2026-11-21)**: `krewzo-api` = https://krewzo-api.onrender.com, workspace "Appilication Dev", free plan, Singapore, auto-deploys on push to main. Build `npm ci -w backend -w shared --include-workspace-root=false`, start `npm start -w backend`. Env: NODE_VERSION 22.14.0, KREWZO_SECRET, ADMIN_KEY (values are in the Render dashboard). Live-checked: demo login 200, CORS preflight 204, socket.io handshake OK. Free-plan limits: SQLite lives on an ephemeral disk, so **all data resets on every deploy/restart** (the demo seed comes back); the service sleeps after 15 min idle (first request ~50s). Before real users: Postgres or a paid disk with `KREWZO_DB` on it. Backend now sends CORS `*` (bearer auth, no cookies). Not installed on a phone yet.

**Auto-update + security (2026-11-21, v1.1.0 both apps)**: apps check GitHub releases (`<app>-vX.Y.Z`, public repo) on launch and show an Update banner -> native `UpdaterPlugin.java` downloads the APK and opens the installer (first time Android asks to allow installs from Krewzo). To ship an update: bump `version` in krewzo-<app>/package.json (gradle versionCode is derived from it), then `node scripts/release.mjs <app> "notes"`. Never reuse a version. PIN lockout: 5 wrong -> 15 min lock per phone+role (in-memory). `AUTO_KYC=1` on Render = new workers auto-approved -- REMOVE before launch. Auto-update CONFIRMED on a phone 2026-11-21 (user saw the partner 1.1.1 banner). NEXT: FCM push for job offers -- waiting on user: Firebase project "Krewzo", google-services.json -> krewzo-partner/android/app/, service-account key -> C:/Users/Shiva/krewzo-keystore/firebase-admin.json.

**Not verified yet**
- No one has clicked through the UI in a real browser or phone. First thing next session: `npm run dev`, open :5173 + :5174 side by side and run the demo loop from the README.
- Camera QR scan is untested on a real phone (needs HTTPS → use a cloudflared tunnel).
- Telugu/Hindi speech depends on the phone having those TTS voices.

**Before any real launch**
- Set `VITE_HELPLINE` (the default number is a placeholder), `NBFC_API_KEY`, `ADMIN_KEY`, `KREWZO_SECRET`.
- UPI collect + payout are simulated (ledger + generated refs). Wire Razorpay/Cashfree.
- Postgres + hosting (Render) if it goes beyond a demo.
