// --- CustomersPage.jsx ---
// Customers use the same shared list / detail / edit screens as Prospects
// (AccountViews.jsx), plus account number and delivery days.
// Same data as before (crumb_contacts): name, accountNumber, address, contacts,
// deliveryDays (real delivery days), notes. New, optional: visitDays + visit schedule.
import React from 'react';
import { AccountList, AccountDetail, AccountEdit } from './AccountViews';

export const CUSTOMER_CONFIG = {
  singular: 'Customer',
  plural: 'Customers',
  basePath: '/customers',
  swipeToDelete: true, // swipe a row left to delete (asks first)
  notesPath: (id) => `/notes/${id}`,
  hasAccountNumber: true,
  daysLabel: 'Visit days',
  visitDaysField: 'visitDays',      // when you visit them
  deliveryDaysField: 'deliveryDays', // when they get deliveries (unchanged)
  hasStage: false,
  hasCallNote: true, // instructions shown on the Call Sheet
};

// /customers
function CustomersPage({ contacts, setContacts }) {
  return <AccountList config={CUSTOMER_CONFIG} accounts={contacts} setAccounts={setContacts} />;
}

// /customers/:id
export function CustomerDetailPage({ contacts, setContacts }) {
  return <AccountDetail config={CUSTOMER_CONFIG} accounts={contacts} setAccounts={setContacts} />;
}

// /customers/new and /customers/:id/edit
export function CustomerEditPage({ contacts, setContacts, isNew = false }) {
  return <AccountEdit config={CUSTOMER_CONFIG} accounts={contacts} setAccounts={setContacts} isNew={isNew} />;
}

export default CustomersPage;
