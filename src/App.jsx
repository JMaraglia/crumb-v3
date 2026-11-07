// file: src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import './App.css';
import HomePage from './HomePage';
import MasterNotesPage from './MasterNotesPage';
import CallSheetPage from './CallSheetPage';
import CustomersPage, { CustomerDetailPage, CustomerEditPage } from './CustomersPage';
import NotesPage from './NotesPage';
import ProspectsPage, { ProspectDetailPage, ProspectEditPage } from './ProspectsPage';
import ProspectNotesPage from './ProspectNotesPage';
import CalendarPage from './CalendarPage';
import ItineraryPage from './ItineraryPage';
import BackupPage from './BackupPage';
import TodoPage from './TodoPage';
import NotificationsPage from './NotificationsPage';
import SettingsPage from './SettingsPage';
// Loaded only when Cloud Test is opened, so the cloud library never slows down the rest of Crumb.
const CloudTestPage = React.lazy(() => import('./CloudTestPage'));
// Sync step S2: if "Record changes on this device" is switched on (Cloud Test), start noting changes.
startRecordingIfOn();
import { syncReminders, startReminderRefresh } from './notify';
import { startRecordingIfOn } from './outbox';
import { readSaved, writeSaved, withNoteIds, withStandardDates, changeNote, dropNote, upgradeStopIds, CUSTOMERS_KEY, PROSPECTS_KEY } from './store';

// Simple hook to sync state with saved data (reads and saves go through store.js, the front door).
function usePersistedState(key, initialValue) {
  // Unreadable data: an untouched copy is kept (never thrown away) and this screen starts empty.
  const [state, setState] = React.useState(() => readSaved(key, initialValue, { keepUnreadable: true, keepNull: true }));

  // Save only when something actually changes (opening the app never writes).
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    writeSaved(key, state); // a failed save shows the "couldn't save" banner
  }, [key, state]);

  return [state, setState];
}

// If a screen ever breaks, show a message instead of a blank page. Saved data isn't touched.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { broken: false };
  }
  static getDerivedStateFromError() {
    return { broken: true };
  }
  componentDidCatch(err) {
    console.error('Crumb screen error:', err); // eslint-disable-line no-console
  }
  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="app-error">
        <div className="app-error-title">Something went wrong on this screen.</div>
        <div className="app-error-text">Your saved customers, prospects and notes weren't changed.</div>
        <button className="app-error-btn" onClick={() => window.location.replace('/')}>
          Go to Home
        </button>
      </div>
    );
  }
}

// Red banner when a save fails (usually: this phone's storage for Crumb is full).
function NotificationTaps() {
  const navigate = useNavigate();
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const on = (e) => {
      const d = e.data || {};
      if (d.type === 'crumb-open' && typeof d.url === 'string' && d.url.startsWith('/')) navigate(d.url);
    };
    navigator.serviceWorker.addEventListener('message', on);
    return () => navigator.serviceWorker.removeEventListener('message', on);
  }, [navigate]);
  return null;
}

function SaveFailedBanner() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener('crumb-save-failed', on);
    return () => window.removeEventListener('crumb-save-failed', on);
  }, []);
  if (!show) return null;
  return (
    <div className="app-savefail" role="alert">
      <span>
        Crumb couldn't save your last change — this phone's storage for Crumb is full. Back up now (Settings → Backup &amp;
        Restore) and send me a message.
      </span>
      <button className="app-savefail-x" onClick={() => setShow(false)} aria-label="Close">
        ×
      </button>
    </div>
  );
}

// Adds { from, to, at } to a prospect's stageHistory whenever its stage changes (or it's added with one).
function withStageHistory(prev, next) {
  if (!Array.isArray(next)) return next;
  const before = new Map((Array.isArray(prev) ? prev : []).map((p) => [String(p && p.id), p]));
  const at = new Date().toISOString();
  return next.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const old = before.get(String(p.id));
    const from = old ? old.stage || null : null;
    const to = p.stage || null;
    if (from === to || (!old && !to)) return p;
    return { ...p, stageHistory: [...(Array.isArray(p.stageHistory) ? p.stageHistory : []), { from, to, at }] };
  });
}

