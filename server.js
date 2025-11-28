const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const NOTES_FILE = path.join(__dirname, 'notes.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize notes file if it doesn't exist
if (!fs.existsSync(NOTES_FILE)) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify([], null, 2));
}

// Helper function to read notes
function readNotes() {
  try {
    const data = fs.readFileSync(NOTES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading notes:', error);
    return [];
  }
}

// Helper function to write notes
function writeNotes(notes) {
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing notes:', error);
    return false;
  }
}

// API Routes

// Get all notes
app.get('/api/notes', (req, res) => {
  const notes = readNotes();
  res.json(notes);
});

// Get a single note by ID
app.get('/api/notes/:id', (req, res) => {
  const notes = readNotes();
  const note = notes.find(n => n.id === req.params.id);
  if (note) {
    res.json(note);
  } else {
    res.status(404).json({ error: 'Note not found' });
  }
});

// Create a new note
app.post('/api/notes', (req, res) => {
  const { content, author } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Note content is required' });
  }

  const notes = readNotes();
  const newNote = {
    id: Date.now().toString(),
    content: content.trim(),
    author: author || 'Anonymous',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  notes.push(newNote);
  if (writeNotes(notes)) {
    res.status(201).json(newNote);
  } else {
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// Update a note
app.put('/api/notes/:id', (req, res) => {
  const { content } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Note content is required' });
  }

  const notes = readNotes();
  const noteIndex = notes.findIndex(n => n.id === req.params.id);
  
  if (noteIndex === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }

  notes[noteIndex].content = content.trim();
  notes[noteIndex].updatedAt = new Date().toISOString();

  if (writeNotes(notes)) {
    res.json(notes[noteIndex]);
  } else {
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete a note
app.delete('/api/notes/:id', (req, res) => {
  const notes = readNotes();
  const filteredNotes = notes.filter(n => n.id !== req.params.id);
  
  if (filteredNotes.length === notes.length) {
    return res.status(404).json({ error: 'Note not found' });
  }

  if (writeNotes(filteredNotes)) {
    res.json({ message: 'Note deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Time Capsule Diary server running at http://localhost:${PORT}`);
});

