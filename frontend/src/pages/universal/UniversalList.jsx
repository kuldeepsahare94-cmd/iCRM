import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Kanban as KanbanIcon } from 'lucide-react';
import { ModuleIcon } from '../../components/moduleIcons';
import { api } from '../../api';
import { usePermissions } from '../../context/usePermissions';
import StatusBadge from '../../components/StatusBadge';
import { downloadCSV } from '../../utils/csv';
import { getFieldValue, formatFieldValue, FieldInput, recordTitle } from './fieldUtils';
import { computeFollowupStatus, findFollowupField } from './followupUtils';

const STATUS_TYPES = new Set(['status', 'contact_status', 'priority']);

export default function UniversalList() {
  const { moduleApiName } = useParams();
  const navigate = useNavigate();
  const can = usePermissions();

  const [module, setModule] = useState(null);
  const [fields, setFields] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getModuleMeta(moduleApiName)
      .then(async (mod) => {
        setModule(mod);
        const f = await api.listModuleFields(mod.id);
        setFields(f);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [moduleApiName]);

  const load = () => {
    if (!module) return;
    api.universalList(module, { q }).then(setRecords).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, [module]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);

  const listFields = useMemo(() => fields.filter((f) => f.show_in_list), [fields]);
  const createFields = useMemo(() => fields.filter((f) => f.show_in_create), [fields]);
  const statusField = useMemo(() => fields.find((f) => STATUS_TYPES.has(f.api_name)), [fields]);
  const followupField = useMemo(() => findFollowupField(fields), [fields]);

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="p-8 text-warn text-sm">{error}</div>;
  if (!module) return null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.universalCreate(module, form);
      setForm({});
      setShowForm(false);
      load();
    } catch (err) {
      alert('Could not save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => downloadCSV(`${module.api_name}.csv`, records.map((r) => {
    const row = { id: r.id };
    listFields.forEach((f) => { row[f.label] = getFieldValue(r, f); });
    return row;
  }));

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${module.color}22`, color: module.color }}>
            <ModuleIcon name={module.icon} className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{module.plural_label}</h1>
            {module.description && <p className="text-sm text-slate-500 mt-1">{module.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {module.has_pipeline && (
            <button onClick={() => navigate(`/records/${module.api_name}/kanban`)}
              className="border border-line text-sm font-medium px-4 py-2 rounded-lg hover:bg-white inline-flex items-center gap-2">
              <KanbanIcon className="w-4 h-4" /> Kanban
            </button>
          )}
          {can(module.api_name, 'export') && (
            <button onClick={exportCsv} className="border border-line text-sm font-medium px-4 py-2 rounded-lg hover:bg-white">Export CSV</button>
          )}
          {can(module.api_name, 'create') && (
            <button onClick={() => setShowForm((s) => !s)} className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
              {showForm ? 'Cancel' : `+ Add ${module.singular_label}`}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-5 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${module.plural_label.toLowerCase()}…`}
          className="border border-line rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" />
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border border-line rounded-xl p-5 mt-5 grid grid-cols-2 gap-4">
          {createFields.map((f) => (
            <div key={f.id} className={f.field_type === 'textarea' ? 'col-span-2' : ''}>
              <label className="text-xs text-slate-500 font-medium block mb-1">{f.label}{f.required ? ' *' : ''}</label>
              <FieldInput field={f} value={form[f.api_name]} onChange={(v) => setForm({ ...form, [f.api_name]: v })} />
            </div>
          ))}
          <button type="submit" disabled={saving} className="col-span-2 bg-amber text-white text-sm font-medium py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : `Save ${module.singular_label.toLowerCase()}`}
          </button>
        </form>
      )}

      <div className="bg-white border border-line rounded-xl mt-6 overflow-hidden overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 bg-canvas border-b border-line">
              {listFields.map((f) => <th key={f.id} className="py-3 px-4 font-medium">{f.label}</th>)}
              {listFields.length === 0 && <th className="py-3 px-4 font-medium">Record</th>}
              {followupField && <th className="py-3 px-4 font-medium">Follow-up</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-b border-line/60 hover:bg-amber-soft/40 transition-colors cursor-pointer"
                onClick={() => navigate(`/records/${module.api_name}/${r.id}`)}>
                {listFields.length > 0 ? listFields.map((f, i) => (
                  <td key={f.id} className="py-3 px-4">
                    {i === 0 ? (
                      <Link to={`/records/${module.api_name}/${r.id}`} onClick={(e) => e.stopPropagation()} className="text-ink font-medium hover:text-amber">
                        {formatFieldValue(getFieldValue(r, f), f)}
                      </Link>
                    ) : f.api_name === statusField?.api_name ? (
                      <StatusBadge status={getFieldValue(r, f)} />
                    ) : (
                      <span className="text-slate-500">{formatFieldValue(getFieldValue(r, f), f)}</span>
                    )}
                  </td>
                )) : (
                  <td className="py-3 px-4"><Link to={`/records/${module.api_name}/${r.id}`} className="text-ink font-medium hover:text-amber">{recordTitle(r, fields)}</Link></td>
                )}
                {followupField && (
                  <td className="py-3 px-4">
                    {(() => { const s = computeFollowupStatus(getFieldValue(r, followupField)); return (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} /> {s.label}
                      </span>
                    ); })()}
                  </td>
                )}
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={Math.max(listFields.length, 1) + (followupField ? 1 : 0)} className="py-8 text-center text-slate-400">
                No {module.plural_label.toLowerCase()} yet. Add your first one above.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
