// Regional dictionary. Short words only: every label also has an icon, and 🔊 reads it aloud.
export const LANGS = [
  { id: 'EN', label: 'EN', name: 'English', speech: 'en-IN' },
  { id: 'TE', label: 'తెలుగు', name: 'తెలుగు', speech: 'te-IN' },
  { id: 'HI', label: 'हिंदी', name: 'हिंदी', speech: 'hi-IN' },
];

export const DICT = {
  EN: {
    on_duty: 'ON DUTY', off_duty: 'OFF DUTY', tap_to_start: 'Tap to start getting jobs', tap_to_stop: 'Tap to stop jobs',
    today: 'Today', jobs: 'jobs', waiting: 'Waiting for jobs near you…', offline_hint: 'Go ON DUTY to get jobs',
    new_job: 'NEW JOB', accept: 'ACCEPT', skip: 'SKIP', km: 'km', hours: 'hours', scheduled: 'Booked for',
    navigate: 'GO (MAP)', call: 'CALL', arrived: 'I HAVE ARRIVED', cant_come: "Can't come",
    scan: 'SCAN CUSTOMER CODE', or_tap: 'or tap colour + number', or_otp: '4-digit code', start_shift: 'Ask customer for START code',
    end_shift: 'Work done? Ask customer for FINISH code', working: 'WORK RUNNING', time_left: 'time left',
    wrong: 'Wrong code', tries_left: 'tries left', new_code: 'Ask customer for the NEW code',
    paid: 'MONEY SENT!', to_upi: 'sent to your UPI', done: 'OK',
    passbook: 'My Passbook', total: 'Total earned', shifts: 'Verified shifts', score: 'Krewzo Score', loan_ready: 'Loan ready up to', loan_not_yet: 'Do 20 good shifts to unlock a loan',
    help: 'HELP', phone: 'Your mobile number', pin: 'Your 4-digit PIN', next: 'NEXT', back: 'BACK',
    your_name: 'Your name', your_level: 'Your work level', your_work: 'What work do you do?', upi: 'UPI ID (for payment)', join: 'JOIN KREWZO',
    kyc_pending: 'Your ID check is pending. We will call you.', location_off: 'Turn on location to get jobs',
    pick_lang: 'Choose language', customer: 'Customer',
  },
  TE: {
    on_duty: 'డ్యూటీ ఆన్', off_duty: 'డ్యూటీ ఆఫ్', tap_to_start: 'పనులు రావాలంటే నొక్కండి', tap_to_stop: 'పనులు ఆపాలంటే నొక్కండి',
    today: 'ఈరోజు', jobs: 'పనులు', waiting: 'దగ్గర్లో పని కోసం చూస్తున్నాం…', offline_hint: 'పనుల కోసం డ్యూటీ ఆన్ చేయండి',
    new_job: 'కొత్త పని', accept: 'ఒప్పుకో', skip: 'వద్దు', km: 'కి.మీ', hours: 'గంటలు', scheduled: 'సమయం',
    navigate: 'వెళ్ళు (మ్యాప్)', call: 'ఫోన్', arrived: 'నేను చేరాను', cant_come: 'రాలేను',
    scan: 'కస్టమర్ కోడ్ స్కాన్ చేయి', or_tap: 'లేదా రంగు + నంబర్ నొక్కండి', or_otp: '4 అంకెల కోడ్', start_shift: 'కస్టమర్ దగ్గర START కోడ్ అడగండి',
    end_shift: 'పని అయిందా? FINISH కోడ్ అడగండి', working: 'పని జరుగుతోంది', time_left: 'మిగిలిన సమయం',
    wrong: 'కోడ్ తప్పు', tries_left: 'సార్లు మిగిలాయి', new_code: 'కస్టమర్ దగ్గర కొత్త కోడ్ అడగండి',
    paid: 'డబ్బు పంపాం!', to_upi: 'మీ UPI కి పంపాం', done: 'సరే',
    passbook: 'నా పాస్‌బుక్', total: 'మొత్తం సంపాదన', shifts: 'పూర్తైన పనులు', score: 'Krewzo స్కోర్', loan_ready: 'లోన్ సిద్ధం', loan_not_yet: '20 పనులు చేస్తే లోన్ వస్తుంది',
    help: 'సహాయం', phone: 'మీ మొబైల్ నంబర్', pin: 'మీ 4 అంకెల PIN', next: 'ముందుకు', back: 'వెనక్కి',
    your_name: 'మీ పేరు', your_level: 'మీ పని స్థాయి', your_work: 'మీరు ఏ పని చేస్తారు?', upi: 'UPI ID (డబ్బు కోసం)', join: 'Krewzo లో చేరండి',
    kyc_pending: 'మీ ID చెక్ జరుగుతోంది. మేము ఫోన్ చేస్తాం.', location_off: 'పనుల కోసం లొకేషన్ ఆన్ చేయండి',
    pick_lang: 'భాష ఎంచుకోండి', customer: 'కస్టమర్',
  },
  HI: {
    on_duty: 'ड्यूटी चालू', off_duty: 'ड्यूटी बंद', tap_to_start: 'काम पाने के लिए दबाएँ', tap_to_stop: 'काम रोकने के लिए दबाएँ',
    today: 'आज', jobs: 'काम', waiting: 'पास में काम ढूँढ रहे हैं…', offline_hint: 'काम के लिए ड्यूटी चालू करें',
    new_job: 'नया काम', accept: 'हाँ, लूँगा', skip: 'नहीं', km: 'किमी', hours: 'घंटे', scheduled: 'समय',
    navigate: 'चलो (मैप)', call: 'फ़ोन', arrived: 'मैं पहुँच गया', cant_come: 'नहीं आ सकता',
    scan: 'ग्राहक का कोड स्कैन करें', or_tap: 'या रंग + नंबर दबाएँ', or_otp: '4 अंकों का कोड', start_shift: 'ग्राहक से START कोड माँगें',
    end_shift: 'काम हो गया? FINISH कोड माँगें', working: 'काम चल रहा है', time_left: 'बचा समय',
    wrong: 'गलत कोड', tries_left: 'बार बचे', new_code: 'ग्राहक से नया कोड माँगें',
    paid: 'पैसे भेज दिए!', to_upi: 'आपके UPI पर भेजे', done: 'ठीक है',
    passbook: 'मेरी पासबुक', total: 'कुल कमाई', shifts: 'पूरे काम', score: 'Krewzo स्कोर', loan_ready: 'लोन तैयार', loan_not_yet: '20 काम करने पर लोन मिलेगा',
    help: 'मदद', phone: 'आपका मोबाइल नंबर', pin: 'आपका 4 अंकों का PIN', next: 'आगे', back: 'पीछे',
    your_name: 'आपका नाम', your_level: 'आपके काम का स्तर', your_work: 'आप क्या काम करते हैं?', upi: 'UPI ID (पैसे के लिए)', join: 'Krewzo से जुड़ें',
    kyc_pending: 'आपकी ID जाँच बाकी है। हम फ़ोन करेंगे।', location_off: 'काम के लिए लोकेशन चालू करें',
    pick_lang: 'भाषा चुनें', customer: 'ग्राहक',
  },
};

