import { useState } from 'react';
import { useApp } from '../context';
import { applyAccent } from '../utils';

const ACCENTS = [
  { id:'vinho', color:'#9E1A45', label:'MedNet' },
  { id:'roxo',  color:'#7C5CFF', label:'Roxo' },
  { id:'azul',  color:'#3F76C2', label:'Azul' },
  { id:'verde', color:'#2DA75A', label:'Verde' },
  { id:'ambar', color:'#E8A020', label:'Âmbar' },
  { id:'rosa',  color:'#E2548E', label:'Rosa' },
];

function Segment({ label, group, options, value, onChange }) {
  return (
    <div className="tweaks-row">
      <div className="tweaks-label">{label}</div>
      <div className="tweaks-segment">
        {options.map(o => (
          <button
            key={o.v}
            className={'tweaks-seg-btn' + (value === o.v ? ' active' : '')}
            title={o.title}
            onClick={() => onChange(o.v)}
          >
            {o.icon && <i className={`ti ${o.icon}`}></i>} {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme, density, setDensity, accent, setAccent, mode, setMode, vibe, setVibe, rhythm, setRhythm } = useApp();

  const handleAccent = (a) => {
    setAccent(a.id);
    applyAccent(a.id);
  };

  return (
    <>
      <button className="tweaks-fab" title="Tweaks" onClick={() => setOpen(o => !o)}>
        <i className="ti ti-adjustments-alt"></i>
      </button>

      {open && (
        <div className="tweaks-panel open">
          <div className="tweaks-header">
            <div className="tweaks-title">Tweaks</div>
            <button className="btn-icon" onClick={() => setOpen(false)}>
              <i className="ti ti-x"></i>
            </button>
          </div>

          <Segment label="Modo de operação" value={mode} onChange={setMode} options={[
            { v:'pleno',   label:'Pleno',   title:'Equilibrado' },
            { v:'plantao', label:'Plantão', title:'Alertas explosivos' },
            { v:'foco',    label:'Foco',    title:'Monocromático' },
          ]} />

          <Segment label="Personalidade visual" value={vibe} onChange={setVibe} options={[
            { v:'sobrio',    label:'Sóbrio',    title:'Institucional' },
            { v:'editorial', label:'Editorial', title:'Bordas marcadas' },
            { v:'pulse',     label:'Pulse',     title:'Halos, glow' },
          ]} />

          <Segment label="Ritmo do dashboard" value={rhythm} onChange={setRhythm} options={[
            { v:'operacional', label:'Op.',      title:'2:1 padrão' },
            { v:'compacto',    label:'Compacto', title:'Strip horizontal' },
            { v:'cinema',      label:'Cinema',   title:'Hero dominante' },
          ]} />

          <hr className="divider" style={{ margin: '14px 0' }} />

          <Segment label="Tema" value={theme} onChange={setTheme} options={[
            { v:'light', label:'Claro',  icon:'ti-sun' },
            { v:'dark',  label:'Escuro', icon:'ti-moon' },
          ]} />

          <Segment label="Densidade" value={density} onChange={setDensity} options={[
            { v:'compact', label:'Compacta' },
            { v:'normal',  label:'Normal' },
            { v:'cozy',    label:'Espaçada' },
          ]} />

          <div className="tweaks-row" style={{ marginBottom: 0 }}>
            <div className="tweaks-label">Cor de destaque</div>
            <div className="tweaks-swatches">
              {ACCENTS.map(a => (
                <div
                  key={a.id}
                  className={'tweaks-swatch' + (accent === a.id ? ' active' : '')}
                  style={{ background: a.color }}
                  title={a.label}
                  onClick={() => handleAccent(a)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
