export default function Pagination({ page, totalPages, onPageChange, totalCount, style }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16, ...style }}>
      <button className="btn btn-sm" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
        <i className="ti ti-chevron-left"></i>
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Página {page} de {totalPages}{totalCount != null ? ` · ${totalCount} registro${totalCount !== 1 ? 's' : ''}` : ''}
      </span>
      <button className="btn btn-sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Próxima página">
        <i className="ti ti-chevron-right"></i>
      </button>
    </div>
  );
}
