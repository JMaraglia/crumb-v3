// --- NotesPage.jsx ---
// Customer notes. Uses the shared notes screen (NotesView.jsx).
// Same props as before, so App.jsx didn't need to change.
import React from 'react';
import NotesView from './NotesView';

function NotesPage({ contact, goBack, onAddNote, onDeleteNote }) {
  return (
    <NotesView
      account={contact}
      kindLabel="Customer"
      goBack={goBack}
      onAddNote={onAddNote}
      onDeleteNote={onDeleteNote}
    />
  );
}

export default NotesPage;