// Wrapper for notes (works for contacts or prospects)
function NotesWrapper({ items, setItems, pagePath, PageComponent }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = items.find(x => String(x.id) === id);

  // ref = { id, index } of the note being changed (found by its ID tag); none = a new note.
  const handleAddNote = (itemId, note, ref = null) => {
    setItems(prev =>
      prev.map(x => {
        if (x.id === itemId) {
          const notes = [...(x.notes || [])];
          if (ref !== null) return { ...x, notes: changeNote(notes, ref, () => note) }; // keeps its ID tag
          notes.push(note);
          return { ...x, notes };
        }
        return x;
      })
    );
  };

  const handleDeleteNote = (ref) => {
    setItems(prev =>
      prev.map(x => {
        if (String(x.id) === id) return { ...x, notes: dropNote(x.notes || [], ref) };
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
  // One-time: very old hand-added Itinerary stops get a permanent ID tag. Runs before any screen
  // reads the stops (so nothing on screen holds an untagged copy). Saves nothing when all are tagged.
  React.useState(() => upgradeStopIds());
  // Persisted contacts, prospects, and itinerary
  const [contacts, setContactsRaw] = usePersistedState(CUSTOMERS_KEY, [
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

  const [prospects, setProspectsRaw] = usePersistedState(PROSPECTS_KEY, []);
  // Every prospect stage change is quietly logged on the prospect (stageHistory: [{ from, to, at }])
  // for a future Scoreboard. Nothing on screen changes.
  const setProspects = React.useCallback(
    (update) => setProspectsRaw((prev) => withNoteIds(withStageHistory(prev, typeof update === 'function' ? update(prev) : update))),
    [setProspectsRaw]
  );
  // Every note gets a permanent ID tag when saved (store.js → withNoteIds). Nothing on screen changes.
  const setContacts = React.useCallback(
    (update) => setContactsRaw((prev) => withNoteIds(typeof update === 'function' ? update(prev) : update)),
    [setContactsRaw]
  );
  // One-time upgrade: notes saved before Nov 6 get their tag. Does nothing (and saves nothing) once
  // every note has one, or when nothing has been saved yet.
  React.useEffect(() => {
    // (and old note times are converted to the standard format, original text kept — store.js)
    if (readSaved(CUSTOMERS_KEY, null)) setContactsRaw((prev) => withNoteIds(withStandardDates(prev)));
    if (readSaved(PROSPECTS_KEY, null)) setProspectsRaw((prev) => withNoteIds(withStandardDates(prev)));
  }, [setContactsRaw, setProspectsRaw]);

  // Sync step S4 (test copy only): changes from your other devices just arrived from the cloud.
  // Re-read customers and prospects, and redraw the screen so it shows the new data.
  const [pulledTick, setPulledTick] = React.useState(0);
  React.useEffect(() => {
    const onPulled = () => {
      setContactsRaw(readSaved(CUSTOMERS_KEY, [], { keepUnreadable: true, keepNull: true }));
      setProspectsRaw(readSaved(PROSPECTS_KEY, [], { keepUnreadable: true, keepNull: true }));
      setPulledTick((n) => n + 1);
    };
    window.addEventListener('crumb-pulled', onPulled);
    return () => window.removeEventListener('crumb-pulled', onPulled);
  }, [setContactsRaw, setProspectsRaw]);

  // Notifications: keep the server's reminder list fresh — when Crumb opens, when your
  // customers/prospects change, and when you leave the app. (Does nothing if they're off.)
  React.useEffect(() => {
    const t = setTimeout(() => syncReminders(), 2000);
    return () => clearTimeout(t);
  }, [contacts, prospects]);
  React.useEffect(() => {
    startReminderRefresh();
    const onVis = () => syncReminders(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <Router>
      <SaveFailedBanner />
      <NotificationTaps />
      <ErrorBoundary>
      <Routes key={pulledTick}>
        <Route path="/" element={<HomePage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/cloud-test" element={<React.Suspense fallback={null}><CloudTestPage /></React.Suspense>} />
        <Route
          path="/todo"
          element={
            <TodoPage contacts={contacts} setContacts={setContacts} prospects={prospects} setProspects={setProspects} />
          }
        />
        <Route path="/call-sheet" element={<CallSheetPage contacts={contacts} setContacts={setContacts} />} />
        <Route
          path="/notes"
          element={
            <MasterNotesPage
              contacts={contacts}
              setContacts={setContacts}
              prospects={prospects}
              setProspects={setProspects}
            />
          }
        />
        <Route path="/customers" element={<CustomersPage contacts={contacts} setContacts={setContacts} />} />
        <Route path="/customers/new" element={<CustomerEditPage contacts={contacts} setContacts={setContacts} isNew />} />
        <Route path="/customers/:id" element={<CustomerDetailPage contacts={contacts} setContacts={setContacts} />} />
        <Route path="/customers/:id/edit" element={<CustomerEditPage contacts={contacts} setContacts={setContacts} />} />
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
        <Route path="/prospects/new" element={<ProspectEditPage prospects={prospects} setProspects={setProspects} isNew />} />
        <Route
          path="/prospects/:id"
          element={
            <ProspectDetailPage
              prospects={prospects}
              setProspects={setProspects}
              contacts={contacts}
              setContacts={setContacts}
            />
          }
        />
        <Route
          path="/prospects/:id/edit"
          element={
            <ProspectEditPage
              prospects={prospects}
              setProspects={setProspects}
              contacts={contacts}
              setContacts={setContacts}
            />
          }
        />
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
        <Route path="/calendar" element={<CalendarPage contacts={contacts} prospects={prospects} />} />
        <Route
          path="/wrap-up"
          element={
            <ItineraryPage
              wrapUp
              contacts={contacts}
              setContacts={setContacts}
              prospects={prospects}
              setProspects={setProspects}
            />
          }
        />
        <Route
          path="/itinerary"
          element={
            <ItineraryPage
              contacts={contacts}
              setContacts={setContacts}
              prospects={prospects}
              setProspects={setProspects}
            />
          }
        />
      </Routes>
      </ErrorBoundary>
    </Router>
  );
}