// --- App.jsx ---
import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import './App.css';
import NotesPage from './NotesPage';
import HomePage from './HomePage';
import CustomersPage from './CustomersPage'; // Renamed
import ItineraryPage from './ItineraryPage';
import ProspectsPage from './ProspectsPage';
import ProspectNotesPage from './ProspectNotesPage';
import CalendarPage from './CalendarPage'; // ✅ Restored CalendarPage
// import WeekView from './WeekView'; // ❌ No longer needed directly here

function NotesWrapper({ contacts, setContacts }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const contact = contacts.find(c => String(c.id) === id);

  const handleAddNote = (contactId, note, index = null) => {
    setContacts(prev =>
      prev.map(c => {
        if (c.id === contactId) {
          const updatedNotes = [...c.notes];
          if (index !== null) {
            updatedNotes[index] = note;
          } else {
            updatedNotes.push(note);
          }
          return { ...c, notes: updatedNotes };
        }
        return c;
      })
    );
  };

  const handleDeleteNote = (noteIndex) => {
    setContacts(prev =>
      prev.map(c => {
        if (c.id === contact.id) {
          const updatedNotes = [...c.notes];
          updatedNotes.splice(noteIndex, 1);
          return { ...c, notes: updatedNotes };
        }
        return c;
      })
    );
  };

  if (!contact) return <div>Contact not found</div>;

  return (
    <NotesPage
      contact={contact}
      goBack={() => navigate('/customers')} // Updated
      onAddNote={handleAddNote}
      onDeleteNote={handleDeleteNote}
    />
  );
}

function ProspectNotesWrapper({ prospects, setProspects }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const contact = prospects.find(p => String(p.id) === id);

  const handleAddNote = (prospectId, note) => {
    setProspects(prev =>
      prev.map(p => {
        if (p.id === prospectId) {
          const updatedNotes = [...p.notes, note];
          return { ...p, notes: updatedNotes };
        }
        return p;
      })
    );
  };

  const handleDeleteNote = (noteIndex) => {
    setProspects(prev =>
      prev.map(p => {
        if (p.id === contact.id) {
          const updatedNotes = [...p.notes];
          updatedNotes.splice(noteIndex, 1);
          return { ...p, notes: updatedNotes };
        }
        return p;
      })
    );
  };

  if (!contact) return <div>Prospect not found</div>;

  return (
    <ProspectNotesPage
      contact={contact}
      goBack={() => navigate('/prospects')}
      onAddNote={handleAddNote}
      onDeleteNote={handleDeleteNote}
    />
  );
}

function App() {
  const [contacts, setContacts] = useState([
    {
      id: 1,
      accountNumber: '100123456',
      name: 'Charred Oak Tavern',
      address: '123 Main St, Middleboro, MA',
      contacts: [
        { title: 'Chef', name: 'John Smith', phone: '555-1234', email: 'john@example.com' },
        { title: 'Manager', name: 'Sarah Jones', phone: '555-5678', email: 'sarah@example.com' }
      ],
      deliveryDays: ['Mon', 'Wed'],
      notes: [
        { text: 'Sampled new shrimp app.', category: 'Sample', timestamp: '6/21/2025, 2:00 PM' },
        { text: 'Manager said they want better pricing on wings.', category: 'Feedback', timestamp: '6/22/2025, 10:15 AM' }
      ]
    }
  ]);

  const [prospects, setProspects] = useState(() => {
    const saved = localStorage.getItem('crumb_prospects');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('crumb_prospects', JSON.stringify(prospects));
  }, [prospects]);

  const itinerary = useMemo(() => {
    const saved = localStorage.getItem('visitData');
    if (!saved) return {};

    const parsed = JSON.parse(saved);
    return parsed.reduce((acc, visit) => {
      const date = visit.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(visit);
      return acc;
    }, {});
  }, []);

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              onNavigate={(page) => {
                window.location.pathname = `/${page}`;
              }}
            />
          }
        />
        <Route path="/customers" element={<CustomersPage contacts={contacts} setContacts={setContacts} />} />
        <Route path="/notes/:id" element={<NotesWrapper contacts={contacts} setContacts={setContacts} />} />
        <Route path="/prospects" element={<ProspectsPage prospects={prospects} setProspects={setProspects} />} />
        <Route path="/prospect-notes/:id" element={<ProspectNotesWrapper prospects={prospects} setProspects={setProspects} />} />
        <Route path="/calendar" element={<CalendarPage />} /> {/* ✅ Using full calendar page again */}
        <Route path="/itinerary" element={<ItineraryPage contacts={contacts} itinerary={[]} />} />
      </Routes>
    </Router>
  );
}

export default App;
