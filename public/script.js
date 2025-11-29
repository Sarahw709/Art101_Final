// Global variables
let notes = [];
let currentEditingId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadNotes();
});

// Load all notes from server
async function loadNotes() {
  try {
    console.log('Attempting to load notes from /api/notes...');
    const response = await fetch('/api/notes');
    console.log('Response received. Status:', response.status, response.statusText);
    console.log('Response headers:', [...response.headers.entries()]);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Successfully loaded notes:', data);
      notes = data;
      notes.forEach((note, index) => {
        console.log(`Note ${index}:`, { id: note.id, name: note.name, hasName: !!note.name });
      });
      displayNotes(notes);
    } else {
      const errorText = await response.text();
      console.error('Failed to load notes. Status:', response.status, 'Error:', errorText);
      showError(`Failed to load notes (Status: ${response.status})`);
    }
  } catch (error) {
    console.error('Error loading notes:', error);
    console.error('Error details:', error.message, error.stack);
    showError(`Failed to connect to server: ${error.message}. Make sure the server is running on http://localhost:3000`);
  }
}

// Display notes in the container
function displayNotes(notesToDisplay) {
  const container = document.getElementById('notesContainer');
  
  if (notesToDisplay.length === 0) {
    container.innerHTML = '<div class="empty-state">No notes yet. Create your first time capsule note!</div>';
    return;
  }

  // Sort by date (newest first)
  const sortedNotes = [...notesToDisplay].sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  container.innerHTML = sortedNotes.map(note => {
    // Check if name exists and is not empty
    let nameDisplay = '';
    if (note.name) {
      const nameStr = String(note.name).trim();
      if (nameStr.length > 0) {
        nameDisplay = `<div class="note-name">${escapeHtml(nameStr)}</div>`;
        console.log('Displaying name for note', note.id, ':', nameStr); // Debug
      }
    }
    console.log('Note', note.id, 'name field:', note.name, 'will display:', nameDisplay ? 'yes' : 'no'); // Debug
    return `
    <div class="note-card">
      ${nameDisplay}
      <div class="note-content">${escapeHtml(note.content)}</div>
      <div class="note-meta">
        <div class="note-date">${formatDate(note.createdAt)}</div>
        <div class="note-actions">
          <button class="pixel-button pixel-button-secondary" onclick="editNote('${note.id}')">edit</button>
          <button class="pixel-button pixel-button-secondary" onclick="deleteNote('${note.id}')">delete</button>
        </div>
      </div>
    </div>
    `;
  }).join('');
}

// Filter notes based on search
function filterNotes() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  if (searchTerm === '') {
    displayNotes(notes);
  } else {
    const filtered = notes.filter(note => 
      note.content.toLowerCase().includes(searchTerm) ||
      (note.name && note.name.toLowerCase().includes(searchTerm)) ||
      (note.author && note.author.toLowerCase().includes(searchTerm))
    );
    displayNotes(filtered);
  }
}

// Show new note form
function showNewNoteForm() {
  currentEditingId = null;
  document.getElementById('noteContent').value = '';
  document.getElementById('noteName').value = '';
  document.getElementById('noteModal').style.display = 'block';
  document.getElementById('noteName').focus();
}

// Close note form
function closeNoteForm() {
  document.getElementById('noteModal').style.display = 'none';
  currentEditingId = null;
  document.getElementById('noteContent').value = '';
  document.getElementById('noteName').value = '';
}

// Edit note
async function editNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;

  currentEditingId = id;
  document.getElementById('noteContent').value = note.content;
  document.getElementById('noteName').value = note.name || '';
  document.getElementById('noteModal').style.display = 'block';
  document.getElementById('noteName').focus();
}

// Save note (create or update)
async function saveNote() {
  const content = document.getElementById('noteContent').value.trim();
  const nameInput = document.getElementById('noteName');
  const name = nameInput ? nameInput.value.trim() : '';
  
  console.log('Saving note - content length:', content.length, 'name:', name); // Debug
  
  if (!content) {
    alert('Please write something!');
    return;
  }

  try {
    if (currentEditingId) {
      // Update existing note
      const response = await fetch(`/api/notes/${currentEditingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content, name: name || null })
      });

      if (response.ok) {
        await loadNotes();
        closeNoteForm();
      } else {
        showError('Failed to update note');
      }
    } else {
      // Create new note
      const noteData = { 
        content, 
        name: name && name.length > 0 ? name : null 
      };
      console.log('Sending note data:', noteData); // Debug
      
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(noteData)
      });

      if (response.ok) {
        const savedNote = await response.json();
        console.log('Note saved successfully:', savedNote); // Debug
        console.log('Saved note has name?', savedNote.name); // Debug
        await loadNotes();
        closeNoteForm();
      } else {
        const errorData = await response.json();
        console.error('Failed to save note:', errorData);
        showError('Failed to save note');
      }
    }
  } catch (error) {
    console.error('Error saving note:', error);
    showError('Failed to connect to server');
  }
}

// Delete note
async function deleteNote(id) {
  if (!confirm('Are you sure you want to delete this note?')) {
    return;
  }

  try {
    const response = await fetch(`/api/notes/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      await loadNotes();
    } else {
      showError('Failed to delete note');
    }
  } catch (error) {
    console.error('Error deleting note:', error);
    showError('Failed to connect to server');
  }
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('noteModal');
  if (event.target === modal) {
    closeNoteForm();
  }
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNoteForm();
  }
});

// Helper functions
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return 'today';
  } else if (diffDays === 2) {
    return 'yesterday';
  } else if (diffDays <= 7) {
    return `${diffDays - 1} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  console.error('Error:', message);
  alert(message); // Simple alert for now
}

