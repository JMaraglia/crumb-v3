// --- ProspectsPage.jsx ---
// Prospects use the shared list / detail / edit screens in AccountViews.jsx.
// Same data as before (crumb_prospects): name, address, contacts, days, notes.
import React from 'react';
import { AccountList, AccountDetail, AccountEdit } from './AccountViews';
import { readJSON } from './schedule';
import { movePhotos, photoKey } from './photos';
import {
  loadEvents,
  saveEvents,
  loadStops,
  saveStops,
  loadDayMap,
  saveDayMap,
  DONE_KEY,
  LOCKS_KEY,
  TIMES_KEY,
  LENGTHS_KEY,
  REMOVED_KEY,
  HIDDEN_KEY,
} from './store';

const PROSPECT_CONFIG = {
  singular: 'Prospect',
  plural: 'Prospects',
  basePath: '/prospects',
  swipeToDelete: true, // swipe a row left to delete (asks first)
  notesPath: (id) => `/prospect-notes/${id}`,
  hasAccountNumber: false,
  daysLabel: 'Days',
  visitDaysField: 'deliveryDays', // prospects have always stored their days here
  hasStage: true, // Cold / Warming up / Warm / Hot / Ready to close
};

// /prospects
function ProspectsPage({ prospects, setProspects }) {
  return <AccountList config={PROSPECT_CONFIG} accounts={prospects} setAccounts={setProspects} />;
}

// Convert a prospect into a customer: everything moves over, the prospect is removed,
// and calendar events / itinerary stops linked to it now point at the new customer.
// Returns the new customer's page so the screen can go there.
function convertProspect(prospect, accountNumber, contacts, setContacts, setProspects) {
  const newId = contacts.some((c) => String(c.id) === String(prospect.id)) ? Date.now() : prospect.id;
  const { stage, deliveryDays, ...rest } = prospect; // stage is prospects-only
  const customer = {
    ...rest,
    id: newId,
    accountNumber,
    visitDays: deliveryDays || [], // prospects kept visit days in deliveryDays
    deliveryDays: [],              // real delivery days: set these on the customer
    convertedFromProspect: true,
    convertedAt: new Date().toLocaleString(),
  };
  setContacts((prev) => [...prev, customer]);
  setProspects((prev) => prev.filter((p) => p.id !== prospect.id));

  const relink = (item) =>
    item && item.accountType === 'prospect' && String(item.accountId) === String(prospect.id)
      ? { ...item, accountType: 'customer', accountId: newId, type: 'contact' }
      : item;

  const events = loadEvents();
  if (events.length) saveEvents(events.map(relink));

  const visits = loadStops();
  if (visits.length) saveStops(visits.map(relink));

  const done = loadDayMap(DONE_KEY);
  if (Object.keys(done).length) {
    const moved = {};
    Object.keys(done).forEach((day) => {
      moved[day] = (done[day] || []).map((k) => (k === `p-${prospect.id}` ? `c-${newId}` : k));
    });
    saveDayMap(DONE_KEY, moved);
  }

  // Per-day Itinerary settings follow too: locked times, moved times, visit lengths ({ date: { key: minutes } })
  // and "taken off this day" marks on the Itinerary / Calendar ({ date: [key] }).
  const oldKey = `p-${prospect.id}`;
  const newKey = `c-${newId}`;
  [LOCKS_KEY, TIMES_KEY, LENGTHS_KEY].forEach((storageKey) => {
    const m = loadDayMap(storageKey);
    let changed = false;
    Object.keys(m).forEach((day) => {
      const dayMap = m[day];
      if (dayMap && typeof dayMap === 'object' && oldKey in dayMap) {
        const { [oldKey]: value, ...others } = dayMap;
        m[day] = { ...others, [newKey]: value };
        changed = true;
      }
    });
    if (changed) saveDayMap(storageKey, m);
  });
  [REMOVED_KEY, HIDDEN_KEY].forEach((storageKey) => {
    const m = loadDayMap(storageKey);
    let changed = false;
    Object.keys(m).forEach((day) => {
      if (Array.isArray(m[day]) && m[day].includes(oldKey)) {
        m[day] = [...new Set(m[day].map((k) => (k === oldKey ? newKey : k)))];
        changed = true;
      }
    });
    if (changed) saveDayMap(storageKey, m);
  });

  // To-dos linked to the prospect now belong to the customer
  const todos = readJSON('crumb_todos', null);
  if (Array.isArray(todos)) localStorage.setItem('crumb_todos', JSON.stringify(todos.map(relink)));

  // Photos follow too (they're filed under prospect-<id> / customer-<id>)
  movePhotos(photoKey('prospect', prospect.id), photoKey('customer', newId))
    .then(() => window.dispatchEvent(new Event('crumb-photos-moved'))) // the customer screen re-loads its photos
    .catch(() => {});
  return `/customers/${newId}`;
}

// /prospects/:id
export function ProspectDetailPage({ prospects, setProspects, contacts = [], setContacts }) {
  return (
    <AccountDetail
      config={PROSPECT_CONFIG}
      accounts={prospects}
      setAccounts={setProspects}
      onConvert={
        setContacts
          ? (prospect, accountNumber) =>
              convertProspect(prospect, accountNumber, contacts, setContacts, setProspects)
          : null
      }
    />
  );
}

// /prospects/new and /prospects/:id/edit
export function ProspectEditPage({ prospects, setProspects, isNew = false, contacts = [], setContacts }) {
  return (
    <AccountEdit
      config={PROSPECT_CONFIG}
      accounts={prospects}
      setAccounts={setProspects}
      isNew={isNew}
      onConvert={
        setContacts
          ? (prospect, accountNumber) =>
              convertProspect(prospect, accountNumber, contacts, setContacts, setProspects)
          : null
      }
    />
  );
}

export default ProspectsPage;
