import { ProfilesProvider } from '../hooks/useProfiles';
import { CarrierAliasesProvider } from '../hooks/useCarrierAliases';
import { AtendimentosProvider } from '../hooks/useAtendimentos';
import { LinksProvider } from '../hooks/useLinks';
import { NotesProvider } from '../hooks/useNotes';
import { TemplatesProvider } from '../hooks/useTemplates';
import { WsPagesProvider } from '../hooks/useWsPages';

export function DataProvider({ children }) {
  return (
    <ProfilesProvider>
      <CarrierAliasesProvider>
        <AtendimentosProvider>
          <LinksProvider>
            <NotesProvider>
              <TemplatesProvider>
                <WsPagesProvider>
                  {children}
                </WsPagesProvider>
              </TemplatesProvider>
            </NotesProvider>
          </LinksProvider>
        </AtendimentosProvider>
      </CarrierAliasesProvider>
    </ProfilesProvider>
  );
}
