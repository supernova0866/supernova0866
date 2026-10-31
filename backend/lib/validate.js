import { HttpError } from './http.js';

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

export function str(v, name, min, max) {
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be text`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${name} must be ${min}-${max} characters`);
  if (CONTROL.test(s)) throw new HttpError(400, `${name} contains invalid characters`);
  return s;
}

export function optStr(v, name, max) {
  if (v === undefined || v === null || v === '') return '';
  return str(v, name, 0, max);
}

export function cleanUrl(v, name = 'url') {
  const s = optStr(v, name, 500);
  if (s === '' || s === '#') return s;
  if (/^https?:\/\//i.test(s)) {
    try { new URL(s); } catch { throw new HttpError(400, `${name} is not a valid url`); }
    return s;
  }
  if (/^mailto:[^\s]+$/i.test(s)) return s;
  throw new HttpError(400, `${name} must start with http://, https:// or mailto:`);
}

export function safeJson(text, fallback = []) {
  try { return JSON.parse(text); } catch { return fallback; }
}
