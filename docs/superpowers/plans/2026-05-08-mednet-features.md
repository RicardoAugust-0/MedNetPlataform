# MedNet Daily-Use Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 5 melhorias de produtividade ao MedNet — templates com variáveis, notificações de agenda, indicador de idade de planilha, filtro de histórico por data e PWA instalável.

**Architecture:** Cada feature é independente e toca arquivos distintos. Features 1, 3 e 4 modificam `Monitor.jsx`; Feature 2 estende `useToast.jsx` e `App.jsx`; Feature 4 também estende `useAtendimentos.js`; Feature 5 configura PWA via `vite-plugin-pwa`.

**Tech Stack:** React 19, Vite 8, Supabase JS, vite-plugin-pwa, @vite-pwa/assets-generator

---

## File Map

| Arquivo | Ação | Features |
|---|---|---|
| `src/modules/Monitor.jsx` | Modificar | 1, 3, 4 |
| `src/hooks/useToast.jsx` | Modificar | 2 |
| `src/App.jsx` | Modificar | 2 |
| `src/hooks/useAtendimentos.js` | Modificar | 4 |
| `vite.config.js` | Modificar | 5 |
| `public/pwa-192.png` | Criar | 5 |
| `public/pwa-512.png` | Criar | 5 |

---

## Task 1: Templates com variáveis no Monitor

**Files:**
- Modify: `src/modules/Monitor.jsx`

- [x] **Step 1: Adicionar import de useTemplates**

No topo de `src/modules/Monitor.jsx`, após os imports existentes:

```js
import { useTemplates } from '../hooks/useTemplates';
```

- [x] **Step 2: Instanciar hook e adicionar estado do modal**

Dentro do componente `Monitor()`, após as linhas de `useAtendimentos` e `useAuth`:

```js
const { templates } = useTemplates();
const [templateModal, setTemplateModal] = useState(null);
```

- [x] **Step 3: Adicionar função openTemplate**

Dentro do componente `Monitor()`, após a função `resetFilters`:

```js
const openTemplate = (d) => {
  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const contatos = templates.filter(t => t.tag === 'contato');
  if (contatos.length === 0) { setTemplateModal({ driver: d, text: null }); return; }
  const text = contatos[0].text
    .replace(/\{\{saudacao\}\}/gi, saudacao)
    .replace(/\{\{nome\}\}/gi, d.nome)
    .replace(/\{\{placa\}\}/gi, d.placa || '—')
    .replace(/\{\{transportadora\}\}/gi, d.transportadora || '—');
  setTemplateModal({ driver: d, text });
};
```

- [x] **Step 4: Adicionar JSX do modal**

Dentro do `return`, antes do `</div>` final do `monitor-grid`:

```jsx
{templateModal && (
  <div
    style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
    onClick={() => setTemplateModal(null)}
  >
    <div
      style={{ background:'var(--surface-1)', borderRadius:'var(--radius-lg)', padding:24, maxWidth:520, width:'100%', boxShadow:'var(--shadow-xl)' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontWeight:600, fontSize:14 }}>
          <i className="ti ti-message-2" style={{ marginRight:6 }}></i>
          Template de contato — {templateModal.driver.nome.split(' ')[0]}
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setTemplateModal(null)}>
          <i className="ti ti-x"></i>
        </button>
      </div>
      {templateModal.text ? (
        <>
          <textarea
            readOnly
            value={templateModal.text}
            style={{ width:'100%', minHeight:160, padding:'10px 12px', background:'var(--surface-0)', border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', color:'var(--text-primary)', fontSize:13, resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }}
          />
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setTemplateModal(null)}>Fechar</button>
            <button className="btn btn-sm btn-primary" onClick={() => { navigator.clipboard?.writeText(templateModal.text); setTemplateModal(null); }}>
              <i className="ti ti-copy"></i> Copiar e fechar
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)' }}>
          <i className="ti ti-message-off" style={{ fontSize:32, display:'block', marginBottom:8 }}></i>
          Nenhum template de contato cadastrado.{' '}
          <button className="btn btn-sm btn-ghost" style={{ display:'inline', padding:0, textDecoration:'underline' }}
            onClick={() => { setTemplateModal(null); setActivePanel('templates'); }}>
            Criar um agora
          </button>
        </div>
      )}
    </div>
  </div>
)}
```

