// --- ProspectNotesPage.jsx ---
import React, { useState } from 'react';

function ProspectNotesPage({ contact, goBack, onAddNote, onDeleteNote }) {
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState('General');
  const [selectedTab, setSelectedTab] = useState('General');

  const handleAddNote = () => {
    if (!noteText.trim() || !noteCategory.trim()) return;

    const timestamp = new Date().toLocaleString();
    const newNote = {
      text: noteText,
      category: noteCategory,
      timestamp,
    };

    onAddNote(contact.id, newNote);
    setNoteText('');
    setNoteCategory('General');
    setSelectedTab('General');
  };

  const filteredNotes = contact.notes.filter(note => note.category === selectedTab);

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', textAlign: 'center' }}>
        Prospect Notes for {contact.name}
      </h2>

      {/* Category Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
        <button
          onClick={() => setSelectedTab('General')}
          style={{
            padding: '8px 20px',
            backgroundColor: selectedTab === 'General' ? '#007bff' : '#f0f0f0',
            color: selectedTab === 'General' ? 'white' : '#333',
            border: '1px solid #ccc',
            borderRadius: '20px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          General
        </button>
        <button
          onClick={() => setSelectedTab('Sample')}
          style={{
            padding: '8px 20px',
            backgroundColor: selectedTab === 'Sample' ? '#007bff' : '#f0f0f0',
            color: selectedTab === 'Sample' ? 'white' : '#333',
            border: '1px solid #ccc',
            borderRadius: '20px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Sample
        </button>
      </div>

      {/* Note Input */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
        <select
          value={noteCategory}
          onChange={(e) => setNoteCategory(e.target.value)}
          style={{ padding: '8px', fontSize: '1rem', borderRadius: '6px', border: '1px solid #ccc' }}
        >
          <option value="General">General</option>
          <option value="Sample">Sample</option>
        </select>
        <input
          type="text"
          placeholder="Write a note..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          style={{
            padding: '8px',
            fontSize: '1rem',
            width: '40%',
            minWidth: '250px',
            border: '1px solid #ccc',
            borderRadius: '6px'
          }}
        />
        <button
          onClick={handleAddNote}
          style={{
            padding: '8px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Add Note
        </button>
      </div>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#777' }}>
          No {selectedTab.toLowerCase()} notes yet.
        </p>
      ) : (
        filteredNotes.map((note, index) => (
          <div
            key={index}
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '1rem',
              backgroundColor: '#f9f9f9',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{note.category}</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.85rem', marginBottom: '6px', color: '#555' }}>
              {note.timestamp}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>{note.text}</div>
            <button
              onClick={() => onDeleteNote(contact.notes.findIndex(n => n === note))}
              style={{
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
          </div>
        ))
      )}

      <div style={{ textAlign: 'center' }}>
        <button
          onClick={goBack}
          style={{
            marginTop: '2rem',
            padding: '10px 24px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Back to Prospects
        </button>
      </div>
    </div>
  );
}

export default ProspectNotesPage;