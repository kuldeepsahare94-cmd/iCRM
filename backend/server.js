const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { requireAuth } = require('./middleware/auth');

// ---- Universal CRM metadata layer (Phases 1–8) — must load before any
// route below that touches modules/fields/accounts/contacts/opportunities/
// quotations/products/subscriptions/tickets, since these files create the
// tables and seed data those routes depend on. ----
require('./db-metadata');
require('./db-phase2');
require('./db-phase3-fields');
require('./db-phase12-activities');
require('./db-phase16-workflows');
require('./db-phase21-generalize');
require('./db-phase24-teams-docs');

const app = express();

// Universal lead capture — PUBLIC, called cross-origin from arbitrary customer
// websites, so it needs its OWN permissive CORS and must be registered
// BEFORE the restrictive global cors() below — otherwise that global rule
// (locked to FRONTEND_URL) would block every third-party site's browser
// requests before they ever reach this route.
app.use('/api/capture', cors(), express.json(), require('./routes/leadCapture'));

// In production, set FRONTEND_URL to your Vercel URL (e.g. https://your-crm.vercel.app)
// so only your deployed frontend can call this API. Left open (*) if unset, for local dev.
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// WhatsApp webhook receiver — PUBLIC (providers can't send our JWT) and needs
// the raw request body for signature verification, so it's registered here,
// before the global JSON parser below. Route handlers respond directly and
// never call next(), so express.json() never touches these requests.
app.use('/api/whatsapp/webhook', express.raw({ type: '*/*', limit: '2mb' }), require('./routes/whatsappWebhook'));

// Facebook/Instagram Lead Ads webhook — same reasoning as the WhatsApp one:
// public, needs the raw body for Meta's HMAC signature check, must be
// registered before the global JSON parser.
app.use('/api/social-leads', express.raw({ type: '*/*', limit: '1mb' }), require('./routes/leadSourcesSocial'));

app.use(express.json());

// Public routes
app.use('/api/auth', require('./routes/auth'));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Everything below requires a valid, active login
app.use('/api/leads', requireAuth, require('./routes/leads'));
app.use('/api/payments', requireAuth, require('./routes/payments'));
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api/reports', requireAuth, require('./routes/reports'));
app.use('/api/notifications', requireAuth, require('./routes/notifications'));
app.use('/api/roles', requireAuth, require('./routes/roles'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api/settings', requireAuth, require('./routes/settings'));
app.use('/api/assistant', requireAuth, require('./routes/assistant'));
app.use('/api/dev', requireAuth, require('./routes/dev'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsapp'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsappWorkflows'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsappCampaigns'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsappConversations'));
app.use('/api/whatsapp', requireAuth, require('./routes/whatsappAnalytics'));
app.use('/api/lead-sources', require('./routes/leadSourcesFacebookOAuth')); // own per-route auth — /facebook/callback must stay public, so this must be mounted BEFORE the blanket-requireAuth router below
app.use('/api/lead-sources', requireAuth, require('./routes/leadSources'));
app.use('/api/backup', requireAuth, require('./routes/backup'));

// ---- Universal CRM (Phases 1–8) ----
// Metadata layer: module + field registry, generic relationships, and CRUD
// for admin-created custom modules that have no dedicated table yet.
app.use('/api/modules', requireAuth, require('./routes/modules'));
app.use('/api/modules', requireAuth, require('./routes/fields'));
app.use('/api/modules', requireAuth, require('./routes/layouts'));
app.use('/api/relationships', requireAuth, require('./routes/relationships'));
app.use('/api/records', requireAuth, require('./routes/customRecords'));
// Core modules with their own real tables + dedicated routes.
app.use('/api/accounts', requireAuth, require('./routes/accounts'));
app.use('/api/contacts', requireAuth, require('./routes/contacts'));
app.use('/api/opportunities', requireAuth, require('./routes/opportunities'));
app.use('/api/products', requireAuth, require('./routes/products'));
app.use('/api/quotations', requireAuth, require('./routes/quotations'));
app.use('/api/subscriptions', requireAuth, require('./routes/subscriptions'));
app.use('/api/tickets', requireAuth, require('./routes/tickets'));
app.use('/api/calls', requireAuth, require('./routes/calls'));
app.use('/api/meetings', requireAuth, require('./routes/meetings'));
app.use('/api/tasks', requireAuth, require('./routes/tasks'));
app.use('/api/notes', requireAuth, require('./routes/notes'));
app.use('/api/emails', requireAuth, require('./routes/emails'));
app.use('/api/activities', requireAuth, require('./routes/activities'));
app.use('/api/search', requireAuth, require('./routes/search'));
app.use('/api/workflows', requireAuth, require('./routes/workflows'));
app.use('/api/pipelines', requireAuth, require('./routes/pipelines'));
app.use('/api/teams', requireAuth, require('./routes/teams'));
app.use('/api/documents', requireAuth, require('./routes/documents'));
app.use('/api/ai-actions', requireAuth, require('./routes/aiActions'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Placement CRM API running on port ${PORT}`));
