import { useState, useCallback } from 'react';

function load(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

function save(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage não crítico */ }
}

// Visões salvas: snapshot nomeado de um conjunto de filtros, persistido em
// localStorage sob uma chave por módulo (ex: 'mn_saved_views_analytics').
export function useSavedViews(storageKey) {
  const [views, setViews] = useState(() => load(storageKey));

  const saveView = useCallback((name, snapshot) => {
    setViews(prev => {
      const next = [...prev.filter(v => v.name !== name), { name, snapshot, createdAt: Date.now() }];
      save(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const removeView = useCallback((name) => {
    setViews(prev => {
      const next = prev.filter(v => v.name !== name);
      save(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return { views, saveView, removeView };
}
