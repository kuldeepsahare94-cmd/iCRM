import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, UserCheck, Phone, Mail, MessageCircle, CalendarClock, Pencil, Flame, Snowflake, Check, X } from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../context/usePermissions';
import StatusBadge from '../components/StatusBadge';
import DisposeLeadModal from '../components/DisposeLeadModal';

const FUNNEL_STAGES = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted'];
const ALL_STATUSES = ['New', 'Contacted', 'Interested', 'Follow-up', 'Converted', 'Not Interested', 'Dropped'];
const TABS = [
  { key: 'note', label: 'Note' },
  { key: 'call', label: 'Call Log' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'all', label: 'All' },
];

function initialsOf(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function ScoreBadge({ score, label }) {
  const color = label === 'Hot' ? 'text-warn' : label === 'Warm' ? 'text-amber' : 'text-sky-600';
  const Icon = label === 'Hot' ? Flame : label === 'Cold' ? Snowflake : Flame;
  return (
    <div className="border border-line rounded-xl px-4 py-2 text-center shrink-0">
      <div className="text-[10px] text-slate-400">Lead Score</div>
      <div className="flex items-center gap-1 justify-center">
        <span className="text-lg font-semibold text-ink">{score}</span>
        <span className="text-xs text-slate-400">/100</span>
      </div>
      <div className={`flex items-center gap-1 justify-center text-xs font-medium ${color}`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = usePermissions();
  const [lead, setLead] = useState(null);
  const [disposing, setDisposing] = useState(false);
  const [tab, setTab] = useState('note');
  const [note, setNote] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

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

  const stageIndex = FUNNEL_STAGES.indexOf(lead.status);
  const isTerminalOther = lead.status === 'Not Interested' || lead.status === 'Dropped';
  const tags = [lead.source, lead.city, lead.interested_course_name].filter(Boolean);
  const followUpActive = lead.follow_up_date && !['Converted', 'Dropped', 'Not Interested'].includes(lead.status);
  const filteredActivities = tab === 'all' ? lead.activities : lead.activities.filter((a) => a.type === tab);

  return (
    <div className="max-w-[1400px] mx-auto">
      <button onClick={() => navigate('/leads')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-ink mb-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Leads
      </button>
      <p className="text-xs text-slate-300 mb-4">Leads / <span className="text-slate-500">{lead.student_name}</span></p>

      {/* Gradient hero — warm amber identity for the Leads module */}
      <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #B45309, #F59E0B)' }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur text-white flex items-center justify-center font-semibold shrink-0 border border-white/20">
              {initialsOf(lead.student_name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-display)' }}>{lead.student_name}</h1>
                <StatusBadge status={lead.status} />
              </div>
              <p className="text-amber-50 text-xs mt-1">
                {lead.mobile && <>📞 {lead.mobile}</>}{lead.city && <> · {lead.city}</>}{lead.interested_course_name && <> · 🎓 {lead.interested_course_name}</>}
              </p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t) => <span key={t} className="text-[11px] bg-white/15 text-white/90 px-2 py-0.5 rounded-full">{t}</span>)}
                </div>
              )}
              {lead.converted_contact_id && (
                <Link to={`/records/contacts/${lead.converted_contact_id}`} className="text-xs text-white underline decoration-white/40 block mt-1">View converted contact →</Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ScoreBadge score={lead.lead_score} label={lead.lead_score_label} />
            {can('leads', 'edit') && !lead.converted_contact_id && (
              <button onClick={convert} className="flex items-center gap-1.5 bg-white text-amber-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-50 h-fit">
                <UserCheck className="w-4 h-4" /> Convert Lead
              </button>
            )}
            {can('calls', 'create') && !lead.converted_contact_id && (
              <button onClick={() => setDisposing(true)}
                className="flex items-center gap-1.5 bg-white text-amber-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-50 h-fit">
                <Phone className="w-4 h-4" /> Dispose Call
              </button>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="relative flex items-center gap-2 mt-4 pt-4 border-t border-white/15">
          <span className="text-xs text-white/60 mr-1">Quick actions:</span>
          <a href={lead.mobile ? `tel:${lead.mobile}` : undefined} className={`p-2 rounded-lg border border-white/20 ${lead.mobile ? 'hover:bg-white/15 text-white' : 'text-white/30 pointer-events-none'}`}><Phone className="w-3.5 h-3.5" /></a>
          <a href={lead.email ? `mailto:${lead.email}` : undefined} className={`p-2 rounded-lg border border-white/20 ${lead.email ? 'hover:bg-white/15 text-white' : 'text-white/30 pointer-events-none'}`}><Mail className="w-3.5 h-3.5" /></a>
          <a href={lead.mobile ? `https://wa.me/${lead.mobile.replace(/\D/g, '')}` : undefined} target="_blank" rel="noreferrer"
            className={`p-2 rounded-lg border border-white/20 ${lead.mobile ? 'hover:bg-white/15 text-white' : 'text-white/30 pointer-events-none'}`}><MessageCircle className="w-3.5 h-3.5" /></a>
          {can('leads', 'edit') && (
            <button onClick={() => setScheduling((s) => !s)} className="p-2 rounded-lg border border-white/20 hover:bg-white/15 text-white"><CalendarClock className="w-3.5 h-3.5" /></button>
          )}
          {can('leads', 'edit') && (
            <button onClick={() => setEditing((s) => !s)} className="p-2 rounded-lg border border-white/20 hover:bg-white/15 text-white"><Pencil className="w-3.5 h-3.5" /></button>
          )}
          {scheduling && (
            <span className="flex items-center gap-1.5 ml-2">
              <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="border border-white/20 bg-white/10 text-white rounded-lg px-2 py-1.5 text-xs placeholder-white/50" />
              <button onClick={saveSchedule} className="text-xs bg-white text-amber-700 px-2.5 py-1.5 rounded-lg font-medium">Set</button>
            </span>
          )}
        </div>

        {/* Stage tracker */}
        {!isTerminalOther ? (
          <div className="relative flex items-center mt-5">
            {FUNNEL_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                <button disabled={!can('leads', 'edit') || lead.converted_contact_id} onClick={() => changeStatus(stage)}
                  className="flex flex-col items-center gap-1 shrink-0 disabled:cursor-default">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    i < stageIndex ? 'bg-white text-amber-700' : i === stageIndex ? 'bg-white/20 border-2 border-white text-white' : 'bg-white/10 text-white/40'
                  }`}>
                    {i < stageIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[11px] whitespace-nowrap ${i === stageIndex ? 'text-white font-medium' : 'text-white/50'}`}>{stage}</span>
                </button>
                {i < FUNNEL_STAGES.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < stageIndex ? 'bg-white' : 'bg-white/15'}`} />}
              </div>
            ))}
          </div>
        ) : (
          <p className="relative text-xs text-white/70 mt-5">This lead is marked <StatusBadge status={lead.status} /> — outside the main funnel.</p>
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

      <div className="grid md:grid-cols-2 gap-6 mt-4">
        {/* Left: info cards */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Contact</h3>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-slate-400">Mobile</dt><dd className="text-ink">{lead.mobile || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Alt Mobile</dt><dd className="text-ink">{lead.alternate_mobile || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd className="text-ink truncate ml-2">{lead.email || '—'}</dd></div>
            </dl>
          </div>

          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Personal</h3>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-slate-400">Gender</dt><dd className="text-ink">{lead.gender || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Date of Birth</dt><dd className="text-ink">{lead.date_of_birth || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">City</dt><dd className="text-ink">{lead.city || '—'}</dd></div>
            </dl>
          </div>

          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Interest</h3>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-slate-400">Product Interest</dt><dd className="text-ink">{lead.product_interest || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Service Interest</dt><dd className="text-ink">{lead.service_interest || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Campaign</dt><dd className="text-ink">{lead.campaign || '—'}</dd></div>
            </dl>
          </div>

          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Assignment</h3>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-slate-400">Owner</dt><dd className="text-ink">{lead.assigned_counselor || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Source</dt><dd className="text-ink">{lead.source || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Created On</dt><dd className="text-ink">{lead.created_at?.slice(0, 10)}</dd></div>
            </dl>
          </div>

          {can('leads', 'edit') && !lead.converted_contact_id && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Change Status</h3>
              <p className="text-xs text-slate-400 mb-2">Move this lead to a different stage</p>
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

        {/* Right: activity panel */}
        <div className="card p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Activity</h3>
            <span className="text-xs text-slate-400">{lead.activities.length} entries</span>
          </div>
          <div className="flex gap-1 mb-3 bg-canvas rounded-lg p-1">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md ${tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {can('leads', 'edit') && (tab === 'note' || tab === 'call') && (
            <form onSubmit={addActivity} className="mb-3">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={tab === 'call' ? 'Log a call…' : 'Add a note…'}
                rows={2} className="border border-line rounded-lg px-3 py-2 text-sm w-full mb-2" />
              <button type="submit" className="w-full bg-ink text-white text-sm font-medium py-2 rounded-lg hover:bg-ink-light">
                + Add {tab === 'call' ? 'Call Log' : 'Note'}
              </button>
            </form>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredActivities.map((a) => (
              <div key={a.id} className="text-sm border-l-2 border-line pl-3">
                <div className="text-ink">{a.note}</div>
                <div className="text-xs text-slate-400 mt-0.5">{a.type} · {a.created_at}</div>
              </div>
            ))}
            {filteredActivities.length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}
          </div>
        </div>
      </div>

      {disposing && (
        <DisposeLeadModal lead={lead} onClose={() => setDisposing(false)}
          onDisposed={() => { setDisposing(false); load(); }} />
      )}
    </div>
  );
}
