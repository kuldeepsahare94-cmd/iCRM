import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, TrendingUp, CalendarClock, IndianRupee, Target, CheckCircle2, Trophy,
  AlertTriangle, Phone, PhoneCall, CheckSquare, Send, ArrowRight, Wallet,
  LifeBuoy, Medal, ChevronRight,
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

// Compact money for places where the full figure would wrap — ₹44.9L rather
// than ₹44,90,543. Indian units (lakh/crore), because this is an Indian
// product and "4.5M" is not how anyone here reads a number.
function inrShort(n) {
  const v = Number(n || 0);
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
}

// "2h ago" / "Yesterday" / "12 Sep" — an activity feed without times reads
// as a list of nouns rather than a history, which is what made the old one
// feel arbitrary.
function relativeTime(value) {
  if (!value) return '';
  const then = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(then.getTime())) return '';
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

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
      className="dash-card dash-glow relative rounded-2xl p-4 pt-5 overflow-hidden h-full dash-enter group"
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

      <div className="flex items-start justify-between gap-2">
        <div className="dash-icon-chip w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mb-3 text-white shadow-sm relative"
          style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }}>
          {Icon && <Icon className="w-[18px] h-[18px]" />}
        </div>
        {/* Only drawn when the card actually goes somewhere, so a card that
            can't be opened never advertises that it can. */}
        {to && (
          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 transition-all group-hover:text-[var(--color-brand)] group-hover:translate-x-0.5" />
        )}
      </div>
      <div className="text-[13px] text-slate-500 font-medium relative">{label}</div>
      <div className="dash-figure text-[26px] font-bold mt-0.5 leading-tight tabular-nums relative" style={{ fontFamily: 'var(--font-display)' }}>
        {animated}
      </div>
      {(trend || sub) && (
        <div className="mt-1 text-xs font-medium flex items-center gap-1 relative"
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
    <div className="flex items-center justify-between gap-3 mt-7 mb-3">
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

// Shared shell for every panel that isn't a KPI: title row, optional
// "view all", body, and — critically — a HEIGHT. Every list on this page
// is capped rather than free-running, so a CRM with 66 tasks due renders
// exactly as tall as one with 3. Without this the tallest list dictated
// the height of its whole grid row, which is what made the momentum panel
// stretch further down the page every time more records were added.
function Panel({ title, icon: Icon, tone = 'var(--color-brand)', count, action, height, index = 0, children, accent }) {
  const glow = tone.startsWith('#') ? `${tone}52` : 'rgba(99,102,241,.32)';
  return (
    <div className="dash-card dash-glow relative overflow-hidden p-4 flex flex-col dash-enter"
      style={{ '--glow-color': glow, '--stagger': `${index * 70}ms`, height }}>
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: accent }} />}
      <div className="flex items-center justify-between gap-2 mb-2.5 shrink-0">
        <h3 className="t-section flex items-center gap-2 min-w-0">
          {Icon && (
            <span className="dash-icon-chip w-7 h-7 rounded-lg flex items-center justify-center shrink-0 relative"
              style={{ background: `${tone}1A`, color: tone }}>
              <Icon className="w-[15px] h-[15px]" />
            </span>
          )}
          <span className="truncate">{title}</span>
          {count > 0 && (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 tabular-nums"
              style={{ background: `${tone}14`, color: tone }}>{count}</span>
          )}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// The "and there are more of these" footer. Only rendered when the list was
// actually truncated, so a panel showing everything doesn't invite a click
// that changes nothing.
function MoreLink({ shown, total, to, noun }) {
  if (!total || total <= shown) return null;
  return (
    <Link to={to}
      className="mt-auto pt-2 shrink-0 flex items-center justify-between text-xs font-semibold border-t border-line/70 -mx-4 px-4 -mb-1 pb-0.5 transition-colors hover:text-[var(--color-brand)]"
      style={{ color: 'var(--color-muted)' }}>
      <span>{total - shown} more {noun}</span>
      <span className="flex items-center gap-0.5" style={{ color: 'var(--color-brand)' }}>
        View all {total} <ArrowRight className="w-3 h-3" />
      </span>
    </Link>
  );
}

const RELATED_LABEL = { leads: 'Lead', accounts: 'Account', contacts: 'Contact', opportunities: 'Opportunity', tickets: 'Ticket' };
const PRIORITY_TONE = { Urgent: '#DC2626', High: '#EA580C', Medium: '#D97706', Low: '#64748B' };

// A single "what's on today" row — avatar/initials, title, meta, and (for
// follow-ups specifically) a one-tap call button.
function AgendaRow({ item, render, tone }) {
  const r = render(item);
  const initials = (r.title || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const body = (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 shadow-sm"
        style={{ background: `${r.dotTone || tone}1F`, color: r.dotTone || tone }}>{initials}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink font-medium truncate leading-tight">{r.title}</div>
        {r.meta && <div className="text-[11px] text-slate-400 truncate mt-0.5">{r.meta}</div>}
      </div>
      {r.time && <span className="text-[11px] font-semibold text-[var(--color-muted)] shrink-0 bg-[var(--color-canvas)] px-1.5 py-0.5 rounded-md tabular-nums">{r.time}</span>}
      {r.phone && (
        // A <button>, not a nested <a> — this row's own wrapper is already an
        // anchor when r.to is set, and an anchor inside an anchor is invalid
        // HTML (React warns on it, and click targeting near the boundary
        // gets unreliable in some browsers). window.location does the same
        // job a tel: link does.
        <button type="button" title="Call"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `tel:${r.phone}`; }}
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-transform hover:scale-110"
          style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}>
          <Phone className="w-3 h-3" />
        </button>
      )}
    </div>
  );
  return r.to
    ? <Link to={r.to} className="block px-2 py-1.5 -mx-2 rounded-lg transition-colors hover:bg-[var(--color-canvas)]">{body}</Link>
    : <div className="px-2 py-1.5 -mx-2">{body}</div>;
}

