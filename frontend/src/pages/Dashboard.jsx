import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Users, TrendingUp, CalendarClock, IndianRupee, Target, CheckCircle2, Trophy,
  AlertTriangle, Phone, PhoneCall, CheckSquare, Send, ArrowRight,
} from 'lucide-react';
import { api } from '../api';
import { friendlyError, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Bold, colored KPI cards — a top accent bar + tinted icon chip + big
// number. Kept as this page's own component (not components/ui.jsx's
// KpiCard, which takes a different `tone` prop shape) — mixing the two
// shapes is exactly what crashed this page once before.
const COLORS = {
  amber: { bar: '#F59E0B', chipBg: '#FEF3C7', chipText: '#B45309' },
  indigo: { bar: '#6366F1', chipBg: '#E0E7FF', chipText: '#4338CA' },
  teal: { bar: '#14B8A6', chipBg: '#CCFBF1', chipText: '#0F766E' },
  emerald: { bar: '#10B981', chipBg: '#D1FAE5', chipText: '#047857' },
  blue: { bar: '#3B82F6', chipBg: '#DBEAFE', chipText: '#1D4ED8' },
  rose: { bar: '#F43F5E', chipBg: '#FFE4E6', chipText: '#BE123C' },
  violet: { bar: '#8B5CF6', chipBg: '#EDE9FE', chipText: '#6D28D9' },
};
// Fixed stage-colour palette used only when a pipeline stage has no colour
// configured in Settings — matches the reference donut's blue/pink/purple/
// teal/amber sequence.
const STAGE_FALLBACK = ['#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6', '#F59E0B', '#10B981', '#F43F5E'];
const TONE_TO_COLOR = { success: 'emerald', danger: 'rose', warning: 'amber', info: 'blue', special: 'indigo', neutral: 'teal' };

function KpiCard({ label, value, sub, trend, icon: Icon, color, tone, to }) {
  const palette = color || COLORS[TONE_TO_COLOR[tone]] || COLORS.indigo;
  const body = (
    <div className="relative bg-white border border-line rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all h-full">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mb-4"
        style={{ background: palette.chipBg, color: palette.chipText }}>
        {Icon && <Icon className="w-5 h-5" />}
      </div>
      <div className="text-[13px] text-slate-500 font-medium">{label}</div>
      <div className="text-[26px] font-bold text-ink mt-1 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      {(trend || sub) && (
        <div className="mt-1.5 text-xs font-medium flex items-center gap-1"
          style={{ color: trend ? (trend.dir === 'down' ? 'var(--color-danger)' : 'var(--color-success)') : 'var(--color-faint)' }}>
          {trend && <span>{trend.dir === 'down' ? '↓' : '↑'} {trend.text}</span>}
          {!trend && sub && <span className="text-slate-400">{sub}</span>}
        </div>
      )}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center justify-between mt-8 mb-3">
      <h2 className="text-sm font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

const RELATED_LABEL = { leads: 'Lead', accounts: 'Account', contacts: 'Contact', opportunities: 'Opportunity', tickets: 'Ticket' };

// A single "what's on today" row — avatar/initials, title, meta, and (for
// follow-ups specifically) a one-tap call button, matching the reference's
// richer follow-up rows.
function AgendaRow({ item, render }) {
  const r = render(item);
  const initials = (r.title || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const body = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
        style={{ background: 'var(--color-brand-soft)', color: 'var(--color-brand)' }}>{initials}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink font-medium truncate">{r.title}</div>
        {r.meta && <div className="t-meta truncate">{r.meta}</div>}
      </div>
      {r.time && <span className="text-xs font-medium text-[var(--color-muted)] shrink-0 bg-[var(--color-canvas)] px-2 py-1 rounded-lg">{r.time}</span>}
      {r.phone && (
        <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()}
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}>
          <Phone className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
  return r.to
    ? <Link to={r.to} className="block p-1.5 -mx-1.5 rounded-lg hover:bg-[var(--color-canvas)]">{body}</Link>
    : <div className="p-1.5 -mx-1.5">{body}</div>;
}

function AgendaCard({ title, icon: Icon, items, render, empty, action }) {
  const list = items || [];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="t-section flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[var(--color-brand)]" />}
          {title}
          {list.length > 0 && <span className="t-meta">({list.length})</span>}
        </h3>
        {action}
      </div>
      {list.length === 0 ? (
        <div className="py-4 text-center">
          <p className="t-meta">{empty}</p>
        </div>
      ) : (
        <div className="space-y-1">{list.map((item, i) => <AgendaRow key={i} item={item} render={render} />)}</div>
      )}
    </div>
  );
}

