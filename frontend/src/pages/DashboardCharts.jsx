/*
 * The two recharts-backed visualisations from the Dashboard, split into
 * their own module.
 *
 * recharts (plus its d3 dependencies) is by far the heaviest thing the app
 * imports. While it lived in Dashboard.jsx it was pulled into the chunk
 * that loads on first paint, so every user paid for it before seeing
 * anything. Here it sits behind a lazy() boundary: the Dashboard renders
 * its KPI cards and lists immediately, and the charts stream in a moment
 * later.
 *
 * This file must stay the ONLY module that imports recharts — importing it
 * anywhere else would put it back in a shared chunk and undo the split.
 */
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const STAGE_FALLBACK = ['#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6', '#F59E0B', '#10B981', '#F43F5E'];

// Pipeline-by-stage donut, using each stage's OWN colour from the pipeline
// configuration (module_pipeline_stages.color) rather than a fixed palette
// — a stage renamed or recoloured in Settings → Pipelines is reflected here
// automatically.
// `centreLabel` describes what the middle number counts. It defaults to
// "Total Deals" because this chart plots opportunities by pipeline stage —
// the previous hard-coded "Total Leads" was simply wrong, and contradicted
// the Total Leads KPI card directly above it on the Dashboard.
export function StageDonut({ stages = [], centreLabel = 'Total Deals' }) {
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
              <defs>
                {/* A faint drop shadow under the ring itself — this is what
                    separates the donut from the flat centre disc rather than
                    the two reading as one grey blob. */}
                <filter id="donutLift" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1E1B4B" floodOpacity="0.16" />
                </filter>
              </defs>
              <Pie data={data} dataKey="c" nameKey="stage" innerRadius={56} outerRadius={82} paddingAngle={3}
                strokeWidth={0} cornerRadius={5} filter="url(#donutLift)">
                {data.map((s, i) => <Cell key={i} fill={colourOf(s, i)} />)}
              </Pie>
              <Tooltip formatter={(v, n, p) => [`${v} deal(s) · ${inr(p.payload.total)}`, p.payload.stage]}
                contentStyle={{ borderRadius: 10, border: '1px solid var(--color-line)', fontSize: 12, boxShadow: '0 8px 24px -8px rgba(30,27,75,.25)' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="dash-figure text-[28px] font-bold leading-none">{total}</span>
          <span className="t-meta mt-1">{centreLabel}</span>
        </div>
      </div>
      <div className="flex-1 min-w-[170px] space-y-2.5">
        {stages.map((s, i) => (
          <div key={s.stage} className="flex items-center justify-between text-sm gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colourOf(s, i), boxShadow: `0 0 6px ${colourOf(s, i)}99` }} />
              <span className="text-ink truncate">{s.stage}</span>
            </span>
            <span className="text-[var(--color-muted)] shrink-0 font-medium tabular-nums">
              {s.c} {total > 0 && <span className="text-xs font-normal">({Math.round((s.c / total) * 100)}%)</span>}
            </span>
          </div>
        ))}
        {stages.length === 0 && <p className="t-meta">No pipeline configured.</p>}
      </div>
    </div>
  );
}

// Subscription revenue collected per month, last 6 months.
export function RevenueArea({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.35} />
            <stop offset="55%" stopColor="#4F46E5" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="revenueLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>
          {/* A soft glow sitting under the line itself, in the line's own
              colour — the touch that makes the trend read as "lit" rather
              than as a plain plotted stroke. */}
          <filter id="lineGlow" x="-20%" y="-60%" width="140%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#4F46E5" floodOpacity="0.45" />
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke="var(--color-line)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`} />
        <Tooltip formatter={(v) => inr(v)}
          contentStyle={{ borderRadius: 10, border: '1px solid var(--color-line)', fontSize: 12, boxShadow: '0 8px 24px -8px rgba(30,27,75,.25)' }} />
        <Area type="monotone" dataKey="revenue" stroke="url(#revenueLine)" strokeWidth={3} fill="url(#revenueFill)"
          filter="url(#lineGlow)"
          dot={{ fill: '#4F46E5', r: 4, strokeWidth: 2, stroke: '#fff' }}
          activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
