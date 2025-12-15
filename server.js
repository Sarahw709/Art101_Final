// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const NOTES_FILE = path.join(__dirname, 'notes.json');

// Database configuration - use PostgreSQL if DATABASE_URL is set (production), otherwise use filesystem (local)
const useDatabase = !!process.env.DATABASE_URL;
let dbPool = null;

if (useDatabase) {
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  console.log('✓ Using PostgreSQL database for persistent storage');
} else {
  console.log('✓ Using filesystem storage (local development)');
  // Initialize notes file if it doesn't exist
  if (!fs.existsSync(NOTES_FILE)) {
    fs.writeFileSync(NOTES_FILE, JSON.stringify([], null, 2));
  }
}

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
  transporter = nodemailer.createTransport({
    ...emailConfig,
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000, // 10 seconds
    socketTimeout: 10000, // 10 seconds
  });
  console.log('✓ Email service configured');
  console.log(`  SMTP Host: ${emailConfig.host}:${emailConfig.port}`);
  console.log(`  From Address: ${emailConfig.auth.user}`);
} else {
  console.warn('⚠ Email service not configured. Set SMTP_USER and SMTP_PASS environment variables to enable email functionality.');
}

// Initialize database table if using PostgreSQL
async function initDatabase() {
  if (!useDatabase) return;
  
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id VARCHAR(255) PRIMARY KEY,
        content TEXT NOT NULL,
        author VARCHAR(255) DEFAULT 'Anonymous',
        name VARCHAR(255),
        email VARCHAR(255),
        email_sent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Database table initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize database on startup
initDatabase();

// Middleware
app.use(express.json());

// Helper function to read notes (works with both database and filesystem)
async function readNotes() {
  if (useDatabase) {
    try {
      const result = await dbPool.query(`
        SELECT 
          id,
          content,
          author,
          name,
          email,
          email_sent as "emailSent",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM notes
        ORDER BY created_at DESC
      `);
      return result.rows;
    } catch (error) {
      console.error('Error reading notes from database:', error);
      return [];
    }
  } else {
    // Filesystem fallback
    try {
      const data = fs.readFileSync(NOTES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading notes from file:', error);
      return [];
    }
  }
}

// Helper function to write notes (works with both database and filesystem)
async function writeNotes(notes) {
  if (useDatabase) {
    // For database, we don't write all notes at once - individual operations handle it
    return true;
  } else {
    // Filesystem fallback
    try {
      fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
      return true;
    } catch (error) {
      console.error('Error writing notes to file:', error);
      return false;
    }
  }
}

// API Routes (must be before static middleware)

// Get all notes
app.get('/api/notes', async (req, res) => {
  const notes = await readNotes();
  res.json(notes);
});

// Get a single note by ID
app.get('/api/notes/:id', async (req, res) => {
  if (useDatabase) {
    try {
      const result = await dbPool.query(
        'SELECT id, content, author, name, email, email_sent as "emailSent", created_at as "createdAt", updated_at as "updatedAt" FROM notes WHERE id = $1',
        [req.params.id]
      );
      if (result.rows.length > 0) {
        res.json(result.rows[0]);
      } else {
        res.status(404).json({ error: 'Note not found' });
      }
    } catch (error) {
      console.error('Error fetching note:', error);
      res.status(500).json({ error: 'Failed to fetch note' });
    }
  } else {
    const notes = await readNotes();
    const note = notes.find(n => n.id === req.params.id);
    if (note) {
      res.json(note);
    } else {
      res.status(404).json({ error: 'Note not found' });
    }
  }
});

// Create a new note
app.post('/api/notes', async (req, res) => {
  const { content, author, name, email } = req.body;
  console.log('Received note data:', { content, author, name, email }); // Debug
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Note content is required' });
  }

  const trimmedName = (name && typeof name === 'string' && name.trim().length > 0) ? name.trim() : null;
  const trimmedEmail = (email && typeof email === 'string' && email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) ? email.trim() : null;
  const noteId = Date.now().toString();
  const now = new Date().toISOString();
  
  const newNote = {
    id: noteId,
    content: content.trim(),
    author: author || 'Anonymous',
    name: trimmedName,
    email: trimmedEmail,
    emailSent: false,
    createdAt: now,
    updatedAt: now
  };

  console.log('Creating new note:', newNote); // Debug

  if (useDatabase) {
    try {
      await dbPool.query(
        `INSERT INTO notes (id, content, author, name, email, email_sent, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [noteId, newNote.content, newNote.author, newNote.name, newNote.email, false, now, now]
      );
      console.log('Note saved to database, returning:', newNote);
      res.status(201).json(newNote);
      
      // Send confirmation email if email is provided (don't wait for it)
      if (trimmedEmail) {
        console.log(`Sending confirmation email to ${trimmedEmail}...`);
        sendConfirmationEmail(newNote)
          .then(sent => {
            if (sent) {
              console.log(`✓ Confirmation email sent successfully to ${trimmedEmail}`);
            } else {
              console.log(`⚠ Confirmation email not sent (email service may not be configured)`);
            }
          })
          .catch(err => {
            console.error('✗ Failed to send confirmation email:', err);
          });
      }
    } catch (error) {
      console.error('Error saving note to database:', error);
      res.status(500).json({ error: 'Failed to save note' });
    }
  } else {
    const notes = await readNotes();
    notes.push(newNote);
    if (await writeNotes(notes)) {
      console.log('Note saved to file, returning:', newNote);
      res.status(201).json(newNote);
      
      // Send confirmation email if email is provided (don't wait for it)
      if (trimmedEmail) {
        console.log(`Sending confirmation email to ${trimmedEmail}...`);
        sendConfirmationEmail(newNote)
          .then(sent => {
            if (sent) {
              console.log(`✓ Confirmation email sent successfully to ${trimmedEmail}`);
            } else {
              console.log(`⚠ Confirmation email not sent (email service may not be configured)`);
            }
          })
          .catch(err => {
            console.error('✗ Failed to send confirmation email:', err);
          });
      }
    } else {
      res.status(500).json({ error: 'Failed to save note' });
    }
  }
});

// Update a note
app.put('/api/notes/:id', async (req, res) => {
  const { content, name, email } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Note content is required' });
  }

  const trimmedName = name && name.trim() ? name.trim() : null;
  const trimmedEmail = (email && typeof email === 'string' && email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) ? email.trim() : null;
  const updatedAt = new Date().toISOString();

  if (useDatabase) {
    try {
      // First check if note exists and get current email
      const checkResult = await dbPool.query('SELECT email FROM notes WHERE id = $1', [req.params.id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const currentEmail = checkResult.rows[0].email;
      const emailSent = (trimmedEmail !== currentEmail) ? false : undefined; // Reset if email changed

      const updateFields = ['content = $1', 'name = $2', 'email = $3', 'updated_at = $4'];
      const updateValues = [content.trim(), trimmedName, trimmedEmail, updatedAt];
      
      if (emailSent !== undefined) {
        updateFields.push('email_sent = $5');
        updateValues.push(false);
      }

      await dbPool.query(
        `UPDATE notes SET ${updateFields.join(', ')} WHERE id = $${updateValues.length + 1}`,
        [...updateValues, req.params.id]
      );

      // Fetch updated note
      const result = await dbPool.query(
        'SELECT id, content, author, name, email, email_sent as "emailSent", created_at as "createdAt", updated_at as "updatedAt" FROM notes WHERE id = $1',
        [req.params.id]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating note in database:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  } else {
    const notes = await readNotes();
    const noteIndex = notes.findIndex(n => n.id === req.params.id);
    
    if (noteIndex === -1) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const oldEmail = notes[noteIndex].email;
    notes[noteIndex].content = content.trim();
    notes[noteIndex].name = trimmedName;
    notes[noteIndex].email = trimmedEmail;
    // Reset emailSent if email changed
    if (trimmedEmail !== oldEmail) {
      notes[noteIndex].emailSent = false;
    }
    notes[noteIndex].updatedAt = updatedAt;

    if (await writeNotes(notes)) {
      res.json(notes[noteIndex]);
    } else {
      res.status(500).json({ error: 'Failed to update note' });
    }
  }
});

// Delete a note
app.delete('/api/notes/:id', async (req, res) => {
  if (useDatabase) {
    try {
      const result = await dbPool.query('DELETE FROM notes WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length > 0) {
        res.json({ message: 'Note deleted successfully' });
      } else {
        res.status(404).json({ error: 'Note not found' });
      }
    } catch (error) {
      console.error('Error deleting note from database:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  } else {
    const notes = await readNotes();
    const filteredNotes = notes.filter(n => n.id !== req.params.id);
    
    if (filteredNotes.length === notes.length) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (await writeNotes(filteredNotes)) {
      res.json({ message: 'Note deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete note' });
    }
  }
});

// Helper function to add timeout to promises
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// Send confirmation email when a note is created with an email
async function sendConfirmationEmail(note) {
  if (!transporter) {
    console.log('No transporter available for confirmation email');
    return false;
  }

  if (!note.email) {
    console.log('No email address in note for confirmation email');
    return false;
  }

  try {
    // Try to verify connection (optional - skip if it times out)
    try {
      console.log(`Verifying SMTP connection before sending confirmation email...`);
      await withTimeout(
        transporter.verify(),
        3000, // 3 second timeout for verification
        'SMTP connection verification timed out'
      );
      console.log('SMTP connection verified');
    } catch (verifyError) {
      console.log('⚠ SMTP verification failed/timed out, proceeding with send anyway...');
      // Continue anyway - many SMTP servers work fine even if verify() fails
    }

    const nameDisplay = note.name ? ` ${note.name}` : '';
    const mailOptions = {
      from: emailConfig.auth.user,
      to: note.email,
      subject: 'Thank You for Your Time Capsule Note',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Thank You for Leaving a Note${nameDisplay}!</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Thank you for leaving a note, you will be reminded of this exactly one year from now :)
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This email was sent automatically from your Time Capsule Diary.
          </p>
        </div>
      `,
      text: `Thank You for Leaving a Note${nameDisplay}!\n\nThank you for leaving a note, you will be reminded of this exactly one year from now :)\n\nThis email was sent automatically from your Time Capsule Diary.`
    };

    console.log(`Attempting to send confirmation email to ${note.email}...`);
    await withTimeout(
      transporter.sendMail(mailOptions),
      20000, // 20 second timeout (increased for cloud environments)
      'Email sending timed out after 20 seconds'
    );
    console.log(`✓ Confirmation email sent successfully to ${note.email} for note ${note.id}`);
    return true;
  } catch (error) {
    console.error(`✗ Error sending confirmation email to ${note.email}:`, error.message || error);
    console.error('Error details:', error);
    return false;
  }
}

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
    if (useDatabase) {
      try {
        await dbPool.query('UPDATE notes SET email_sent = TRUE WHERE id = $1', [note.id]);
      } catch (error) {
        console.error('Error updating email_sent in database:', error);
      }
    } else {
      const notes = await readNotes();
      const noteIndex = notes.findIndex(n => n.id === note.id);
      if (noteIndex !== -1) {
        notes[noteIndex].emailSent = true;
        await writeNotes(notes);
      }
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
  const notes = await readNotes();
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
app.get('/api/email-status', async (req, res) => {
  try {
    const notes = await readNotes();
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
  } catch (error) {
    console.error('Error getting email status:', error);
    res.status(500).json({ error: 'Failed to get email status' });
  }
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