// Sentences read aloud. Numbers are passed as digits; the speech engine says them in the chosen language.
export const SAY = {
  EN: {
    job: (o) => `New job. ${o.payout} rupees. ${o.distance_km} kilometre away. ${o.hours} hours. Press green to accept.`,
    paid: (r) => `${r} rupees sent to your account.`,
    on: 'You are on duty.', off: 'You are off duty.', arrived: 'Ask the customer to show the code.',
    started: 'Work started.', wrong: 'Wrong code. Try again.',
    cancelled: (f) => `The customer cancelled. Do not go.${f ? ` ${f} rupees travel pay sent to your account.` : ''}`,
  },
  TE: {
    job: (o) => `కొత్త పని. ${o.payout} రూపాయలు. ${o.distance_km} కిలోమీటర్లు. ${o.hours} గంటలు. ఒప్పుకోవడానికి పచ్చ బటన్ నొక్కండి.`,
    paid: (r) => `${r} రూపాయలు మీ ఖాతాకు పంపాం.`,
    on: 'మీరు డ్యూటీలో ఉన్నారు.', off: 'డ్యూటీ ఆఫ్ అయింది.', arrived: 'కస్టమర్‌ని కోడ్ చూపించమనండి.',
    started: 'పని మొదలైంది.', wrong: 'కోడ్ తప్పు. మళ్ళీ ప్రయత్నించండి.',
    cancelled: (f) => `కస్టమర్ రద్దు చేశారు. వెళ్ళకండి.${f ? ` ప్రయాణానికి ${f} రూపాయలు పంపాం.` : ''}`,
  },
  HI: {
    job: (o) => `नया काम। ${o.payout} रुपये। ${o.distance_km} किलोमीटर दूर। ${o.hours} घंटे। हाँ के लिए हरा बटन दबाएँ।`,
    paid: (r) => `${r} रुपये आपके खाते में भेज दिए।`,
    on: 'आप ड्यूटी पर हैं।', off: 'ड्यूटी बंद हो गई।', arrived: 'ग्राहक से कोड दिखाने को कहें।',
    started: 'काम शुरू हो गया।', wrong: 'गलत कोड। फिर से कोशिश करें।',
    cancelled: (f) => `ग्राहक ने रद्द कर दिया। मत जाइए।${f ? ` सफ़र के ${f} रुपये भेज दिए।` : ''}`,
  },
};

