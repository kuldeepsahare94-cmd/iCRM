import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Pencil, Send, MessageCircle, Sparkles, CheckSquare, FileText, Download, Paperclip, Upload, PhoneCall, CalendarPlus, StickyNote } from 'lucide-react';
import { api } from '../../api';
import { usePermissions } from '../../context/usePermissions';
import StatusBadge from '../../components/StatusBadge';
import { friendlyError } from '../../components/ui';
import { getFieldValue, formatFieldValue, FieldInput, recordTitle } from './fieldUtils';
import { computeFollowupStatus, findFollowupField } from './followupUtils';
import AddRelatedModal, { canCreateRelation, relationTargetModule } from './AddRelatedModal';
import WhatsAppTemplateModal from '../../components/WhatsAppTemplateModal';
import { accentFor } from '../../theme/moduleAccents';
import { avatarGradientFor, initialsOf } from '../../theme/avatarColors';
import DisposeLeadModal from '../../components/DisposeLeadModal';
import QuotationItemsPanel from './QuotationItemsPanel';

// Any array-of-objects the dedicated module route embeds in its detail
// response (e.g. Accounts embeds contacts/opportunities/quotations/...) is
// rendered as its own tab automatically — no per-module wiring needed.
const NON_RELATION_ARRAY_KEYS = new Set(); // reserved, currently nothing to exclude

// Follow-up Timer (master prompt section 11) shares its field-detection and
// status logic with UniversalList's small dot indicator — see followupUtils.js.

// Modules whose records can plausibly have a WhatsApp conversation attached
// (matches the modules Phase 8's fireEvent wiring and inboundHandler's
// matchEntity() cover) — everything else skips the WhatsApp tab entirely
// rather than showing an always-empty one.
const WHATSAPP_CAPABLE_MODULES = new Set(['accounts', 'contacts', 'opportunities', 'tickets']);


// Subpanel columns were "the first six keys of the row object", which is
// why panels showed raw foreign keys — Account Id, Contact Id,
// Opportunity Id — as if they were business data. A user looking at an
// account's quotations does not need to be told the account_id is 1; they
// are already on that account.
//
// This skips plumbing (ids, timestamps, ownership, internal flags) and
// prefers columns a human would actually scan.
const SUBPANEL_SKIP = /^(id|.*_id|created_at|updated_at|created_by|owner_id|related_module|related_record_id|.*_json|.*_encrypted|uid|tracking_token|stored_name|thread_key|message_id|in_reply_to)$/i;

