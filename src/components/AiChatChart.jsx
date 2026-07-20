import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
} from 'recharts';

export default function AiChatChart({ chart }) {
  if (!chart?.chartType) return null;

  return (
    <div className="ai-chart-container">
      <h4 className="chart-title">{chart.title}</h4>
      {chart.subtitle && <p className="chart-sub">{chart.subtitle}</p>}
      <div style={{ width: '100%', height: 200, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          {chart.chartType === 'bar' && (
            <BarChart data={chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis dataKey={chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
              <YAxis stroke="var(--text-muted)" fontSize={10} />
              <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
              <Bar dataKey={chart.yAxisKey || 'value'} radius={[3, 3, 0, 0]}>
                {chart.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || 'var(--accent-500)'} />
                ))}
              </Bar>
            </BarChart>
          )}
          {chart.chartType === 'line' && (
            <LineChart data={chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis dataKey={chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
              <YAxis stroke="var(--text-muted)" fontSize={10} />
              <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
              <Line type="monotone" dataKey={chart.yAxisKey || 'value'} stroke="var(--accent-500)" strokeWidth={2} activeDot={{ r: 4 }} />
            </LineChart>
          )}
          {chart.chartType === 'pie' && (
            <PieChart>
              <Pie
                data={chart.data}
                dataKey={chart.yAxisKey || 'value'}
                nameKey={chart.xAxisKey || 'name'}
                cx="50%"
                cy="50%"
                outerRadius={60}
                fill="var(--accent-500)"
                label={{ fontSize: 9 }}
              >
                {chart.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || `hsl(var(--accent-h), var(--accent-s), ${40 + index * 12}%)`} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
