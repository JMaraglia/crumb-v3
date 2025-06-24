// --- WeekView.jsx ---
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
    const baseSunday = new Date(2024, 5, 22); // Sunday June 22, 2024
    baseSunday.setDate(baseSunday.getDate() + 7 * weekOffset);
    return baseSunday;
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
            onClick={() => handleClick(event)}
            style={{
              backgroundColor: event.color || '#f0f0f0',
              color: event.type === 'prospect' ? 'red' : 'black',
              height: `${duration * 100}%`,
            }}
            title={event.notes || ''}
          >
            {event.time} – {event.name || event.title || 'Visit'}
            {event.location && (
              <div>
                <a
                  href={`https://www.google.com/maps/search/?q=${encodeURIComponent(event.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.65rem', color: '#007bff', textDecoration: 'underline' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {event.location}
                </a>
              </div>
            )}
          </div>
        );
      });
  };

  const renderDayHeaders = () => {
    const startOfWeek = getStartOfWeek();
    return days.map((day, i) => {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      const label = `${day} ${date.getMonth() + 1}/${date.getDate()}`;
      return (
        <div key={day} className="day-column-header">{label}</div>
      );
    });
  };

  return (
    <div className="week-view">
      <div className="week-header">
        <div className="time-column-header"></div>
        <div className="nav-arrow" onClick={() => setWeekOffset(weekOffset - 1)}>←</div>
        {renderDayHeaders()}
        <div className="nav-arrow" onClick={() => setWeekOffset(weekOffset + 1)}>→</div>
      </div>

      <div className="week-body">
        <div className="time-column">
          {hourLabels.map((label) => (
            <div key={label} className="time-slot">{label}</div>
          ))}
        </div>

        {days.map((day) => {
          const events = getEventsForDay(day);

          return (
            <div key={day} className="day-column">
              {timeKeys.map((hourKey, idx) => (
                <div
                  key={idx}
                  className="calendar-cell"
                  onDoubleClick={() => onDoubleClick && onDoubleClick(day, hourKey)}
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