// --- WeekView.jsx ---
import React from 'react';
import './WeekView.css';
import { useNavigate } from 'react-router-dom';

const hours = Array.from({ length: 11 }, (_, i) => `${i + 8}:00`);
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function WeekView({ itinerary }) {
  const navigate = useNavigate();

  const getDateOfCurrentWeekday = (weekday) => {
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const index = days.indexOf(weekday);
    return new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + index);
  };

  const getEventsForDayAndTime = (day, hour) => {
    return Object.values(itinerary).flat().filter((event) => {
      const eventDate = new Date(event.date);
      const eventTime = event.time || "00:00";
      const [eventHour] = eventTime.split(':');

      const calendarDate = getDateOfCurrentWeekday(day);
      const matchesHour = hour.startsWith(eventHour.padStart(2, '0'));
      const sameWeekday = calendarDate.getDay() === eventDate.getDay();
      const diffDays = Math.floor((calendarDate - eventDate) / (1000 * 60 * 60 * 24));
      const repeat = event.repeat || 'none';

      if (!matchesHour || !sameWeekday) return false;

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
    const type = event.prospect ? 'prospect' : 'customer';
    const path = `/${type}/${event.accountNumber}`;
    navigate(path);
  };

  return (
    <div className="week-view">
      <div className="week-header">
        <div className="time-column-header"></div>
        {days.map(day => (
          <div key={day} className="day-column-header">
            {day}
          </div>
        ))}
      </div>

      <div className="week-body">
        <div className="time-column">
          {hours.map(hour => (
            <div key={hour} className="time-slot">
              {hour}
            </div>
          ))}
        </div>

        {days.map(day => (
          <div key={day} className="day-column">
            {hours.map(hour => {
              const events = getEventsForDayAndTime(day, hour);
              return (
                <div key={hour} className="calendar-cell">
                  {events.map((event, i) => (
                    <div
                      key={i}
                      className="event-entry"
                      onClick={() => handleClick(event)}
                      style={{ cursor: 'pointer' }}
                    >
                      {event.title || 'Visit'}
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