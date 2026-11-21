# Builds branding/download-page.html (the client demo download page) with inline logo + QR SVGs.
# Re-run after a release: update the two URLs/versions below and regenerate the qr-*.svg files.
qr = {k: open(f'qr-{k}.svg').read().replace('<svg ', '<svg class="qr-svg" role="img" aria-label="QR code to download" ') for k in ['partner', 'customer']}


def mark(bg, bar, dot, rx):
    return (f'<svg viewBox="0 0 108 108" aria-hidden="true"><rect width="108" height="108" rx="{rx}" fill="{bg}"/>'
            f'<g transform="translate(54 54) scale(1.18) translate(-54 -54)"><g stroke="{bar}" stroke-width="10.5" stroke-linecap="round" fill="none">'
            f'<path d="M41 35V73"/><path d="M44.5 60L67 37.5"/></g><circle cx="66" cy="69" r="7.5" fill="{dot}"/></g></svg>')


P = 'https://github.com/vetukurishivavarma-eng/Krewzo/releases/download/partner-v2.0.6/krewzo-partner-2.0.6.apk'
C = 'https://github.com/vetukurishivavarma-eng/Krewzo/releases/download/customer-v2.0.5/krewzo-customer-2.0.5.apk'
ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'

CSS = """
/* Layout: one narrow column; brand line, two app cards side by side (stacked on phones), install steps, demo login. */
:root {
  --bg: #f6f3ee; --surface: #ffffff; --ink: #15130f; --muted: #6f6a62; --line: #e6dfd4;
  --lime: #c8f031; --on-lime: #15130f; --dark-tile: #15130f;
  --display: "Bricolage Grotesque", system-ui, sans-serif;
  --body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0e0d0b; --surface: #1a1814; --ink: #f4f1ea; --muted: #a39d92; --line: #2d2a24; --dark-tile: #24211c; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #0e0d0b; --surface: #1a1814; --ink: #f4f1ea; --muted: #a39d92; --line: #2d2a24; --dark-tile: #24211c; color-scheme: dark; }

body { background: var(--bg); color: var(--ink); font-family: var(--body); font-size: 16px; line-height: 1.55; }
.wrap { max-width: 920px; margin: 0 auto; padding-block: 40px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 40px; }
h1, h2 { font-family: var(--display); font-weight: 800; letter-spacing: -0.02em; margin: 0; text-wrap: balance; }
p { margin: 0; }

.brand { display: flex; align-items: center; gap: 12px; font-family: var(--display); font-weight: 800; font-size: 26px; letter-spacing: -0.03em; }
.brand svg { width: 40px; height: 40px; }
.brand .dot { display: inline-block; width: .3em; height: .3em; border-radius: 50%; background: var(--lime); margin-left: 2px; box-shadow: 0 0 0 2px var(--ink); }
.intro { display: grid; gap: 14px; max-width: 62ch; }
.intro h1 { font-size: clamp(34px, 6vw, 54px); line-height: 1.04; }
.intro h1 mark { background: var(--lime); color: var(--on-lime); padding: 0 .12em; border-radius: 8px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.intro p { color: var(--muted); font-size: 17px; }

.apps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 16px; }
.app { background: var(--surface); border: 1px solid var(--line); border-radius: 28px; padding: 24px; display: grid; gap: 18px; align-content: start; min-width: 0; }
.app-head { display: flex; gap: 14px; align-items: center; }
.app-head svg { width: 64px; height: 64px; flex: none; }
.app-head h2 { font-size: 24px; line-height: 1.1; }
.who { font-size: 14px; color: var(--muted); }
.app ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 15px; }
.get { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; }
.btn { display: flex; align-items: center; justify-content: center; gap: 10px; height: 56px; border-radius: 16px; background: var(--lime); color: var(--on-lime); font-weight: 700; font-size: 17px; text-decoration: none; }
.btn:hover { filter: brightness(.96); }
.btn:focus-visible, .copy:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
.btn svg { width: 20px; height: 20px; }
.meta { font-size: 13px; color: var(--muted); margin-top: 8px; font-variant-numeric: tabular-nums; }
.qr { width: 112px; height: 112px; padding: 9px; background: #ffffff; border-radius: 14px; border: 1px solid var(--line); box-sizing: border-box; }
.qr-svg { width: 100%; height: 100%; display: block; }
.qr-cap { font-size: 12px; color: var(--muted); text-align: center; margin-top: 6px; }

.steps { display: grid; gap: 16px; }
.steps h2 { font-size: 26px; }
.steps ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 16px; counter-reset: s; }
.steps li { counter-increment: s; border-top: 2px solid var(--ink); padding-top: 12px; display: grid; gap: 4px; align-content: start; min-width: 0; }
.steps li::before { content: "Step " counter(s); font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.steps b { font-weight: 600; }
.steps li p { color: var(--muted); font-size: 15px; }

.demo { background: var(--dark-tile); color: #f4f1ea; border-radius: 28px; padding: 24px; display: grid; gap: 14px; }
.demo h2 { font-size: 22px; color: #f4f1ea; }
.demo p { color: #c9c3b8; font-size: 15px; max-width: 62ch; }
.creds { display: flex; flex-wrap: wrap; gap: 10px; }
.cred { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 10px 10px 10px 14px; }
.cred span { font-size: 12px; color: #a39d92; text-transform: uppercase; letter-spacing: .08em; }
.cred code { font-family: var(--display); font-size: 20px; font-weight: 800; color: #c8f031; letter-spacing: .04em; user-select: all; }
.copy { border: 0; background: rgba(255,255,255,.1); color: #f4f1ea; border-radius: 10px; height: 34px; padding: 0 12px; font: 600 13px var(--body); cursor: pointer; }
footer { font-size: 13px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 6px 16px; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 16px; }
@media (max-width: 440px) { .get { grid-template-columns: 1fr; } .qr-box { display: none; } }
@media (prefers-reduced-motion: no-preference) { .btn { transition: filter .15s; } }
"""

