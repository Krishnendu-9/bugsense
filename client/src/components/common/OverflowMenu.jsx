import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/**
 * A "more actions" button with a menu of secondary actions.
 *
 * items: [{ key, label, icon, onClick, danger?, disabled? }] -- falsy entries
 * are skipped, so callers can write `canDelete && {...}` inline. Renders
 * nothing when no items are left.
 *
 * Keyboard: opening moves focus to the first item; ArrowUp/ArrowDown move
 * between items, Escape closes and returns focus to the button. A click
 * outside closes it too (the same pattern as the Bugs page's Export menu).
 */
export default function OverflowMenu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const visible = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    rootRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  if (!visible.length) return null;

  const onMenuKeyDown = (e) => {
    const enabled = [...rootRef.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const index = enabled.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      enabled[(index + step + enabled.length) % enabled.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const choose = (item) => {
    setOpen(false);
    buttonRef.current?.focus();
    item.onClick();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="btn-secondary flex items-center px-2.5 text-sm"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 mt-1.5 w-56 bg-surface border border-border rounded-xl shadow-popover p-1.5 z-30"
        >
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => choose(item)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus-visible:bg-track ${
                  item.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-track'
                }`}
              >
                {Icon && <Icon size={14} className={item.danger ? '' : 'text-muted'} aria-hidden="true" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