- [x] **Step 5: Trocar onClick do botão Template e renomear "Iniciar contato"**

Localizar (linha ~360):
```jsx
<button className="btn btn-sm" onClick={() => setActivePanel('templates')}><i className="ti ti-message-2"></i> Template</button>
<button className="btn btn-sm btn-primary" onClick={() => attend(d)}><i className="ti ti-phone-call"></i> Iniciar contato</button>
```

Substituir por:
```jsx
<button className="btn btn-sm" onClick={() => openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
<button className="btn btn-sm btn-primary" onClick={() => attend(d)}><i className="ti ti-phone-call"></i> Inserir na planilha</button>
```

- [x] **Step 6: Verificar no browser**

```bash
npm run dev
```

1. Abrir Monitor, carregar planilha com motoristas em alerta
2. Clicar "Template" num motorista — modal deve abrir com texto pré-preenchido (se existir template de contato) ou aviso de cadastro
3. Verificar `{{saudacao}}`, `{{nome}}`, `{{placa}}`, `{{transportadora}}` substituídos
4. Botão "Copiar e fechar" deve copiar o texto e fechar o modal
5. Botão agora diz "Inserir na planilha"

- [x] **Step 7: Commit**

```bash
git add src/modules/Monitor.jsx
git commit -m "feat(monitor): template modal com variáveis de motorista e rename de botão"
```

---

## Task 2: Notificações da Agenda

**Files:**
- Modify: `src/hooks/useToast.jsx`
- Modify: `src/App.jsx`

- [x] **Step 1: Estender useToast para suportar action button**

Em `src/hooks/useToast.jsx`, substituir a função `toast` e o render dos toasts:

Função toast (linha ~12):
```js
const toast = useCallback((msg, kind = 'info', action = null) => {
  const id = crypto.randomUUID();
  setToasts(prev => [...prev, { id, msg, kind, action }]);
  setTimeout(() => dismiss(id), action ? 8000 : 4500);
}, [dismiss]);
```

No render de cada toast, substituir o `<div key={t.id} ...>` pelo bloco abaixo (preservar os estilos de cor existentes, adicionar só o `{t.action && ...}` e ajustar cursor):

```jsx
<div
  key={t.id}
  onClick={() => { if (!t.action) dismiss(t.id); }}
  style={{
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    cursor: t.action ? 'default' : 'pointer',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    pointerEvents: 'all',
    boxShadow: 'var(--shadow-lg)',
    animation: 'slideInRight 0.2s ease',
    ...(t.kind === 'error'   ? { background: 'var(--danger-600, #c0392b)', color: '#fff' } :
        t.kind === 'success' ? { background: '#1a7a3a', color: '#fff' } :
        { background: 'var(--surface-0)', color: 'var(--text-primary)', border: '1px solid var(--border-md)' }),
  }}
>
  <i className={`ti ${
    t.kind === 'error'   ? 'ti-alert-circle' :
    t.kind === 'success' ? 'ti-circle-check' :
    'ti-info-circle'
  }`} style={{ flexShrink: 0 }} />
  <span style={{ flex: 1 }}>{t.msg}</span>
  {t.action && (
    <button
      onClick={() => { t.action.fn(); dismiss(t.id); }}
      style={{ padding:'2px 10px', fontSize:11, borderRadius:4, background:'rgba(128,128,128,0.2)', border:'none', color:'inherit', cursor:'pointer', whiteSpace:'nowrap' }}
    >
      {t.action.label}
    </button>
  )}
  {t.action && (
    <button onClick={() => dismiss(t.id)} style={{ padding:'2px 6px', fontSize:12, background:'transparent', border:'none', color:'inherit', cursor:'pointer', opacity:0.6 }}>
      <i className="ti ti-x"></i>
    </button>
  )}
</div>
```

- [x] **Step 2: Adicionar componente ReminderNotifier em App.jsx**

Em `src/App.jsx`, alterar o import existente de `react` para incluir `useRef`:
```js
import { useEffect, useRef } from 'react';
```

Adicionar os novos imports:
```js
import { useReminders } from './hooks/useReminders';
import { useToast } from './hooks/useToast';
```

Logo antes da função `AppShell`, adicionar:

