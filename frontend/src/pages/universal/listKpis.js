/* ------------------------------------------------------------------
   Per-entity list KPIs (brief §9 summary strip, §10 entity-specific
   fields). Each module gets metrics that mean something for THAT
   business entity — deliberately not the same set copied everywhere.

   Every metric is computed from the records already loaded for the
   list, so this adds no extra request and can never show a number
   that disagrees with the table beneath it.
   ------------------------------------------------------------------ */

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const count = (rows, fn) => rows.filter(fn).length;
const sum = (rows, fn, get) => rows.filter(fn).reduce((s, r) => s + (Number(get(r)) || 0), 0);
const isOpenStage = (r) => !r.is_won && !r.is_lost && !['Won', 'Lost', 'Closed'].includes(r.stage || r.status);
const today = () => new Date().toISOString().slice(0, 10);

export const LIST_KPIS = {
  accounts: (rows) => [
    { label: 'Total accounts', value: rows.length, tone: 'info' },
    { label: 'Customers', value: count(rows, (r) => r.account_type === 'Customer'), tone: 'success' },
    { label: 'Prospects', value: count(rows, (r) => r.account_type === 'Prospect'), tone: 'warning' },
    { label: 'Active', value: count(rows, (r) => r.status === 'Active'), tone: 'success' },
  ],
  contacts: (rows) => [
    { label: 'Total contacts', value: rows.length, tone: 'info' },
    { label: 'Active', value: count(rows, (r) => r.contact_status === 'Active'), tone: 'success' },
    { label: 'With email', value: count(rows, (r) => r.email), tone: 'neutral' },
    { label: 'With phone', value: count(rows, (r) => r.mobile || r.phone), tone: 'neutral' },
  ],
  opportunities: (rows) => [
    { label: 'Open deals', value: count(rows, isOpenStage), tone: 'info' },
    { label: 'Open value', value: inr(sum(rows, isOpenStage, (r) => r.amount)), tone: 'special' },
    { label: 'Weighted', value: inr(rows.filter(isOpenStage).reduce((s, r) => s + (Number(r.amount) || 0) * ((r.probability ?? 0) / 100), 0)), tone: 'warning' },
    { label: 'Won', value: count(rows, (r) => r.is_won || r.stage === 'Won'), tone: 'success' },
  ],
  quotations: (rows) => [
    { label: 'Total quotes', value: rows.length, tone: 'info' },
    { label: 'Sent', value: count(rows, (r) => r.status === 'Sent'), tone: 'warning' },
    { label: 'Accepted', value: count(rows, (r) => r.status === 'Accepted'), tone: 'success' },
    { label: 'Total value', value: inr(sum(rows, () => true, (r) => r.grand_total)), tone: 'special' },
  ],
  subscriptions: (rows) => [
    { label: 'Subscriptions', value: rows.length, tone: 'info' },
    { label: 'Active', value: count(rows, (r) => r.status === 'Active'), tone: 'success' },
    // Normalised to a monthly figure so cycles are comparable.
    { label: 'MRR', value: inr(rows.filter((r) => r.status === 'Active').reduce((s, r) => {
      const amt = Number(r.recurring_amount) || 0;
      return s + (r.billing_cycle === 'Yearly' ? amt / 12 : r.billing_cycle === 'Quarterly' ? amt / 3 : amt);
    }, 0)), tone: 'success' },
    { label: 'Renewing ≤30d', value: count(rows, (r) => r.status === 'Active' && r.renewal_date
      && (new Date(r.renewal_date) - Date.now()) / 86400000 <= 30), tone: 'warning' },
  ],
  tickets: (rows) => [
    { label: 'Total tickets', value: rows.length, tone: 'info' },
    { label: 'Open', value: count(rows, (r) => !['Resolved', 'Closed'].includes(r.status)), tone: 'warning' },
    { label: 'High / urgent', value: count(rows, (r) => ['High', 'Urgent'].includes(r.priority) && !['Resolved', 'Closed'].includes(r.status)), tone: 'danger' },
    { label: 'Resolved', value: count(rows, (r) => ['Resolved', 'Closed'].includes(r.status)), tone: 'success' },
  ],
  tasks: (rows) => [
    { label: 'Total tasks', value: rows.length, tone: 'info' },
    { label: 'Open', value: count(rows, (r) => r.status !== 'Completed'), tone: 'warning' },
    { label: 'Overdue', value: count(rows, (r) => r.status !== 'Completed' && r.due_date && String(r.due_date).slice(0, 10) < today()), tone: 'danger' },
    { label: 'Completed', value: count(rows, (r) => r.status === 'Completed'), tone: 'success' },
  ],
  products: (rows) => [
    { label: 'Products', value: rows.length, tone: 'info' },
    { label: 'Active', value: count(rows, (r) => r.status === 'Active' || r.active), tone: 'success' },
  ],
  payments: (rows) => [
    { label: 'Payments', value: rows.length, tone: 'info' },
    { label: 'Collected', value: inr(sum(rows, (r) => r.status === 'Paid', (r) => r.amount)), tone: 'success' },
    { label: 'Pending', value: count(rows, (r) => r.status === 'Pending'), tone: 'warning' },
  ],
  calls: (rows) => [
    { label: 'Calls', value: rows.length, tone: 'info' },
    { label: 'Connected', value: count(rows, (r) => r.connected === 1), tone: 'success' },
  ],
  meetings: (rows) => [
    { label: 'Meetings', value: rows.length, tone: 'info' },
    { label: 'Upcoming', value: count(rows, (r) => r.start_datetime && new Date(r.start_datetime) > new Date()), tone: 'warning' },
  ],
  documents: (rows) => [
    { label: 'Documents', value: rows.length, tone: 'info' },
    { label: 'Files', value: count(rows, (r) => r.file_name), tone: 'neutral' },
    { label: 'Links', value: count(rows, (r) => r.external_url), tone: 'neutral' },
  ],
};

// Returns null for modules with no defined KPIs (including custom modules),
// so the strip is simply omitted rather than showing meaningless counters.
export function kpisFor(moduleApiName, rows) {
  const fn = LIST_KPIS[moduleApiName];
  if (!fn || rows.length === 0) return null;
  try { return fn(rows); } catch { return null; }
}
