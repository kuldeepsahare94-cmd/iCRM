const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function loadPermissions(roleId) {
  if (!roleId) return {};
  const rows = db.prepare('SELECT * FROM role_permissions WHERE role_id=?').all(roleId);
  const map = {};
  for (const r of rows) {
    map[r.module] = {
      view: !!r.can_view,
      create: !!r.can_create,
      edit: !!r.can_edit,
      delete: !!r.can_delete,
      export: !!r.can_export,
    };
  }
  return map;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.active, u.role_id, r.name AS role_name
      FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id=?
    `).get(payload.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Account is inactive or no longer exists' });
    user.permissions = loadPermissions(user.role_id);
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

function requirePermission(module, action) {
  return (req, res, next) => {
    const perm = req.user && req.user.permissions && req.user.permissions[module];
    if (!perm || !perm[action]) {
      return res.status(403).json({ error: `You don't have ${action} access to ${module}` });
    }
    next();
  };
}

module.exports = { requireAuth, requirePermission, loadPermissions, JWT_SECRET };
