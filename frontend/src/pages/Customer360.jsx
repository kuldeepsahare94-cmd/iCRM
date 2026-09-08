import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, TrendingUp, Wallet, Repeat, LifeBuoy, FileText, Users as UsersIcon,
  AlertTriangle, Activity, Info, Phone, Mail, Calendar, StickyNote, CheckSquare, Paperclip,
} from 'lucide-react';
import { api } from '../api';
import {
  PageHeader, KpiCard, Badge, Avatar, SkeletonCards, ErrorState, EmptyState, friendlyError,
} from '../components/ui';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const dt = (v) => (v ? String(v).slice(0, 10) : '—');

const scoreTone = (s) => (s >= 80 ? 'success' : s >= 60 ? 'info' : s >= 40 ? 'warning' : 'danger');
const TONE_HEX = {
  success: 'var(--color-success)', info: 'var(--color-info)',
  warning: 'var(--color-warning)', danger: 'var(--color-danger)',
};

// Big score dial with the band underneath. Deliberately shows the raw
// number — an unexplained letter grade is worse than a number you can
// click into.
function ScoreRing({ score, band, label, tone }) {
  const colour = TONE_HEX[tone] || TONE_HEX.info;
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-line)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={colour} strokeWidth="3"
            strokeDasharray={`${score}, 100`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color: colour }}>{score}</span>
        </div>
      </div>
      <div>
        <div className="t-meta">{label}</div>
        <div className="text-sm font-semibold" style={{ color: colour }}>{band}</div>
      </div>
    </div>
  );
}