```jsx
function ReminderNotifier() {
  const { reminders, toggle } = useReminders();
  const toast = useToast();
  const notified = useRef(new Set());

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const hhmm = now.toTimeString().slice(0, 5);
      reminders.forEach(r => {
        if (r.done || r.date !== todayStr || r.time !== hhmm || notified.current.has(r.id)) return;
        notified.current.add(r.id);
        toast(
          r.title + (r.sub ? ` — ${r.sub}` : ''),
          'info',
          { label: 'Marcar como feito', fn: () => toggle(r.id) }
        );
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏰ ' + r.title, {
            body: r.sub || 'Lembrete da agenda',
            icon: '/favicon.svg',
            tag: 'reminder-' + r.id,
          });
        }
      });
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [reminders, toggle, toast]);

  return null;
}
```

- [x] **Step 3: Renderizar ReminderNotifier dentro de AppShell**

Dentro de `AppShell`, no `return`, logo após `<div id="app">`:

```jsx
<ReminderNotifier />
```

- [x] **Step 4: Verificar no browser**

```bash
npm run dev
```

1. Criar lembrete com horário = próximo minuto
2. Aguardar o minuto virar — toast deve aparecer com botão "Marcar como feito"
3. Clicar "Marcar como feito" — lembrete deve ser marcado como concluído na Agenda
4. Push notification deve aparecer se permissão concedida

- [x] **Step 5: Commit**

```bash
git add src/hooks/useToast.jsx src/App.jsx
git commit -m "feat(agenda): notificações toast + push quando lembrete atinge horário"
```

---

## Task 3: Indicador de idade da planilha

**Files:**
- Modify: `src/modules/Monitor.jsx`

- [x] **Step 1: Adicionar estado de timestamp e idade**

Dentro de `Monitor()`, após os estados existentes (`activeTab`, `statusMsg`, etc.):

```js
const [sheetLoadedAt, setSheetLoadedAt] = useState(() => localStorage.getItem('mn_sheet_loaded_at'));
const [sheetAgeMin,   setSheetAgeMin]   = useState(() => {
  const ts = localStorage.getItem('mn_sheet_loaded_at');
  return ts ? Math.floor((Date.now() - new Date(ts)) / 60000) : null;
});
```

- [x] **Step 2: Adicionar intervalo de atualização da idade**

Dentro de `Monitor()`, após os useEffects existentes:

```js
useEffect(() => {
  if (!sheetLoadedAt) return;
  const id = setInterval(() => {
    setSheetAgeMin(Math.floor((Date.now() - new Date(sheetLoadedAt)) / 60000));
  }, 60000);
  return () => clearInterval(id);
}, [sheetLoadedAt]);
```

- [x] **Step 3: Persistir timestamp ao carregar planilha**

Dentro de `handleFile`, após a linha `setDrivers(timestamped)`:

```js
const ts = new Date().toISOString();
localStorage.setItem('mn_sheet_loaded_at', ts);
setSheetLoadedAt(ts);
setSheetAgeMin(0);
```

- [x] **Step 4: Adicionar variáveis de cor e label do badge**

Dentro de `Monitor()`, antes do `return`:

```js
const sheetAgeColor = sheetAgeMin === null ? null
  : sheetAgeMin < 30  ? 'var(--success-500, #22c55e)'
  : sheetAgeMin < 60  ? 'var(--warning-500)'
  : 'var(--danger-500)';

const sheetAgeLabel = sheetAgeMin === null ? null
  : sheetAgeMin === 0 ? 'agora'
  : sheetAgeMin < 60  ? `${sheetAgeMin} min atrás`
  : `${Math.floor(sheetAgeMin / 60)}h${sheetAgeMin % 60 > 0 ? ` ${sheetAgeMin % 60}min` : ''} atrás`;
```

- [x] **Step 5: Adicionar badge na status bar**

No JSX da status bar (logo após `<div className="status-text">...`), adicionar o badge:

```jsx
{sheetAgeMin !== null && (
  <span style={{
    display:'inline-flex', alignItems:'center', gap:4, fontSize:11,
    padding:'2px 10px', borderRadius:99, fontWeight:600, flexShrink:0,
    background: sheetAgeColor + '22', color: sheetAgeColor,
  }}>
    <i className="ti ti-clock" style={{ fontSize:10 }}></i>
    {sheetAgeLabel}
  </span>
)}
```

