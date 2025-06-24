// --- CalendarPage.jsx ---
import React, { useState } from 'react';
import './CalendarPage.css';
import WeekView from './WeekView';

function DayView() {
  return (
    <div className="calendar-placeholder">
      Day View (Coming Soon)
    </div>
  );
}

function MonthView() {
  return (
    <div className="calendar-placeholder">
      Month View (Coming Soon)
    </div>
  );
}

function CalendarPage({ itinerary }) {
  const [view, setView] = useState('week');
  const [showAddModal, setShowAddModal] = useState(false);
  const [customEvents, setCustomEvents] = useState([]);
  const [eventData, setEventData] = useState({
    name: '',
    notes: '',
    location: '',
    color: '#3498db',
    repeat: 'none',
    date: '',
    time: '08:00',
  });

  const colorOptions = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#34495e', '#e67e22', '#7f8c8d', '#fd79a8'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEventData(prev => ({ ...prev, [name]: value }));
  };

  const addEvent = () => {
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
    setShowAddModal(false);
    setEventData({
      name: '',
      notes: '',
      location: '',
      color: '#3498db',
      repeat: 'none',
      date: '',
      time: '08:00',
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
        return <WeekView itinerary={itinerary} customEvents={customEvents} />;
    }
  };

  return (
    <div className="calendar-container">
      <h1 className="calendar-title">Calendar</h1>
      <div className="calendar-toggle">
        <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day</button>
        <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
        <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
        <button className="add-event-button" onClick={() => setShowAddModal(true)}>+ Event</button>
      </div>

      {renderView()}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Add Calendar Event</h2>
            <input name="name" placeholder="Event Title" value={eventData.name} onChange={handleInputChange} />
            <input name="date" type="date" value={eventData.date} onChange={handleInputChange} />
            <input name="time" type="time" value={eventData.time} onChange={handleInputChange} />
            <input name="location" placeholder="Location (Optional)" value={eventData.location} onChange={handleInputChange} />
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
              <button onClick={addEvent}>Add</button>
              <button onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;