// Added with the 2.0 redesign: names for every icon, plus native-alert text.
const MORE = {
  EN: {
    welcome: 'Welcome, partner', welcome_sub: 'Verified work near you. Paid to UPI the minute you finish.',
    hello: 'Hello', you_earn: 'You earn', slide: 'Slide to accept', taken: 'Job already taken',
    home: 'Home', earnings: 'Earnings', profile: 'Profile', rating: 'Rating', language: 'Language', logout: 'Log out',
    alerts_title: 'Never miss a job', alerts_body: 'Let Krewzo ring full screen and pop up over other apps, like a phone call.',
    allow_popup: 'Allow pop-up', allow_full: 'Allow full screen', alerts_ok: 'Big job alerts are on',
    on_way: 'On the way', at_door: 'At door', working_step: 'Working', paid_step: 'Paid',
    open_maps: 'Directions', for_customer: 'Job for', scanning: 'Looking for jobs near you', within: 'within 3 km',
    level: 'Level', skills: 'Skills', help_line: 'Call Krewzo help', sec: 's',
    cancelled_title: 'Customer cancelled', cancelled_body: "Don't go. You are free for new jobs.", travel_paid: 'Travel pay sent to your UPI',
    TRADES: { HELPER: 'General help', LOADING: 'Loading / shifting', CLEANING: 'Cleaning', GARDEN: 'Garden work', MASON: 'Mason help', PAINTER: 'Painting', PLUMBER: 'Plumbing', ELECTRICIAN: 'Electrical', CARPENTER: 'Carpentry' },
    TIERS: { TIER_1: 'Helper', TIER_2: 'Semi-skilled', TIER_3: 'Skilled' },
  },
  TE: {
    welcome: 'స్వాగతం', welcome_sub: 'దగ్గర్లో పని. పని అయిన వెంటనే UPI కి డబ్బు.',
    hello: 'నమస్కారం', you_earn: 'మీ సంపాదన', slide: 'ఒప్పుకోవడానికి జరపండి', taken: 'ఈ పని వేరే వాళ్ళు తీసుకున్నారు',
    home: 'హోమ్', earnings: 'సంపాదన', profile: 'ప్రొఫైల్', rating: 'రేటింగ్', language: 'భాష', logout: 'లాగ్ అవుట్',
    alerts_title: 'ఏ పనీ మిస్ అవ్వదు', alerts_body: 'ఫోన్ కాల్ లాగా పెద్ద స్క్రీన్‌పై రింగ్ అవ్వడానికి అనుమతి ఇవ్వండి.',
    allow_popup: 'పాప్-అప్ అనుమతి', allow_full: 'ఫుల్ స్క్రీన్ అనుమతి', alerts_ok: 'పెద్ద అలర్ట్‌లు ఆన్',
    on_way: 'దారిలో', at_door: 'ఇంటి దగ్గర', working_step: 'పని', paid_step: 'డబ్బు',
    open_maps: 'దారి', for_customer: 'కస్టమర్', scanning: 'దగ్గర్లో పని కోసం చూస్తున్నాం', within: '3 కి.మీ లోపు',
    level: 'స్థాయి', skills: 'పనులు', help_line: 'Krewzo సహాయం', sec: 'సె',
    cancelled_title: 'కస్టమర్ రద్దు చేశారు', cancelled_body: 'వెళ్ళకండి. కొత్త పనులు వస్తాయి.', travel_paid: 'ప్రయాణ డబ్బు మీ UPI కి పంపాం',
    TRADES: { HELPER: 'సహాయకుడు', LOADING: 'లోడింగ్ / షిఫ్టింగ్', CLEANING: 'శుభ్రం', GARDEN: 'తోట పని', MASON: 'మేస్త్రీ పని', PAINTER: 'పెయింటింగ్', PLUMBER: 'ప్లంబింగ్', ELECTRICIAN: 'ఎలక్ట్రికల్', CARPENTER: 'వడ్రంగి పని' },
    TIERS: { TIER_1: 'సహాయకుడు', TIER_2: 'సెమీ-స్కిల్డ్', TIER_3: 'నిపుణుడు' },
  },
  HI: {
    welcome: 'स्वागत है', welcome_sub: 'पास में काम। काम खत्म होते ही UPI पर पैसे।',
    hello: 'नमस्ते', you_earn: 'आपकी कमाई', slide: 'स्वीकार करने के लिए खिसकाएँ', taken: 'यह काम किसी और ने ले लिया',
    home: 'होम', earnings: 'कमाई', profile: 'प्रोफ़ाइल', rating: 'रेटिंग', language: 'भाषा', logout: 'लॉग आउट',
    alerts_title: 'कोई काम न छूटे', alerts_body: 'फ़ोन कॉल की तरह पूरी स्क्रीन पर घंटी बजने की अनुमति दें।',
    allow_popup: 'पॉप-अप की अनुमति', allow_full: 'फुल स्क्रीन की अनुमति', alerts_ok: 'बड़े अलर्ट चालू हैं',
    on_way: 'रास्ते में', at_door: 'दरवाज़े पर', working_step: 'काम', paid_step: 'पैसे',
    open_maps: 'रास्ता', for_customer: 'ग्राहक', scanning: 'पास में काम ढूँढ रहे हैं', within: '3 किमी के अंदर',
    level: 'स्तर', skills: 'काम', help_line: 'Krewzo मदद', sec: 'से',
    cancelled_title: 'ग्राहक ने रद्द किया', cancelled_body: 'मत जाइए। नए काम मिलते रहेंगे।', travel_paid: 'सफ़र के पैसे आपके UPI पर भेजे',
    TRADES: { HELPER: 'सामान्य मदद', LOADING: 'लोडिंग / शिफ्टिंग', CLEANING: 'सफ़ाई', GARDEN: 'बाग़बानी', MASON: 'राजमिस्त्री मदद', PAINTER: 'पेंटिंग', PLUMBER: 'प्लंबिंग', ELECTRICIAN: 'बिजली का काम', CARPENTER: 'बढ़ईगिरी' },
    TIERS: { TIER_1: 'हेल्पर', TIER_2: 'अर्ध-कुशल', TIER_3: 'कुशल कारीगर' },
  },
};
for (const l of Object.keys(MORE)) Object.assign(DICT[l], MORE[l]);

