# SKILL · MedNet · Fadiga Zero — Integrador de Plataformas e Módulos

Resumo
------
Skill workspace-scoped para atuar como desenvolvedor Full-Stack sênior (React/Vite + Supabase) do projeto "MedNet · Fadiga Zero". Automatiza orientação e checklist para:

- criar novos adapters de plataforma em `src/platforms/<id>/`;
- gerar novos módulos/painéis em `src/modules/` e registrar em `src/data.js` (array `NAV_ITEMS`);
- validar contrato canônico de saída (`drivers`, `stats`) e reuso dos helpers em `src/platforms/shared/`.

Escopo e garantias
------------------
- Workspace-scoped: salva e versiona o skill no repositório (`docs/skills/mednet-skill/SKILL.md`).
- Garante aderência às regras do projeto: navegação via `activePanel`, Adapter Pattern, uso de helpers compartilhados, e contrato canônico (usar `emptyDriver()` / `emptyStats()`).

Quando usar
-----------
- Precisa adicionar uma nova plataforma de monitoramento (Maxtrack, Autotrack, etc.).
- Precisa criar um novo módulo/painel (ex.: novo painel operacional, relatórios ou integração). 

Resultado esperado
------------------
- Um adapter em `src/platforms/<id>/` com `id`, `name`, `inputType` e o bloco apropriado (`spreadsheet | api | scraper`) e testes básicos.
- Um módulo React funcional em `src/modules/<ModuleName>.jsx` registrado no `NAV_ITEMS` de `src/data.js`.
- Checklist de aceitação (build, lint, testes unitários de parser, validação manual de upload/pull).

Workflow passo-a-passo (para nova plataforma — modo mais comum: `spreadsheet`)
----------------------------------------------------------------------------
1. Copiar template
   - `cp -r src/platforms/_template src/platforms/<id>`

2. Atualizar metadata (`index.js`)
   - Preencher `id`, `name`, `label`, `sistema`, `portalUrl`, `status`.
   - Definir `inputType: 'spreadsheet' | 'api' | 'scraper'`.

3. Implementar `columns.js`
   - Mapear colunas relevantes (`COLUMNS`) e definir `TAXONOMY`, arrays de eventos.

4. Implementar `parser.js`
   - Importar e usar obrigatoriamente: `normalize`, `parseEventDate`, `parseSpeed`, `parseTurno`, `buildClearMap`, `isAfterClear`, `maxSeveridade`.
   - Ler XLSX/CSV com `xlsx` (dinamicamente com `await import('xlsx')`).
   - Conformar saída: `return { drivers, stats }` usando `emptyDriver()` / `emptyStats()` de `src/platforms/base.js`.

5. Implementar `detect({ fileName, headers })` com score e heurísticas.

6. Escrever testes
   - `parser.test.js` com amostras reduzidas (linhas com falso positivo, velocidade baixa, agrupar placas).

7. Registrar no registry
   - Editar `src/platforms/index.js` para exportar o novo adapter.

8. Teste manual
   - Fazer upload de planilha real via UI (`Monitor` → `UploadArea`) e validar KPIs e filtros.

9. Checklist de aceitação
   - `npm run build` passa sem erro.
   - `npm run lint` sem novos erros no diff.
   - Testes unitários (`parser.test.js` e `shared/*.test.js`) passam localmente.
   - Dados no formato canônico (drivers e stats) e uso de `emptyDriver()`/`emptyStats()`.

Pontos de decisão e variações
----------------------------
- `inputType='api'`: implementar `api.pull({ history })` e preferir Edge Function para credenciais sensíveis.
- `inputType='scraper'`: implementar `scraper.pull` que chama uma Edge Function; a Edge Function faz autenticação e scraping server-side.
- Auto-descartes e regras específicas de transportadora: implementar no parser, mas mover regras reutilizáveis para `platforms/shared/`.

Critérios de qualidade (PR checklist)
-----------------------------------
- Código usa helpers de `src/platforms/shared/` — nada duplicado.
- Parser respeita contrato canônico e retorna `Date` nos campos de evento quando possível.
- Testes cobrem: falso-positivo, filtro por velocidade, filtro por histórico, turno, severidade máxima.
- Nenhuma string "Sascar" hard-coded fora de `src/platforms/sascar/`.
- Documentação curta no `README` do adapter (opcional: `src/platforms/<id>/README.md`).

Exemplos de prompts para usar este skill
--------------------------------------
- "Criar adapter `maxtrack` modo `api` com detect por `maxtrack` no filename e tests básicos." 
- "Gerar módulo `Reports` em `src/modules/Reports.jsx` e registrá-lo no `NAV_ITEMS` com group 'Analytics'." 
- "Adicionar testes unitários para `src/platforms/sascar/parser.js` cobrindo auto-descarte Dinon." 

Iteração e revisão
------------------
1. Draft: gerar arquivos de scaffold (index.js, columns.js, parser.js com TODOs, parser.test.js).
2. Revisão: indicar gaps (ex.: colunas ambiguas, heurísticas de detect), pedir amostra de arquivo real se necessário.
3. Finalizar: ajustar parser com amostra real, rodar build/lint/tests, abrir PR.

Perguntas clarificadoras sugeridas (se a conversa estiver ambígua)
----------------------------------------------------------------
- O adaptador será `spreadsheet`, `api` ou `scraper`?
- Você tem uma amostra de planilha (XLSX/CSV) que represente variações reais?
- Há regras de auto-descarte específicas por transportadora (ex.: Dinon)?

Localização do skill
--------------------
Arquivo criado em: `docs/skills/mednet-skill/SKILL.md` (workspace-scoped).

Notas finais rápidas
-------------------
Use este skill para gerar scaffolds consistentes; sempre promova lógica reutilizável para `src/platforms/shared/` e registre novas plataformas em `src/platforms/index.js`.
