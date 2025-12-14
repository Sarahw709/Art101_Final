# Time Capsule Diary

A retro pixel-style digital time capsule diary web application. Write notes to yourself that persist across sessions.

## Features

- ✍️ Write and save personal notes
- 🔍 Search through your notes
- 📝 Edit and delete notes
- 💾 Persistent storage (notes save to file)
- 🎨 Retro pixel aesthetic with beige/brown theme
- 📧 **Email Time Capsule**: Provide your email when creating a note, and receive it back exactly one year later!

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

1. On the landing page, click "write something" to enter the diary
2. Click "create new note" to write a new entry
3. Use the search bar to find specific notes
4. Edit or delete notes using the buttons on each note card

## Notes Storage

Notes are saved to `notes.json` in the project root. This file persists even when the server stops, so your notes are always safe!

## Email Time Capsule Feature

When creating a note, you can optionally provide your email address. After exactly one year, you'll receive an email with your note from the past!

### Setting Up Email

1. Create a `.env` file in the project root (or set environment variables):
   ```bash
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_HOST=smtp.gmail.com  # Optional, defaults to Gmail
   SMTP_PORT=587              # Optional, defaults to 587
   ```

2. **For Gmail users**: You'll need to create an [App Password](https://support.google.com/accounts/answer/185833) instead of using your regular password:
   - Go to your Google Account settings
   - Enable 2-Step Verification
   - Generate an App Password for "Mail"
   - Use that App Password as `SMTP_PASS`

3. The server will automatically check daily at 9:00 AM and send emails for notes that are exactly one year old.

**Note**: If email is not configured, the app will still work normally - you just won't receive time capsule emails. The server will log a warning on startup if email is not configured.

### Testing Email Functionality

After setting up your email credentials, you can test if everything is working:

1. **Test Email Configuration** - Send a test email to verify your setup:
   ```
   http://localhost:3000/api/test-email?email=your@email.com
   ```
   This will send a test email to verify your SMTP configuration is correct.

2. **Check Email Status** - See the current email configuration and statistics:
   ```
   http://localhost:3000/api/email-status
   ```
   This shows:
   - Whether email is configured
   - How many notes have email addresses
   - How many emails are pending/sent
   - Which notes are ready to be sent

3. **Manually Trigger Email Check** - Test the email sending process:
   ```bash
   curl -X POST http://localhost:3000/api/test-email-check
   ```
   This manually runs the email check (normally runs daily at 9 AM).

4. **Check Server Logs** - When the server starts, it will show:
   - ✓ Email service configured (if working)
   - ⚠ Email service not configured (if credentials missing)
   - Email testing endpoints available

**Quick Test**: Create a note with your email, then check `/api/email-status` to see it listed. The email will be sent automatically after exactly one year.

