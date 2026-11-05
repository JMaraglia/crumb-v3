// file: src/CompetitorPicker.jsx
// Edit screen: the account's competitors as chips (× to remove) + a box to add more.
// Suggestions fill in as you type; a name that isn't on the list yet gets added to it.
import React, { useState } from 'react';
import { allCompetitors, rememberCompetitor, knownSpelling } from './competitors';
import './CompetitorPicker.css';

export default function CompetitorPicker({ value = [], onChange }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const has = (n) => value.some((v) => v.toLowerCase() === n.toLowerCase());
  const q = text.trim().toLowerCase();
  const options = allCompetitors().filter((n) => !has(n) && (!q || n.toLowerCase().includes(q)));
  const exact = q && allCompetitors().some((n) => n.toLowerCase() === q);

  const add = (name) => {
    const n = knownSpelling(name);
    if (!n || has(n)) return setText('');
    rememberCompetitor(n);
    onChange([...value, n]);
    setText('');
  };

  return (
    <div className="cp-box">
      {value.length > 0 && (
        <div className="cp-chips">
          {value.map((n) => (
            <span key={n} className="cp-chip">
              {n}
              <button className="cp-x" onClick={() => onChange(value.filter((v) => v !== n))} aria-label={`Remove ${n}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="cp-input"
        placeholder={value.length ? 'Add another competitor' : 'Add a competitor (Sysco, US Foods…)'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (q) add(options.length === 1 && !exact ? options[0] : text);
          }
        }}
        enterKeyHint="done"
        autoCapitalize="words"
      />
      {(focused || q) && (options.length > 0 || (q && !exact)) && (
        <div className="cp-suggest">
          {q && !exact && (
            <button className="cp-opt cp-new" onMouseDown={(e) => e.preventDefault()} onClick={() => add(text)}>
              + Add "{text.trim()}"
            </button>
          )}
          {options.slice(0, 12).map((n) => (
            <button key={n} className="cp-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => add(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
