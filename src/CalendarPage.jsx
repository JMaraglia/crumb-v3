import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CalendarPage.css';

function CalendarPage({ itinerary }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [dailyNotes, setDailyNotes] = useState({});
  const [newNote, setNewNote] = useState('');
  const [customEvents, setCustomEvents] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventNotes, setNewEventNotes] = useState('');
  const navigate = useNavigate();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  const startDay = startOfMonth.getDay();
  const totalDays = endOfMonth.getDate();

  const calendarDays = [];
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= totalDays; i++) calendarDays.push(new Date(year, month, i));

  const handleDateClick = (date) => setSelectedDate(date);

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getDateKey = (date) => date.toISOString().split('T')[0];

  const getEventsForDate = (date) => {
    const key = getDateKey(date);
    const itineraryEvents = itinerary[key] || [];
    const custom = customEvents[key] || [];
    const allEvents = [...itineraryEvents, ...custom];

    return allEvents.sort((a, b) => {
      const getTimeValue = (e) => {
        if (!e.time) return 999999; // Put untimed events last
        const [hour, min] = e.time.match(/\d+/g).map(Number);
        const isPM = e.time.toLowerCase().includes('pm');
        return (hour % 12 + (isPM ? 12 : 0)) * 60 + min;
      };
      return getTimeValue(a) - getTimeValue(b);
    });
  };

  const handleSaveNote = () => {
    if (selectedDate && newNote.trim()) {
      const key = getDateKey(selectedDate);
      setDailyNotes(prev => ({ ...prev, [key]: newNote }));
      setNewNote('');
    }
  };

  const handleAddEventClick = () => {
    if (!selectedDate) return alert('Select a date first');
    setShowAddModal(true);
  };

  const handleAddCustomEvent = () => {
    if (!newEventName.trim()) return;

    const key = getDateKey(selectedDate);
    const newEvent = { name: newEventName, notes: newEventNotes };

    setCustomEvents(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), newEvent]
    }));

    setNewEventName('');
    setNewEventNotes('');
    setShowAddModal(false);
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button onClick={goToPrevMonth}>&lt;</button>
        <h2>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={goToNextMonth}>&gt;</button>
      </div>

      <div className="calendar-grid">
        {calendarDays.map((day, index) => (
          <div
            key={index}
            className={`calendar-day
              ${day && selectedDate?.toDateString() === day.toDateString() ? 'selected' : ''}
              ${day && isToday(day) ? 'today' : ''}`}
            onClick={() => day && handleDateClick(day)}
          >
            <div>{day ? day.getDate() : ''}</div>
            {day && getEventsForDate(day).length > 0 && <div className="dot"></div>}
          </div>
        ))}
      </div>

      <div className="calendar-controls">
        <button onClick={() => navigate('/')} className="back-button">← Back</button>
        <button onClick={handleAddEventClick} className="add-button">+ Add Event</button>
      </div>

      <div className="event-list">
        {selectedDate && (
          <>
            <h3>Events for {selectedDate.toDateString()}</h3>
            <ul>
              {getEventsForDate(selectedDate).map((event, idx) => (
                <li key={idx}>
                  <strong>
                    {event.time ? `${event.time} – ` : ''}
                    {event.name || event.title || 'Visit'}
                  </strong>
                  {event.notes && <div className="event-note">📝 {event.notes}</div>}
                </li>
              ))}
            </ul>

            <div className="notes-box">
              <h4>Notes for the Day</h4>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Type your note here..."
              />
              <button onClick={handleSaveNote}>Save Note</button>
              {dailyNotes[getDateKey(selectedDate)] && (
                <div className="saved-note">
                  <strong>Saved:</strong> {dailyNotes[getDateKey(selectedDate)]}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Add Event</h3>
            <input
              type="text"
              placeholder="Event name"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
            />
            <textarea
              placeholder="Event notes (optional)"
              value={newEventNotes}
              onChange={(e) => setNewEventNotes(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={handleAddCustomEvent}>Save</button>
              <button onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;