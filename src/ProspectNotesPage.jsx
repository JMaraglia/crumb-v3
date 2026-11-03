// --- ProspectNotesPage.jsx ---
// Prospect notes. Uses the shared notes screen (NotesView.jsx).
// Same props as before, so App.jsx didn't need to change.
import React from 'react';
import NotesView from './NotesView';

function ProspectNotesPage({ contact, goBack, onAddNote, onDeleteNote }) {
  return (
    <NotesView
      account={contact}
      kindLabel="Prospect"
      goBack={goBack}
      onAddNote={onAddNote}
      onDeleteNote={onDeleteNote}
    />
  );
}

export default ProspectNotesPage;
