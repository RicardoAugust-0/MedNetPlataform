import { useState } from 'react';
import { useToast } from '../../hooks/useToast.jsx';
import { normalizeText, normalizePlate, pickFirst, isCriticalLabel } from './utils.js';

const PLATE_KEYS    = ['Identificador/Placa', 'Placa', 'Plate', 'Veiculo', 'Identificador', 'Placa / Empurrador'];
const DRIVER_KEYS   = ['Motorista', 'Motorista / Comandante', 'Nome do Motorista', 'Nome', 'Driver'];
const SEVERITY_KEYS = ['Criticidade', 'Criticidade Original', 'Severidade', 'Prioridade', 'Categoria', 'Severity'];

const EMPTY_META = { name: '', rows: 0, loadedAt: null };

async function parseFile(file) {
  if (!file) return [];
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default || xlsxModule;
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map((r) => {
    const rawPlate    = pickFirst(r, PLATE_KEYS);
    const rawDriver   = pickFirst(r, DRIVER_KEYS);
    const rawSeverity = pickFirst(r, SEVERITY_KEYS);
    return {
      raw:         r,
      plate:       normalizePlate(rawPlate),
      plateRaw:    rawPlate || '',
      driver:      normalizeText(rawDriver),
      driverRaw:   rawDriver || '',
      severityRaw: rawSeverity || '',
      critical:    isCriticalLabel(rawSeverity),
    };
  });
}

function computeMatchList(left, right) {
  const byPlateL  = new Map();
  const byDriverL = new Map();
  const byPlateR  = new Map();
  const byDriverR = new Map();

  left.forEach((ev) => {
    if (!byPlateL.has(ev.plate))   byPlateL.set(ev.plate, []);
    byPlateL.get(ev.plate).push(ev);
    if (!byDriverL.has(ev.driver)) byDriverL.set(ev.driver, []);
    byDriverL.get(ev.driver).push(ev);
  });
  right.forEach((ev) => {
    if (!byPlateR.has(ev.plate))   byPlateR.set(ev.plate, []);
    byPlateR.get(ev.plate).push(ev);
    if (!byDriverR.has(ev.driver)) byDriverR.set(ev.driver, []);
    byDriverR.get(ev.driver).push(ev);
  });

  const found = [];

  for (const [plate, levents] of byPlateL) {
    if (!plate) continue;
    const revents = byPlateR.get(plate) || [];
    if (levents.length && revents.length) {
      found.push({ key: plate, by: 'placa', left: levents, right: revents });
    }
  }

  for (const [driver, levents] of byDriverL) {
    if (!driver) continue;
    if (found.find((f) => f.key === driver)) continue;
    const revents = byDriverR.get(driver) || [];
    if (levents.length && revents.length) {
      found.push({ key: driver, by: 'motorista', left: levents, right: revents });
    }
  }

  return found;
}

export function useCrossCheck() {
  const toast = useToast();

  const [leftEvents,  setLeftEvents]  = useState([]);
  const [rightEvents, setRightEvents] = useState([]);
  const [matches,     setMatches]     = useState([]);
  const [leftMeta,    setLeftMeta]    = useState(EMPTY_META);
  const [rightMeta,   setRightMeta]   = useState(EMPTY_META);
  const [leftInputKey,  setLeftInputKey]  = useState(0);
  const [rightInputKey, setRightInputKey] = useState(0);
  const [filterBy,        setFilterBy]        = useState('todos');
  const [sortBy,          setSortBy]          = useState('ocorrencias');
  const [onlyDivergences, setOnlyDivergences] = useState(false);

  function applyMatches(left, right, silent = false) {
    const found = computeMatchList(left, right);
    setMatches(found);
    if (!silent) {
      if (found.length > 0) {
        toast(`${found.length} correspondência(s) encontrada(s)`, 'success');
      } else {
        toast('Nenhuma correspondência encontrada entre os arquivos carregados.', 'info');
      }
    }
  }

  async function handleFile(file, side) {
    if (!file) return;
    const parsed = await parseFile(file);
    const meta = { name: file.name, rows: parsed.length, loadedAt: new Date().toISOString() };
    if (side === 'left') {
      setLeftEvents(parsed);
      setLeftMeta(meta);
      applyMatches(parsed, rightEvents, true);
    } else {
      setRightEvents(parsed);
      setRightMeta(meta);
      applyMatches(leftEvents, parsed, true);
    }
  }

  function handleUpload(e, side) {
    handleFile(e.target.files?.[0], side);
  }

  function handleDrop(e, side) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file, side);
  }

  function compareNow() {
    applyMatches(leftEvents, rightEvents);
  }

  function clearSide(side) {
    if (side === 'left') {
      setLeftEvents([]);
      setLeftMeta(EMPTY_META);
      setLeftInputKey((k) => k + 1);
      applyMatches([], rightEvents, true);
    } else {
      setRightEvents([]);
      setRightMeta(EMPTY_META);
      setRightInputKey((k) => k + 1);
      applyMatches(leftEvents, [], true);
    }
  }

  function clearAll() {
    setLeftEvents([]);
    setRightEvents([]);
    setLeftMeta(EMPTY_META);
    setRightMeta(EMPTY_META);
    setMatches([]);
    setLeftInputKey((k) => k + 1);
    setRightInputKey((k) => k + 1);
  }

  function swapSides() {
    setLeftEvents(rightEvents);
    setRightEvents(leftEvents);
    setLeftMeta(rightMeta);
    setRightMeta(leftMeta);
    setLeftInputKey((k) => k + 1);
    setRightInputKey((k) => k + 1);
    applyMatches(rightEvents, leftEvents, true);
  }

  function exportResults(filteredMatches, leftName, rightName) {
    if (filteredMatches.length === 0) {
      toast('Nenhum resultado para exportar.', 'info');
      return;
    }

    const escape = (value) => {
      const str = String(value ?? '');
      return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const header = [
      'Tipo', 'Chave',
      `${leftName} ocorrências`, `${rightName} ocorrências`,
      `${leftName} detalhes`,    `${rightName} detalhes`,
      `${leftName} criticidades`, `${rightName} criticidades`,
    ];

    const rows = filteredMatches.map((m) => [
      m.by === 'placa' ? 'Placa' : 'Motorista',
      m.key,
      m.left.length,
      m.right.length,
      m.left.map((ev) => ev.driverRaw || ev.plateRaw || '—').join(' | '),
      m.right.map((ev) => ev.driverRaw || ev.plateRaw || '—').join(' | '),
      m.left.map((ev) => ev.severityRaw || 'Sem criticidade').join(' | '),
      m.right.map((ev) => ev.severityRaw || 'Sem criticidade').join(' | '),
    ].map(escape).join(';'));

    const csv  = [header.join(';'), ...rows].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `cross-check-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredMatches = matches
    .filter((m) => filterBy === 'todos' || m.by === filterBy)
    .filter((m) => !onlyDivergences || m.left.length !== m.right.length)
    .slice()
    .sort((a, b) =>
      sortBy === 'alfabetica'
        ? String(a.key).localeCompare(String(b.key))
        : (b.left.length + b.right.length) - (a.left.length + a.right.length)
    );

  return {
    leftEvents, rightEvents,
    matches, filteredMatches,
    leftMeta, rightMeta,
    leftInputKey, rightInputKey,
    filterBy, setFilterBy,
    sortBy, setSortBy,
    onlyDivergences, setOnlyDivergences,
    handleUpload, handleDrop,
    compareNow, clearSide, clearAll, swapSides,
    exportResults,
  };
}
