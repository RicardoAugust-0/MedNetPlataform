const INTERVENCAO_EVENTOS = ['Bocejo', 'Olho fechado'];
const TECNICO_CAT         = 'Obstrução de Câmera';

function parseTurno(horaStr) {
  if (!horaStr) return 'diurno';
  const parts = String(horaStr).split(' ');
  const timePart = parts[1] || parts[0];
  const hour = parseInt(timePart?.split(':')[0], 10);
  if (isNaN(hour)) return 'diurno';
  // Diurno 06–18h, Noturno 18–06h
  return (hour >= 6 && hour < 18) ? 'diurno' : 'noturno';
}

function maxSeveridade(severidades) {
  if (severidades.includes('Gravíssimo')) return 'Gravíssimo';
  if (severidades.includes('Grave'))      return 'Grave';
  return 'Normal';
}

export async function parseSheetFile(file) {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);

        // Remove falsos positivos
        const valid = rows.filter(r => r['Status'] !== 'Falso positivo');

        // Agrupar por Placa
        const byPlaca = {};
        valid.forEach(r => {
          const placa = r['Placa'];
          if (!placa) return;
          if (!byPlaca[placa]) {
            byPlaca[placa] = {
              nome:            '',
              placa,
              transportadora:  r['Transportadora'] || '—',
              eventos:         [],
              turnos:          [],
            };
          }
          const entry = byPlaca[placa];
          if (entry.nome === '' && r['Motorista'] && r['Motorista'] !== '-') {
            entry.nome = r['Motorista'];
          }
          entry.eventos.push(r);
          entry.turnos.push(parseTurno(r['Hora do evento']));
        });

        // Montar objetos de motorista
        const drivers = Object.values(byPlaca).map(d => {
          const isIntervencao = e => INTERVENCAO_EVENTOS.includes(e['Evento']);
          const isTecnico     = e => e['Categoria'] === TECNICO_CAT;
          const isReportar    = e => !isIntervencao(e) && !isTecnico(e);

          const evIntervencao = d.eventos.filter(isIntervencao);
          const evReportar    = d.eventos.filter(isReportar);
          const evTecnico     = d.eventos.filter(isTecnico);

          const tiposIntervencao = [...new Set(evIntervencao.map(e => e['Evento']))];
          const tiposReportar    = [...new Set(evReportar.map(e => e['Evento']))];

          const severidadeMax = maxSeveridade(
            [...evIntervencao, ...evReportar].map(e => e['Severidade'])
          );

          // Turno predominante
          const turnoCount = {};
          d.turnos.forEach(t => { turnoCount[t] = (turnoCount[t] || 0) + 1; });
          const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diurno';

          return {
            nome:            d.nome || d.placa,
            placa:           d.placa,
            transportadora:  d.transportadora,
            turno,
            // Intervenção (Bocejo + Olho fechado)
            alertas:         evIntervencao.length,
            tipos:           tiposIntervencao,
            // Reportar à empresa
            reportaveis:     evReportar.length,
            tiposReportar,
            // Técnicos (Obstrução de Câmera)
            tecnicos:        evTecnico.length,
            severidade:      severidadeMax,
            intervencoes:    0,
          };
        });

        const stats = {
          total:            drivers.length,
          comIntervencao:   drivers.filter(d => d.alertas > 0).length,
          soReportar:       drivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length,
          soTecnico:        drivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
          totalEventos:     valid.length,
          falsosPositivos:  rows.length - valid.length,
        };

        resolve({ drivers, stats });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
