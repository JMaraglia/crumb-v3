import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './WeekView.css';

const hourLabels = Array.from({ length: 18 }, (_, i) => {
  const hour = 8 + Math.floor(i / 2);
  const minutes = i % 2 === 0 ? '00' : '30';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${suffix}`;
});

const timeKeys = Array.from({ length: 18 }, (_, i) => {
  const hour = 8 + Math.floor(i / 2);
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
});

const days = ['Sunday', 'Monday', 'Tuesday'];

function WeekView({ itinerary = {}, customEvents = [], onEdit, onDoubleClick }) {
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);

  const getStartOfWeek = () => {
    const base = new Date();
    base.setDate(base.getDate() - base.getDay() + weekOffset * 7);
    base.setHours(0, 0, 0, 0);
    return base;
  };

  const getDateOfCurrentWeekday = (weekday) => {
    const startOfWeek = getStartOfWeek();
    const index = days.indexOf(weekday);
    return new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + index);
  };

  const getEventsForDay = (day) => {
    const calendarDate = getDateOfCurrentWeekday(day);

    const filterEvents = (events) => {
      return events.filter((event) => {
        const eventDate = new Date(event.date);
        const diffDays = Math.floor((calendarDate - eventDate) / (1000 * 60 * 60 * 24));
        const sameWeekday = calendarDate.getDay() === eventDate.getDay();
        const repeat = event.repeat || 'none';

        if (!sameWeekday) return false;

        switch (repeat) {
          case 'none':
            return calendarDate.toDateString() === eventDate.toDateString();
          case 'weekly':
            return diffDays % 7 === 0 && diffDays >= 0;
          case 'biweekly':
            return diffDays % 14 === 0 && diffDays >= 0;
          case 'monthly':
            return calendarDate.getDate() === eventDate.getDate();
          case 'daily':
            return diffDays >= 0;
          default:
            return false;
        }
      });
    };

    return [
      ...filterEvents(Object.values(itinerary).flat()),
      ...filterEvents(customEvents)
    ];
  };

  const handleClick = (event) => {
    if (event.type === 'customer') {
      navigate(`/notes/${event.id}`);
    } else if (event.type === 'prospect') {
      navigate(`/prospect-notes/${event.id}`);
    } else {
      onEdit && onEdit(event);
    }
  };

  const renderEvents = (events, hourKey) => {
    return events
      .filter((event) => event.time === hourKey)
      .map((event, i) => {
        return (
          <div
            key={i}
            className="event-entry"
            style={{
              top: `${i * 52}px`,
              height: `48px`,
              backgroundColor: event.color || '#007bff',
              color: 'white',
            }}
            onClick={() => handleClick(event)}
            onDoubleClick={() => onDoubleClick && onDoubleClick(event)}
          >
            {event.name || 'Unnamed Event'}
          </div>
        );
      });
  };

  const startOfWeek = getStartOfWeek();

  return (
    <div className="week-view">
      {/* Top Nav with Arrows and Back */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px' }}>
        <span className="calendar-nav-arrow" onClick={() => navigate(-1)}>
          ← <span style={{ fontSize: '1rem', marginLeft: '4px' }}>Back</span>
        </span>
        <div>
          <span
            className="calendar-nav-arrow"
            onClick={() => setWeekOffset(prev => prev - 1)}
            style={{ marginRight: '20px' }}
          >
            ←
          </span>
          <span
            className="calendar-nav-arrow"
            onClick={() => setWeekOffset(prev => prev + 1)}
          >
            →
          </span>
        </div>
      </div>

      {/* Day Headers */}
      <div className="week-header">
        <div className="time-column-header"></div>
        {days.map((day, idx) => {
          const currentDate = new Date(startOfWeek);
          currentDate.setDate(currentDate.getDate() + idx);
          return (
            <div key={day} className="day-column-header">
              <div>{day}</div>
              <div>{`${(currentDate.getMonth() + 1)}/${currentDate.getDate()}/${currentDate.getFullYear()}`}</div>
            </div>
          );
        })}
      </div>

      {/* Calendar Grid */}
      <div className="week-body">
        <div className="time-column">
          {hourLabels.map((label, idx) => (
            <div key={idx} className="time-slot">
              {label}
            </div>
          ))}
        </div>
        {days.map((day, idx) => {
          const events = getEventsForDay(day);
          return (
            <div key={idx} className="day-column">
              {timeKeys.map((hourKey, i) => {
                const currentDate = new Date(startOfWeek);
                currentDate.setDate(currentDate.getDate() + idx);
                const dateString = currentDate.toISOString().split('T')[0];

                return (
                  <div
                    key={i}
                    className="calendar-cell"
                    onDoubleClick={() =>
                      onDoubleClick &&
                      onDoubleClick({
                        date: dateString,
                        time: hourKey,
                        name: '',
                      })
                    }
                  >
                    {renderEvents(events, hourKey)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WeekView;
