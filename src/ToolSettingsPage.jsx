// file: src/ToolSettingsPage.jsx
// Settings → one tool's own page (Nov 10, 2026): Calendar, Daily Stops, Call Sheet, To-Do.
// Each has a Show switch (off = hidden everywhere, nothing deleted) and room for more settings later.
// Uses the Settings page's look (st- classes).
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaChevronRight, FaCheck } from 'react-icons/fa';
import { loadAppSettings, saveAppSettings, loadCallSheetSettings, saveCallSheetSettings } from './store';
import { useCloudRefresh } from './useCloudRefresh';
import { applyTheme } from './theme';
import { LIBRARY, MAX_IN_USE, MAX_LABEL_LENGTH, MAX_CUSTOM, labelsInUse, customLabels, saveLabels, labelColor } from './noteLabels';
import './SettingsPage.css';

const TOOLS = {
  calendar: {
    title: 'Calendar',
    switches: [{ store: 'app', k: 'calendar', label: 'Show Calendar', sub: 'The Calendar tile on Home' }],
    more: { label: 'Calendar Settings', sub: 'Week view, event length, start time, what shows, colors' },
  },
  'daily-stops': {
    title: 'Daily Stops',
    switches: [{ store: 'app', k: 'dailyStops', label: 'Show Daily Stops', sub: 'The Daily Stops tile on Home, the Daily Stops button on lists, and stop reminders' }],
  },
  'call-sheet': {
    title: 'Call Sheet',
    switches: [
      { store: 'cs', k: 'show', label: 'Show Call Sheet', sub: 'The Call Sheet tile on Home' },
      { store: 'cs', k: 'online', label: 'Online Ordering', sub: 'Shows who orders online (set on each customer)', needs: 'show' },
      { store: 'cs', k: 'orders', label: 'Track Orders', sub: 'Ordered / Did Not Order on each row', needs: 'show' },
    ],
  },
  'note-labels': {
    title: 'Note Labels',
    labels: true,
    switches: [],
  },
  appearance: {
    title: 'Appearance',
    appearance: true,
    switches: [],
  },
  todo: {
    title: 'To-Do',
    switches: [{ store: 'app', k: 'todo', label: 'Show To-Do', sub: 'The To-Do tile on Home and to-do reminders' }],
  },
};

