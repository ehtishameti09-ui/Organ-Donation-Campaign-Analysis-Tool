/**
 * Lightweight client-side pagination control.
 * Use with usePagination() hook below to slice arrays cleanly.
 */
import { useMemo, useState } from 'react';

export const usePagination = (items, pageSize = 10) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / pageSize));

  // If items shrink below current page, snap back to last valid page
  const safePage = Math.min(page, totalPages);

  const slice = useMemo(() => {
    if (!items) return [];
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    setPage,
    pageSize,
    totalPages,
    total: items?.length || 0,
    slice,
  };
};

const Pagination = ({ page, setPage, totalPages, total, pageSize, label = 'items' }) => {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Show ≤ 7 page buttons; ellipsis when overflow
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 4) pages.push('…');
    const around = [page - 1, page, page + 1].filter(p => p > 1 && p < totalPages);
    pages.push(...around);
    if (page < totalPages - 3) pages.push('…');
    pages.push(totalPages);
  }

  const btnStyle = (active = false, disabled = false) => ({
    padding: '5px 10px',
    minWidth: '32px',
    border: '1px solid var(--border)',
    background: active ? 'var(--primary)' : disabled ? 'var(--surface2)' : 'var(--surface)',
    color: active ? 'white' : disabled ? 'var(--text3)' : 'var(--text2)',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: active ? '700' : '500',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: '12px',
      flexWrap: 'wrap',
      gap: '10px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
        Showing <strong>{start}</strong>–<strong>{end}</strong> of <strong>{total}</strong> {label}
      </div>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button style={btnStyle(false, page === 1)} disabled={page === 1} onClick={() => setPage(page - 1)}>
          ‹ Prev
        </button>
        {pages.map((p, i) => (
          p === '…' ? (
            <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--text3)', fontSize: '12px' }}>…</span>
          ) : (
            <button key={p} style={btnStyle(p === page)} onClick={() => setPage(p)}>{p}</button>
          )
        ))}
        <button style={btnStyle(false, page === totalPages)} disabled={page === totalPages} onClick={() => setPage(page + 1)}>
          Next ›
        </button>
      </div>
    </div>
  );
};

export default Pagination;
