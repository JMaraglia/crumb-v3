// file: src/AccountViews.jsx
// Shared screens for an account list (Prospects now, Customers next):
//   AccountList   – search, sort, tap a row
//   AccountDetail – one account: address, contacts, days, notes
//   AccountEdit   – one form for adding and editing (Save / Cancel / Delete)
// Data shape: { id, name, address, contacts[], deliveryDays[], notes[] }
// (+ accountNumber and visitDays for customers; prospects keep visit days in deliveryDays).
// (+ accountNumber for customers).
import React, { useState } from 'react';
import { FaArrowLeft, FaChevronRight, FaPhoneAlt, FaMapMarkerAlt, FaEnvelope, FaGlobe } from 'react-icons/fa';
import { IoShareOutline } from 'react-icons/io5';
import { shareText, shareFile, contactCards, safeFileName } from './share';
import { makeXlsx } from './xlsx';
import { useNavigate, useParams } from 'react-router-dom';
import SwipeRow from './SwipeRow';
import AskSheet from './AskSheet';
import AccountPhotos from './AccountPhotos';
import { deleteAccountPhotos, photoKey } from './photos';
import './AccountViews.css';
import { DAYS, FREQUENCIES, STAGES, stageInfo, nextVisitDate, snoozeUntilFor, isSnoozed, readJSON } from './schedule';

/* ---------- Groups: one business, several locations ----------
   Each location is its own customer or prospect. Locations share a `group` name
   (customers and prospects can be in the same group). */
export function groupOf(account) {
  return String((account && account.group) || '').trim();
}
// Every customer + prospect, as { type, account }. `current` = the list on screen (freshest copy).
function bothLists(currentType, current) {
  const customers = currentType === 'customer' ? current : readJSON('crumb_contacts', []) || [];
  const prospects = currentType === 'prospect' ? current : readJSON('crumb_prospects', []) || [];
  // (currentType null = read both from the phone)
  return [
    ...customers.map((a) => ({ type: 'customer', account: a })),
    ...prospects.map((a) => ({ type: 'prospect', account: a })),
  ].filter((x) => x.account && x.account.name && String(x.account.name).trim());
}
export function groupMembers(group, currentType, current) {
  const g = String(group || '').trim().toLowerCase();
  if (!g) return [];
  return bothLists(currentType, current).filter((x) => groupOf(x.account).toLowerCase() === g);
}
/* ---------- Repeat check: is this business already in Crumb? ---------- */
const simpleName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'`.,]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .replace(/ (inc|llc|co|corp|company)$/, '')
    .trim();
const simpleStreet = (s) =>
  simpleName(s)
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\bsouth\b/g, 's');
// Customers + prospects that look like the same business: same name, or same street + town.
// Locations in the same group (same business on purpose) don't count.
export function findRepeats({ name, street, town, group }, skip = null) {
  const n = simpleName(name);
  const st = simpleStreet(street);
  const tw = simpleName(town);
  const g = String(group || '').trim().toLowerCase();
  return bothLists(null, [])
    .filter((x) => !(skip && x.type === skip.type && String(x.account.id) === String(skip.id)))
    .filter((x) => !(g && groupOf(x.account).toLowerCase() === g))
    .filter((x) => {
      const a = x.account;
      const sameName = n && simpleName(a.name) === n;
      const sameAddress = st && tw && simpleStreet(a.street) === st && simpleName(a.town) === tw;
      return sameName || sameAddress;
    });
}

/* ---------- Inactive accounts (closed, dead, etc.) ----------
   account.inactive = { reason, since: 'YYYY-MM-DD' }. Kept with all notes; just off the
   lists, Itinerary, Calendar, Call Sheet and reminders until made active again. */
export const INACTIVE_REASONS = [
  ['closed', 'Closed'],
  ['dead', 'Dead lead'],
  ['credit', 'Credit risk'],
  ['notfit', 'Not a fit'],
  ['competitor', 'Went with a competitor'],
  ['other', 'Other'],
];
function revisitText(r) {
  if (!r || !r.revisit) return '';
  const d = new Date(r.revisit + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return typeof r.revisitTime === 'number' ? `${d} at ${timeLabel(r.revisitTime)}` : d;
}

// Revisit an inactive account on a set day: it shows on that day's Itinerary and Calendar.
function RevisitSheet({ account, onSave, onCancel }) {
  const r = account.inactive || {};
  const plus = (months) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [day, setDay] = useState(r.revisit || plus(3));
  const [time, setTime] = useState(typeof r.revisitTime === 'number' ? r.revisitTime : 600);
  return (
    <div className="av-sheet-backdrop" onClick={onCancel}>
      <div className="av-sheet av-vs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="av-vs-top">
          <button className="av-vs-link" onClick={onCancel}>Cancel</button>
          <div className="av-vs-title">Revisit · {displayName(account)}</div>
          <button className="av-vs-link av-vs-bold" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(day)} onClick={() => onSave({ revisit: day, revisitTime: time })}>
            Save
          </button>
        </div>
        <div className="av-vs-group">
          <div className="av-vs-label">Come back in</div>
          <div className="av-revisit-quick">
            {[1, 3, 6, 12].map((m) => (
              <button key={m} type="button" className={`av-day-btn ${day === plus(m) ? 'is-on' : ''}`} onClick={() => setDay(plus(m))}>
                {m === 12 ? '1 yr' : `${m} mo`}
              </button>
            ))}
          </div>
          <label className="av-vs-row">
            <span>Day</span>
            <input type="date" className="av-vs-select" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="av-vs-row">
            <span>Time</span>
            <select className="av-vs-select" value={time} onChange={(e) => setTime(Number(e.target.value))}>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
        </div>
        {r.revisit && (
          <button className="av-revisit-remove" onClick={() => onSave({ revisit: null, revisitTime: null })}>
            No revisit
          </button>
        )}
        <div className="av-vs-hint">On that day it shows on your Itinerary and Calendar (with a reminder). It stays Inactive until you tap Activate.</div>
      </div>
    </div>
  );
}

export function inactiveLabel(account) {
  const r = account && account.inactive;
  if (!r) return '';
  return (INACTIVE_REASONS.find(([k]) => k === r.reason) || [null, 'Inactive'])[1];
}

/* ---------- Deleting an account deletes everything that belongs to it ----------
   Its notes (they live on the account), its photos, calendar events linked to it, Itinerary stops
   added for it, and To-Do tasks linked to it. (Other locations in its group are not touched.) */
export function deleteWarning(account, config) {
  return `Permanently delete ${displayName(account)}?\n\nThis deletes the ${config.singular.toLowerCase()} and everything with it: notes, photos, its meetings on the Calendar, its Itinerary stops and To-Do tasks.\n\nIt can't be undone.`;
}
export function deleteAccountExtras(type, id) {
  const same = (x) => x && x.accountType === type && String(x.accountId) === String(id);
  const clean = (k, keep) => {
    try {
      const list = JSON.parse(localStorage.getItem(k) || '[]');
      if (Array.isArray(list)) localStorage.setItem(k, JSON.stringify(list.filter(keep)));
    } catch {
      /* leave it */
    }
  };
  clean('crumb_calendar_events', (ev) => !same(ev));
  clean('visitData', (v) => !same(v));
  clean('crumb_todos', (t) => !same(t));
  deleteAccountPhotos(photoKey(type, id)).catch(() => {});
}

const typeOf = (config) => (config.basePath === '/prospects' ? 'prospect' : 'customer');

// Re-exported so other files can keep importing these from here.
export { DAYS, FREQUENCIES, STAGES, stageInfo };


// Go back like the iPhone back gesture; if there's nowhere to go back to, go to `fallback`.
function useGoBack() {
  const navigate = useNavigate();
  return (fallback, steps = 1) => {
    const idx = window.history.state && window.history.state.idx;
    if (typeof idx === 'number' && idx >= steps) navigate(-steps);
    else navigate(fallback, { replace: true });
  };
}

// Phone numbers as (774) 223-3374.
// formatPhone: for SHOWING a saved number — only reformats a full 10-digit US
//   number (or 11 starting with 1); anything else is shown as typed.
// formatPhoneTyping: for the input box — formats as you type and still lets
//   you backspace through it. Extensions/international are left as typed.
function usDigits(value) {
  const raw = value || '';
  if (/[a-z+]/i.test(raw)) return null; // has letters (ext.) or + (international)
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length > 10 ? null : d;
}

export function formatPhone(value) {
  const d = usDigits(value);
  if (d === null || d.length !== 10) return value || '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function formatPhoneTyping(value) {
  const d = usDigits(value);
  if (d === null) return value || '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function digitsOnly(phone) {
  return (phone || '').replace(/[^\d+]/g, '');
}

/* ---------- Visit schedule ----------
   visitTime: minutes from midnight (e.g. 600 = 10:00 AM), or null for no set time
   visitFrequency: one of the keys below
   visitStart: 'YYYY-MM-DD' first visit, so "every 2 weeks" knows which weeks
   Visit days use config.visitDaysField (prospects: deliveryDays, as before). */

function frequencyLabel(key) {
  const f = FREQUENCIES.find((x) => x.key === key);
  return f ? f.label : 'Weekly';
}

function shortFrequency(key) {
  return { weekly: 'Weekly', '2w': 'Every 2 wks', '3w': 'Every 3 wks', '4w': 'Monthly', '8w': 'Every 2 mos' }[key] || 'Weekly';
}

export function timeLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// 5:00 AM … 11:30 PM first, then 12:00 AM … 4:30 AM at the bottom
// (iPhone's time wheel starts at the top, so this avoids landing on 3:30 AM by accident).
// How long a visit takes, for route planning (minutes)
export const DEFAULT_VISIT_LENGTH = 30;
export const VISIT_LENGTHS = [10, 15, 20, 30, 45, 60, 90, 120];
export function lengthLabel(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => ((i + 10) % 48) * 30);

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Tue · 10:00 AM" / "Tue, Thu" / null when no visit days are set
function visitSummary(account, config) {
  const days = DAYS.filter((d) => (account[config.visitDaysField] || []).includes(d));
  if (days.length === 0) return null;
  const dayText = days.join(', ');
  return typeof account.visitTime === 'number' ? `${dayText} · ${timeLabel(account.visitTime)}` : dayText;
}

/* ---------- Prospect stages (saved as account.stage) ---------- */


