import { useState } from 'react';

/**
 * Collapsible "How this works" guide. Designed for inline help inside any tab/page.
 * Pass content as children. Defaults closed so repeat users aren't blocked.
 */
const HelpPanel = ({ title = 'How this works', icon = '💡', defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      marginBottom: '14px',
      border: '1px solid #c8dcf3',
      borderRadius: '8px',
      borderLeft: '3px solid #1a5c9e',
      background: '#f5f9ff',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '600',
          color: '#1a5c9e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{icon} {title}</span>
        <span style={{ fontSize: '11px', opacity: 0.7 }}>{open ? '▴ Hide' : '▾ Show'}</span>
      </button>
      {open && (
        <div style={{
          padding: '4px 18px 16px',
          fontSize: '13px',
          lineHeight: '1.65',
          color: 'var(--text2)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
};

export default HelpPanel;
