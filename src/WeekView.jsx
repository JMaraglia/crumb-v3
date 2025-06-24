// --- WeekView.jsx ---
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './WeekView.css';

const hourLabels = Array.from({ length: 10 }, (_, i) => {
  const hour = i + 8;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${suffix}`;
});

const timeKeys = Array.from({ length: 10 }, (_, i) => (i + 8).toString().padStart(2, '0')); // '08', '09', ..., '17'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function WeekView({ itinerary }) {
  const navigate = useNavigate();

  const getDateOfCurrentWeekday = (weekday) => {
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay())); // Sunday
    const index = days.indexOf(weekday);
    return new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + index);
  };

  const getEventsForDayAndTime = (day, hourKey) => {
    return Object.values(itinerary).flat().filter((event) => {
      const eventDate = new Date(event.date);
      const [eventHour] = (event.time || '00:00').split(':');

      const calendarDate = getDateOfCurrentWeekday(day);
      const diffDays = Math.floor((calendarDate - eventDate) / (1000 * 60 * 60 * 24));
      const sameWeekday = calendarDate.getDay() === eventDate.getDay();
      const repeat = event.repeat || 'none';

      if (eventHour !== hourKey || !sameWeekday) return false;

      switch (repeat) {
        case 'none':
          return calendarDate.toDateString() === eventDate.toDateString();
        case 'weekly':
          return diffDays % 7 === 0 && diffDays >= 0;
        case 'biweekly':
          return diffDays % 14 === 0 && diffDays >= 0;
        case 'monthly':
          return calendarDate.getDate() === eventDate.getDate();
        default:
          return false;
      }
    });
  };

  const handleClick = (event) => {
    if (event.type === 'customer') {
      navigate(`/notes/${event.id}`);
    } else if (event.type === 'prospect') {
      navigate(`/prospect-notes/${event.id}`);
    }
  };

  return (
    <div className="week-view">
      <div className="week-header">
        <div className="time-column-header"></div>
        {days.map(day => (
          <div key={day} className="day-column-header">{day}</div>
        ))}
      </div>

      <div className="week-body">
        <div className="time-column">
          {hourLabels.map((label) => (
            <div key={label} className="time-slot">{label}</div>
          ))}
        </div>

        {days.map((day) => (
          <div key={day} className="day-column">
            {timeKeys.map((hourKey, idx) => {
              const events = getEventsForDayAndTime(day, hourKey);
              return (
                <div key={idx} className="calendar-cell">
                  {events.map((event, i) => (
                    <div
                      key={i}
                      className="event-entry"
                      onClick={() => handleClick(event)}
                      style={{
                        color: event.type === 'prospect' ? 'red' : 'black',
                        cursor: 'pointer',
                      }}
                    >
                      {event.time} – {event.title || 'Visit'}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default WeekView;