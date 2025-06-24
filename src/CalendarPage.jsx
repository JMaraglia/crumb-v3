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
  const [newEventTime, setNewEventTime] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);

  const navigate = useNavigate();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  const startDay = startOfMonth.getDay();
  const totalDays = endOfMonth.getDate();

  const calendarDays = [];
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    calendarDays.push(new Date(year, month, i));
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (day) => {
    setSelectedDate(day);
    setShowAddModal(true);
    setEditingEvent(null);
    setNewEventName('');
    setNewEventNotes('');
    setNewEventTime('');
  };

  const handleEditEvent = (event, date) => {
    setEditingEvent({ ...event, date });
    setNewEventName(event.name);
    setNewEventNotes(event.notes);
    setNewEventTime(event.time || '');
    setSelectedDate(date);
    setShowAddModal(true);
  };

  const addOrUpdateEvent = () => {
    if (!newEventName.trim()) return;

    const dateKey = selectedDate.toDateString();
    const newEvent = {
      name: newEventName,
      notes: newEventNotes,
      time: newEventTime,
    };

    setCustomEvents((prev) => {
      const updated = { ...prev };
      const events = updated[dateKey] || [];

      if (editingEvent) {
        events[editingEvent.index] = newEvent;
      } else {
        events.push(newEvent);
      }

      updated[dateKey] = events;
      return updated;
    });

    setShowAddModal(false);
    setNewEventName('');
    setNewEventNotes('');
    setNewEventTime('');
    setEditingEvent(null);
  };

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <button onClick={handlePrevMonth}>&lt;</button>
        <h2>{currentDate.toLocaleString('default', { month: 'long' })} {year}</h2>
        <button onClick={handleNextMonth}>&gt;</button>
      </div>

      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="calendar-day-header">{day}</div>
        ))}

        {calendarDays.map((day, index) => (
          <div
            key={index}
            className={`calendar-day ${day ? '' : 'empty-day'}`}
            onClick={() => day && handleDayClick(day)}
          >
            {day && <div>{day.getDate()}</div>}
            {day && customEvents[day.toDateString()]?.map((event, i) => (
              <div
                key={i}
                className="calendar-event"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditEvent({ ...event, index: i }, day);
                }}
              >
                <strong>{event.name}</strong> {event.time && <em>({event.time})</em>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingEvent ? 'Edit Event' : 'Add Event'} - {selectedDate?.toDateString()}</h3>
            <input
              type="text"
              placeholder="Event Name"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Time (e.g. 2:30 PM)"
              value={newEventTime}
              onChange={(e) => setNewEventTime(e.target.value)}
            />
            <textarea
              placeholder="Notes"
              value={newEventNotes}
              onChange={(e) => setNewEventNotes(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={addOrUpdateEvent}>
                {editingEvent ? 'Update' : 'Add'} Event
              </button>
              <button onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
