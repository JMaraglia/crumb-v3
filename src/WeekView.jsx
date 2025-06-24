import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './WeekView.css';

const hourLabels = Array.from({ length: 10 }, (_, i) => {
  const hour = i + 8;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${suffix}`;
});

const timeKeys = Array.from({ length: 10 }, (_, i) => (i + 8).toString().padStart(2, '0'));

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function WeekView({ itinerary = {}, customEvents = [], onEdit, onDoubleClick }) {
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);

  const getStartOfWeek = () => {
    const base = new Date(2025, 5, 22);
    base.setDate(base.getDate() + weekOffset * 7);
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
      .filter((event) => {
        const [startHour] = (event.time || '00:00').split(':');
        return startHour === hourKey;
      })
      .map((event, i) => {
        const [startHour] = (event.time || '00:00').split(':');
        const [endHour] = (event.endTime || event.time || '00:00').split(':');
        const duration = Math.max(1, parseInt(endHour) - parseInt(startHour));

        return (
          <div
            key={i}
            className="event-entry"
            style={{
              top: `${i * 52}px`,
              height: `${duration * 48}px`,
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
      {/* ← Back Arrow */}
      <div style={{ padding: '10px 20px' }}>
        <span
          className="nav-arrow"
          onClick={() => navigate(-1)}
        >
          ← <span className="back-text">Back</span>
        </span>
      </div>

      {/* Day Headers */}
      <div className="week-header">
        <div className="time-column-header"></div>
        {days.map((day, idx) => {
          const currentDate = new Date(startOfWeek);
          currentDate.setDate(currentDate.getDate() + idx);
          return (
            <div key={day} className="day-column-header">
              <div style={{ fontWeight: 'bold' }}>{day}</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>
                {`${(currentDate.getMonth() + 1)}/${currentDate.getDate()}/${currentDate.getFullYear()}`}
              </div>
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
              {timeKeys.map((hourKey, i) => (
                <div
                  key={i}
                  className="calendar-cell"
                  onDoubleClick={() => {
                    const currentDate = new Date(startOfWeek);
                    currentDate.setDate(currentDate.getDate() + idx);
                    const dateString = currentDate.toISOString().split('T')[0];
                    const hour = hourKey.padStart(2, '0') + ':00';

                    onDoubleClick &&
                      onDoubleClick({
                        date: dateString,
                        time: hour,
                        name: '',
                      });
                  }}
                >
                  {renderEvents(events, hourKey)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WeekView;
