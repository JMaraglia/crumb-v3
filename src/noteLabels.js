// file: src/noteLabels.js
// Note labels (Nov 10, 2026): a library to pick from, your own labels, and which ones are "in use".
// In use = the labels offered on notes, in the order shown (Settings → Note Labels). At most 12.
// Old notes always keep their label, even if it's no longer in use.
// Some labels do more than label:
//   Follow-up, Sample, Proposal, Quote → checkbox, due date, show on To-Do
//   Meeting → books it on the Calendar · Background → sticks to the top of the notes
// Custom labels are plain labels. Every label except Background counts as contact (Due For A Check-In).
import { loadAppSettings, saveAppSettings } from './store';

export const MAX_IN_USE = 12;
export const MAX_LABEL_LENGTH = 20;
export const MAX_CUSTOM = 20;

export const DEFAULT_LABELS = ['Visit', 'Sample', 'Follow-up', 'Contacted', 'Background', 'Meeting'];
export const LIBRARY = [
  ...DEFAULT_LABELS,
  'Email', 'Text', 'Call', 'Proposal', 'Quote', 'Demo', 'Order', 'Service', 'Complaint', 'Invoice', 'Contract', 'Referral',
];
// Labels that become to-dos (checkbox + due date + To-Do list)
export const TODO_LABELS = ['Follow-up', 'Sample', 'Proposal', 'Quote'];

const COLORS = {
  General: { bg: '#eeeef0', fg: '#3a3a3c' },
  Visit: { bg: '#e6f1fa', fg: '#0077cc' },
  Sample: { bg: '#e3f6e8', fg: '#1e8e3e' },
  'Follow-up': { bg: '#fff1de', fg: '#b25e00' },
  Contacted: { bg: '#e0f4f6', fg: '#0e7c86' },
  Background: { bg: '#f3e8fb', fg: '#8a3fb5' },
  Meeting: { bg: '#fff1e0', fg: '#d96b00' },
  Email: { bg: '#eceafd', fg: '#4b3fc4' },
  Text: { bg: '#e0f4f6', fg: '#0e7c86' },
  Call: { bg: '#e6f1fa', fg: '#0060a8' },
  Proposal: { bg: '#e9f5dc', fg: '#3b6d11' },
  Quote: { bg: '#e9f5dc', fg: '#2f6b2a' },
  Demo: { bg: '#fdf0d8', fg: '#8a5300' },
  Order: { bg: '#e3f6e8', fg: '#18733a' },
  Service: { bg: '#eeeef0', fg: '#4a4a4f' },
  Complaint: { bg: '#fdeaea', fg: '#b3261e' },
  Invoice: { bg: '#eceafd', fg: '#3c3489' },
  Contract: { bg: '#eceafd', fg: '#2e2a78' },
  Referral: { bg: '#fbeaf0', fg: '#993556' },
};
// Your own labels get one of these, picked from the name so it never changes
const CUSTOM_COLORS = [
  { bg: '#e6f1fa', fg: '#0077cc' }, { bg: '#e3f6e8', fg: '#1e8e3e' }, { bg: '#fff1de', fg: '#b25e00' },
  { bg: '#f3e8fb', fg: '#8a3fb5' }, { bg: '#fbeaf0', fg: '#993556' }, { bg: '#e0f4f6', fg: '#0e7c86' },
];

export function labelColor(label) {
  if (COLORS[label]) return COLORS[label];
  let h = 0;
  String(label || '').split('').forEach((ch) => (h = (h * 31 + ch.charCodeAt(0)) >>> 0));
  return label ? CUSTOM_COLORS[h % CUSTOM_COLORS.length] : COLORS.General;
}

// The labels in use, in order. Before Nov 10 the setting was a list of hidden labels; that still works.
export function labelsInUse(app = loadAppSettings()) {
  if (Array.isArray(app.labels) && app.labels.length) return app.labels.slice(0, MAX_IN_USE);
  return DEFAULT_LABELS.filter((l) => !(app.hiddenLabels || []).includes(l));
}
export function customLabels(app = loadAppSettings()) {
  return Array.isArray(app.customLabels) ? app.customLabels : [];
}
export function saveLabels(inUse, custom) {
  return saveAppSettings({ labels: inUse.slice(0, MAX_IN_USE), customLabels: custom, hiddenLabels: [] });
}
