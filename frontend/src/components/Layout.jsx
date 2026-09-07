import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users as UsersIcon, GraduationCap, Wallet, BarChart3, Settings as SettingsIcon, LogOut, UserCog, ShieldCheck, Palette, Menu, X, MessageCircle, Radio } from 'lucide-react';
import { ModuleIcon } from './moduleIcons';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import AssistantWidget from './AssistantWidget';

// The universal CRM modules (Accounts, Contacts, Opportunities, ...) don't
// get hand-written sidebar entries like the links above — they're read
// straight from the module registry (Settings -> Modules) and grouped by
// each module's sidebar_group, so a module created from the future Module
// Builder shows up here automatically with zero code changes.
function useUniversalModules() {
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    api.listModulesMeta().then((mods) => {
      // Skip modules that already have a hand-written entry above, and any
      // legacy/internal registrations that shouldn't clutter the sidebar.
      // 'leads' and 'payments' already have hand-written links above; every
      // other enabled module gets a sidebar entry generated here. The
      // placement-domain modules (students/courses/admissions/placements/
      // the legacy companies table) were fully removed from the registry,
      // not just hidden, so they can no longer appear in this list at all.
      const HANDLED = new Set(['leads', 'payments']);
      const visible = mods.filter((m) => !HANDLED.has(m.api_name));
      const byGroup = {};
      visible.forEach((m) => {
        const g = m.sidebar_group || 'Other';
        byGroup[g] = byGroup[g] || [];
        byGroup[g].push(m);
      });
      setGroups(Object.entries(byGroup).sort((a, b) => a[0].localeCompare(b[0])));
    }).catch(() => setGroups([]));
  }, []);
  return groups;
}

const links = [
  { to: '/', label: 'Dashboard', end: true, icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: UsersIcon },
  { to: '/lead-sources', label: 'Lead Sources', icon: Radio },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { to: '/users', label: 'Users', icon: UserCog },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/appearance', label: 'Appearance', icon: Palette },
];

const BOTTOM_NAV = [
  { to: '/', label: 'Home', end: true, icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: UsersIcon },
  { to: '/payments', label: 'Payments', icon: Wallet },
];

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const moduleGroups = useUniversalModules();
  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = (user?.full_name || user?.username || '?').slice(0, 1).toUpperCase();

  return (
    <>
      <div className="px-6 py-6 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-display text-lg font-semibold tracking-tight leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            EduPlace CRM
          </div>
          <div className="text-[11px] text-white/40">Admission &amp; Placement</div>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <NavLink key={l.to} to={l.to} end={l.end} onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-2.5 text-sm font-medium border-l-2 transition-colors ${
                  isActive ? 'border-amber text-white bg-white/[0.06]' : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.04]'
                }`
              }>
              <Icon className="w-4 h-4" />
              {l.label}
            </NavLink>
          );
        })}

        {moduleGroups.map(([group, mods]) => (
          <div key={group} className="mt-3 pt-3 border-t border-white/10">
            <div className="px-6 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">{group}</div>
            {mods.map((m) => (
              <NavLink key={m.api_name} to={`/records/${m.api_name}`} onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-6 py-2.5 text-sm font-medium border-l-2 transition-colors ${
                    isActive ? 'border-amber text-white bg-white/[0.06]' : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.04]'
                  }`
                }>
                <ModuleIcon name={m.icon} className="w-4 h-4" />
                {m.plural_label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-amber/20 text-amber flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">{user?.full_name || user?.username}</div>
            <div className="text-[11px] text-white/40 truncate">{user?.role?.name || user?.role_name || '@' + user?.username}</div>
          </div>
          <button onClick={handleLogout} title="Log out" className="text-white/40 hover:text-white shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="flex">
        <aside className="hidden md:flex w-64 shrink-0 bg-ink text-white flex-col fixed inset-y-0">
          <SidebarContent />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-ink text-white flex flex-col">
              <button onClick={() => setDrawerOpen(false)} className="absolute top-5 right-4 text-white/60"><X className="w-5 h-5" /></button>
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0 md:ml-64">
          <div className="sticky top-0 z-30 bg-white border-b border-line px-4 md:px-8 py-3 flex items-center gap-3">
            <button onClick={() => setDrawerOpen(true)} className="md:hidden text-ink shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <GlobalSearch />
            <NotificationBell />
          </div>

          <main className="bg-canvas min-h-[calc(100vh-57px)] pb-16 md:pb-0">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line flex">
        {BOTTOM_NAV.map((l) => {
          const Icon = l.icon;
          return (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  isActive ? 'text-amber' : 'text-slate-400'
                }`
              }>
              <Icon className="w-5 h-5" />
              {l.label}
            </NavLink>
          );
        })}
        <button onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-400">
          <Menu className="w-5 h-5" />
          More
        </button>
      </nav>

      <AssistantWidget />
    </div>
  );
}
