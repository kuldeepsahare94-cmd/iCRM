import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Users, TrendingUp, CalendarClock, IndianRupee, Target, LifeBuoy, PhoneCall, Repeat, AlertTriangle, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../api';
import { friendlyError, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Bold, colored KPI cards — a top accent bar + tinted icon chip + big number,
// Zoho/Freshdesk-style rather than a flat white box with a tiny badge.
// NOTE: this is a Dashboard-local KpiCard taking a `color` OBJECT, distinct
// from the shared one in components/ui.jsx which takes a `tone` STRING.
// Passing the wrong shape used to throw on `color.bar` and crash the entire
// dashboard, so an unrecognised or missing colour now falls back instead.
const TONE_TO_COLOR = { success: 'emerald', danger: 'rose', warning: 'amber',
  info: 'blue', special: 'indigo', neutral: 'teal' };

function KpiCard({ label, value, sub, icon: Icon, color, tone, to }) {
  const palette = color || COLORS[TONE_TO_COLOR[tone]] || COLORS.indigo;
  const body = (
    <div className="relative bg-white border border-line rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all h-full overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: palette.bar }} />
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
        {Icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: palette.chipBg, color: palette.chipText }}>
            <Icon className="w-4.5 h-4.5" />
          </div>
        )}
      </div>
      <div className="font-display text-3xl font-bold text-ink mt-2" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-1.5">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

const COLORS = {
  amber: { bar: '#F59E0B', chipBg: '#FEF3C7', chipText: '#B45309' },
  indigo: { bar: '#6366F1', chipBg: '#E0E7FF', chipText: '#4338CA' },
  teal: { bar: '#14B8A6', chipBg: '#CCFBF1', chipText: '#0F766E' },
  emerald: { bar: '#10B981', chipBg: '#D1FAE5', chipText: '#047857' },
  blue: { bar: '#3B82F6', chipBg: '#DBEAFE', chipText: '#1D4ED8' },
  rose: { bar: '#F43F5E', chipBg: '#FFE4E6', chipText: '#BE123C' },
};

function SectionLabel({ children }) {
  return <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-8 mb-3">{children}</h2>;
}

const RELATED_LABEL = { leads: 'Lead', accounts: 'Account', contacts: 'Contact', opportunities: 'Opportunity', tickets: 'Ticket' };

// The universal CRM dashboard (master prompt section 17) — a second tab
// alongside the original placement/education dashboard below, so existing
// functionality stays exactly where it was for anyone who re-enables those
// modules, while the CRM view is what a universal-CRM user actually needs
// day to day.

