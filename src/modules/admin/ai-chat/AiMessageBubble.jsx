import RobotIcon from './RobotIcon.jsx';
import renderMarkdown from './renderMarkdown.js';
import StreamedText from '../../../components/StreamedText.jsx';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LineChart, Line,
  PieChart, Pie
} from 'recharts';

function InlineChart({ chart }) {
  if (!chart) return null;
  return (
    <div className="ai-chart-box">
      <h4 className="chart-title">{chart.title}</h4>
      {chart.subtitle && <p className="chart-sub">{chart.subtitle}</p>}
      <div style={{ width: '100%', height: 180, marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          {chart.chartType === 'bar' && (
            <BarChart data={chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis dataKey={chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={9.5} />
              <YAxis stroke="var(--text-muted)" fontSize={9.5} />
              <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10.5 }} />
              <Bar dataKey={chart.yAxisKey || 'value'} radius={[3, 3, 0, 0]}>
                {chart.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || 'var(--accent-500)'} />
                ))}
              </Bar>
            </BarChart>
          )}
          {chart.chartType === 'line' && (
            <LineChart data={chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis dataKey={chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={9.5} />
              <YAxis stroke="var(--text-muted)" fontSize={9.5} />
              <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10.5 }} />
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
                outerRadius={50}
                fill="var(--accent-500)"
                label={{ fontSize: 8.5 }}
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

export default function AiMessageBubble({ message, onSaveReport }) {
  const isUser = message.role === 'user';

  return (
    <div className={`ai-msg-row ${message.role}`}>
      {/* Avatar */}
      <div className={`ai-msg-avatar ${isUser ? 'human' : 'bot'}`}>
        {isUser
          ? <i className="ti ti-user" />
          : <RobotIcon size={20} />
        }
      </div>

      {/* Content */}
      <div className="ai-msg-body">
        <div className={isUser ? 'ai-bubble-user' : 'ai-bubble-assistant'}>
          {isUser ? (
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{message.text}</p>
          ) : (
            <StreamedText text={message.text} active={!!message.streaming} renderHtml={renderMarkdown} />
          )}
        </div>

        <InlineChart chart={message.chart} />

        {!isUser && onSaveReport && (
          <div className="ai-msg-actions">
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => onSaveReport(message)}
            >
              <i className="ti ti-device-floppy" /> Salvar na Galeria
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
