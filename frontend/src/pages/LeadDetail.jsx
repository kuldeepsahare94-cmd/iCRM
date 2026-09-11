import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, UserCheck, Phone, Mail, MessageCircle, CalendarClock, Pencil, Flame, Snowflake, Check, X,
  Info, PhoneCall, Calendar, CheckSquare, TrendingUp, Paperclip, StickyNote, LayoutGrid,
  MapPin, FileText, Lightbulb, ChevronRight,
} from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../context/usePermissions';
import StatusBadge from '../components/StatusBadge';
import DisposeLeadModal from '../components/DisposeLeadModal';
import { accentGradient } from '../theme/moduleAccents';
import { CallsTab, MeetingsTab, TasksTab, DocumentsTab, DealsTab, NotesTab } from '../components/LeadRelatedTabs';

const FUNNEL_STAGES = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted'];
const ALL_STATUSES = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted', 'Not Interested', 'Dropped'];
const ACTIVITY_TABS = [
  { key: 'note', label: 'Note' },
  { key: 'call', label: 'Call Log' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'all', label: 'All' },
];

const PAGE_TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'activity', label: 'Activity', icon: Info },
  { key: 'calls', label: 'Calls', icon: PhoneCall },
  { key: 'meetings', label: 'Meetings', icon: Calendar },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare },
  { key: 'deals', label: 'Deals', icon: TrendingUp },
  { key: 'documents', label: 'Documents', icon: Paperclip },
  { key: 'notes', label: 'Notes', icon: StickyNote },
];

function initialsOf(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const BAND_COLOR = { Hot: '#FCA5A5', Excellent: '#FCA5A5', Warm: '#FDE68A', Healthy: '#FDE68A', Medium: '#E9D5FF', Cold: '#93C5FD' };
const bandColor = (band) => BAND_COLOR[band] || '#E9D5FF';

// ONE source of truth for the score, read by both the header chip and the
// right-column breakdown. There used to be two different scoring engines
// feeding those two displays, which could show contradictory numbers for
// the same lead — a real bug, independent of anything about matching the
// reference image, and worth keeping fixed.
function useLeadScore(leadId) {
  const [data, setData] = useState(null);
  useEffect(() => { api.leadScore(leadId).then(setData).catch(() => setData(null)); }, [leadId]);
  return data;
}

function ScoreInsightsCard({ scoring }) {
  if (!scoring) return null;
  // A ring alongside the real component breakdown, matching the reference's
  // visual treatment while keeping the actual weighted data (Fit/Engagement/
  // Intent/Recency) rather than renaming them to categories the scoring
  // engine doesn't really compute.
  const r = 30, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, scoring.score));
  const ringColor = scoring.score >= 70 ? 'var(--color-danger)' : scoring.score >= 40 ? 'var(--color-warning)' : 'var(--color-info)';
  const topTip = scoring.components.flatMap((x) => x.negatives || [])[0];
  return (
    <div className="card p-4">
      <div className="flex items-center gap-4 mb-4">
        <div className="relative shrink-0" style={{ width: 68, height: 68 }}>
          <svg width={68} height={68} className="-rotate-90">
            <circle cx={34} cy={34} r={r} fill="none" stroke="var(--color-line)" strokeWidth={6} />
            <circle cx={34} cy={34} r={r} fill="none" stroke={ringColor} strokeWidth={6}
              strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-base font-bold text-ink">{scoring.score}</span>
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase">Lead Score &amp; Insights</h3>
          <p className="text-sm font-semibold text-ink mt-0.5">{scoring.score}/100 · {scoring.band}</p>
        </div>
      </div>
      <div className="space-y-3">
        {scoring.components.map((c) => (
          <div key={c.component}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-ink font-medium">{c.component}</span>
              <span className="text-[var(--color-muted)]">{c.score}/100 · {c.weight}% weight</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-canvas)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: 'var(--color-brand)' }} />
            </div>
            {(c.positives[0] || c.negatives[0]) && (
              <p className="text-[11px] text-[var(--color-muted)] mt-1">{c.positives[0] || c.negatives[0]}</p>
            )}
          </div>
        ))}
      </div>
      {topTip && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 mt-3" style={{ background: 'var(--color-warning-soft)' }}>
          <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
          <p className="text-xs text-ink"><strong>Opportunity to improve:</strong> {topTip}</p>
        </div>
      )}
    </div>
  );
}

