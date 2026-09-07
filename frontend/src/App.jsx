import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Roles from './pages/Roles';
import Users from './pages/Users';
import Settings from './pages/Settings';
import SettingsModules from './pages/SettingsModules';
import SettingsWorkflows from './pages/SettingsWorkflows';
import SettingsPipelines from './pages/SettingsPipelines';
import SettingsTeams from './pages/SettingsTeams';
import Appearance from './pages/Appearance';
import WhatsAppIntegrations from './pages/WhatsAppIntegrations';
import WhatsAppTemplates from './pages/WhatsAppTemplates';
import WhatsAppWorkflows from './pages/WhatsAppWorkflows';
import WhatsAppCampaigns from './pages/WhatsAppCampaigns';
import WhatsAppInbox from './pages/WhatsAppInbox';
import WhatsAppAnalytics from './pages/WhatsAppAnalytics';
import LeadSources from './pages/LeadSources';
import UniversalList from './pages/universal/UniversalList';
import UniversalDetail from './pages/universal/UniversalDetail';
import UniversalKanban from './pages/universal/UniversalKanban';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/leads/:id" element={<LeadDetail />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/payments/:id" element={<Payments />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/roles" element={<Roles />} />
              <Route path="/users" element={<Users />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/modules" element={<SettingsModules />} />
              <Route path="/settings/workflows" element={<SettingsWorkflows />} />
              <Route path="/settings/pipelines" element={<SettingsPipelines />} />
              <Route path="/settings/teams" element={<SettingsTeams />} />
              <Route path="/appearance" element={<Appearance />} />
              <Route path="/whatsapp" element={<WhatsAppIntegrations />} />
              <Route path="/whatsapp/templates" element={<WhatsAppTemplates />} />
              <Route path="/whatsapp/workflows" element={<WhatsAppWorkflows />} />
              <Route path="/whatsapp/campaigns" element={<WhatsAppCampaigns />} />
              <Route path="/whatsapp/inbox" element={<WhatsAppInbox />} />
              <Route path="/whatsapp/inbox/:id" element={<WhatsAppInbox />} />
              <Route path="/whatsapp/analytics" element={<WhatsAppAnalytics />} />
              <Route path="/lead-sources" element={<LeadSources />} />
              {/* Universal CRM modules (Accounts, Contacts, Opportunities, Quotations,
                  Products, Subscriptions, Tickets, and any admin-created custom module)
                  all share these three routes, driven by module/field metadata. */}
              <Route path="/records/:moduleApiName" element={<UniversalList />} />
              <Route path="/records/:moduleApiName/kanban" element={<UniversalKanban />} />
              <Route path="/records/:moduleApiName/:id" element={<UniversalDetail />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
