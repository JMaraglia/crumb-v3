// file: src/ItineraryPage.jsx
// Day-by-day checklist of stops, filled in automatically from:
//   1. prospects' visit schedules (days + usual time + how often), unless "Show in itinerary" is off
//   2. calendar events linked to an account (or any event switched to "Show in itinerary")
//   3. stops added by hand (saved in visitData, same as before; old saved visits still show)
// Tap a stop for Contact / Map and a quick note that saves to that account as a "Visit" note.
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { IoShareOutline, IoPrintOutline, IoCalendarOutline, IoNavigate } from 'react-icons/io5';
import {
  TIME_OPTIONS,
  timeLabel,
  stageInfo,
  lastNote,
  shortDate,
  ActionSheet,
  mapActions,
  contactSheet,
  snoozeSheet,
  StageChip,
  VisitChips,
  VisitSheet,
  stageSheet,
  findRepeats,
} from './AccountViews';
import {
  keyOf,
  fromKey,
  addDaysToKey,
  readJSON,
  toVisitList,
  hhmmToMinutes,
  minutesToHhmm,
  onItinerary,
  visitMoveInto,
  visitTimeOn,
  pruneMoves,
  isDueOn,
  PROSPECT_DAYS_FIELD,
  CUSTOMER_DAYS_FIELD,
  CUSTOMER_COLOR,
} from './schedule';
import { PdfDoc } from './pdf';
import SwipeRow from './SwipeRow';
import AskSheet from './AskSheet';
import { removeStop, snapshotStops, restoreStops, REMOVED_KEY, HIDDEN_KEY } from './stopRemoval';
import MeetingSheet from './MeetingSheet';
import { staleAccounts } from './lastContact';
import './ItineraryPage.css';

const VISITS_KEY = 'visitData';                     // stops added by hand (existing key)
const DONE_KEY = 'crumb_itinerary_done';            // checkmarks for scheduled/event stops
const LOCKS_KEY = 'crumb_itinerary_locks';          // { date: { stopKey: minutes } } times locked for one day
const EVENTS_KEY = 'crumb_calendar_events';         // calendar events (read only here)

