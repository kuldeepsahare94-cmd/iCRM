import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api';

const MODULES = ['leads', 'students', 'courses', 'admissions', 'payments', 'companies', 'placements', 'reports', 'users', 'settings'];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];
const ACTION_KEYS = { view: 'can_view', create: 'can_create', edit: 'can_edit', delete: 'can_delete', export: 'can_export' };

function titleCase(s) { return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [activeRoleId, setActiveRoleId] = useState(null);
  const [matrix, setMatrix] = useState({});
  const [newRoleName, setNewRoleName] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = () => api.listRoles().then((rs) => {
    setRoles(rs);
    if (!activeRoleId && rs.length) setActiveRoleId(rs[0].id);
  });
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const role = roles.find((r) => r.id === activeRoleId);
    if (!role) return;
    const m = {};
    for (const mod of MODULES) {
      const p = role.permissions.find((x) => x.module === mod) || {};
      m[mod] = { view: !!p.can_view, create: !!p.can_create, edit: !!p.can_edit, delete: !!p.can_delete, export: !!p.can_export };
    }
    setMatrix(m);
    setDirty(false);
  }, [activeRoleId, roles]);

  const toggle = (mod, action) => {
    setMatrix((m) => ({ ...m, [mod]: { ...m[mod], [action]: !m[mod][action] } }));
    setDirty(true);
  };

  const save = async () => {
    const permissions = MODULES.map((mod) => ({
      module: mod,
      can_view: matrix[mod].view, can_create: matrix[mod].create, can_edit: matrix[mod].edit,
      can_delete: matrix[mod].delete, can_export: matrix[mod].export,
    }));
    await api.updateRolePermissions(activeRoleId, permissions);
    setDirty(false);
    load();
  };

  const addRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    const role = await api.createRole({ name: newRoleName.trim() });
    setNewRoleName('');
    await load();
    setActiveRoleId(role.id);
  };

  const activeRole = roles.find((r) => r.id === activeRoleId);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-soft text-amber flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Roles &amp; Permissions</h1>
          <p className="text-sm text-slate-500 mt-1">Module-wise View / Create / Edit / Delete / Export access per role.</p>
        </div>
      </div>

      <div className="flex gap-2 mt-6 flex-wrap items-center">
        {roles.map((r) => (
          <button key={r.id} onClick={() => setActiveRoleId(r.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
              activeRoleId === r.id ? 'bg-ink text-white border-ink' : 'border-line text-slate-500 hover:border-ink/40'
            }`}>
            {r.name}
          </button>
        ))}
        <form onSubmit={addRole} className="flex gap-1 ml-2">
          <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="New role name…"
            className="border border-line rounded-lg px-2 py-1 text-xs w-32" />
          <button type="submit" className="text-xs border border-line rounded-lg px-2 py-1 hover:bg-white">+ Add</button>
        </form>
      </div>

      {activeRole && (
        <div className="bg-white border border-line rounded-xl mt-6 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 bg-canvas border-b border-line">
                <th className="py-3 px-4 font-medium">Module</th>
                {ACTIONS.map((a) => <th key={a} className="py-3 px-4 font-medium text-center capitalize">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod) => (
                <tr key={mod} className="border-b border-line/60">
                  <td className="py-2.5 px-4 text-ink font-medium">{titleCase(mod)}</td>
                  {ACTIONS.map((a) => (
                    <td key={a} className="py-2.5 px-4 text-center">
                      <input type="checkbox" checked={!!matrix[mod]?.[a]} onChange={() => toggle(mod, a)}
                        disabled={activeRole.is_system && activeRole.name === 'Super Admin'}
                        className="w-4 h-4 accent-amber" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {activeRole.is_system && activeRole.name === 'Super Admin' && (
            <p className="text-xs text-slate-400 px-4 py-3 border-t border-line">Super Admin always has full access and can't be restricted.</p>
          )}
        </div>
      )}

      {dirty && (
        <button onClick={save} className="mt-4 bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
          Save permission changes
        </button>
      )}
    </div>
  );
}
