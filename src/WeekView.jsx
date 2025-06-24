import React, { useState } from 'react';
import './CalendarPage.css';
import { FiArrowLeftCircle, FiArrowRightCircle, FiPlusCircle, FiSettings } from 'react-icons/fi';

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WeekView = () => {
  const [viewDays, setViewDays] = useState(3); // Default to 3-day view
  const [startIndex, setStartIndex] = useState(0);
  const [showGearMenu, setShowGearMenu] = useState(false);

  const handleNext = () => {
    setStartIndex((prev) => Math.min(prev + 1, 7 - viewDays));
  };

  const handlePrev = () => {
    setStartIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleGearClick = () => {
    setShowGearMenu((prev) => !prev);
  };

  const handleGearOption = (days) => {
    setViewDays(days);
    setStartIndex(0);
    setShowGearMenu(false);
  };

  const renderHourLabels = () => {
    const hours = [];
    for (let i = 0; i < 24; i++) {
      hours.push(
        <div key={i} className="time-slot">
          {`${i % 12 === 0 ? 12 : i % 12}:00 ${i < 12 ? 'AM' : 'PM'}`}
        </div>
      );
      hours.push(<div key={`half-${i}`} className="time-slot" />);
    }
    return hours;
  };

  const renderDayColumns = () => {
    return daysOfWeek.slice(startIndex, startIndex + viewDays).map((day, index) => (
      <div key={index} className="day-column">
        <div className="day-column-header">
          <div>{day}</div>
          <div>{new Date().toLocaleDateString()}</div>
        </div>
        {Array.from({ length: 48 }, (_, i) => (
          <div key={i} className="calendar-cell" />
        ))}
      </div>
    ));
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div className="calendar-back">
          <FiArrowLeftCircle size={20} />
          <span className="back-text">Back</span>
        </div>

        <div className="calendar-center">
          <button className="calendar-nav-arrow" onClick={handlePrev}>
            <FiArrowLeftCircle />
          </button>
          <h2 className="calendar-title">Calendar</h2>
          <button className="calendar-nav-arrow" onClick={handleNext}>
            <FiArrowRightCircle />
          </button>
        </div>

        <div className="gear-menu">
          <FiSettings className="calendar-gear" onClick={handleGearClick} />
          {showGearMenu && (
            <div className="gear-options">
              <div onClick={() => handleGearOption(3)}>3-Day View</div>
              <div onClick={() => handleGearOption(5)}>5-Day View</div>
              <div onClick={() => handleGearOption(7)}>7-Day View</div>
            </div>
          )}
        </div>
      </div>

      <div className="calendar-view-buttons">
        <button>Day</button>
        <button>Week</button>
        <button>Month</button>
      </div>

      <div className="week-view">
        <div className="week-header">
          <div className="time-column-header">Time</div>
          {daysOfWeek.slice(startIndex, startIndex + viewDays).map((day, i) => (
            <div key={i} className="day-column-header">
              <div>{day}</div>
              <div>{new Date().toLocaleDateString()}</div>
            </div>
          ))}
        </div>

        <div className="week-body">
          <div className="time-column">{renderHourLabels()}</div>
          {renderDayColumns()}
        </div>
      </div>

      <button className="plus-button">
        <FiPlusCircle size={32} />
      </button>
    </div>
  );
};

export default WeekView;
