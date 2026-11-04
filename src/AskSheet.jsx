// file: src/AskSheet.jsx
// Small pop-up from the bottom with a question and big choice buttons (iPhone action-sheet style).
// choices: [{ label, value, tone: 'danger' | 'plain' }]; Cancel is always added at the bottom.
import React from 'react';
import './AskSheet.css';

export default function AskSheet({ title, message, choices, onPick, onCancel }) {
  return (
    <div className="ask-backdrop" onClick={onCancel}>
      <div className="ask-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ask-group">
          <div className="ask-head">
            <div className="ask-title">{title}</div>
            {message && <div className="ask-message">{message}</div>}
          </div>
          {choices.map((c) => (
            <button key={c.value} className={`ask-btn ${c.tone === 'danger' ? 'is-danger' : ''}`} onClick={() => onPick(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        <button className="ask-btn ask-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
