/*
 * Internal team chat.
 *
 * A header icon opens a slide-over panel: everyone in the CRM down the left,
 * the conversation on the right.
 *
 * WHY POLLING, NOT WEBSOCKETS
 * The backend is a single Express process deployed behind managed proxies
 * (Render today, nginx on the VPS next). Long-lived connections are the first
 * thing those buffer or drop, and a socket server also needs sticky sessions
 * the moment there is more than one instance. A 5-second poll costs one cheap
 * query, works through anything, and for internal team chat in a small
 * company the latency is not noticeable. It backs off to 20s when the tab is
 * hidden so an idle tab is nearly free. Swapping in SSE or a socket later
 * only changes this file and the /poll route.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, X, Search, Paperclip, Send, Users, Megaphone, ArrowLeft,
  Check, CheckCheck, Trash2, Bell, BellOff, FileText, Plus,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { avatarGradientFor, initialsOf } from '../theme/avatarColors';

const POLL_ACTIVE_MS = 5000;
const POLL_HIDDEN_MS = 20000;
// How long a popup stays. Seven seconds was long enough to miss entirely if
// you happened to be looking at another part of the screen.
const TOAST_MS = 12000;

function timeOf(ts) {
  if (!ts) return '';
  // SQLite datetime('now') is UTC without a zone marker; without the Z the
  // browser reads it as local time and every message looks hours old.
  const d = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : `${ts.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function bytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Avatar({ name, online, size = 36 }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="rounded-full flex items-center justify-center text-white font-semibold"
        style={{ width: size, height: size, background: avatarGradientFor(name), fontSize: size * 0.36 }}>
        {initialsOf(name)}
      </div>
      {online !== undefined && (
        <span
          title={online ? 'Online' : 'Offline'}
          className="absolute bottom-0 right-0 rounded-full border-2 border-white"
          style={{ width: size * 0.3, height: size * 0.3, background: online ? 'var(--color-success)' : '#94A3B8' }}
        />
      )}
    </div>
  );
}

function Attachment({ att }) {
  const isImage = String(att.mime_type || '').startsWith('image/') && att.mime_type !== 'image/svg+xml';
  const url = api.chatAttachmentUrl(att.id);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5">
        <img src={url} alt={att.file_name} className="rounded-lg max-h-56 border border-line" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 mt-1.5 bg-white/70 border border-line rounded-lg px-2.5 py-2 hover:bg-white">
      <FileText className="w-4 h-4 shrink-0 text-[var(--color-muted)]" />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink truncate">{att.file_name}</span>
        <span className="block text-[11px] text-[var(--color-muted)]">{bytes(att.size_bytes)}</span>
      </span>
    </a>
  );
}

function MessageBubble({ m, isGroup, onDelete }) {
  const mine = m.mine;
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
        mine ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-canvas)] text-ink border border-line'
      }`}>
        {isGroup && !mine && (
          <div className="text-[11px] font-semibold mb-0.5" style={{ color: 'var(--color-brand)' }}>{m.sender_name}</div>
        )}

        {m.deleted ? (
          <p className="text-sm italic opacity-70">Message deleted</p>
        ) : (
          <>
            {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
            {m.attachments.map((a) => <Attachment key={a.id} att={a} />)}
            {m.ref && (
              <a href={`/records/${m.ref.module}/${m.ref.record_id}`}
                className={`block mt-1.5 text-xs underline ${mine ? 'text-white/90' : 'text-[var(--color-brand)]'}`}>
                {m.ref.label || `${m.ref.module} #${m.ref.record_id}`}
              </a>
            )}
          </>
        )}

        <div className={`flex items-center gap-1 justify-end mt-0.5 text-[10px] ${mine ? 'text-white/70' : 'text-[var(--color-muted)]'}`}>
          {m.edited_at && <span>edited</span>}
          <span>{timeOf(m.created_at)}</span>
          {/* One tick sent, two ticks seen — the plain "seen / not seen".
              In a group the tooltip names who has actually read it. */}
          {mine && !m.deleted && (
            m.seen_by_all
              ? <CheckCheck className="w-3.5 h-3.5" aria-label="Seen" />
              : <Check className="w-3.5 h-3.5" aria-label="Sent, not seen yet" />
          )}
          {mine && !m.deleted && isGroup && m.seen_by.length > 0 && (
            <span title={`Seen by ${m.seen_by.map((s) => s.name).join(', ')}`}>{m.seen_by.length}</span>
          )}
          {mine && !m.deleted && (
            <button onClick={() => onDelete(m)} title="Delete message"
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- new group
function NewGroupModal({ users, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the group a name.');
    setBusy(true); setError('');
    try { onCreated(await api.chatCreateGroup(name.trim(), picked)); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="absolute inset-0 z-10 bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <button onClick={onClose}><ArrowLeft className="w-4 h-4 text-[var(--color-muted)]" /></button>
        <h3 className="text-sm font-semibold text-ink">New group</h3>
      </div>
      <form onSubmit={submit} className="flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b border-line">
          <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="Group name — e.g. Sales Team"
            className="border border-line rounded-lg px-3 py-2 text-sm w-full" />
          <p className="text-xs text-[var(--color-muted)] mt-1.5">{picked.length} member(s) selected</p>
          {error && <p className="text-xs text-warn mt-1.5">{error}</p>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas cursor-pointer">
              <input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} className="w-4 h-4" />
              <Avatar name={u.full_name || u.username} online={!!u.online} size={30} />
              <span className="text-sm text-ink">{u.full_name || u.username}</span>
            </label>
          ))}
        </div>
        <div className="p-3 border-t border-line">
          <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary w-full disabled:opacity-50">
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --------------------------------------------------------------- broadcast
function BroadcastModal({ users, onClose, onSent }) {
  const [picked, setPicked] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e) => {
    e.preventDefault();
    if (!picked.length) return setError('Select at least one person.');
    if (!body.trim()) return setError('Type a message.');
    setBusy(true); setError('');
    try { onSent(await api.chatBroadcast(picked, { body: body.trim() })); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="absolute inset-0 z-10 bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <button onClick={onClose}><ArrowLeft className="w-4 h-4 text-[var(--color-muted)]" /></button>
        <h3 className="text-sm font-semibold text-ink">Send to several people</h3>
      </div>
      <form onSubmit={submit} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-line">
          <p className="text-xs text-[var(--color-muted)]">
            Each person gets this in their own private chat — they won&apos;t see each other&apos;s replies.
            For a shared conversation, make a group instead.
          </p>
          {error && <p className="text-xs text-warn mt-1.5">{error}</p>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas cursor-pointer">
              <input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} className="w-4 h-4" />
              <Avatar name={u.full_name || u.username} online={!!u.online} size={30} />
              <span className="text-sm text-ink">{u.full_name || u.username}</span>
            </label>
          ))}
        </div>
        <div className="p-3 border-t border-line space-y-2">
          <textarea value={body} onChange={(e) => { setBody(e.target.value); setError(''); }} rows={3}
            placeholder="Your message…" className="border border-line rounded-lg px-3 py-2 text-sm w-full" />
          <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-50">
            {busy ? 'Sending…' : `Send to ${picked.length || 0} people`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ================================================================= widget
export default function ChatWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canChat = !!user?.permissions?.chat?.view;

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [unread, setUnread] = useState(0);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');          // list | group | broadcast
  const [toasts, setToasts] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const cursor = useRef(0);
  const bottomRef = useRef(null);
  const activeIdRef = useRef(null);
  const openRef = useRef(false);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { openRef.current = open; }, [open]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  // ---------------------------------------------------------------- poll
  const tick = useCallback(async () => {
    if (!canChat) return;
    try {
      const res = await api.chatPoll(cursor.current, activeIdRef.current);
      cursor.current = res.cursor;
      setConversations(res.conversations);
      setUnread(res.total_unread);

      // Refresh the read ticks on messages already rendered.
      if (res.receipts) {
        const { conversation_id: rc, seen_by_all_upto, others_count } = res.receipts;
        setMessages((prev) => prev.map((m) => (
          m.conversation_id === rc && m.mine && !m.seen_by_all
            ? { ...m, seen_by_all: others_count > 0 && m.id <= seen_by_all_upto }
            : m
        )));
      }

      if (res.messages.length) {
        const openId = activeIdRef.current;
        // Messages for the thread on screen append straight in.
        const forOpen = res.messages.filter((m) => m.conversation_id === openId);
        if (forOpen.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...forOpen.filter((m) => !seen.has(m.id))];
          });
          api.chatMarkRead(openId).catch(() => {});
        }
        // Anything else raises a popup, unless that conversation is muted.
        const elsewhere = res.messages.filter((m) => m.conversation_id !== openId || !openRef.current);
        const mutedIds = new Set(res.conversations.filter((c) => c.muted).map((c) => c.id));
        const notify = elsewhere.filter((m) => !mutedIds.has(m.conversation_id));
        if (notify.length) {
          setToasts((t) => [...t, ...notify.slice(-3)].slice(-3));
          notify.slice(-3).forEach((m) => {
            setTimeout(() => setToasts((t) => t.filter((x) => x.id !== m.id)), TOAST_MS);
          });
        }
      }
    } catch { /* transient — the next tick retries */ }
  }, [canChat]);

  useEffect(() => {
    if (!canChat) return undefined;
    tick();
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { await tick(); schedule(); },
        document.hidden ? POLL_HIDDEN_MS : POLL_ACTIVE_MS);
    };
    schedule();
    const onVis = () => { if (!document.hidden) { tick(); schedule(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [canChat, tick]);

  useEffect(() => {
    if (open && canChat) api.chatUsers().then(setUsers).catch(() => {});
  }, [open, canChat]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    api.chatMessages(activeId).then((m) => {
      setMessages(m);
      api.chatMarkRead(activeId).then(tick).catch(() => {});
    }).catch((e) => setError(e.message));
  }, [activeId, tick]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // -------------------------------------------------------------- actions
  const openWith = async (u) => {
    try {
      const conv = await api.chatOpenDirect(u.id);
      setConversations((c) => (c.some((x) => x.id === conv.id) ? c : [conv, ...c]));
      setActiveId(conv.id);
      setView('list');
    } catch (e) { setError(e.message); }
  };

  const send = async (e) => {
    e?.preventDefault();
    if (!activeId || (!draft.trim() && files.length === 0) || sending) return;
    setSending(true); setError('');
    try {
      const msg = await api.chatSend(activeId, { body: draft.trim(), files });
      setMessages((m) => [...m, msg]);
      setDraft(''); setFiles([]);
      tick();
    } catch (err) { setError(err.message); } finally { setSending(false); }
  };

  const removeMessage = async (m) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.chatDeleteMessage(m.id);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, attachments: [] } : x)));
    } catch (e) { setError(e.message); }
  };

  const toggleMute = async () => {
    if (!active) return;
    try { await api.chatMute(active.id, !active.muted); tick(); } catch (e) { setError(e.message); }
  };

  const openToast = (t) => {
    setActiveId(t.conversation_id);
    setOpen(true);
    setToasts((x) => x.filter((y) => y.id !== t.id));
  };

  if (!canChat) return null;

  const filteredUsers = users.filter((u) =>
    (u.full_name || u.username).toLowerCase().includes(search.toLowerCase()));
  const filteredConvs = conversations.filter((c) =>
    (c.title || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {/* Header trigger */}
      <button onClick={() => setOpen((o) => !o)} title="Team chat"
        className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--color-canvas)] transition-colors">
        <MessageSquare className="w-[18px] h-[18px] text-[var(--color-muted)]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold
            text-white flex items-center justify-center" style={{ background: 'var(--color-danger)' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Pop-up notifications and the panel are portalled to <body>: the
          header they are declared inside is `sticky z-30`, which creates a
          stacking context that would otherwise trap them beneath the
          assistant launcher. */}
      {createPortal((
        <div className="fixed bottom-24 right-4 z-[80] space-y-2 w-80 pointer-events-none">
        {toasts.map((t) => (
          <button key={t.id} onClick={() => openToast(t)}
            className="pointer-events-auto w-full text-left bg-white border border-line rounded-xl shadow-lg p-3 flex gap-2.5 hover:border-[var(--color-brand)]">
            <Avatar name={t.sender_name} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-ink">{t.sender_name}</span>
              <span className="block text-xs text-[var(--color-muted)] truncate">
                {t.body || (t.attachments?.length ? 'Sent an attachment' : '')}
              </span>
            </span>
          </button>
        ))}
        </div>
      ), document.body)}

      {open && createPortal((
        <>
          <div className="fixed inset-0 z-[75] bg-black/20" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 bottom-0 z-[76] w-full sm:w-[760px] bg-white shadow-2xl flex flex-col sm:flex-row overflow-hidden">
            {/* ---------------- left: people and conversations ---------------- */}
            <div className={`${activeId ? 'hidden sm:flex' : 'flex'} flex-col w-full sm:w-[290px] border-r border-line min-h-0 relative`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <h2 className="text-sm font-semibold text-ink">Team Chat</h2>
                <div className="flex items-center gap-1">
                  <button onClick={() => setView('broadcast')} title="Send to several people"
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-canvas">
                    <Megaphone className="w-4 h-4 text-[var(--color-muted)]" />
                  </button>
                  <button onClick={() => setView('group')} title="New group"
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-canvas">
                    <Plus className="w-4 h-4 text-[var(--color-muted)]" />
                  </button>
                  <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-canvas sm:hidden">
                    <X className="w-4 h-4 text-[var(--color-muted)]" />
                  </button>
                </div>
              </div>

              <div className="px-3 py-2 border-b border-line">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…"
                    className="w-full border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {filteredConvs.length > 0 && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Conversations</div>
                )}
                {filteredConvs.map((c) => (
                  <button key={c.id} onClick={() => setActiveId(c.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-canvas ${activeId === c.id ? 'bg-canvas' : ''}`}>
                    {c.type === 'group'
                      ? <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white"
                          style={{ background: avatarGradientFor(c.title || 'group') }}><Users className="w-4 h-4" /></div>
                      : <Avatar name={c.title} online={c.online} />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink truncate">{c.title}</span>
                        {c.last_message && <span className="text-[10px] text-[var(--color-muted)] shrink-0">{timeOf(c.last_message.created_at)}</span>}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--color-muted)] truncate">
                          {c.last_message ? `${c.type === 'group' && c.last_message.sender_id !== user.id ? `${c.last_message.sender_name}: ` : ''}${c.last_message.body}` : 'No messages yet'}
                        </span>
                        {c.unread > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white
                            flex items-center justify-center shrink-0" style={{ background: 'var(--color-danger)' }}>{c.unread}</span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}

                <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  Everyone ({filteredUsers.filter((u) => u.online).length} online)
                </div>
                {filteredUsers.map((u) => (
                  <button key={u.id} onClick={() => openWith(u)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-canvas">
                    <Avatar name={u.full_name || u.username} online={!!u.online} size={32} />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink truncate">{u.full_name || u.username}</span>
                      <span className="block text-[11px] text-[var(--color-muted)]">{u.online ? 'Online' : 'Offline'}</span>
                    </span>
                  </button>
                ))}
                {filteredUsers.length === 0 && filteredConvs.length === 0 && (
                  <p className="text-xs text-[var(--color-muted)] text-center py-8">No one matches “{search}”.</p>
                )}
              </div>

              {view === 'group' && (
                <NewGroupModal users={users} onClose={() => setView('list')}
                  onCreated={(c) => { setView('list'); setActiveId(c.id); tick(); }} />
              )}
              {view === 'broadcast' && (
                <BroadcastModal users={users} onClose={() => setView('list')}
                  onSent={() => { setView('list'); tick(); }} />
              )}
            </div>

            {/* ---------------- right: the conversation ---------------- */}
            <div className={`${activeId ? 'flex' : 'hidden sm:flex'} flex-col flex-1 min-w-0 min-h-0`}>
              {!active ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                  <MessageSquare className="w-10 h-10 text-[var(--color-line)] mb-3" />
                  <p className="text-sm text-[var(--color-muted)]">Pick someone to start chatting.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
                    <button onClick={() => setActiveId(null)} className="sm:hidden">
                      <ArrowLeft className="w-4 h-4 text-[var(--color-muted)]" />
                    </button>
                    {active.type === 'group'
                      ? <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white"
                          style={{ background: avatarGradientFor(active.title || 'group') }}><Users className="w-4 h-4" /></div>
                      : <Avatar name={active.title} online={active.online} />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink truncate">{active.title}</div>
                      <div className="text-[11px] text-[var(--color-muted)]">
                        {active.type === 'group'
                          ? `${active.member_count} members · ${active.members.filter((m) => m.online).length} online`
                          : (active.online ? 'Online' : 'Offline')}
                      </div>
                    </div>
                    <button onClick={toggleMute} title={active.muted ? 'Unmute' : 'Mute notifications'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-canvas">
                      {active.muted ? <BellOff className="w-4 h-4 text-[var(--color-muted)]" /> : <Bell className="w-4 h-4 text-[var(--color-muted)]" />}
                    </button>
                    <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg hidden sm:flex items-center justify-center hover:bg-canvas">
                      <X className="w-4 h-4 text-[var(--color-muted)]" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2" style={{ background: 'var(--color-canvas)' }}>
                    {messages.length === 0 && (
                      <p className="text-xs text-[var(--color-muted)] text-center py-8">
                        No messages yet — say hello.
                      </p>
                    )}
                    {messages.map((m) => (
                      <MessageBubble key={m.id} m={m} isGroup={active.type === 'group'} onDelete={removeMessage} />
                    ))}
                    <div ref={bottomRef} />
                  </div>

                  {error && <p className="text-xs text-warn px-4 py-1.5 bg-red-50 border-t border-red-200">{error}</p>}

                  {files.length > 0 && (
                    <div className="px-4 py-2 border-t border-line flex gap-2 flex-wrap">
                      {files.map((f, i) => (
                        <span key={i} className="text-xs bg-canvas border border-line rounded-lg px-2 py-1 flex items-center gap-1.5">
                          {f.name}
                          <button onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}

                  <form onSubmit={send} className="flex items-end gap-2 px-3 py-2.5 border-t border-line">
                    <label className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-canvas cursor-pointer shrink-0"
                      title="Attach image, PDF or document">
                      <Paperclip className="w-4 h-4 text-[var(--color-muted)]" />
                      <input type="file" multiple className="hidden"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                        onChange={(e) => { setFiles([...e.target.files].slice(0, 5)); e.target.value = ''; }} />
                    </label>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      rows={1} placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
                      className="flex-1 border border-line rounded-xl px-3 py-2 text-sm resize-none max-h-32" />
                    <button type="submit" disabled={sending || (!draft.trim() && !files.length)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white disabled:opacity-40 shrink-0"
                      style={{ background: 'var(--color-brand)' }}>
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </aside>
        </>
      ), document.body)}
    </>
  );
}