// Aadhaar ID check (Kyc.jsx). Error keys match the server's `code`.
const KYC = {
  EN: {
    kyc_title: 'Verify your Aadhaar', kyc_sub: 'Needed once before you get jobs. Takes about a minute.', kyc_start: 'Start',
    kyc_what: 'We read your name, date of birth, gender, area and photo from the Aadhaar QR. Only the last 4 digits of your Aadhaar number are kept.',
    kyc_phone_note: 'Your phone number must be the one linked to your Aadhaar.',
    kyc_consent: 'I agree to share my Aadhaar details with Krewzo for verification.',
    kyc_scan: 'Scan the big QR on your Aadhaar', kyc_scan_hint: 'Card, letter, e-Aadhaar PDF or mAadhaar app. Hold steady in good light.',
    kyc_pick: 'Choose a photo or screenshot of the QR', kyc_no_qr: 'No Aadhaar QR found in that photo. Try a clearer one.', kyc_qr_ok: 'Aadhaar QR scanned',
    kyc_selfie: 'Take a selfie', kyc_selfie_hint: 'Face the camera, no cap or mask. Customers will see this photo.', kyc_retake: 'Retake',
    kyc_submit: 'Submit for verification', kyc_pending_t: 'ID check under review', kyc_pending_b: 'We will approve you soon and send a notification.',
    kyc_rejected: 'ID check not approved. Try again or call Krewzo help.', kyc_done: 'Verified! You can go on duty now.',
    KYC_ERR: {
      BAD_SIGNATURE: 'This QR failed the UIDAI security check. Use the QR on your Aadhaar or a fresh e-Aadhaar.',
      MOBILE_MISMATCH: 'This Aadhaar is linked to a different mobile number. Sign up with the number linked to your Aadhaar.',
      UNDER_18: 'You must be 18 or older.', DUPLICATE: 'This Aadhaar is already used on another Krewzo account. Call help.',
      BLOCKED: 'This Aadhaar cannot be used on Krewzo. Call help.', OLD_QR: 'Old Aadhaar QR. Download a new e-Aadhaar or use the mAadhaar app.',
      NOT_AADHAAR: 'This is not an Aadhaar QR. Scan the big QR on your Aadhaar.',
    },
  },
  TE: {
    kyc_title: 'మీ ఆధార్ ధృవీకరించండి', kyc_sub: 'పనులు రావడానికి ఒక్కసారి చేయాలి. సుమారు 1 నిమిషం.', kyc_start: 'మొదలుపెట్టండి',
    kyc_what: 'ఆధార్ QR నుండి మీ పేరు, పుట్టిన తేదీ, లింగం, ప్రాంతం, ఫోటో తీసుకుంటాం. ఆధార్ నంబర్‌లో చివరి 4 అంకెలు మాత్రమే ఉంచుతాం.',
    kyc_phone_note: 'మీ ఫోన్ నంబర్ ఆధార్‌కు లింక్ అయిన నంబర్ అయి ఉండాలి.',
    kyc_consent: 'ధృవీకరణ కోసం నా ఆధార్ వివరాలు Krewzo తో పంచుకోవడానికి అంగీకరిస్తున్నాను.',
    kyc_scan: 'ఆధార్ పై ఉన్న పెద్ద QR స్కాన్ చేయండి', kyc_scan_hint: 'కార్డ్, లెటర్, e-ఆధార్ లేదా mAadhaar యాప్. వెలుతురులో కదలకుండా పట్టుకోండి.',
    kyc_pick: 'QR ఫోటో లేదా స్క్రీన్‌షాట్ ఎంచుకోండి', kyc_no_qr: 'ఆ ఫోటోలో ఆధార్ QR కనిపించలేదు. స్పష్టమైనది ప్రయత్నించండి.', kyc_qr_ok: 'ఆధార్ QR స్కాన్ అయింది',
    kyc_selfie: 'సెల్ఫీ తీసుకోండి', kyc_selfie_hint: 'కెమెరా వైపు చూడండి, టోపీ లేదా మాస్క్ వద్దు. కస్టమర్లు ఈ ఫోటో చూస్తారు.', kyc_retake: 'మళ్ళీ తీయండి',
    kyc_submit: 'ధృవీకరణకు పంపండి', kyc_pending_t: 'ID చెక్ జరుగుతోంది', kyc_pending_b: 'త్వరలో ఆమోదించి మీకు నోటిఫికేషన్ పంపుతాం.',
    kyc_rejected: 'ID చెక్ ఆమోదం కాలేదు. మళ్ళీ ప్రయత్నించండి లేదా సహాయానికి కాల్ చేయండి.', kyc_done: 'ధృవీకరణ పూర్తి! ఇప్పుడు డ్యూటీ ఆన్ చేయవచ్చు.',
    KYC_ERR: {
      BAD_SIGNATURE: 'ఈ QR UIDAI భద్రతా చెక్‌లో విఫలమైంది. మీ ఆధార్‌పై ఉన్న QR లేదా కొత్త e-ఆధార్ వాడండి.',
      MOBILE_MISMATCH: 'ఈ ఆధార్ వేరే మొబైల్ నంబర్‌కు లింక్ అయింది. ఆధార్‌కు లింక్ అయిన నంబర్‌తో చేరండి.',
      UNDER_18: '18 సంవత్సరాలు నిండి ఉండాలి.', DUPLICATE: 'ఈ ఆధార్ ఇప్పటికే వేరే Krewzo ఖాతాలో ఉంది. సహాయానికి కాల్ చేయండి.',
      BLOCKED: 'ఈ ఆధార్ Krewzo లో వాడలేరు. సహాయానికి కాల్ చేయండి.', OLD_QR: 'పాత ఆధార్ QR. కొత్త e-ఆధార్ డౌన్‌లోడ్ చేయండి లేదా mAadhaar యాప్ వాడండి.',
      NOT_AADHAAR: 'ఇది ఆధార్ QR కాదు. ఆధార్‌పై పెద్ద QR స్కాన్ చేయండి.',
    },
  },
  HI: {
    kyc_title: 'अपना आधार सत्यापित करें', kyc_sub: 'काम पाने से पहले एक बार। लगभग 1 मिनट लगेगा।', kyc_start: 'शुरू करें',
    kyc_what: 'आधार QR से आपका नाम, जन्म तिथि, लिंग, इलाका और फ़ोटो लेते हैं। आधार नंबर के सिर्फ़ आखिरी 4 अंक रखे जाते हैं।',
    kyc_phone_note: 'आपका फ़ोन नंबर वही होना चाहिए जो आधार से जुड़ा है।',
    kyc_consent: 'मैं सत्यापन के लिए अपने आधार की जानकारी Krewzo को देने के लिए सहमत हूँ।',
    kyc_scan: 'आधार पर बड़ा QR स्कैन करें', kyc_scan_hint: 'कार्ड, पत्र, ई-आधार PDF या mAadhaar ऐप। अच्छी रोशनी में स्थिर रखें।',
    kyc_pick: 'QR की फ़ोटो या स्क्रीनशॉट चुनें', kyc_no_qr: 'उस फ़ोटो में आधार QR नहीं मिला। साफ़ फ़ोटो आज़माएँ।', kyc_qr_ok: 'आधार QR स्कैन हो गया',
    kyc_selfie: 'सेल्फ़ी लें', kyc_selfie_hint: 'कैमरे की ओर देखें, टोपी या मास्क नहीं। ग्राहक यह फ़ोटो देखेंगे।', kyc_retake: 'फिर से लें',
    kyc_submit: 'सत्यापन के लिए भेजें', kyc_pending_t: 'ID जाँच हो रही है', kyc_pending_b: 'जल्द ही मंज़ूरी देकर सूचना भेजेंगे।',
    kyc_rejected: 'ID जाँच मंज़ूर नहीं हुई। फिर से कोशिश करें या Krewzo मदद को कॉल करें।', kyc_done: 'सत्यापित! अब ड्यूटी चालू कर सकते हैं।',
    KYC_ERR: {
      BAD_SIGNATURE: 'यह QR UIDAI सुरक्षा जाँच में फ़ेल हुआ। आधार पर छपा QR या नया ई-आधार इस्तेमाल करें।',
      MOBILE_MISMATCH: 'यह आधार किसी दूसरे मोबाइल नंबर से जुड़ा है। आधार से जुड़े नंबर से जुड़ें।',
      UNDER_18: 'उम्र 18 साल या ज़्यादा होनी चाहिए।', DUPLICATE: 'यह आधार पहले से किसी दूसरे Krewzo खाते में है। मदद को कॉल करें।',
      BLOCKED: 'यह आधार Krewzo पर इस्तेमाल नहीं हो सकता। मदद को कॉल करें।', OLD_QR: 'पुराना आधार QR। नया ई-आधार डाउनलोड करें या mAadhaar ऐप इस्तेमाल करें।',
      NOT_AADHAAR: 'यह आधार QR नहीं है। आधार पर बड़ा QR स्कैन करें।',
    },
  },
};
for (const l of Object.keys(KYC)) Object.assign(DICT[l], KYC[l]);