// The explainability table from the brief: component, weight, contribution,
// and the concrete positives/negatives behind each one.
function ScoreBreakdown({ scoring }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <ScoreRing score={scoring.score} band={scoring.band} label="Account Score" tone={scoreTone(scoring.score)} />
        <ScoreRing score={scoring.health.score} band={scoring.health.band} label="Customer Health" tone={scoreTone(scoring.health.score)} />
        <button onClick={() => setOpen((o) => !o)} className="btn btn-secondary self-center">
          <Info className="w-4 h-4" /> {open ? 'Hide' : 'Why this score?'}
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-2 t-meta font-semibold">Component</th>
                <th className="py-2 t-meta font-semibold text-right">Score</th>
                <th className="py-2 t-meta font-semibold text-right">Weight</th>
                <th className="py-2 t-meta font-semibold text-right">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {scoring.components.map((c) => (
                <tr key={c.component} className="border-b border-line/60 align-top">
                  <td className="py-2.5">
                    <div className="text-ink font-medium">{c.component}</div>
                    <div className="mt-1 space-y-0.5">
                      {c.positives.map((p, i) => (
                        <div key={`p${i}`} className="text-xs" style={{ color: 'var(--color-success)' }}>+ {p}</div>
                      ))}
                      {c.negatives.map((n, i) => (
                        <div key={`n${i}`} className="text-xs" style={{ color: 'var(--color-danger)' }}>− {n}</div>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{c.score}</td>
                  <td className="py-2.5 text-right tabular-nums text-[var(--color-muted)]">{c.weight}%</td>
                  <td className="py-2.5 text-right tabular-nums font-medium">{c.contribution}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 font-semibold text-ink" colSpan={3}>Final score</td>
                <td className="py-2.5 text-right font-bold text-ink tabular-nums">{scoring.score}</td>
              </tr>
            </tbody>
          </table>
          <p className="t-meta mt-3">
            Calculated from this account's real records. Components with no data score low rather than being estimated.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, count, children, action }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="t-section flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[var(--color-muted)]" />}
          {title}
          {count !== undefined && <span className="t-meta">({count})</span>}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

const TIMELINE_ICON = { call: Phone, meeting: Calendar, note: StickyNote, email: Mail };

export default function Customer360() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    return api.customer360(id)
      .then(setData)
      .catch((e) => setError(friendlyError(e, 'Unable to load this account.')))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); load(); }, [id]);

  if (loading) return <div className="max-w-[1600px] mx-auto"><SkeletonCards count={4} /></div>;
  if (error) return (
    <div className="max-w-[1600px] mx-auto">
      <ErrorState message={error.message} detail={error.detail} onRetry={() => { setLoading(true); load(); }} />
    </div>
  );

  const { account, scoring, commercial, contacts, opportunities, quotations,
          subscriptions, tickets, documents, tasks, timeline, attention } = data;

  return (
    <div className="max-w-[1600px] mx-auto">
      <button onClick={() => navigate('/records/accounts')} className="btn btn-ghost mb-3 -ml-2">
        <ArrowLeft className="w-4 h-4" /> Accounts
      </button>

      <PageHeader title={account.account_name}
        subtitle={[account.account_type, account.industry, account.city].filter(Boolean).join(' · ') || 'Customer 360'}>
        <Link to={`/records/accounts/${id}`} className="btn btn-secondary">Open record</Link>
      </PageHeader>

      {attention.length > 0 && (
        <div className="card p-4 mb-4" style={{ borderColor: 'var(--color-warning)' }}>
          <h2 className="t-section flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-warning)' }} /> Attention required
          </h2>
          <ul className="space-y-1">
            {attention.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Badge tone={a.severity === 'high' ? 'danger' : a.severity === 'medium' ? 'warning' : 'neutral'} size="xs">
                  {a.severity}
                </Badge>
                <span className="text-ink">{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4"><ScoreBreakdown scoring={scoring} /></div>

      <h2 className="t-section mb-3">Commercial snapshot</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard label="Won business" value={inr(commercial.won_value)} icon={TrendingUp} tone="success" />
        <KpiCard label="Open pipeline" value={inr(commercial.open_pipeline)} icon={TrendingUp} tone="info" />
        <KpiCard label="Weighted" value={inr(commercial.weighted_pipeline)} icon={TrendingUp} tone="special" />
        <KpiCard label="MRR" value={inr(commercial.mrr)} icon={Repeat} tone="success" />
        <KpiCard label="Collected" value={inr(commercial.paid_total)} icon={Wallet} tone="neutral" />
        <KpiCard label="Open quotes" value={commercial.open_quotes} icon={FileText} tone="warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Contacts" icon={UsersIcon} count={contacts.length}>
          {contacts.length === 0 ? <p className="t-meta">No contacts yet.</p> : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <Link key={c.id} to={`/records/contacts/${c.id}`}
                  className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-[var(--color-canvas)]">
                  <Avatar name={`${c.first_name} ${c.last_name || ''}`} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink font-medium truncate">{c.first_name} {c.last_name}</div>
                    <div className="t-meta truncate">{c.job_title || c.email || c.mobile || '—'}</div>
                  </div>
                  {c.contact_status && <Badge status={c.contact_status} size="xs">{c.contact_status}</Badge>}
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Opportunities" icon={TrendingUp} count={opportunities.length}>
          {opportunities.length === 0 ? <p className="t-meta">No opportunities yet.</p> : (
            <div className="space-y-2">
              {opportunities.map((o) => (
                <Link key={o.id} to={`/records/opportunities/${o.id}`}
                  className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-lg hover:bg-[var(--color-canvas)]">
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-medium truncate">{o.opportunity_name}</div>
                    <div className="t-meta">{o.stage || '—'} · close {dt(o.expected_close_date)}</div>
                  </div>
                  <span className="text-sm font-medium tabular-nums shrink-0">{inr(o.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Quotations" icon={FileText} count={quotations.length}>
          {quotations.length === 0 ? <p className="t-meta">No quotations yet.</p> : (
            <div className="space-y-2">
              {quotations.map((q) => (
                <Link key={q.id} to={`/records/quotations/${q.id}`}
                  className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-lg hover:bg-[var(--color-canvas)]">
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-medium">{q.quote_number}</div>
                    <div className="t-meta">{dt(q.quote_date)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm tabular-nums">{inr(q.grand_total)}</span>
                    <Badge status={q.status} size="xs">{q.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Subscriptions" icon={Repeat} count={subscriptions.length}>
          {subscriptions.length === 0 ? <p className="t-meta">No subscriptions.</p> : (
            <div className="space-y-2">
              {subscriptions.map((s) => (
                <Link key={s.id} to={`/records/subscriptions/${s.id}`}
                  className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-lg hover:bg-[var(--color-canvas)]">
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-medium truncate">{s.plan || s.subscription_number}</div>
                    <div className="t-meta">Renews {dt(s.renewal_date)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm tabular-nums">{inr(s.recurring_amount)}</span>
                    <Badge status={s.status} size="xs">{s.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Tickets" icon={LifeBuoy} count={tickets.length}>
          {tickets.length === 0 ? <p className="t-meta">No tickets.</p> : (
            <div className="space-y-2">
              {tickets.slice(0, 8).map((t) => (
                <Link key={t.id} to={`/records/tickets/${t.id}`}
                  className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-lg hover:bg-[var(--color-canvas)]">
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-medium truncate">{t.subject}</div>
                    <div className="t-meta">{t.ticket_number} · {dt(t.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge status={t.priority} size="xs">{t.priority}</Badge>
                    <Badge status={t.status} size="xs">{t.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Open tasks" icon={CheckSquare} count={tasks.length}>
          {tasks.length === 0 ? <p className="t-meta">Nothing outstanding.</p> : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 p-2 -mx-2">
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">{t.task_title}</div>
                    <div className="t-meta">Due {dt(t.due_date)}</div>
                  </div>
                  <Badge status={t.priority} size="xs">{t.priority}</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Documents" icon={Paperclip} count={documents.length}>
          {documents.length === 0 ? <p className="t-meta">Nothing attached.</p> : (
            <div className="space-y-2">
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 p-2 -mx-2">
                  <span className="text-sm text-ink truncate">{d.title}</span>
                  {d.external_url
                    ? <a href={d.external_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-brand)] shrink-0">Open</a>
                    : <a href={api.documentDownloadUrl(d.id)} className="text-xs text-[var(--color-brand)] shrink-0">Download</a>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Activity timeline" icon={Activity} count={timeline.length}>
          {timeline.length === 0 ? (
            <EmptyState icon={Activity} title="Nothing logged yet"
              description="Calls, meetings, notes and emails against this account appear here." />
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto thin-scroll">
              {timeline.map((t) => {
                const Icon = TIMELINE_ICON[t.type] || Activity;
                return (
                  <div key={`${t.type}-${t.id}`} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'var(--color-neutral-soft)', color: 'var(--color-neutral)' }}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink">{t.title}</div>
                      <div className="t-meta">
                        {t.type}{t.detail ? ` · ${t.detail}` : ''}
                        {t.duration_seconds ? ` · ${Math.round(t.duration_seconds / 60)}m` : ''} · {dt(t.at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
