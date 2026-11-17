require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── App & Config ──────────────────────────────────────────────
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// ── Database ──────────────────────────────────────────────────
const dbFile = path.resolve(process.env.DATABASE_FILE || './data/one-day-farmer.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id            TEXT PRIMARY KEY,
    reference     TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    interest      TEXT,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL,
    email         TEXT,
    city          TEXT,
    preferred_date TEXT,
    guests        TEXT,
    notes         TEXT,
    consent_at    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'new',
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
`);

// ── Middleware ─────────────────────────────────────────────────
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Rate limiter for lead submissions
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again later.' },
});

// ── Validation ────────────────────────────────────────────────
const leadSchema = z.object({
  leadType: z.enum(['booking', 'city_waitlist', 'farmer']).default('booking'),
  interest: z.string().trim().max(160).optional().default(''),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(20).regex(/^[+0-9() .-]+$/),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().default(''),
  date: z.string().optional().default(''),
  guests: z.string().max(20).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  consent: z.boolean(),
  website: z.string().optional().default(''),   // honeypot
}).strict();

// ── Admin auth middleware ─────────────────────────────────────
function admin(req, res, next) {
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 32) {
    return res.status(503).json({ error: 'Admin is not configured. Set ADMIN_TOKEN to at least 32 characters.' });
  }
  const header = req.get('authorization') || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// ── Public routes ─────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'one-day-farmer' });
});

// Submit a lead
app.post('/api/leads', limiter, (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please check the form fields and try again.' });
  }

  const v = parsed.data;

  // Honeypot — bots that fill hidden field get a fake success
  if (v.website) {
    return res.status(201).json({ ok: true, reference: 'ODF-RECEIVED' });
  }

  if (!v.consent) {
    return res.status(400).json({ error: 'Please accept the privacy notice.' });
  }

  if (v.leadType === 'city_waitlist' && !v.city) {
    return res.status(400).json({ error: 'Please select your city.' });
  }

  const id = crypto.randomUUID();
  const reference = 'ODF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const now = new Date().toISOString();
  const type = v.interest === 'Farmer partnership' ? 'farmer' : v.leadType;

  db.prepare(`
    INSERT INTO leads (id, reference, type, interest, name, phone, email, city, preferred_date, guests, notes, consent_at, status, created_at)
    VALUES (@id, @reference, @type, @interest, @name, @phone, @email, @city, @date, @guests, @notes, @consent, 'new', @created)
  `).run({
    id, reference, type,
    interest: v.interest,
    name: v.name,
    phone: v.phone,
    email: v.email || null,
    city: v.city || null,
    date: v.date || null,
    guests: v.guests || null,
    notes: v.notes || null,
    consent: now,
    created: now,
  });

  res.status(201).json({ ok: true, reference });
});

// ── Admin routes ──────────────────────────────────────────────

// List all leads
app.get('/api/admin/leads', admin, (_req, res) => {
  const leads = db.prepare(`
    SELECT id, reference, type, interest, name, phone, email, city,
           preferred_date, guests, notes, status, created_at
    FROM leads ORDER BY created_at DESC LIMIT 500
  `).all();
  res.json(leads);
});

// Update lead status
app.patch('/api/admin/leads/:id', admin, (req, res) => {
  const parsed = z.object({
    status: z.enum(['new', 'contacted', 'qualified', 'closed', 'spam']),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(parsed.data.status, req.params.id);
  if (!result.changes) {
    return res.status(404).json({ error: 'Enquiry not found' });
  }
  res.json({ ok: true });
});

// Delete a lead
app.delete('/api/admin/leads/:id', admin, (req, res) => {
  const result = db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  if (!result.changes) {
    return res.status(404).json({ error: 'Enquiry not found' });
  }
  res.json({ ok: true });
});

// Stats endpoint
app.get('/api/admin/stats', admin, (_req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS count FROM leads').get().count;

  const statusRows = db.prepare('SELECT status, COUNT(*) AS count FROM leads GROUP BY status').all();
  const byStatus = {};
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  const typeRows = db.prepare('SELECT type, COUNT(*) AS count FROM leads GROUP BY type').all();
  const byType = {};
  for (const row of typeRows) {
    byType[row.type] = row.count;
  }

  res.json({ total, byStatus, byType });
});

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => {
  // Serve 404.html for page requests, JSON for API calls
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const notFoundPage = path.join(__dirname, '..', 'public', '404.html');
  if (fs.existsSync(notFoundPage)) {
    return res.status(404).sendFile(notFoundPage);
  }
  res.status(404).send('Not found');
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err);
  res.status(500).json({ error: 'Something went wrong.' });
});

// ── Start server ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`One Day Farmer running at http://localhost:${PORT}`);
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 32) {
    console.warn('⚠  Set a strong ADMIN_TOKEN before using admin dashboard.');
  }
});

// ── Graceful shutdown ─────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[${new Date().toISOString()}] ${signal} received — shutting down...`);
  server.close(() => {
    db.close();
    console.log('Database closed. Goodbye.');
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
