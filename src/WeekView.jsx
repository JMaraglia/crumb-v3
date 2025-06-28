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
  const [locationInput, setLocationInput] = useState("");
  const [durationInput, setDurationInput] = useState("30");
  const [colorInput, setColorInput] = useState(COLOR_OPTIONS[0]);
  const [recurring, setRecurring] = useState("none");
  const scrollRef = useRef(null);
  const touchStartX = useRef(0);

  const handleNext = () => setStartDate((prev) => prev.add(3, "day"));
  const handlePrev = () => setStartDate((prev) => prev.subtract(3, "day"));

  const days = Array.from({ length: 3 }, (_, i) => startDate.add(i, "day"));

  const openModal = (day, slotIndex, event = null) => {
    setModalInfo({ day, slotIndex });
    setEditingEvent(event);
    if (event) {
      setTitleInput(event.title);
      setDurationInput(event.duration);
      setColorInput(event.color);
      setRecurring(event.recurring || "none");
      setLocationInput(event.location || "");
    } else {
      setTitleInput("");
      setDurationInput("30");
      setColorInput(COLOR_OPTIONS[0]);
      setRecurring("none");
      setLocationInput("");
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

    const newEvent = {
      id: Date.now(),
      date: dateStr,
      start: slotIndex,
      duration: parseInt(durationInput, 10),
      title: titleInput,
      color: colorInput,
      recurring,
      location: locationInput,
    };

    let newEvents = [];
    if (recurring !== "none") {
      const repeatCount = 3;
      for (let i = 0; i < repeatCount; i++) {
        const date = dayjs(dateStr).add(i, recurring === "daily" ? "day" : "week");
        newEvents.push({ ...newEvent, id: Date.now() + i, date: date.format("YYYY-MM-DD") });
      }
    } else {
      newEvents = [newEvent];
    }

    if (editingEvent) {
      const updated = events.map(e =>
        e.id === editingEvent.id ? { ...newEvent, id: e.id } : e
      );
      saveEvents(updated);
    } else {
      saveEvents([...events, ...newEvents]);
    }
    setShowModal(false);
  };

  const downloadICS = (event) => {
    const dt = dayjs(event.date).add(event.start * 5, "minute");
    const dtEnd = dt.add(event.duration, "minute");
    const content = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${event.title}\nLOCATION:${event.location || ""}\nDTSTART:${dt.format("YYYYMMDDTHHmmss")}Z\nDTEND:${dtEnd.format("YYYYMMDDTHHmmss")}Z\nDESCRIPTION:Created from CRM\nEND:VEVENT\nEND:VCALENDAR`;
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
    )}&dates=${dt.format("YYYYMMDDTHHmmss")}Z/${dtEnd.format("YYYYMMDDTHHmmss")}Z&location=${encodeURIComponent(event.location || "")}&details=Created+from+CRM`;
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
    <div ref={scrollRef} className="p-4 min-h-screen bg-white overflow-auto">
      {/* UI remains unchanged until the modal */}

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
            <input value={locationInput} onChange={(e) => setLocationInput(e.target.value)} className="w-full border p-2 rounded" placeholder="Location" />
            <input value={durationInput} onChange={(e) => setDurationInput(e.target.value)} type="number" className="w-full border p-2 rounded" placeholder="Duration (min)" />
            <select value={colorInput} onChange={(e) => setColorInput(e.target.value)} className="w-full border p-2 rounded">
              {COLOR_OPTIONS.map(color => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
            <select value={recurring} onChange={(e) => setRecurring(e.target.value)} className="w-full border p-2 rounded">
              <option value="none">One-time</option>
              <option value="daily">Daily (3x)</option>
              <option value="weekly">Weekly (3x)</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button onClick={handleCreateOrUpdateEvent} className="px-4 py-2 bg-blue-500 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming list unchanged */}
    </div>
  );
}