// Built entirely from the same response's real `negatives` — no invented
// copy. A lead with nothing negative shows no card at all.
function SuggestedNextSteps({ scoring }) {
  const items = (scoring?.components || []).flatMap((c) => c.negatives || []).slice(0, 5);
  if (items.length === 0) return null;
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-amber" /> Suggested Next Steps
      </h3>
      <div className="space-y-2">
        {items.map((text, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="w-4 h-4 rounded-full border-2 border-line shrink-0 mt-0.5" />
            <span className="text-ink">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  { key: 'call', label: 'Log Call', icon: Phone, color: '#4F46E5' },
  { key: 'email', label: 'Send Email', icon: Mail, color: '#2563EB' },
  { key: 'meeting', label: 'Schedule Meeting', icon: Calendar, color: '#059669' },
  { key: 'task', label: 'Create Task', icon: CheckSquare, color: '#D97706' },
  { key: 'note', label: 'Add Note', icon: StickyNote, color: '#7C3AED' },
  { key: 'document', label: 'Upload Document', icon: FileText, color: '#DB2777' },
];

// Real prev/next navigation through the actual lead list.
function usePrevNext(currentId) {
  const [ids, setIds] = useState(null);
  useEffect(() => { api.listLeads().then((rows) => setIds(rows.map((r) => r.id))).catch(() => setIds([])); }, []);
  if (!ids) return { prevId: null, nextId: null, loaded: false };
  const idx = ids.indexOf(Number(currentId));
  return {
    prevId: idx > 0 ? ids[idx - 1] : null,
    nextId: idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null,
    loaded: true,
  };
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = usePermissions();
  const [lead, setLead] = useState(null);
  const [disposing, setDisposing] = useState(false);
  const [pageTab, setPageTab] = useState('overview');
  const [tab, setTab] = useState('note');
  const [note, setNote] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const scoring = useLeadScore(id);
  const { prevId, nextId, loaded: navLoaded } = usePrevNext(id);

  const load = () => api.getLead(id).then((l) => { setLead(l); setForm(l); });
  useEffect(() => { load(); setPageTab('overview'); }, [id]);

  if (!lead) return <div className="p-8 text-slate-400">Loading…</div>;

  const changeStatus = async (status) => { await api.updateLead(id, { status }); load(); };

  const addActivity = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await api.addLeadActivity(id, { type: tab === 'call' ? 'call' : 'note', note });
    setNote('');
    load();
  };

  const saveSchedule = async () => {
    if (!scheduleDate) return;
    await api.updateLead(id, { follow_up_date: scheduleDate });
    setScheduling(false);
    setScheduleDate('');
    load();
  };

  const markFollowUpDone = async () => { await api.updateLead(id, { follow_up_date: null }); load(); };

  const saveEdit = async (e) => {
    e.preventDefault();
    await api.updateLead(id, form);
    setEditing(false);
    load();
  };

  const convert = async () => {
    if (!confirm(`Convert ${lead.student_name} to a Contact, Account, and Opportunity?`)) return;
    const res = await api.convertLead(id);
    navigate(`/records/contacts/${res.contact_id}`);
  };

  const runQuickAction = (key) => {
    if (key === 'call') return setDisposing(true);
    if (key === 'email') return lead.email && window.open(`mailto:${lead.email}`, '_self');
    if (key === 'meeting') return setPageTab('meetings');
    if (key === 'task') return setPageTab('tasks');
    if (key === 'note') { setPageTab('activity'); setTab('note'); return; }
    if (key === 'document') return setPageTab('documents');
  };

  const stageIndex = FUNNEL_STAGES.indexOf(lead.status);
  const isTerminalOther = lead.status === 'Not Interested' || lead.status === 'Dropped';
  const tags = [lead.source, lead.city, lead.product_interest].filter(Boolean);
  const followUpActive = lead.follow_up_date && !['Converted', 'Dropped', 'Not Interested'].includes(lead.status);
  const filteredActivities = tab === 'all' ? lead.activities : lead.activities.filter((a) => a.type === tab);

  return (
    <div className="max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <button onClick={() => navigate('/leads')} className="flex items-center gap-1 hover:text-ink font-medium">
            <ArrowLeft className="w-3.5 h-3.5" /> Leads
          </button>
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <span className="text-ink">{lead.student_name}</span>
        </div>

        {navLoaded && (prevId || nextId) && (
          <div className="flex items-center gap-1 shrink-0">
            <button disabled={!prevId} onClick={() => navigate(`/leads/${prevId}`)}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-line text-slate-500 hover:text-ink hover:bg-[var(--color-canvas)] disabled:opacity-40 disabled:pointer-events-none">
              <ArrowLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button disabled={!nextId} onClick={() => navigate(`/leads/${nextId}`)}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-line text-slate-500 hover:text-ink hover:bg-[var(--color-canvas)] disabled:opacity-40 disabled:pointer-events-none">
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ===== Header — white card, matching the full reference image
          precisely (I had this backwards in the previous two rounds,
          going by a cropped view that read as solid purple; the complete
          image makes clear it's a white card with three distinctly
          coloured buttons and dark text). ===== */}
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white text-lg shrink-0"
              style={{ background: accentGradient('leads') }}>
              {initialsOf(lead.student_name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-ink">{lead.student_name}</h1>
                <StatusBadge status={lead.status} />
              </div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm text-slate-500">
                {lead.mobile && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> {lead.mobile}
                    <a href={`tel:${lead.mobile}`} aria-label="Call" className="text-[var(--color-brand)] hover:opacity-70"><Phone className="w-3.5 h-3.5" /></a>
                    <a href={`https://wa.me/${lead.mobile.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="text-[var(--color-success)] hover:opacity-70"><MessageCircle className="w-3.5 h-3.5" /></a>
                  </span>
                )}
                {lead.email && (
                  <span className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5" /> {lead.email}
                    <a href={`mailto:${lead.email}`} aria-label="Email" className="text-[var(--color-brand)] hover:opacity-70 shrink-0"><Mail className="w-3.5 h-3.5" /></a>
                  </span>
                )}
                {lead.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {lead.city}</span>}
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t) => (
                    <span key={t} className="text-[11px] font-medium bg-[var(--color-canvas)] text-slate-600 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
              {lead.converted_contact_id && (
                <Link to={`/records/contacts/${lead.converted_contact_id}`} className="text-xs mt-1.5 block underline" style={{ color: 'var(--color-brand)' }}>
                  View converted contact →
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-start gap-4 shrink-0 flex-wrap justify-end">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl px-3.5 py-2 text-center" style={{ background: 'var(--color-canvas)' }}>
                <div className="t-meta mb-0.5">Lead Score</div>
                {scoring ? (
                  <>
                    <div className="flex items-baseline justify-center gap-0.5">
                      <span className="text-lg font-bold text-ink">{scoring.score}</span>
                      <span className="text-[10px] text-slate-400">/100</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 text-[11px] font-semibold" style={{ color: bandColor(scoring.band) }}>
                      {scoring.band === 'Cold' ? <Snowflake className="w-3 h-3" /> : <Flame className="w-3 h-3" />} {scoring.band}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-300 py-1.5">···</div>
                )}
              </div>

              {can('leads', 'edit') && !lead.converted_contact_id && (
                <button onClick={convert} className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-xl h-fit" style={{ background: 'var(--color-brand)' }}>
                  <UserCheck className="w-4 h-4" /> Convert Lead
                </button>
              )}
              {can('leads', 'edit') && (
                <button onClick={() => setScheduling((s) => !s)} className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-xl h-fit" style={{ background: '#059669' }}>
                  <CalendarClock className="w-4 h-4" /> Schedule Call
                </button>
              )}
              {can('calls', 'create') && !lead.converted_contact_id && (
                <button onClick={() => setDisposing(true)} className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-xl h-fit" style={{ background: '#DC2626' }}>
                  <PhoneCall className="w-4 h-4" /> Dispose
                </button>
              )}
            </div>

            {/* Owner + Created — shown once, here, not repeated in the
                Assignment card below (that card keeps Source, which
                isn't shown anywhere else). */}
            <div className="text-xs text-slate-500 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                Created on <span className="text-ink font-medium">{lead.created_at?.slice(0, 10)}</span>
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                Owner <span className="text-ink font-medium">{lead.assigned_counselor || 'Unassigned'}</span>
              </div>
            </div>
          </div>
        </div>

        {scheduling && (
          <div className="flex items-center gap-2 mt-3">
            <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
              className="input w-auto" />
            <button onClick={saveSchedule} className="btn btn-primary">Set follow-up date</button>
          </div>
        )}

        {/* Stage tracker — brand colour on a white page, matching the
            reference: filled circles for completed/current, grey outline
            for upcoming, a solid brand-colour line marking progress. */}
        {!isTerminalOther ? (
          <div className="flex items-center mt-5">
            {FUNNEL_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                <button disabled={!can('leads', 'edit') || lead.converted_contact_id} onClick={() => changeStatus(stage)}
                  className="flex flex-col items-center gap-1.5 shrink-0 disabled:cursor-default">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    i <= stageIndex ? 'text-white' : 'bg-white text-slate-300 border-2 border-line'}`}
                    style={i <= stageIndex ? { background: 'var(--color-brand)' } : undefined}>
                    {i < stageIndex ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[11px] whitespace-nowrap ${i === stageIndex ? 'text-ink font-semibold' : 'text-slate-400'}`}>{stage}</span>
                </button>
                {i < FUNNEL_STAGES.length - 1 && (
                  <div className={`flex-1 h-[3px] mx-1 rounded-full ${i < stageIndex ? '' : 'bg-[var(--color-line)]'}`}
                    style={i < stageIndex ? { background: 'var(--color-brand)' } : undefined} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 mt-5">This lead is marked <StatusBadge status={lead.status} /> — outside the main funnel.</p>
        )}
      </div>

      {/* Follow-up banner */}
      {followUpActive && (
        <div className="bg-amber-soft rounded-xl p-4 mt-4 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-ink">
            <CalendarClock className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            <strong>Follow-up scheduled</strong> — {lead.follow_up_date?.slice(0, 10)} · {lead.assigned_counselor || 'Unassigned'}
          </p>
          {can('leads', 'edit') && (
            <div className="flex gap-2">
              <button onClick={() => setScheduling(true)} className="text-xs font-medium bg-white border border-line px-3 py-1.5 rounded-lg hover:bg-canvas">Reschedule</button>
              <button onClick={markFollowUpDone} className="text-xs font-medium bg-amber text-white px-3 py-1.5 rounded-lg hover:opacity-90">Mark Done</button>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <form onSubmit={saveEdit} className="card p-5 mt-4 grid grid-cols-2 gap-3">
          <input placeholder="Name" className="border border-line rounded-lg px-3 py-2 text-sm col-span-2" value={form.student_name || ''} onChange={(e) => setForm({ ...form, student_name: e.target.value })} />
          <input placeholder="Mobile" className="input w-auto" value={form.mobile || ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input placeholder="Alt mobile" className="input w-auto" value={form.alternate_mobile || ''} onChange={(e) => setForm({ ...form, alternate_mobile: e.target.value })} />
          <input placeholder="Email" className="input w-auto" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="City" className="input w-auto" value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="border border-line text-sm font-medium px-4 py-2 rounded-lg"><X className="w-4 h-4" /></button>
          </div>
        </form>
      )}

      {/* Page-level tabs */}
      <div className="flex gap-5 mt-6 mb-5 border-b border-line overflow-x-auto thin-scroll">
        {PAGE_TABS.map((t) => (
          <button key={t.key} onClick={() => setPageTab(t.key)}
            className={`flex items-center gap-1.5 text-sm font-medium pb-3 whitespace-nowrap border-b-2 transition-colors ${
              pageTab === t.key ? 'border-[var(--color-brand)] text-[var(--color-brand)]' : 'border-transparent text-slate-500 hover:text-ink'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {pageTab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* LEFT: ONE consolidated "Basic Information" card, matching the
              clearer reference exactly — it's a single larger card here,
              not split across two. It also repeats Owner and Created On
              (already in the header) the same way it repeats City — the
              reference treats a quick-glance header value and the full
              structured record as two legitimate, separate things, and
              I'd wrongly tried to deduplicate that in an earlier round. */}
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Basic Information</h3>
                {can('leads', 'edit') && (
                  <button onClick={() => setEditing(true)} className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-brand)' }}>
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-slate-400">Full Name</dt><dd className="text-ink font-medium">{lead.student_name}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Mobile</dt><dd className="text-ink">{lead.mobile || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Alternate Mobile</dt><dd className="text-ink">{lead.alternate_mobile || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd className="text-ink truncate ml-2">{lead.email || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">City</dt><dd className="text-ink">{lead.city || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Source</dt><dd className="text-ink">{lead.source || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Created On</dt><dd className="text-ink">{lead.created_at?.slice(0, 10)}</dd></div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Last Activity</dt>
                  <dd className="text-ink text-right">
                    {lead.activities?.[0] ? `${lead.activities[0].type} on ${String(lead.activities[0].created_at).slice(0, 10)}` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Owner</dt>
                  <dd className="text-ink">{lead.assigned_counselor || '—'}
                    {can('leads', 'edit') && <button className="ml-1.5 text-xs" style={{ color: 'var(--color-brand)' }}>Change</button>}
                  </dd>
                </div>
                <div className="flex justify-between"><dt className="text-slate-400">Lead ID</dt><dd className="text-ink">L-{String(lead.id).padStart(4, '0')}</dd></div>
              </dl>
            </div>

            {can('leads', 'edit') && !lead.converted_contact_id && (
              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Change Status</h3>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_STATUSES.map((s) => (
                    <button key={s} onClick={() => changeStatus(s)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                        lead.status === s ? 'bg-emerald-50 border-good text-good' : 'border-line text-slate-500 hover:border-ink/40'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CENTER: Additional Details + Personal Information — matching
              the reference's actual field set. The reference also shows
              Budget, Expected Closure, Preferred Contact Time and Lead
              Category on this card, and Occupation/Organization on
              Personal Information — none of those exist as real columns
              on this lead record, and section 10 of the brief is explicit
              about not inventing business data, so they're left out rather
              than shown as fake empty fields. Lead Rating IS a real column
              and is now shown, as plain text rather than a 1–5 star
              widget — the underlying value is a category (Hot/Warm/Cold),
              not a numeric rating, and a star widget would imply a
              precision the data doesn't have. */}
          <div className="space-y-4">
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Additional Details</h3>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-slate-400">Product Interest</dt><dd className="text-ink">{lead.product_interest || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Service Interest</dt><dd className="text-ink">{lead.service_interest || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Campaign</dt><dd className="text-ink">{lead.campaign || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Lead Rating</dt><dd className="text-ink">{lead.lead_rating || '—'}</dd></div>
              </dl>
            </div>

            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Personal Information</h3>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-slate-400">Gender</dt><dd className="text-ink">{lead.gender || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Date of Birth</dt><dd className="text-ink">{lead.date_of_birth || '—'}</dd></div>
              </dl>
            </div>
          </div>

                    {/* RIGHT: Lead Score & Insights, Recent Activity — matching the
              reference's confirmed order — then Quick Actions, Suggested
              Next Steps and Related Deals, which section 11/12/15 of the
              brief call for beyond what the reference crop captured. */}
          <div className="space-y-4">
            <ScoreInsightsCard scoring={scoring} />

            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Recent Activity</h3>
                <button onClick={() => setPageTab('activity')} className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>View all →</button>
              </div>
              <div className="space-y-2">
                {lead.activities.slice(0, 4).map((a) => (
                  <div key={a.id} className="text-sm border-l-2 border-line pl-3">
                    <div className="text-ink truncate">{a.note}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{a.type} · {a.created_at}</div>
                  </div>
                ))}
                {lead.activities.length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}
              </div>
            </div>

            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((a) => (
                  <button key={a.key} onClick={() => runQuickAction(a.key)}
                    className="flex flex-col items-start gap-2 p-3 rounded-xl border border-line hover:shadow-sm transition-shadow text-left">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${a.color}18`, color: a.color }}>
                      <a.icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-medium text-ink leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <SuggestedNextSteps scoring={scoring} />

            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Related Deals</h3>
                {!lead.converted_contact_id && can('leads', 'edit') && (
                  <button onClick={convert} className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>Convert to create →</button>
                )}
              </div>
              <DealsTab lead={lead} />
            </div>
          </div>
        </div>
      )}

      {pageTab === 'activity' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Activity</h3>
            <span className="text-xs text-slate-400">{lead.activities.length} entries</span>
          </div>
          <div className="flex gap-1 mb-3 bg-canvas rounded-lg p-1 max-w-md">
            {ACTIVITY_TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md ${tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {can('leads', 'edit') && (tab === 'note' || tab === 'call') && (
            <form onSubmit={addActivity} className="mb-3 max-w-xl">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={tab === 'call' ? 'Log a call…' : 'Add a note…'}
                rows={2} className="border border-line rounded-lg px-3 py-2 text-sm w-full mb-2" />
              <button type="submit" className="bg-ink text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-ink-light">
                + Add {tab === 'call' ? 'Call Log' : 'Note'}
              </button>
            </form>
          )}

          <div className="space-y-3 max-w-2xl">
            {filteredActivities.map((a) => (
              <div key={a.id} className="text-sm border-l-2 border-line pl-3">
                <div className="text-ink">{a.note}</div>
                <div className="text-xs text-slate-400 mt-0.5">{a.type} · {a.created_at}</div>
              </div>
            ))}
            {filteredActivities.length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}
          </div>
        </div>
      )}

      {pageTab === 'calls' && <div className="card p-4"><CallsTab leadId={id} /></div>}
      {pageTab === 'meetings' && <div className="card p-4"><MeetingsTab leadId={id} /></div>}
      {pageTab === 'tasks' && <div className="card p-4"><TasksTab leadId={id} /></div>}
      {pageTab === 'deals' && <div className="card p-4"><DealsTab lead={lead} /></div>}
      {pageTab === 'documents' && <div className="card p-4"><DocumentsTab leadId={id} /></div>}
      {pageTab === 'notes' && <div className="card p-4"><NotesTab leadId={id} /></div>}

      {disposing && (
        <DisposeLeadModal lead={lead} onClose={() => setDisposing(false)}
          onDisposed={() => { setDisposing(false); load(); }} />
      )}
    </div>
  );
}
