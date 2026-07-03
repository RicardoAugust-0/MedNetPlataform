export default function DataTable({ columns, rows, rowKey = (row, i) => row.id ?? i, style, fontSize = 12.5 }) {
  return (
    <div style={{ overflowX: 'auto', ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
            {columns.map(col => (
              <th key={col.key} style={{ padding: 8, textAlign: col.align || 'left', ...col.headerStyle }}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.02))' }}>
              {columns.map(col => (
                <td key={col.key} style={{ padding: 8, textAlign: col.align || 'left', ...col.cellStyle }}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
