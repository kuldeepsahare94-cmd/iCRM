const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../middleware/auth');

// All reports support the same query params: from, to (date range on created_at/relevant date),
// plus report-specific filters. Frontend handles Export to Excel/PDF/Print client-side (CSV + window.print),
// same pattern as the base project's utils/csv.js.

const dateFilter = (col, from, to) => {
  const clauses = [];
  const params = [];
  if (from) { clauses.push(`date(${col}) >= date(?)`); params.push(from); }
  if (to) { clauses.push(`date(${col}) <= date(?)`); params.push(to); }
  return { clause: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params };
};

router.get('/leads', requirePermission('reports', 'view'), (req, res) => {
  const { from, to, status } = req.query;
  const { clause, params } = dateFilter('l.created_at', from, to);
  let sql = `SELECT l.*, c.course_name AS interested_course_name FROM leads l LEFT JOIN courses c ON c.id = l.interested_course_id WHERE 1=1${clause}`;
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  res.json(db.prepare(sql).all(...params));
});

router.get('/students', requirePermission('reports', 'view'), (req, res) => {
  const { from, to, status } = req.query;
  const { clause, params } = dateFilter('s.created_at', from, to);
  let sql = `SELECT * FROM students s WHERE 1=1${clause}`;
  if (status) { sql += ' AND s.status = ?'; params.push(status); }
  res.json(db.prepare(sql).all(...params));
});

router.get('/admissions', requirePermission('reports', 'view'), (req, res) => {
  const { from, to, status, course_id } = req.query;
  const { clause, params } = dateFilter('a.created_at', from, to);
  let sql = `SELECT a.*, s.student_name, c.course_name FROM admissions a
    JOIN students s ON s.id = a.student_id JOIN courses c ON c.id = a.course_id WHERE 1=1${clause}`;
  if (status) { sql += ' AND a.admission_status = ?'; params.push(status); }
  if (course_id) { sql += ' AND a.course_id = ?'; params.push(course_id); }
  res.json(db.prepare(sql).all(...params));
});

router.get('/course-wise-admissions', requirePermission('reports', 'view'), (req, res) => {
  res.json(db.prepare(`
    SELECT c.course_name, COUNT(a.id) total_admissions,
      SUM(CASE WHEN a.admission_status = 'Active' THEN 1 ELSE 0 END) active,
      SUM(CASE WHEN a.admission_status = 'Completed' THEN 1 ELSE 0 END) completed
    FROM courses c LEFT JOIN admissions a ON a.course_id = c.id
    GROUP BY c.id ORDER BY total_admissions DESC
  `).all());
});

router.get('/fee-collection', requirePermission('reports', 'view'), (req, res) => {
  const { from, to } = req.query;
  const { clause, params } = dateFilter('p.payment_date', from, to);
  const sql = `SELECT p.*, s.student_name, c.course_name FROM payments p
    JOIN students s ON s.id = p.student_id JOIN courses c ON c.id = p.course_id
    WHERE p.status = 'Paid'${clause} ORDER BY p.payment_date DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/pending-fees', requirePermission('reports', 'view'), (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, s.student_name, s.mobile, c.course_name FROM payments p
    JOIN students s ON s.id = p.student_id JOIN courses c ON c.id = p.course_id
    WHERE p.status IN ('Pending','Partial') ORDER BY p.created_at
  `).all());
});

router.get('/payments', requirePermission('reports', 'view'), (req, res) => {
  const { from, to, status } = req.query;
  const { clause, params } = dateFilter('p.created_at', from, to);
  let sql = `SELECT p.*, s.student_name, c.course_name FROM payments p
    JOIN students s ON s.id = p.student_id JOIN courses c ON c.id = p.course_id WHERE 1=1${clause}`;
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  res.json(db.prepare(sql).all(...params));
});

router.get('/placements', requirePermission('reports', 'view'), (req, res) => {
  const { from, to, result } = req.query;
  const { clause, params } = dateFilter('pl.created_at', from, to);
  let sql = `SELECT pl.*, s.student_name, co.company_name FROM placements pl
    JOIN students s ON s.id = pl.student_id JOIN companies co ON co.id = pl.company_id WHERE 1=1${clause}`;
  if (result) { sql += ' AND pl.result = ?'; params.push(result); }
  res.json(db.prepare(sql).all(...params));
});

router.get('/interviews', requirePermission('reports', 'view'), (req, res) => {
  const { from, to, status } = req.query;
  const { clause, params } = dateFilter('pl.interview_date', from, to);
  let sql = `SELECT pl.*, s.student_name, co.company_name FROM placements pl
    JOIN students s ON s.id = pl.student_id JOIN companies co ON co.id = pl.company_id WHERE 1=1${clause}`;
  if (status) { sql += ' AND pl.interview_status = ?'; params.push(status); }
  res.json(db.prepare(sql).all(...params));
});

router.get('/companies', requirePermission('reports', 'view'), (req, res) => {
  res.json(db.prepare(`
    SELECT co.*, COUNT(pl.id) total_interviews, SUM(CASE WHEN pl.result = 'Selected' THEN 1 ELSE 0 END) selected
    FROM companies co LEFT JOIN placements pl ON pl.company_id = co.id
    GROUP BY co.id ORDER BY co.company_name
  `).all());
});

router.get('/revenue', requirePermission('reports', 'view'), (req, res) => {
  const { from, to } = req.query;
  const { clause, params } = dateFilter('p.payment_date', from, to);
  res.json(db.prepare(`
    SELECT c.course_name, COALESCE(SUM(p.amount),0) revenue, COUNT(p.id) payment_count
    FROM courses c LEFT JOIN payments p ON p.course_id = c.id AND p.status = 'Paid'${clause}
    GROUP BY c.id ORDER BY revenue DESC
  `).all(...params));
});

router.get('/monthly-admissions', requirePermission('reports', 'view'), (req, res) => {
  res.json(db.prepare(`SELECT strftime('%Y-%m', created_at) month, COUNT(*) total FROM admissions GROUP BY month ORDER BY month DESC`).all());
});

router.get('/monthly-collection', requirePermission('reports', 'view'), (req, res) => {
  res.json(db.prepare(`SELECT strftime('%Y-%m', payment_date) month, COALESCE(SUM(amount),0) total FROM payments WHERE status='Paid' AND payment_date IS NOT NULL GROUP BY month ORDER BY month DESC`).all());
});

module.exports = router;
