# Krewzo progress

## RESUME HERE (2026-11-21)

**Done**
- Monorepo: shared / backend / krewzo-partner / krewzo-customer. All four modules complete.
- Backend: `npm test` = 6/6 green (pricing; book→accept→START colour-pin→END QR→PAID_OUT with escrow RELEASED_UPI; 5 wrong codes rotate the handshake; 3-worker B2B booking + GSTIN invoice + cancel refund; WhatsApp loop 2/1/ACCEPT/OTP/OTP; NBFC credit passbook key check).
- Both apps `vite build` clean. A dev smoke test logged in via both proxies, and the socket.io handshake OK.
- Worker-ease features: see PLAN.md.

**Not verified yet**
- No one has clicked through the UI in a real browser or phone. First thing next session: `npm run dev`, open :5173 + :5174 side by side and run the demo loop from the README.
- Camera QR scan is untested on a real phone (needs HTTPS → use a cloudflared tunnel).
- Telugu/Hindi speech depends on the phone having those TTS voices.

**Before any real launch**
- Set `VITE_HELPLINE` (the default number is a placeholder), `NBFC_API_KEY`, `ADMIN_KEY`, `KREWZO_SECRET`.
- UPI collect + payout are simulated (ledger + generated refs). Wire Razorpay/Cashfree.
- Postgres + hosting (Render) if it goes beyond a demo.
