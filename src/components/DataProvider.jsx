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
  return (
    <ProfilesProvider>
      <CarrierAliasesProvider>
        <AtendimentosProvider>
          <LinksProvider>
            <NotesProvider>
              <TemplatesProvider>
                <WsPagesProvider>
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
