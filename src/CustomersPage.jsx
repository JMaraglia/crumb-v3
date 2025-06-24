// --- CustomersPage.jsx ---
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function CustomersPage({ contacts, setContacts }) {
  const [editMode, setEditMode] = useState(false);
  const [sortAZ, setSortAZ] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const handleInputChange = (id, field, value) => {
    setContacts(prev =>
      prev.map(contact =>
        contact.id === id ? { ...contact, [field]: value } : contact
      )
    );
  };

  const handleContactChange = (accountId, index, field, value) => {
    setContacts(prev =>
      prev.map(contact => {
        if (contact.id === accountId) {
          const updatedContacts = [...contact.contacts];
          updatedContacts[index][field] = value;
          return { ...contact, contacts: updatedContacts };
        }
        return contact;
      })
    );
  };

  const handleAddContact = (accountId) => {
    setContacts(prev =>
      prev.map(contact => {
        if (contact.id === accountId) {
          const updatedContacts = [...contact.contacts, { title: '', name: '', phone: '', email: '' }];
          return { ...contact, contacts: updatedContacts };
        }
        return contact;
      })
    );
  };

  const toggleDay = (accountId, day) => {
    if (!editMode) return;
    setContacts(prev =>
      prev.map(contact => {
        if (contact.id === accountId) {
          const updatedDays = contact.deliveryDays.includes(day)
            ? contact.deliveryDays.filter(d => d !== day)
            : [...contact.deliveryDays, day];
          return { ...contact, deliveryDays: updatedDays };
        }
        return contact;
      })
    );
  };

  const handleAddAccount = () => {
    const newAccount = {
      id: Date.now(),
      accountNumber: '',
      name: '',
      address: '',
      contacts: [],
      deliveryDays: [],
      notes: []
    };
    setContacts(prev => [...prev, newAccount]);
    setEditMode(true);
  };

  const handleDeleteAccount = (accountId) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      setContacts(prev => prev.filter(contact => contact.id !== accountId));
    }
  };

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const sortedContacts = [...contacts]
    .filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.accountNumber.includes(search)
    )
    .sort((a, b) =>
      sortAZ ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );

  return (
    <div>
      <h1 style={{ textAlign: 'center', fontSize: '2.5rem' }}>Customers</h1>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <input
          placeholder="Search by name or account #"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: '1rem', padding: '8px', fontSize: '1rem', width: '60%' }}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={() => setEditMode(prev => !prev)}>
            {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
          <button onClick={() => setSortAZ(prev => !prev)} style={{ marginLeft: '1rem' }}>
            Sort {sortAZ ? 'A–Z' : 'Z–A'}
          </button>
          <button onClick={handleAddAccount} style={{ marginLeft: '1rem' }}>
            Add Account
          </button>
          <button onClick={() => navigate('/')} style={{ marginLeft: '1rem' }}>
            Back to Home
          </button>
        </div>
      </div>

      {sortedContacts.map(account => (
        <div key={account.id} className="card" style={{ marginBottom: '2rem' }}>
          {/* Account Info */}
          {editMode ? (
            <>
              <input
                placeholder="Account Name"
                value={account.name}
                onChange={e => handleInputChange(account.id, 'name', e.target.value)}
              />
              <input
                placeholder="Account Number"
                value={account.accountNumber}
                onChange={e => handleInputChange(account.id, 'accountNumber', e.target.value)}
              />
              <input
                placeholder="Address"
                value={account.address}
                onChange={e => handleInputChange(account.id, 'address', e.target.value)}
              />
              <button
                onClick={() => handleDeleteAccount(account.id)}
                style={{ marginTop: '10px', backgroundColor: 'red', color: 'white', border: 'none', borderRadius: '5px', padding: '6px 12px' }}
              >
                Delete Account
              </button>
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: '6px' }}>{account.name}</h2>
              <p style={{ display: 'flex', gap: '1rem' }}>
                <span><strong>Account #:</strong> {account.accountNumber}</span>
                <span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'underline', color: '#007bff' }}
                  >
                    {account.address}
                  </a>
                </span>
              </p>
            </>
          )}

          {/* Contacts */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
            {account.contacts.map((person, index) => (
              <div key={index} style={{ flex: '1 1 220px', border: '1px solid #ccc', padding: '8px', borderRadius: '10px' }}>
                {editMode ? (
                  <>
                    <input placeholder="Title" value={person.title} onChange={e => handleContactChange(account.id, index, 'title', e.target.value)} />
                    <input placeholder="Name" value={person.name} onChange={e => handleContactChange(account.id, index, 'name', e.target.value)} />
                    <input placeholder="Phone" value={person.phone} onChange={e => handleContactChange(account.id, index, 'phone', e.target.value)} />
                    <input placeholder="Email" value={person.email} onChange={e => handleContactChange(account.id, index, 'email', e.target.value)} />
                  </>
                ) : (
                  <div>
                    <strong>{person.title}</strong><br />
                    {person.name}<br />
                    <a href={`tel:${person.phone}`} style={{ color: '#007bff' }}>{person.phone}</a><br />
                    {person.email && (
                      <a href={`mailto:${person.email}`} style={{ color: '#007bff' }}>{person.email}</a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {editMode && (
            <div style={{ marginTop: '1rem' }}>
              <button onClick={() => handleAddContact(account.id)} style={{ padding: '6px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>
                Add Contact
              </button>
            </div>
          )}

          {/* Delivery Days */}
          <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {daysOfWeek.map(day => (
              <div
                key={day}
                onClick={() => toggleDay(account.id, day)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '18px',
                  backgroundColor: account.deliveryDays.includes(day) ? '#007bff' : '#e0f0ff',
                  color: account.deliveryDays.includes(day) ? 'white' : '#003366',
                  cursor: editMode ? 'pointer' : 'default',
                  userSelect: 'none',
                  border: '1px solid #ccc',
                  minWidth: '50px',
                  textAlign: 'center',
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Notes Button */}
          <div style={{ marginTop: '1.5rem' }}>
            <button
              onClick={() => navigate(`/notes/${account.id}`)}
              style={{ padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px' }}
            >
              View Notes
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default CustomersPage;