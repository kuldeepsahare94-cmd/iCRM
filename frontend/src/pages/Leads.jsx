import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import Avatar from '../components/Avatar';
import { api } from '../api';
import { usePermissions } from '../context/usePermissions';
import StatusBadge from '../components/StatusBadge';
import { downloadCSV } from '../utils/csv';

const STATUSES = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted', 'Dropped', 'Not Interested'];
const empty = { student_name: '', mobile: '', alternate_mobile: '', email: '', gender: '', date_of_birth: '', address: '', city: '', qualification: '', source: '', status: 'New', follow_up_date: '', assigned_counselor: '', remarks: '' };

export default function Leads() {
  const can = usePermissions();
  const [list, setList] = useState([]);
  const [courses, setCourses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');

  const load = () => api.listLeads({ status: statusFilter, q }).then(setList);
  useEffect(() => { load(); api.listCourses({ status: 'Active' }).then(setCourses); }, [statusFilter]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.createLead({ ...form, interested_course_id: form.interested_course_id || null });
      setForm(empty);
      setShowForm(false);
      load();
    } catch (err) { alert('Could not save: ' + err.message); }
  };

  const exportCsv = () => downloadCSV('leads.csv', list);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-soft text-amber flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Leads</h1>
            <p className="text-sm text-slate-500 mt-1">Enquiries captured from walk-ins, calls, and campaigns.</p>
          </div>
        </div>
        <div className="flex gap-2">
          {can('leads', 'export') && (
            <button onClick={exportCsv} className="border border-line text-sm font-medium px-4 py-2 rounded-lg hover:bg-white">Export CSV</button>
          )}
          {can('leads', 'create') && (
            <button onClick={() => setShowForm((s) => !s)} className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
              {showForm ? 'Cancel' : '+ Add lead'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-5 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, mobile, email…"
          className="border border-line rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border border-line rounded-xl p-5 mt-5 grid grid-cols-2 gap-4">
          <input required placeholder="Student name" className="border border-line rounded-lg px-3 py-2 text-sm col-span-2"
            value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} />
          <input placeholder="Mobile" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input placeholder="Alternate mobile" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.alternate_mobile} onChange={(e) => setForm({ ...form, alternate_mobile: e.target.value })} />
          <input placeholder="Email" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className="border border-line rounded-lg px-3 py-2 text-sm" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Gender</option><option>Male</option><option>Female</option><option>Other</option>
          </select>
          <input type="date" placeholder="Date of birth" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          <input placeholder="City" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input placeholder="Address" className="border border-line rounded-lg px-3 py-2 text-sm col-span-2"
            value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input placeholder="Qualification" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
          <input placeholder="Source (Referral, Walk-in, Google…)" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <select className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.interested_course_id || ''} onChange={(e) => setForm({ ...form, interested_course_id: e.target.value })}>
            <option value="">Interested course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
          </select>
          <select className="border border-line rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input type="date" placeholder="Follow-up date" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
          <input placeholder="Assigned counselor" className="border border-line rounded-lg px-3 py-2 text-sm"
            value={form.assigned_counselor} onChange={(e) => setForm({ ...form, assigned_counselor: e.target.value })} />
          <textarea placeholder="Remarks" className="border border-line rounded-lg px-3 py-2 text-sm col-span-2"
            value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          <button type="submit" className="col-span-2 bg-amber text-white text-sm font-medium py-2 rounded-lg hover:opacity-90">Save lead</button>
        </form>
      )}

      <div className="bg-white border border-line rounded-xl mt-6 overflow-hidden overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 bg-canvas border-b border-line">
              <th className="py-3 px-4 font-medium">Name</th>
              <th className="py-3 px-4 font-medium">Mobile</th>
              <th className="py-3 px-4 font-medium">Source</th>
              <th className="py-3 px-4 font-medium">Follow-up</th>
              <th className="py-3 px-4 font-medium">Counselor</th>
              <th className="py-3 px-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className="border-b border-line/60 hover:bg-amber-soft/40 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={l.student_name} color="amber" />
                    <Link to={`/leads/${l.id}`} className="text-ink font-medium hover:text-amber">{l.student_name}</Link>
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-500">{l.mobile}</td>
                <td className="py-3 px-4 text-slate-500">{l.source}</td>
                <td className="py-3 px-4 text-slate-400 text-xs">{l.follow_up_date?.slice(0, 10) || '—'}</td>
                <td className="py-3 px-4 text-slate-500">{l.assigned_counselor || '—'}</td>
                <td className="py-3 px-4"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">No leads yet. Add your first one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
