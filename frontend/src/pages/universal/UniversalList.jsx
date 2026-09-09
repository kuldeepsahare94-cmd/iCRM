import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Kanban as KanbanIcon, Search, MoreHorizontal, Eye, Pencil, LayoutGrid } from 'lucide-react';
import { ModuleIcon } from '../../components/moduleIcons';
import { api } from '../../api';
import { usePermissions } from '../../context/usePermissions';
import StatusBadge from '../../components/StatusBadge';
import { downloadCSV } from '../../utils/csv';
import { getFieldValue, formatFieldValue, FieldInput, recordTitle } from './fieldUtils';
import { computeFollowupStatus, findFollowupField } from './followupUtils';
import { kpisFor } from './listKpis';
import { KpiCard, SkeletonRows, ErrorState, EmptyState, friendlyError } from '../../components/ui';

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
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState(null);
  const PAGE_SIZE = 25;

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getModuleMeta(moduleApiName)
      .then(async (mod) => {
        setModule(mod);
        const f = await api.listModuleFields(mod.id);
        setFields(f);
      })
      .catch((e) => setError(friendlyError(e, `Unable to load ${moduleApiName}.`)))
      .finally(() => setLoading(false));
  }, [moduleApiName]);

  const load = () => {
    if (!module) return;
    api.universalList(module, { q }).then(setRecords).catch((e) => setError(friendlyError(e, 'Unable to load records.')));
  };
  useEffect(() => { load(); }, [module]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);

  const listFields = useMemo(() => fields.filter((f) => f.show_in_list), [fields]);
  const createFields = useMemo(() => fields.filter((f) => f.show_in_create), [fields]);
  const statusField = useMemo(() => fields.find((f) => STATUS_TYPES.has(f.api_name)), [fields]);
  const followupField = useMemo(() => findFollowupField(fields), [fields]);

  // Options for the status filter: prefer the field's own configured
  // options, fall back to whatever values the data actually contains.
  const statusOptions = useMemo(() => {
    if (!statusField) return [];
    try {
      const opts = JSON.parse(statusField.options_json || '[]');
      if (opts.length) return opts.map((o) => (typeof o === 'string' ? o : o.value ?? o.label));
    } catch { /* fall through to deriving from data */ }
    return [...new Set(records.map((r) => r[statusField.api_name]).filter(Boolean))];
  }, [statusField, records]);

  const filtered = useMemo(() => (
    statusField && statusFilter
      ? records.filter((r) => r[statusField.api_name] === statusFilter)
      : records
  ), [records, statusField, statusFilter]);

  const kpis = useMemo(() => kpisFor(moduleApiName, records), [moduleApiName, records]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, statusFilter, moduleApiName]);

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



  if (loading) {
    return <div className="max-w-[1600px] mx-auto"><SkeletonRows rows={8} cols={5} /></div>;
  }
  if (error && !module) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <ErrorState message={error.message || error} detail={error.detail}
          onRetry={() => { setLoading(true); setError(''); }} />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${module.color}22`, color: module.color }}>
            <ModuleIcon name={module.icon} className="w-5 h-5" />
          </div>
          <div>
            <h1 className="t-page-title">{module.plural_label}</h1>
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
            <button onClick={exportCsv} className="btn btn-secondary">Export CSV</button>
          )}
          {can(module.api_name, 'create') && (
            <button onClick={() => setShowForm((s) => !s)} className="btn btn-primary">
              {showForm ? 'Cancel' : `+ Add ${module.singular_label}`}
            </button>
          )}
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          {kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} tone={k.tone} />)}
        </div>
      )}

      <div className="flex gap-2 mt-5 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9"
            placeholder={`Search ${module.plural_label.toLowerCase()}…`}
            aria-label={`Search ${module.plural_label}`} />
        </div>
        {statusOptions.length > 0 && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-auto min-w-[150px]" aria-label={`Filter by ${statusField.label}`}>
            <option value="">All {statusField.label.toLowerCase()}</option>
            {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-5 mt-5 grid grid-cols-2 gap-4">
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

      <div className="card mt-6 overflow-hidden overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left bg-[var(--color-canvas)] border-b border-line">
              {listFields.map((f) => <th key={f.id} className="py-3 px-4 font-medium">{f.label}</th>)}
              {listFields.length === 0 && <th className="py-3 px-4 font-medium">Record</th>}
              {followupField && <th className="py-3 px-4 font-medium">Follow-up</th>}
              {module.api_name === 'accounts' && <th className="py-3 px-4 t-meta font-semibold text-right">360</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 hover:bg-[var(--color-canvas)] transition-colors cursor-pointer"
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
                {module.api_name === 'accounts' && (
                  <td className="py-3 px-4 text-right">
                    <Link to={`/customer-360/${r.id}`} onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium text-[var(--color-brand)] hover:underline whitespace-nowrap">
                      Customer 360 →
                    </Link>
                  </td>
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
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="t-section mb-1">
              No {module.plural_label.toLowerCase()} {q || statusFilter ? 'match your filters' : 'yet'}
            </p>
            <p className="t-meta">
              {q || statusFilter
                ? 'Try clearing the search or filter.'
                : `Add your first ${module.singular_label.toLowerCase()} to get started.`}
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line flex-wrap">
            <span className="t-meta">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              {filtered.length !== records.length ? ` (filtered from ${records.length})` : ''}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={page === 1}
                  className="btn btn-secondary disabled:opacity-40">Previous</button>
                <span className="t-meta px-2">Page {page} of {totalPages}</span>
                <button onClick={() => setPage((n) => Math.min(totalPages, n + 1))} disabled={page === totalPages}
                  className="btn btn-secondary disabled:opacity-40">Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
