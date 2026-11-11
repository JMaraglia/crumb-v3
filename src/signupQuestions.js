// file: src/signupQuestions.js
// Create Account questions (founder's exact wording, Nov 10, 2026). All required.
// Saved with the new account (Supabase user metadata, key crumb_signup), read in Crumb Admin.

export const SALES_RANGES = [
  'Under $250,000',
  '$250,000–Under $500,000',
  '$500,000–Under $1 Million',
  '$1 Million–Under $3 Million',
  '$3 Million–Under $5 Million',
  '$5 Million+',
];
export const COLD_CALL_HOW = [
  ['phone', 'Phone'],
  ['in_person', 'In Person'],
  ['both', 'Both'],
];

export const EMPTY_ANSWERS = { customers: '', sales: '', coldCall: '', coldHow: '', stops: '', stopsPerDay: '', crm: '' };

const wholeNumber = (v) => /^\d{1,6}$/.test(String(v).trim());

// The first thing still missing, in plain words ('' = all answered).
export function missingAnswer(a) {
  if (!wholeNumber(a.customers)) return 'Enter how many active customers you have (a whole number, 0 is fine).';
  if (!SALES_RANGES.includes(a.sales)) return 'Pick your annual sales.';
  if (a.coldCall !== 'yes' && a.coldCall !== 'no') return 'Answer Do You Cold Call?';
  if (a.coldCall === 'yes' && !COLD_CALL_HOW.some(([v]) => v === a.coldHow)) return 'Pick how you cold call.';
  if (a.stops !== 'yes' && a.stops !== 'no') return 'Answer whether you’re required to make daily stops.';
  if (a.stops === 'yes' && !(wholeNumber(a.stopsPerDay) && Number(a.stopsPerDay) > 0)) return 'Enter your average stops per day.';
  if (!String(a.crm).trim()) return 'Enter the CRM you use now (None is fine).';
  return '';
}

// What gets saved with the account.
export function answersToSave(a) {
  return {
    v: 1,
    customers: Number(String(a.customers).trim()),
    annual_sales: a.sales,
    cold_call: a.coldCall === 'yes',
    cold_call_how: a.coldCall === 'yes' ? a.coldHow : null,
    daily_stops: a.stops === 'yes',
    stops_per_day: a.stops === 'yes' ? Number(String(a.stopsPerDay).trim()) : null,
    crm: String(a.crm).trim().slice(0, 80),
  };
}

// Password rule (founder chose A): 8+ characters with at least one letter and one number.
export function passwordProblem(p) {
  if (String(p).length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use at least one letter and one number.';
  return '';
}

// Admin: saved answers as short lines.
export function answerLines(s) {
  if (!s || typeof s !== 'object') return [];
  const how = (COLD_CALL_HOW.find(([v]) => v === s.cold_call_how) || [])[1];
  return [
    `Active Customers: ${s.customers}`,
    `Annual Sales: ${s.annual_sales}`,
    `Cold Calls: ${s.cold_call ? `Yes${how ? ` (${how})` : ''}` : 'No'}`,
    `Daily Stops: ${s.daily_stops ? `Yes (${s.stops_per_day} A Day)` : 'No'}`,
    `Current CRM: ${s.crm}`,
  ];
}
