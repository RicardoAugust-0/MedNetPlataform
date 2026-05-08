export function iniciais(n) {
  return (n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
}

export function fmtDate(d = new Date()) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtTime(d = new Date()) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function nowTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const ACCENT_VARIANTS = {
  vinho: { 500:'#9E1A45', 600:'#7A1235', 700:'#5A0F25', 800:'#350A16', 900:'#1A0308', 100:'#FAE8EE', 50:'#FDF3F7', 400:'#C24A6A', 300:'#E09AB5', glow:'rgba(158,26,69,0.28)' },
  roxo:  { 500:'#7C5CFF', 600:'#5B47B8', 700:'#3A2E70', 800:'#251D48', 900:'#1A1530', 100:'#EDE7FF', 50:'#F6F3FF', 400:'#9B82FF', 300:'#C0B0FF', glow:'rgba(124,92,255,0.25)' },
  azul:  { 500:'#3F76C2', 600:'#2A5BA1', 700:'#1A3361', 800:'#112442', 900:'#0A1A2E', 100:'#DCEBFA', 50:'#EEF6FD', 400:'#6CA3DD', 300:'#9CC4E8', glow:'rgba(63,118,194,0.25)' },
  verde: { 500:'#2DA75A', 600:'#1F7A3D', 700:'#155028', 800:'#0E371B', 900:'#082313', 100:'#DCF1E3', 50:'#EFFAF3', 400:'#5BC082', 300:'#92D5AB', glow:'rgba(45,167,90,0.25)' },
  ambar: { 500:'#E8A020', 600:'#B26508', 700:'#7E4805', 800:'#5A3304', 900:'#3D2402', 100:'#FAEEDA', 50:'#FCF6E9', 400:'#F0BC56', 300:'#F4D08A', glow:'rgba(232,160,32,0.28)' },
  rosa:  { 500:'#E2548E', 600:'#B73A6F', 700:'#852550', 800:'#5C1A38', 900:'#3D1124', 100:'#FBE3EE', 50:'#FCF1F6', 400:'#EC85AE', 300:'#F2A8C5', glow:'rgba(226,84,142,0.25)' },
};

export function applyAccent(accentId) {
  const v = ACCENT_VARIANTS[accentId];
  if (!v) return;
  const r = document.documentElement;
  Object.entries(v).forEach(([k, val]) => r.style.setProperty(`--accent-${k}`, val));
}
