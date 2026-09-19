// ============================================================================
// Demo data endpoints — what sits behind Settings → Demo Data.
// ============================================================================
// This used to build the sample data inline: eight leads, three accounts, one
// quotation. Enough to prove a screen rendered, nowhere near enough to show
// the product to a customer — the reports were empty, the dashboard was
// empty, and every record's Activities tab was empty.
//
// The generation now lives in services/demoData.js, which produces a CRM that
// looks like it has been in use for a year. This file only decides who may
// run it and what to report back.
// ============================================================================

const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const demoData = require('../services/demoData');

// Loading is always a replace, not an append. Clicking the button twice used
// to be the fastest way to get two of everything; now the second click clears
// what the first one made and rebuilds it, so the result is the same either
// way. Only rows this generator created are removed — anything a real user
// entered is matched by none of the wipe conditions and is left alone.
router.post('/seed-demo-data', requirePermission('settings', 'edit'), (req, res) => {
  try {
    const replaced = demoData.hasDemoData();
    if (replaced) demoData.wipe();
    const counts = demoData.seed();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({
      message: replaced
        ? `Demo data reloaded — ${total.toLocaleString('en-IN')} records across every module.`
        : `Demo data loaded — ${total.toLocaleString('en-IN')} records across every module.`,
      replaced,
      total,
      counts,
    });
  } catch (err) {
    console.error('[demo-data] seed failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Could not load demo data.' });
  }
});

router.delete('/demo-data', requirePermission('settings', 'edit'), (req, res) => {
  try {
    const counts = demoData.wipe();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({
      message: total
        ? `Removed ${total.toLocaleString('en-IN')} demo records. Your own records were not touched.`
        : 'There was no demo data to remove.',
      total,
      counts,
    });
  } catch (err) {
    console.error('[demo-data] wipe failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Could not remove demo data.' });
  }
});

// Lets the settings screen say what is currently loaded instead of offering a
// button whose effect the user has to guess at.
router.get('/demo-data', requirePermission('settings', 'view'), (req, res) => {
  res.json({ loaded: demoData.hasDemoData(), counts: demoData.summary() });
});

module.exports = router;
