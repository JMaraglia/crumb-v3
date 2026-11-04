// file: src/share.js
// Helpers for sending things out of Crumb (text, files, contact cards), so nothing gets retyped.
// Uses the phone's share sheet when it can; otherwise copies text / downloads the file.

// Share plain text (pastes into a text, email, Slack…). Returns a message to show, or '' if shared.
export async function shareText(title, text) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return '';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return ''; // closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'Copied. Paste it into a text or email.';
  } catch {
    return "Sharing isn't available here.";
  }
}

// Share a file (PDF, Excel, contact card, calendar invite). Falls back to downloading it.
export async function shareFile(blob, fileName, title) {
  try {
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || fileName });
      return '';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return '';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Downloaded.';
}

// File-name-safe version of a name ("Bella's Pizza / Grill" → "Bella's Pizza Grill")
export function safeFileName(name) {
  return String(name || 'Crumb').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Crumb';
}

/* ---------- Contact cards (.vcf) ---------- */
const vEsc = (v) => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

// One card per contact (business name as the company). With no contacts, one card for the business.
// account: { name, street, town, state, zip, address, contacts: [{ name, title, phone, textPhone, email }] }
export function contactCards(account) {
  const people = (account.contacts || []).filter((c) => c && (c.name || c.phone || c.textPhone || c.email));
  const adr = account.street || account.town || account.state || account.zip
    ? `ADR;TYPE=WORK:;;${vEsc(account.street)};${vEsc(account.town)};${vEsc(account.state)};${vEsc(account.zip)};`
    : account.address
    ? `ADR;TYPE=WORK:;;${vEsc(account.address)};;;;`
    : null;
  const card = (c) => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    if (c && c.name) {
      const parts = c.name.trim().split(/\s+/);
      const last = parts.length > 1 ? parts.pop() : '';
      lines.push(`N:${vEsc(last)};${vEsc(parts.join(' '))};;;`, `FN:${vEsc(c.name.trim())}`, `ORG:${vEsc(account.name)}`);
    } else {
      lines.push(`N:;;;;`, `FN:${vEsc(account.name)}`, `ORG:${vEsc(account.name)}`);
    }
    if (c && c.title) lines.push(`TITLE:${vEsc(c.title)}`);
    if (c && c.phone) lines.push(`TEL;TYPE=WORK,VOICE:${vEsc(c.phone)}`);
    if (c && c.textPhone && c.textPhone !== c.phone) lines.push(`TEL;TYPE=CELL:${vEsc(c.textPhone)}`);
    if (c && c.email) lines.push(`EMAIL;TYPE=WORK:${vEsc(c.email)}`);
    if (adr) lines.push(adr);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  };
  const cards = people.length ? people.map(card) : [card(null)];
  return new Blob([cards.join('\r\n') + '\r\n'], { type: 'text/vcard' });
}

/* ---------- Calendar invites (.ics) ---------- */
// event: { title, date: 'YYYY-MM-DD', start: minutes, end: minutes, location, notes }
// Times are "floating" (no time zone), so they show at the same clock time for whoever adds it.
export function eventIcs(event) {
  const esc = (v) => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const stamp = (dateKey, minutes) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const day = new Date(y, m - 1, d + Math.floor(minutes / 1440)); // an end of 24:00 rolls to the next day
    const mins = minutes % 1440;
    const pad = (n) => String(n).padStart(2, '0');
    return `${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`;
  };
  const now = new Date();
  const utc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // Long lines are folded at 75 characters, as calendar apps expect.
  const fold = (line) => {
    const out = [];
    let rest = line;
    while (rest.length > 74) {
      out.push(rest.slice(0, 74));
      rest = ' ' + rest.slice(74);
    }
    out.push(rest);
    return out.join('\r\n');
  };
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crumb//Crumb//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:crumb-${Date.now()}-${Math.random().toString(36).slice(2)}@crumb`,
    `DTSTAMP:${utc}`,
    `DTSTART:${stamp(event.date, event.start)}`,
    `DTEND:${stamp(event.date, event.end)}`,
    `SUMMARY:${esc(event.title || 'Appointment')}`,
    ...(event.location ? [`LOCATION:${esc(event.location)}`] : []),
    ...(event.notes ? [`DESCRIPTION:${esc(event.notes)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar' });
}