A status bar ficará:
```jsx
<div className="status-bar" style={{ marginBottom: 12 }}>
  <div className={`dot ${statusKind === 'active' ? 'active' : statusKind === 'error' ? 'error' : ''}`}></div>
  <div className="status-text">{statusMsg}{loading && ' — a processar…'}</div>
  {sheetAgeMin !== null && (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4, fontSize:11,
      padding:'2px 10px', borderRadius:99, fontWeight:600, flexShrink:0,
      background: sheetAgeColor + '22', color: sheetAgeColor,
    }}>
      <i className="ti ti-clock" style={{ fontSize:10 }}></i>
      {sheetAgeLabel}
    </span>
  )}
  <button className="btn btn-sm btn-danger" onClick={clearQueue}><i className="ti ti-trash"></i> Limpar fila</button>
  <a href="https://www.sascar.com.br/" target="_blank" rel="noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>
    <i className="ti ti-external-link"></i> Abrir Sascar
  </a>
</div>
```

- [x] **Step 6: Verificar no browser**

```bash
npm run dev
```

1. Carregar planilha — badge deve aparecer com cor verde e "agora"
2. Aguardar 1 min — badge deve atualizar para "1 min atrás"
3. Recarregar página — badge deve mostrar o tempo desde a última carga (persiste via localStorage)
4. Badge muda para amarelo após 30min, vermelho após 60min

- [x] **Step 7: Commit**

```bash
git add src/modules/Monitor.jsx
git commit -m "feat(monitor): badge de idade da planilha com persistência localStorage"
```

---

## Task 4: Filtro por data + exportação CSV no histórico

**Files:**
- Modify: `src/hooks/useAtendimentos.js`
- Modify: `src/modules/Monitor.jsx`

- [x] **Step 1: Adicionar loadByRange em useAtendimentos**

Em `src/hooks/useAtendimentos.js`, após a função `registrar`:

```js
const loadByRange = useCallback(async (start, end) => {
  if (!isSupabaseConfigured) return { data: [], error: null };
  const { data, error } = await supabase
    .from('atendimentos')
    .select('*')
    .gte('created_at', start + 'T00:00:00.000Z')
    .lte('created_at', end   + 'T23:59:59.999Z')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: data.map(toLocal), error: null };
}, []);
```

Na linha de `return` do hook, adicionar `loadByRange`:
```js
return { history, loading, error, registrar, reload: load, loadByRange };
```

- [x] **Step 2: Adicionar estados de intervalo em Monitor**

Em `src/modules/Monitor.jsx`, após os estados `histPeriod`, `histTipo`, `histSearch`:

```js
const [histFrom,      setHistFrom]      = useState('');
const [histTo,        setHistTo]        = useState('');
const [rangeHistory,  setRangeHistory]  = useState([]);
const [rangeLoading,  setRangeLoading]  = useState(false);
```

Atualizar o destructuring de `useAtendimentos`:
```js
const { history, loading: histLoading, error: histError, registrar, loadByRange } = useAtendimentos();
```

- [x] **Step 3: Adicionar função handleRangeSearch e displayHistory**

Em `Monitor()`, antes do `return`:

```js
const handleRangeSearch = async () => {
  if (!histFrom || !histTo) return;
  setRangeLoading(true);
  const { data } = await loadByRange(histFrom, histTo);
  setRangeHistory(data);
  setRangeLoading(false);
};

const displayHistory = histPeriod === 'intervalo' ? rangeHistory : histFiltered;
const displayLoading = histPeriod === 'intervalo' ? rangeLoading : histLoading;
const displayError   = histPeriod === 'intervalo' ? null         : histError;
```

- [x] **Step 4: Adicionar opção "Intervalo personalizado" no select de período**

No JSX do filtro de histórico, substituir o `<select>` de período:

```jsx
<select value={histPeriod} onChange={e => setHistPeriod(e.target.value)}>
  <option value="hoje">Hoje</option>
  <option value="semana">7 dias</option>
  <option value="mes">30 dias</option>
  <option value="todos">Todos</option>
  <option value="intervalo">Intervalo personalizado</option>
</select>
```

Logo após o `<select>`, adicionar os inputs de data (aparecem só quando 'intervalo' selecionado):