JS = """
document.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => {
  const el = document.getElementById(b.dataset.copy);
  const select = () => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected'; };
  try {
    navigator.clipboard.writeText(el.textContent).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1500); }, select);
  } catch (e) { select(); }
}));
"""


def app_card(name, who, logo, bullets, url, label, meta, qr_svg):
    lis = ''.join(f'<li>{b}</li>' for b in bullets)
    return f'''
    <article class="app">
      <div class="app-head">{logo}<div><h2>{name}</h2><p class="who">{who}</p></div></div>
      <ul>{lis}</ul>
      <div class="get">
        <div><a class="btn" href="{url}" rel="noopener">{ARROW}{label}</a><p class="meta">{meta}</p></div>
        <div class="qr-box"><div class="qr">{qr_svg}</div><p class="qr-cap">Scan with your phone</p></div>
      </div>
    </article>'''


html = f'''<title>Krewzo Demo Apps</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Inter:wght@400;600;700&display=swap">
<style>{CSS}</style>

<div class="wrap">
  <header class="brand">{mark('#15130f', '#f4f1ea', '#c8f031', 26)}<span>krewzo<span class="dot"></span></span></header>

  <section class="intro">
    <h1>Skilled hands at your door, <mark>in 30 minutes.</mark></h1>
    <p>The demo is two Android apps: one for people who book help, one for the workers who do the job. Install both to follow a booking from request to payment.</p>
  </section>

  <section class="apps" aria-label="Download the apps">
    {app_card('Krewzo', 'For customers who need help', mark('#c8f031', '#15130f', '#15130f', 24),
              ['Book a helper, mason, plumber or electrician', 'Track the worker live on a map until they arrive', 'Money waits in escrow until the job is done'],
              C, 'Download Krewzo', 'Android &middot; version 2.0.5 &middot; 4.6 MB', qr['customer'])}
    {app_card('Krewzo Partner', 'For workers who take jobs', mark('#15130f', '#f4f1ea', '#c8f031', 24),
              ['Go on duty and get jobs within 3 km', 'A big ringing alert, even on the lock screen', 'Paid to UPI as soon as the customer confirms', 'Works in English, తెలుగు and हिंदी'],
              P, 'Download Partner', 'Android &middot; version 2.0.6 &middot; 4.7 MB', qr['partner'])}
  </section>

  <section class="steps" aria-labelledby="install-h">
    <h2 id="install-h">Installing on Android</h2>
    <ol>
      <li><b>Download and open the file</b><p>Tap a download button above, or scan its QR code with the phone camera, then open the downloaded file.</p></li>
      <li><b>Allow installs from this source</b><p>Android asks once. Tap <b>Settings</b>, turn on <b>Allow from this source</b>, then go back.</p></li>
      <li><b>Tap Install anyway</b><p>Play Protect may call the app unrecognised because it is not on the Play Store yet. Tap <b>More details</b>, then <b>Install anyway</b>.</p></li>
      <li><b>Allow notifications</b><p>Krewzo asks on first launch. Workers should also turn on the pop-up and full-screen alert from the Partner home screen.</p></li>
    </ol>
  </section>

  <section class="demo" aria-labelledby="demo-h">
    <h2 id="demo-h">Demo customer account</h2>
    <p>Log in to the Krewzo app with this number and PIN. In Krewzo Partner, sign up with any 10-digit number; demo workers are approved straight away.</p>
    <div class="creds">
      <div class="cred"><div><span>Mobile</span><br><code id="c-phone">9999999999</code></div><button class="copy" type="button" data-copy="c-phone">Copy</button></div>
      <div class="cred"><div><span>PIN</span><br><code id="c-pin">1234</code></div><button class="copy" type="button" data-copy="c-pin">Copy</button></div>
    </div>
  </section>

  <footer><span>Both apps update themselves. A banner and a notification appear when a new version is ready.</span><span>Krewzo demo build</span></footer>
</div>

<script>{JS}</script>
'''
open('download-page.html', 'w', encoding='utf-8').write(html)
print('written', len(html), 'chars')
