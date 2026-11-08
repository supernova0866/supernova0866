(function () {
  const FUN = [
    { id: 'escape',      time: '99:99',   sec: '', sub: 'escaped space-time' },
    { id: 'nonexistent', time: '25:61',   sec: '', sub: 'this hour does not exist' },
    { id: 'nan',         time: 'NaN:NaN', sec: '', sub: 'undefined behavior' },
    { id: 'none',        time: '--:--',   sec: '', sub: 'time is a construct' },
    { id: 'circle',      time: '12:00',   sec: '', sub: 'time is a flat circle' },
    { id: 'beats',       live: true },
    { id: 'mars',        live: true },
    { id: 'glitch',      live: true },
  ];

  const FORMATS = [
    { h12: true,  seconds: false },
    { h12: true,  seconds: true },
    { h12: false, seconds: false },
    { h12: false, seconds: true },
  ];

  const FALLBACK_ZONES = [
    'UTC', 'America/Los_Angeles', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin',
    'Africa/Cairo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  ];

  const MODERN_NAMES = {
    'Asia/Calcutta': 'Asia/Kolkata',
    'Asia/Katmandu': 'Asia/Kathmandu',
    'Asia/Saigon': 'Asia/Ho_Chi_Minh',
    'Asia/Rangoon': 'Asia/Yangon',
    'Europe/Kiev': 'Europe/Kyiv',
    'America/Godthab': 'America/Nuuk',
    'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
    'America/Catamarca': 'America/Argentina/Catamarca',
    'America/Cordoba': 'America/Argentina/Cordoba',
    'America/Jujuy': 'America/Argentina/Jujuy',
    'America/Mendoza': 'America/Argentina/Mendoza',
    'America/Indianapolis': 'America/Indiana/Indianapolis',
    'America/Louisville': 'America/Kentucky/Louisville',
    'Atlantic/Faeroe': 'Atlantic/Faroe',
    'Pacific/Ponape': 'Pacific/Pohnpei',
    'Pacific/Truk': 'Pacific/Chuuk',
  };

  const GLYPHS = '0123456789#@%&?/<>';
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  // ── fixed GMT offsets (what the dashboard picker offers) ──
  const OFFSETS = [
    '-12:00', '-11:00', '-10:00', '-09:30', '-09:00', '-08:00', '-07:00', '-06:00', '-05:00', '-04:00',
    '-03:30', '-03:00', '-02:00', '-01:00', '+00:00', '+01:00', '+02:00', '+03:00', '+03:30', '+04:00',
    '+04:30', '+05:00', '+05:30', '+05:45', '+06:00', '+06:30', '+07:00', '+08:00', '+08:45', '+09:00',
    '+09:30', '+10:00', '+10:30', '+11:00', '+12:00', '+12:45', '+13:00', '+14:00',
  ];
  const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/;

  // "+05:30" -> 330, anything else (or out of range) -> null
  function fixedMinutes(zone) {
    const m = OFFSET_RE.exec(zone);
    if (!m || +m[3] > 59) return null;
    const mins = (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
    return mins >= -720 && mins <= 840 ? mins : null;
  }

  const label = (zone) => (fixedMinutes(zone) === null ? zone : 'GMT' + zone);

  function fmtOffset(mins) {
    if (mins === 0) return 'GMT';
    const a = Math.abs(mins);
    return 'GMT ' + (mins < 0 ? '-' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + pad(a % 60) : '');
  }

  // any zone (old IANA name or offset) -> nearest entry in OFFSETS
  function toOffset(zone, now = new Date()) {
    if (fixedMinutes(zone) !== null) return zone;
    let mins = 0;
    try {
      const raw = (new Intl.DateTimeFormat('en', { timeZone: validZone(zone), timeZoneName: 'shortOffset' })
        .formatToParts(now).find((x) => x.type === 'timeZoneName') || {}).value || '';
      const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
      if (m) mins = (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0));
    } catch {}
    return OFFSETS.reduce((best, o) => (Math.abs(fixedMinutes(o) - mins) < Math.abs(fixedMinutes(best) - mins) ? o : best));
  }

  const partFormatters = new Map();
  const offsetFormatters = new Map();
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function validZone(zone) {
    if (typeof zone !== 'string' || !zone) return 'UTC';
    if (fixedMinutes(zone) !== null) return zone;
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return zone;
    } catch {
      return 'UTC';
    }
  }

  function modern(zone) {
    const name = validZone(zone);
    if (fixedMinutes(name) !== null) return name;
    const m = MODERN_NAMES[name] || name;
    return validZone(m) === m ? m : name;
  }

  function zones() {
    const raw = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_ZONES;
    const list = new Set(raw.map((z) => MODERN_NAMES[z] || z));
    list.add('UTC');
    return [...list].sort();
  }

  function parts(now, zone, hour12) {
    const fixed = fixedMinutes(zone);
    const tz = fixed === null ? zone : 'UTC';
    const date = fixed === null ? now : new Date(now.getTime() + fixed * 60000);
    const key = tz + '|' + hour12;
    let f = partFormatters.get(key);
    if (!f) {
      f = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: hour12 ? 'h12' : 'h23',
      });
      partFormatters.set(key, f);
    }
    const out = {};
    for (const p of f.formatToParts(date)) out[p.type] = p.value;
    return out;
  }

  function offset(zone, now = new Date()) {
    const fixed = fixedMinutes(zone);
    if (fixed !== null) return fmtOffset(fixed);
    try {
      let f = offsetFormatters.get(zone);
      if (!f) {
        f = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' });
        offsetFormatters.set(zone, f);
      }
      const raw = (f.formatToParts(now).find((x) => x.type === 'timeZoneName') || {}).value || '';
      if (raw === 'GMT' || /^GMT[+-]0(:00)?$/.test(raw)) return 'GMT';
      return raw.replace(/^GMT/, 'GMT ');
    } catch {
      return '';
    }
  }

  function beats(now) {
    const bmt = (((now.getTime() + 3600000) % 86400000) + 86400000) % 86400000;
    const b = bmt / 86400;
    return { time: '@' + pad(Math.floor(b), 3), sec: '.' + pad(Math.floor((b % 1) * 100)), sub: 'internet beats · no timezones' };
  }

  function mars(now) {
    const jdTt = now.getTime() / 86400000 + 2440587.5 + 69.184 / 86400;
    const msd = (jdTt - 2405522.0028779) / 1.0274912517;
    const sol = Math.floor(msd);
    const total = Math.floor((msd - sol) * 86400);
    return {
      time: pad(Math.floor(total / 3600)) + ':' + pad(Math.floor((total % 3600) / 60)),
      sec: ':' + pad(total % 60),
      sub: 'mars time · sol ' + sol,
    };
  }

  function scramble(text) {
    return text.replace(/\d/g, (d) => (Math.random() < 0.18 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : d));
  }

  function frame(cfg = {}, now = new Date(), format = 0) {
    const zone = modern(cfg['clock:zone']);
    const mode = cfg['clock:mode'] || 'timezone';
    const real24 = parts(now, zone, false);
    const realText = real24.hour + ':' + real24.minute;

    if (mode === 'fun') {
      const preset = FUN.find((p) => p.id === cfg['clock:fun']) || FUN[0];
      let out;
      if (preset.id === 'beats') out = beats(now);
      else if (preset.id === 'mars') out = mars(now);
      else if (preset.id === 'glitch') {
        const t = real24.hour + ':' + real24.minute;
        const s = ':' + real24.second;
        out = reducedMotion() ? { time: t, sec: s, sub: 'signal unstable' } : { time: scramble(t), sec: scramble(s), sub: 'signal unstable' };
      } else out = preset;
      const exact = preset.id === 'beats' || preset.id === 'mars';
      return { time: out.time, sec: out.sec, sub: out.sub, mini: out.time, clickable: false, aria: exact ? `${out.time}${out.sec}, ${out.sub}` : realText };
    }

    if (mode === 'custom') {
      const time = (cfg['clock:custom_text'] || '').trim() || '--:--';
      return { time, sec: '', sub: (cfg['clock:custom_subtext'] || '').trim(), mini: time, clickable: false, aria: realText };
    }

    const fmt = FORMATS[((format % 4) + 4) % 4];
    const real = fmt.h12 ? parts(now, zone, true) : real24;
    const period = fmt.h12 ? ' ' + real.dayPeriod : '';
    const sub = offset(zone, now);
    return {
      time: real.hour + ':' + real.minute,
      sec: fmt.seconds ? ':' + real.second + period : period,
      sub,
      mini: real24.hour + ':' + real24.minute,
      clickable: true,
      aria: `${real.hour}:${real.minute}${period} ${sub}`,
    };
  }

  let timer = null;
  let current = {};
  let format = 0;
  let wired = false;

  function render() {
    const f = frame(current, new Date(), format);
    const set = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
    set(document.getElementById('clock-time'), f.time);
    set(document.getElementById('clock-seconds'), f.sec);
    set(document.getElementById('clock-location'), f.sub);
    set(document.querySelector('.nav-time-mini'), f.mini);
    const box = document.querySelector('.clock-display');
    if (!box) return f;
    const ariaLabel = f.clickable ? f.aria + ', click to change the format' : f.aria;
    if (box.getAttribute('aria-label') !== ariaLabel) box.setAttribute('aria-label', ariaLabel);
    if (f.clickable) {
      box.setAttribute('role', 'button');
      box.setAttribute('tabindex', '0');
      box.style.cursor = 'pointer';
      box.style.userSelect = 'none';
    } else {
      box.removeAttribute('role');
      box.removeAttribute('tabindex');
      box.style.cursor = '';
      box.style.userSelect = '';
    }
    return f;
  }

  function cycle() {
    if (!frame(current, new Date(), format).clickable) return;
    format = (format + 1) % FORMATS.length;
    render();
  }

  function wire() {
    const box = document.querySelector('.clock-display');
    if (!box || wired) return;
    wired = true;
    box.addEventListener('click', cycle);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); }
    });
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  function start(cfg = {}) {
    stop();
    current = cfg;
    wire();
    const fast = cfg['clock:mode'] === 'fun' && ['beats', 'glitch'].includes(cfg['clock:fun']);
    const tick = () => {
      render();
      timer = setTimeout(tick, fast ? 250 : 1000 - (Date.now() % 1000) + 10);
    };
    tick();
  }

  window.NovaClock = { FUN, FORMATS, OFFSETS, frame, start, stop, zones, offset, label, toOffset, validZone, modern };
})();