```jsx
{histPeriod === 'intervalo' && (
  <>
    <div className="filter-group">
      <label>De</label>
      <input
        type="date"
        value={histFrom}
        onChange={e => setHistFrom(e.target.value)}
        style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)' }}
      />
    </div>
    <div className="filter-group">
      <label>Até</label>
      <input
        type="date"
        value={histTo}
        onChange={e => setHistTo(e.target.value)}
        style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)' }}
      />
    </div>
    <button className="btn btn-sm btn-primary" onClick={handleRangeSearch} disabled={!histFrom || !histTo}>
      <i className="ti ti-search"></i> Buscar
    </button>
  </>
)}
```

- [x] **Step 5: Atualizar exportCSV e renderização da lista para usar displayHistory**

Substituir o botão de exportar:
```jsx
// antes:
<button className="btn btn-sm" onClick={() => exportCSV(histFiltered)}>
// depois:
<button className="btn btn-sm" onClick={() => exportCSV(displayHistory)}>
```

No bloco de renderização da lista do histórico, substituir `histLoading`, `histError` e `histFiltered` pelas variáveis de display:

```jsx
{displayLoading
  ? <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando histórico…</div>
  : displayError
    ? <div className="empty-state" style={{ color: 'var(--danger-500)' }}><i className="ti ti-alert-circle"></i> {displayError}</div>
    : displayHistory.length === 0
      ? <EmptyState icon="ti-history" msg="Nenhum registro encontrado" />
      : <div className="driver-list">
          {displayHistory.map(item => (
            <div className="history-item" key={item.id} style={{ opacity: item._pending ? 0.6 : 1 }}>
              <div className="h-avatar"><i className={`ti ${histIcon[item.tipo] || 'ti-check'}`} style={{ fontSize: 13 }}></i></div>
              <div className="h-info">
                <div className="h-name">
                  {item.motorista}
                  {item.placa && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{item.placa}</span>}
                </div>
                <div className="h-meta">{item.operador} · {item.obs}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <div className="h-time">{new Date(item.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} {item.hora}</div>
                <span className={`badge badge-${tipoBadge[item.tipo] || 'info'}`} style={{ fontSize: 9.5 }}>{tipoLabel[item.tipo] || item.tipo}</span>
              </div>
            </div>
          ))}
        </div>
}
```

- [x] **Step 6: Verificar no browser**

```bash
npm run dev
```

1. Abrir Monitor → aba Histórico
2. Selecionar "Intervalo personalizado" — inputs de data devem aparecer
3. Selecionar datas e clicar Buscar — lista deve mostrar registros do período server-side
4. Clicar "Exportar CSV" — deve baixar arquivo com os registros filtrados
5. Selecionar "Hoje" — volta ao comportamento client-side normal

- [x] **Step 7: Commit**

```bash
git add src/hooks/useAtendimentos.js src/modules/Monitor.jsx
git commit -m "feat(monitor): filtro de histórico por intervalo de datas server-side + exportação CSV"
```

---

## Task 5: PWA instalável

**Files:**
- Modify: `vite.config.js`
- Create: `public/pwa-192.png`
- Create: `public/pwa-512.png`

- [x] **Step 1: Instalar dependências**

```bash
npm install -D vite-plugin-pwa @vite-pwa/assets-generator
```

Expected: packages added to `devDependencies` em `package.json`.

- [x] **Step 2: Gerar ícones PWA a partir do favicon SVG**

```bash
npx pwa-assets-generator --preset minimal public/favicon.svg
```

Expected: arquivos `public/pwa-192.png` e `public/pwa-512.png` gerados.  
Se o comando gerar nomes diferentes, verificar com `ls public/` e ajustar os paths no Step 3.

- [x] **Step 3: Atualizar vite.config.js**

Substituir todo o conteúdo de `vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MedNet',
        short_name: 'MedNet',
        description: 'Plataforma operacional de monitoramento de motoristas',
        theme_color: '#F26931',
        background_color: '#1a1a1a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
})
```

- [x] **Step 4: Testar build de produção**

```bash
npm run build && npm run preview
```

Expected: build sem erros. Abrir `http://localhost:4173` no Chrome → na barra de endereço deve aparecer ícone de instalação (computador com seta para baixo). Instalar e verificar que abre como app standalone.

- [x] **Step 5: Commit**

```bash
git add vite.config.js public/pwa-192.png public/pwa-512.png package.json package-lock.json
git commit -m "feat: PWA instalável com manifest MedNet e cache NetworkFirst para Supabase"
```