function subpanelColumns(row) {
  const keys = Object.keys(row).filter((k) => !SUBPANEL_SKIP.test(k));
  // Fields most worth seeing first, when present.
  const preferred = ['first_name', 'last_name', 'account_name', 'full_name', 'name', 'title',
    'subject', 'quote_number', 'opportunity_name', 'meeting_title', 'task_title', 'call_subject',
    'plan', 'status', 'stage_name', 'priority', 'amount', 'grand_total', 'recurring_amount',
    'quote_date', 'due_date', 'start_datetime', 'job_title', 'email', 'mobile', 'phone', 'body'];
  const ranked = [...keys].sort((a, b) => {
    const ia = preferred.indexOf(a), ib = preferred.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return ranked.slice(0, 6);
}

function FollowUpPanel({ module, fields, record, showWhatsApp, onGoToWhatsApp, onUpdated }) {
  const followupField = useMemo(() => findFollowupField(fields), [fields]);
  const phoneField = useMemo(() => fields.find((f) => f.field_type === 'phone'), [fields]);
  const emailField = useMemo(() => fields.find((f) => f.field_type === 'email'), [fields]);
  const [showSetDate, setShowSetDate] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [showQuickMeeting, setShowQuickMeeting] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDate, setQuickDate] = useState('');
  const [busy, setBusy] = useState(false);

  if (!followupField && !phoneField && !emailField) return null; // nothing this module can meaningfully offer

  const status = followupField ? computeFollowupStatus(getFieldValue(record, followupField)) : null;
  const phone = phoneField ? getFieldValue(record, phoneField) : null;
  const email = emailField ? getFieldValue(record, emailField) : null;

  const saveFollowupDate = async () => {
    if (!dateValue) return;
    setBusy(true);
    try {
      if (followupField.is_system) await api.universalUpdate(module, record.id, { [followupField.api_name]: dateValue });
      else await api.saveCustomFieldValues(module.api_name, record.id, { [followupField.api_name]: dateValue });
      setShowSetDate(false);
      onUpdated();
    } catch (err) { alert('Could not save: ' + err.message); } finally { setBusy(false); }
  };

  const createQuickTask = async () => {
    if (!quickTitle.trim()) return;
    setBusy(true);
    try {
      await api.universalCreate({ api_name: 'tasks', table_name: 'tasks' }, {
        task_title: quickTitle, due_date: quickDate || null, related_module: module.api_name, related_record_id: record.id,
      });
      setQuickTitle(''); setQuickDate(''); setShowQuickTask(false);
    } catch (err) { alert('Could not create task: ' + err.message); } finally { setBusy(false); }
  };

  const createQuickMeeting = async () => {
    if (!quickTitle.trim()) return;
    setBusy(true);
    try {
      await api.universalCreate({ api_name: 'meetings', table_name: 'meetings' }, {
        meeting_title: quickTitle, start_datetime: quickDate || null, related_module: module.api_name, related_record_id: record.id,
      });
      setQuickTitle(''); setQuickDate(''); setShowQuickMeeting(false);
    } catch (err) { alert('Could not schedule meeting: ' + err.message); } finally { setBusy(false); }
  };

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {status && (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: status.color }} />
            <span className="text-sm font-medium text-ink">{status.label}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {followupField && (
            <button onClick={() => { setShowSetDate((s) => !s); setShowQuickTask(false); setShowQuickMeeting(false); }} className="text-xs bg-amber text-white rounded-lg px-3 py-1.5 hover:opacity-90">Set follow-up</button>
          )}
        </div>
      </div>

      {showSetDate && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
          <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={saveFollowupDate} disabled={busy} className="bg-amber text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Save</button>
        </div>
      )}
      {showQuickTask && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line flex-wrap">
          <input placeholder="Task title" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]" />
          <input type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={createQuickTask} disabled={busy} className="bg-amber text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Create</button>
        </div>
      )}
      {showQuickMeeting && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line flex-wrap">
          <input placeholder="Meeting title" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]" />
          <input type="datetime-local" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={createQuickMeeting} disabled={busy} className="bg-amber text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Schedule</button>
        </div>
      )}
    </div>
  );
}

// Generative AI Actions (Phase 18's backend, this is the UI). Analyze fits
// Opportunities/Tickets (risk, classification); Summarize fits Calls/
// Meetings (extract action items). Both degrade to a plain error message
// if the backend isn't configured with an API key — same message the
// backend itself returns, not a generic failure.
const AI_ANALYZE_MODULES = new Set(['opportunities', 'tickets']);
const AI_SUMMARIZE_MODULES = new Set(['calls', 'meetings']);

// Quotation-only actions: download the PDF, or email it to the linked
// contact (which also flips the quote to Sent, firing the same workflow
// events the manual status change does).
// Documents attached to this record — real file uploads plus link-only
// entries (for things already living in Drive/Dropbox). Uses the same
// polymorphic related_module/related_record_id pattern as the activity
// modules.
function DocumentsPanel({ moduleApiName, recordId }) {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const load = () => api.listDocuments({ related_module: moduleApiName, related_record_id: recordId })
    .then(setDocs).catch(() => setDocs([]));
  useEffect(() => { load(); }, [moduleApiName, recordId]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      fd.append('related_module', moduleApiName);
      fd.append('related_record_id', recordId);
      await api.uploadDocument(fd);
      load();
    } catch (err) { setError(friendlyError(err).message); } finally { setBusy(false); e.target.value = ''; }
  };

  const addLink = async (e) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim()) return;
    setBusy(true); setError('');
    try {
      await api.createDocumentLink({ title: linkTitle, external_url: linkUrl, related_module: moduleApiName, related_record_id: recordId });
      setLinkTitle(''); setLinkUrl(''); setShowLink(false);
      load();
    } catch (err) { setError(friendlyError(err).message); } finally { setBusy(false); }
  };

  const remove = async (d) => {
    if (!confirm(`Delete "${d.title}"?`)) return;
    try { await api.deleteDocument(d.id); load(); } catch (err) { setError(friendlyError(err).message); }
  };

  const prettySize = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Paperclip className="w-4 h-4 text-amber" /> Documents
          {docs.length > 0 && <span className="text-xs text-slate-400">({docs.length})</span>}
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs border border-line rounded-lg px-3 py-1.5 hover:bg-canvas cursor-pointer inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> {busy ? 'Uploading…' : 'Upload file'}
            <input type="file" onChange={onFile} disabled={busy} className="hidden" />
          </label>
          <button onClick={() => setShowLink((s) => !s)} className="text-xs border border-line rounded-lg px-3 py-1.5 hover:bg-canvas">
            Add link
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-warn bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</div>}

      {showLink && (
        <form onSubmit={addLink} className="mt-3 pt-3 border-t border-line flex gap-2 flex-wrap">
          <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Title"
            className="border border-line rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[120px]" />
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…"
            className="border border-line rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]" />
          <button type="submit" disabled={busy} className="bg-amber text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Add</button>
        </form>
      )}

      {docs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-ink truncate">{d.title}</span>
                {d.size_bytes != null && <span className="text-xs text-slate-400 shrink-0">{prettySize(d.size_bytes)}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.external_url ? (
                  <a href={d.external_url} target="_blank" rel="noreferrer" className="text-xs text-amber hover:underline">Open</a>
                ) : (
                  <button onClick={() => api.downloadDocument(d.id, d.file_name).catch((e) => setError(e.message))}
                    className="text-xs text-amber hover:underline inline-flex items-center gap-1">
                    <Download className="w-3 h-3" /> Download
                  </button>
                )}
                <button onClick={() => remove(d)} className="text-slate-400 hover:text-warn"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {docs.length === 0 && <p className="text-xs text-slate-400 mt-3">Nothing attached yet.</p>}
    </div>
  );
}

