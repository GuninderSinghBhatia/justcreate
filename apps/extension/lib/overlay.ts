import type { Rect } from './messages';

const Z = '2147483647';

/** Lets the user drag a rectangle over the page. Resolves null on Escape or a tiny drag. */
export function selectRegion(): Promise<Rect | null> {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      zIndex: Z,
      cursor: 'crosshair',
      background: 'rgba(0,0,0,0.25)',
    } satisfies Partial<CSSStyleDeclaration>);

    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      border: '1px solid #fff',
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
      display: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const hint = document.createElement('div');
    hint.textContent = 'Drag to capture · Esc to cancel';
    Object.assign(hint.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '6px 10px',
      borderRadius: '6px',
      background: '#111',
      color: '#fff',
      font: '13px system-ui, sans-serif',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    layer.append(box, hint);
    document.documentElement.append(layer);

    let start: { x: number; y: number } | null = null;
    let rect: Rect | null = null;

    const finish = (result: Rect | null) => {
      window.removeEventListener('keydown', onKey, true);
      layer.remove();
      // Wait for the overlay to disappear from the screen before the screenshot.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    };

    layer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      layer.style.background = 'transparent';
      box.style.display = 'block';
      hint.remove();
    });
    layer.addEventListener('mousemove', (e) => {
      if (!start) return;
      rect = {
        x: Math.min(start.x, e.clientX),
        y: Math.min(start.y, e.clientY),
        width: Math.abs(e.clientX - start.x),
        height: Math.abs(e.clientY - start.y),
      };
      Object.assign(box.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    });
    layer.addEventListener('mouseup', () => {
      finish(rect && rect.width > 4 && rect.height > 4 ? rect : null);
    });
    window.addEventListener('keydown', onKey, true);
  });
}

let toastTimer: number | undefined;

export function toast(text: string, tone: 'ok' | 'warn' | 'error') {
  const id = 'justcreate-toast';
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.textContent = text;
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: Z,
    maxWidth: '320px',
    padding: '10px 14px',
    borderRadius: '8px',
    background: tone === 'ok' ? '#111' : tone === 'warn' ? '#7a5200' : '#9b1c1c',
    color: '#fff',
    font: '13px/1.4 system-ui, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.append(el);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), tone === 'ok' ? 2500 : 5000);
}