export default function ToolSettingsPage() {
  const navigate = useNavigate();
  const { tool } = useParams();
  const t = TOOLS[tool];
  const [app, setApp] = useState(loadAppSettings);
  const [cs, setCs] = useState(loadCallSheetSettings);
  useCloudRefresh(() => {
    // changes from your other device, re-read in place
    setApp(loadAppSettings());
    setCs(loadCallSheetSettings());
  });
  useEffect(() => {
    if (!t) navigate('/settings', { replace: true }); // unknown page: back to Settings
  }, [t, navigate]);
  if (!t) return null;
  const value = (s) => (s.store === 'cs' ? cs[s.k] : app[s.k]);
  const set = (s, on) => {
    if (s.store === 'cs') {
      const next = { ...cs, [s.k]: on };
      setCs(next);
      saveCallSheetSettings(next);
    } else {
      setApp({ ...app, [s.k]: on });
      saveAppSettings({ [s.k]: on });
    }
  };
  const shown = t.switches.filter((s) => !s.needs || value({ ...s, k: s.needs }));
  const openCalendarSettings = () => {
    try {
      sessionStorage.setItem('crumb_open_cal_settings', '1'); // Calendar opens its settings right away
    } catch {
      /* not critical */
    }
    navigate('/calendar');
  };

  return (
    <div className="st-page">
      <header className="st-header">
        <button className="st-icon-btn" onClick={() => navigate('/settings')} aria-label="Back">
          <FaArrowLeft />
        </button>
      </header>
      <div className="st-content">
        <h1 className="st-title">{t.title}</h1>
        {t.labels && <NoteLabelsEditor />}
        {t.appearance && (
          <div className="st-group" role="radiogroup" aria-label="Appearance">
            {[['light', 'Light'], ['midnight', 'Midnight']].map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={app.theme === v}
                className="st-row st-choice-row"
                onClick={() => {
                  setApp({ ...app, theme: v });
                  saveAppSettings({ theme: v });
                  applyTheme(v);
                }}
              >
                <span className="st-row-text">
                  <span className="st-row-label">{label}</span>
                </span>
                {app.theme === v && <FaCheck className="st-choice-check" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
        {shown.length > 0 && <div className="st-group">
          {shown.map((s) => (
            <label key={s.k} className="st-row st-switch-row">
              <span className="st-row-text">
                <span className="st-row-label">{s.label}</span>
                <span className="st-row-sub">{s.sub}</span>
              </span>
              <input type="checkbox" className="st-switch" checked={value(s)} onChange={(e) => set(s, e.target.checked)} aria-label={s.label} />
            </label>
          ))}
        </div>}
        {t.more && (
          <div className="st-group st-group-top">
            <button className="st-row" onClick={openCalendarSettings}>
              <span className="st-row-text">
                <span className="st-row-label">{t.more.label}</span>
                <span className="st-row-sub">{t.more.sub}</span>
              </span>
              <FaChevronRight className="st-row-chev" />
            </button>
          </div>
        )}
        {!t.labels && !t.appearance && <p className="st-note">Turning something off only hides it. Nothing is deleted, and turning it back on brings it all back.</p>}
      </div>
    </div>
  );
}

// Note Labels (Nov 10): the top box is what's offered on notes, in that order (max 12).
// Tap a label to move it between the boxes. Your own labels go straight into the top box.
function NoteLabelsEditor() {
  const [inUse, setInUse] = useState(() => labelsInUse());
  const [custom, setCustom] = useState(() => customLabels());
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  useCloudRefresh(() => {
    setInUse(labelsInUse());
    setCustom(customLabels());
  });
  const save = (u, c) => {
    setInUse(u);
    setCustom(c);
    saveLabels(u, c);
  };
  const more = [...LIBRARY, ...custom].filter((l) => !inUse.includes(l));
  const remove = (l) => {
    setMsg('');
    if (inUse.length === 1) return setMsg('Keep at least one label.');
    save(inUse.filter((x) => x !== l), custom);
  };
  const addBack = (l) => {
    setMsg('');
    if (inUse.length >= MAX_IN_USE) return setMsg(`${MAX_IN_USE} labels max. Remove one first.`);
    save([...inUse, l], custom);
  };
  const addOwn = (e) => {
    e.preventDefault();
    setMsg('');
    const v = name.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (v.toLowerCase() === 'general') return setMsg('Pick another name.');
    if ([...LIBRARY, ...custom].some((x) => x.toLowerCase() === v.toLowerCase())) return setMsg('That label already exists.');
    if (custom.length >= MAX_CUSTOM) return setMsg(`${MAX_CUSTOM} of your own labels max.`);
    if (inUse.length >= MAX_IN_USE) return setMsg(`${MAX_IN_USE} labels max. Remove one first.`);
    save([...inUse, v], [...custom, v]);
    setName('');
  };
  const chip = (l, on) => {
    const c = labelColor(l);
    return (
      <button
        key={l}
        type="button"
        className={`st-label ${on ? '' : 'is-off'}`}
        style={on ? { background: c.bg, color: c.fg } : undefined}
        onClick={() => (on ? remove(l) : addBack(l))}
      >
        {l}
      </button>
    );
  };
  return (
    <>
      <div className="st-group-label st-label-head">In Use · {inUse.length} of {MAX_IN_USE}</div>
      <div className="st-label-box">{inUse.map((l) => chip(l, true))}</div>
      <div className="st-group-label st-label-head">More Labels</div>
      <div className="st-label-box">{more.length ? more.map((l) => chip(l, false)) : <span className="st-label-empty">All labels are in use.</span>}</div>
      <div className="st-group-label st-label-head">Add Your Own</div>
      <form className="st-label-add" onSubmit={addOwn}>
        <input
          className="st-label-input"
          value={name}
          maxLength={MAX_LABEL_LENGTH}
          placeholder="Label name"
          onChange={(e) => {
            setName(e.target.value);
            setMsg('');
          }}
        />
        <button type="submit" className="st-label-addbtn" disabled={!name.trim()}>Add</button>
      </form>
      {msg && <p className="st-label-msg">{msg}</p>}
    </>
  );
}
