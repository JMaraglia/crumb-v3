import React, { useState } from 'react';

const categories = ['General', 'Sample', 'Follow-Up'];

function NotesPage({ contact, goBack, onAddNote, onDeleteNote }) {
  const [newText, setNewText] = useState('');
  const [category, setCategory] = useState('General');
  const [activeCategory, setActiveCategory] = useState('General');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editedText, setEditedText] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionInstance, setRecognitionInstance] = useState(null);

  const handleAddNote = () => {
    if (!newText.trim()) return;

    const newNote = {
      text: newText,
      category,
      timestamp: new Date().toLocaleString(),
    };

    onAddNote(contact.id, newNote);
    setNewText('');
    setCategory('General');
    setActiveCategory(category);
  };

  const handleEditNote = (index) => {
    const note = contact.notes[index];
    setEditingIndex(index);
    setEditedText(note.text);
    setEditedCategory(note.category);
  };

  const saveEditedNote = () => {
    if (editedText.trim() === '') return;

    const updatedNote = {
      text: editedText,
      category: editedCategory,
      timestamp: new Date().toLocaleString(),
    };

    onAddNote(contact.id, updatedNote, editingIndex);
    setEditingIndex(null);
    setEditedText('');
    setEditedCategory('');
  };

  const handleDeleteNote = (index) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      onDeleteNote(index);
    }
  };

  const getSuggestion = async (noteText) => {
    setLoadingSuggestion(true);
    setSuggestion('');
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer YOUR_OPENAI_API_KEY`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a CRM assistant. Rewrite this CRM note as clean, clear bullet points.' },
            { role: 'user', content: noteText }
          ]
        })
      });

      const data = await response.json();
      const reply = data.choices[0].message.content;
      setSuggestion(reply);
    } catch (error) {
      setSuggestion('Error getting AI suggestion.');
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const toggleSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    if (isRecording) {
      recognitionInstance.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setNewText(prev => prev + ' ' + transcript);
      setIsRecording(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    setIsRecording(true);
    setRecognitionInstance(recognition);
  };

  return (
    <div className="notes-page">
      <h1>Visit Log for {contact.name}</h1>
      <button onClick={goBack}>Back to Contacts</button>

      <div style={{ margin: '20px 0' }}>
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add a new note..."
          rows={3}
          style={{ width: '100%', padding: '10px' }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ marginTop: '10px' }}>
          {categories.map((cat, i) => <option key={i}>{cat}</option>)}
        </select>
        <br />
        <button onClick={handleAddNote} style={{ marginTop: '10px' }}>
          Save Note
        </button>
        <button onClick={toggleSpeechRecognition} style={{ marginTop: '10px', marginLeft: '10px' }}>
          {isRecording ? '🎙️ Recording...' : '🎤 Record Note'}
        </button>
      </div>

      <div style={{ marginBottom: '15px' }}>
        {categories.map((cat, idx) => (
          <button
            key={idx}
            onClick={() => setActiveCategory(cat)}
            style={{
              marginRight: '8px',
              backgroundColor: activeCategory === cat ? '#0077cc' : '#ccc'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <ul>
        {contact.notes
          ?.map((note, i) => ({ ...note, index: i }))
          .filter(note => note.category === activeCategory)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .map(({ text, category, timestamp, index }) => (
            <li key={index} style={{ marginBottom: '15px' }}>
              <strong>{category}:</strong>
              {editingIndex === index ? (
                <>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    rows={3}
                    style={{ width: '100%', marginTop: '5px' }}
                  />
                  <select
                    value={editedCategory}
                    onChange={(e) => setEditedCategory(e.target.value)}
                    style={{ marginTop: '5px' }}
                  >
                    {categories.map((cat, i) => <option key={i}>{cat}</option>)}
                  </select>
                  <br />
                  <button onClick={saveEditedNote} style={{ marginTop: '5px' }}>Save</button>
                  <button onClick={() => setEditingIndex(null)} style={{ marginLeft: '10px' }}>Cancel</button>
                </>
              ) : (
                <>
                  <div>{text}</div>
                  <em>{timestamp}</em>
                  <br />
                  <button onClick={() => handleEditNote(index)} style={{ marginTop: '5px' }}>Edit</button>
                  <button onClick={() => handleDeleteNote(index)} style={{ marginLeft: '10px' }}>Delete</button>
                  <button onClick={() => getSuggestion(text)} style={{ marginLeft: '10px' }}>Review with AI</button>
                  {loadingSuggestion && <div>Loading...</div>}
                  {suggestion && (
                    <div style={{ marginTop: '10px', fontStyle: 'italic', color: 'green' }}>
                      <strong>AI Suggestion:</strong><br />
                      {suggestion}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}

export default NotesPage;