function QuotationActionsPanel({ recordId, record, onUpdated }) {
  const [sending, setSending] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const r = await api.sendQuotation(recordId, { to: to || undefined, message: message || undefined });
      setSentTo(r.sent_to);
      setShowSend(false);
      onUpdated();
    } catch (err) {
      setError(friendlyError(err).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <FileText className="w-4 h-4 text-amber" /> Quotation document
        </div>
        <div className="flex gap-2">
          <button onClick={() => api.downloadQuotationPdf(recordId, 'A').catch((e) => setError(e.message))}
            className="text-xs border border-line rounded-lg px-3 py-1.5 hover:bg-canvas inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download PDF
          </button>
          <button onClick={() => setShowSend((s) => !s)}
            className="text-xs bg-amber text-white rounded-lg px-3 py-1.5 hover:opacity-90 inline-flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" /> Email quote
          </button>
        </div>
      </div>

      {sentTo && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-3">Sent to {sentTo}.</div>}
      {error && <div className="text-xs text-warn bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</div>}

      {showSend && (
        <form onSubmit={send} className="mt-3 pt-3 border-t border-line space-y-2">
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)}
            placeholder={record?.contact_email ? `Default: ${record.contact_email}` : 'Recipient email'}
            className="border border-line rounded-lg px-3 py-1.5 text-sm w-full" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
            placeholder="Optional message to include in the email"
            className="border border-line rounded-lg px-3 py-1.5 text-sm w-full" />
          <button type="submit" disabled={sending}
            className="bg-amber text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
            {sending ? 'Sending…' : 'Send with PDF attached'}
          </button>
        </form>
      )}
    </div>
  );
}

