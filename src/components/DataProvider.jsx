import { ProfilesProvider } from '../hooks/useProfiles';
import { CarrierAliasesProvider } from '../hooks/useCarrierAliases';
import { AtendimentosProvider } from '../hooks/useAtendimentos';
import { LinksProvider } from '../hooks/useLinks';
import { NotesProvider } from '../hooks/useNotes';
import { TemplatesProvider } from '../hooks/useTemplates';
import { WsPagesProvider } from '../hooks/useWsPages';
import { AutomationsProvider } from '../hooks/useAutomations';
import { useAuth } from '../auth/AuthContext.jsx';
import { useLocation } from 'react-router-dom';

function RoleScopedAutomationsProvider({ children }) {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const canManageAutomations = profile?.role === 'admin' || profile?.role === 'lider';
  const isAutomationsRoute = pathname === '/automacoes' || pathname.startsWith('/automacoes/');
  return (
    <AutomationsProvider
      enabled={canManageAutomations}
      active={canManageAutomations && isAutomationsRoute}
    >
      {children}
    </AutomationsProvider>
  );
}

export function DataProvider({ children }) {
  const { pathname } = useLocation();
  const isDashboard = pathname === '/' || pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isMonitor = pathname === '/monitor' || pathname.startsWith('/monitor/');

  return (
    <ProfilesProvider enabled={isDashboard || pathname.startsWith('/admin/equipe')}>
      <CarrierAliasesProvider enabled={isDashboard || isMonitor || pathname.startsWith('/dossies') || pathname.startsWith('/admin/integracoes/transportadoras')}>
        <AtendimentosProvider enabled={isDashboard || isMonitor || pathname.startsWith('/admin/sistema/limpeza')}>
          <LinksProvider enabled={pathname === '/links' || pathname.startsWith('/links/')}>
            <NotesProvider enabled={pathname === '/notas' || pathname.startsWith('/notas/')}>
              <TemplatesProvider enabled={isMonitor || pathname === '/templates' || pathname.startsWith('/templates/')}>
                <WsPagesProvider enabled={pathname === '/workspace' || pathname.startsWith('/workspace/')}>
                  <RoleScopedAutomationsProvider>
                    {children}
                  </RoleScopedAutomationsProvider>
                </WsPagesProvider>
              </TemplatesProvider>
            </NotesProvider>
          </LinksProvider>
        </AtendimentosProvider>
      </CarrierAliasesProvider>
    </ProfilesProvider>
  );
}
