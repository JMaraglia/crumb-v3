// file: src/WeekView.jsx
import React, { useState, useRef, useEffect } from "react";
import dayjs from "dayjs";

const TIME_SLOTS = Array.from({ length: (22 - 7) * 12 }, (_, i) =>
  dayjs().startOf("day").add(7 * 60 + i * 5, "minute")
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
  const scrollRef = useRef(null);
  const touchStartX = useRef(0);

  const handleNext = () => setStartDate((prev) => prev.add(1, "day"));
  const handlePrev = () => setStartDate((prev) => prev.subtract(1, "day"));

  const days = Array.from({ length: 3 }, (_, i) => startDate.add(i, "day"));

  const openModal = (day, slotIndex, event = null) => {
    setModalInfo({ day, slotIndex });
    setEditingEvent(event);
    setShowModal(true);
  };

  const saveEvents = (updatedEvents) => {
    setEvents(updatedEvents);
    localStorage.setItem("calendarEvents", JSON.stringify(updatedEvents));
  };

  const handleCreateOrUpdateEvent = (title, duration, color) => {
    const dateStr = document.getElementById("date").value;
    const slotIndex = parseInt(document.getElementById("time").value, 10);
    if (!title || !duration || !color || !dateStr) return;

    const day = dayjs(dateStr);
    const dateKey = day.format("YYYY-MM-DD");

    if (editingEvent) {
      const updated = events.map(e =>
        e.id === editingEvent.id
          ? { ...e, title, duration: parseInt(duration, 10), color, date: dateKey, start: slotIndex }
          : e
      );
      saveEvents(updated);
    } else {
      const newEvents = [
        ...events,
        {
          id: Date.now(),
          date: dateKey,
          start: slotIndex,
          duration: parseInt(duration, 10),
          title,
          color,
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

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX > 50) handlePrev();
    else if (deltaX < -50) handleNext();
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("touchstart", onTouchStart);
      el.addEventListener("touchend", onTouchEnd);
    }
    return () => {
      if (el) {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchend", onTouchEnd);
      }
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      const now = dayjs();
      const rounded = now.minute(Math.ceil(now.minute() / 5) * 5).second(0);
      const slotIndex = Math.max(0, Math.floor((rounded.hour() * 60 + rounded.minute() - 420) / 5));
      openModal(now, slotIndex);
    };
    window.addEventListener("calendar:addGlobalEvent", handler);
    return () => window.removeEventListener("calendar:addGlobalEvent", handler);
  }, []);

  const upcomingEvents = events
    .map(e => ({ ...e, datetime: dayjs(e.date).add(e.start * 5, 'minute') }))
    .filter(e => e.datetime.isAfter(dayjs()))
    .sort((a, b) => a.datetime - b.datetime)
    .slice(0, 5);

  return (
    <div ref={scrollRef} className="p-2 sm:p-4 min-h-screen bg-white overflow-x-auto">
      <div className="grid grid-cols-[60px_repeat(3,minmax(200px,1fr))] border-t border-l relative min-w-[700px]">
        <div className="bg-gray-100 border-r z-10">
          {TIME_SLOTS.map((slot, i) => (
            <div key={i} className="h-6 text-[10px] px-1 border-b">
              {slot.format("h:mm A")}
            </div>
          ))}
        </div>

        {days.map((day, i) => {
          const dateKey = day.format("YYYY-MM-DD");
          const dayEvents = events.filter((e) => e.date === dateKey);

          return (
            <div key={i} className="border-r relative">
              <div className="text-center text-xs sm:text-sm font-semibold py-1 border-b bg-white sticky top-0 z-10">
                {day.format("ddd M/D/YYYY")}
              </div>
              {TIME_SLOTS.map((_, j) => (
                <div
                  key={j}
                  className="h-6 border-b cursor-pointer hover:bg-blue-50"
                  onClick={() => openModal(day, j)}
                ></div>
              ))}
              {dayEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => openModal(day, ev.start, ev)}
                  className="absolute left-0 right-0 px-1 text-[10px] text-white cursor-pointer"
                  style={{
                    top: `${ev.start * 24}px`,
                    height: `${(ev.duration / 5) * 24}px`,
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
