import { useState, useEffect, useMemo } from 'react';
import { useAtendimentos } from '../hooks/useAtendimentos';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts';

const COLORS = ['#0C447C', '#D14343', '#F59E0B', '#10B981', '#6366F1'];

export default function Analytics() {
  const { loadByRange } = useAtendimentos();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      const d = new Date();
      const end = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() - 30);
      const start = d.toISOString().slice(0, 10);
      
      const { data: res } = await loadByRange(start, end);
      if (res) setData(res);
      setLoading(false);
    }
    fetchAnalytics();
  }, [loadByRange]);

  const { topDrivers, topTransp, timeSeries } = useMemo(() => {
    if (!data.length) return { topDrivers: [], topTransp: [], timeSeries: [] };

    // Apenas intervenções reais para métricas de reincidência
    const intervs = data.filter(d => d.tipo === 'intervencao');

    // Agrupar por Motorista
    const driverMap = {};
    intervs.forEach(d => {
      const name = d.motorista || 'Desconhecido';
      driverMap[name] = (driverMap[name] || 0) + 1;
    });
    const topDrivers = Object.entries(driverMap)
      .map(([name, count]) => ({ name: name.split(' ')[0] + ' ' + (name.split(' ')[1] || ''), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Agrupar por Transportadora
    const transpMap = {};
    intervs.forEach(d => {
      const transp = d.transportadora || 'Não informada';
      transpMap[transp] = (transpMap[transp] || 0) + 1;
    });
    const topTransp = Object.entries(transpMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Agrupar por Dia (Últimos 14 dias)
    const timeMap = {};
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const str = date.toISOString().slice(0, 10);
      const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      timeMap[str] = { name: label, intervs: 0, descartes: 0 };
    }

    data.forEach(d => {
      const dateStr = d.created_at?.slice(0, 10);
      if (timeMap[dateStr]) {
        if (d.tipo === 'intervencao') timeMap[dateStr].intervs++;
        else if (d.tipo === 'descarte') timeMap[dateStr].descartes++;
      }
    });

    const timeSeries = Object.values(timeMap);

    return { topDrivers, topTransp, timeSeries };
  }, [data]);

  if (loading) {
    return (
      <div className="empty-state">
        <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 32 }}></i>
        <div style={{ marginTop: 12 }}>Carregando dados (últimos 30 dias)...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Analytics da Operação</h2>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Análise de reincidência e volume dos últimos 30 dias</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Gráfico de Reincidência (Motoristas) */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <i className="ti ti-steering-wheel"></i>
              Top 10 Motoristas Reincidentes
            </div>
          </div>
          <div style={{ height: 300, padding: 16 }}>
            {topDrivers.length === 0 ? (
              <div className="empty-state" style={{ height: '100%', padding: 0 }}>Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDrivers} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--text-muted)" />
                  <YAxis dataKey="name" type="category" width={100} stroke="var(--text-primary)" fontSize={11} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)' }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Bar dataKey="count" name="Intervenções" fill="var(--danger-500)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gráfico de Transportadoras */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <i className="ti ti-building-community"></i>
              Top 5 Transportadoras (Alertas)
            </div>
          </div>
          <div style={{ height: 300, padding: 16 }}>
             {topTransp.length === 0 ? (
              <div className="empty-state" style={{ height: '100%', padding: 0 }}>Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topTransp}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                    style={{ fontSize: 11 }}
                  >
                    {topTransp.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
             )}
          </div>
        </div>
      </div>

      {/* Gráfico de Tendência (Tempo) */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <i className="ti ti-chart-line"></i>
            Evolução de Eventos (Últimos 14 Dias)
          </div>
        </div>
        <div style={{ height: 300, padding: 16 }}>
           <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)' }}
              />
              <Legend verticalAlign="top" height={36}/>
              <Line type="monotone" dataKey="intervs" name="Intervenções" stroke="var(--danger-500)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="descartes" name="Descartes" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