// A compact "what's on today" list. Shows a real empty message rather than
// an blank box — the brief calls out intentional empty states.
function AgendaCard({ title, icon: Icon, items, render, empty }) {
  const list = items || [];
  return (
    <div className="card p-4">
      <h3 className="t-section flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-[var(--color-muted)]" />}
        {title}
        {list.length > 0 && <span className="t-meta">({list.length})</span>}
      </h3>
      {list.length === 0 ? <p className="t-meta">{empty}</p> : (
        <div className="space-y-1.5">
          {list.map((item, i) => {
            const r = render(item);
            const body = (
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-sm text-ink truncate">{r.title}</span>
                {r.meta && <span className="t-meta shrink-0">{r.meta}</span>}
              </div>
            );
            return r.to
              ? <Link key={i} to={r.to} className="block p-1.5 -mx-1.5 rounded-lg hover:bg-[var(--color-canvas)]">{body}</Link>
              : <div key={i} className="p-1.5 -mx-1.5">{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

function AskAiWidget() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true); setError(''); setAnswer('');
    try {
      const r = await api.aiAskDashboard(question.trim());
      setAnswer(r.answer);
    } catch (err) {
      setError(friendlyError(err, 'Could not get an answer right now.').message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber" /> Ask AI</h2>
      <p className="text-xs text-slate-400 mb-3">Grounded in the numbers above — e.g. "which stage has the most stuck deals?"</p>
      <form onSubmit={ask} className="flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about the pipeline…"
          className="border border-line rounded-lg px-3 py-2 text-sm flex-1" />
        <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-50">
          {loading ? '…' : 'Ask'}
        </button>
      </form>
      {error && <div className="text-xs text-warn bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</div>}
      {answer && <p className="text-sm text-ink mt-3 bg-canvas rounded-lg p-3">{answer}</p>}
    </div>
  );
}

function CrmDashboardSection({ data }) {
  const c = data.cards;
  return (
    <>
      {data.attention?.length > 0 && (
        <div className="card p-4 mt-5" style={{ borderColor: 'var(--color-warning)' }}>
          <h2 className="t-section flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-warning)' }} /> Needs attention
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.attention.map((a, i) => (
              <Link key={i} to={a.link || '#'}
                className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-line hover:bg-[var(--color-canvas)]">
                <Badge tone={a.severity === 'high' ? 'danger' : 'warning'} size="xs">{a.severity}</Badge>
                <span className="text-ink">{a.text}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <SectionLabel>Today</SectionLabel>
      <div className="grid md:grid-cols-3 gap-4">
        <AgendaCard title="Follow-ups due" icon={CalendarClock} items={data.agenda?.follow_ups}
          render={(f) => ({ title: f.title, meta: f.mobile || f.status, to: `/leads/${f.id}` })}
          empty="No follow-ups scheduled for today." />
        <AgendaCard title="Meetings today" icon={Users} items={data.agenda?.meetings}
          render={(m) => ({ title: m.title, meta: m.start_datetime ? String(m.start_datetime).slice(11, 16) : '',
                            to: m.related_module ? `/records/${m.related_module}/${m.related_record_id}` : null })}
          empty="Nothing in the diary today." />
        <AgendaCard title="Tasks due" icon={AlertTriangle} items={data.agenda?.tasks_due}
          render={(t) => ({ title: t.title, meta: t.priority, to: null })}
          empty="No tasks due." />
      </div>

      {data.performance && (
        <>
          <SectionLabel>Performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Deals won" value={data.performance.won} icon={CheckCircle2} color={COLORS.emerald} />
            <KpiCard label="Deals lost" value={data.performance.lost} icon={XCircle} color={COLORS.rose} />
            <KpiCard label="Win rate"
              value={data.performance.win_rate === null ? '—' : `${data.performance.win_rate}%`}
              icon={TrendingUp} color={data.performance.win_rate === null ? COLORS.blue : COLORS.indigo} />
            <KpiCard label="Avg deal size" value={inr(data.performance.avg_deal_size)} icon={IndianRupee} color={COLORS.blue} />
          </div>
          {data.performance.win_rate === null && (
            <p className="t-meta mt-2">No deals have closed yet, so a win rate can't be calculated.</p>
          )}
        </>
      )}

      <SectionLabel>Pipeline</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Leads" value={c.total_leads} icon={Users} color={COLORS.amber} to="/leads" />
        <KpiCard label="Open Opportunities" value={c.open_opportunities} sub={inr(c.pipeline_value) + ' pipeline value'} icon={Target} color={COLORS.indigo} to="/records/opportunities" />
        <KpiCard label="Weighted Pipeline" value={inr(c.weighted_pipeline)} sub="Probability-adjusted" icon={TrendingUp} color={COLORS.blue} to="/records/opportunities/kanban" />
        <KpiCard label="Won This Month" value={inr(c.won_revenue_month)} sub={`${c.lost_this_month} lost this month`} icon={IndianRupee} color={COLORS.emerald} to="/records/opportunities" />
      </div>

      <SectionLabel>Revenue &amp; Support</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={inr(c.mrr)} sub={`${inr(c.arr)} ARR`} icon={Repeat} color={COLORS.teal} to="/records/subscriptions" />
        <KpiCard label="Open Tickets" value={c.open_tickets} icon={LifeBuoy} color={COLORS.rose} to="/records/tickets" />
        <KpiCard label="Overdue Tasks" value={c.overdue_tasks} icon={AlertTriangle} color={COLORS.rose} to="/records/tasks" />
        <KpiCard label="Follow-ups Due Today" value={c.followups_due_today} sub={`${c.followups_overdue} overdue`} icon={CalendarClock} color={COLORS.amber} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <KpiCard label="Today's Calls" value={c.todays_calls} icon={PhoneCall} color={COLORS.blue} to="/records/calls" />
        <KpiCard label="Today's Meetings" value={c.todays_meetings} icon={CalendarClock} color={COLORS.indigo} to="/records/meetings" />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">Opportunities by Stage</h2>
          <p className="text-xs text-slate-400 mb-4">Deal count and value per pipeline stage</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.opportunities_by_stage}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, name) => (name === 'total' ? inr(v) : v)} />
              <Bar dataKey="c" name="Deals" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">Recurring Revenue</h2>
          <p className="text-xs text-slate-400 mb-4">Subscription payments collected, last 6 months</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.revenue_by_month}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => inr(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2.5} dot={{ fill: '#10B981', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Leads by Source</h2>
          <div className="space-y-3">
            {data.leads_by_source.map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 truncate">{s.source}</span>
                <span className="font-semibold text-ink shrink-0">{s.c}</span>
              </div>
            ))}
            {data.leads_by_source.length === 0 && <p className="text-sm text-slate-400">No leads yet.</p>}
          </div>
        </div>

        <AskAiWidget />

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">Recent Activity</h2>
          <div className="space-y-1">
            {data.recent_activities.map((a) => (
              <Link key={`${a.type}-${a.id}`} to={`/records/${a.related_module}/${a.related_record_id}`}
                className="flex items-center gap-3 hover:bg-canvas -mx-2 px-2 py-2 rounded-lg transition-colors">
                <span className="text-[10px] font-bold uppercase w-14 shrink-0 text-slate-400">{a.type}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink font-medium truncate">{a.title}</div>
                  <div className="text-xs text-slate-400">{RELATED_LABEL[a.related_module] || a.related_module}</div>
                </div>
              </Link>
            ))}
            {data.recent_activities.length === 0 && <p className="text-sm text-slate-400">Nothing logged yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [crmData, setCrmData] = useState(null);

  useEffect(() => { api.dashboardCrm().then(setCrmData); }, []);

  if (!crmData) return <div className="p-8 text-slate-400">Loading…</div>;
  const c = crmData.cards;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="rounded-2xl p-6 mb-2 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-ink), var(--color-ink-light))' }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-white/50 text-xs">{today}</p>
            <h1 className="font-display text-2xl font-semibold mt-1" style={{ fontFamily: 'var(--font-display)' }}>
              {greeting}, {user?.full_name?.split(' ')[0] || user?.username || 'there'}
            </h1>
            <p className="text-white/60 text-sm mt-1">Here's where things stand today.</p>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <div className="text-white/50 text-[10px] uppercase">Pipeline Value</div>
              <div className="text-xl font-bold">{inr(c.pipeline_value)}</div>
            </div>
            <div className="text-right">
              <div className="text-white/50 text-[10px] uppercase">Total Leads</div>
              <div className="text-xl font-bold">{c.total_leads}</div>
            </div>
          </div>
        </div>
      </div>

      <CrmDashboardSection data={crmData} />
    </div>
  );
}
