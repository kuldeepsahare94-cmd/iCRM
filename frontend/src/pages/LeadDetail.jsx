import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, UserCheck, Phone, Mail, MessageCircle, CalendarClock, Pencil, Flame, Snowflake, Check, X,
  Info, PhoneCall, Calendar, CheckSquare, TrendingUp, Paperclip, StickyNote, LayoutGrid,
  MapPin, MoreVertical, FileText, Send, Lightbulb, ChevronRight,
} from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../context/usePermissions';
import StatusBadge from '../components/StatusBadge';
import DisposeLeadModal from '../components/DisposeLeadModal';
import { CallsTab, MeetingsTab, TasksTab, DocumentsTab, DealsTab, NotesTab } from '../components/LeadRelatedTabs';

const FUNNEL_STAGES = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted'];
const ALL_STATUSES = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted', 'Not Interested', 'Dropped'];
const ACTIVITY_TABS = [
  { key: 'note', label: 'Note' },
  { key: 'call', label: 'Call Log' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'all', label: 'All' },
];

// Same 8 tabs as before — every one already wired to real data. Nothing
// added or removed, only the pill styling below changes to an underlined
// tab strip to match the reference.
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

// Deterministic gradient per lead so avatars don't all look identical —
// purely cosmetic, derived from the name string, no stored data.
const AVATAR_GRADIENTS = [
  ['#F472B6', '#C026D3'], ['#818CF8', '#4F46E5'], ['#34D399', '#059669'],
  ['#FBBF24', '#D97706'], ['#60A5FA', '#2563EB'], ['#FB7185', '#E11D48'],
];
function avatarGradient(name) {
  const sum = (name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const [a, b] = AVATAR_GRADIENTS[sum % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const SCORE_COLOR = { Hot: '#DC2626', Warm: '#D97706', Cold: '#2563EB' };

// Compact circular score ring — same lead.lead_score / lead.lead_score_label
// fields the old badge used, just drawn as a ring instead of a pill so it
// reads at a glance the way the reference's header score does.
function ScoreRing({ score, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0));
  const color = pct >= 70 ? '#DC2626' : pct >= 40 ? '#D97706' : '#2563EB';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-ink">{score}</span>
      </div>
    </div>
  );
}

// The explainable breakdown from the scoring engine — real weights and
// real reasons, not a decorative widget. Fetched once and reused by both
// the "Lead Score & Insights" card and the "Suggested Next Steps" list
// below, which is built entirely from this same response's `negatives`
// (real, computed reasons the score isn't higher) rather than any invented
// copy.
function useLeadScore(leadId) {
  const [data, setData] = useState(null);
  useEffect(() => { api.leadScore(leadId).then(setData).catch(() => setData(null)); }, [leadId]);
  return data;
}

function ScoreInsightsCard({ scoring }) {
  if (!scoring) return null;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-4 mb-4">
        <ScoreRing score={scoring.score} size={72} stroke={7} />
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase">Lead Score &amp; Insights</h3>
          <p className="text-sm font-semibold text-ink mt-0.5">{scoring.score}/100</p>
          <p className="t-meta">{scoring.band}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {scoring.components.map((c) => (
          <div key={c.component} className="flex items-center justify-between text-xs gap-2">
            <span className="text-ink truncate">{c.component}</span>
            <span className="text-[var(--color-muted)] shrink-0">{c.score}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Suggested next steps, derived from the real scoring negatives — the exact
// same strings the score breakdown already shows, presented as a checklist
// instead of a paragraph. No copy is invented; a lead with nothing negative
// shows no suggestions rather than filler text.
function SuggestedNextSteps({ scoring }) {
  const items = (scoring?.components || [])
    .flatMap((c) => c.negatives || [])
    .slice(0, 5);
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

const QUICK_ACTIONS_BASE = [
  { key: 'call', label: 'Log Call', icon: Phone, color: '#4F46E5' },
  { key: 'email', label: 'Send Email', icon: Mail, color: '#2563EB' },
  { key: 'meeting', label: 'Schedule Meeting', icon: Calendar, color: '#059669' },
  { key: 'task', label: 'Create Task', icon: CheckSquare, color: '#D97706' },
  { key: 'note', label: 'Add Note', icon: StickyNote, color: '#7C3AED' },
  { key: 'document', label: 'Upload Document', icon: FileText, color: '#DB2777' },
];

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

  const load = () => api.getLead(id).then((l) => { setLead(l); setForm(l); });
  useEffect(() => { load(); }, [id]);

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

  // Quick Actions route to the same real tabs/modals that already exist —
  // no new backend logic, just a faster way to reach them.
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
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
        <button onClick={() => navigate('/leads')} className="flex items-center gap-1 hover:text-ink font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Leads
        </button>
        <ChevronRight className="w-3 h-3 text-slate-300" />
        <span className="text-ink">{lead.student_name}</span>
      </div>

      {/* ===== Header card ===== */}
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white text-lg shrink-0"
              style={{ background: avatarGradient(lead.student_name) }}>
              {initialsOf(lead.student_name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-ink">{lead.student_name}</h1>
                <StatusBadge status={lead.status} />
              </div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm text-slate-500">
                {lead.mobile && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {lead.mobile}</span>}
                {lead.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3.5 h-3.5" /> {lead.email}</span>}
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

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="rounded-xl px-3.5 py-2 text-center" style={{ background: 'var(--color-canvas)' }}>
              <div className="t-meta mb-0.5">Lead Score</div>
              <div className="flex items-baseline justify-center gap-0.5">
                <span className="text-lg font-bold text-ink">{lead.lead_score}</span>
                <span className="text-[10px] text-slate-400">/100</span>
              </div>
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold"
                style={{ color: SCORE_COLOR[lead.lead_score_label] || 'var(--color-brand)' }}>
                {lead.lead_score_label === 'Cold' ? <Snowflake className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
                {lead.lead_score_label}
              </div>
            </div>

            {can('leads', 'edit') && !lead.converted_contact_id && (
              <button onClick={convert} className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-xl h-fit"
                style={{ background: 'linear-gradient(135deg, #4F6BFF, #7C3AED)' }}>
                <UserCheck className="w-4 h-4" /> Convert Lead
              </button>
            )}
            {can('leads', 'edit') && (
              <button onClick={() => setScheduling((s) => !s)} className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-xl h-fit"
                style={{ background: '#059669' }}>
                <CalendarClock className="w-4 h-4" /> Schedule Call
              </button>
            )}
            {can('calls', 'create') && !lead.converted_contact_id && (
              <button onClick={() => setDisposing(true)} className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-xl h-fit"
                style={{ background: '#DC2626' }}>
                <PhoneCall className="w-4 h-4" /> Dispose
              </button>
            )}
            <button onClick={() => setEditing((s) => !s)} aria-label="More actions"
              className="p-2.5 rounded-xl border border-line text-slate-500 hover:text-ink hover:bg-[var(--color-canvas)] h-fit">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        {scheduling && (
          <div className="flex items-center gap-2 mt-3">
            <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
              className="input w-auto" />
            <button onClick={saveSchedule} className="btn btn-primary">Set follow-up date</button>
          </div>
        )}

        {/* Meta row: created date + owner — plain text, no fake "change" affordance
            since ownership reassignment isn't wired up on this page. */}
        <div className="flex items-center gap-5 mt-4 pt-4 border-t border-line text-sm flex-wrap">
          <span className="flex items-center gap-1.5 text-slate-500">
            <CalendarClock className="w-4 h-4 text-slate-400" />
            Created <span className="text-ink font-medium">{lead.created_at?.slice(0, 10)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            Owner <span className="text-ink font-medium">{lead.assigned_counselor || 'Unassigned'}</span>
          </span>
          {lead.mobile && (
            <a href={`https://wa.me/${lead.mobile.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-slate-500 hover:text-ink ml-auto">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          )}
        </div>

        {/* Stage tracker */}
        {!isTerminalOther ? (
          <div className="relative flex items-center mt-5">
            {FUNNEL_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                <button disabled={!can('leads', 'edit') || lead.converted_contact_id} onClick={() => changeStatus(stage)}
                  className="flex flex-col items-center gap-1.5 shrink-0 disabled:cursor-default">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    i < stageIndex ? 'text-white' : i === stageIndex ? 'text-white' : 'bg-white text-slate-300 border-line'
                  }`} style={i <= stageIndex ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)' } : undefined}>
                    {i < stageIndex ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[11px] whitespace-nowrap ${i === stageIndex ? 'text-ink font-semibold' : 'text-slate-400'}`}>{stage}</span>
                </button>
                {i < FUNNEL_STAGES.length - 1 && <div className={`flex-1 h-[3px] mx-1 rounded-full ${i < stageIndex ? '' : 'bg-[var(--color-line)]'}`}
                  style={i < stageIndex ? { background: 'var(--color-brand)' } : undefined} />}
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

      {/* Edit form (opened from the header's "more" button) */}
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

      {/* Page-level tabs — underlined strip, same 8 tabs as before */}
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
        <>
          <div className="grid lg:grid-cols-3 gap-5">
            {/* LEFT: Basic + Personal information */}
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
                  <div className="flex justify-between"><dt className="text-slate-400">Alt Mobile</dt><dd className="text-ink">{lead.alternate_mobile || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd className="text-ink truncate ml-2">{lead.email || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Lead ID</dt><dd className="text-ink">L-{String(lead.id).padStart(4, '0')}</dd></div>
                </dl>
              </div>

              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Personal Information</h3>
                <dl className="text-sm space-y-2">
                  <div className="flex justify-between"><dt className="text-slate-400">Gender</dt><dd className="text-ink">{lead.gender || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Date of Birth</dt><dd className="text-ink">{lead.date_of_birth || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">City</dt><dd className="text-ink">{lead.city || '—'}</dd></div>
                </dl>
              </div>
            </div>

            {/* CENTER: Additional details + Assignment + status change */}
            <div className="space-y-4">
              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Additional Details</h3>
                <dl className="text-sm space-y-2">
                  <div className="flex justify-between"><dt className="text-slate-400">Product Interest</dt><dd className="text-ink">{lead.product_interest || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Service Interest</dt><dd className="text-ink">{lead.service_interest || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Campaign</dt><dd className="text-ink">{lead.campaign || '—'}</dd></div>
                </dl>
              </div>

              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Assignment</h3>
                <dl className="text-sm space-y-2">
                  <div className="flex justify-between"><dt className="text-slate-400">Owner</dt><dd className="text-ink">{lead.assigned_counselor || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Source</dt><dd className="text-ink">{lead.source || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Created On</dt><dd className="text-ink">{lead.created_at?.slice(0, 10)}</dd></div>
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

            {/* RIGHT: Quick Actions, Score & Insights, Suggested Next Steps, Related Deals */}
            <div className="space-y-4">
              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_ACTIONS_BASE.map((a) => (
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

              <ScoreInsightsCard scoring={scoring} />
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

          {/* Recent Activity + Tasks/Meetings previews, using the exact same
              components/data as their full tabs — just placed here too. */}
          <div className="grid lg:grid-cols-3 gap-5 mt-5">
            <div className="card p-4 lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Recent Activity</h3>
                <button onClick={() => setPageTab('activity')} className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>View all →</button>
              </div>
              <div className="relative space-y-4">
                {lead.activities.slice(0, 4).map((a, i) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--color-brand-soft)' }}>
                        <Send className="w-3 h-3" style={{ color: 'var(--color-brand)' }} />
                      </div>
                      {i < Math.min(lead.activities.length, 4) - 1 && <div className="w-px flex-1 bg-line mt-1" />}
                    </div>
                    <div className="min-w-0 pb-1">
                      <div className="text-sm text-ink truncate">{a.note}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{a.type} · {a.created_at}</div>
                    </div>
                  </div>
                ))}
                {lead.activities.length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}
              </div>
            </div>

            <div className="card p-4 lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Tasks</h3>
                <button onClick={() => setPageTab('tasks')} className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>View all →</button>
              </div>
              <TasksTab leadId={id} />
            </div>

            <div className="card p-4 lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Meetings</h3>
                <button onClick={() => setPageTab('meetings')} className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>View all →</button>
              </div>
              <MeetingsTab leadId={id} />
            </div>
          </div>
        </>
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
