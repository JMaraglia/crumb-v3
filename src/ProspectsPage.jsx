// --- ProspectsPage.jsx ---
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function ProspectsPage({ prospects, setProspects }) {
  const [editMode, setEditMode] = useState(false);
  const [sortAZ, setSortAZ] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const handleInputChange = (id, field, value) => {
    setProspects(prev =>
      prev.map(prospect =>
        prospect.id === id ? { ...prospect, [field]: value } : prospect
      )
    );
  };

  const handleContactChange = (prospectId, index, field, value) => {
    setProspects(prev =>
      prev.map(prospect => {
        if (prospect.id === prospectId) {
          const updatedContacts = [...prospect.contacts];
          updatedContacts[index][field] = value;
          return { ...prospect, contacts: updatedContacts };
        }
        return prospect;
      })
    );
  };

  const handleAddContact = (prospectId) => {
    setProspects(prev =>
      prev.map(prospect => {
        if (prospect.id === prospectId) {
          const updatedContacts = [...prospect.contacts, { title: '', name: '', phone: '', email: '' }];
          return { ...prospect, contacts: updatedContacts };
        }
        return prospect;
      })
    );
  };

  const toggleDay = (prospectId, day) => {
    if (!editMode) return;
    setProspects(prev =>
      prev.map(prospect => {
        if (prospect.id === prospectId) {
          const updatedDays = prospect.deliveryDays.includes(day)
            ? prospect.deliveryDays.filter(d => d !== day)
            : [...prospect.deliveryDays, day];
          return { ...prospect, deliveryDays: updatedDays };
        }
        return prospect;
      })
    );
  };

  const handleAddProspect = () => {
    const newProspect = {
      id: Date.now(),
      name: '',
      address: '',
      contacts: [],
      deliveryDays: [],
      notes: []
    };
    setProspects(prev => [...prev, newProspect]);
    setEditMode(true);
  };

  const handleDeleteProspect = (prospectId) => {
    if (window.confirm('Are you sure you want to delete this prospect?')) {
      setProspects(prev => prev.filter(prospect => prospect.id !== prospectId));
    }
  };

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']; // ✅ Only weekdays now

  const sortedProspects = [...prospects]
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sortAZ ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );

  return (
    <div>
      <h1 style={{ textAlign: 'center', fontSize: '2.5rem' }}>Prospect Contacts</h1>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <input
          placeholder="Search by name"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: '1rem', padding: '8px', fontSize: '1rem', width: '60%' }}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={() => setEditMode(prev => !prev)}>
            {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
          <button onClick={() => setSortAZ(prev => !prev)} style={{ marginLeft: '1rem' }}>
            Sort {sortAZ ? 'Z-A' : 'A-Z'}
          </button>
          <button onClick={handleAddProspect} style={{ marginLeft: '1rem' }}>
            Add Prospect
          </button>
          <button onClick={() => navigate('/')} style={{ marginLeft: '1rem' }}>
            Back to Home
          </button>
        </div>
      </div>

      {sortedProspects.map(prospect => (
        <div key={prospect.id} className="card" style={{ marginBottom: '2rem' }}>
          {/* Prospect Info */}
          {editMode ? (
            <>
              <input
                placeholder="Prospect Name"
                value={prospect.name}
                onChange={e => handleInputChange(prospect.id, 'name', e.target.value)}
              />
              <input
                placeholder="Address"
                value={prospect.address}
                onChange={e => handleInputChange(prospect.id, 'address', e.target.value)}
              />
              <button
                onClick={() => handleDeleteProspect(prospect.id)}
                style={{ marginTop: '10px', backgroundColor: 'red', color: 'white', border: 'none', borderRadius: '5px', padding: '6px 12px' }}
              >
                Delete Prospect
              </button>
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: '6px' }}>{prospect.name}</h2>
              <p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(prospect.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'underline', color: '#007bff' }}
                >
                  {prospect.address}
                </a>
              </p>
            </>
          )}

          {/* Contacts */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
            {prospect.contacts.map((person, index) => (
              <div key={index} style={{ flex: '1 1 220px', border: '1px solid #ccc', padding: '8px', borderRadius: '10px' }}>
                {editMode ? (
                  <>
                    <input placeholder="Title" value={person.title} onChange={e => handleContactChange(prospect.id, index, 'title', e.target.value)} />
                    <input placeholder="Name" value={person.name} onChange={e => handleContactChange(prospect.id, index, 'name', e.target.value)} />
                    <input placeholder="Phone" value={person.phone} onChange={e => handleContactChange(prospect.id, index, 'phone', e.target.value)} />
                    <input placeholder="Email" value={person.email} onChange={e => handleContactChange(prospect.id, index, 'email', e.target.value)} />
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
              <button onClick={() => handleAddContact(prospect.id)} style={{ padding: '6px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>
                Add Contact
              </button>
            </div>
          )}

          {/* Delivery Days */}
          <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {daysOfWeek.map(day => (
              <div
                key={day}
                onClick={() => toggleDay(prospect.id, day)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '18px',
                  backgroundColor: prospect.deliveryDays.includes(day) ? '#007bff' : '#e0f0ff',
                  color: prospect.deliveryDays.includes(day) ? 'white' : '#003366',
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
              onClick={() => navigate(`/prospect-notes/${prospect.id}`)} // ✅ Fixed route
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

export default ProspectsPage;