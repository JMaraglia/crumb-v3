// file: src/WeekView.jsx
import React, { useState, useRef, useEffect } from "react";
import dayjs from "dayjs";

const HOURS = Array.from({ length: 24 }, (_, i) =>
  dayjs().startOf("day").add(i, "hour")
);

const COLOR_OPTIONS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#d946ef", "#f43f5e", "#14b8a6"
];

export default function WeekView() {
  const [startDate, setStartDate] = useState(dayjs());
  const [events, setEvents] = useState(() => {
    const saved = localStorage.getItem("calendarEvents");
    return saved ? JSON.parse(saved) : [];
  });
  const [showModal, setShowModal] = useState(false);
  const [modalInfo, setModalInfo] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [titleInput, setTitleInput] = useState("");
  const [durationInput, setDurationInput] = useState("30");
  const [colorInput, setColorInput] = useState(COLOR_OPTIONS[0]);
  const scrollRef = useRef(null);
  const touchStartX = useRef(0);

  const handleNext = () => setStartDate((prev) => prev.add(1, "day"));
  const handlePrev = () => setStartDate((prev) => prev.subtract(1, "day"));

  const days = Array.from({ length: 3 }, (_, i) => startDate.add(i, "day"));

  const openModal = (day, slotIndex, event = null) => {
    setModalInfo({ day, slotIndex });
    setEditingEvent(event);
    if (event) {
      setTitleInput(event.title);
      setDurationInput(event.duration);
      setColorInput(event.color);
    } else {
      setTitleInput("");
      setDurationInput("30");
      setColorInput(COLOR_OPTIONS[0]);
    }
    setShowModal(true);
  };

  const saveEvents = (updatedEvents) => {
    setEvents(updatedEvents);
    localStorage.setItem("calendarEvents", JSON.stringify(updatedEvents));
  };

  const handleCreateOrUpdateEvent = () => {
    if (!modalInfo) return;
    const dateStr = modalInfo.day.format("YYYY-MM-DD");
    const slotIndex = modalInfo.slotIndex;
    if (!titleInput || !durationInput || !colorInput || !dateStr) return;

    if (editingEvent) {
      const updated = events.map(e =>
        e.id === editingEvent.id
          ? { ...e, title: titleInput, duration: parseInt(durationInput, 10), color: colorInput, date: dateStr, start: slotIndex }
          : e
      );
      saveEvents(updated);
    } else {
      const newEvents = [
        ...events,
        {
          id: Date.now(),
          date: dateStr,
          start: slotIndex,
          duration: parseInt(durationInput, 10),
          title: titleInput,
          color: colorInput,
        },
      ];
      saveEvents(newEvents);
    }
    setShowModal(false);
  };

  const downloadICS = (event) => {
    const dt = dayjs(event.date).add(event.start * 5, "minute");
    const dtEnd = dt.add(event.duration, "minute");
    const content = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${event.title}\nDTSTART:${dt.format("YYYYMMDDTHHmmss")}Z\nDTEND:${dtEnd.format("YYYYMMDDTHHmmss")}Z\nDESCRIPTION:Created from CRM\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([content], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openGoogleCalendar = (event) => {
    const dt = dayjs(event.date).add(event.start * 5, "minute");
    const dtEnd = dt.add(event.duration, "minute");
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      event.title
    )}&dates=${dt.format("YYYYMMDDTHHmmss")}Z/${dtEnd.format("YYYYMMDDTHHmmss")}Z&details=Created+from+CRM`;
    window.open(url, "_blank");
  };

  useEffect(() => {
    const el = scrollRef.current;
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      if (deltaX > 50) handlePrev();
      else if (deltaX < -50) handleNext();
    };
    if (el) {
      el.addEventListener("touchstart", handleTouchStart);
      el.addEventListener("touchend", handleTouchEnd);
    }
    return () => {
      if (el) {
        el.removeEventListener("touchstart", handleTouchStart);
        el.removeEventListener("touchend", handleTouchEnd);
      }
    };
  }, []);

  const upcomingEvents = events
    .map(e => ({ ...e, datetime: dayjs(e.date).add(e.start * 5, 'minute') }))
    .filter(e => e.datetime.isAfter(dayjs()))
    .sort((a, b) => a.datetime - b.datetime)
    .slice(0, 5);

  return (
    <div ref={scrollRef} className="p-4 min-h-screen bg-white overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={handlePrev} className="text-xl">←</button>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <button onClick={handleNext} className="text-xl">→</button>
      </div>
      <div className="flex justify-center gap-2 mb-4">
        {['Day', 'Week', 'Month'].map((label) => (
          <button
            key={label}
            className={`border rounded px-3 py-1 text-sm font-medium ${label === 'Week' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[60px_repeat(3,minmax(200px,1fr))] border-t border-l relative min-w-[700px]">
        <div className="bg-gray-100 border-r">
          {HOURS.map((slot, i) => (
            <div key={i} className="h-16 text-xs px-2 border-b text-gray-500">
              {slot.format("h:mm A")}
            </div>
          ))}
        </div>

        {days.map((day, i) => {
          const dateKey = day.format("YYYY-MM-DD");
          const dayEvents = events.filter((e) => e.date === dateKey);

          return (
            <div key={i} className="border-r relative">
              <div className="text-center text-sm font-bold py-2 border-b bg-white sticky top-0 z-20 shadow-sm">
                <div>{day.format("dddd")}</div>
                <div className="text-xs font-normal">{day.format("M/D/YYYY")}</div>
              </div>
              {HOURS.map((_, j) => (
                <div
                  key={j}
                  className="h-16 border-b cursor-pointer hover:bg-blue-50"
                  onClick={() => openModal(day, j * 12)}
                ></div>
              ))}
              {dayEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => openModal(day, ev.start, ev)}
                  className="absolute left-0 right-0 px-1 text-xs text-white cursor-pointer rounded-sm overflow-hidden"
                  style={{
                    top: `${(ev.start / 12) * 64}px`,
                    height: `${(ev.duration / 60) * 64}px`,
                    backgroundColor: ev.color,
                  }}
                  title="Click to edit"
                >
                  {ev.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => openModal(startDate, 96)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-500 text-white text-3xl flex items-center justify-center shadow-lg"
      >
        +
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 transition-opacity duration-300">
          <div className="bg-white p-4 rounded-lg shadow-lg w-full max-w-xs space-y-4 animate-fade-in">
            <h2 className="font-bold text-lg">{editingEvent ? "Edit" : "Add"} Event</h2>
            <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} className="w-full border p-2 rounded" placeholder="Event Title" />
            <input value={durationInput} onChange={(e) => setDurationInput(e.target.value)} type="number" className="w-full border p-2 rounded" placeholder="Duration (min)" />
            <select value={colorInput} onChange={(e) => setColorInput(e.target.value)} className="w-full border p-2 rounded">
              {COLOR_OPTIONS.map(color => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button onClick={handleCreateOrUpdateEvent} className="px-4 py-2 bg-blue-500 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <div className="mt-6">
          <h3 className="font-bold text-sm mb-2">Upcoming Events</h3>
          <ul className="text-sm space-y-1">
            {upcomingEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: e.color }}></span>
                  <span>{e.datetime.format("ddd M/D h:mm A")}: {e.title}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    className="text-xs underline text-blue-500"
                    onClick={() => downloadICS(e)}
                  >Apple</button>
                  <button
                    className="text-xs underline text-green-600"
                    onClick={() => openGoogleCalendar(e)}
                  >Google</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
