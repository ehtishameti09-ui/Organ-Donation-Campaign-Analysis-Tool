import { useEffect, useRef, useState } from 'react';

/**
 * Shared windowed document viewer used across every account type.
 * Controls: minimize / restore / fullscreen / close, plus (for images) zoom
 * in/out, hand-drag panning, and a draggable window (drag by the header).
 * Self-resolves the file from inline base64 (`doc.data`) or a secure API
 * `doc.url` (fetched with the auth token).
 *
 * Usage:
 *   const [viewerDoc, setViewerDoc] = useState(null);
 *   {viewerDoc && <DocumentViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} />}
 */
const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
const STEP = 0.25;

const DocumentViewer = ({ doc, onClose }) => {
  const [mode, setMode] = useState('normal'); // 'normal' | 'fullscreen' | 'minimized'
  const [src, setSrc] = useState(doc?.data || doc?._resolvedUrl || null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const objectUrlRef = useRef(null);

  // Image zoom + pan
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Draggable window position
  const [win, setWin] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, wx: 0, wy: 0 });

  const mime =
    doc?.mimeType ||
    doc?.type ||
    (/\.pdf$/i.test(doc?.name || '') ? 'application/pdf'
      : /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(doc?.name || '') ? 'image/*' : '');
  const isImage = mime.startsWith('image/');

  // Resolve the file once per document.
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (doc?.data || doc?._resolvedUrl) { setSrc(doc.data || doc._resolvedUrl); return; }
    if (!doc?.url) { setError('This document has no source to preview.'); return; }

    setLoading(true);
    (async () => {
      try {
        const token = localStorage.getItem('odcat_token');
        const r = await fetch(doc.url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!r.ok) throw new Error(`Could not load document (${r.status})`);
        const blobUrl = URL.createObjectURL(await r.blob());
        if (cancelled) { URL.revokeObjectURL(blobUrl); return; }
        objectUrlRef.current = blobUrl;
        setSrc(blobUrl);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load document.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    };
  }, [doc]);

  // Reset zoom / pan / window position whenever the document changes.
  useEffect(() => { setScale(1); setPan({ x: 0, y: 0 }); setWin({ x: 0, y: 0 }); }, [doc]);

  // Global listeners: Esc to close, and mouse move/up for panning + window drag.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onMove = (e) => {
      if (panning.current) {
        setPan({ x: panStart.current.px + (e.clientX - panStart.current.x), y: panStart.current.py + (e.clientY - panStart.current.y) });
      } else if (dragging.current) {
        setWin({ x: dragStart.current.wx + (e.clientX - dragStart.current.x), y: dragStart.current.wy + (e.clientY - dragStart.current.y) });
      }
    };
    const onUp = () => { panning.current = false; dragging.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onClose]);

  if (!doc) return null;

  const zoomIn = () => setScale(s => Math.min(MAX_SCALE, +(s + STEP).toFixed(2)));
  const zoomOut = () => setScale(s => { const n = Math.max(MIN_SCALE, +(s - STEP).toFixed(2)); if (n <= 1) setPan({ x: 0, y: 0 }); return n; });

  const onWheel = (e) => {
    if (!isImage) return;
    if (e.deltaY < 0) zoomIn(); else zoomOut();
  };
  // Double-click toggles between fit (100%) and zoomed-in.
  const toggleZoom = () => {
    if (!isImage) return;
    setScale(s => { if (s > 1) { setPan({ x: 0, y: 0 }); return 1; } return 2.5; });
  };
  const startPan = (e) => {
    if (!isImage || scale <= 1) return;
    e.preventDefault();
    panning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const startWinDrag = (e) => {
    if (mode === 'fullscreen') return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
  };
  const stop = (e) => e.stopPropagation();

  const download = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src; a.download = doc.name || 'document'; a.click();
  };

  // ---- Minimized: small docked bar bottom-right ----
  if (mode === 'minimized') {
    return (
      <div style={{
        position: 'fixed', bottom: '20px', right: '20px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '320px', zIndex: 9999,
      }}>
        <span style={{ fontSize: '18px' }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Document Preview · minimized</div>
        </div>
        <button type="button" className="btn btn-xs btn-ghost" title="Restore" onClick={() => setMode('normal')} style={{ padding: '4px 8px' }}>▢</button>
        <button type="button" className="btn btn-xs btn-ghost" title="Close" onClick={onClose} style={{ padding: '4px 8px' }}>×</button>
      </div>
    );
  }

  const isFs = mode === 'fullscreen';

  return (
    <div className="modal-overlay show">
      <div
        className="modal"
        style={isFs
          ? { maxWidth: '100vw', maxHeight: '100vh', width: '100vw', height: '100vh', borderRadius: 0 }
          : { maxWidth: '820px', maxHeight: '85vh', transform: `translate(${win.x}px, ${win.y}px)` }}
      >
        {/* Header doubles as the window drag handle */}
        <div className="modal-header" style={{ cursor: isFs ? 'default' : 'move', userSelect: 'none' }} onMouseDown={startWinDrag}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Document Preview
            {!isFs && <span style={{ fontSize: '11px', fontWeight: '400', color: 'var(--text3)' }}>· drag header to move</span>}
          </h3>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onMouseDown={stop}>
            {isImage && (
              <>
                <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text2)', minWidth: '44px', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
                <span style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
              </>
            )}
            <button className="modal-close" title="Minimize" onClick={() => setMode('minimized')} style={{ fontSize: '18px' }}>−</button>
            <button className="modal-close" title={isFs ? 'Restore' : 'Fullscreen'} onClick={() => setMode(isFs ? 'normal' : 'fullscreen')} style={{ fontSize: '14px' }}>{isFs ? '🗗' : '⛶'}</button>
            <button className="modal-close" title="Close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ background: 'var(--surface2)', padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
            <div style={{ fontWeight: '600', marginBottom: '2px', wordBreak: 'break-word' }}>{doc.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
              {((doc.size || 0) / 1024 / 1024).toFixed(2)} MB • {mime || 'unknown'}
              {isImage && <span> • double-click or scroll to zoom · drag to pan when zoomed</span>}
            </div>
          </div>

          <div
            onWheel={onWheel}
            onMouseDown={startPan}
            onDoubleClick={toggleZoom}
            style={{
              flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface3)', minHeight: isFs ? '0' : '420px',
              cursor: isImage && scale > 1 ? 'grab' : 'default',
            }}
          >
            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: '13px' }}>Loading…</div>
            ) : error ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
                <div>{error}</div>
              </div>
            ) : isImage ? (
              <img
                src={src} alt={doc.name} draggable={false}
                style={{
                  maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transition: panning.current ? 'none' : 'transform .08s',
                  willChange: 'transform',
                }}
              />
            ) : mime === 'application/pdf' ? (
              <iframe src={src} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                <div>Preview not available for this file type</div>
                <div style={{ fontSize: '12px', marginTop: '8px' }}>Please download to view</div>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface2)', padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" onClick={download} disabled={!src}>⬇ Download</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