// onPick (optional): tapping the stage opens a quick stage picker.
export function StageChip({ stage, onPick }) {
  const st = stageInfo(stage);
  if (!st && !onPick) return null;
  const pick = onPick
    ? {
        role: 'button',
        onClick: (e) => {
          e.stopPropagation(); // don't open / close the row
          onPick();
        },
        onDoubleClick: (e) => e.stopPropagation(),
      }
    : {};
  if (!st)
    return (
      <span className={`av-chip av-chip-gray ${onPick ? 'av-stage-tap' : ''}`} {...pick}>
        Set stage
      </span>
    );
  return (
    <span className={`av-chip av-stage-chip ${onPick ? 'av-stage-tap' : ''}`} style={{ background: st.color, color: '#fff' }} {...pick}>
      {st.label}
    </span>
  );
}

// Visit day/time + how often chips. onPick (optional): tapping them opens the quick visit panel.
export function VisitChips({ account, config, onPick }) {
  const visit = visitSummary(account, config);
  const pick = onPick
    ? {
        role: 'button',
        onClick: (e) => {
          e.stopPropagation(); // don't open / close the row
          onPick();
        },
        onDoubleClick: (e) => e.stopPropagation(),
      }
    : {};
  const tap = onPick ? 'av-visit-tap' : '';
  return visit ? (
    <>
      <span className={`av-chip av-chip-blue ${tap}`} {...pick}>{visit}</span>
      <span className={`av-chip av-chip-gray ${tap}`} {...pick}>{shortFrequency(account.visitFrequency)}</span>
    </>
  ) : (
    <span className={`av-chip av-chip-orange ${tap}`} {...pick}>No visit set</span>
  );
}

