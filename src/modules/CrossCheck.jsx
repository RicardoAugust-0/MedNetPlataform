import { useState } from 'react';
import { useApp } from '../context.jsx';
import { useToast } from '../hooks/useToast.jsx';

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
  const toast = useToast();
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
      if (levents.length && revents.length) {
        found.push({ key: plate, by: 'placa', left: levents, right: revents });
      }
    }

    // match by driver name (only if not already matched by plate)
    for (const [driver, levents] of byDriverL) {
      if (!driver) continue;
      const already = found.find(f => f.key === driver);
      if (already) continue;
      const revents = byDriverR.get(driver) || [];
      if (levents.length && revents.length) {
        found.push({ key: driver, by: 'motorista', left: levents, right: revents });
      }
    }

    setMatches(found);
    if (found.length > 0) {
      toast(`${found.length} correspondência(s) encontrada(s)`, 'success');
    } else {
      toast('Nenhuma correspondência encontrada entre os arquivos carregados.', 'info');
    }
  }
  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-shuffle" style={{ color: 'var(--accent-500)' }}></i> Cross-Check</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comparar alertas entre plataformas</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 260, gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Nome da Plataforma (Esq.)</label>
                <input className="form-control" value={leftName} onChange={e => setLeftName(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Planilha 1</label>
                <input className="form-control" type="file" accept=".csv,.xls,.xlsx" onChange={e => handleUpload(e, 'left')} style={{ padding:'8px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 260, gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Nome da Plataforma (Dir.)</label>
                <input className="form-control" value={rightName} onChange={e => setRightName(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Planilha 2</label>
                <input className="form-control" type="file" accept=".csv,.xls,.xlsx" onChange={e => handleUpload(e, 'right')} style={{ padding:'8px' }} />
              </div>
            </div>
            <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: '4px' }}>
              <button onClick={() => computeMatches()} className="btn btn-primary" style={{ height: 42, padding: '0 24px' }}>Comparar Lado a Lado</button>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginTop: 0, fontSize: 16, marginBottom: 16 }}>Resultados: {matches.length} matches encontrados</h3>
            {matches.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <i className="ti ti-layers-subtract"></i>
                <p>Nenhuma correspondência encontrada entre os arquivos carregados.</p>
              </div>
            ) : (
              matches.map((m, i) => (
                <div key={i} className="stat-box" style={{ padding: 18, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                    {m.by === 'placa' ? <><i className="ti ti-car" style={{color: 'var(--text-muted)', marginRight: 6}}></i>Placa: {m.key}</> : <><i className="ti ti-user" style={{color: 'var(--text-muted)', marginRight: 6}}></i>Motorista: {m.key}</>}
                  </div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div className="stat-label">{leftName} <span style={{ textTransform: 'lowercase' }}>({m.left.length} ocorrências)</span></div>
                      {m.left.map((ev, j) => (
                        <div key={j} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.driverRaw || ev.plateRaw}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, background: 'var(--surface-1)', padding: '2px 8px', borderRadius: 4 }}>{ev.severityRaw || 'Sem criticidade'}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div style={{ flex: 1 }}>
                      <div className="stat-label">{rightName} <span style={{ textTransform: 'lowercase' }}>({m.right.length} ocorrências)</span></div>
                      {m.right.map((ev, j) => (
                        <div key={j} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.driverRaw || ev.plateRaw}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, background: 'var(--surface-1)', padding: '2px 8px', borderRadius: 4 }}>{ev.severityRaw || 'Sem criticidade'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
