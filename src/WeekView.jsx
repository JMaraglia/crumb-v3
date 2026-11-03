// file: src/WeekView.jsx
import React, { useState } from 'react';
import './WeekView.css';

export default function WeekView({ viewStart }) {
  const days = Array.from({ length:3 }, (_,i) => {
    const d = new Date(viewStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const slots = Array.from({ length:24*12 }, (_,i) => i*5);
  const [events, setEvents] = useState([]);

  const addEvent = (day, min) => {
    const title = prompt('Title:'); if(!title) return;
    const dur = parseInt(prompt('Duration (min):'),10); if(!dur) return;
    const color = '#3498db';
    const key = day.toDateString();
    setEvents(prev => [...prev, { id:Date.now(), date:key, start:min, duration:dur, title, color }]);
  };

  return (
    <div className="wv-container">
      <div className="wv-times">
        {slots.map(min=>{
          const h=Math.floor(min/60), m=min%60;
          const label = m===0?`${h===0?12:h>12?h-12:h}:00 ${h<12?'AM':'PM'}`:'';
          return <div key={min} className="wv-time-cell">{label}</div>;
        })}
      </div>
      <div className="wv-days">
        {days.map(day=>{
          const key = day.toDateString();
          const dayEv = events.filter(e=>e.date===key);
          return (
            <div key={key} className="wv-day-col">
              <div className="wv-day-header">
                <div>{day.toLocaleDateString('en-US',{weekday:'short'})}</div>
                <div>{day.getMonth()+1}/{day.getDate()}</div>
              </div>
              {slots.map(min=> <div key={min} className="wv-slot" onClick={()=>addEvent(day,min)}/> )}
              {dayEv.map(ev=>(
                <div key={ev.id} className="wv-event" style={{ top:(ev.start/5)*30+'px', height:(ev.duration/5)*30+'px', backgroundColor:ev.color }}>
                  {ev.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}