// Quick visit panel: days, usual time, how often (+ start date). Same fields as the Edit screen,
// so the Itinerary, Calendar and reminders pick the change up right away.
export function VisitSheet({ account, config, onSave, onCancel }) {
  const field = config.visitDaysField;
  const [days, setDays] = useState(account[field] || []);
  const [time, setTime] = useState(typeof account.visitTime === 'number' ? account.visitTime : '');
  const [freq, setFreq] = useState(account.visitFrequency || 'weekly');
  const [startDay, setStartDay] = useState(account.visitStart || todayKey());
  const toggle = (d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const save = () =>
    onSave({
      [field]: DAYS.filter((d) => days.includes(d)),
      visitTime: time === '' ? null : Number(time),
      visitFrequency: freq,
      visitStart: freq === 'weekly' ? null : startDay,
      fixedTime: time !== '' && Boolean(account.fixedTime),
    });
  return (
    <div className="av-sheet-backdrop" onClick={onCancel}>
      <div className="av-sheet av-vs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="av-vs-top">
          <button className="av-vs-link" onClick={onCancel}>Cancel</button>
          <div className="av-vs-title">Visits · {displayName(account)}</div>
          <button className="av-vs-link av-vs-bold" onClick={() => save()}>Save</button>
        </div>
        <div className="av-vs-group">
          <div className="av-vs-label">Visit days</div>
          <div className="av-days">
            {DAYS.map((d) => (
              <button key={d} type="button" className={`av-day-btn ${days.includes(d) ? 'is-on' : ''}`} onClick={() => toggle(d)}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="av-vs-group">
          <label className="av-vs-row">
            <span>Usual time</span>
            <select className="av-vs-select" value={time} onChange={(e) => setTime(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">No set time</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
          <label className="av-vs-row">
            <span>How often</span>
            <select className="av-vs-select" value={freq} onChange={(e) => setFreq(e.target.value)}>
              {FREQUENCIES.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </label>
          {freq !== 'weekly' && (
            <label className="av-vs-row">
              <span>Starting</span>
              <input type="date" className="av-vs-select" value={startDay} onChange={(e) => e.target.value && setStartDay(e.target.value)} />
            </label>
          )}
        </div>
        <div className="av-vs-hint">Shows up on your Itinerary and Calendar right away. No days = no scheduled visits.</div>
      </div>
    </div>
  );
}

// Quick stage picker (Cold → Ready to close). The current stage has a check mark.
export function stageSheet(account, onChoose) {
  return {
    title: `${displayName(account)}: stage`,
    actions: STAGES.map((st) => ({
      label: `${st.label}${account.stage === st.key ? '  ✓' : ''}`,
      onClick: () => onChoose(st.key),
    })),
  };
}

// Same 12 colors as the calendar; each account keeps the same color by name.
const AVATAR_COLORS = ['#0077cc', '#ff3b30', '#ff9500', '#e6b800', '#34c759', '#00c7be', '#30b0c7', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93'];
function avatarColor(name) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, size = 40 }) {
  const letter = ((name || '').trim()[0] || '?').toUpperCase();
  return (
    <span className="av-avatar" style={{ backgroundColor: avatarColor(name), width: size, height: size, lineHeight: `${size}px`, fontSize: size * 0.42 }}>
      {letter}
    </span>
  );
}

function isBackground(n) {
  return n && n.category === 'Background';
}

// Background notes (profile info) are shown pinned, newest first.
function backgroundNotes(account) {
  return (account.notes || [])
    .filter(isBackground)
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
}

function BackgroundBox({ notes, onClick }) {
  if (!notes.length) return null;
  return (
    <button className="av-background" onClick={onClick}>
      <span className="av-background-title">Background</span>
      {notes.map((n, i) => (
        <span key={i} className="av-background-line">{n.text}</span>
      ))}
    </button>
  );
}

// Newest "last note" shown on lists, the account screen and the Itinerary:
// only Visit, Follow-up, Sample and Meeting notes (not Background, not unlabeled).
const LAST_NOTE_LABELS = ['visit', 'follow-up', 'sample', 'meeting'];
export function lastNote(account) {
  const notes = (account.notes || []).filter((n) => n && LAST_NOTE_LABELS.includes(String(n.category || '').toLowerCase()));
  if (notes.length === 0) return null;
  let best = notes[notes.length - 1];
  let bestTime = Date.parse(best.timestamp) || 0;
  notes.forEach((n) => {
    const t = Date.parse(n.timestamp) || 0;
    if (t > bestTime) {
      best = n;
      bestTime = t;
    }
  });
  return best;
}

export function shortDate(timestamp) {
  const t = Date.parse(timestamp);
  if (!t) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A record with nothing in it at all (left over from the old Add button).
function isEmptyRecord(a) {
  return (
    !(a.name && a.name.trim()) &&
    !(a.address && a.address.trim()) &&
    !(a.contacts || []).some((c) => c && (c.name || c.phone || c.textPhone || c.email || c.title)) &&
    !(a.notes || []).length
  );
}

function displayName(account) {
  return account.name && account.name.trim() ? account.name : '(No name)';
}

// Account tidied up for a contact card: formatted phones, address split into street/town/state/zip.
function cardReady(account) {
  const hasPieces = account.street || account.town || account.state || account.zip;
  return {
    ...account,
    ...(hasPieces ? {} : splitAddress(account.address)),
    contacts: (account.contacts || []).map((c) => ({
      ...c,
      phone: c.phone ? formatPhone(c.phone) : '',
      textPhone: c.textPhone ? formatPhone(c.textPhone) : '',
    })),
  };
}

// Everything worth sending about one account, as plain text (pastes into a text or email).
// "www.supremedonuts.com" → "https://www.supremedonuts.com"
export function websiteUrl(site) {
  const s = String(site || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
const websiteLabel = (site) => String(site || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

export function accountShareText(account, config) {
  const lines = [];
  const st = config.hasStage ? stageInfo(account.stage) : null;
  lines.push(`${displayName(account)} (${[config.singular, st && st.label].filter(Boolean).join(' · ')})`);
  if (config.hasAccountNumber && account.accountNumber) lines.push(`Acct #${account.accountNumber}`);
  if (account.address) {
    lines.push(`Address: ${account.address}`);
    lines.push(`Map: https://maps.google.com/?q=${encodeURIComponent(account.address)}`);
  }
  if (account.website) lines.push(`Website: ${websiteUrl(account.website)}`);
  const people = (account.contacts || []).filter((c) => c && (c.name || c.title || c.phone || c.textPhone || c.email));
  if (people.length) {
    lines.push('', 'Contacts:');
    people.forEach((c) => {
      const who = [c.name, c.title].filter(Boolean).join(', ') || 'Contact';
      const how = [
        c.phone && formatPhone(c.phone),
        c.textPhone && c.textPhone !== c.phone && `text ${formatPhone(c.textPhone)}`,
        c.email,
      ].filter(Boolean);
      lines.push(`• ${who}${how.length ? ` — ${how.join(' · ')}` : ''}`);
    });
  }
  const visit = visitSummary(account, config);
  const extra = [];
  if (visit) extra.push(`Visits: ${visit}, ${frequencyLabel(account.visitFrequency).toLowerCase()}`);
  if (config.deliveryDaysField && (account[config.deliveryDaysField] || []).length) {
    extra.push(`Delivers: ${DAYS.filter((d) => account[config.deliveryDaysField].includes(d)).join(', ')}`);
  }
  if (config.hasCallNote) {
    const call = [
      typeof account.callTime === 'number' ? `call at ${timeLabel(account.callTime)}` : account.callTime === 'na' ? 'no call needed' : '',
      account.onlineOrdering ? 'orders online' : '',
      account.callNote || '',
    ].filter(Boolean);
    if (call.length) extra.push(`Ordering: ${call.join(' · ')}`);
  }
  if (extra.length) lines.push('', ...extra);
  const bg = backgroundNotes(account);
  if (bg.length) lines.push('', 'Background:', ...bg.map((n) => `• ${n.text}`));
  const recent = (account.notes || [])
    .filter((n) => !isBackground(n))
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
    .slice(0, 3);
  if (recent.length) {
    lines.push('', 'Recent notes:');
    recent.forEach((n) => {
      const label = n.category && n.category !== 'General' ? ` (${n.category})` : '';
      lines.push(`• ${shortDate(n.timestamp)}${label}: ${n.text}`);
    });
  }
  return lines.join('\n');
}

// A list of accounts as a formatted Excel file (what's on screen: current filter + search).
function accountsXlsx(list, config, heading) {
  const main = (a) => (a.contacts || []).find((c) => c && (c.name || c.phone || c.email || c.title)) || {};
  const latest = (a) => {
    const n = lastNote(a);
    return n ? `${shortDate(n.timestamp)}: ${n.text}` : '';
  };
  const days = (a, field) => DAYS.filter((d) => (a[field] || []).includes(d)).join(', ');
  const visits = (a) => {
    const v = visitSummary(a, config);
    return v ? `${v}${a.visitFrequency && a.visitFrequency !== 'weekly' ? ` (${frequencyLabel(a.visitFrequency).toLowerCase()})` : ''}` : '';
  };
  const columns = [
    ...(config.hasAccountNumber ? [{ label: 'Acct #', width: 12, kind: 'quiet' }] : []),
    { label: config.singular, width: 26, kind: 'bold' },
    ...(config.hasStage ? [{ label: 'Stage', width: 14 }] : []),
    { label: 'Contact', width: 22 },
    { label: 'Phone', width: 16 },
    { label: 'Email', width: 26 },
    { label: 'Address', width: 34 },
    ...(config.deliveryDaysField ? [{ label: 'Delivers', width: 14 }] : []),
    { label: 'Visits', width: 18 },
    ...(config.hasCallNote ? [{ label: 'Call at', width: 10 }, { label: 'Online', width: 9, kind: 'check' }] : []),
    { label: 'Latest note', width: 44 },
  ];
  const rows = list.map((a) => {
    const c = main(a);
    const st = stageInfo(a.stage);
    return {
      cells: [
        ...(config.hasAccountNumber ? [a.accountNumber || ''] : []),
        displayName(a),
        ...(config.hasStage ? [st ? st.label : ''] : []),
        [c.name, c.title].filter(Boolean).join(', '),
        c.phone ? formatPhone(c.phone) : '',
        c.email || '',
        a.address || '',
        ...(config.deliveryDaysField ? [days(a, config.deliveryDaysField)] : []),
        visits(a),
        ...(config.hasCallNote
          ? [typeof a.callTime === 'number' ? timeLabel(a.callTime) : a.callTime === 'na' ? 'N/A' : '', Boolean(a.onlineOrdering)]
          : []),
        latest(a),
      ],
    };
  });
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return makeXlsx({
    sheets: [
      {
        name: config.plural,
        brand: 'Crumb.',
        kicker: config.plural.toUpperCase(),
        heading,
        detail: `${list.length} ${list.length === 1 ? config.singular.toLowerCase() : config.plural.toLowerCase()} · as of ${today}`,
        columns,
        rows,
        emptyText: `No ${config.plural.toLowerCase()} to show.`,
      },
    ],
  });
}

// Bottom pop-up with choices (Call / Text / Email, Apple Maps / Google Maps).
export function ActionSheet({ title, actions, onClose }) {
  return (
    <div className="av-sheet-backdrop" onClick={onClose}>
      <div className="av-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="av-sheet-group">
          {title && <div className="av-sheet-title">{title}</div>}
          {actions.map((a) =>
            a.onClick ? (
              <button
                key={a.label}
                className={`av-sheet-action ${a.danger ? 'is-danger' : ''}`}
                onClick={() => {
                  a.onClick();
                  onClose();
                }}
              >
                {a.label}
              </button>
            ) : (
              <a key={a.label} className="av-sheet-action" href={a.href} target={a.newTab ? '_blank' : undefined} rel="noreferrer" onClick={onClose}>
                {a.label}
              </a>
            )
          )}
        </div>
        <button className="av-sheet-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// Snooze pop-up: skip the next visit, or pause visits for 1–4 weeks.
// `save(snoozeUntil)` stores the new date (null = end the snooze).
export function snoozeSheet(account, save, daysField) {
  const actions = [
    { label: 'Skip next visit', onClick: () => save(snoozeUntilFor(account, 'skip', daysField)) },
    { label: 'Snooze 1 week', onClick: () => save(snoozeUntilFor(account, 1, daysField)) },
    { label: 'Snooze 2 weeks', onClick: () => save(snoozeUntilFor(account, 2, daysField)) },
    { label: 'Snooze 3 weeks', onClick: () => save(snoozeUntilFor(account, 3, daysField)) },
    { label: 'Snooze 4 weeks', onClick: () => save(snoozeUntilFor(account, 4, daysField)) },
  ];
  if (isSnoozed(account)) actions.push({ label: 'End snooze', danger: true, onClick: () => save(null) });
  return { title: `Snooze visits to ${account.name || 'this account'}`, actions };
}

function niceShort(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Customers: "Del: Mon, Wed" tag (green) next to the visit tag (blue)
function DeliveryChip({ account, config }) {
  if (!config.deliveryDaysField) return null;
  const days = DAYS.filter((d) => (account[config.deliveryDaysField] || []).includes(d));
  if (!days.length) return null;
  return <span className="av-chip av-chip-delivery">Del: {days.join(', ')}</span>;
}

// "Snoozed · back Nov 24" (the first visit after the snooze ends)
export function SnoozeChip({ account, daysField }) {
  if (!isSnoozed(account)) return null;
  const back = nextVisitDate(account, account.snoozeUntil, false, daysField);
  return (
    <span className="av-chip av-chip-snooze">
      Snoozed · {back ? `back ${niceShort(back)}` : `until ${niceShort(account.snoozeUntil)}`}
    </span>
  );
}

function hasVisitDays(account, config) {
  return (account[config.visitDaysField] || []).length > 0;
}

// Address pieces. Accounts store street / town / state / zip, plus `address`
// (all of them joined) so maps, search, and everything else keep working.
export function joinAddress({ street = '', town = '', state = '', zip = '' }) {
  const stateZip = [state.trim(), zip.trim()].filter(Boolean).join(' ');
  return [street.trim(), town.trim(), stateZip].filter(Boolean).join(', ');
}

// Best guess at the pieces of an older one-line address,
// e.g. "12 Main St, Worcester, MA 01601" → street / town / state / zip.
export function splitAddress(address) {
  const out = { street: '', town: '', state: '', zip: '' };
  const parts = (address || '').split(',').map((x) => x.trim()).filter(Boolean);
  while (parts.length > 1 && /^(usa|us|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return out;
  const end = parts.length > 1 ? parts[parts.length - 1].match(/^([A-Za-z]{2})?\s*(\d{5}(?:-\d{4})?)?$/) : null;
  if (end && (end[1] || end[2])) {
    out.state = (end[1] || '').toUpperCase();
    out.zip = end[2] || '';
    parts.pop();
  }
  if (parts.length > 1) {
    let town = parts.pop();
    // "Worcester MA 01601" written without a comma before the state
    const inline = town.match(/^(.*?)\s+([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (inline && !out.state) {
      town = inline[1];
      out.state = inline[2].toUpperCase();
      out.zip = out.zip || inline[3] || '';
    }
    out.town = town;
  }
  out.street = parts.join(', ');
  return out;
}

export function mapActions(address) {
  const q = encodeURIComponent(address);
  return [
    { label: 'Apple Maps', href: `https://maps.apple.com/?q=${q}`, newTab: true },
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${q}`, newTab: true },
  ];
}

// A contact can have two numbers: `phone` for calls (e.g. the restaurant line)
// and `textPhone` for texts (a cell). If textPhone is blank, texts go to phone.
function textNumber(c) {
  return (c.textPhone && c.textPhone.trim()) || c.phone || '';
}

function canReach(c) {
  return Boolean(c && (c.phone || c.textPhone || c.email));
}

// Call / Text / Email choices for one contact. `withName` labels them by name
// (used when several contacts are listed together).
function contactActions(c, withName = false) {
  const who = withName ? ` ${c.name || 'contact'}` : '';
  const actions = [];
  if (c.phone) actions.push({ label: `Call${who || ' ' + formatPhone(c.phone)}`, href: `tel:${digitsOnly(c.phone)}` });
  const t = textNumber(c);
  if (t) actions.push({ label: `Text${who || ' ' + formatPhone(t)}`, href: `sms:${digitsOnly(t)}` });
  if (c.email) actions.push({ label: `Email${who || ' ' + c.email}`, href: `mailto:${c.email}` });
  return actions;
}

// The Contact pop-up for an account: one contact shows its choices directly;
// several contacts are all listed by name. Returns null if nobody is reachable.
export function contactSheet(contacts) {
  const reachable = (contacts || []).filter(canReach);
  if (reachable.length === 0) return null;
  if (reachable.length === 1) {
    const c = reachable[0];
    return { title: c.name || 'Contact', actions: contactActions(c) };
  }
  return { title: 'Contact', actions: reachable.flatMap((c) => contactActions(c, true)) };
}

const HOLD_MS = 500;      // hold a row this long to open the full screen (double-tap = Edit)
const HOLD_WIGGLE = 10;   // px a finger can move and still count as holding

// One prospect in the list. Tap: open/close the quick card in place.
// Hold: open the full screen.
const DOUBLE_TAP_MS = 320; // two taps this close together = double-tap

function SwipeIf({ onDelete, children }) {
  return onDelete ? (
    <SwipeRow className="av-swipe-row" onDelete={onDelete}>
      {children}
    </SwipeRow>
  ) : (
    children
  );
}

function ListRow({ account: a, config, expanded, onToggle, onOpenFull, onEdit, onSheet, onSnooze, onDelete, onStage, onVisit }) {
  const pickVisit = onVisit ? () => onVisit(a) : undefined;
  const pickStage = onStage ? () => onSheet(stageSheet(a, (key) => onStage(a.id, key))) : undefined;
  const navigate = useNavigate();
  const hold = React.useRef(null);
  const lastTap = React.useRef(0);
  const visit = visitSummary(a, config);
  const latest = lastNote(a);
  const contacts = a.contacts || [];
  const mainContact = contacts.find((c) => c.name || c.title);
  const reachable = contacts.some(canReach);

  const startHold = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY, fired: false, el };
    start.timer = setTimeout(() => {
      // Held long enough: highlight now, open the full screen when the finger lifts.
      start.fired = true;
      el.classList.add('is-held');
    }, HOLD_MS);
    hold.current = start;
  };
  const moveHold = (e) => {
    const h = hold.current;
    if (h && (Math.abs(e.clientX - h.x) > HOLD_WIGGLE || Math.abs(e.clientY - h.y) > HOLD_WIGGLE)) {
      clearTimeout(h.timer);
      h.el.classList.remove('is-held');
      hold.current = null;
    }
  };
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
  };
  const tap = () => {
    const h = hold.current;
    hold.current = null;
    if (h && h.fired) {
      h.el.classList.remove('is-held');
      onOpenFull();
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      // Double-tap: straight to Edit
      lastTap.current = 0;
      onEdit();
      return;
    }
    lastTap.current = now;
    onToggle();
  };

  return (
    <div className={`av-item ${expanded ? 'is-open' : ''}`}>
      {/* Prospects: swipe left to delete (asks first). Customers: no swipe. */}
      <SwipeIf onDelete={onDelete}>
      <button
        className="av-row av-list-row"
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={endHold}
        onPointerCancel={() => {
          endHold();
          if (hold.current) hold.current.el.classList.remove('is-held');
          hold.current = null;
        }}
        onClick={tap}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Avatar name={a.name} size={expanded ? 48 : 40} />
        <span className="av-row-text">
          <span className={`av-row-name ${expanded ? 'is-big' : ''}`}>{displayName(a)}</span>
          {expanded ? (
            <span className="av-row-sub">
              {mainContact ? [mainContact.name, mainContact.title].filter(Boolean).join(' · ') : 'No contact yet'}
            </span>
          ) : (
            (a.address || (config.hasAccountNumber && a.accountNumber)) && (
              <span className="av-row-sub">
                {[config.hasAccountNumber && a.accountNumber ? `#${a.accountNumber}` : null, a.address]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )
          )}
          {!expanded && (
            <span className="av-chips">
              {a.inactive && <span className="av-chip av-chip-inactive">{inactiveLabel(a)}</span>}
              {a.inactive && a.inactive.revisit && <span className="av-chip av-chip-revisit">Revisit {revisitText({ revisit: a.inactive.revisit })}</span>}
              {groupOf(a) && <span className="av-chip av-chip-group">Group</span>}
              {!a.inactive && <VisitChips account={a} config={config} onPick={pickVisit} />}
              <DeliveryChip account={a} config={config} />
              {config.hasStage && <StageChip stage={a.stage} onPick={pickStage} />}
              <SnoozeChip account={a} daysField={config.visitDaysField} />
            </span>
          )}
        </span>
        <FaChevronRight className={`av-row-chevron ${expanded ? 'is-open' : ''}`} />
      </button>
      </SwipeIf>

      {expanded && (
        <div className="av-expand">
          <BackgroundBox notes={backgroundNotes(a)} onClick={() => navigate(config.notesPath(a.id))} />
          {latest && (
            <button className="av-last-note" onClick={() => navigate(config.notesPath(a.id))}>
              <span className="av-last-note-date">{shortDate(latest.timestamp)}</span>
              {latest.text}
            </button>
          )}
          <div className="av-chips av-summary-chips">
            {groupOf(a) && <span className="av-chip av-chip-group">Group</span>}
            <VisitChips account={a} config={config} onPick={pickVisit} />
            <DeliveryChip account={a} config={config} />
              {config.hasStage && <StageChip stage={a.stage} onPick={pickStage} />}
            <SnoozeChip account={a} daysField={config.visitDaysField} />
          </div>
          <div className="av-quick">
            <button className="av-quick-btn" disabled={!reachable} onClick={() => onSheet(contactSheet(contacts))}>
              Contact
            </button>
            <button
              className="av-quick-btn"
              disabled={!a.address}
              onClick={() => onSheet({ title: a.address, actions: mapActions(a.address) })}
            >
              Map
            </button>
            {onSnooze && hasVisitDays(a, config) && (
              <button className="av-quick-btn" onClick={() => onSheet(snoozeSheet(a, (until) => onSnooze(a.id, until), config.visitDaysField))}>
                {isSnoozed(a) ? 'Snoozed' : 'Snooze'}
              </button>
            )}
            <button className="av-quick-btn" onClick={() => navigate(config.notesPath(a.id))}>
              + Note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ onBack, title, right }) {
  return (
    <header className="av-header">
      <button className="av-icon-btn" onClick={onBack} aria-label="Back">
        <FaArrowLeft />
      </button>
      <div className="av-header-title">{title}</div>
      <div className="av-header-right">{right}</div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */
export function AccountList({ config, accounts, setAccounts }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('az'); // az | za | town | group
  const [openId, setOpenId] = useState(null); // the one row that's opened up
  const [stageFilter, setStageFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false); // the Inactive drop-down at the bottom
  const [sheet, setSheet] = useState(null);   // Call/Text or Maps pop-up
  const [listMsg, setListMsg] = useState('');
  const [visitFor, setVisitFor] = useState(null); // account whose visits are being changed (quick panel)

  const q = search.trim().toLowerCase();
  const realAccounts = accounts.filter((a) => !isEmptyRecord(a)); // hide leftover blank records
  const activeAccounts = realAccounts.filter((a) => !a.inactive);
  const inactiveCount = realAccounts.length - activeAccounts.length;
  const matches = (a) =>
    !q ||
    (a.name || '').toLowerCase().includes(q) ||
    (a.address || '').toLowerCase().includes(q) ||
    groupOf(a).toLowerCase().includes(q) ||
    (config.hasAccountNumber && String(a.accountNumber || '').toLowerCase().includes(q));
  const inactiveShown = realAccounts.filter((a) => a.inactive && matches(a)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const shown = activeAccounts
    .filter((a) => stageFilter === 'all' || (stageFilter === 'groups' ? Boolean(groupOf(a)) : (a.stage || 'none') === stageFilter))
    .filter((a) => {
      if (!q) return true;
      return (
        (a.name || '').toLowerCase().includes(q) ||
        (a.address || '').toLowerCase().includes(q) ||
        groupOf(a).toLowerCase().includes(q) ||
        (config.hasAccountNumber && String(a.accountNumber || '').toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const an = (a.name || '').trim();
      const bn = (b.name || '').trim();
      if (!an && bn) return 1; // unnamed ones go last
      if (an && !bn) return -1;
      return sortBy === 'za' ? bn.localeCompare(an) : an.localeCompare(bn);
    });

  // Sections: by town, by group (and always by group for the "Groups" choice), or one plain list.
  const groupTitle = (g) => {
    const members = activeAccounts.filter((a) => groupOf(a) === g);
    return members.length ? `${members[0].name} · ${members.length} location${members.length === 1 ? '' : 's'}` : 'Group';
  };
  const sectionMode = stageFilter === 'groups' ? 'group' : sortBy === 'town' || sortBy === 'group' ? sortBy : null;
  const sections = (() => {
    if (!sectionMode) return [{ key: 'all', title: '', items: shown }];
    const map = new Map();
    shown.forEach((a) => {
      const k = sectionMode === 'town' ? (a.town || '').trim() || '~' : groupOf(a) || '~';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(a);
    });
    const keys = [...map.keys()].sort((x, y) => {
      if (x === '~') return 1;
      if (y === '~') return -1;
      return sectionMode === 'town' ? x.localeCompare(y) : groupTitle(x).localeCompare(groupTitle(y));
    });
    return keys.map((k) => ({
      key: k,
      title: k === '~' ? (sectionMode === 'town' ? 'No town' : 'Single location') : sectionMode === 'town' ? k : groupTitle(k),
      items: map.get(k),
    }));
  })();

  const renderRow = (a) => (
          <ListRow
            key={a.id}
            account={a}
            config={config}
            expanded={openId === a.id}
            onToggle={() => setOpenId((cur) => (cur === a.id ? null : a.id))}
            onOpenFull={() => navigate(`${config.basePath}/${a.id}`)}
            onEdit={() => navigate(`${config.basePath}/${a.id}/edit`)}
            onSnooze={
              setAccounts
                ? (id, until) =>
                    setAccounts((prev) => prev.map((x) => (x.id === id ? { ...x, snoozeUntil: until } : x)))
                : null
            }
            onSheet={(info) => info && setSheet(info)}
            onVisit={setAccounts ? (acct) => setVisitFor(acct) : null}
            onStage={
              config.hasStage && setAccounts
                ? (id, key) => setAccounts((prev) => prev.map((x) => (x.id === id ? { ...x, stage: key } : x)))
                : null
            }
            onDelete={
              config.swipeToDelete && setAccounts
                ? () => {
                    if (!window.confirm(deleteWarning(a, config))) return;
                    if (openId === a.id) setOpenId(null);
                    deleteAccountExtras(typeOf(config), a.id);
                    setAccounts((prev) => prev.filter((x) => x.id !== a.id));
                  }
                : null
            }
          />
  );

  return (
    <div className="av-page">
      <Header onBack={() => navigate('/')} title="" />

      <div className="av-content">
        <div className="av-title-row">
          <h1 className="av-big-title">{config.plural}</h1>
          <button
            className="av-pill"
            disabled={!shown.length}
            onClick={async () => {
              const st = stageInfo(stageFilter);
              const heading = [
                st
                  ? `${st.label} ${config.plural.toLowerCase()}`
                  : stageFilter === 'groups'
                  ? `${config.plural} with more than one location`
                  : stageFilter === 'none'
                  ? `${config.plural} with no stage`
                  : `All ${config.plural.toLowerCase()}`,
                q ? `matching "${search.trim()}"` : '',
              ]
                .filter(Boolean)
                .join(' ');
              const blob = accountsXlsx(sections.flatMap((sec) => sec.items), config, heading);
              const day = todayKey();
              setListMsg(await shareFile(blob, `Crumb ${config.plural.toLowerCase()} ${day}.xlsx`, `Crumb ${config.plural.toLowerCase()}`));
            }}
          >
            <IoShareOutline className="av-pill-icon" />
            Share
          </button>
        </div>
        {listMsg && <div className="av-share-msg av-share-msg-list">{listMsg}</div>}
        <input
          className="av-search"
          placeholder={config.hasAccountNumber ? 'Search name, address, or account #' : 'Search name or address'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="av-list-bar">
          {config.hasStage ? (
            <select
              className="av-stage-select"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              style={stageInfo(stageFilter) ? { color: stageInfo(stageFilter).color } : undefined}
            >
              <option value="all">All {config.plural.toLowerCase()} ({activeAccounts.length})</option>
              {STAGES.map((st) => (
                <option key={st.key} value={st.key}>
                  {st.label} ({activeAccounts.filter((a) => a.stage === st.key).length})
                </option>
              ))}
              <option value="groups">Groups ({activeAccounts.filter((a) => groupOf(a)).length})</option>
            </select>
          ) : (
            <span className="av-count">
              {shown.length} {shown.length === 1 ? config.singular.toLowerCase() : config.plural.toLowerCase()}
            </span>
          )}
          <select className="av-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort">
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
            <option value="town">By town</option>
            <option value="group">By group</option>
          </select>
        </div>

        {realAccounts.length === 0 ? (
          <div className="av-empty">No {config.plural.toLowerCase()} yet. Tap + to add one.</div>
        ) : shown.length === 0 ? (
          <div className="av-empty">No matches.</div>
        ) : (
          sections.map((sec) => (
            <React.Fragment key={sec.key}>
              {sec.title && <div className="av-section-title av-list-section">{sec.title}</div>}
              <div className="av-group">{sec.items.map(renderRow)}</div>
            </React.Fragment>
          ))
        )}
        {shown.length > 0 && (
          <div className="av-hint">
            Tap to open · Double-tap to edit · Hold for full details{config.swipeToDelete ? ' · Swipe left to delete' : ''}
          </div>
        )}

        {/* Inactive (closed, dead lead…): their own drop-down at the bottom */}
        {inactiveCount > 0 && (
          <>
            <button className="av-inactive-toggle" onClick={() => setShowInactive((v) => !v)}>
              <span>Inactive ({q ? `${inactiveShown.length} of ${inactiveCount}` : inactiveCount})</span>
              <FaChevronRight className={`av-inactive-chev ${showInactive ? 'is-open' : ''}`} />
            </button>
            {showInactive &&
              (inactiveShown.length ? (
                <div className="av-group av-inactive-list">{inactiveShown.map(renderRow)}</div>
              ) : (
                <div className="av-empty">No inactive matches.</div>
              ))}
          </>
        )}
      </div>

      <button className="av-fab" onClick={() => navigate(`${config.basePath}/new`)} aria-label={`Add ${config.singular}`}>
        +
      </button>

      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}
      {visitFor && (
        <VisitSheet
          account={visitFor}
          config={config}
          onCancel={() => setVisitFor(null)}
          onSave={(fields) => {
            setAccounts((prev) => prev.map((x) => (x.id === visitFor.id ? { ...x, ...fields } : x)));
            setVisitFor(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */
export function AccountDetail({ config, accounts, setAccounts, onConvert }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { id } = useParams();
  const [sheet, setSheet] = useState(null); // { title, actions }
  const [converting, setConverting] = useState(false);
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [visitOpen, setVisitOpen] = useState(false); // quick visit panel
  const [askInactive, setAskInactive] = useState(false); // "Mark inactive" reason picker
  const [revisitOpen, setRevisitOpen] = useState(false); // revisit date panel (inactive accounts)
  const [shareMsg, setShareMsg] = useState('');
  const account = accounts.find((a) => String(a.id) === id);

  if (!account) {
    return (
      <div className="av-page">
        <Header onBack={() => goBack(config.basePath)} title={config.singular} />
        <div className="av-empty">{config.singular} not found.</div>
      </div>
    );
  }

  const contacts = account.contacts || [];
  const days = account[config.visitDaysField] || [];
  const noteCount = (account.notes || []).length;
  const latest = lastNote(account);
  const visit = visitSummary(account, config);
  const mainContact = contacts.find((c) => c.name || c.title);
  const reachableContacts = contacts.filter(canReach);

  const openCallText = () => {
    const sheetInfo = contactSheet(contacts);
    if (sheetInfo) setSheet(sheetInfo);
  };

  return (
    <div className="av-page">
      <Header
        onBack={() => goBack(config.basePath)}
        title=""
        right={
          <span className="av-header-actions">
            <button
              className="av-icon-btn av-share-btn"
              aria-label={`Share ${config.singular.toLowerCase()}`}
              onClick={() =>
                setSheet({
                  title: `Share ${displayName(account)}`,
                  actions: [
                    {
                      label: 'Send info as text',
                      onClick: async () => setShareMsg(await shareText(displayName(account), accountShareText(account, config))),
                    },
                    {
                      label: 'Send contact card',
                      onClick: async () =>
                        setShareMsg(await shareFile(contactCards(cardReady(account)), `${safeFileName(displayName(account))}.vcf`, displayName(account))),
                    },
                  ],
                })
              }
            >
              <IoShareOutline />
            </button>
            <button className="av-link-btn" onClick={() => navigate(`${config.basePath}/${account.id}/edit`)}>
              Edit
            </button>
          </span>
        }
      />
      {shareMsg && <div className="av-share-msg">{shareMsg}</div>}

      <div className="av-content">
        {account.inactive && (
          <div className="av-inactive-banner">
            <strong>Inactive · {inactiveLabel(account)}</strong>
            <span>
              Since{' '}
              {account.inactive.since
                ? new Date(account.inactive.since + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'}
              . Not on your Itinerary, Calendar, Call Sheet or reminders
              {account.inactive.revisit ? ', except its revisit day' : ''}.
            </span>
            {setAccounts && (
              <button className="av-revisit-btn" onClick={() => setRevisitOpen(true)}>
                {account.inactive.revisit ? `Revisit: ${revisitText(account.inactive)} ›` : 'Set a revisit date ›'}
              </button>
            )}
          </div>
        )}
        {/* Summary card: who, last note, visit schedule, quick buttons */}
        <div className="av-group av-summary">
          <div className="av-summary-top">
            <Avatar name={account.name} size={48} />
            <div className="av-summary-text">
              <div className={`av-summary-name ${account.name && account.name.trim() ? '' : 'is-blank'}`}>
                {displayName(account)}
              </div>
              <div className="av-summary-sub">
                {mainContact
                  ? [mainContact.name, mainContact.title].filter(Boolean).join(' · ')
                  : 'No contact yet'}
                {config.hasAccountNumber && account.accountNumber ? ` · #${account.accountNumber}` : ''}
              </div>
            </div>
            <span className="av-badge">{config.singular}</span>
          </div>

          <BackgroundBox notes={backgroundNotes(account)} onClick={() => navigate(config.notesPath(account.id))} />
          {latest && (
            <button className="av-last-note" onClick={() => navigate(config.notesPath(account.id))}>
              <span className="av-last-note-date">{shortDate(latest.timestamp)}</span>
              {latest.text}
            </button>
          )}

          <div className="av-chips av-summary-chips">
            {groupOf(account) && <span className="av-chip av-chip-group">Group</span>}
            <VisitChips account={account} config={config} onPick={setAccounts ? () => setVisitOpen(true) : undefined} />
            <DeliveryChip account={account} config={config} />
            {config.hasStage && (
              <StageChip
                stage={account.stage}
                onPick={
                  setAccounts
                    ? () =>
                        setSheet(
                          stageSheet(account, (key) =>
                            setAccounts((prev) => prev.map((x) => (x.id === account.id ? { ...x, stage: key } : x)))
                          )
                        )
                    : undefined
                }
              />
            )}
            <SnoozeChip account={account} daysField={config.visitDaysField} />
          </div>

          <div className="av-quick">
            <button className="av-quick-btn" disabled={reachableContacts.length === 0} onClick={openCallText}>
              Contact
            </button>
            <button
              className="av-quick-btn"
              disabled={!account.address}
              onClick={() => setSheet({ title: account.address, actions: mapActions(account.address) })}
            >
              Map
            </button>
            {setAccounts && hasVisitDays(account, config) && (
              <button
                className="av-quick-btn"
                onClick={() =>
                  setSheet(
                    snoozeSheet(
                      account,
                      (until) =>
                        setAccounts((prev) => prev.map((x) => (x.id === account.id ? { ...x, snoozeUntil: until } : x))),
                      config.visitDaysField
                    )
                  )
                }
              >
                {isSnoozed(account) ? 'Snoozed' : 'Snooze'}
              </button>
            )}
            <button className="av-quick-btn" onClick={() => navigate(config.notesPath(account.id))}>
              + Note
            </button>
          </div>
        </div>

        {(account.address || account.website) && (
          <div className="av-group">
            {account.address && (
              <button className="av-row" onClick={() => setSheet({ title: account.address, actions: mapActions(account.address) })}>
                <FaMapMarkerAlt className="av-row-icon" />
                <span className="av-row-text">
                  <span className="av-row-label">Address</span>
                  <span className="av-row-value av-blue">{account.address}</span>
                </span>
              </button>
            )}
            {account.website && (
              <a className="av-row" href={websiteUrl(account.website)} target="_blank" rel="noreferrer">
                <FaGlobe className="av-row-icon" />
                <span className="av-row-text">
                  <span className="av-row-label">Website</span>
                  <span className="av-row-value av-blue">{websiteLabel(account.website)}</span>
                </span>
              </a>
            )}
          </div>
        )}

        {groupOf(account) && (() => {
          const others = groupMembers(groupOf(account), typeOf(config), accounts).filter(
            (x) => !(x.type === typeOf(config) && String(x.account.id) === String(account.id))
          );
          return (
            <>
              <div className="av-section-title">
                Group · {others.length + 1} location{others.length === 0 ? '' : 's'}
              </div>
              <div className="av-group">
                {others.length === 0 ? (
                  <div className="av-row av-static-row av-muted-row">No other locations yet. Tap Edit → Add 2nd location.</div>
                ) : (
                  others.map((x) => (
                    <button
                      key={`${x.type}-${x.account.id}`}
                      className="av-row"
                      onClick={() => navigate(`${x.type === 'prospect' ? '/prospects' : '/customers'}/${x.account.id}`)}
                    >
                      <span className="av-row-text">
                        <span className="av-row-value">{displayName(x.account)}</span>
                        <span className="av-row-sub">
                          {[x.account.town, x.type === 'prospect' ? 'Prospect' : 'Customer'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <FaChevronRight className="av-row-chevron" />
                    </button>
                  ))
                )}
              </div>
            </>
          );
        })()}

        <div className="av-section-title">Contacts</div>
        {contacts.length === 0 ? (
          <div className="av-group av-muted-row">No contacts yet.</div>
        ) : (
          contacts.map((c, i) => (
            <div key={i} className="av-group av-contact">
              <div className="av-contact-head">
                <span className="av-contact-name">{c.name || '(No name)'}</span>
                {c.title && <span className="av-contact-title">{c.title}</span>}
              </div>
              {c.phone && (
                <button className="av-row" onClick={() => setSheet({ title: c.name || c.phone, actions: contactActions(c) })}>
                  <FaPhoneAlt className="av-row-icon" />
                  <span className="av-row-text">
                    {c.textPhone && c.textPhone !== c.phone && <span className="av-row-label">Phone</span>}
                    <span className="av-row-value av-blue">{formatPhone(c.phone)}</span>
                  </span>
                </button>
              )}
              {c.textPhone && c.textPhone !== c.phone && (
                <button className="av-row" onClick={() => setSheet({ title: c.name || c.textPhone, actions: contactActions(c) })}>
                  <FaPhoneAlt className="av-row-icon" />
                  <span className="av-row-text">
                    <span className="av-row-label">Cell (texts)</span>
                    <span className="av-row-value av-blue">{formatPhone(c.textPhone)}</span>
                  </span>
                </button>
              )}
              {c.email && (
                <a className="av-row" href={`mailto:${c.email}`}>
                  <FaEnvelope className="av-row-icon" />
                  <span className="av-row-value av-blue">{c.email}</span>
                </a>
              )}
            </div>
          ))
        )}

        {config.deliveryDaysField && (
          <>
            <div className="av-section-title">Delivery days</div>
            <div className="av-days">
              {DAYS.map((d) => (
                <span key={d} className={`av-day is-delivery ${(account[config.deliveryDaysField] || []).includes(d) ? 'is-on' : ''}`}>
                  {d}
                </span>
              ))}
            </div>
          </>
        )}

        {config.hasCallNote &&
          (account.callNote || typeof account.callTime === 'number' || account.callTime === 'na' || account.onlineOrdering) && (
          <>
            <div className="av-section-title">Call sheet</div>
            <div className="av-group">
              {(typeof account.callTime === 'number' || account.callTime === 'na') && (
                <div className="av-row av-static-row">
                  <span className="av-row-label-inline">Call at</span>
                  <span className="av-row-value">
                    {account.callTime === 'na' ? 'N/A (no call needed)' : timeLabel(account.callTime)}
                  </span>
                </div>
              )}
              <div className="av-row av-static-row">
                <span className="av-row-label-inline">Online ordering</span>
                <span className="av-row-value">{account.onlineOrdering ? 'Yes' : 'No'}</span>
              </div>
              {account.callNote && <div className="av-call-note">{account.callNote}</div>}
            </div>
          </>
        )}

        <div className="av-section-title">Visit schedule</div>
        <div className="av-days">
          {DAYS.map((d) => (
            <span key={d} className={`av-day ${days.includes(d) ? 'is-on' : ''}`}>{d}</span>
          ))}
        </div>
        {days.length > 0 && (
          <div className="av-group">
            <div className="av-row av-static-row">
              <span className="av-row-label-inline">Usual time</span>
              <span className="av-row-value">
                {typeof account.visitTime === 'number' ? timeLabel(account.visitTime) : 'Not set'}
                {typeof account.visitTime === 'number' && account.fixedTime ? ' · 🔒 always' : ''}
              </span>
            </div>
            <div className="av-row av-static-row">
              <span className="av-row-label-inline">How often</span>
              <span className="av-row-value">{frequencyLabel(account.visitFrequency)}</span>
            </div>
            <div className="av-row av-static-row">
              <span className="av-row-label-inline">Visit length</span>
              <span className="av-row-value">
                {lengthLabel(typeof account.visitLength === 'number' ? account.visitLength : DEFAULT_VISIT_LENGTH)}
              </span>
            </div>
            {account.visitFrequency && account.visitFrequency !== 'weekly' && account.visitStart && (
              <div className="av-row av-static-row">
                <span className="av-row-label-inline">Starting</span>
                <span className="av-row-value">
                  {new Date(account.visitStart + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="av-group">
          <button className="av-row" onClick={() => navigate(config.notesPath(account.id))}>
            <span className="av-row-text">
              <span className="av-row-value">Notes</span>
            </span>
            <span className="av-row-count">{noteCount}</span>
            <FaChevronRight className="av-row-chevron" />
          </button>
        </div>

        <AccountPhotos type={typeOf(config)} id={account.id} name={displayName(account)} />

        {setAccounts &&
          (account.inactive ? (
            <button
              className="av-reactivate"
              onClick={() =>
                setAccounts((prev) => prev.map((x) => (x.id === account.id ? { ...x, inactive: null } : x)))
              }
            >
              Activate
            </button>
          ) : (
            <button className="av-inactive-btn" onClick={() => setAskInactive(true)}>
              Make Inactive
            </button>
          ))}

        {onConvert && (
          <button className="av-convert" onClick={() => setConverting(true)}>
            Convert to customer
          </button>
        )}

        <button
          className="av-delete"
          onClick={() => {
            if (!window.confirm(deleteWarning(account, config))) return;
            deleteAccountExtras(typeOf(config), account.id);
            setAccounts((prev) => prev.filter((a) => a.id !== account.id));
            navigate(config.basePath, { replace: true });
          }}
        >
          Delete {config.singular}
        </button>
      </div>

      {revisitOpen && account && account.inactive && (
        <RevisitSheet
          account={account}
          onCancel={() => setRevisitOpen(false)}
          onSave={(fields) => {
            setAccounts((prev) => prev.map((x) => (x.id === account.id ? { ...x, inactive: { ...x.inactive, ...fields } } : x)));
            setRevisitOpen(false);
          }}
        />
      )}

      {askInactive && (
        <AskSheet
          title={`Why is ${displayName(account)} Inactive?`}
          message="It keeps all its notes, but comes off your lists, Itinerary, Calendar, Call Sheet and reminders. You can activate it again any time."
          choices={INACTIVE_REASONS.map(([value, label]) => ({ value, label }))}
          onPick={(reason) => {
            setAccounts((prev) => prev.map((x) => (x.id === account.id ? { ...x, inactive: { reason, since: todayKey() } } : x)));
            setAskInactive(false);
          }}
          onCancel={() => setAskInactive(false)}
        />
      )}

      {visitOpen && account && (
        <VisitSheet
          account={account}
          config={config}
          onCancel={() => setVisitOpen(false)}
          onSave={(fields) => {
            setAccounts((prev) => prev.map((x) => (x.id === account.id ? { ...x, ...fields } : x)));
            setVisitOpen(false);
          }}
        />
      )}
      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}

      {converting && (
        <div className="av-sheet-backdrop" onClick={() => setConverting(false)}>
          <div className="av-convert-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="av-convert-title">Convert {displayName(account)} to a customer</div>
            <div className="av-convert-sub">
              Notes, contacts, address, and visit schedule move over. It leaves your Prospects list.
            </div>
            <input
              className="av-convert-input"
              placeholder="Customer account number"
              inputMode="numeric"
              value={newAccountNumber}
              onChange={(e) => setNewAccountNumber(e.target.value)}
              autoFocus
            />
            <div className="av-convert-actions">
              <button className="av-convert-cancel" onClick={() => setConverting(false)}>
                Cancel
              </button>
              <button
                className="av-convert-go"
                disabled={!newAccountNumber.trim()}
                onClick={() => {
                  const path = onConvert(account, newAccountNumber.trim());
                  setConverting(false);
                  if (path) navigate(path, { replace: true });
                }}
              >
                Convert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add / Edit                                                          */
/* ------------------------------------------------------------------ */
const BLANK_CONTACT = { title: '', name: '', phone: '', textPhone: '', email: '' };

export function AccountEdit({ config, accounts, setAccounts, isNew = false, onConvert = null }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { id } = useParams();
  const existing = isNew ? null : accounts.find((a) => String(a.id) === id);
  const [converting, setConverting] = useState(false);
  const [newAccountNumber, setNewAccountNumber] = useState('');

  const [name, setName] = useState(existing ? existing.name || '' : '');
  // Address pieces: use the saved ones, or split an older one-line address
  const startAddr =
    existing && (existing.street || existing.town || existing.state || existing.zip)
      ? { street: existing.street || '', town: existing.town || '', state: existing.state || '', zip: existing.zip || '' }
      : splitAddress(existing ? existing.address : '');
  const [street, setStreet] = useState(startAddr.street);
  const [town, setTown] = useState(startAddr.town);
  const [addrState, setAddrState] = useState(startAddr.state);
  const [zip, setZip] = useState(startAddr.zip);
  const [website, setWebsite] = useState((existing && existing.website) || '');
  const [group, setGroup] = useState(existing ? groupOf(existing) : '');
  // Add another location: creates its own account right away, linked by the (hidden) group id.
  const [newLoc, setNewLoc] = useState(null); // { street, town, state, zip } while the form is open
  const [locMsg, setLocMsg] = useState('');
  const otherLocations = existing
    ? groupMembers(group, typeOf(config), accounts).filter((x) => !(x.type === typeOf(config) && String(x.account.id) === String(existing.id)))
    : [];
  // Hold a location to jump to its full screen (e.g. to add a note there).
  const locHold = React.useRef(null);
  const locHoldStart = (x, e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const h = { x: e.clientX, y: e.clientY };
    h.timer = setTimeout(() => {
      locHold.current = null;
      if (navigator.vibrate) navigator.vibrate(10);
      navigate(`${x.type === 'prospect' ? '/prospects' : '/customers'}/${x.account.id}`);
    }, 500);
    locHold.current = h;
  };
  const locHoldMove = (e) => {
    const h = locHold.current;
    if (h && (Math.abs(e.clientX - h.x) > 10 || Math.abs(e.clientY - h.y) > 10)) {
      clearTimeout(h.timer);
      locHold.current = null;
    }
  };
  const locHoldEnd = () => {
    if (locHold.current) clearTimeout(locHold.current.timer);
    locHold.current = null;
  };
  const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  const addLocation = () => {
    if (!newLoc || !(newLoc.street.trim() || newLoc.town.trim())) return;
    const carried = filledContacts
      .filter((c, i) => isOwner(c) || (newLoc.copy || []).includes(i))
      .map((c) => ({ ...c, title: c.title.trim(), name: c.name.trim(), phone: c.phone.trim(), textPhone: c.textPhone.trim(), email: c.email.trim() }));
    const g = group || `${(name || existing.name || 'Group').trim()} · ${Date.now().toString(36)}`;
    const loc = {
      id: Date.now(),
      name: (name || existing.name || '').trim(),
      street: newLoc.street.trim(),
      town: newLoc.town.trim(),
      state: newLoc.state.trim().toUpperCase(),
      zip: newLoc.zip.trim(),
      address: joinAddress({ street: newLoc.street, town: newLoc.town, state: newLoc.state.toUpperCase(), zip: newLoc.zip }),
      group: g,
      contacts: carried,
      notes: [],
      [config.visitDaysField]: [],
      visitFrequency: 'weekly',
    };
    if (config.hasStage) loc.stage = stage || null;
    setAccounts((prev) => [...prev.map((a) => (a.id === existing.id ? { ...a, group: g } : a)), loc]);
    setGroup(g);
    setNewLoc(null);
    setLocMsg(`Added: ${loc.name}${loc.town ? ` – ${loc.town}` : ''}`);
  };
  const [accountNumber, setAccountNumber] = useState(existing ? existing.accountNumber || '' : '');
  const [contacts, setContacts] = useState(
    existing && existing.contacts ? existing.contacts.map((c) => ({ ...BLANK_CONTACT, ...c })) : []
  );
  // Contacts on this location: owners always carry over to a new location; anyone else only if checked
  // (for when the same person does the ordering there).
  const filledContacts = contacts.filter((c) => c.title.trim() || c.name.trim() || c.phone.trim() || c.textPhone.trim() || c.email.trim());
  const isOwner = (c) => /owner/i.test(c.title || '');
  const [days, setDays] = useState(
    existing && existing[config.visitDaysField] ? [...existing[config.visitDaysField]] : []
  );
  const [callNote, setCallNote] = useState((existing && existing.callNote) || '');
  const [callTime, setCallTime] = useState(
    existing && (typeof existing.callTime === 'number' || existing.callTime === 'na') ? existing.callTime : ''
  );
  const [onlineOrdering, setOnlineOrdering] = useState(Boolean(existing && existing.onlineOrdering));
  const [deliveryDays, setDeliveryDays] = useState(
    config.deliveryDaysField && existing && existing[config.deliveryDaysField]
      ? [...existing[config.deliveryDaysField]]
      : []
  );
  const [visitTime, setVisitTime] = useState(
    existing && typeof existing.visitTime === 'number' ? existing.visitTime : ''
  );
  const [visitFrequency, setVisitFrequency] = useState((existing && existing.visitFrequency) || 'weekly');
  const [fixedTime, setFixedTime] = useState(Boolean(existing && existing.fixedTime));
  const [visitLength, setVisitLength] = useState(
    existing && typeof existing.visitLength === 'number' ? existing.visitLength : DEFAULT_VISIT_LENGTH
  );
  const [visitStart, setVisitStart] = useState((existing && existing.visitStart) || todayKey());
  const [stage, setStage] = useState((existing && existing.stage) || '');
  const [showInItinerary, setShowInItinerary] = useState(!(existing && existing.showInItinerary === false));
  const [showOnCalendar, setShowOnCalendar] = useState(!(existing && existing.showOnCalendar === false));

  if (!isNew && !existing) {
    return (
      <div className="av-page">
        <Header onBack={() => goBack(config.basePath)} title={config.singular} />
        <div className="av-empty">{config.singular} not found.</div>
      </div>
    );
  }

  const cancel = () => goBack(isNew ? config.basePath : `${config.basePath}/${id}`);

  const changeContact = (index, field, value) =>
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));

  const toggleDay = (d) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  // Everything on the form, ready to save (also used by Convert, so unsaved edits carry over)
  const buildFields = () => {
    const fields = {
      name: name.trim(),
      street: street.trim(),
      town: town.trim(),
      state: addrState.trim().toUpperCase(),
      zip: zip.trim(),
      address: joinAddress({ street, town, state: addrState.toUpperCase(), zip }),
      group: group.trim(), // locations of the same business share this (hidden) group id
      website: website.trim(),
      // drop contact rows that were left completely empty
      contacts: contacts
        .map((c) => ({
          ...c, // keep anything else already saved on the contact
          title: c.title.trim(),
          name: c.name.trim(),
          phone: c.phone.trim(),
          textPhone: c.textPhone.trim(),
          email: c.email.trim(),
        }))
        .filter((c) => c.title || c.name || c.phone || c.textPhone || c.email),
      [config.visitDaysField]: DAYS.filter((d) => days.includes(d)),
      visitTime: visitTime === '' ? null : Number(visitTime),
      visitFrequency,
      visitStart: visitFrequency === 'weekly' ? null : visitStart,
      fixedTime: visitTime !== '' && fixedTime, // only means something with a usual time
      visitLength: Number(visitLength) || DEFAULT_VISIT_LENGTH,
    };
    if (config.hasStage) fields.stage = stage || null;
    if (config.deliveryDaysField) fields[config.deliveryDaysField] = DAYS.filter((d) => deliveryDays.includes(d));
    if (config.hasCallNote) {
      fields.callNote = callNote.trim();
      fields.callTime = callTime === '' ? null : callTime === 'na' ? 'na' : Number(callTime);
      fields.onlineOrdering = onlineOrdering;
    }
    fields.showInItinerary = showInItinerary;
    fields.showOnCalendar = showOnCalendar;
    if (config.hasAccountNumber) fields.accountNumber = accountNumber.trim();

    return fields;
  };

  const [repeats, setRepeats] = useState(null); // possible repeat accounts found when saving
  const [askInactiveEdit, setAskInactiveEdit] = useState(false); // "Make Inactive" reason picker (Edit screen)
  const save = (skipRepeatCheck = false) => {
    if (!name.trim()) {
      window.alert(`Add a ${config.singular.toLowerCase()} name first.`);
      return;
    }
    // New account, or the name / address changed: check it isn't already in Crumb.
    const changed =
      isNew ||
      simpleName(name) !== simpleName(existing.name) ||
      simpleStreet(street) !== simpleStreet(existing.street) ||
      simpleName(town) !== simpleName(existing.town);
    if (!skipRepeatCheck && changed) {
      const found = findRepeats({ name, street, town, group }, isNew ? null : { type: typeOf(config), id: existing.id });
      if (found.length) {
        setRepeats(found);
        return;
      }
    }
    const fields = buildFields();
    if (isNew) {
      const created = { id: Date.now(), ...fields, notes: [] };
      setAccounts((prev) => [...prev, created]);
      navigate(`${config.basePath}/${created.id}`, { replace: true });
    } else {
      // keep everything else on the record (notes, etc.)
      setAccounts((prev) => prev.map((a) => (a.id === existing.id ? { ...a, ...fields } : a)));
      goBack(`${config.basePath}/${id}`);
    }
  };

  const remove = () => {
    if (!window.confirm(deleteWarning(existing, config))) return;
    deleteAccountExtras(typeOf(config), existing.id);
    setAccounts((prev) => prev.filter((a) => a.id !== existing.id));
    goBack(config.basePath, 2); // skip the detail screen of the deleted account
  };

  return (
    <div className="av-page">
      <header className="av-header">
        <button className="av-link-btn" onClick={cancel}>Cancel</button>
        <div className="av-header-title">{isNew ? `New ${config.singular}` : `Edit ${config.singular}`}</div>
        <button className="av-link-btn av-bold" onClick={() => save()}>Save</button>
      </header>

      <div className="av-content">
        <div className="av-group">
          <input
            className="av-input"
            placeholder={`${config.singular} name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={isNew}
          />
          {config.hasAccountNumber && (
            <input
              className="av-input"
              placeholder="Account number"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          )}
          <input
            className="av-input"
            placeholder="Street address"
            autoComplete="street-address"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />
          <div className="av-addr-row">
            <input
              className="av-input av-addr-town"
              placeholder="Town"
              autoComplete="address-level2"
              value={town}
              onChange={(e) => setTown(e.target.value)}
            />
            <input
              className="av-input av-addr-state"
              placeholder="State"
              autoComplete="address-level1"
              autoCapitalize="characters"
              maxLength={2}
              value={addrState}
              onChange={(e) => setAddrState(e.target.value.toUpperCase())}
            />
            <input
              className="av-input av-addr-zip"
              placeholder="ZIP"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={10}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>
          <input
            className="av-input"
            placeholder="Website (optional)"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {!isNew && (
          <>
            <div className="av-section-title">Locations</div>
            <div className="av-group">
              {otherLocations.map((x) => (
                <div
                  key={`${x.type}-${x.account.id}`}
                  className="av-row av-static-row av-loc-row"
                  onPointerDown={(e) => locHoldStart(x, e)}
                  onPointerMove={locHoldMove}
                  onPointerUp={locHoldEnd}
                  onPointerCancel={locHoldEnd}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="av-row-text">
                    <span className="av-row-value">{displayName(x.account)}</span>
                    <span className="av-row-sub">
                      {[x.account.address || x.account.town, x.type === 'prospect' ? 'Prospect' : 'Customer'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </div>
              ))}
              {newLoc ? (
                <div className="av-loc-form">
                  <input
                    className="av-input"
                    placeholder="Street address"
                    autoComplete="street-address"
                    value={newLoc.street}
                    onChange={(e) => setNewLoc({ ...newLoc, street: e.target.value })}
                    autoFocus
                  />
                  <div className="av-addr-row">
                    <input className="av-input av-addr-town" placeholder="Town" value={newLoc.town} onChange={(e) => setNewLoc({ ...newLoc, town: e.target.value })} />
                    <input
                      className="av-input av-addr-state"
                      placeholder="State"
                      autoCapitalize="characters"
                      maxLength={2}
                      value={newLoc.state}
                      onChange={(e) => setNewLoc({ ...newLoc, state: e.target.value.toUpperCase() })}
                    />
                    <input
                      className="av-input av-addr-zip"
                      placeholder="ZIP"
                      inputMode="numeric"
                      maxLength={10}
                      value={newLoc.zip}
                      onChange={(e) => setNewLoc({ ...newLoc, zip: e.target.value })}
                    />
                  </div>
                  {filledContacts.length > 0 && (
                    <div className="av-loc-contacts">
                      {filledContacts.some(isOwner) && (
                        <div className="av-loc-owner">
                          Owner added automatically: {filledContacts.filter(isOwner).map((c) => c.name || c.title).join(', ')}
                        </div>
                      )}
                      {filledContacts.some((c) => !isOwner(c)) && (
                        <>
                          <div className="av-loc-q">Same person orders at this location?</div>
                          {filledContacts.map((c, i) =>
                            isOwner(c) ? null : (
                              <label key={i} className="av-loc-check">
                                <input
                                  type="checkbox"
                                  checked={(newLoc.copy || []).includes(i)}
                                  onChange={(e) =>
                                    setNewLoc({
                                      ...newLoc,
                                      copy: e.target.checked ? [...(newLoc.copy || []), i] : (newLoc.copy || []).filter((x) => x !== i),
                                    })
                                  }
                                />
                                <span>{[c.name, c.title].filter(Boolean).join(' · ') || c.phone || c.email}</span>
                              </label>
                            )
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="av-loc-actions">
                    <button type="button" className="av-loc-cancel" onClick={() => setNewLoc(null)}>Cancel</button>
                    <button type="button" className="av-loc-add" disabled={!(newLoc.street.trim() || newLoc.town.trim())} onClick={addLocation}>
                      Add location
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="av-row av-add-loc"
                  onClick={() => {
                    setLocMsg('');
                    setNewLoc({ street: '', town: '', state: addrState || '', zip: '', copy: [] });
                  }}
                >
                  + Add {ordinal(otherLocations.length + 2)} location
                </button>
              )}
            </div>
            {otherLocations.length > 0 && !locMsg && <div className="av-loc-hint">Hold a location to open it</div>}
            {locMsg && <div className="av-loc-msg">{locMsg}. It's in {config.plural} as its own {config.singular.toLowerCase()}, linked to this one.</div>}
          </>
        )}

        {config.hasStage && (
          <>
            <div className="av-section-title">Stage</div>
            <div className="av-stage-pick">
              {STAGES.map((st) => {
                const on = stage === st.key;
                return (
                  <button
                    key={st.key}
                    className={`av-stage-option ${on ? 'is-on' : ''}`}
                    style={on ? { background: st.color, color: '#fff', borderColor: st.color } : { color: st.color, borderColor: st.color }}
                    onClick={() => setStage(on ? '' : st.key)}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="av-section-title">Contacts</div>
        {contacts.map((c, i) => (
          <div key={i} className="av-group av-contact-edit">
            <button
              className="av-remove-contact"
              onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
              aria-label="Remove contact"
            >
              ×
            </button>
            <input className="av-input" placeholder="Name" value={c.name} onChange={(e) => changeContact(i, 'name', e.target.value)} />
            <input className="av-input" placeholder="Title (Chef, Owner, Manager…)" value={c.title} onChange={(e) => changeContact(i, 'title', e.target.value)} />
            <input className="av-input" placeholder="Phone (for calls)" type="tel" value={c.phone} onChange={(e) => changeContact(i, 'phone', formatPhoneTyping(e.target.value))} />
            <input className="av-input" placeholder="Cell for texts (if different)" type="tel" value={c.textPhone} onChange={(e) => changeContact(i, 'textPhone', formatPhoneTyping(e.target.value))} />
            <input className="av-input" placeholder="Email" type="email" value={c.email} onChange={(e) => changeContact(i, 'email', e.target.value)} />
          </div>
        ))}
        <button className="av-add-contact" onClick={() => setContacts((prev) => [...prev, { ...BLANK_CONTACT }])}>
          + Add contact
        </button>

        {config.deliveryDaysField && (
          <>
            <div className="av-section-title">Delivery days</div>
            <div className="av-days">
              {DAYS.map((d) => (
                <button
                  key={d}
                  className={`av-day av-day-btn is-delivery ${deliveryDays.includes(d) ? 'is-on' : ''}`}
                  onClick={() =>
                    setDeliveryDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}

        {config.hasCallNote && (
          <>
            <div className="av-section-title">Call sheet</div>
            <div className="av-group">
              <label className="av-row av-static-row">
                <span className="av-row-label-inline">Call at</span>
                <select className="av-select" value={callTime} onChange={(e) => setCallTime(e.target.value)}>
                  <option value="">Not set</option>
                  <option value="na">N/A (no call)</option>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{timeLabel(t)}</option>
                  ))}
                </select>
              </label>
              <label className="av-row av-static-row">
                <span className="av-row-label-inline">Uses online ordering</span>
                <input
                  type="checkbox"
                  className="av-switch"
                  checked={onlineOrdering}
                  onChange={(e) => setOnlineOrdering(e.target.checked)}
                />
              </label>
              <textarea
                className="av-input av-textarea"
                rows={2}
                placeholder="For whoever makes the call, e.g. text Phil in the morning, call at 3"
                value={callNote}
                onChange={(e) => setCallNote(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="av-section-title">Visit schedule</div>
        <div className="av-days">
          {DAYS.map((d) => (
            <button key={d} className={`av-day av-day-btn ${days.includes(d) ? 'is-on' : ''}`} onClick={() => toggleDay(d)}>
              {d}
            </button>
          ))}
        </div>
        {days.length > 0 && (
          <div className="av-group">
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">Usual time</span>
              <select className="av-select" value={visitTime} onChange={(e) => setVisitTime(e.target.value)}>
                <option value="">Not set</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{timeLabel(t)}</option>
                ))}
              </select>
            </label>
            {visitTime !== '' && (
              <label className="av-row av-static-row">
                <span className="av-row-label-inline">
                  Always at this time
                  <span className="av-row-help">Route planning won't move it</span>
                </span>
                <input
                  type="checkbox"
                  className="av-switch"
                  checked={fixedTime}
                  onChange={(e) => setFixedTime(e.target.checked)}
                />
              </label>
            )}
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">How often</span>
              <select className="av-select" value={visitFrequency} onChange={(e) => setVisitFrequency(e.target.value)}>
                {FREQUENCIES.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">Show in itinerary</span>
              <input
                type="checkbox"
                className="av-switch"
                checked={showInItinerary}
                onChange={(e) => setShowInItinerary(e.target.checked)}
              />
            </label>
            <label className="av-row av-static-row">
              <span className="av-row-label-inline">Show on calendar</span>
              <input
                type="checkbox"
                className="av-switch"
                checked={showOnCalendar}
                onChange={(e) => setShowOnCalendar(e.target.checked)}
              />
            </label>
            {visitFrequency !== 'weekly' && (
              <label className="av-row av-static-row">
                <span className="av-row-label-inline">Starting</span>
                <input
                  type="date"
                  className="av-select"
                  value={visitStart}
                  onChange={(e) => e.target.value && setVisitStart(e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        <div className="av-group av-group-gap">
          <label className="av-row av-static-row">
            <span className="av-row-label-inline">
              Visit length
              <span className="av-row-help">Used to plan your route</span>
            </span>
            <select className="av-select" value={visitLength} onChange={(e) => setVisitLength(Number(e.target.value))}>
              {VISIT_LENGTHS.map((m) => (
                <option key={m} value={m}>{lengthLabel(m)}</option>
              ))}
            </select>
          </label>
        </div>

        {!isNew &&
          setAccounts &&
          (existing.inactive ? (
            <button
              className="av-reactivate"
              onClick={() => setAccounts((prev) => prev.map((x) => (x.id === existing.id ? { ...x, inactive: null } : x)))}
            >
              Activate
            </button>
          ) : (
            <button className="av-inactive-btn" onClick={() => setAskInactiveEdit(true)}>
              Make Inactive
            </button>
          ))}

        {!isNew && onConvert && (
          <button
            className="av-convert"
            onClick={() => {
              if (!name.trim()) {
                window.alert(`Add a ${config.singular.toLowerCase()} name first.`);
                return;
              }
              setConverting(true);
            }}
          >
            Convert to customer
          </button>
        )}

        {!isNew && (
          <button className="av-delete" onClick={remove}>
            Delete {config.singular}
          </button>
        )}
      </div>

      {converting && (
        <div className="av-sheet-backdrop" onClick={() => setConverting(false)}>
          <div className="av-convert-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="av-convert-title">Convert {name.trim()} to a customer</div>
            <div className="av-convert-sub">
              Your changes on this screen, plus notes, contacts, address, and visit schedule, move over. It leaves your
              Prospects list.
            </div>
            <input
              className="av-convert-input"
              placeholder="Customer account number"
              inputMode="numeric"
              value={newAccountNumber}
              onChange={(e) => setNewAccountNumber(e.target.value)}
              autoFocus
            />
            <div className="av-convert-actions">
              <button className="av-convert-cancel" onClick={() => setConverting(false)}>
                Cancel
              </button>
              <button
                className="av-convert-go"
                disabled={!newAccountNumber.trim()}
                onClick={() => {
                  const path = onConvert({ ...existing, ...buildFields() }, newAccountNumber.trim());
                  setConverting(false);
                  if (path) navigate(path, { replace: true });
                }}
              >
                Convert
              </button>
            </div>
          </div>
        </div>
      )}
      {askInactiveEdit && existing && (
        <AskSheet
          title={`Why is ${displayName(existing)} Inactive?`}
          message="It keeps all its notes, but comes off your lists, Itinerary, Calendar, Call Sheet and reminders. You can activate it again any time."
          choices={INACTIVE_REASONS.map(([value, label]) => ({ value, label }))}
          onPick={(reason) => {
            setAccounts((prev) => prev.map((x) => (x.id === existing.id ? { ...x, inactive: { reason, since: todayKey() } } : x)));
            setAskInactiveEdit(false);
          }}
          onCancel={() => setAskInactiveEdit(false)}
        />
      )}

      {repeats && (
        <AskSheet
          title="Looks like a repeat account"
          message={`Already in Crumb: ${repeats
            .slice(0, 3)
            .map((x) => `${displayName(x.account)}${x.account.address ? ` (${x.account.address})` : ''} – ${x.type === 'prospect' ? 'Prospect' : 'Customer'}${x.account.inactive ? ' (Inactive)' : ''}`)
            .join('; ')}`}
          choices={[
            { label: `Open ${displayName(repeats[0].account)}`, value: 'open' },
            { label: 'Save anyway (it\'s different)', value: 'save' },
          ]}
          onPick={(v) => {
            const first = repeats[0];
            setRepeats(null);
            if (v === 'open') navigate(`${first.type === 'prospect' ? '/prospects' : '/customers'}/${first.account.id}`);
            else save(true);
          }}
          onCancel={() => setRepeats(null)}
        />
      )}
    </div>
  );
}