// Today's three lists. The cap is what actually fixes the runaway panel: the
// backend sends six, this shows five, and the footer says how many there
// really are and links to the list view that can show them all properly.
//
// AGENDA_HEIGHT is derived, not guessed: header (47) + five 48px rows (243)
// + the "view all" footer (36) + padding. Measured in a browser rather than
// eyeballed — at 296 the fifth row ended one pixel past the card and was
// silently hidden behind the footer, so a panel claiming five rows showed
// four.
const AGENDA_CAP = 5;
const AGENDA_HEIGHT = 340;

function AgendaCard({ title, icon, iconTone, items, total, render, empty, cta, viewAll, noun, index = 0 }) {
  const list = (items || []).slice(0, AGENDA_CAP);
  const tone = iconTone || 'var(--color-brand)';
  const realTotal = total ?? (items || []).length;
  return (
    <Panel title={title} icon={icon} tone={tone} count={realTotal} height={AGENDA_HEIGHT} index={index}>
      {list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
          <p className="t-meta">{empty}</p>
          {cta && (
            <Link to={cta.to}
              className="text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{ background: `${tone}14`, color: tone }}>
              {cta.label}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-0.5 overflow-hidden">
            {list.map((item, i) => <AgendaRow key={i} item={item} render={render} tone={tone} />)}
          </div>
          <MoreLink shown={list.length} total={realTotal} to={viewAll} noun={noun} />
        </>
      )}
    </Panel>
  );
}

function SourceBars({ sources }) {
  const top = (sources || []).slice(0, 5);
  const max = Math.max(1, ...top.map((s) => s.c));
  const palette = ['#3B82F6', '#8B5CF6', '#F43F5E', '#F59E0B', '#10B981', '#14B8A6', '#6366F1', '#EC4899'];
  // Bars start at 0 width and animate to their real width a frame after
  // mount — without this the CSS transition on width has nothing to
  // transition FROM and the bars just appear pre-filled.
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <div className="space-y-2.5">
      {top.map((s, i) => {
        const color = palette[i % palette.length];
        return (
          <div key={s.source}>
            <div className="flex items-center justify-between text-[13px] mb-1">
              <span className="text-ink truncate font-medium">{s.source}</span>
              <span className="font-semibold text-ink shrink-0 tabular-nums">{s.c}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-canvas)] overflow-hidden">
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
      {top.length === 0 && <p className="t-meta">No leads yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collections — the one panel on this page that reports cash rather than
// forecast. Everything else counts deals that might close; this counts money
// that has actually arrived, which is usually the first question anyone
// running the business asks.
// ---------------------------------------------------------------------------
function CollectionsCard({ collections, index }) {
  const c = collections || {};
  const pct = c.collected_pct;
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <Panel title="Collections" icon={Wallet} tone="#059669" height={296} index={index}
      accent="linear-gradient(90deg, #34D399, #059669)"
      action={<Link to="/records/invoices" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>}>
      <p className="text-[11px] text-slate-400 -mt-1.5 mb-3">Invoiced vs actually received</p>

      {pct === null || pct === undefined ? (
        <div className="flex-1 flex items-center justify-center"><p className="t-meta">No invoices raised yet.</p></div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="dash-figure text-[26px] font-bold leading-none tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                {inrShort(c.collected)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">collected of {inrShort(c.invoiced)}</div>
            </div>
            <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: '#059669' }}>{pct}%</span>
          </div>

          <div className="h-2.5 rounded-full bg-[var(--color-canvas)] overflow-hidden mt-3">
            <div className="dash-bar-fill h-full rounded-full"
              style={{
                width: grown ? `${Math.min(100, pct)}%` : '0%',
                background: 'linear-gradient(90deg, #34D399, #059669)',
                '--bar-glow': '#05966980',
              }} />
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="rounded-xl p-2.5" style={{ background: 'var(--color-canvas)' }}>
              <div className="text-[11px] text-slate-400">Outstanding</div>
              <div className="text-sm font-bold text-ink mt-0.5 tabular-nums">{inrShort(c.outstanding)}</div>
            </div>
            <div className="rounded-xl p-2.5" style={{ background: c.overdue_count ? 'var(--color-danger-soft)' : 'var(--color-canvas)' }}>
              <div className="text-[11px]" style={{ color: c.overdue_count ? 'var(--color-danger)' : 'var(--color-faint)' }}>Overdue</div>
              <div className="text-sm font-bold mt-0.5 tabular-nums" style={{ color: c.overdue_count ? 'var(--color-danger)' : 'var(--color-ink)' }}>
                {inrShort(c.overdue_amount)}
              </div>
            </div>
          </div>
          <p className="t-meta mt-2.5">
            {c.invoice_count} invoice{c.invoice_count === 1 ? '' : 's'}
            {c.overdue_count > 0 && <> · <span style={{ color: 'var(--color-danger)' }}>{c.overdue_count} past due date</span></>}
          </p>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Who is closing business. Ranked by value rather than count — five small
// wins and one large one are not the same contribution, and ordering by
// count would say they were.
// ---------------------------------------------------------------------------
const RANK_TONE = ['#D97706', '#64748B', '#B45309', '#94A3B8', '#94A3B8'];

function LeaderboardCard({ leaderboard, index }) {
  const rows = leaderboard || [];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Panel title="Top performers" icon={Medal} tone="#7C3AED" height={296} index={index}
      accent="linear-gradient(90deg, #A78BFA, #7C3AED)"
      action={<Link to="/records/opportunities" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>}>
      <p className="text-[11px] text-slate-400 -mt-1.5 mb-3">Won deals by owner, all time</p>
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="t-meta">No deals won yet.</p></div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={`${r.name}-${i}`} className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums"
                style={{ background: `${RANK_TONE[i]}1F`, color: RANK_TONE[i] }}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink truncate">{r.name}</span>
                  <span className="text-[13px] font-bold text-ink shrink-0 tabular-nums">{inrShort(r.value)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-canvas)] overflow-hidden mt-1">
                  <div className="h-full rounded-full" style={{
                    width: `${(r.value / max) * 100}%`,
                    background: 'linear-gradient(90deg, #A78BFA, #7C3AED)',
                  }} />
                </div>
              </div>
              <span className="text-[11px] text-slate-400 shrink-0 tabular-nums w-10 text-right">{r.won} won</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Open support load, worst-first. Resolved and closed tickets are excluded
// entirely — this panel is about what is still on someone's plate.
// ---------------------------------------------------------------------------
const TICKET_TONE = { Urgent: '#DC2626', High: '#EA580C', Medium: '#D97706', Low: '#0891B2', Unset: '#94A3B8' };

function SupportCard({ ticketLoad, openTickets, index }) {
  const rows = ticketLoad || [];
  const total = rows.reduce((s, r) => s + r.c, 0);
  return (
    <Panel title="Support load" icon={LifeBuoy} tone="#DC2626" height={296} index={index}
      accent="linear-gradient(90deg, #FB7185, #DC2626)"
      action={<Link to="/records/tickets" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>}>
      <p className="text-[11px] text-slate-400 -mt-1.5 mb-3">Open tickets by priority</p>
      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <CheckCircle2 className="w-7 h-7" style={{ color: 'var(--color-success)' }} />
          <p className="t-meta">No open tickets. Queue is clear.</p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-2 mb-3">
            <span className="dash-figure text-[26px] font-bold leading-none tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{total}</span>
            <span className="text-[11px] text-slate-400 mb-1">open right now</span>
          </div>
          {/* One proportional bar rather than four separate ones — the split
              between priorities is the point, and a single stacked bar shows
              that in one glance. */}
          <div className="flex h-2.5 rounded-full overflow-hidden mb-3.5">
            {rows.map((r) => (
              <div key={r.priority} style={{ width: `${(r.c / total) * 100}%`, background: TICKET_TONE[r.priority] || '#94A3B8' }} />
            ))}
          </div>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.priority} className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: TICKET_TONE[r.priority] || '#94A3B8', boxShadow: `0 0 6px ${TICKET_TONE[r.priority] || '#94A3B8'}99` }} />
                  <span className="text-ink truncate">{r.priority}</span>
                </span>
                <span className="font-semibold text-ink shrink-0 tabular-nums">{r.c}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

const ACTIVITY_ICON = { call: PhoneCall, meeting: CalendarClock, task: CheckSquare, note: Send, email: Send };
const ACTIVITY_TONE = { call: '#0284C7', meeting: '#7C3AED', task: '#4F46E5', note: '#0F766E', email: '#DB2777' };
const ACTIVITY_CAP = 8;

// Full width and two columns internally. The old version was a single
// narrow column beside a decorative panel, so eight rows of activity ran
// down the page while half the row sat empty.
function RecentActivity({ activities }) {
  const all = activities || [];
  const [filter, setFilter] = useState('all');
  const types = useMemo(() => ['all', ...new Set(all.map((a) => a.type))], [all]);
  const filtered = (filter === 'all' ? all : all.filter((a) => a.type === filter)).slice(0, ACTIVITY_CAP);
  return (
    <div className="dash-card dash-glow p-4 dash-enter" style={{ '--glow-color': 'rgba(99,102,241,.3)', '--stagger': '120ms' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="t-section flex items-center gap-2">
          <span className="dash-icon-chip w-7 h-7 rounded-lg flex items-center justify-center shrink-0 relative"
            style={{ background: 'rgba(79,70,229,.1)', color: 'var(--color-brand)' }}>
            <Send className="w-[15px] h-[15px]" />
          </span>
          Latest activity
        </h3>
        <div className="flex gap-1 bg-[var(--color-canvas)] rounded-lg p-1">
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-[11px] font-medium px-2 py-1 rounded-md capitalize transition-all ${
                filter === t ? 'bg-white text-ink shadow-sm' : 'text-[var(--color-muted)] hover:text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
        {filtered.map((a) => {
          const Icon = ACTIVITY_ICON[a.type] || Send;
          const tone = ACTIVITY_TONE[a.type] || 'var(--color-brand)';
          const to = a.related_module && a.related_record_id
            ? `/records/${a.related_module}/${a.related_record_id}`
            : null;
          const inner = (
            <>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                style={{ background: `${tone}1F`, color: tone }}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink font-medium truncate leading-tight">{a.title || 'Untitled'}</div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span className="capitalize">{a.type}</span>
                  {a.related_module && <>·<span>{RELATED_LABEL[a.related_module] || a.related_module}</span></>}
                </div>
              </div>
              <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">{relativeTime(a.activity_date)}</span>
            </>
          );
          const cls = 'group flex items-center gap-2.5 -mx-2 px-2 py-2 rounded-lg transition-colors';
          return to
            ? <Link key={`${a.type}-${a.id}`} to={to} className={`${cls} hover:bg-[var(--color-canvas)]`}>{inner}</Link>
            : <div key={`${a.type}-${a.id}`} className={cls}>{inner}</div>;
        })}
        {filtered.length === 0 && <p className="text-sm text-slate-400 py-3 text-center sm:col-span-2">Nothing logged yet.</p>}
      </div>
    </div>
  );
}

// A single horizontal strip, never a wrapping block. Each item links to the
// module it's actually about — the previous version sent every one of them
// to /leads regardless of what it said, so "3 subscriptions renewing" opened
// the leads list. On a narrow screen this scrolls sideways rather than
// stacking into four rows that push the whole dashboard down.
function AttentionBar({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="dash-card dash-glow rounded-2xl px-3 py-2.5 mt-4 flex items-center gap-3 dash-enter"
      style={{ background: 'linear-gradient(120deg, var(--color-warning-soft), #FFFBEB 70%)', '--glow-color': 'rgba(217,119,6,.3)' }}>
      <div className="flex items-center gap-2 shrink-0">
        <div className="dash-icon-chip w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative shadow-sm" style={{ background: '#FDE9C8' }}>
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#B45309' }} />
        </div>
        <span className="text-[13px] font-bold text-ink hidden sm:block">Needs attention</span>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto thin-scroll py-0.5">
        {items.map((a, i) => (
          <Link key={i} to={a.link || '/'}
            className="group inline-flex items-center gap-2 text-xs bg-white pl-1.5 pr-2.5 py-1 rounded-full shadow-sm shrink-0 whitespace-nowrap transition-all hover:shadow-md hover:-translate-y-0.5">
            <Badge tone={a.severity === 'high' ? 'danger' : 'warning'} size="xs">{a.severity}</Badge>
            <span className="text-ink">{a.text}</span>
            <ChevronRight className="w-3 h-3 text-slate-300 transition-all group-hover:text-[var(--color-brand)] group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function CrmDashboardSection({ data }) {
  const c = data.cards;
  const counts = data.agenda_counts || {};
  return (
    <>
      <AttentionBar items={data.attention} />

      <SectionLabel>Pipeline at a glance</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <KpiCard index={0} label="Total Leads" value={c.total_leads} trend={formatTrend(data.trends?.total_leads)} icon={Users} color={COLORS.violet} to="/leads" />
        <KpiCard index={1} label="Pipeline Value" value={inr(c.pipeline_value)} trend={formatTrend(data.trends?.pipeline_value)} icon={Target} color={COLORS.teal} to="/records/opportunities" />
        <KpiCard index={2} label="Open Opportunities" value={c.open_opportunities} trend={formatTrend(data.trends?.open_opportunities)} icon={TrendingUp} color={COLORS.amber} to="/records/opportunities" />
        <KpiCard index={3} label="Won This Month" value={inr(c.won_revenue_month)} sub={`${c.lost_this_month} lost this month`} icon={Trophy} color={COLORS.emerald} to="/records/opportunities" />
        <KpiCard index={4} label="Follow-ups Due" value={c.followups_due_today} sub={`${c.followups_overdue} overdue`} icon={CalendarClock} color={COLORS.rose} to="/leads" />
      </div>

      <SectionLabel>On today</SectionLabel>
      <div className="grid md:grid-cols-3 gap-3.5">
        <AgendaCard index={0} title="Follow-ups" icon={CalendarClock} iconTone="#C026D3"
          items={data.agenda?.follow_ups} total={counts.follow_ups} noun="today" viewAll="/leads"
          render={(f) => ({ title: f.title, phone: f.mobile, meta: f.mobile || f.status, to: `/leads/${f.id}` })}
          empty="No follow-ups scheduled for today."
          cta={{ to: '/leads', label: 'View all leads' }} />
        <AgendaCard index={1} title="Meetings" icon={Users} iconTone="#0284C7"
          items={data.agenda?.meetings} total={counts.meetings} noun="today" viewAll="/records/meetings"
          render={(m) => ({
            title: m.title,
            meta: m.related_module ? (RELATED_LABEL[m.related_module] || m.related_module) : 'Meeting',
            time: m.start_datetime ? String(m.start_datetime).slice(11, 16) : '',
            // Always openable now. Previously a meeting with no linked
            // record rendered as a dead row you could click forever.
            to: `/records/meetings/${m.id}`,
          })}
          empty="Nothing in the diary today."
          cta={{ to: '/records/meetings', label: 'Schedule a meeting' }} />
        <AgendaCard index={2} title="Tasks due" icon={CheckSquare} iconTone="#4F46E5"
          items={data.agenda?.tasks_due} total={counts.tasks_due} noun="due" viewAll="/records/tasks"
          render={(t) => ({
            title: t.title,
            meta: t.priority ? `${t.priority} priority` : null,
            dotTone: PRIORITY_TONE[t.priority],
            // Tasks were the one list on this page that went nowhere.
            to: `/records/tasks/${t.id}`,
          })}
          empty="No tasks due."
          cta={{ to: '/records/tasks', label: 'Create a task' }} />
      </div>

      {data.performance && (
        <>
          <SectionLabel>Performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {/* Every one of these now opens the deals list — a number you
                can't drill into is a dead end, which is what these four
                were. */}
            <KpiCard index={0} label="Deals won" value={data.performance.won} icon={CheckCircle2} color={COLORS.emerald} to="/records/opportunities" />
            <KpiCard index={1} label="Deals lost" value={data.performance.lost} icon={AlertTriangle} color={COLORS.rose} to="/records/opportunities" />
            <KpiCard index={2} label="Win rate" value={data.performance.win_rate === null ? '—' : `${data.performance.win_rate}%`}
              icon={TrendingUp} color={data.performance.win_rate === null ? COLORS.blue : COLORS.indigo} to="/records/opportunities" />
            <KpiCard index={3} label="Avg deal size" value={inr(data.performance.avg_deal_size)} icon={IndianRupee} color={COLORS.blue} to="/records/opportunities" />
          </div>
          {data.performance.win_rate === null && <p className="t-meta mt-2">No deals have closed yet, so a win rate can't be calculated.</p>}
        </>
      )}

      <SectionLabel>Where things stand</SectionLabel>
      <div className="grid lg:grid-cols-3 gap-3.5">
        <Panel title="Pipeline by Stage" height={324} index={0} tone="#3B82F6"
          accent="linear-gradient(90deg, #60A5FA, #8B5CF6)"
          action={<Link to="/records/opportunities/kanban" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>}>
          <p className="text-[11px] text-slate-400 -mt-1.5 mb-2">Deal count and value per stage</p>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChartFrame height={168}>
              <StageDonut stages={data.opportunities_by_stage} />
            </ChartFrame>
          </div>
        </Panel>

        <Panel title="Monthly Revenue Trend" height={324} index={1} tone="#4F46E5"
          accent="linear-gradient(90deg, #4F46E5, #14B8A6)"
          action={<Link to="/records/subscriptions" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>}>
          <p className="text-[11px] text-slate-400 -mt-1.5 mb-2">Payments collected, last 6 months</p>
          <div className="flex-1 min-h-0">
            <ChartFrame height={220}>
              <RevenueArea data={data.revenue_by_month} />
            </ChartFrame>
          </div>
        </Panel>

        <Panel title="Leads by Source" height={324} index={2} tone="#F43F5E"
          accent="linear-gradient(90deg, #F43F5E, #F59E0B)"
          action={<Link to="/leads" className="t-meta hover:text-[var(--color-brand)] transition-colors">View details →</Link>}>
          <p className="text-[11px] text-slate-400 -mt-1.5 mb-3">Top 5 sources by lead count</p>
          <SourceBars sources={data.leads_by_source} />
        </Panel>
      </div>

      <SectionLabel>Money &amp; workload</SectionLabel>
      <div className="grid lg:grid-cols-3 gap-3.5">
        <CollectionsCard collections={data.collections} index={0} />
        <LeaderboardCard leaderboard={data.leaderboard} index={1} />
        <SupportCard ticketLoad={data.ticket_load} openTickets={c.open_tickets} index={2} />
      </div>

      <SectionLabel>Latest activity</SectionLabel>
      <RecentActivity activities={data.recent_activities} />

      {/* Page end. A deliberate closing strip rather than the content simply
          stopping — and, being full width and outside every grid, it is the
          one element on the page that cannot be stretched taller by a CRM
          with more records in it. */}
      <div className="dash-enter rounded-2xl mt-4 mb-1 px-5 py-4 text-white relative overflow-hidden flex items-center gap-4 flex-wrap shadow-[0_18px_40px_-20px_rgba(79,70,229,0.55)]"
        style={{ background: 'linear-gradient(120deg, var(--color-brand), var(--color-special))', '--stagger': '160ms' }}>
        <div className="absolute inset-0 opacity-[0.08]" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '22px 22px',
        }} />
        <div aria-hidden="true" className="absolute -top-16 -right-10 w-56 h-56 rounded-full pointer-events-none animate-[dash-drift_9s_ease-in-out_infinite]"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,.16), transparent 70%)' }} />
        <div aria-hidden="true" className="absolute -bottom-24 left-1/3 w-64 h-64 rounded-full pointer-events-none animate-[dash-drift_11s_ease-in-out_infinite_reverse]"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,.12), transparent 70%)' }} />
        <div className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 backdrop-blur-sm" style={{ background: 'rgba(255,255,255,.16)' }}>
          <Send className="w-4 h-4" />
        </div>
        <div className="relative min-w-0 flex-1">
          <h3 className="font-bold text-[15px]" style={{ fontFamily: 'var(--font-display)' }}>Keep the momentum going</h3>
          <p className="text-white/75 text-xs mt-0.5">More conversations. More opportunities. A greater tomorrow.</p>
        </div>
        <div className="relative flex gap-2 shrink-0">
          <Link to="/leads" className="text-xs font-semibold px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all hover:-translate-y-0.5"
            style={{ background: 'rgba(255,255,255,.18)' }}>Work my leads</Link>
          <Link to="/records/opportunities/kanban" className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white transition-all hover:-translate-y-0.5"
            style={{ color: 'var(--color-brand)' }}>Open pipeline</Link>
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

      <div className="dash-enter rounded-2xl px-5 py-4 relative overflow-hidden shadow-[0_16px_40px_-20px_rgba(79,70,229,0.35)] border border-white/60"
        style={{ background: 'linear-gradient(120deg, #EEF2FF 0%, #F5F3FF 45%, #FFFFFF 100%)' }}>
        {/* Soft depth wash behind the content — a flat pastel panel is what
            made this strip read as empty. Sits behind everything and is
            pointer-events-none so it can never interfere. */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle 420px at 78% 20%, rgba(129,140,248,0.2), transparent 70%)' }} />
        <div aria-hidden="true" className="absolute -top-20 -left-16 w-64 h-64 rounded-full pointer-events-none animate-[dash-drift_10s_ease-in-out_infinite]"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.10), transparent 70%)' }} />

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <h1 className="dash-figure font-display text-[23px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {greeting}, {user?.full_name?.split(' ')[0] || user?.username || 'there'}
            </h1>
            <p className="text-[var(--color-muted)] text-[13px] mt-0.5">Here's what's happening with your CRM today.</p>
          </div>

          {/* Illustration and quote sit side by side in their own flex zone
              rather than one being absolutely positioned over the other. */}
          <div className="hidden lg:flex items-center gap-3 shrink-0 ml-auto">
            <svg aria-hidden="true" viewBox="0 0 170 96" className="w-[110px] h-[62px] shrink-0">
              <ellipse cx="85" cy="88" rx="72" ry="7" fill="#C7D2FE" opacity="0.35" />
              <path d="M0 88 L42 34 L64 58 L96 16 L170 88 Z" fill="#DDE3FF" />
              <path d="M52 88 L96 16 L140 88 Z" fill="#C7D2FE" />
              <path d="M83 31 L96 16 L109 31 L101 27 L96 32 L91 27 Z" fill="#FFFFFF" />
              <rect x="95" y="6" width="1.8" height="22" rx="0.9" fill="#4338CA" />
              <path d="M96.8 6 L114 11.5 L96.8 17 Z" fill="#4F46E5" />
              <circle cx="34" cy="26" r="3" fill="#A5B4FC" opacity="0.8" />
              <circle cx="146" cy="34" r="2.2" fill="#A5B4FC" opacity="0.7" />
            </svg>
            <p className="text-[11px] text-[var(--color-muted)] italic leading-snug max-w-[140px]">
              "Small steps today, big results tomorrow."
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white border border-line rounded-xl px-3 py-2 shrink-0 shadow-[0_8px_20px_-10px_rgba(79,70,229,0.4)] transition-transform hover:-translate-y-0.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--color-brand-soft)' }}>
              <CalendarClock className="w-3 h-3 text-[var(--color-brand)]" />
            </span>
            <span className="text-[13px] text-ink font-semibold">{today}</span>
          </div>
        </div>
      </div>

      <CrmDashboardSection data={crmData} />
    </div>
  );
}
