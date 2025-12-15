// Global variables
let notes = [];
let currentEditingId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadNotes();
});

// Load all notes from server
async function loadNotes() {
  // Check if page is being accessed via file:// protocol
  if (window.location.protocol === 'file:') {
    showError('Please access this page through the server at http://localhost:3000 instead of opening the file directly. Make sure the server is running with "npm start" or "node server.js".');
    return;
  }

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
      showError(`Failed to load notes (Status: ${response.status}). Make sure the server is running on http://localhost:3000`);
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
  document.getElementById('noteEmail').value = '';
  document.getElementById('noteModal').style.display = 'block';
  document.getElementById('noteName').focus();
}

// Close note form
async function closeNoteForm() {
  const content = document.getElementById('noteContent').value.trim();
  const name = document.getElementById('noteName').value.trim();
  const email = document.getElementById('noteEmail').value.trim();
  
  // If there's content and we're not editing, save to unsent notes
  if (content && !currentEditingId) {
    const shouldSave = confirm('Save this note to unsent notes?\n\nNote: Your note will be saved anonymously (name and email will not be included).');
    if (shouldSave) {
      try {
        // Save only content - make it anonymous
        await fetch('/api/unsent-notes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content }) // Don't send name or email
        });
        console.log('Note saved to unsent notes (anonymously)');
      } catch (error) {
        console.error('Error saving to unsent notes:', error);
      }
    }
  }
  
  document.getElementById('noteModal').style.display = 'none';
  currentEditingId = null;
  document.getElementById('noteContent').value = '';
  document.getElementById('noteName').value = '';
  document.getElementById('noteEmail').value = '';
}

// Edit note
async function editNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;

  currentEditingId = id;
  document.getElementById('noteContent').value = note.content;
  document.getElementById('noteName').value = note.name || '';
  document.getElementById('noteEmail').value = note.email || '';
  document.getElementById('noteModal').style.display = 'block';
  document.getElementById('noteName').focus();
}

// Save note (create or update)
async function saveNote() {
  const content = document.getElementById('noteContent').value.trim();
  const nameInput = document.getElementById('noteName');
  const name = nameInput ? nameInput.value.trim() : '';
  const emailInput = document.getElementById('noteEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  
  console.log('Saving note - content length:', content.length, 'name:', name, 'email:', email); // Debug
  
  if (!content) {
    alert('Please write something!');
    return;
  }

  // Validate email if provided
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter a valid email address');
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
        body: JSON.stringify({ content, name: name || null, email: email || null })
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
        name: name && name.length > 0 ? name : null,
        email: email && email.length > 0 ? email : null
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
        if (email) {
          alert('Note saved! You will receive an email with this note in exactly one year.');
        }
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
  const noteModal = document.getElementById('noteModal');
  const unsentModal = document.getElementById('unsentNotesModal');
  if (event.target === noteModal) {
    closeNoteForm();
  }
  if (event.target === unsentModal) {
    closeUnsentNotes();
  }
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNoteForm();
    closeUnsentNotes();
  }
});

// Show unsent notes modal
async function showUnsentNotes() {
  document.getElementById('unsentNotesModal').style.display = 'block';
  await loadUnsentNotes();
}

// Close unsent notes modal
function closeUnsentNotes() {
  document.getElementById('unsentNotesModal').style.display = 'none';
}

// Load unsent notes
async function loadUnsentNotes() {
  const container = document.getElementById('unsentNotesContainer');
  try {
    console.log('Loading unsent notes...');
    const response = await fetch('/api/unsent-notes');
    console.log('Response status:', response.status, response.statusText);
    
    if (response.ok) {
      const unsentNotes = await response.json();
      console.log('Unsent notes loaded:', unsentNotes);
      displayUnsentNotes(unsentNotes);
    } else {
      const errorText = await response.text();
      console.error('Failed to load unsent notes. Status:', response.status, 'Error:', errorText);
      container.innerHTML = `<div class="empty-state">Error loading unsent notes (Status: ${response.status})</div>`;
    }
  } catch (error) {
    console.error('Error loading unsent notes:', error);
    container.innerHTML = `<div class="empty-state">Error loading unsent notes: ${error.message}. Make sure the server is running.</div>`;
  }
}

// Display unsent notes
function displayUnsentNotes(unsentNotes) {
  const container = document.getElementById('unsentNotesContainer');
  
  if (unsentNotes.length === 0) {
    container.innerHTML = '<div class="empty-state">No unsent notes yet.</div>';
    return;
  }

  // Sort by date (newest first)
  const sortedNotes = [...unsentNotes].sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  container.innerHTML = sortedNotes.map(note => {
    // Unsent notes are anonymous - don't display name or email
    return `
    <div class="note-card">
      <div class="note-content">${escapeHtml(note.content)}</div>
      <div class="note-meta">
        <div class="note-date">${formatDate(note.createdAt)}</div>
        <div class="note-actions">
          <button class="pixel-button pixel-button-secondary" onclick="sendUnsentNote('${note.id}')">send</button>
          <button class="pixel-button pixel-button-secondary" onclick="deleteUnsentNote('${note.id}')">delete</button>
        </div>
      </div>
    </div>
    `;
  }).join('');
}

// Send an unsent note (convert to regular note)
async function sendUnsentNote(id) {
  try {
    const response = await fetch(`/api/unsent-notes/${id}/send`, {
      method: 'POST'
    });

    if (response.ok) {
      await loadUnsentNotes(); // Reload unsent notes
      await loadNotes(); // Reload regular notes
      alert('Note sent successfully!');
    } else {
      showError('Failed to send note');
    }
  } catch (error) {
    console.error('Error sending unsent note:', error);
    showError('Failed to send note');
  }
}

// Delete an unsent note
async function deleteUnsentNote(id) {
  if (!confirm('Are you sure you want to delete this unsent note?')) {
    return;
  }

  try {
    const response = await fetch(`/api/unsent-notes/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      await loadUnsentNotes();
    } else {
      showError('Failed to delete note');
    }
  } catch (error) {
    console.error('Error deleting unsent note:', error);
    showError('Failed to delete note');
  }
}

// Helper functions
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  
  // Set both dates to midnight for accurate day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const noteDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffTime = today - noteDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays <= 7) {
    return `${diffDays} days ago`;
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

