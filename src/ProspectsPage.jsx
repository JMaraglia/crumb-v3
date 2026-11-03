// --- ProspectsPage.jsx ---
// Prospects use the shared list / detail / edit screens in AccountViews.jsx.
// Same data as before (crumb_prospects): name, address, contacts, days, notes.
import React from 'react';
import { AccountList, AccountDetail, AccountEdit } from './AccountViews';
import { readJSON, toVisitList } from './schedule';

const PROSPECT_CONFIG = {
  singular: 'Prospect',
  plural: 'Prospects',
  basePath: '/prospects',
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

  const events = readJSON('crumb_calendar_events', null);
  if (Array.isArray(events)) localStorage.setItem('crumb_calendar_events', JSON.stringify(events.map(relink)));

  const visits = localStorage.getItem('visitData');
  if (visits) localStorage.setItem('visitData', JSON.stringify(toVisitList(JSON.parse(visits)).map(relink)));

  const done = readJSON('crumb_itinerary_done', null);
  if (done && typeof done === 'object') {
    const moved = {};
    Object.keys(done).forEach((day) => {
      moved[day] = (done[day] || []).map((k) => (k === `p-${prospect.id}` ? `c-${newId}` : k));
    });
    localStorage.setItem('crumb_itinerary_done', JSON.stringify(moved));
  }
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
export function ProspectEditPage({ prospects, setProspects, isNew = false }) {
  return (
    <AccountEdit
      config={PROSPECT_CONFIG}
      accounts={prospects}
      setAccounts={setProspects}
      isNew={isNew}
    />
  );
}

export default ProspectsPage;
