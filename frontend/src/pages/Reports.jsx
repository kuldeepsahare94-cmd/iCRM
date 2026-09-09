import { useEffect, useState } from 'react';
import { Download, Printer, BarChart3 } from 'lucide-react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import { downloadCSV } from '../utils/csv';

// Only reports that make sense for a general B2B CRM. The education-era
// reports (students, admissions, course-wise, placements, interviews,
// fee collection) were removed from this list because those modules no
// longer exist in the product — §25.
//
// Their backend endpoints and underlying tables are deliberately left in
// place: hiding a report from the UI must not delete anyone's historical
// data. Anyone who needs that history can still reach it via the API.
const REPORTS = [
  { key: 'leads', label: 'Lead Report', fetch: (p) => api.reportLeads(p), dated: true },
  { key: 'payments', label: 'Payment Report', fetch: (p) => api.reportPayments(p), dated: true },
  { key: 'revenue', label: 'Revenue Report', fetch: (p) => api.reportRevenue(p), dated: true },
  { key: 'monthly-collection', label: 'Monthly Collection Report', fetch: () => api.reportMonthlyCollection() },
];

// Columns we never want to show raw in a generic table (ids used only for linking/filtering)
const HIDE_COLS = new Set(['id', 'lead_id', 'account_id', 'contact_id', 'opportunity_id',
  'student_id', 'admission_id', 'course_id', 'company_id', 'interested_course_id']);
const STATUS_COLS = new Set(['status', 'admission_status', 'admission_stage', 'interview_status', 'result']);

function titleCase(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Reports() {
  const [reportKey, setReportKey] = useState('leads');
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  const report = REPORTS.find((r) => r.key === reportKey);

  const load = () => {
    setLoading(true);
    report.fetch(report.dated ? { from, to } : undefined).then((d) => { setRows(d); setLoading(false); });
  };
  useEffect(() => { load(); }, [reportKey]);

  const columns = rows.length ? Object.keys(rows[0]).filter((k) => !HIDE_COLS.has(k)) : [];

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 no-print">
        <div className="w-10 h-10 rounded-xl bg-amber-soft text-amber flex items-center justify-center">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="t-page-title">Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Every module, searchable and exportable.</p>
        </div>
      </div>

      <div className="flex gap-2 mt-6 flex-wrap no-print">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => setReportKey(r.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
              reportKey === r.key ? 'bg-ink text-white border-ink' : 'border-line text-slate-500 hover:border-ink/40'
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mt-5 no-print">
        <div className="flex items-center gap-2">
          {report.dated && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-xs" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-xs" />
              <button onClick={load} className="text-xs font-medium border border-line px-3 py-1.5 rounded-lg hover:bg-white">Apply</button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadCSV(`${report.key}.csv`, rows)}
            className="flex items-center gap-1.5 text-xs font-medium border border-line px-3 py-1.5 rounded-lg text-ink hover:bg-canvas">
            <Download className="w-3.5 h-3.5" /> Export to Excel (CSV)
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs font-medium border border-line px-3 py-1.5 rounded-lg text-ink hover:bg-canvas">
            <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
          </button>
        </div>
      </div>

      <h2 className="hidden print:block font-display text-xl font-semibold text-ink mt-6 mb-2">{report.label}</h2>

      <div className="card mt-4 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left bg-[var(--color-canvas)] border-b border-line">
              {columns.map((c) => (
                <th key={c} className="py-2.5 px-4 font-medium whitespace-nowrap">{titleCase(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-line/60">
                {columns.map((c) => (
                  <td key={c} className="py-2.5 px-4 whitespace-nowrap">
                    {STATUS_COLS.has(c) && row[c] ? <StatusBadge status={row[c]} /> : String(row[c] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={columns.length || 1} className="py-8 text-center text-slate-400">No data for this report yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
