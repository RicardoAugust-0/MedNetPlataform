import renderMarkdown from './renderMarkdown.js';
import { useToast } from '../../../hooks/useToast';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LineChart, Line,
  PieChart, Pie
} from 'recharts';

function ReportChart({ chart }) {
  if (!chart) return null;
  return (
    <div className="card" style={{ marginTop: 20, padding: 18, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>{chart.title}</h4>
      {chart.subtitle && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{chart.subtitle}</p>}
      <div style={{ width: '100%', height: 220, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          {chart.chartType === 'bar' && (
            <BarChart data={chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis dataKey={chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
              <YAxis stroke="var(--text-muted)" fontSize={10} />
              <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
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
              <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey={chart.yAxisKey || 'value'} stroke="var(--accent-500)" strokeWidth={2} />
            </LineChart>
          )}
          {chart.chartType === 'pie' && (
            <PieChart>
              <Pie
                data={chart.data}
                dataKey={chart.yAxisKey || 'value'}
                nameKey={chart.xAxisKey || 'name'}
                cx="50%" cy="50%"
                outerRadius={65}
                fill="var(--accent-500)"
                label={{ fontSize: 9 }}
              >
                {chart.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || `hsl(var(--accent-h), var(--accent-s), ${40 + index * 12}%)`} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AiReportModal({ report, onClose }) {
  const toast = useToast();
  if (!report) return null;

  return (
    <div className="ai-report-overlay">
      <div className="ai-report-modal">
        <div className="ai-report-modal-header">
          <div className="title">
            <i className="ti ti-file-text" />
            {report.title}
          </div>
          <button className="btn btn-icon-only btn-ghost" onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="ai-report-modal-body ai-custom-scroll">
          <div
            style={{ fontSize: 13.5, lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report.content) }}
          />
          <ReportChart chart={report.chart_payload} />
        </div>

        <div className="ai-report-modal-footer">
          <button
            className="btn btn-ghost"
            onClick={() => {
              navigator.clipboard.writeText(report.content);
              toast('Texto do relatório copiado!', 'success');
            }}
          >
            <i className="ti ti-copy" /> Copiar Texto
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
