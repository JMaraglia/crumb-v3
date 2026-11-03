// --- ProspectsPage.jsx ---
// Prospects use the shared list / detail / edit screens in AccountViews.jsx.
// Same data as before (crumb_prospects): name, address, contacts, days, notes.
import React from 'react';
import { AccountList, AccountDetail, AccountEdit } from './AccountViews';

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

// /prospects/:id
export function ProspectDetailPage({ prospects, setProspects }) {
  return <AccountDetail config={PROSPECT_CONFIG} accounts={prospects} setAccounts={setProspects} />;
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
