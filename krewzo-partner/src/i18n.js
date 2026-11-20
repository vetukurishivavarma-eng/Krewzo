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
  },
  TE: {
    job: (o) => `కొత్త పని. ${o.payout} రూపాయలు. ${o.distance_km} కిలోమీటర్లు. ${o.hours} గంటలు. ఒప్పుకోవడానికి పచ్చ బటన్ నొక్కండి.`,
    paid: (r) => `${r} రూపాయలు మీ ఖాతాకు పంపాం.`,
    on: 'మీరు డ్యూటీలో ఉన్నారు.', off: 'డ్యూటీ ఆఫ్ అయింది.', arrived: 'కస్టమర్‌ని కోడ్ చూపించమనండి.',
    started: 'పని మొదలైంది.', wrong: 'కోడ్ తప్పు. మళ్ళీ ప్రయత్నించండి.',
  },
  HI: {
    job: (o) => `नया काम। ${o.payout} रुपये। ${o.distance_km} किलोमीटर दूर। ${o.hours} घंटे। हाँ के लिए हरा बटन दबाएँ।`,
    paid: (r) => `${r} रुपये आपके खाते में भेज दिए।`,
    on: 'आप ड्यूटी पर हैं।', off: 'ड्यूटी बंद हो गई।', arrived: 'ग्राहक से कोड दिखाने को कहें।',
    started: 'काम शुरू हो गया।', wrong: 'गलत कोड। फिर से कोशिश करें।',
  },
};
