import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function ItineraryPage({ itinerary }) {
  const navigate = useNavigate();
  const today = new Date();

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const isWeekend = (dateStr) => {
    const day = new Date(dateStr + 'T00:00').getDay();
    return day === 0 || day === 6;
  };

  const getNextWeekday = (date) => {
    let d = new Date(date);
    while (isWeekend(d.toISOString().split('T')[0])) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  };

  const addRecurringVisits = (visit, frequency) => {
    const frequencyDays = {
      weekly: 7,
      biweekly: 14,
      monthly: 30,
      bimonthly: 60,
      quarterly: 90,
    };

    const interval = frequencyDays[frequency];
    if (!interval) return [];

    const startDate = new Date(visit.date);
    const futureVisits = [];

    for (let i = 1; i <= 12; i++) {
      const nextDate = new Date(startDate);
      nextDate.setDate(startDate.getDate() + interval * i);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      if (!isWeekend(nextDateStr)) {
        futureVisits.push({ ...visit, date: nextDateStr, done: false });
      }
    }
    return futureVisits;
  };

  const [editMode, setEditMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    isWeekend(today.toISOString().split('T')[0])
      ? getNextWeekday(today)
      : today.toISOString().split('T')[0]
  );
  const [visitData, setVisitData] = useState(() => {
    const saved = localStorage.getItem('visitData');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const enhanced = itinerary.map((visit) => ({
      ...visit,
      done: visit.done || false,
      recurrence: visit.recurrence || 'none',
      type: visit.type || 'contact',
      name: visit.name || '',
    }));
    setVisitData((prev) => (prev.length > 0 ? prev : enhanced));
  }, [itinerary]);

  const handleSave = () => {
    localStorage.setItem('visitData', JSON.stringify(visitData));
    alert('Itinerary saved!');
  };

  const handleToggleDone = (index) => {
    const updated = [...visitData];
    updated[index].done = !updated[index].done;
    setVisitData(updated);
  };

  const handleAddVisit = (time) => {
    setVisitData([
      ...visitData,
      {
        name: '',
        time,
        date: selectedDate,
        done: false,
        recurrence: 'none',
        type: 'contact',
      },
    ]);
  };

  const handleDeleteVisit = (index) => {
    const updated = [...visitData];
    updated.splice(index, 1);
    setVisitData(updated);
  };

  const handleChange = (index, field, value) => {
    const updated = [...visitData];
    const visit = updated[index];
    visit[field] = value;

    if (field === 'recurrence' && value !== 'none') {
      const recurring = addRecurringVisits(visit, value);
      const combined = [...updated, ...recurring];
      setVisitData(combined);
      localStorage.setItem('visitData', JSON.stringify(combined)); // ✅ save immediately
    } else {
      setVisitData(updated);
    }
  };

  const visitsForSelectedDate = visitData
    .filter((v) => v.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  const to12HourFormat = (time) => {
    const [hourStr, minute] = time.split(':');
    const h = parseInt(hourStr, 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:${minute} ${suffix}`;
  };

  const timeSlots = Array.from({ length: 22 }, (_, i) => {
    const hour = 7 + Math.floor(i / 2);
    const minute = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${minute}`;
  });

  return (
    <div className="itinerary-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{formatDate(selectedDate)}</h2>
        <div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const newDate = e.target.value;
              if (!isWeekend(newDate)) setSelectedDate(newDate);
            }}
          />
          <button onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Done Editing' : 'Edit'}
          </button>
          <button onClick={handleSave}>Save</button>
          <button onClick={() => navigate('/')}>Back</button>
        </div>
      </div>

      {timeSlots.map((slot) => {
        const visit = visitsForSelectedDate.find((v) => v.time === slot);
        const index = visitData.findIndex((v) => v.time === slot && v.date === selectedDate);

        return (
          <div key={slot} style={{ borderTop: '1px solid #ccc', padding: '16px 0' }}>
            <strong style={{ marginRight: '10px' }}>{to12HourFormat(slot)}</strong>
            {visit ? (
              <>
                {editMode ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      marginTop: '6px',
                    }}
                  >
                    <div>
                      <label>Type: </label>
                      <select
                        value={visit.type}
                        onChange={(e) => handleChange(index, 'type', e.target.value)}
                      >
                        <option value="contact">Contact</option>
                        <option value="prospect">Prospect</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder={
                        visit.type === 'contact'
                          ? 'Enter contact name'
                          : 'Enter prospect name'
                      }
                      value={visit.name}
                      onChange={(e) => handleChange(index, 'name', e.target.value)}
                    />
                    <div>
                      <label>Repeat: </label>
                      <select
                        value={visit.recurrence}
                        onChange={(e) => handleChange(index, 'recurrence', e.target.value)}
                      >
                        <option value="none">None</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="bimonthly">Bi-Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </select>
                      <button
                        onClick={() => handleDeleteVisit(index)}
                        style={{ marginLeft: '10px' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={visit.done}
                        onChange={() => handleToggleDone(index)}
                      />{' '}
                      Done
                    </label>
                    <div style={{ fontWeight: 'bold', marginTop: '4px' }}>
                      {visit.name || '(No Name Entered)'}
                    </div>
                  </>
                )}
              </>
            ) : (
              editMode && <button onClick={() => handleAddVisit(slot)}>+ Add Visit</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ItineraryPage;