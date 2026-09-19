import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, TrendingUp, CalendarClock, IndianRupee, Target, CheckCircle2, Trophy,
  AlertTriangle, Phone, PhoneCall, CheckSquare, Send, ArrowRight,
} from 'lucide-react';
import { api } from '../api';
// recharts is heavy, so the charts load as a separate chunk after the rest
// of the Dashboard has painted. See DashboardCharts.jsx.
const StageDonut = lazy(() => import('./DashboardCharts').then((m) => ({ default: m.StageDonut })));
const RevenueArea = lazy(() => import('./DashboardCharts').then((m) => ({ default: m.RevenueArea })));

// Holds the chart's footprint while its chunk arrives, so the cards around
// it don't jump once it renders.
function ChartFrame({ height, children }) {
  return (
    <Suspense
      fallback={(
        <div
          className="w-full rounded-xl bg-slate-100/70 dark:bg-slate-700/30 animate-pulse"
          style={{ height }}
          aria-busy="true"
        />
      )}
    >
      {children}
    </Suspense>
  );
}

import { friendlyError, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Counts a numeric KPI up from 0 on mount rather than popping in already at
// its final value — a small thing, but it's the difference between a
// dashboard that looks alive and one that looks like a printed report. Only
// touches values that are actually plain numbers (or a rupee/plain string
// wrapping one); anything else — "—", a percentage already formatted — is
// shown as-is on the first render and never animated, since counting up
// through text you can't parse would just flicker.
function useCountUp(value, duration = 900) {
  const [display, setDisplay] = useState(value);
  const prev = useRef();
  const frame = useRef();

  useEffect(() => {
    const match = typeof value === 'string' ? value.match(/^(₹?)([\d,]+(?:\.\d+)?)(%?)$/) : null;
    const numeric = typeof value === 'number' ? value : (match ? Number(match[2].replace(/,/g, '')) : null);
    if (numeric === null || Number.isNaN(numeric) || prev.current === value) { setDisplay(value); return; }
    prev.current = value;
    const prefix = match ? match[1] : '';
    const suffix = match ? match[3] : '';
    const decimals = (match && match[2].includes('.')) ? match[2].split('.')[1].length : 0;
    const start = performance.now();
    cancelAnimationFrame(frame.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic — fast start, gentle settle
      const current = numeric * eased;
      const formatted = decimals ? current.toFixed(decimals) : Math.round(current).toLocaleString('en-IN');
      setDisplay(`${prefix}${formatted}${suffix}`);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

// Bold, colored KPI cards — a top accent bar + tinted icon chip + big
// number. Kept as this page's own component (not components/ui.jsx's
// KpiCard, which takes a different `tone` prop shape) — mixing the two
// shapes is exactly what crashed this page once before.
const COLORS = {
  amber:   { bar: '#F59E0B', chipBg: '#FEF3C7', chipText: '#B45309', from: '#FCD34D', to: '#D97706' },
  indigo:  { bar: '#6366F1', chipBg: '#E0E7FF', chipText: '#4338CA', from: '#818CF8', to: '#4338CA' },
  teal:    { bar: '#14B8A6', chipBg: '#CCFBF1', chipText: '#0F766E', from: '#5EEAD4', to: '#0F766E' },
  emerald: { bar: '#10B981', chipBg: '#D1FAE5', chipText: '#047857', from: '#6EE7B7', to: '#047857' },
  blue:    { bar: '#3B82F6', chipBg: '#DBEAFE', chipText: '#1D4ED8', from: '#93C5FD', to: '#1D4ED8' },
  rose:    { bar: '#F43F5E', chipBg: '#FFE4E6', chipText: '#BE123C', from: '#FDA4AF', to: '#BE123C' },
  violet:  { bar: '#8B5CF6', chipBg: '#EDE9FE', chipText: '#6D28D9', from: '#C4B5FD', to: '#6D28D9' },
};
// Fixed stage-colour palette used only when a pipeline stage has no colour
// configured in Settings — matches the reference donut's blue/pink/purple/
// teal/amber sequence.
const TONE_TO_COLOR = { success: 'emerald', danger: 'rose', warning: 'amber', info: 'blue', special: 'indigo', neutral: 'teal' };

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function KpiCard({ label, value, sub, trend, icon: Icon, color, tone, to, index = 0 }) {
  const palette = color || COLORS[TONE_TO_COLOR[tone]] || COLORS.indigo;
  const glow = `rgba(${hexToRgb(palette.to)}, .35)`;
  const animated = useCountUp(value);
  const body = (
    <div
      className="dash-card dash-glow relative rounded-2xl p-5 pt-6 overflow-hidden h-full dash-enter"
      style={{ '--glow-color': glow, '--stagger': `${index * 60}ms` }}
    >
      {/* Colour-matched top accent, brighter and thicker than a hairline so
          the card has real presence before you even reach the icon. */}
      <div className="absolute top-0 left-0 right-0 h-[4px]" style={{ background: `linear-gradient(90deg, ${palette.from}, ${palette.to})` }} />
      {/* A wide, very soft wash of the card's own colour bleeding down from
          the top — this is what stops a white card sitting on a white
          canvas from reading as flat paper. */}
      <div aria-hidden="true" className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, rgba(${hexToRgb(palette.to)}, .12), transparent 70%)` }} />

      <div className="dash-icon-chip w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mb-4 text-white shadow-sm relative"
        style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }}>
        {Icon && <Icon className="w-5 h-5" />}
      </div>
      <div className="text-[13px] text-slate-500 font-medium relative">{label}</div>
      <div className="dash-figure text-[27px] font-bold mt-1 leading-tight tabular-nums relative" style={{ fontFamily: 'var(--font-display)' }}>
        {animated}
      </div>
      {(trend || sub) && (
        <div className="mt-1.5 text-xs font-medium flex items-center gap-1 relative"
          style={{ color: trend ? (trend.dir === 'down' ? 'var(--color-danger)' : 'var(--color-success)') : 'var(--color-faint)' }}>
          {trend && <span>{trend.dir === 'down' ? '↓' : '↑'} {trend.text}</span>}
          {!trend && sub && <span className="text-slate-400">{sub}</span>}
        </div>
      )}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}


// Formats a backend trend object for display. Deliberately returns null
// when the delta is zero or the backend couldn't compute an honest
// comparison — an empty space says less-but-true, where "0%" implies a
// measurement that didn't really happen.
function formatTrend(trend) {
  if (!trend || trend.delta === null || trend.delta === undefined) return null;
  const d = trend.delta;
  if (d === 0) return null;
  const sign = d > 0 ? '+' : '';
  const text = trend.unit === 'percent' ? `${sign}${d}% ${trend.label}` : `${sign}${d} ${trend.label}`;
  return { dir: d > 0 ? 'up' : 'down', text };
}

function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center justify-between mt-9 mb-3.5">
      <h2 className="text-[15px] font-bold text-ink flex items-center gap-2.5">
        {/* A short gradient tick rather than plain text — gives every
            section its own clearly-marked start, which is what makes the
            page scan as distinct zones instead of one long grey scroll. */}
        <span className="w-1 h-4 rounded-full shrink-0" style={{ background: 'linear-gradient(180deg, var(--color-brand), var(--color-special))' }} />
        {children}
      </h2>
      {action}
    </div>
  );
}

const RELATED_LABEL = { leads: 'Lead', accounts: 'Account', contacts: 'Contact', opportunities: 'Opportunity', tickets: 'Ticket' };

// A single "what's on today" row — avatar/initials, title, meta, and (for
// follow-ups specifically) a one-tap call button, matching the reference's
// richer follow-up rows.
function AgendaRow({ item, render, tone }) {
  const r = render(item);
  const initials = (r.title || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const body = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 shadow-sm"
        style={{ background: `${tone}1F`, color: tone }}>{initials}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink font-medium truncate">{r.title}</div>
        {r.meta && <div className="t-meta truncate">{r.meta}</div>}
      </div>
      {r.time && <span className="text-xs font-medium text-[var(--color-muted)] shrink-0 bg-[var(--color-canvas)] px-2 py-1 rounded-lg">{r.time}</span>}
      {r.phone && (
        // A <button>, not a nested <a> — this row's own wrapper is already an
        // anchor when r.to is set, and an anchor inside an anchor is invalid
        // HTML (React warns on it, and click targeting near the boundary
        // gets unreliable in some browsers). window.location does the same
        // job a tel: link does.
        <button type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `tel:${r.phone}`; }}
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform hover:scale-110"
          style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}>
          <Phone className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
  return r.to
    ? <Link to={r.to} className="block p-2 -mx-2 rounded-xl transition-colors hover:bg-[var(--color-canvas)]">{body}</Link>
    : <div className="p-2 -mx-2">{body}</div>;
}

function AgendaCard({ title, icon: Icon, iconTone, items, render, empty, action, cta, index = 0 }) {
  const list = items || [];
  const tone = iconTone || 'var(--color-brand)';
  const glow = tone.startsWith('#') ? `${tone}59` : 'rgba(99,102,241,.35)';
  return (
    <div className="dash-card dash-glow p-4 flex flex-col dash-enter" style={{ '--glow-color': glow, '--stagger': `${index * 70}ms` }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="t-section flex items-center gap-2">
          {Icon && (
            <span className="dash-icon-chip w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative"
              style={{ background: `${tone}1A`, color: tone }}>
              <Icon className="w-4 h-4" />
            </span>
          )}
          {title}
          {list.length > 0 && <span className="t-meta">({list.length})</span>}
        </h3>
        {action}
      </div>
      {list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-3">
          <p className="t-meta">{empty}</p>
          {cta && (
            <Link to={cta.to}
              className="text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{ background: `${tone}14`, color: tone }}>
              {cta.label}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">{list.map((item, i) => <AgendaRow key={i} item={item} render={render} tone={tone} />)}</div>
      )}
    </div>
  );
}

function SourceBars({ sources }) {
  const max = Math.max(1, ...sources.map((s) => s.c));
  const palette = ['#3B82F6', '#8B5CF6', '#F43F5E', '#F59E0B', '#10B981', '#14B8A6', '#6366F1', '#EC4899'];
  // Bars start at 0 width and animate to their real width a frame after
  // mount — without this the CSS transition on width has nothing to
  // transition FROM and the bars just appear pre-filled, same as before.
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <div className="space-y-3.5">
      {sources.map((s, i) => {
        const color = palette[i % palette.length];
        return (
          <div key={s.source}>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-ink truncate font-medium">{s.source}</span>
              <span className="font-semibold text-ink shrink-0 tabular-nums">{s.c}</span>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--color-canvas)] overflow-hidden">
              <div className="dash-bar-fill h-full rounded-full"
                style={{
                  width: grown ? `${(s.c / max) * 100}%` : '0%',
                  background: `linear-gradient(90deg, ${color}, ${color}CC)`,
                  '--bar-glow': `${color}80`,
                  transitionDelay: `${i * 60}ms`,
                }} />
            </div>
          </div>
        );
      })}
      {sources.length === 0 && <p className="t-meta">No leads yet.</p>}
    </div>
  );
}

const ACTIVITY_ICON = { call: PhoneCall, meeting: CalendarClock, task: CheckSquare, note: Send, email: Send };

const ACTIVITY_TONE = { call: '#0284C7', meeting: '#7C3AED', task: '#4F46E5', note: '#0F766E', email: '#DB2777' };

function RecentActivity({ activities }) {
  const [filter, setFilter] = useState('all');
  const types = useMemo(() => ['all', ...new Set(activities.map((a) => a.type))], [activities]);
  const filtered = filter === 'all' ? activities : activities.filter((a) => a.type === filter);
  return (
    <div className="dash-card dash-glow p-5 dash-enter" style={{ '--glow-color': 'rgba(99,102,241,.3)', '--stagger': '160ms' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <span className="w-1 h-4 rounded-full shrink-0" style={{ background: 'linear-gradient(180deg, var(--color-brand), var(--color-special))' }} />
          Recent Activity
        </h2>
        <div className="flex gap-1 bg-[var(--color-canvas)] rounded-lg p-1">
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-xs font-medium px-2.5 py-1 rounded-md capitalize transition-all ${
                filter === t ? 'bg-white text-ink shadow-sm' : 'text-[var(--color-muted)] hover:text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-0.5">
        {filtered.map((a) => {
          const Icon = ACTIVITY_ICON[a.type] || Send;
          const tone = ACTIVITY_TONE[a.type] || 'var(--color-brand)';
          return (
            <Link key={`${a.type}-${a.id}`} to={`/records/${a.related_module}/${a.related_record_id}`}
              className="group flex items-center gap-3 hover:bg-[var(--color-canvas)] -mx-2 px-2 py-2 rounded-xl transition-colors">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                style={{ background: `${tone}1F`, color: tone }}>
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
        <div className="dash-card dash-glow rounded-2xl p-4 mt-5 flex items-center gap-3 flex-wrap dash-enter"
          style={{ background: 'linear-gradient(120deg, var(--color-warning-soft), #FFFBEB 70%)', '--glow-color': 'rgba(217,119,6,.3)' }}>
          <div className="dash-icon-chip w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative shadow-sm" style={{ background: '#FDE9C8' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: '#B45309' }} />
          </div>
          <span className="text-sm font-bold text-ink shrink-0">Needs attention</span>
          <div className="flex flex-wrap gap-2 flex-1 min-w-0">
            {data.attention.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-xs bg-white px-3 py-1.5 rounded-full shadow-sm">
                <Badge tone={a.severity === 'high' ? 'danger' : 'warning'} size="xs">{a.severity}</Badge>
                <span className="text-ink">{a.text}</span>
              </span>
            ))}
          </div>
          <Link to="/leads" className="text-xs font-semibold shrink-0 flex items-center gap-0.5 transition-transform hover:translate-x-0.5" style={{ color: 'var(--color-brand)' }}>
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      <SectionLabel>Pipeline at a glance</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard index={0} label="Total Leads" value={c.total_leads} trend={formatTrend(data.trends?.total_leads)} icon={Users} color={COLORS.violet} to="/leads" />
        <KpiCard index={1} label="Pipeline Value" value={inr(c.pipeline_value)} trend={formatTrend(data.trends?.pipeline_value)} icon={Target} color={COLORS.teal} to="/records/opportunities" />
        <KpiCard index={2} label="Open Opportunities" value={c.open_opportunities} trend={formatTrend(data.trends?.open_opportunities)} icon={TrendingUp} color={COLORS.amber} to="/records/opportunities" />
        <KpiCard index={3} label="Won This Month" value={inr(c.won_revenue_month)} sub={`${c.lost_this_month} lost this month`} icon={Trophy} color={COLORS.emerald} to="/records/opportunities" />
        <KpiCard index={4} label="Follow-ups Due" value={c.followups_due_today} sub={`${c.followups_overdue} overdue`} icon={CalendarClock} color={COLORS.rose} to="/leads" />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-8">
        <AgendaCard index={0} title="Follow-ups due today" icon={CalendarClock} iconTone="#C026D3" items={data.agenda?.follow_ups}
          render={(f) => ({ title: f.title, phone: f.mobile, meta: f.mobile || f.status, to: `/leads/${f.id}` })}
          empty="No follow-ups scheduled for today."
          cta={{ to: '/leads', label: 'View all leads' }}
          action={data.agenda?.follow_ups?.length > 0 && <Link to="/leads" className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>View all →</Link>} />
        <AgendaCard index={1} title="Meetings today" icon={Users} iconTone="#0284C7"
          items={data.agenda?.meetings}
          render={(m) => ({ title: m.title, meta: m.start_datetime ? String(m.start_datetime).slice(11, 16) : '', to: m.related_module ? `/records/${m.related_module}/${m.related_record_id}` : null })}
          empty="Nothing in the diary today."
          cta={{ to: '/records/meetings', label: 'Schedule a meeting' }} />
        <AgendaCard index={2} title="Tasks due" icon={CheckSquare} iconTone="#4F46E5" items={data.agenda?.tasks_due}
          render={(t) => ({ title: t.title, meta: t.priority, to: null })}
          empty="No tasks due."
          cta={{ to: '/records/tasks', label: 'Create a task' }} />
      </div>

      {data.performance && (
        <>
          <SectionLabel>Performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard index={0} label="Deals won" value={data.performance.won} icon={CheckCircle2} color={COLORS.emerald} />
            <KpiCard index={1} label="Deals lost" value={data.performance.lost} icon={AlertTriangle} color={COLORS.rose} />
            <KpiCard index={2} label="Win rate" value={data.performance.win_rate === null ? '—' : `${data.performance.win_rate}%`}
              icon={TrendingUp} color={data.performance.win_rate === null ? COLORS.blue : COLORS.indigo} />
            <KpiCard index={3} label="Avg deal size" value={inr(data.performance.avg_deal_size)} icon={IndianRupee} color={COLORS.blue} />
          </div>
          {data.performance.win_rate === null && <p className="t-meta mt-2">No deals have closed yet, so a win rate can't be calculated.</p>}
        </>
      )}

      <SectionLabel>Where things stand</SectionLabel>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="dash-card dash-glow relative overflow-hidden p-5 lg:col-span-1 dash-enter" style={{ '--glow-color': 'rgba(59,130,246,.3)' }}>
          <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #60A5FA, #8B5CF6)' }} />
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-ink">Pipeline by Stage</h2>
            <Link to="/records/opportunities/kanban" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">Deal count and value per pipeline stage</p>
          <ChartFrame height={168}>
            <StageDonut stages={data.opportunities_by_stage} />
          </ChartFrame>
        </div>

        <div className="dash-card dash-glow relative overflow-hidden p-5 lg:col-span-1 dash-enter" style={{ '--glow-color': 'rgba(79,70,229,.3)', '--stagger': '70ms' }}>
          <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #4F46E5, #14B8A6)' }} />
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-ink">Monthly Revenue Trend</h2>
            <Link to="/records/subscriptions" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">Subscription payments collected, last 6 months</p>
          <ChartFrame height={220}>
            <RevenueArea data={data.revenue_by_month} />
          </ChartFrame>
        </div>

        <div className="dash-card dash-glow relative overflow-hidden p-5 lg:col-span-1 dash-enter" style={{ '--glow-color': 'rgba(244,63,94,.28)', '--stagger': '140ms' }}>
          <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #F43F5E, #F59E0B)' }} />
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-ink">Leads by Source</h2>
            <Link to="/leads" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>
          </div>
          <p className="text-xs text-slate-400 mb-4">Where your leads are coming from</p>
          <SourceBars sources={data.leads_by_source} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-6 mb-2">
        <div className="lg:col-span-2">
          <RecentActivity activities={data.recent_activities} />
        </div>
        <div className="dash-enter rounded-2xl p-6 text-white relative overflow-hidden flex flex-col justify-center shadow-[0_20px_45px_-18px_rgba(79,70,229,0.55)] transition-transform hover:-translate-y-1"
          style={{ background: 'linear-gradient(135deg, var(--color-brand), var(--color-special))', '--stagger': '200ms' }}>
          <div className="absolute inset-0 opacity-[0.08]" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '22px 22px',
          }} />
          {/* Two soft light blooms drifting slowly — the one bit of ambient
              motion inside the card, kept slow and low-contrast enough that
              it registers as "alive" rather than as an animation you notice. */}
          <div aria-hidden="true" className="absolute -top-16 -right-10 w-56 h-56 rounded-full pointer-events-none animate-[dash-drift_9s_ease-in-out_infinite]"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,.16), transparent 70%)' }} />
          <div aria-hidden="true" className="absolute -bottom-20 -left-14 w-64 h-64 rounded-full pointer-events-none animate-[dash-drift_11s_ease-in-out_infinite_reverse]"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,.12), transparent 70%)' }} />
          <div className="relative w-10 h-10 rounded-xl flex items-center justify-center mb-3 backdrop-blur-sm" style={{ background: 'rgba(255,255,255,.16)' }}>
            <Send className="w-5 h-5" />
          </div>
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
    <div className="relative max-w-[1600px] mx-auto rounded-3xl -m-4 sm:-m-6 p-4 sm:p-6"
      style={{ background: 'radial-gradient(ellipse 1400px 500px at top, var(--color-brand-soft), transparent 60%)' }}>

      {/* ===== Background treatment =====
          Three layers, all decorative, all behind the content:

          1. A fine dot grid — gives the canvas texture so white cards read
             as sitting ON something rather than floating in a void. Kept
             very low contrast; at normal viewing distance you register it
             as "not flat" rather than consciously seeing dots.
          2. Two soft colour blooms in the brand hues, top-right and
             bottom-left, so the page has warmth and a sense of depth.
          3. A large outline watermark of the brand mark, bottom-right.

          Every layer is `pointer-events-none` and sits at a negative
          z-index so it can never intercept a click or overlap text — a
          watermark that interferes with the UI is worse than no watermark.
          All of it is also `aria-hidden`, since none of it carries meaning
          for a screen reader. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden rounded-3xl pointer-events-none">
        <div className="absolute inset-0 opacity-[0.5]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(79,70,229,0.07) 1px, transparent 0)',
          backgroundSize: '26px 26px',
        }} />
        <div className="absolute -top-24 -right-24 w-[460px] h-[460px] rounded-full" style={{
          background: 'radial-gradient(circle, rgba(124,58,237,0.10), transparent 68%)',
        }} />
        <div className="absolute -bottom-32 -left-20 w-[420px] h-[420px] rounded-full" style={{
          background: 'radial-gradient(circle, rgba(37,99,235,0.09), transparent 68%)',
        }} />
        <svg viewBox="0 0 200 200" className="absolute bottom-6 right-8 w-[260px] h-[260px] opacity-[0.035]">
          <path d="M100 18 L168 56 L168 132 L100 170 L32 132 L32 56 Z" fill="none" stroke="#4F46E5" strokeWidth="5" />
          <path d="M100 54 L136 74 L136 114 L100 134 L64 114 L64 74 Z" fill="none" stroke="#4F46E5" strokeWidth="5" />
          <circle cx="100" cy="94" r="13" fill="#4F46E5" />
        </svg>
      </div>

      <div className="dash-enter rounded-2xl px-6 py-7 mb-2 relative overflow-hidden shadow-[0_16px_40px_-20px_rgba(79,70,229,0.35)] border border-white/60"
        style={{ background: 'linear-gradient(120deg, #EEF2FF 0%, #F5F3FF 45%, #FFFFFF 100%)' }}>
        {/* Soft depth wash behind the content — a flat pastel panel is what
            made this strip read as empty. Sits behind everything and is
            pointer-events-none so it can never interfere. */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle 420px at 78% 20%, rgba(129,140,248,0.2), transparent 70%)' }} />
        <div aria-hidden="true" className="absolute -top-20 -left-16 w-64 h-64 rounded-full pointer-events-none animate-[dash-drift_10s_ease-in-out_infinite]"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.10), transparent 70%)' }} />

        <div className="relative flex items-center justify-between flex-wrap gap-6">
          <div className="min-w-0">
            <h1 className="dash-figure font-display text-[27px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {greeting}, {user?.full_name?.split(' ')[0] || user?.username || 'there'}
            </h1>
            <p className="text-[var(--color-muted)] text-sm mt-1.5">Here's what's happening with your CRM today.</p>
          </div>

          {/* Illustration and quote now sit side by side in their own flex
              zone rather than one being absolutely positioned over the
              other. */}
          <div className="hidden md:flex items-center gap-3 shrink-0 ml-auto">
            <svg aria-hidden="true" viewBox="0 0 170 96" className="w-[150px] h-[84px] shrink-0">
              <ellipse cx="85" cy="88" rx="72" ry="7" fill="#C7D2FE" opacity="0.35" />
              <path d="M0 88 L42 34 L64 58 L96 16 L170 88 Z" fill="#DDE3FF" />
              <path d="M52 88 L96 16 L140 88 Z" fill="#C7D2FE" />
              <path d="M83 31 L96 16 L109 31 L101 27 L96 32 L91 27 Z" fill="#FFFFFF" />
              <rect x="95" y="6" width="1.8" height="22" rx="0.9" fill="#4338CA" />
              <path d="M96.8 6 L114 11.5 L96.8 17 Z" fill="#4F46E5" />
              <circle cx="34" cy="26" r="3" fill="#A5B4FC" opacity="0.8" />
              <circle cx="146" cy="34" r="2.2" fill="#A5B4FC" opacity="0.7" />
            </svg>
            <p className="text-xs text-[var(--color-muted)] italic leading-snug max-w-[150px]">
              "Small steps today, big results tomorrow."
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white border border-line rounded-xl px-3.5 py-2.5 shrink-0 shadow-[0_8px_20px_-10px_rgba(79,70,229,0.4)] transition-transform hover:-translate-y-0.5">
            <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-brand-soft)' }}>
              <CalendarClock className="w-3.5 h-3.5 text-[var(--color-brand)]" />
            </span>
            <span className="text-sm text-ink font-semibold">{today}</span>
          </div>
        </div>
      </div>

      <CrmDashboardSection data={crmData} />
    </div>
  );
}
