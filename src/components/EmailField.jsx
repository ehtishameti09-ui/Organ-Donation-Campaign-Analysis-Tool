import { useMemo } from 'react';
import { validateEmail, suggestEmailFix } from '../utils/auth';

/**
 * Shared live email validation for every email input across the site.
 *
 *   const emailCheck = useEmailField(value);
 *   <input style={{ ...emailCheck.borderStyle }} ... />
 *   <EmailFieldError check={emailCheck} onAccept={setEmail} />
 *
 * Each call site keeps its own <input> markup so layouts (icons, grids,
 * side buttons) stay intact; we only contribute the border colour, the
 * specific error message, and a "Did you mean ...?" suggestion when the
 * domain looks like a typo of a well-known provider.
 *
 * The validation rule is "accept anything that isn't a typo of a recognized
 * provider", so legitimate hospital/edu/company domains (@aku.edu,
 * @cmh.com.pk, @mycompany.com, etc.) work normally, while @ggmail.com,
 * @yaho.com, @1234gmail.com, etc. are rejected with a "Did you mean…?" link.
 */
export const useEmailField = (value) => {
  const check = useMemo(() => validateEmail(value), [value]);
  const dirty = !!value && String(value).length > 0;
  const suggestion = useMemo(() => {
    if (!dirty || !String(value).includes('@')) return null;
    return suggestEmailFix(value);
  }, [dirty, value]);
  const borderStyle = !dirty
    ? {}
    : {
        borderColor: check.ok ? 'var(--accent)' : 'var(--danger)',
        borderWidth: '1.5px',
      };
  return { ok: check.ok, error: check.error, dirty, borderStyle, suggestion, hasSuggestion: !!suggestion };
};

/**
 * Error / suggestion shown beneath an email input.
 * Shows the format error (if any) plus a "Did you mean…?" prompt with a
 * click-to-accept link when the domain looks like a typo of a known provider.
 */
export const EmailFieldError = ({ check, onAccept }) => {
  if (!check || !check.dirty) return null;

  return (
    <>
      {!check.ok && (
        <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>
          {check.error}{' '}
          <span style={{ color: 'var(--text3)' }}>
            Example: <strong>ali.hassan@example.com</strong>
          </span>
        </div>
      )}
      {check.suggestion && (
        <div style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '4px' }}>
          Did you mean <strong>{check.suggestion}</strong>?
          {onAccept && (
            <button type="button"
              onClick={() => onAccept(check.suggestion)}
              style={{ marginLeft: '8px', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '11px', fontWeight: '700', textDecoration: 'underline', padding: 0 }}>
              Use this
            </button>
          )}
        </div>
      )}
    </>
  );
};