function niceDate(k) {
  return fromKey(k).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// Town + state from an address like "12 Main St, Worcester, MA 01601" → "Worcester, MA".
// Just the town if no state is written; blank if there's no recognizable town.
const STATE_ZIP = /^(?:([A-Za-z]{2})|\d{5}(?:-\d{4})?|([A-Za-z]{2})\s+\d{5}(?:-\d{4})?)$/;
const TRAILING_STATE_ZIP = /\s+([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/;
function townOf(address) {
  if (!address) return '';
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  while (parts.length && /^(usa|us|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  let state = '';
  const end = parts.length ? parts[parts.length - 1].match(STATE_ZIP) : null;
  if (end) {
    state = end[1] || end[2] || '';
    parts.pop();
  }
  if (!parts.length) return '';
  // A single piece is a town only if it isn't a street address ("123 Main St")
  if (parts.length === 1 && /^\d/.test(parts[0])) return '';
  let town = parts[parts.length - 1];
  const inline = town.match(TRAILING_STATE_ZIP); // "Worcester MA 01601"
  if (inline) {
    if (!state) state = inline[1];
    town = town.replace(TRAILING_STATE_ZIP, '');
  }
  return state ? `${town}, ${state.toUpperCase()}` : town;
}

// The shared PDF: same as the printout — this day on the left, the next day on the right,
// checkbox + account + town, then write-in lines.
function buildItineraryPdf(days) {
  const doc = new PdfDoc();
  const BLUE = '#0077cc';
  const gap = 24;
  const colW = (doc.right - doc.left - gap) / 2;
  const ROW = 22;
  const LINES = 16;

  days.forEach(({ dayKey, list }, i) => {
    const x0 = doc.left + i * (colW + gap);
    const x1 = x0 + colW;
    let y = doc.top;
    doc.text('Crumb.', x0, y, { size: 15, bold: true, color: BLUE });
    doc.text('ITINERARY', x1, y + 4, { size: 7.5, bold: true, align: 'right', spacing: 1.3 });
    y += 21;
    const heading = fromKey(dayKey).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    doc.text(heading, x0, y, { size: 13, bold: true });
    doc.text(`${list.length} ${list.length === 1 ? 'stop' : 'stops'}`, x1, y + 3, { size: 8.5, bold: true, align: 'right' });
    y += 18;
    doc.line(x0, y, x1, y, { width: 2, color: BLUE });

    const rows = Math.max(LINES, list.length);
    for (let r = 0; r < rows; r++) {
      const s = list[r];
      const top = y + 7;
      if (s) {
        doc.checkbox(x0 + 2, top + 1, 9, s.done);
        const town = s.townLine || townOf(s.address);
        const townW = town ? doc.widthOf(town, { size: 9 }) + 8 : 0;
        const nameLines = doc.wrap(s.title, colW - 20 - townW, { size: 10, bold: true });
        doc.text(nameLines[0] + (nameLines.length > 1 ? '…' : ''), x0 + 18, top, { size: 10, bold: true });
        if (town) doc.text(town, x1, top + 1, { size: 9, align: 'right' });
      } else {
        doc.rect(x0 + 2, top + 1, 9, 9, { stroke: '#aaaaaa', width: 0.8 });
      }
      y += ROW;
      doc.line(x0, y, x1, y, { width: s ? 0.8 : 0.5, color: s ? '#000000' : '#c4c4c4' });
    }
    // dashed fold line between the two columns
    if (i === 0) {
      for (let dy = doc.top; dy < y; dy += 6) doc.line(x1 + gap / 2, dy, x1 + gap / 2, dy + 3, { width: 0.5, color: '#999999' });
    }
  });
  return doc.save('Crumb itinerary');
}

/* ---------- page ---------- */
function ItineraryPage({ contacts = [], setContacts, prospects = [], setProspects }) {
  const navigate = useNavigate();
  const today = keyOf(new Date());
  const [date, setDate] = useState(today);
  const [openKey, setOpenKey] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savedFlash, setSavedFlash] = useState('');
  const [sheet, setSheet] = useState(null);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(null); // { stop, acct } while the Move panel is open

  const [visits, setVisits] = useState(() => toVisitList(readJSON(VISITS_KEY, [])));
  const [doneMap, setDoneMap] = useState(() => readJSON(DONE_KEY, {}));
  const [lockMap, setLockMap] = useState(() => readJSON(LOCKS_KEY, {}));
  const [locking, setLocking] = useState(null); // stop whose time is being locked
  const [timing, setTiming] = useState(null);   // stop whose time is being changed (tapped the time)
  const [removedMap, setRemovedMap] = useState(() => readJSON(REMOVED_KEY, {}) || {});
  const [meetingFor, setMeetingFor] = useState(null); // account getting a meeting set
  const [visitFor, setVisitFor] = useState(null);     // { acct, type } whose visits are being changed
  const [staleOpen, setStaleOpen] = useState(false);  // "Haven't seen in a while" list opened
  // Same fields as the Customers / Prospects screens, so changes show everywhere.
  const daysConfig = (type) => ({ visitDaysField: type === 'prospect' ? PROSPECT_DAYS_FIELD : CUSTOMER_DAYS_FIELD });
  const updateAccount = (type, id, fields) => {
    const up = (list) => list.map((a) => (String(a.id) === String(id) ? { ...a, ...fields } : a));
    if (type === 'prospect' && setProspects) setProspects(up);
    if (type === 'customer' && setContacts) setContacts(up);
  };
  const pickStage = (acct) => setSheet(stageSheet(acct, (key) => updateAccount('prospect', acct.id, { stage: key })));
  const [undoIt, setUndoIt] = useState(null);   // { text, restore, timer } after swiping a stop away
  const events = toVisitList(readJSON(EVENTS_KEY, []));

  const saveVisits = (next) => {
    setVisits(next);
    localStorage.setItem(VISITS_KEY, JSON.stringify(next));
  };
  const saveDone = (next) => {
    setDoneMap(next);
    localStorage.setItem(DONE_KEY, JSON.stringify(next));
  };

  const findAccount = (type, id) =>
    type === 'prospect'
      ? prospects.find((p) => String(p.id) === String(id))
      : type === 'customer'
      ? contacts.find((c) => String(c.id) === String(id))
      : null;

  /* ---- build the stops for a day (today's list, plus the next day for the printout) ---- */
  const buildStops = (day) => {
    const doneToday = doneMap[day] || [];
    const list = [];

    prospects
      .filter((p) => p.name && p.name.trim() && onItinerary(p, day))
      .forEach((p) => {
        const key = `p-${p.id}`;
        const st = stageInfo(p.stage);
        list.push({
          key,
          kind: 'scheduled',
          time: visitTimeOn(p, day),
          movedFrom: visitMoveInto(p, day),
          title: p.name,
          address: p.address,
          townLine: p.town ? [p.town, p.state].filter(Boolean).join(', ') : '',
          tag: { label: 'Prospect', color: '#8e8e93' },
          stage: st ? { label: st.label, color: st.color } : null, // shown next to "Prospect"
          revisit: Boolean(p.inactive), // an inactive account's revisit day
          color: st ? st.color : '#0077cc',
          accountType: 'prospect',
          accountId: p.id,
          done: doneToday.includes(key),
        });
      });

    contacts
      .filter((c) => c.name && c.name.trim() && onItinerary(c, day, CUSTOMER_DAYS_FIELD))
      .forEach((c) => {
        const key = `c-${c.id}`;
        list.push({
          key,
          kind: 'scheduled',
          time: visitTimeOn(c, day),
          movedFrom: visitMoveInto(c, day),
          title: c.name,
          address: c.address,
          townLine: c.town ? [c.town, c.state].filter(Boolean).join(', ') : '',
          tag: { label: 'Customer', color: CUSTOMER_COLOR },
          revisit: Boolean(c.inactive),
          color: CUSTOMER_COLOR,
          accountType: 'customer',
          accountId: c.id,
          done: doneToday.includes(key),
        });
      });

    events
      .filter((ev) => ev.date === day)
      .filter((ev) => (typeof ev.showInItinerary === 'boolean' ? ev.showInItinerary : Boolean(ev.accountId)))
      .forEach((ev) => {
        const key = `e-${ev.id}`;
        list.push({
          key,
          kind: 'event',
          time: ev.start,
          endTime: ev.end,
          title: ev.title,
          address: ev.location,
          tag: { label: 'Calendar', color: ev.color || '#0077cc' },
          color: ev.color || '#0077cc',
          accountType: ev.accountType,
          accountId: ev.accountId,
          done: doneToday.includes(key),
        });
      });

    visits.forEach((v, index) => {
      if (v.date !== day) return;
      // A hand-added stop for an account that's already scheduled today (e.g. it was just made into a
      // prospect with today as a visit day) shows once: as the account's scheduled stop.
      if (v.accountId) {
        const kind = v.accountType === 'customer' || v.type === 'contact' ? 'c' : 'p';
        const same = list.find((st) => st.key === `${kind}-${v.accountId}`);
        if (same) {
          if (v.done) same.done = true;
          return;
        }
      }
      const acct = v.accountId ? findAccount(v.accountType, v.accountId) : null;
      const isCustomerStop = v.accountType === 'customer' || v.type === 'contact';
      const mst = acct && !isCustomerStop ? stageInfo(acct.stage) : null;
      list.push({
        key: `m-${v.id || index}`,
        kind: 'manual',
        index,
        time: hhmmToMinutes(v.time),
        title: (acct && acct.name) || v.name || '(No name)',
        address: (acct && acct.address) || '',
        tag: { label: isCustomerStop ? 'Customer' : 'Prospect', color: '#8e8e93' },
        stage: mst ? { label: mst.label, color: mst.color } : null,
        color: '#8e8e93',
        accountType: v.accountType || null,
        accountId: v.accountId || null,
        done: Boolean(v.done),
      });
    });

    // Stops swiped off this day's list
    const gone = removedMap[day] || [];
    for (let i = list.length - 1; i >= 0; i--) if (gone.includes(list[i].key)) list.splice(i, 1);

    // Locked times: a lock for just this day wins; otherwise "Always at this time" accounts
    // and calendar events (real appointments) count as locked.
    const dayLocks = lockMap[day] || {};
    list.forEach((st) => {
      const acct = st.accountId ? findAccount(st.accountType, st.accountId) : null;
      st.visitLength = acct && typeof acct.visitLength === 'number' ? acct.visitLength : null;
      if (typeof dayLocks[st.key] === 'number') {
        st.time = dayLocks[st.key];
        st.locked = 'day';
      } else if (st.kind === 'scheduled' && acct && acct.fixedTime && typeof st.time === 'number') {
        st.locked = 'always';
      } else if (st.kind === 'event' && typeof st.time === 'number') {
        st.locked = 'event';
      } else {
        st.locked = null;
      }
    });
    list.sort((a, b) => (a.time == null ? 9999 : a.time) - (b.time == null ? 9999 : b.time));
    return list;
  };
  const stops = buildStops(date);
  const doneCount = stops.filter((s) => s.done).length;

  /* ---- actions ---- */
  const toggleDone = (stop) => {
    if (stop.kind === 'manual') {
      const next = visits.map((v, i) => (i === stop.index ? { ...v, done: !v.done } : v));
      saveVisits(next);
    } else {
      const list = doneMap[date] || [];
      const nextList = list.includes(stop.key) ? list.filter((k) => k !== stop.key) : [...list, stop.key];
      saveDone({ ...doneMap, [date]: nextList });
    }
  };

  const openStop = (stop) => {
    setNoteText('');
    setSavedFlash('');
    setOpenKey((cur) => (cur === stop.key ? null : stop.key));
  };

  // Double-tap or hold a stop → that customer's / prospect's Edit screen.
  const lastTap = useRef({ key: null, time: 0 });
  const hold = useRef(null); // { timer, x, y, fired }
  const editPath = (stop) => {
    const acct = stop.accountId ? findAccount(stop.accountType, stop.accountId) : null;
    if (!acct) return null;
    return stop.accountType === 'prospect' ? `/prospects/${acct.id}/edit` : `/customers/${acct.id}/edit`;
  };
  const tapStop = (stop) => {
    if (hold.current && hold.current.fired) {
      hold.current = null; // the lift after a hold
      return;
    }
    const now = Date.now();
    const path = editPath(stop);
    if (path && lastTap.current.key === stop.key && now - lastTap.current.time < 350) {
      lastTap.current = { key: null, time: 0 };
      navigate(path);
      return;
    }
    lastTap.current = { key: stop.key, time: now };
    openStop(stop);
  };
  const holdStart = (stop, e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const path = editPath(stop);
    if (!path) return;
    const h = { x: e.clientX, y: e.clientY, fired: false };
    h.timer = setTimeout(() => {
      h.fired = true;
      navigate(path);
    }, 550);
    hold.current = h;
  };
  const holdMove = (e) => {
    const h = hold.current;
    if (h && !h.fired && (Math.abs(e.clientX - h.x) > 10 || Math.abs(e.clientY - h.y) > 10)) {
      clearTimeout(h.timer);
      hold.current = null;
    }
  };
  const holdEnd = () => {
    const h = hold.current;
    if (h && !h.fired) {
      clearTimeout(h.timer);
      hold.current = null;
    }
  };

  // Quick note → saved on the account as a "Visit" note
  const saveQuickNote = (stop) => {
    const text = noteText.trim();
    if (!text || !stop.accountId) return;
    const note = { text, category: 'Visit', timestamp: new Date().toLocaleString() };
    const add = (list) =>
      list.map((a) => (String(a.id) === String(stop.accountId) ? { ...a, notes: [...(a.notes || []), note] } : a));
    if (stop.accountType === 'prospect' && setProspects) setProspects(add);
    if (stop.accountType === 'customer' && setContacts) setContacts(add);
    setNoteText('');
    setSavedFlash('Saved to notes');
  };

  const removeManual = (stop) => {
    if (!window.confirm('Remove this stop?')) return;
    saveVisits(visits.filter((_, i) => i !== stop.index));
    setOpenKey(null);
  };

  // Swipe left on a stop. If it's on the Calendar too, ask whether to delete it there as well
  // (see stopRemoval.js). Scheduled visits only ever skip that one day.
  // Is this stop also showing on the Calendar that day? (Then we ask about removing it there too.)
  const onCalendarToo = (stop) => {
    if ((readJSON(HIDDEN_KEY, {}) || {})[date]?.includes(stop.key)) return false;
    if (stop.kind === 'event') return true;
    if (typeof stop.time !== 'number') return false; // no time = not on the calendar grid
    const cal = readJSON('crumb_calendar_settings', {}) || {};
    if (stop.kind === 'manual') return cal.showStops !== false;
    const acct = findAccount(stop.accountType, stop.accountId);
    return cal.showVisits !== false && (!acct || acct.showOnCalendar !== false);
  };
  const [askingStop, setAskingStop] = useState(null); // stop waiting for "also the Calendar?" answer
  const reloadStops = () => {
    setVisits(toVisitList(readJSON(VISITS_KEY, [])));
    setRemovedMap(readJSON(REMOVED_KEY, {}) || {});
  };
  // where: 'itinerary' | 'both'
  const doRemove = (stop, where) => {
    const snap = snapshotStops();
    removeStop(where, stop.key, date);
    reloadStops();
    if (openKey === stop.key) setOpenKey(null);
    if (undoIt && undoIt.timer) clearTimeout(undoIt.timer);
    const timer = setTimeout(() => setUndoIt(null), 6000);
    const text =
      where === 'both'
        ? stop.kind === 'scheduled'
          ? 'Removed from Itinerary and Calendar'
          : 'Deleted from Itinerary and Calendar'
        : 'Removed from Itinerary';
    setUndoIt({
      text,
      restore: () => {
        restoreStops(snap);
        reloadStops();
      },
      timer,
    });
  };
  const swipeRemove = (stop) => {
    if (onCalendarToo(stop)) setAskingStop(stop);
    else doRemove(stop, stop.kind === 'scheduled' ? 'itinerary' : 'both'); // only on the Itinerary
  };
  const undoRemove = () => {
    if (!undoIt) return;
    clearTimeout(undoIt.timer);
    undoIt.restore();
    setUndoIt(null);
  };

  /* ---- share / print the day as a checklist ---- */
  const [shareMsg, setShareMsg] = useState('');
  const shareList = async () => {
    setShareMsg('');
    const nextKey = addDaysToKey(date, 1);
    const blob = buildItineraryPdf([
      { dayKey: date, list: stops },
      { dayKey: nextKey, list: buildStops(nextKey) },
    ]);
    const fileName = `Crumb itinerary - ${fromKey(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.pdf`;
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Crumb itinerary' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet
    }
    // Fallback: download the PDF
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShareMsg('PDF downloaded.');
  };

  const printList = () => {
    setShareMsg('');
    try {
      window.print();
    } catch {
      setShareMsg("Printing isn't available here. Use Share instead.");
    }
  };

  // Move one visit to another day (and maybe time). The regular schedule doesn't change.
  // `fromKey` is the visit's original date; moving an already-moved visit updates the same move.
  const saveMove = (stop, acct, toKey, time) => {
    const fromKeyDate = stop.movedFrom || date;
    const setList = stop.accountType === 'customer' ? setContacts : setProspects;
    setList((prev) =>
      prev.map((x) => {
        if (x.id !== acct.id) return x;
        const moves = { ...(x.visitMoves || {}) };
        if (toKey === null) delete moves[fromKeyDate]; // undo
        else moves[fromKeyDate] = { to: toKey, time: typeof time === 'number' ? time : null };
        return { ...x, visitMoves: pruneMoves(moves) };
      })
    );
    setMoving(null);
    setOpenKey(null);
  };

  // Lock (or unlock, with time = null) one stop's time for this day only.
  const saveLock = (stop, time) => {
    const forDay = { ...(lockMap[date] || {}) };
    if (time == null) delete forDay[stop.key];
    else forDay[stop.key] = time;
    const next = { ...lockMap, [date]: forDay };
    if (!Object.keys(forDay).length) delete next[date];
    // forget locks older than 60 days
    const cutoff = addDaysToKey(today, -60);
    Object.keys(next).forEach((k) => k < cutoff && delete next[k]);
    setLockMap(next);
    localStorage.setItem(LOCKS_KEY, JSON.stringify(next));
    setLocking(null);
  };

  // Tapped the time on the left. Hand-added stops and calendar events change their own time;
  // scheduled visits change for this day only (their usual time stays the same).
  const saveTime = (stop, time) => {
    const clearDayLock = () => {
      if (lockMap[date] && typeof lockMap[date][stop.key] === 'number') saveLock(stop, null);
    };
    if (stop.kind === 'manual') {
      saveVisits(visits.map((v, i) => (i === stop.index ? { ...v, time: time == null ? '' : minutesToHhmm(time) } : v)));
      clearDayLock();
    } else if (stop.kind === 'event') {
      if (time != null) {
        const all = readJSON(EVENTS_KEY, []);
        if (Array.isArray(all)) {
          const next = all.map((ev) => {
            if (`e-${ev.id}` !== stop.key) return ev;
            const length = typeof ev.end === 'number' && typeof ev.start === 'number' ? ev.end - ev.start : 60;
            return { ...ev, start: time, end: Math.min(time + length, 1440) };
          });
          localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
        }
      }
      clearDayLock();
    } else {
      saveLock(stop, time); // null = back to the usual time
    }
    setTiming(null);
  };

  // Navigation. Apple Maps and Waze take ONE destination per link, so they go stop by stop
  // ("Next stop"); Google Maps takes up to 4 stops per link on a phone (3 in between + the last).
  // Starts from wherever the phone is. Check stops off and tap again for the next one(s).
  const [mapsApp, setMapsAppState] = useState(() => {
    try {
      const saved = localStorage.getItem('crumb_maps_app');
      if (saved === 'apple' || saved === 'google' || saved === 'waze') return saved;
    } catch {
      /* ignore */
    }
    return /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'apple' : 'google';
  });
  const setMapsApp = (v) => {
    setMapsAppState(v);
    try {
      localStorage.setItem('crumb_maps_app', v);
    } catch {
      /* ignore */
    }
  };
  const MAPS_NAMES = { apple: 'Apple Maps', google: 'Google Maps', waze: 'Waze' };
  const ROUTE_MAX = mapsApp === 'google' ? 4 : 1;
  const remainingStops = stops.filter((st) => !st.done && st.address && st.address.trim());
  const remainingWithAddress = remainingStops.length;
  const routeStops = remainingStops.slice(0, ROUTE_MAX);
  const startRoute = () => {
    const places = routeStops.map((st) => st.address.trim());
    const last = places[places.length - 1];
    if (mapsApp === 'apple') {
      window.open(`https://maps.apple.com/?daddr=${encodeURIComponent(last)}&dirflg=d`, '_blank');
    } else if (mapsApp === 'waze') {
      window.open(`https://waze.com/ul?q=${encodeURIComponent(last)}&navigate=yes`, '_blank');
    } else {
      const params = new URLSearchParams({ api: '1', destination: last, travelmode: 'driving' });
      if (places.length > 1) params.set('waypoints', places.slice(0, -1).join('|'));
      window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank');
    }
  };

  // A new prospect from a name (from a hand-added stop). Returns its id.
  const newProspect = (name) => {
    const id = Date.now();
    setProspects((prev) => [
      ...prev,
      { id, name: name.trim(), address: '', contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
    ]);
    return id;
  };

  // Before making a new prospect from a name: is it already a customer / prospect? Then ask.
  const [repeatAsk, setRepeatAsk] = useState(null); // { name, found, useExisting(x), makeNew() }
  const checkRepeat = (name, useExisting, makeNew) => {
    const found = findRepeats({ name });
    if (found.length) setRepeatAsk({ name, found, useExisting, makeNew });
    else makeNew();
  };

  // "Make it a prospect": create the prospect, link this stop to it, then open its Edit screen.
  const makeProspect = (stop) => {
    const link = (type, id) =>
      saveVisits(visits.map((v, i) => (i === stop.index ? { ...v, accountType: type, accountId: id, type } : v)));
    checkRepeat(
      stop.title,
      (x) => link(x.type, x.account.id), // link the stop to the one that's already there
      () => {
        const id = newProspect(stop.title);
        link('prospect', id);
        navigate(`/prospects/${id}/edit`);
      }
    );
  };

  const changeDay = (n) => {
    setDate((d) => addDaysToKey(d, n));
    setOpenKey(null);
  };

  return (
    <div className="it-page">
      <header className="it-header">
        <button className="it-icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <FaArrowLeft />
        </button>
        <div className="it-header-title">Itinerary</div>
        {/* Jump to a date: the calendar button opens the phone's date picker */}
        <label className="it-cal-btn" aria-label="Pick a date">
          <IoCalendarOutline />
          <input
            type="date"
            className="it-date-input"
            value={date}
            onChange={(e) => e.target.value && (setDate(e.target.value), setOpenKey(null))}
          />
        </label>
      </header>

      <div className="it-content">
        {/* Day picker: arrows (jump to a date with the calendar button up top) */}
        <div className="it-day">
          <button className="it-arrow" onClick={() => changeDay(-1)} aria-label="Previous day">
            <FaChevronLeft />
          </button>
          <div className="it-date">
            <span className="it-date-main">{date === today ? 'Today' : niceDate(date).split(',')[0]}</span>
            <span className="it-date-sub">
              {date === today ? niceDate(date) : niceDate(date).split(', ').slice(1).join(', ')}
            </span>
          </div>
          <button className="it-arrow" onClick={() => changeDay(1)} aria-label="Next day">
            <FaChevronRight />
          </button>
        </div>

        {stops.length > 0 && (
          <div className="it-progress">
            <div className="it-progress-row">
              <div className="it-progress-text">
                {doneCount} of {stops.length} done
              </div>
              <div className="it-share">
                <button className="it-pill" onClick={shareList}>
                  <IoShareOutline className="it-pill-icon" />
                  Share
                </button>
                <button className="it-pill" onClick={printList}>
                  <IoPrintOutline className="it-pill-icon" />
                  Print
                </button>
              </div>
            </div>
            <div className="it-progress-bar">
              <div className="it-progress-fill" style={{ width: `${(doneCount / stops.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Start route / Next stop in the maps app you pick (remembered) */}
        {routeStops.length > 0 && (
          <div className="it-route-row">
            <button className="it-route-btn" onClick={startRoute}>
              <IoNavigate className="it-route-icon" />
              <span className="it-route-text">
                <span className="it-route-main">
                  {routeStops.length === 1 ? `Next stop: ${routeStops[0].title}` : 'Start route'}
                </span>
                <span className="it-route-sub">
                  {routeStops.length === 1
                    ? `${MAPS_NAMES[mapsApp]}${remainingWithAddress > 1 ? ` · ${remainingWithAddress - 1} more after this` : ''}`
                    : `Next ${routeStops.length} stops in Google Maps${remainingWithAddress > routeStops.length ? ` (of ${remainingWithAddress} left)` : ''}`}
                </span>
              </span>
            </button>
            <label className="it-maps-pick" aria-label="Maps app">
              <span className="it-maps-label">Maps</span>
              <span className="it-maps-value">{mapsApp === 'apple' ? 'Apple' : mapsApp === 'google' ? 'Google' : 'Waze'} ▾</span>
              <select className="it-maps-select" value={mapsApp} onChange={(e) => setMapsApp(e.target.value)}>
                <option value="apple">Apple Maps</option>
                <option value="google">Google Maps</option>
                <option value="waze">Waze</option>
              </select>
            </label>
          </div>
        )}

        {shareMsg && <div className="it-share-msg">{shareMsg}</div>}

        {stops.length === 0 ? (
          <div className="it-empty">
            No stops this day.
            <br />
            Set visit days on a prospect, link a calendar event, or tap + to add one.
          </div>
        ) : (
          <div className="it-list">
            {stops.map((stop) => {
              const open = openKey === stop.key;
              const acct = stop.accountId ? findAccount(stop.accountType, stop.accountId) : null;
              const latest = acct ? lastNote(acct) : null;
              return (
                <div key={stop.key} className={`it-stop ${stop.done ? 'is-done' : ''} ${open ? 'is-open' : ''}`}>
                  <SwipeRow className="it-stop-row" label={stop.kind === 'manual' ? 'Delete' : 'Remove'} onDelete={() => swipeRemove(stop)}>
                    <button
                      className="it-stop-main"
                      onClick={() => tapStop(stop)}
                      onPointerDown={(e) => holdStart(stop, e)}
                      onPointerMove={holdMove}
                      onPointerUp={holdEnd}
                      onPointerCancel={holdEnd}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <span
                        className={`it-time ${stop.locked ? 'is-locked' : ''}`}
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation(); // tapping the time changes it; the rest of the row opens the stop
                          setTiming(stop);
                        }}
                      >
                        {stop.time == null ? 'Anytime' : timeLabel(stop.time)}
                        {stop.locked && <span className="it-lock-icon">🔒</span>}
                      </span>
                      <span className="it-bar" style={{ background: stop.color }} />
                      <span className="it-stop-text">
                        <span className="it-stop-title">{stop.title}</span>
                        {stop.address && <span className="it-stop-sub">{stop.address}</span>}
                        {stop.movedFrom && (
                          <span className="it-moved">Moved from {fromKey(stop.movedFrom).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        )}
                        <span className="it-tags">
                          <span className="it-tag" style={{ color: stop.tag.color, borderColor: stop.tag.color }}>
                            {stop.tag.label}
                          </span>
                          {stop.revisit && (
                            <span className="it-tag" style={{ color: '#3a3a3c', borderColor: '#3a3a3c' }}>
                              Revisit
                            </span>
                          )}
                          {stop.stage && (
                            <span
                              className="it-tag it-tag-tap"
                              style={{ color: stop.stage.color, borderColor: stop.stage.color }}
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation(); // tapping the stage changes it (doesn't open the stop)
                                const acct = findAccount('prospect', stop.accountId);
                                if (acct) pickStage(acct);
                              }}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              {stop.stage.label}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      className={`it-check ${stop.done ? 'is-checked' : ''}`}
                      onClick={() => toggleDone(stop)}
                      aria-label={stop.done ? 'Mark not done' : 'Mark done'}
                    >
                      {stop.done ? '✓' : ''}
                    </button>
                  </SwipeRow>

                  {open && (
                    <div className="it-expand">
                      {acct && (stop.accountType === 'prospect' || stop.accountType === 'customer') && (
                        <div className="av-chips it-acct-chips">
                          <VisitChips
                            account={acct}
                            config={daysConfig(stop.accountType)}
                            onPick={() => setVisitFor({ acct, type: stop.accountType })}
                          />
                          {stop.accountType === 'prospect' && <StageChip stage={acct.stage} onPick={() => pickStage(acct)} />}
                        </div>
                      )}
                      {latest && (
                        <div className="it-last-note">
                          <span className="it-last-note-date">{shortDate(latest.timestamp)}</span>
                          {latest.text}
                        </div>
                      )}
                      <div className="it-quick">
                        <button
                          className="it-quick-btn"
                          disabled={!acct || !contactSheet(acct.contacts)}
                          onClick={() => setSheet(contactSheet(acct.contacts))}
                        >
                          Contact
                        </button>
                        <button
                          className="it-quick-btn"
                          disabled={!stop.address}
                          onClick={() => setSheet({ title: stop.address, actions: mapActions(stop.address) })}
                        >
                          Map
                        </button>
                        {acct && (
                          <button
                            className="it-quick-btn"
                            onClick={() =>
                              navigate(stop.accountType === 'prospect' ? `/prospect-notes/${acct.id}` : `/notes/${acct.id}`)
                            }
                          >
                            Notes
                          </button>
                        )}
                        {stop.kind === 'scheduled' && acct && (
                          <button
                            className="it-quick-btn"
                            onClick={() =>
                              setSheet(
                                snoozeSheet(
                                  acct,
                                  (until) => {
                                    const setList = stop.accountType === 'customer' ? setContacts : setProspects;
                                    setList((prev) =>
                                      prev.map((x) => (x.id === acct.id ? { ...x, snoozeUntil: until } : x))
                                    );
                                    setOpenKey(null);
                                  },
                                  stop.accountType === 'customer' ? CUSTOMER_DAYS_FIELD : undefined
                                )
                              )
                            }
                          >
                            Snooze
                          </button>
                        )}
                        {stop.kind === 'scheduled' && acct && (
                          <button className="it-quick-btn" onClick={() => setMoving({ stop, acct })}>
                            Move
                          </button>
                        )}
                      </div>
                      <div className="it-lock-row">
                        <span className="it-lock-text">
                          {stop.locked === 'day'
                            ? `🔒 Locked at ${timeLabel(stop.time)} today`
                            : stop.locked === 'always'
                            ? `🔒 Always at ${timeLabel(stop.time)} (set on the account)`
                            : stop.locked === 'event'
                            ? `🔒 Calendar appointment at ${timeLabel(stop.time)}`
                            : 'Time not locked: route planning can move it'}
                        </span>
                        {stop.locked !== 'event' && (
                          <button className="it-lock-btn" onClick={() => setLocking(stop)}>
                            {stop.locked === 'day' ? 'Change' : 'Lock time'}
                          </button>
                        )}
                      </div>
                      {acct ? (
                        <div className="it-note">
                          <textarea
                            className="it-note-input"
                            rows={2}
                            placeholder="Quick note (saves to their notes)…"
                            value={noteText}
                            onChange={(e) => {
                              setNoteText(e.target.value);
                              setSavedFlash('');
                            }}
                          />
                          <div className="it-note-actions">
                            <button
                              className="mt-open-btn"
                              onClick={() => setMeetingFor({ type: stop.accountType, id: acct.id, name: acct.name, address: acct.address })}
                            >
                              Meeting
                            </button>
                            <span className="it-flash">{savedFlash}</span>
                            <button
                              className="it-note-save"
                              disabled={!noteText.trim()}
                              onClick={() => saveQuickNote(stop)}
                            >
                              Save note
                            </button>
                          </div>
                        </div>
                      ) : (
                        stop.kind === 'manual' && setProspects ? (
                          <div className="it-make">
                            <div className="it-make-text">
                              <strong>{stop.title}</strong> isn't in Crumb yet. Make it a prospect to save notes, contacts, and an address.
                            </div>
                            <button className="it-make-btn" onClick={() => makeProspect(stop)}>
                              + Make it a prospect
                            </button>
                          </div>
                        ) : (
                          <div className="it-hint-inline">Not linked to a customer or prospect, so notes can't be saved here.</div>
                        )
                      )}
                      {stop.kind === 'manual' && (
                        <button className="it-remove" onClick={() => removeManual(stop)}>
                          Remove stop
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {stops.length > 0 && <div className="it-hint">Tap a stop for details · Double-tap or hold to edit · Tap ○ when done · Swipe left to remove</div>}

        {/* Accounts not contacted in a while (limit set in Settings). Not on this day already. */}
        {(() => {
          const onDay = new Set(stops.filter((s) => s.accountId).map((s) => `${s.accountType}-${s.accountId}`));
          const stale = staleAccounts(contacts, prospects).filter((x) => !onDay.has(`${x.type}-${x.account.id}`));
          if (!stale.length) return null;
          const dayWord = date === today ? 'today' : fromKey(date).toLocaleDateString('en-US', { weekday: 'short' });
          return (
            <div className="it-stale">
              <button className="it-stale-bar" onClick={() => setStaleOpen((o) => !o)}>
                <span>Haven't seen in a while ({stale.length})</span>
                <span className={`it-stale-arrow${staleOpen ? ' is-open' : ''}`}>›</span>
              </button>
              {staleOpen && (
                <div className="it-stale-list">
                  {stale.map((x) => (
                    <div className="it-stale-row" key={`${x.type}-${x.account.id}`}>
                      <div className="it-stale-info">
                        <div className="it-stale-name">{x.account.name}</div>
                        <div className="it-stale-sub">
                          {x.type === 'customer' ? 'Customer' : 'Prospect'}
                          {x.account.town ? ` · ${x.account.town}` : ''}
                          {' · '}
                          {x.never ? `No contact yet (added ${x.days} days ago)` : `${x.days} days`}
                        </div>
                      </div>
                      <button
                        className="it-stale-add"
                        onClick={() =>
                          saveVisits([
                            ...visits,
                            {
                              id: Date.now(),
                              name: x.account.name,
                              time: '',
                              date,
                              done: false,
                              recurrence: 'none',
                              type: x.type === 'customer' ? 'contact' : 'prospect',
                              accountType: x.type,
                              accountId: x.account.id,
                            },
                          ])
                        }
                      >
                        + Add to {dayWord}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <button className="it-fab" onClick={() => setAdding(true)} aria-label="Add stop">
        +
      </button>

      {adding && (
        <AddStopSheet
          date={date}
          accounts={[
            ...contacts.map((c) => ({ type: 'customer', id: c.id, name: c.name, address: c.address })),
            ...prospects.map((p) => ({ type: 'prospect', id: p.id, name: p.name, address: p.address })),
          ].filter((a) => a.name && a.name.trim())}
          onCancel={() => setAdding(false)}
          canCreate={Boolean(setProspects)}
          onAdd={(stop, asProspect) => {
            setAdding(false);
            if (asProspect && !stop.accountId) {
              checkRepeat(
                stop.name,
                (x) => saveVisits([...visits, { ...stop, name: x.account.name, accountType: x.type, accountId: x.account.id, type: x.type }]),
                () => {
                  const id = newProspect(stop.name);
                  saveVisits([...visits, { ...stop, accountType: 'prospect', accountId: id, type: 'prospect' }]);
                }
              );
              return;
            }
            saveVisits([...visits, stop]);
          }}
        />
      )}

      {locking && (
        <LockSheet
          stop={locking}
          onCancel={() => setLocking(null)}
          onSave={(time) => saveLock(locking, time)}
        />
      )}

      {repeatAsk && (
        <AskSheet
          title="Looks like a repeat account"
          message={`"${repeatAsk.name}" is already in Crumb: ${repeatAsk.found
            .slice(0, 3)
            .map((x) => `${x.account.name}${x.account.town ? ` (${x.account.town})` : ''} – ${x.type === 'prospect' ? 'Prospect' : 'Customer'}${x.account.inactive ? ' (Inactive)' : ''}`)
            .join('; ')}`}
          choices={[
            { label: `Use ${repeatAsk.found[0].account.name}`, value: 'use' },
            { label: 'Make a new prospect anyway', value: 'new' },
          ]}
          onPick={(v) => {
            const r = repeatAsk;
            setRepeatAsk(null);
            if (v === 'use') r.useExisting(r.found[0]);
            else r.makeNew();
          }}
          onCancel={() => setRepeatAsk(null)}
        />
      )}

      {visitFor && (
        <VisitSheet
          account={visitFor.acct}
          config={daysConfig(visitFor.type)}
          onCancel={() => setVisitFor(null)}
          onSave={(fields) => {
            updateAccount(visitFor.type, visitFor.acct.id, fields);
            setVisitFor(null);
          }}
        />
      )}

      {meetingFor && (
        <MeetingSheet
          account={meetingFor}
          presetNotes={noteText.trim()}
          onCancel={() => setMeetingFor(null)}
          onSaved={(msg, note) => {
            // Also saved on the account as a "Meeting" note
            const acctId = meetingFor.id;
            const add = (list) =>
              list.map((a) => (String(a.id) === String(acctId) ? { ...a, notes: [...(a.notes || []), note] } : a));
            if (meetingFor.type === 'prospect' && setProspects) setProspects(add);
            if (meetingFor.type === 'customer' && setContacts) setContacts(add);
            setMeetingFor(null);
            setNoteText('');
            setSavedFlash('Meeting set');
            setShareMsg(msg);
          }}
        />
      )}

      {askingStop && (
        <AskSheet
          title={`Remove "${askingStop.title}" from the Itinerary?`}
          message={`${askingStop.kind === 'scheduled' ? 'Just this day. The regular visit schedule stays the same. ' : ''}Also delete it from the Calendar?`}
          choices={[
            { label: 'Yes, delete from both', value: 'both', tone: 'danger' },
            { label: 'No, just the Itinerary', value: 'itinerary' },
          ]}
          onPick={(where) => {
            const stop = askingStop;
            setAskingStop(null);
            doRemove(stop, where);
          }}
          onCancel={() => setAskingStop(null)}
        />
      )}

      {undoIt && (
        <div className="it-undo">
          <span>{undoIt.text}</span>
          <button className="it-undo-btn" onClick={undoRemove}>
            Undo
          </button>
        </div>
      )}

      {timing && (
        <TimeSheet
          stop={timing}
          usual={(() => {
            if (timing.kind !== 'scheduled') return null;
            const acct = findAccount(timing.accountType, timing.accountId);
            return acct ? visitTimeOn(acct, date) : null;
          })()}
          onCancel={() => setTiming(null)}
          onSave={(time) => saveTime(timing, time)}
        />
      )}

      {moving && (
        <MoveSheet
          stop={moving.stop}
          acct={moving.acct}
          viewDate={date}
          onCancel={() => setMoving(null)}
          onSave={(toKey, time) => saveMove(moving.stop, moving.acct, toKey, time)}
        />
      )}

      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}

      {/* Only shows on the printed / PDF copy: this day on the left, the next day on the right */}
      {stops.length > 0 && (
        <div className="it-print">
          {[
            [date, stops],
            [addDaysToKey(date, 1), buildStops(addDaysToKey(date, 1))],
          ].map(([dayKey, list]) => (
            <div key={dayKey} className="it-print-day">
              <div className="it-print-top">
                <div className="it-print-brand">Crumb.</div>
                <div className="it-print-kicker">Itinerary</div>
              </div>
              <div className="it-print-bottom">
                <div className="it-print-heading">
                  {fromKey(dayKey).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <div className="it-print-count">
                  {list.length} {list.length === 1 ? 'stop' : 'stops'}
                </div>
              </div>
              <table className="it-print-table">
                <tbody>
                  {list.map((s) => (
                    <tr key={s.key}>
                      <td className="it-print-box">{s.done ? '☑' : '☐'}</td>
                      <td>{s.title}</td>
                      <td className="it-print-town">{s.townLine || townOf(s.address)}</td>
                    </tr>
                  ))}
                  {/* Blank lines to fill the page, for stops added by hand */}
                  {Array.from({ length: Math.max(0, 16 - list.length) }, (_, i) => (
                    <tr key={`blank-${i}`} className="it-print-blank">
                      <td className="it-print-box">☐</td>
                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Lock a stop's time for one day ---------- */
function LockSheet({ stop, onSave, onCancel }) {
  const [time, setTime] = useState(typeof stop.time === 'number' ? stop.time : 9 * 60);
  return (
    <div className="it-sheet-backdrop" onClick={onCancel}>
      <div className="it-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="it-sheet-top">
          <button className="it-link" onClick={onCancel}>Cancel</button>
          <div className="it-sheet-title">Lock time</div>
          <button className="it-link it-bold" onClick={() => onSave(Number(time))}>Lock</button>
        </div>
        <div className="it-move-who">
          <strong>{stop.title}</strong>
          <span>For this day only. When you plan the route, this stop stays at this time and the others fit around it.</span>
        </div>
        <div className="it-sheet-group">
          <label className="it-sheet-row">
            <span>Be there at</span>
            <select className="it-sheet-select" value={time} onChange={(e) => setTime(Number(e.target.value))}>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
        </div>
        {stop.locked === 'day' && (
          <button className="it-move-undo" onClick={() => onSave(null)}>
            Unlock
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Change a stop's time (tap the time on the left) ---------- */
function TimeSheet({ stop, usual, onSave, onCancel }) {
  const [time, setTime] = useState(typeof stop.time === 'number' ? stop.time : stop.kind === 'manual' ? '' : 9 * 60);
  // Visits and stops: the iPhone time wheel, any minute. Calendar events keep 30-minute steps.
  const wheel = stop.kind !== 'event';
  const nice = (m) => (typeof m === 'number' ? timeLabel(m) : 'no set time');
  const help =
    stop.kind === 'manual'
      ? 'Changes the time for this stop.'
      : stop.kind === 'event'
      ? 'Changes the time of this calendar event. It keeps the same length.'
      : `For this day only. The usual time (${nice(usual)}) stays the same.`;
  return (
    <div className="it-sheet-backdrop" onClick={onCancel}>
      <div className="it-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="it-sheet-top">
          <button className="it-link" onClick={onCancel}>Cancel</button>
          <div className="it-sheet-title">Change time</div>
          <button className="it-link it-bold" onClick={() => onSave(time === '' ? null : Number(time))}>Save</button>
        </div>
        <div className="it-move-who">
          <strong>{stop.title}</strong>
          <span>{help}</span>
        </div>
        <div className="it-sheet-group">
          <label className="it-sheet-row">
            <span>Time</span>
            {wheel ? (
              <input
                type="time"
                className="it-time-input"
                value={time === '' ? '' : minutesToHhmm(time)}
                onChange={(e) => {
                  const m = hhmmToMinutes(e.target.value);
                  setTime(m == null ? (stop.kind === 'manual' ? '' : time) : m);
                }}
              />
            ) : (
              <select className="it-sheet-select" value={time} onChange={(e) => setTime(Number(e.target.value))}>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{timeLabel(t)}</option>
                ))}
              </select>
            )}
          </label>
        </div>
        {stop.kind === 'manual' && time !== '' && (
          <button className="it-move-undo" onClick={() => setTime('')}>
            No set time (Anytime)
          </button>
        )}
        {stop.kind === 'scheduled' && stop.locked === 'day' && (
          <button className="it-move-undo" onClick={() => onSave(null)}>
            Back to usual time{typeof usual === 'number' ? ` (${timeLabel(usual)})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Move one visit to another day ---------- */
// Other visits this account already has in the same Monday–Sunday week as `toKey`
// (not counting the visit being moved). Used for the heads-up in the Move panel.
function otherVisitsThatWeek(acct, stop, original, toKey) {
  if (!acct || !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) return [];
  const field = stop.accountType === 'customer' ? CUSTOMER_DAYS_FIELD : PROSPECT_DAYS_FIELD;
  const moves = { ...(acct.visitMoves || {}) };
  delete moves[original]; // leave out the visit being moved
  const others = { ...acct, visitMoves: moves };
  const weekday = (fromKey(toKey).getDay() + 6) % 7; // Mon = 0
  const monday = addDaysToKey(toKey, -weekday);
  const found = [];
  for (let i = 0; i < 7; i++) {
    const k = addDaysToKey(monday, i);
    if (k !== original && isDueOn(others, k, field)) found.push(k);
  }
  return found;
}

function MoveSheet({ stop, acct, viewDate, onSave, onCancel }) {
  const original = stop.movedFrom || viewDate;
  const [toKey, setToKey] = useState(stop.movedFrom ? viewDate : addDaysToKey(viewDate, 1));
  const [time, setTime] = useState(typeof stop.time === 'number' ? stop.time : '');
  const nice = (k) => fromKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(toKey) && toKey !== original;
  const clash = valid ? otherVisitsThatWeek(acct, stop, original, toKey) : [];

  return (
    <div className="it-sheet-backdrop" onClick={onCancel}>
      <div className="it-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="it-sheet-top">
          <button className="it-link" onClick={onCancel}>Cancel</button>
          <div className="it-sheet-title">Move visit</div>
          <button className="it-link it-bold" disabled={!valid} onClick={() => onSave(toKey, time === '' ? null : Number(time))}>
            Save
          </button>
        </div>
        <div className="it-move-who">
          <strong>{stop.title}</strong>
          <span>Normally {nice(original)}. Only this one visit moves; the regular schedule stays the same.</span>
        </div>
        <div className="it-sheet-group">
          <label className="it-sheet-row">
            <span>New day</span>
            <input type="date" className="it-move-date" value={toKey} onChange={(e) => setToKey(e.target.value)} />
          </label>
          <label className="it-sheet-row">
            <span>Time</span>
            <select className="it-sheet-select" value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">No set time</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
        </div>
        {clash.length > 0 && (
          <div className="it-move-warn">
            Heads up: {stop.title} already has a visit {clash.includes(toKey) ? 'on that day' : 'that week'} (
            {clash.map(nice).join(', ')}). You can still move it.
          </div>
        )}
        {stop.movedFrom && (
          <button className="it-move-undo" onClick={() => onSave(null)}>
            Undo move (back to {nice(original)})
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Add a stop by hand ---------- */
function AddStopSheet({ date, accounts, onAdd, onCancel, canCreate = false }) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(null);
  const [time, setTime] = useState(9 * 60);
  const [asProspect, setAsProspect] = useState(false); // also create a new prospect from the typed name

  const matches = search.trim()
    ? accounts.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];
  const name = picked ? picked.name : search.trim();

  const add = () => {
    if (!name) return;
    onAdd({
      id: Date.now(),
      name,
      time: minutesToHhmm(time),
      date,
      done: false,
      recurrence: 'none',
      type: picked && picked.type === 'customer' ? 'contact' : 'prospect',
      accountType: picked ? picked.type : null,
      accountId: picked ? picked.id : null,
    }, !picked && asProspect);
  };
  const exactMatch = accounts.some((a) => a.name.trim().toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="it-sheet-backdrop" onClick={onCancel}>
      <div className="it-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="it-sheet-top">
          <button className="it-link" onClick={onCancel}>Cancel</button>
          <div className="it-sheet-title">Add stop · {fromKey(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          <button className="it-link it-bold" disabled={!name} onClick={add}>Add</button>
        </div>

        <div className="it-sheet-group">
          {picked ? (
            <div className="it-picked">
              <span className="it-picked-name">{picked.name}</span>
              <span className="it-picked-type">{picked.type === 'prospect' ? 'Prospect' : 'Customer'}</span>
              <button className="it-picked-clear" onClick={() => setPicked(null)} aria-label="Remove">×</button>
            </div>
          ) : (
            <>
              <input
                className="it-sheet-input"
                placeholder="Customer, prospect, or any name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {matches.map((a) => (
                <button key={`${a.type}-${a.id}`} className="it-match" onClick={() => setPicked(a)}>
                  <span className="it-match-name">{a.name}</span>
                  <span className="it-match-sub">
                    {a.type === 'prospect' ? 'Prospect' : 'Customer'}
                    {a.address ? ` · ${a.address}` : ''}
                  </span>
                </button>
              ))}
            </>
          )}
          {canCreate && !picked && search.trim() && !exactMatch && (
            <label className="it-sheet-row">
              <span>
                Also add as a new prospect
                <span className="it-sheet-help">Creates “{search.trim()}” in Prospects</span>
              </span>
              <input type="checkbox" className="it-switch" checked={asProspect} onChange={(e) => setAsProspect(e.target.checked)} />
            </label>
          )}
          <label className="it-sheet-row">
            <span>Time</span>
            <select className="it-sheet-select" value={time} onChange={(e) => setTime(Number(e.target.value))}>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{timeLabel(t)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="it-sheet-note">
          Repeating visits come from a prospect's visit schedule (Edit › Visit schedule).
        </div>
      </div>
    </div>
  );
}

export default ItineraryPage;
