# Agenda: Edit Button + Category Icons

**Date:** 2026-05-09
**Status:** Approved

## Overview

Two additions to `src/modules/Agenda.jsx`:
1. Edit button on each reminder → dedicated modal
2. Category icon selector when creating/editing a reminder, displayed on the reminder item

## DB Change

```sql
ALTER TABLE reminders ADD COLUMN icon VARCHAR;
```

Nullable. No default. Existing rows remain valid (icon = null → fallback `ti-bell`).

## Hook: useReminders

Add `update(id, fields)`:

```js
const update = useCallback(async (id, { title, sub, time, urgent, date, icon }) => {
  setReminders(prev => prev.map(r => r.id === id ? { ...r, title, sub, time, urgent, date, icon } : r));
  const { error } = await supabase
    .from('reminders')
    .update({ title, sub: sub || '', time, urgent: !!urgent, reminder_date: date, icon: icon || null })
    .eq('id', id);
  if (error) { load(); toast('Erro ao atualizar lembrete', 'error'); }
}, [load]);
```

`toLocal` gains `icon: row.icon || null`.

Return signature: `{ reminders, loading, add, toggle, remove, update }`.

## IconPicker Component

Inline in `Agenda.jsx` (no separate file). Props: `value`, `onChange`.

16 icons across 4 tabs:

| Tab | Icons |
|-----|-------|
| Frota | `ti-truck`, `ti-car`, `ti-gas-station`, `ti-tool` |
| Contato | `ti-phone`, `ti-user`, `ti-message`, `ti-id` |
| Alerta | `ti-alert-triangle`, `ti-flame`, `ti-clock`, `ti-flag` |
| Admin | `ti-file`, `ti-clipboard`, `ti-calendar`, `ti-building` |

- Active tab: `btn-primary` style
- Selected icon: accent border highlight
- No selection: null (fallback `ti-bell` on display, not saved to DB)

## Reminder Item Layout

Before: `[time]  [body]  [✓]  [🗑]`
After:  `[icon]  [time]  [body]  [✓]  [✏]  [🗑]`

- Icon column: `<i className={`ti ti-${r.icon || 'bell'}`}>` with `color: var(--text-muted)` when no icon chosen, `color: var(--accent-500)` when chosen
- `ti-pencil` button: same `btn-icon` class as trash, placed between `reminder-check` and trash

## Edit Modal

- Rendered via `createPortal(modal, document.body)` — same pattern as Workspace modal
- State: `editingReminder` (object | null) in `Agenda` component
- Opens when pencil button clicked: `setEditingReminder(r)`
- Form fields: title, sub, date, time, priority select, IconPicker — all pre-filled
- Save: calls `update(editingReminder.id, fields)` then `setEditingReminder(null)`
- Cancel/overlay click: `setEditingReminder(null)`
- CSS: `.edit-reminder-modal` overlay + centered card, reuses `.form-control`, `.form-group`, `.btn`, `.form-row`

## CSS Additions

```css
.edit-reminder-modal { /* overlay */ position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; display: grid; place-items: center; }
.edit-reminder-modal-card { background: var(--surface-0); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; width: 340px; }
.icon-picker-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.icon-picker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.icon-picker-btn { ... accent border when selected }
```

## Files Changed

- `src/hooks/useReminders.js` — add `update`, update `toLocal`
- `src/modules/Agenda.jsx` — `IconPicker` component, edit modal, pencil button, icon display
- `src/styles/modules.css` — modal + icon picker CSS
- Supabase migration — `ALTER TABLE reminders ADD COLUMN icon VARCHAR`
