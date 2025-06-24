import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CalendarPage.css';
import WeekView from './WeekView';

function DayView() {
  return <div className="calendar-placeholder">Day View (Coming Soon)</div>;
}

function MonthView() {
  return <div className="calendar-placeholder">Month View (Coming Soon)</div>;
}

function CalendarPage({ itinerary }) {
  const navigate = useNavigate();
  const [view, setView] = useState('week');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [customEvents, setCustomEvents] = useState([]);
  const [eventData, setEventData] = useState({
    name: '',
    notes: '',
    location: '',
    color: '#3498db',
    repeat: 'none',
    date: '',
    time: '08:00',
    endTime: '09:00',
  });

  const colorOptions = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#34495e', '#e67e22', '#7f8c8d', '#fd79a8'
  ];

  const allLocations = Array.from(
    new Set(
      [...customEvents.map(ev => ev.location), eventData.location].filter(Boolean)
    )
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEventData(prev => ({ ...prev, [name]: value }));
  };

  const openModalToEdit = (event) => {
    setEditingEvent(event);
    setEventData(event);
    setShowAddModal(true);
  };

  const checkOverlap = (startTime, endTime, date, ignoreId = null) => {
    const toMinutes = (time) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);

    return customEvents.some(ev => {
      if (ignoreId && ev.id === ignoreId) return false;
      if (ev.date !== date) return false;

      const evStart = toMinutes(ev.time);
      const evEnd = toMinutes(ev.endTime);

      return newStart < evEnd && newEnd > evStart;
    });
  };

  const addOrUpdateEvent = () => {
    const isOverlap = checkOverlap(eventData.time, eventData.endTime, eventData.date, editingEvent?.id);

    if (isOverlap && !window.confirm("You already have a meeting scheduled for that time. Proceed anyway?")) return;

    if (editingEvent) {
      setCustomEvents(prev =>
        prev.map(ev => (ev.id === editingEvent.id ? { ...eventData, id: ev.id } : ev))
      );
    } else {
      const baseEvent = { ...eventData };
      const addedEvents = [];
      const dateObj = new Date(baseEvent.date);
      const repeatType = baseEvent.repeat;

      for (let i = 0; i < (repeatType === 'none' ? 1 : 12); i++) {
        const newDate = new Date(dateObj);
        if (repeatType === 'weekly') newDate.setDate(dateObj.getDate() + 7 * i);
        else if (repeatType === 'biweekly') newDate.setDate(dateObj.getDate() + 14 * i);
        else if (repeatType === 'monthly') newDate.setMonth(dateObj.getMonth() + i);
        else if (repeatType === 'daily') newDate.setDate(dateObj.getDate() + i);

        addedEvents.push({
          ...baseEvent,
          id: Date.now() + i,
          date: newDate.toISOString().split('T')[0]
        });

        if (repeatType === 'none') break;
      }

      setCustomEvents(prev => [...prev, ...addedEvents]);
    }

    setShowAddModal(false);
    setEditingEvent(null);
    setEventData({
      name: '',
      notes: '',
      location: '',
      color: '#3498db',
      repeat: 'none',
      date: '',
      time: '08:00',
      endTime: '09:00',
    });
  };

  const renderView = () => {
    switch (view) {
      case 'day':
        return <DayView />;
      case 'month':
        return <MonthView />;
      case 'week':
      default:
        return (
          <WeekView
            itinerary={itinerary}
            customEvents={customEvents}
            onEdit={(event) => {
              openModalToEdit(event);
            }}
            onDoubleClick={(day, hour) => {
              const today = new Date();
              const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
              const targetDate = new Date(startOfWeek.setDate(startOfWeek.getDate() + ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(day)));
              const formattedDate = targetDate.toISOString().split('T')[0];

              setEventData(prev => ({
                ...prev,
                date: formattedDate,
                time: `${hour}:00`,
                endTime: `${parseInt(hour) + 1}:00`
              }));
              setEditingEvent(null);
              setShowAddModal(true);
            }}
          />
        );
    }
  };

  return (
    <div className="calendar-container">
      <button className="back-arrow" onClick={() => navigate(-1)}>←</button>
      <h1 className="calendar-title">Calendar</h1>
      <div className="calendar-toggle">
        <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day</button>
        <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
        <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
        <button className="add-event-button" onClick={() => {
          setEditingEvent(null);
          setShowAddModal(true);
        }}>+ Event</button>
      </div>

      {renderView()}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingEvent ? 'Edit' : 'Add'} Calendar Event</h2>
            <input name="name" placeholder="Event Title" value={eventData.name} onChange={handleInputChange} />
            <input name="date" type="date" value={eventData.date} onChange={handleInputChange} />
            <input name="time" type="time" value={eventData.time} onChange={handleInputChange} />
            <input name="endTime" type="time" value={eventData.endTime} onChange={handleInputChange} />
            <input
              name="location"
              placeholder="Location (Optional)"
              value={eventData.location}
              onChange={handleInputChange}
              list="location-suggestions"
            />
            <datalist id="location-suggestions">
              {allLocations.map((loc, i) => (
                <option key={i} value={loc} />
              ))}
            </datalist>
            <textarea name="notes" placeholder="Notes (Optional)" value={eventData.notes} onChange={handleInputChange} />

            <label>Repeat</label>
            <select name="repeat" value={eventData.repeat} onChange={handleInputChange}>
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>

            <label>Color</label>
            <div className="color-options">
              {colorOptions.map((color) => (
                <span
                  key={color}
                  title={color}
                  style={{
                    backgroundColor: color,
                    border: eventData.color === color ? '3px solid black' : '1px solid #ccc'
                  }}
                  className="color-dot"
                  onClick={() => setEventData(prev => ({ ...prev, color }))}
                />
              ))}
            </div>

            <div className="modal-buttons">
              <button onClick={addOrUpdateEvent}>{editingEvent ? 'Update' : 'Add'}</button>
              <button onClick={() => {
                setShowAddModal(false);
                setEditingEvent(null);
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;