// Worker's own UPI QR (Profile).
const QR_TEXT = {
  EN: { my_qr: 'My UPI QR', my_qr_sub: 'Show this to get paid or tipped straight to your UPI.' },
  TE: { my_qr: 'నా UPI QR', my_qr_sub: 'దీన్ని చూపిస్తే డబ్బు లేదా టిప్ నేరుగా మీ UPI కి వస్తుంది.' },
  HI: { my_qr: 'मेरा UPI QR', my_qr_sub: 'इसे दिखाएँ, पैसे या टिप सीधे आपके UPI में आएँगे।' },
};
for (const l of Object.keys(QR_TEXT)) Object.assign(DICT[l], QR_TEXT[l]);

// Push status (Profile).
const PUSH_TEXT = {
  EN: { push_on: 'Job alerts are on', push_off: 'Job alerts are off on this phone', push_fix: 'Fix', push_blocked: 'Notifications are blocked. Turn them on in Settings.' },
  TE: { push_on: 'జాబ్ అలర్ట్‌లు ఆన్‌లో ఉన్నాయి', push_off: 'ఈ ఫోన్‌లో జాబ్ అలర్ట్‌లు ఆఫ్‌లో ఉన్నాయి', push_fix: 'సరిచేయండి', push_blocked: 'నోటిఫికేషన్లు బ్లాక్ అయ్యాయి. సెట్టింగ్స్‌లో ఆన్ చేయండి.' },
  HI: { push_on: 'जॉब अलर्ट चालू हैं', push_off: 'इस फ़ोन पर जॉब अलर्ट बंद हैं', push_fix: 'ठीक करें', push_blocked: 'सूचनाएँ बंद हैं। सेटिंग्स में चालू करें।' },
};
for (const l of Object.keys(PUSH_TEXT)) Object.assign(DICT[l], PUSH_TEXT[l]);
