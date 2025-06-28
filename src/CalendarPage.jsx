// file: src/CalendarPage.jsx
import React, { useState, useRef } from 'react';
import { FaArrowLeft, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeekView from './WeekView';

export default function CalendarPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('Week');
  const [viewStart, setViewStart] = useState(new Date(2025, 5, 22)); // Sunday, 6/22/2025
  const globalAddButton = useRef(null);

  const monthYear = viewStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const days = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(viewStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const prev3 = () =>
    setViewStart((d) => {
      d = new Date(d);
      d.setDate(d.getDate() - 3);
      return d;
    });

  const next3 = () =>
    setViewStart((d) => {
      d = new Date(d);
      d.setDate(d.getDate() + 3);
      return d;
    });

  const triggerGlobalAdd = () => {
    const evt = new CustomEvent('calendar:addGlobalEvent');
    window.dispatchEvent(evt);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button onClick={() => navigate(-1)} className="text-xl text-gray-700">
          <FaArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Calendar</h1>
        <button className="text-xl text-gray-700">
          <FaCog />
        </button>
      </header>

      {/* View Mode Switch */}
      <div className="flex justify-center bg-gray-50 py-2">
        {['Day', 'Week', 'Month'].map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`mx-1 px-4 py-1 rounded text-sm ${
              viewMode === mode
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Month Display */}
      <div className="text-center font-semibold my-2 text-base">
        {monthYear}
      </div>

      {/* Subheader with dates */}
      <div className="flex items-center justify-center gap-4 py-2 border-b border-gray-200">
        <button onClick={prev3} className="text-lg text-gray-600">
          &lt;
        </button>
        {days.map((d, i) => (
          <div key={i} className="text-center min-w-[80px]">
            <div className="font-medium">
              {d.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div>
              {d.getMonth() + 1}/{d.getDate()}/{d.getFullYear()}
            </div>
          </div>
        ))}
        <button onClick={next3} className="text-lg text-gray-600">
          &gt;
        </button>
      </div>

      {/* Calendar Body */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'Week' ? (
          <WeekView viewStart={viewStart} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            {viewMode} View Coming Soon
          </div>
        )}
      </div>

      {/* Floating + Add */}
      <button
        ref={globalAddButton}
        onClick={triggerGlobalAdd}
        className="fixed bottom-5 right-5 w-12 h-12 rounded-full bg-blue-600 text-white text-2xl shadow-md"
      >
        +
      </button>
    </div>
  );
}