function AiAnalysisPanel({ moduleApiName, recordId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveExtra, setSaveExtra] = useState(true);

  const isAnalyze = AI_ANALYZE_MODULES.has(moduleApiName);
  const isSummarize = AI_SUMMARIZE_MODULES.has(moduleApiName);
  if (!isAnalyze && !isSummarize) return null;

  const run = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = isAnalyze ? await api.aiAnalyze(moduleApiName, recordId, saveExtra) : await api.aiSummarize(moduleApiName, recordId, saveExtra);
      setResult(r);
    } catch (err) {
      setError(friendlyError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const riskColor = { low: '#10B981', medium: '#F59E0B', high: '#EF4444' }[result?.risk_level] || '#94A3B8';

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Sparkles className="w-4 h-4 text-amber" /> AI {isAnalyze ? 'Analysis' : 'Summary'}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            <input type="checkbox" checked={saveExtra} onChange={(e) => setSaveExtra(e.target.checked)} />
            {isAnalyze ? 'Save as note' : 'Create tasks from action items'}
          </label>
          <button onClick={run} disabled={loading} className="bg-amber text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
            {loading ? 'Thinking…' : 'Run'}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-warn bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</div>}

      {result && isAnalyze && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          <p className="text-sm text-ink">{result.summary}</p>
          {result.risk_level && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: riskColor }} />
              <span className="text-xs font-medium text-ink capitalize">{result.risk_level} risk</span>
            </div>
          )}
          {result.risk_factors?.length > 0 && (
            <ul className="text-xs text-slate-500 list-disc list-inside">
              {result.risk_factors.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          {result.next_best_action && <p className="text-xs text-ink"><span className="text-slate-400">Next step: </span>{result.next_best_action}</p>}
          {result.suggested_priority && <p className="text-xs text-ink"><span className="text-slate-400">Suggested priority: </span>{result.suggested_priority} <span className="text-slate-400">· category: </span>{result.suggested_category}</p>}
          {result.suggested_response && (
            <div className="bg-canvas rounded-lg p-3 text-xs text-ink">
              <div className="text-slate-400 mb-1">Draft response:</div>
              {result.suggested_response}
            </div>
          )}
        </div>
      )}

      {result && isSummarize && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          <p className="text-sm text-ink">{result.summary}</p>
          {result.action_items?.length > 0 && (
            <ul className="text-xs text-ink space-y-1">
              {result.action_items.map((item, i) => (
                <li key={i} className="flex items-center gap-1.5"><CheckSquare className="w-3 h-3 text-emerald-600 shrink-0" /> {item}</li>
              ))}
            </ul>
          )}
          {result.action_items?.length === 0 && <p className="text-xs text-slate-400">No action items found.</p>}
        </div>
      )}
    </div>
  );
}

