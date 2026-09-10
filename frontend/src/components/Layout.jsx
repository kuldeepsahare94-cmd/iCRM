import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users as UsersIcon, Wallet, BarChart3, Settings as SettingsIcon,
  LogOut, UserCog, ShieldCheck, Palette, Menu, X, MessageCircle, Radio, ChevronRight, PhoneCall, Inbox, Megaphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import AssistantWidget from './AssistantWidget';
import { ModuleIcon } from './moduleIcons';
import { Avatar } from './ui';
import ErrorBoundary from './ErrorBoundary';

// Hand-written links for the modules that have bespoke pages. Everything
// else is generated from the module registry below, so a module created
// from Settings appears here automatically.
const links = [
  { to: '/', label: 'Dashboard', end: true, icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: UsersIcon },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/email-campaigns', label: 'Email Campaigns', icon: Megaphone },
  { to: '/payments', label: 'Payments', icon: Wallet },
];

const ADMIN_LINKS = [
  { to: '/lead-sources', label: 'Lead Sources', icon: Radio },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/call-reports', label: 'Call Reports', icon: PhoneCall },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/users', label: 'Users', icon: UserCog },
  { to: '/roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { to: '/appearance', label: 'Appearance', icon: Palette },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function useUniversalModules() {
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    api.listModulesMeta().then((mods) => {
      const HANDLED = new Set(['leads', 'payments']);
      const visible = mods.filter((m) => !HANDLED.has(m.api_name));
      const byGroup = {};
      visible.forEach((m) => {
        const g = m.sidebar_group || 'Other';
        (byGroup[g] = byGroup[g] || []).push(m);
      });
      setGroups(Object.entries(byGroup).sort((a, b) => a[0].localeCompare(b[0])));
    }).catch(() => setGroups([]));
  }, []);
  return groups;
}

const navItem = ({ isActive }) =>
  `flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
      : 'text-[var(--color-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]'
  }`;

function GroupLabel({ children }) {
  return (
    <div className="px-6 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
      {children}
    </div>
  );
}

function DrawerContent({ onNavigate, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const moduleGroups = useUniversalModules();
  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)]">
      <div className="px-5 py-5 flex items-center justify-between border-b border-line"
        style={{ background: 'linear-gradient(135deg, var(--color-brand), var(--color-special))' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/15 backdrop-blur border border-white/20">
            <span className="text-white font-bold text-sm">i</span>
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight leading-none text-white">iCRM</div>
            <div className="text-[10px] text-white/70 mt-0.5">Grow Connections</div>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close navigation"
          className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto thin-scroll" aria-label="Main navigation">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} onClick={onNavigate} className={navItem}>
            <l.icon className="w-[18px] h-[18px] shrink-0" />
            {l.label}
          </NavLink>
        ))}

        {moduleGroups.map(([group, mods]) => (
          <div key={group}>
            <GroupLabel>{group}</GroupLabel>
            {mods.map((m) => (
              <NavLink key={m.api_name} to={`/records/${m.api_name}`} onClick={onNavigate} className={navItem}>
                <ModuleIcon name={m.icon} className="w-[18px] h-[18px] shrink-0" />
                {m.plural_label}
              </NavLink>
            ))}
          </div>
        ))}

        <GroupLabel>Administration</GroupLabel>
        {ADMIN_LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} onClick={onNavigate} className={navItem}>
            <l.icon className="w-[18px] h-[18px] shrink-0" />
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-line">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <Avatar name={user?.full_name || user?.username} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink truncate">{user?.full_name || user?.username}</div>
            <div className="t-meta truncate">{user?.role?.name || user?.role_name || 'User'}</div>
          </div>
          <button onClick={handleLogout} title="Log out" aria-label="Log out"
            className="text-[var(--color-faint)] hover:text-[var(--color-danger)] p-1.5 rounded-lg hover:bg-[var(--color-canvas)] shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Human-readable breadcrumb from the path. Kept simple deliberately —
// deep per-record titles would need a fetch the shell shouldn't own.
function Breadcrumb() {
  const { pathname } = useLocation();
  if (pathname === '/') return <span className="t-meta">Dashboard</span>;
  const parts = pathname.split('/').filter(Boolean);
  const label = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 t-meta">
      <span>Home</span>
      {parts.slice(0, 2).map((p) => (
        <span key={p} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-[var(--color-faint)]" />
          <span className={p === parts[Math.min(1, parts.length - 1)] ? 'text-ink font-medium' : ''}>
            {/^\d+$/.test(p) ? `#${p}` : label(p)}
          </span>
        </span>
      ))}
    </nav>
  );
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Close on navigation — the brief asks for the drawer to dismiss itself
  // after picking a module rather than staying open over the content.
  useEffect(() => { setDrawerOpen(false); setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setDrawerOpen(false); setMenuOpen(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="min-h-screen" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Drawer overlays the page rather than reserving permanent width,
          so content gets the full viewport when it's closed. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-backdrop absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer-panel absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl">
            <DrawerContent onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-[var(--color-surface)] border-b border-line">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-14">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open navigation"
            className="p-2 -ml-2 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-canvas)] hover:text-ink shrink-0">
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden md:block shrink-0"><Breadcrumb /></div>

          <div className="flex-1 flex justify-center px-2 min-w-0">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <NotificationBell />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((s) => !s)} aria-haspopup="menu" aria-expanded={menuOpen}
                className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-[var(--color-canvas)]">
                <Avatar name={user?.full_name || user?.username} size="sm" />
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-sm font-medium text-ink">{user?.full_name || user?.username}</div>
                  <div className="text-[11px] text-[var(--color-muted)]">{user?.role?.name || user?.role_name || 'User'}</div>
                </div>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-1 w-48 card py-1 shadow-lg z-40">
                  <button role="menuitem" onClick={() => navigate('/settings')}
                    className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-[var(--color-canvas)] flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4 text-[var(--color-muted)]" /> Settings
                  </button>
                  <button role="menuitem" onClick={() => { logout(); navigate('/login'); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-canvas)] flex items-center gap-2"
                    style={{ color: 'var(--color-danger)' }}>
                    <LogOut className="w-4 h-4" /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6">
        {/* Keyed on the path so navigating away from a crashed page clears
            the error and renders the new route normally. Without the key a
            boundary latches permanently once tripped. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <AssistantWidget />
    </div>
  );
}
