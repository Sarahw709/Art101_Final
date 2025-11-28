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
    const response = await fetch('/api/notes');
    if (response.ok) {
      notes = await response.json();
      displayNotes(notes);
    } else {
      showError('Failed to load notes');
    }
  } catch (error) {
    console.error('Error loading notes:', error);
    showError('Failed to connect to server');
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

  container.innerHTML = sortedNotes.map(note => `
    <div class="note-card">
      <div class="note-content">${escapeHtml(note.content)}</div>
      <div class="note-meta">
        <div class="note-date">${formatDate(note.createdAt)}</div>
        <div class="note-actions">
          <button class="pixel-button pixel-button-secondary" onclick="editNote('${note.id}')">edit</button>
          <button class="pixel-button pixel-button-secondary" onclick="deleteNote('${note.id}')">delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

// Filter notes based on search
function filterNotes() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  if (searchTerm === '') {
    displayNotes(notes);
  } else {
    const filtered = notes.filter(note => 
      note.content.toLowerCase().includes(searchTerm) ||
      note.author.toLowerCase().includes(searchTerm)
    );
    displayNotes(filtered);
  }
}

// Show new note form
function showNewNoteForm() {
  currentEditingId = null;
  document.getElementById('noteContent').value = '';
  document.getElementById('noteModal').style.display = 'block';
  document.getElementById('noteContent').focus();
}

// Close note form
function closeNoteForm() {
  document.getElementById('noteModal').style.display = 'none';
  currentEditingId = null;
  document.getElementById('noteContent').value = '';
}

// Edit note
async function editNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;

  currentEditingId = id;
  document.getElementById('noteContent').value = note.content;
  document.getElementById('noteModal').style.display = 'block';
  document.getElementById('noteContent').focus();
}

// Save note (create or update)
async function saveNote() {
  const content = document.getElementById('noteContent').value.trim();
  
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
        body: JSON.stringify({ content })
      });

      if (response.ok) {
        await loadNotes();
        closeNoteForm();
      } else {
        showError('Failed to update note');
      }
    } else {
      // Create new note
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });

      if (response.ok) {
        await loadNotes();
        closeNoteForm();
      } else {
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
  alert(message); // Simple alert for now
}