function WhatsAppPanel({ moduleApiName, recordId }) {
  const [convo, setConvo] = useState(undefined); // undefined = loading, null = none found
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => {
    api.getRecordConversation(moduleApiName, recordId)
      .then((rows) => {
        if (!rows.length) { setConvo(null); return; }
        return api.getConversationDetail(rows[0].id).then(setConvo);
      })
      .catch(() => setConvo(null));
  };
  useEffect(() => { load(); }, [moduleApiName, recordId]);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim() || !convo) return;
    setSending(true);
    try {
      await api.replyToConversation(convo.id, reply);
      setReply('');
      load();
    } catch (err) {
      alert('Could not send: ' + err.message + (err.message.includes('window') ? '' : '\n\nIf this number hasn\'t messaged in recently, a freeform reply may be rejected — use a Workflow or Campaign template send instead.'));
    } finally {
      setSending(false);
    }
  };

  if (convo === undefined) return <div className="text-sm text-slate-400 p-5">Loading…</div>;

  if (convo === null) {
    return (
      <div className="card mt-5 p-8 text-center">
        <MessageCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No WhatsApp conversation yet for this record.</p>
        <p className="text-xs text-slate-400 mt-1">One appears here automatically once this contact messages in, or you can send a template via WhatsApp → Workflows or Campaigns.</p>
      </div>
    );
  }

  return (
    <div className="card mt-5 flex flex-col" style={{ maxHeight: 480 }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {convo.messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === 'outbound' ? 'bg-amber-soft text-ink' : 'bg-canvas text-ink'}`}>
              {m.body}
              <div className="text-[10px] text-slate-400 mt-1">{m.status}</div>
            </div>
          </div>
        ))}
        {convo.messages.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No messages yet.</div>}
      </div>
      <form onSubmit={send} className="border-t border-line p-3 flex gap-2">
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply…"
          className="border border-line rounded-lg px-3 py-2 text-sm flex-1" />
        <button type="submit" disabled={sending} className="bg-amber text-white rounded-lg px-3 py-2 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

export default function UniversalDetail() {
  const { moduleApiName, id } = useParams();
  const navigate = useNavigate();
  const can = usePermissions();

  const [module, setModule] = useState(null);
  const [fields, setFields] = useState([]);
  const [record, setRecord] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('overview');
  const [addingRelation, setAddingRelation] = useState(null);
  const [waOpen, setWaOpen] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [layout, setLayout] = useState(null); // null until loaded; { sections: [] } means "no custom layout saved"

  const load = () => {
    setLoading(true);
    setError('');
    api.getModuleMeta(moduleApiName)
      .then(async (mod) => {
        setModule(mod);
        const [f, rec] = await Promise.all([api.listModuleFields(mod.id), api.universalGet(mod, id)]);
        setFields(f);
        api.getModuleLayout(mod.id, 'detail').then((r) => setLayout(r.layout_json || { sections: [] })).catch(() => setLayout({ sections: [] }));

        // Custom fields added to a STANDARD module (table_name set) live in
        // a separate EAV store, not on the record itself — fetch and merge
        // them in as plain top-level keys so every existing helper below
        // (getFieldValue, the edit form, etc.) treats them exactly like any
        // other field with no special-casing needed.
        const hasCustomFields = mod.table_name && f.some((field) => !field.is_system);
        const customValues = hasCustomFields ? await api.getCustomFieldValues(mod.api_name, id).catch(() => ({})) : {};
        setRecord({ ...rec, ...customValues });

        api.listRelated(mod.api_name, id).then(setRelated).catch(() => setRelated([]));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [moduleApiName, id]);

  const detailFields = useMemo(() => fields.filter((f) => f.show_in_detail), [fields]);
  const editFields = useMemo(() => fields.filter((f) => f.show_in_edit), [fields]);
  const statusField = useMemo(() => fields.find((f) => ['status', 'contact_status', 'priority'].includes(f.api_name)), [fields]);

  // Auto-detected related-record tabs: any top-level array-of-objects on the
  // record that isn't the field list itself.
  const embeddedRelations = useMemo(() => {
    if (!record) return [];
    return Object.entries(record)
      .filter(([k, v]) => Array.isArray(v) && v.length >= 0 && !NON_RELATION_ARRAY_KEYS.has(k) && k !== 'related')
      .filter(([, v]) => v.length === 0 || typeof v[0] === 'object');
  }, [record]);

  if (loading) return <div className="py-8 t-meta">Loading…</div>;
  if (error) return <div className="py-8 text-sm" style={{ color: "var(--color-danger)" }}>{error}</div>;
  if (!module || !record) return null;

  const startEdit = () => {
    const initial = {};
    editFields.forEach((f) => { initial[f.api_name] = getFieldValue(record, f); });
    setForm(initial);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // System fields (real columns) go through the module's own record
      // update; non-system fields on a standard (table-backed) module go
      // through the separate custom-field-values endpoint instead — a
      // custom module has no system fields at all, so this collapses to a
      // single universalUpdate call for it, same as before.
      const systemPayload = {};
      const customPayload = {};
      editFields.forEach((f) => {
        if (module.table_name && !f.is_system) customPayload[f.api_name] = form[f.api_name];
        else systemPayload[f.api_name] = form[f.api_name];
      });
      const calls = [];
      if (Object.keys(systemPayload).length) calls.push(api.universalUpdate(module, id, systemPayload));
      if (Object.keys(customPayload).length) calls.push(api.saveCustomFieldValues(module.api_name, id, customPayload));
      await Promise.all(calls);
      setEditing(false);
      load();
    } catch (err) {
      alert('Could not save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete this ${module.singular_label.toLowerCase()}? This cannot be undone.`)) return;
    try {
      await api.universalDelete(module, id);
      navigate(`/records/${module.api_name}`);
    } catch (err) {
      alert('Could not delete: ' + err.message);
    }
  };

  const title = recordTitle(record, fields);
  const showWhatsApp = WHATSAPP_CAPABLE_MODULES.has(module.api_name);
  const tabs = ['overview', ...embeddedRelations.map(([k]) => k), ...(showWhatsApp ? ['whatsapp'] : []), 'related'];

  return (
    <div className="relative max-w-[1400px] mx-auto rounded-3xl -m-4 sm:-m-6 p-4 sm:p-6">
      {/* Same background treatment as the list pages, tinted by this
          module's accent — so moving list -> detail feels like staying
          inside the module rather than landing on a different product.
          z-0 with content at z-10; a negative z-index would paint it
          behind the body background and make it invisible. */}
      <div aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden rounded-3xl pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${accentFor(module.api_name).solid}33 1px, transparent 0)`,
          backgroundSize: '22px 22px',
        }} />
        <div className="absolute -top-32 -right-28 w-[520px] h-[520px] rounded-full" style={{
          background: `radial-gradient(circle, ${accentFor(module.api_name).solid}38, transparent 70%)`,
        }} />
        <div className="absolute -bottom-36 -left-28 w-[460px] h-[460px] rounded-full" style={{
          background: `radial-gradient(circle, ${accentFor(module.api_name).solid}2E, transparent 70%)`,
        }} />
      </div>

      <div className="relative z-10">
      <button onClick={() => navigate(`/records/${module.api_name}`)} className="text-slate-500 hover:text-ink text-sm inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> {module.plural_label}
      </button>

      {/* Record header as a card with an avatar, matching Lead detail —
          it was a bare <h1> on the page background with nothing to anchor
          it, which is why it read as unfinished next to Leads. */}
      <div className="card p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, ${accentFor(module.api_name).from}, ${accentFor(module.api_name).to})` }} />
        <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white text-lg shrink-0 shadow-md"
            style={{ background: avatarGradientFor(title) }}>
            {initialsOf(title)}
          </div>
          <div className="min-w-0">
            <h1 className="t-page-title">{title}</h1>
            {statusField && <div className="mt-1.5"><StatusBadge status={getFieldValue(record, statusField)} /></div>}
          </div>
        </div>
        <div className="flex gap-2">
          {can(module.api_name, 'edit') && !editing && (
            <button onClick={startEdit} className="border border-line text-sm font-medium px-4 py-2 rounded-lg hover:bg-white inline-flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
          {can(module.api_name, 'delete') && (
            <button onClick={remove} className="border border-line text-warn text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-50 inline-flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
        </div>
      </div>

      {module.api_name === 'quotations' && (
        <div className="mb-5">
          <QuotationItemsPanel quotationId={id} currency={record.currency}
            canEdit={can('quotations', 'edit')} onSaved={load} />
        </div>
      )}

      {module.api_name === 'quotations' && <QuotationActionsPanel recordId={id} record={record} onUpdated={load} />}

      {module.api_name !== 'documents' && <DocumentsPanel moduleApiName={module.api_name} recordId={id} />}

      <AiAnalysisPanel moduleApiName={module.api_name} recordId={id} />

      <FollowUpPanel module={module} fields={fields} record={record} showWhatsApp={showWhatsApp}
        onGoToWhatsApp={() => setTab('whatsapp')} onUpdated={load} />

      {/* Quick actions — the same bar the Lead detail page has, now on
          every module. Which actions appear depends on what the record can
          actually support: WhatsApp and Log Call only show when there's a
          phone number to use, so the bar never offers a button that can't
          do anything. Creating a meeting/task/note routes into the existing
          relation-tab machinery rather than duplicating it. */}
      {(() => {
        const phone = record.phone || record.mobile || null;
        const actions = [
          { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, from: '#4ADE80', to: '#15803D',
            run: () => setWaOpen(true) },
          can('calls', 'create') && { key: 'call', label: 'Log Call', icon: PhoneCall, from: '#818CF8', to: '#4338CA',
            run: () => setDisposing(true) },
          canCreateRelation('meetings', module.api_name) && can('meetings', 'create')
            && { key: 'meeting', label: 'Meeting', icon: CalendarPlus, from: '#6EE7B7', to: '#047857',
              run: () => setAddingRelation('meetings') },
          canCreateRelation('tasks', module.api_name) && can('tasks', 'create')
            && { key: 'task', label: 'Task', icon: CheckSquare, from: '#FCD34D', to: '#B45309',
              run: () => setAddingRelation('tasks') },
          canCreateRelation('notes', module.api_name) && can('notes', 'create')
            && { key: 'note', label: 'Note', icon: StickyNote, from: '#C4B5FD', to: '#6D28D9',
              run: () => setAddingRelation('notes') },
        ].filter(Boolean);
        if (actions.length === 0) return null;
        return (
          <div className="card p-3 mt-5">
            <div className="flex items-center gap-2 overflow-x-auto thin-scroll">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide shrink-0 pl-1 pr-2">Quick Actions</span>
              {actions.map((a) => (
                <button key={a.key} onClick={a.run}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-line hover:shadow-md hover:-translate-y-0.5 transition-all shrink-0">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}>
                    <a.icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-medium text-ink whitespace-nowrap">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="flex gap-1 mt-6 border-b border-line">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${tab === t ? 'border-amber text-amber' : 'border-transparent text-slate-500 hover:text-ink'}`}>
            {t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card p-5 mt-5">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                {editFields.map((f) => (
                  <div key={f.id} className={f.field_type === 'textarea' ? 'col-span-2' : ''}>
                    <label className="text-xs text-slate-500 font-medium block mb-1">{f.label}</label>
                    <FieldInput field={f} value={form[f.api_name]} onChange={(v) => setForm({ ...form, [f.api_name]: v })} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={() => setEditing(false)} className="btn btn-secondary">Cancel</button>
              </div>
            </>
          ) : layout?.sections?.length > 0 ? (
            <div className="space-y-5">
              {layout.sections.map((section, si) => (
                <div key={si}>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{section.title}</div>
                  <div className={`grid gap-4 ${section.columns === 1 ? 'grid-cols-1' : section.columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {section.fields.map((column, ci) => (
                      <div key={ci} className="space-y-3">
                        {column.map((apiName) => {
                          const f = fields.find((x) => x.api_name === apiName);
                          if (!f) return null;
                          return (
                            <div key={apiName}>
                              <div className="text-xs text-slate-500 font-medium mb-1">{f.label}</div>
                              <div className="text-sm text-ink">{formatFieldValue(getFieldValue(record, f), f)}</div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {detailFields.map((f) => (
                <div key={f.id}>
                  <div className="text-xs text-slate-500 font-medium mb-1">{f.label}</div>
                  <div className="text-sm text-ink">{formatFieldValue(getFieldValue(record, f), f)}</div>
                </div>
              ))}
              {detailFields.length === 0 && <div className="text-sm text-slate-400 col-span-2">No fields configured for this module yet.</div>}
            </div>
          )}
        </div>
      )}

      {embeddedRelations.map(([key, rows]) => tab === key && (
        <div key={key} className="mt-5">
          {canCreateRelation(key, module.api_name) && can(relationTargetModule(key), 'create') && (
            <div className="flex justify-end mb-2">
              <button onClick={() => setAddingRelation(key)} className="btn btn-primary">
                + Add {key.replace(/_/g, ' ').replace(/s$/, '')}
              </button>
            </div>
          )}
          <div className="card overflow-hidden overflow-x-auto shadow-sm">
          {rows.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm capitalize">No {key.replace(/_/g, ' ')} yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b-2"
                  style={{ background: `${accentFor(module.api_name).solid}0D`, borderColor: `${accentFor(module.api_name).solid}33` }}>
                  {subpanelColumns(rows[0]).map((k) => (
                    <th key={k} className="py-2.5 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 transition-colors"
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${accentFor(module.api_name).solid}0A`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                    {subpanelColumns(rows[0]).map((k, ci) => (
                      <td key={k} className={`py-3 px-4 ${ci === 0 ? 'text-ink font-medium' : 'text-slate-600'}`}>
                        {row[k] === null || row[k] === undefined || row[k] === '' ? '—' : String(row[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>
      ))}

      {waOpen && (
        <WhatsAppTemplateModal
          subject={{ id: Number(id), module: module.api_name, name: title,
            phone: record.phone || record.mobile, interest: record.industry || '', city: record.city || '' }}
          senderName={record.owner_name || ''} onClose={() => setWaOpen(false)} />
      )}

      {disposing && (
        <DisposeLeadModal
          subject={{ id: Number(id), module: module.api_name, name: title,
            phone: record.phone || record.mobile, status: record.status }}
          onClose={() => setDisposing(false)}
          onDisposed={() => { setDisposing(false); load(); }} />
      )}

      {addingRelation && (
        <AddRelatedModal relationKey={addingRelation} parentModule={module.api_name}
          parentId={id} parentLabel={title}
          onClose={() => setAddingRelation(null)}
          onCreated={() => { setAddingRelation(null); load(); }} />
      )}

      {tab === 'whatsapp' && showWhatsApp && <WhatsAppPanel moduleApiName={module.api_name} recordId={id} />}

      {tab === 'related' && (
        <div className="card mt-5 p-5">
          {related.length === 0 ? (
            <div className="text-sm text-slate-400">No linked records yet. Use the AI assistant or the relationships API to link records from other modules to this one.</div>
          ) : (
            <div className="space-y-4">
              {related.map((group) => (
                <div key={group.module.api_name}>
                  <div className="text-xs font-medium text-slate-500 mb-2">{group.module.plural_label}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.records.map((r) => (
                      <Link key={r.record_id} to={`/records/${group.module.api_name}/${r.record_id}`}
                        className="text-xs border border-line rounded-full px-3 py-1 hover:bg-canvas">
                        {r.label || `#${r.record_id}`}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
