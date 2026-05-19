// DEV mocks — stripped automaticamente pelo Vite em produção (import.meta.env.DEV = false).
// Drivers e histórico fictícios usados quando o app roda em dev sem dados reais.

const _now = new Date();
const _iso = (m = 0) => new Date(_now.getTime() - m * 60000).toISOString();

const _MOTS = [
  { n: 'Carlos Eduardo Santos',    p: 'ABC-1234', t: 'Transportes Brasil Ltda'  },
  { n: 'Marcos Paulo Lima',         p: 'DEF-5678', t: 'LogBrasil Ltda'           },
  { n: 'José Antônio Ferreira',     p: 'GHI-9012', t: 'Transportes Brasil Ltda'  },
  { n: 'Roberto Silva Souza',       p: 'JKL-3456', t: 'Fast Cargo Express'        },
  { n: 'Anderson Rodrigues Costa',  p: 'MNO-7890', t: 'LogBrasil Ltda'            },
  { n: 'Leandro Costa Pinto',       p: 'PQR-1234', t: 'NorteLogística SA'         },
  { n: 'Fábio Nascimento Silva',    p: 'STU-5555', t: 'Sul Express Ltda'          },
  { n: 'Ricardo Barbosa Lima',      p: 'VWX-9999', t: 'Atlântica Cargo'           },
  { n: 'Thiago Pereira Gomes',      p: 'YZA-1357', t: 'Prime Logística'           },
  { n: 'Diego Ferreira Santos',     p: 'BCD-2468', t: 'RodriBrasil'               },
];

const _TRANSP = [
  'Transportes Brasil Ltda', 'LogBrasil Ltda', 'Fast Cargo Express',
  'NorteLogística SA', 'Sul Express Ltda', 'Atlântica Cargo', 'Prime Logística', 'RodriBrasil',
];

const _TIPOS_A = ['Bocejo', 'Olho fechado', 'Sonolência', 'Distração Genérica'];

const _OP_DIST = [
  { nome: 'Ana Oliveira', i: 8,  d: 85, r: 24 },
  { nome: 'João Mendes',  i: 6,  d: 72, r: 20 },
  { nome: 'Maria Santos', i: 5,  d: 61, r: 16 },
  { nome: 'Pedro Alves',  i: 4,  d: 50, r: 13 },
  { nome: 'Carla Reis',   i: 3,  d: 38, r: 10 },
  { nome: 'Lucas Moura',  i: 2,  d: 28, r:  8 },
];

function _buildHistory() {
  const out = [];
  let seq = 0;
  _OP_DIST.forEach(({ nome, i: iv, d: dc, r: rp }) => {
    [['intervencao', iv], ['descarte', dc], ['reportar', rp]].forEach(([tipo, count]) => {
      for (let k = 0; k < count; k++) {
        const m      = _MOTS[seq % _MOTS.length];
        const minAgo = (seq * 1.1) % 479;
        const hh     = String(8 + (minAgo / 60 | 0)).padStart(2, '0');
        const mm     = String((seq * 7) % 60).padStart(2, '0');
        out.push({
          id: `h${++seq}`, motorista: m.n, placa: m.p, transportadora: m.t,
          operador: nome, tipo, obs: '', hora: `${hh}:${mm}`, created_at: _iso(minAgo),
        });
      }
    });
  });
  return out;
}

function _buildDrivers() {
  const named = [
    { nome: 'Carlos Eduardo Santos',    placa: 'ABC-1234', t: 'Transportes Brasil Ltda', a: 9, tipos: ['Bocejo', 'Olho fechado'],  sev: 'Gravíssimo', minAgo: 48 },
    { nome: 'Marcos Paulo Lima',         placa: 'DEF-5678', t: 'LogBrasil Ltda',          a: 8, tipos: ['Sonolência'],              sev: 'Gravíssimo', minAgo: 35 },
    { nome: 'José Antônio Ferreira',     placa: 'GHI-9012', t: 'Transportes Brasil Ltda', a: 7, tipos: ['Bocejo'],                  sev: 'Gravíssimo', minAgo: 22 },
    { nome: 'Fábio Nascimento Silva',    placa: 'STU-5555', t: 'Sul Express Ltda',         a: 7, tipos: ['Olho fechado'],            sev: 'Gravíssimo', minAgo: 18 },
    { nome: 'Ricardo Barbosa Lima',      placa: 'VWX-9999', t: 'Atlântica Cargo',          a: 6, tipos: ['Sonolência'],              sev: 'Grave',      minAgo: 14 },
    { nome: 'Roberto Silva Souza',       placa: 'JKL-3456', t: 'Fast Cargo Express',       a: 6, tipos: ['Distração Genérica'],     sev: 'Grave',      minAgo: 11 },
    { nome: 'Anderson Rodrigues Costa',  placa: 'MNO-7890', t: 'LogBrasil Ltda',           a: 5, tipos: ['Bocejo'],                  sev: 'Grave',      minAgo: 8  },
    { nome: 'Thiago Pereira Gomes',      placa: 'YZA-1357', t: 'Prime Logística',          a: 5, tipos: ['Sonolência'],              sev: 'Grave',      minAgo: 5  },
  ];
  const rest = Array.from({ length: 60 }, (_, i) => ({
    nome:  `Motorista ${i + 9}`,
    placa: `Z${String.fromCharCode(65 + i % 26)}X-${String((i * 137 + 1000) % 9000 + 1000).slice(-4)}`,
    t:     _TRANSP[i % _TRANSP.length],
    a:     Math.max(1, 4 - (i / 15 | 0)),
    tipos: [_TIPOS_A[i % 4]],
    sev:   'Normal',
    minAgo: (i * 3) % 60,
  }));

  return [...named, ...rest].map((d, idx) => ({
    nome:           d.nome,
    placa:          d.placa,
    transportadora: d.t,
    frota:          `F${String(idx + 1).padStart(3, '0')}`,
    turno:          idx % 3 === 0 ? 'noturno' : 'diurno',
    alertas:        d.a,
    tipos:          d.tipos,
    ultimoEvento:   _iso(d.minAgo || 0),
    reportaveis:    Math.max(0, d.a - 2),
    tiposReportar:  d.a > 2 ? ['Distração'] : [],
    ultimoEventoReportar: d.a > 2 ? _iso(d.minAgo || 0) : null,
    tecnicos:       0,
    tiposTecnico:   {},
    eventosDetalhados: d.tipos ? d.tipos.map((t, ei) => ({
      hora:       `${String(9 + ei).padStart(2,'0')}:${String(ei * 12).padStart(2,'0')}`,
      tipo:       t,
      severidade: d.sev || 'Normal',
    })) : [],
    severidade:     d.sev || 'Normal',
  }));
}

export const MOCK_DRIVERS = import.meta.env.DEV ? _buildDrivers() : [];
export const MOCK_HISTORY = import.meta.env.DEV ? _buildHistory() : [];
