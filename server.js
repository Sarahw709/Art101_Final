// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const PORT = 3000;
const NOTES_FILE = path.join(__dirname, 'notes.json');

// Email configuration (using environment variables or defaults)
// For Gmail, you'll need to use an App Password: https://support.google.com/accounts/answer/185833
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
};

// Create email transporter (only if credentials are provided)
let transporter = null;
if (emailConfig.auth.user && emailConfig.auth.pass) {
  transporter = nodemailer.createTransport(emailConfig);
  console.log('✓ Email service configured');
  console.log(`  SMTP Host: ${emailConfig.host}:${emailConfig.port}`);
  console.log(`  From Address: ${emailConfig.auth.user}`);
} else {
  console.warn('⚠ Email service not configured. Set SMTP_USER and SMTP_PASS environment variables to enable email functionality.');
}

// Middleware
app.use(express.json());

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

// API Routes (must be before static middleware)

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
  const { content, author, name, email } = req.body;
  console.log('Received note data:', { content, author, name, email }); // Debug
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Note content is required' });
  }

  const notes = readNotes();
  const trimmedName = (name && typeof name === 'string' && name.trim().length > 0) ? name.trim() : null;
  const trimmedEmail = (email && typeof email === 'string' && email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) ? email.trim() : null;
  const newNote = {
    id: Date.now().toString(),
    content: content.trim(),
    author: author || 'Anonymous',
    name: trimmedName,
    email: trimmedEmail,
    emailSent: false, // Track if email has been sent
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log('Creating new note:', newNote); // Debug

  notes.push(newNote);
  if (writeNotes(notes)) {
    console.log('Note saved, returning:', newNote); // Debug
    res.status(201).json(newNote);
  } else {
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// Update a note
app.put('/api/notes/:id', (req, res) => {
  const { content, name, email } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Note content is required' });
  }

  const notes = readNotes();
  const noteIndex = notes.findIndex(n => n.id === req.params.id);
  
  if (noteIndex === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }

  notes[noteIndex].content = content.trim();
  notes[noteIndex].name = name && name.trim() ? name.trim() : null;
  const trimmedEmail = (email && typeof email === 'string' && email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) ? email.trim() : null;
  notes[noteIndex].email = trimmedEmail;
  // Reset emailSent if email is changed
  if (trimmedEmail !== notes[noteIndex].email) {
    notes[noteIndex].emailSent = false;
  }
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

// Email sending function
async function sendTimeCapsuleEmail(note) {
  if (!transporter) {
    console.log('Email transporter not configured, skipping email send');
    return false;
  }

  if (!note.email) {
    return false;
  }

  const oneYearAgo = new Date(note.createdAt);
  const now = new Date();
  const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
  const timeDiff = now - oneYearInMs;

  // Check if note is at least 1 year old
  if (oneYearAgo.getTime() > timeDiff) {
    return false; // Not yet 1 year old
  }

  if (note.emailSent) {
    return false; // Already sent
  }

  try {
    const nameDisplay = note.name ? ` (${note.name})` : '';
    const mailOptions = {
      from: emailConfig.auth.user,
      to: note.email,
      subject: `Your Time Capsule Note from One Year Ago${nameDisplay}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Your Time Capsule Note</h2>
          <p style="color: #666; font-size: 14px;">You wrote this note exactly one year ago on ${new Date(note.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="white-space: pre-wrap; color: #333; line-height: 1.6;">${note.content}</p>
          </div>
          ${note.name ? `<p style="color: #666; font-size: 14px;">- ${note.name}</p>` : ''}
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This email was sent automatically from your Time Capsule Diary.</p>
        </div>
      `,
      text: `
Your Time Capsule Note

You wrote this note exactly one year ago on ${new Date(note.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.

${note.content}

${note.name ? `- ${note.name}` : ''}

This email was sent automatically from your Time Capsule Diary.
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Time capsule email sent to ${note.email} for note ${note.id}`);
    
    // Mark email as sent
    const notes = readNotes();
    const noteIndex = notes.findIndex(n => n.id === note.id);
    if (noteIndex !== -1) {
      notes[noteIndex].emailSent = true;
      writeNotes(notes);
    }
    
    return true;
  } catch (error) {
    console.error(`Error sending email to ${note.email}:`, error);
    return false;
  }
}

// Function to check and send emails for notes that are 1 year old
async function checkAndSendTimeCapsuleEmails() {
  if (!transporter) {
    console.log('Email not configured, skipping email check');
    return; // Email not configured
  }

  console.log('Checking for time capsule emails to send...');
  const notes = readNotes();
  const now = new Date();
  const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
  let emailsSent = 0;
  let emailsSkipped = 0;

  for (const note of notes) {
    if (note.email && !note.emailSent) {
      const noteDate = new Date(note.createdAt);
      const timeDiff = now - noteDate;
      const daysOld = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      // Check if note is at least 1 year old (with 1 day tolerance)
      if (timeDiff >= oneYearInMs - (24 * 60 * 60 * 1000)) {
        const sent = await sendTimeCapsuleEmail(note);
        if (sent) {
          emailsSent++;
        } else {
          emailsSkipped++;
        }
        // Small delay to avoid overwhelming email service
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log(`  Note ${note.id} is ${daysOld} days old (needs 365 days)`);
      }
    }
  }

  console.log(`Email check complete: ${emailsSent} sent, ${emailsSkipped} skipped`);
  return { emailsSent, emailsSkipped };
}

// Schedule email check to run daily at 9:00 AM
// Cron format: minute hour day month day-of-week
cron.schedule('0 9 * * *', () => {
  console.log('Running scheduled time capsule email check...');
  checkAndSendTimeCapsuleEmails();
});

// Test endpoint to verify email configuration
app.get('/api/test-email', async (req, res) => {
  if (!transporter) {
    return res.status(503).json({ 
      error: 'Email service not configured',
      message: 'Set SMTP_USER and SMTP_PASS environment variables to enable email functionality.'
    });
  }

  const testEmail = req.query.email || emailConfig.auth.user;
  if (!testEmail) {
    return res.status(400).json({ 
      error: 'No email address provided',
      message: 'Provide an email address as a query parameter: /api/test-email?email=your@email.com'
    });
  }

  try {
    // Test email connection
    await transporter.verify();
    
    // Send a test email
    const mailOptions = {
      from: emailConfig.auth.user,
      to: testEmail,
      subject: 'Time Capsule Diary - Email Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">✓ Email Test Successful!</h2>
          <p style="color: #666;">Your email configuration is working correctly.</p>
          <p style="color: #666;">The Time Capsule Diary email feature is ready to send your notes after one year.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This is a test email sent at ${new Date().toLocaleString()}.</p>
        </div>
      `,
      text: `Email Test Successful!\n\nYour email configuration is working correctly.\n\nThe Time Capsule Diary email feature is ready to send your notes after one year.\n\nThis is a test email sent at ${new Date().toLocaleString()}.`
    };

    await transporter.sendMail(mailOptions);
    res.json({ 
      success: true, 
      message: `Test email sent successfully to ${testEmail}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Email test failed:', error);
    res.status(500).json({ 
      error: 'Failed to send test email',
      message: error.message,
      details: 'Check your SMTP credentials and network connection.'
    });
  }
});

// Test endpoint to manually trigger email check (for testing)
app.post('/api/test-email-check', async (req, res) => {
  if (!transporter) {
    return res.status(503).json({ 
      error: 'Email service not configured',
      message: 'Set SMTP_USER and SMTP_PASS environment variables to enable email functionality.'
    });
  }

  try {
    console.log('Manual email check triggered via API...');
    const result = await checkAndSendTimeCapsuleEmails();
    res.json({ 
      success: true, 
      message: 'Email check completed',
      timestamp: new Date().toISOString(),
      note: 'Check server logs for details about emails sent.'
    });
  } catch (error) {
    console.error('Email check failed:', error);
    res.status(500).json({ 
      error: 'Email check failed',
      message: error.message
    });
  }
});

// Endpoint to get email status and configuration info
app.get('/api/email-status', (req, res) => {
  const notes = readNotes();
  const notesWithEmail = notes.filter(n => n.email);
  const notesPendingEmail = notes.filter(n => n.email && !n.emailSent);
  const notesEmailSent = notes.filter(n => n.email && n.emailSent);

  res.json({
    configured: transporter !== null,
    smtpHost: emailConfig.host,
    smtpPort: emailConfig.port,
    fromAddress: emailConfig.auth.user || 'Not configured',
    stats: {
      totalNotes: notes.length,
      notesWithEmail: notesWithEmail.length,
      emailsPending: notesPendingEmail.length,
      emailsSent: notesEmailSent.length
    },
    pendingNotes: notesPendingEmail.map(n => ({
      id: n.id,
      email: n.email,
      createdAt: n.createdAt,
      daysOld: Math.floor((new Date() - new Date(n.createdAt)) / (1000 * 60 * 60 * 24)),
      readyToSend: (new Date() - new Date(n.createdAt)) >= (365 * 24 * 60 * 60 * 1000) - (24 * 60 * 60 * 1000)
    }))
  });
});

// Static files (must be after API routes)
app.use(express.static('public'));

// Start server
app.listen(PORT, () => {
  console.log(`Time Capsule Diary server running at http://localhost:${PORT}`);
  console.log('\nEmail Testing Endpoints:');
  console.log(`  - Test email config: http://localhost:${PORT}/api/test-email?email=your@email.com`);
  console.log(`  - Check email status: http://localhost:${PORT}/api/email-status`);
  console.log(`  - Manual email check: POST http://localhost:${PORT}/api/test-email-check`);
  console.log('');
});