// Pipeline-by-stage donut, using each stage's OWN colour from the pipeline
// configuration (module_pipeline_stages.color) rather than a fixed palette
// — a stage renamed or recoloured in Settings → Pipelines is reflected here
// automatically.
function StageDonut({ stages }) {
  const total = stages.reduce((s, x) => s + (x.c || 0), 0);
  const data = stages.filter((s) => s.c > 0);
  const colourOf = (s, i) => s.color || STAGE_FALLBACK[i % STAGE_FALLBACK.length];
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative w-[168px] h-[168px] shrink-0">
        {total === 0 ? (
          <div className="w-[168px] h-[168px] rounded-full border-[10px] border-[var(--color-line)] flex items-center justify-center">
            <span className="t-meta">No deals</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="c" nameKey="stage" innerRadius={56} outerRadius={82} paddingAngle={3} strokeWidth={0} cornerRadius={4}>
                {data.map((s, i) => <Cell key={i} fill={colourOf(s, i)} />)}
              </Pie>
              <Tooltip formatter={(v, n, p) => [`${v} deal(s) · ${inr(p.payload.total)}`, p.payload.stage]}
                contentStyle={{ borderRadius: 10, border: '1px solid var(--color-line)', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[28px] font-bold text-ink leading-none">{total}</span>
          <span className="t-meta mt-1">Total Leads</span>
        </div>
      </div>
      <div className="flex-1 min-w-[170px] space-y-2.5">
        {stages.map((s, i) => (
          <div key={s.stage} className="flex items-center justify-between text-sm gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colourOf(s, i) }} />
              <span className="text-ink truncate">{s.stage}</span>
            </span>
            <span className="text-[var(--color-muted)] shrink-0 font-medium">
              {s.c} {total > 0 && <span className="text-xs font-normal">({Math.round((s.c / total) * 100)}%)</span>}
            </span>
          </div>
        ))}
        {stages.length === 0 && <p className="t-meta">No pipeline configured.</p>}
      </div>
    </div>
  );
}

function SourceBars({ sources }) {
  const max = Math.max(1, ...sources.map((s) => s.c));
  const palette = ['#3B82F6', '#8B5CF6', '#F43F5E', '#F59E0B', '#10B981', '#14B8A6', '#6366F1', '#EC4899'];
  return (
    <div className="space-y-3">
      {sources.map((s, i) => (
        <div key={s.source}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-ink truncate">{s.source}</span>
            <span className="font-semibold text-ink shrink-0">{s.c}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-canvas)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(s.c / max) * 100}%`, background: palette[i % palette.length] }} />
          </div>
        </div>
      ))}
      {sources.length === 0 && <p className="t-meta">No leads yet.</p>}
    </div>
  );
}

const ACTIVITY_ICON = { call: PhoneCall, meeting: CalendarClock, task: CheckSquare, note: Send, email: Send };

function RecentActivity({ activities }) {
  const [filter, setFilter] = useState('all');
  const types = useMemo(() => ['all', ...new Set(activities.map((a) => a.type))], [activities]);
  const filtered = filter === 'all' ? activities : activities.filter((a) => a.type === filter);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
        <div className="flex gap-1 bg-[var(--color-canvas)] rounded-lg p-1">
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-xs font-medium px-2.5 py-1 rounded-md capitalize transition-colors ${
                filter === t ? 'bg-white text-ink shadow-sm' : 'text-[var(--color-muted)]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        {filtered.map((a) => {
          const Icon = ACTIVITY_ICON[a.type] || Send;
          return (
            <Link key={`${a.type}-${a.id}`} to={`/records/${a.related_module}/${a.related_record_id}`}
              className="flex items-center gap-3 hover:bg-[var(--color-canvas)] -mx-2 px-2 py-2 rounded-lg transition-colors">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-brand-soft)', color: 'var(--color-brand)' }}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink font-medium truncate">{a.title}</div>
                <div className="text-xs text-slate-400">{RELATED_LABEL[a.related_module] || a.related_module}</div>
              </div>
              <span className="t-meta capitalize shrink-0">{a.type}</span>
            </Link>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-slate-400 py-3 text-center">Nothing logged yet.</p>}
      </div>
    </div>
  );
}

function CrmDashboardSection({ data }) {
  const c = data.cards;
  return (
    <>
      {data.attention?.length > 0 && (
        <div className="rounded-2xl p-4 mt-5 flex items-center gap-3 flex-wrap" style={{ background: 'var(--color-warning-soft)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--color-warning-soft)', filter: 'brightness(0.96)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: '#B45309' }} />
          </div>
          <span className="text-sm font-bold text-ink shrink-0">Needs attention</span>
          <div className="flex flex-wrap gap-2 flex-1 min-w-0">
            {data.attention.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-xs bg-white px-3 py-1.5 rounded-full">
                <Badge tone={a.severity === 'high' ? 'danger' : 'warning'} size="xs">{a.severity}</Badge>
                <span className="text-ink">{a.text}</span>
              </span>
            ))}
          </div>
          <Link to="/leads" className="text-xs font-semibold shrink-0 flex items-center gap-0.5" style={{ color: 'var(--color-brand)' }}>
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      <SectionLabel>Pipeline at a glance</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Leads" value={c.total_leads} icon={Users} color={COLORS.violet} to="/leads" />
        <KpiCard label="Pipeline Value" value={inr(c.pipeline_value)} icon={Target} color={COLORS.teal} to="/records/opportunities" />
        <KpiCard label="Open Opportunities" value={c.open_opportunities} icon={TrendingUp} color={COLORS.amber} to="/records/opportunities" />
        <KpiCard label="Won This Month" value={inr(c.won_revenue_month)} sub={`${c.lost_this_month} lost this month`} icon={Trophy} color={COLORS.emerald} to="/records/opportunities" />
        <KpiCard label="Follow-ups Due" value={c.followups_due_today} sub={`${c.followups_overdue} overdue`} icon={CalendarClock} color={COLORS.rose} to="/leads" />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-8">
        <AgendaCard title="Follow-ups due today" icon={CalendarClock} items={data.agenda?.follow_ups}
          render={(f) => ({ title: f.title, phone: f.mobile, meta: f.mobile || f.status, to: `/leads/${f.id}` })}
          empty="No follow-ups scheduled for today."
          action={data.agenda?.follow_ups?.length > 0 && <Link to="/leads" className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>View all →</Link>} />
        <AgendaCard title="Meetings today" icon={Users}
          items={data.agenda?.meetings}
          render={(m) => ({ title: m.title, meta: m.start_datetime ? String(m.start_datetime).slice(11, 16) : '', to: m.related_module ? `/records/${m.related_module}/${m.related_record_id}` : null })}
          empty="Nothing in the diary today." />
        <AgendaCard title="Tasks due" icon={CheckSquare} items={data.agenda?.tasks_due}
          render={(t) => ({ title: t.title, meta: t.priority, to: null })}
          empty="No tasks due." />
      </div>

      {data.performance && (
        <>
          <SectionLabel>Performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Deals won" value={data.performance.won} icon={CheckCircle2} color={COLORS.emerald} />
            <KpiCard label="Deals lost" value={data.performance.lost} icon={AlertTriangle} color={COLORS.rose} />
            <KpiCard label="Win rate" value={data.performance.win_rate === null ? '—' : `${data.performance.win_rate}%`}
              icon={TrendingUp} color={data.performance.win_rate === null ? COLORS.blue : COLORS.indigo} />
            <KpiCard label="Avg deal size" value={inr(data.performance.avg_deal_size)} icon={IndianRupee} color={COLORS.blue} />
          </div>
          {data.performance.win_rate === null && <p className="t-meta mt-2">No deals have closed yet, so a win rate can't be calculated.</p>}
        </>
      )}

      <div className="grid lg:grid-cols-3 gap-5 mt-8">
        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-ink">Pipeline by Stage</h2>
            <Link to="/records/opportunities/kanban" className="t-meta">View details →</Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">Deal count and value per pipeline stage</p>
          <StageDonut stages={data.opportunities_by_stage} />
        </div>

        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-ink">Monthly Revenue Trend</h2>
            <Link to="/records/subscriptions" className="t-meta">View details →</Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">Subscription payments collected, last 6 months</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.revenue_by_month}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`} />
              <Tooltip formatter={(v) => inr(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={2.5} dot={{ fill: '#4F46E5', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-ink">Leads by Source</h2>
            <Link to="/leads" className="t-meta">View details →</Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">Where your leads are coming from</p>
          <SourceBars sources={data.leads_by_source} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-6 mb-2">
        <div className="lg:col-span-2">
          <RecentActivity activities={data.recent_activities} />
        </div>
        <div className="rounded-2xl p-6 text-white relative overflow-hidden flex flex-col justify-center"
          style={{ background: 'linear-gradient(135deg, var(--color-brand), var(--color-special))' }}>
          <div className="absolute inset-0 opacity-[0.08]" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '22px 22px',
          }} />
          <Send className="w-8 h-8 mb-3 relative opacity-90" />
          <h3 className="relative font-display text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>Keep the Momentum Going!</h3>
          <p className="relative text-white/80 text-sm mt-1.5">More conversations. More opportunities. A greater tomorrow.</p>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [crmData, setCrmData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.dashboardCrm().then(setCrmData).catch((e) => setError(friendlyError(e, 'Could not load the dashboard.')));
  }, []);

  if (error) {
    return (
      <div className="max-w-[1600px] mx-auto p-8 text-center">
        <p className="t-section mb-1">{error.message}</p>
        <button onClick={() => window.location.reload()} className="btn btn-primary mx-auto mt-3">Retry</button>
      </div>
    );
  }
  if (!crmData) return <div className="p-8 text-slate-400">Loading…</div>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="rounded-2xl p-6 mb-2 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-brand-soft), #FFFFFF)' }}>
        {/* Small decorative "goal" illustration — mirrors the reference's
            mountain-and-flag motif. Purely visual, no data. */}
        <svg aria-hidden="true" viewBox="0 0 160 90" className="hidden md:block absolute top-2 right-[220px] w-40 h-24 opacity-90">
          <path d="M0 90 L45 25 L65 50 L95 10 L160 90 Z" fill="var(--color-brand-soft)" />
          <path d="M55 90 L95 10 L135 90 Z" fill="#C7D2FE" />
          <path d="M85 22 L95 10 L105 22 Z" fill="#818CF8" />
          <rect x="94" y="4" width="1.6" height="20" fill="#4338CA" />
          <path d="M95.6 4 L110 9 L95.6 14 Z" fill="#4F46E5" />
        </svg>

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {greeting}, {user?.full_name?.split(' ')[0] || user?.username || 'there'}
            </h1>
            <p className="text-[var(--color-muted)] text-sm mt-1">Here's what's happening with your CRM today.</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden lg:block text-right max-w-[220px]">
              <p className="text-xs text-[var(--color-muted)] italic leading-snug">
                "Small steps today, big results tomorrow."
              </p>
            </div>
            <div className="flex items-center gap-2 bg-white border border-line rounded-xl px-3 py-2 shrink-0">
              <CalendarClock className="w-4 h-4 text-[var(--color-brand)]" />
              <span className="text-sm text-ink font-medium">{today}</span>
            </div>
          </div>
        </div>
      </div>

      <CrmDashboardSection data={crmData} />
    </div>
  );
}
