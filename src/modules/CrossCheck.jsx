import { useState } from 'react';
import { useApp } from '../context.jsx';

function normalizeText(v) {
  if (!v && v !== 0) return '';
  return String(v).normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase();
}

function normalizePlate(v) {
  if (!v && v !== 0) return '';
  return String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function pickFirst(row, keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  return '';
}

function isCriticalLabel(s) {
  if (!s && s !== 0) return false;
  const str = String(s).toLowerCase();
  return /grav|crit|grave|crític|crítico/.test(str);
}

export default function CrossCheck() {
  const {  } = useApp();
  const [leftEvents, setLeftEvents] = useState([]);
  const [rightEvents, setRightEvents] = useState([]);
  const [matches, setMatches] = useState([]);
  const [leftName, setLeftName] = useState('Maxtrack');
  const [rightName, setRightName] = useState('Horizon');

  async function parseFile(file) {
    if (!file) return [];
    const XLSX = (await import('xlsx')).default;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    // detect common keys
    const plateKeys = ['Identificador/Placa','Placa','Plate','VEICULO','IDENTIFICADOR/PLACA','IDENTIFICADOR'];
    const driverKeys = ['Motorista','Driver','Nome','Name','MOTORISTA'];
    const severityKeys = ['Criticidade','Criticidade Original','Severity','Prioridade','Categoria','CRITICIDADE'];

    return rows.map(r => {
      const rawPlate = pickFirst(r, plateKeys);
      const rawDriver = pickFirst(r, driverKeys);
      const rawSeverity = pickFirst(r, severityKeys);
      return {
        raw: r,
        plate: normalizePlate(rawPlate),
        plateRaw: rawPlate || '',
        driver: normalizeText(rawDriver),
        driverRaw: rawDriver || '',
        severityRaw: rawSeverity || '',
        critical: isCriticalLabel(rawSeverity),
      };
    });
  }

  async function handleUpload(e, side) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const parsed = await parseFile(file);
    if (side === 'left') setLeftEvents(parsed);
    else setRightEvents(parsed);
    computeMatches(side === 'left' ? parsed : leftEvents, side === 'right' ? parsed : rightEvents);
  }

  function computeMatches(left, right) {
    const L = left || leftEvents;
    const R = right || rightEvents;
    const byPlateL = new Map();
    const byDriverL = new Map();
    const byPlateR = new Map();
    const byDriverR = new Map();

    L.forEach(ev => { if (!byPlateL.has(ev.plate)) byPlateL.set(ev.plate, []); byPlateL.get(ev.plate).push(ev); if (!byDriverL.has(ev.driver)) byDriverL.set(ev.driver, []); byDriverL.get(ev.driver).push(ev); });
    R.forEach(ev => { if (!byPlateR.has(ev.plate)) byPlateR.set(ev.plate, []); byPlateR.get(ev.plate).push(ev); if (!byDriverR.has(ev.driver)) byDriverR.set(ev.driver, []); byDriverR.get(ev.driver).push(ev); });

    const found = [];

    // match by plate
    for (const [plate, levents] of byPlateL) {
      if (!plate) continue;
      const revents = byPlateR.get(plate) || [];
      const lCrit = levents.filter(x => x.critical);
      const rCrit = revents.filter(x => x.critical);
      if (lCrit.length && rCrit.length) {
        found.push({ key: plate, by: 'placa', left: lCrit, right: rCrit });
      }
    }

    // match by driver name (only if not already matched by plate)
    for (const [driver, levents] of byDriverL) {
      if (!driver) continue;
      const already = found.find(f => f.key === driver);
      if (already) continue;
      const revents = byDriverR.get(driver) || [];
      const lCrit = levents.filter(x => x.critical);
      const rCrit = revents.filter(x => x.critical);
      if (lCrit.length && rCrit.length) {
        found.push({ key: driver, by: 'motorista', left: lCrit, right: rCrit });
      }
    }

    setMatches(found);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Cross-Check: comparação entre plataformas</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Plataforma (esquerda)</label>
          <input value={leftName} onChange={e => setLeftName(e.target.value)} style={{ marginBottom: 6 }} />
          <input type="file" accept=".csv,.xls,.xlsx" onChange={e => handleUpload(e, 'left')} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Plataforma (direita)</label>
          <input value={rightName} onChange={e => setRightName(e.target.value)} style={{ marginBottom: 6 }} />
          <input type="file" accept=".csv,.xls,.xlsx" onChange={e => handleUpload(e, 'right')} />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => computeMatches()} className="btn">Comparar</button>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <h3>Matches encontrados: {matches.length}</h3>
        <div>
          {matches.map((m, i) => (
            <div key={i} style={{ border: '1px solid #eee', padding: 8, marginBottom: 8, borderRadius: 6 }}>
              <div style={{ fontWeight: 700 }}>{m.by === 'placa' ? `Placa: ${m.key}` : `Motorista: ${m.key}`}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#666', fontSize: 12 }}>{leftName} ({m.left.length} crítico(s))</div>
                  {m.left.map((ev, j) => (
                    <div key={j} style={{ padding: '6px 0', borderBottom: '1px dashed #f0f0f0' }}>
                      <div style={{ fontSize: 13 }}>{ev.driverRaw || ev.plateRaw}</div>
                      <div style={{ color: '#888', fontSize: 12 }}>{ev.severityRaw}</div>
                    </div>
                  ))}
                </div>
                <div style={{ width: 12 }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#666', fontSize: 12 }}>{rightName} ({m.right.length} crítico(s))</div>
                  {m.right.map((ev, j) => (
                    <div key={j} style={{ padding: '6px 0', borderBottom: '1px dashed #f0f0f0' }}>
                      <div style={{ fontSize: 13 }}>{ev.driverRaw || ev.plateRaw}</div>
                      <div style={{ color: '#888', fontSize: 12 }}>{ev.severityRaw}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {matches.length === 0 && <div style={{ color: '#666' }}>Nenhuma correspondência crítica encontrada entre os arquivos carregados.</div>}
        </div>
      </div>
    </div>
  );
}
