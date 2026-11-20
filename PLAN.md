# Making Krewzo work for workers who can't read

Rule: **a worker must be able to finish a whole job without reading a single word.** Every screen works through icons, colours, numbers, sound, and voice.

## Built (in `krewzo-partner/`)

1. **Talking app (🔊 everywhere).** Job alerts read themselves out ("New job. 598 rupees. 0.5 kilometre. 4 hours. Press green to accept") in Telugu/Hindi/English via the phone's speech engine. Today's earnings, shift start, wrong code and money sent are all spoken. If the phone has no Telugu or Hindi voice, the app falls back to English rather than reading out garbled text.
2. **Language first, before anything else.** The first screen is three giant buttons written in their own scripts (English / తెలుగు / हिंदी). It is remembered, and it can be switched any time from a pill on every screen.
3. **No keyboard for login.** Phone number and PIN are typed on a giant on-screen number pad, with auto-submit at 4 digits and a vibration on each tap.
4. **Picture sign-up.** Work level is chosen from icon + stars, and trades from picture tiles (🧹 🧱 🎨 🔧 ⚡ 🪚). The only typing is their name.
5. **Two buttons, one decision.** The job alert shows only ₹, km, hours and the task picture. It flashes and re-rings every 6 s until the worker answers. ACCEPT is green and bigger; SKIP is grey.
6. **Colour + 2 numbers instead of an OTP.** "🟠 42" is easier than "4 8 1 7": tap the orange button, then 4, 2. QR scan is zero taps. The 4-digit code is the last fallback.
7. **Sound + vibration as feedback.** A rising chime and long buzz for success, a low double buzz for a wrong code. They don't need to read the result.
8. **Money they can see.** A full-screen green payout with falling 💵🪙 and the amount in huge digits, spoken aloud.
9. **🆘 HELP button** on the home screen: one tap calls the helpline.
10. **"Can't come" button.** It sends the job back to the pool without penalty-shaming, and the next worker gets it right away.
11. **WhatsApp mode** for workers whose phones can't run the app: everything works by texting digits, with replies in their language.
12. **Passbook = proof of income.** Every verified shift shows the task icon, ₹ and how it was verified. Their Krewzo Score (300–900) shows a 13-week bar chart and when a loan unlocks.

## Next (not built yet)

- **IVR / missed-call duty switch**: give a missed call to go on duty. Needs a telephony provider (Exotel/Knowlarity).
- **Recorded human voice prompts** instead of text-to-speech. Cheap phones often lack Telugu TTS voices.
- **Photo of the worker taken at the door**, as a third proof besides the handshake. Helps with disputes.
- **Daily payout to bank via real UPI** (RazorpayX / Cashfree Payouts). Today the payout is a ledger entry with a generated UPI ref.
- **Aadhaar/DigiLocker KYC** in place of the ops `/admin/workers/:id/kyc` call.
- **Android TWA/APK wrapper** so the job alert can ring even with the screen off (push via FCM).
