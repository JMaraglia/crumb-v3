// file: src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import './App.css';
import HomePage from './HomePage';
import CustomersPage from './CustomersPage';
import NotesPage from './NotesPage';
import ProspectsPage from './ProspectsPage';
import ProspectNotesPage from './ProspectNotesPage';
import CalendarPage from './CalendarPage';
import ItineraryPage from './ItineraryPage';

// Simple hook to sync state with localStorage
function usePersistedState(key, initialValue) {
  const [state, setState] = React.useState(() => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : initialValue;
  });

  React.useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState];
}

// Wrapper for notes (works for contacts or prospects)
function NotesWrapper({ items, setItems, pagePath, PageComponent }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = items.find(x => String(x.id) === id);

  const handleAddNote = (itemId, note, index = null) => {
    setItems(prev =>
      prev.map(x => {
        if (x.id === itemId) {
          const notes = [...x.notes];
          if (index !== null) notes[index] = note;
          else notes.push(note);
          return { ...x, notes };
        }
        return x;
      })
    );
  };

  const handleDeleteNote = (noteIndex) => {
    setItems(prev =>
      prev.map(x => {
        if (String(x.id) === id) {
          const notes = [...x.notes];
          notes.splice(noteIndex, 1);
          return { ...x, notes };
        }
        return x;
      })
    );
  };

  if (!item) return <div>{PageComponent.name} not found</div>;

  return (
    <PageComponent
      contact={item}
      goBack={() => navigate(pagePath)}
      onAddNote={handleAddNote}
      onDeleteNote={handleDeleteNote}
    />
  );
}

export default function App() {
  // Persisted contacts, prospects, and itinerary
  const [contacts, setContacts] = usePersistedState('crumb_contacts', [
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

  const [prospects, setProspects] = usePersistedState('crumb_prospects', []);
  const [itinerary, setItinerary] = usePersistedState('visitData', {});

  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/customers" element={<CustomersPage contacts={contacts} setContacts={setContacts} />} />
        <Route
          path="/notes/:id"
          element={
            <NotesWrapper
              items={contacts}
              setItems={setContacts}
              pagePath="/customers"
              PageComponent={NotesPage}
            />
          }
        />
        <Route path="/prospects" element={<ProspectsPage prospects={prospects} setProspects={setProspects} />} />
        <Route
          path="/prospect-notes/:id"
          element={
            <NotesWrapper
              items={prospects}
              setItems={setProspects}
              pagePath="/prospects"
              PageComponent={ProspectNotesPage}
            />
          }
        />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/itinerary" element={<ItineraryPage contacts={contacts} itinerary={itinerary} />} />
      </Routes>
    </Router>
  );
}