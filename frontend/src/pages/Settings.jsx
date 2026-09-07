import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Plus, Trash2, Sparkles, Database, ShieldCheck, Boxes, Zap, GitBranch, Users2 } from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../context/usePermissions';

const LIST_TYPES = [
  { key: 'lead_source', label: 'Lead Source' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'payment_mode', label: 'Payment Mode' },
];

function ReceiptTemplateCard({ template, onSaved }) {
  const [form, setForm] = useState(template);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await api.updateReceiptTemplate(template.id, form);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="bg-white border border-line rounded-xl p-5">
      <h3 className="text-sm font-semibold text-ink mb-3">Institute {template.id} Receipt Template</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Institute Name</label>
          <input className="border border-line rounded-lg px-3 py-2 text-sm w-full" value={form.institute_name || ''}
            onChange={(e) => setForm({ ...form, institute_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Logo URL</label>
          <input className="border border-line rounded-lg px-3 py-2 text-sm w-full" value={form.logo_url || ''}
            placeholder="https://…" onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Address</label>
          <textarea className="border border-line rounded-lg px-3 py-2 text-sm w-full" value={form.address || ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">GST Details</label>
          <input className="border border-line rounded-lg px-3 py-2 text-sm w-full" value={form.gst_details || ''}
            onChange={(e) => setForm({ ...form, gst_details: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Footer Text</label>
          <textarea className="border border-line rounded-lg px-3 py-2 text-sm w-full" value={form.footer_text || ''}
            onChange={(e) => setForm({ ...form, footer_text: e.target.value })} />
        </div>
        <button onClick={save} disabled={saving} className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}

function OptionList({ listType, label }) {
  const [options, setOptions] = useState([]);
  const [newLabel, setNewLabel] = useState('');

  const load = () => api.listMasterOptions(listType).then(setOptions);
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    await api.createMasterOption({ list_type: listType, label: newLabel.trim(), sort_order: options.length });
    setNewLabel('');
    load();
  };

  const remove = async (o) => { await api.deleteMasterOption(o.id); load(); };

  return (
    <div className="bg-white border border-line rounded-xl p-5">
      <h3 className="text-sm font-semibold text-ink mb-3">{label}</h3>
      <ul className="space-y-1.5 mb-3">
        {options.map((o) => (
          <li key={o.id} className="flex items-center justify-between text-sm bg-canvas rounded-lg px-3 py-1.5">
            {o.label}
            <button onClick={() => remove(o)} className="text-slate-400 hover:text-warn"><Trash2 className="w-3.5 h-3.5" /></button>
          </li>
        ))}
        {options.length === 0 && <li className="text-sm text-slate-400">No options yet.</li>}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Add option…"
          className="border border-line rounded-lg px-3 py-1.5 text-sm flex-1" />
        <button type="submit" className="border border-line rounded-lg px-3 py-1.5 text-sm hover:bg-canvas"><Plus className="w-4 h-4" /></button>
      </form>
    </div>
  );
}

function AiAuditLog() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.assistantAuditLog().then(setRows).catch(() => setRows([])); }, []);
  if (rows === null) return null;
  return (
    <div className="bg-white border border-line rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 bg-canvas border-b border-line">
            <th className="py-2.5 px-4 font-medium">When</th>
            <th className="py-2.5 px-4 font-medium">User</th>
            <th className="py-2.5 px-4 font-medium">Tool</th>
            <th className="py-2.5 px-4 font-medium">Type</th>
            <th className="py-2.5 px-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/60">
              <td className="py-2 px-4 text-xs text-slate-400 whitespace-nowrap">{r.created_at}</td>
              <td className="py-2 px-4 text-slate-600">{r.username}</td>
              <td className="py-2 px-4 text-ink font-medium">{r.tool_name}</td>
              <td className="py-2 px-4 text-slate-500">{r.is_write ? 'Write' : 'Read'}</td>
              <td className="py-2 px-4">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  r.status === 'success' ? 'bg-emerald-100 text-good' : r.status === 'denied' ? 'bg-red-50 text-warn' : 'bg-amber-soft text-amber'
                }`}>{r.status}</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">No AI assistant activity yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Settings() {
  const can = usePermissions();
  const [templates, setTemplates] = useState([]);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const load = () => api.listReceiptTemplates().then(setTemplates);
  useEffect(() => { load(); }, []);

  const seedDemoData = async () => {
    if (!confirm('This will add sample leads, students, courses, admissions, payments, companies, and placements. Continue?')) return;
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await api.seedDemoData();
      setSeedResult(res);
    } catch (err) {
      alert('Could not load demo data: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const [downloading, setDownloading] = useState(false);
  const [emailingBackup, setEmailingBackup] = useState(false);
  const [backupResult, setBackupResult] = useState(null);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      await api.downloadBackup();
    } catch (err) {
      alert('Could not download backup: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const emailBackup = async () => {
    setEmailingBackup(true);
    setBackupResult(null);
    try {
      const res = await api.emailBackupNow();
      setBackupResult({ ok: true, message: `Sent to ${res.sent_to} (${res.size_mb} MB)` });
    } catch (err) {
      setBackupResult({ ok: false, message: err.message });
    } finally {
      setEmailingBackup(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-soft text-amber flex items-center justify-center">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Receipt templates and master option lists.</p>
        </div>
      </div>

      {can('settings', 'edit') && (
        <Link to="/settings/modules"
          className="bg-white border border-line rounded-xl p-5 mt-8 flex items-center justify-between flex-wrap gap-3 hover:border-amber transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Modules &amp; Fields</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Create custom modules (Vendors, Properties, ...), add fields to any module, and control what shows where.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-amber shrink-0">Open →</span>
        </Link>
      )}

      {can('settings', 'edit') && (
        <Link to="/settings/workflows"
          className="bg-white border border-line rounded-xl p-5 mt-4 flex items-center justify-between flex-wrap gap-3 hover:border-amber transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Workflows</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automate what happens when a record is created, updated, or a field changes.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-amber shrink-0">Open →</span>
        </Link>
      )}

      {can('settings', 'edit') && (
        <Link to="/settings/pipelines"
          className="bg-white border border-line rounded-xl p-5 mt-4 flex items-center justify-between flex-wrap gap-3 hover:border-amber transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Pipelines</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Define the stages deals move through — names, colours, and win probability.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-amber shrink-0">Open →</span>
        </Link>
      )}

      {can('settings', 'edit') && (
        <Link to="/settings/teams"
          className="bg-white border border-line rounded-xl p-5 mt-4 flex items-center justify-between flex-wrap gap-3 hover:border-amber transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <Users2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Teams</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Group users into teams so records can be assigned to a team, not just an individual.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-amber shrink-0">Open →</span>
        </Link>
      )}

      {can('settings', 'edit') && (
        <div className="bg-white border border-line rounded-xl p-5 mt-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Load Demo Data</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Adds sample leads, courses, students, admissions, payments, companies &amp; placements so every module has something to view.
                {seedResult && (
                  <span className="block text-good mt-1">
                    Added: {Object.entries(seedResult.counts).map(([k, v]) => `${v} ${k}`).join(', ')}.
                  </span>
                )}
              </p>
            </div>
          </div>
          <button onClick={seedDemoData} disabled={seeding}
            className="bg-ink text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-ink-light disabled:opacity-60 shrink-0">
            {seeding ? 'Loading…' : 'Load Demo Data'}
          </button>
        </div>
      )}

      {can('settings', 'edit') && (
        <div className="bg-white border border-line rounded-xl p-5 mt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-good flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Database Backup</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                A safety net, not a fix — if you're on a hosting plan without a persistent disk (e.g. Render's free tier),
                your data resets on every restart regardless of backups. Download or email yourself a copy before any risky change.
              </p>
            </div>
          </div>
          {backupResult && (
            <p className={`text-xs mb-3 ${backupResult.ok ? 'text-good' : 'text-warn'}`}>{backupResult.message}</p>
          )}
          <div className="flex gap-2">
            <button onClick={downloadBackup} disabled={downloading}
              className="border border-line text-sm font-medium px-4 py-2 rounded-lg hover:bg-canvas disabled:opacity-60">
              {downloading ? 'Downloading…' : 'Download Backup Now'}
            </button>
            <button onClick={emailBackup} disabled={emailingBackup}
              className="border border-line text-sm font-medium px-4 py-2 rounded-lg hover:bg-canvas disabled:opacity-60">
              {emailingBackup ? 'Sending…' : 'Email Backup to Myself'}
            </button>
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-ink mt-8 mb-3">Receipt Templates</h2>
      <p className="text-xs text-slate-400 mb-4">
        Configure the two institute templates used on the Payments page. Fields still showing placeholders like
        "[Institute A Name — configure in Settings]" haven't been filled in yet.
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        {templates.map((t) => <ReceiptTemplateCard key={t.id} template={t} onSaved={load} />)}
      </div>

      <h2 className="text-sm font-semibold text-ink mt-8 mb-3">Master Option Lists</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {LIST_TYPES.map((l) => <OptionList key={l.key} listType={l.key} label={l.label} />)}
      </div>

      {can('users', 'view') && (
        <>
          <h2 className="text-sm font-semibold text-ink mt-8 mb-3 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber" /> AI Assistant Activity Log
          </h2>
          <p className="text-xs text-slate-400 mb-3">Every query and action the AI assistant has run, per user, for audit purposes.</p>
          <AiAuditLog />
        </>
      )}
    </div>
  );
}
