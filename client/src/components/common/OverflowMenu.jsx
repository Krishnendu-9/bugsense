import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

const GAP = 6; // px between the button and the menu
const EDGE = 8; // px the menu keeps from the viewport edges

/**
 * A button that opens a menu of actions.
 *
 * items: [{ key, label, icon, onClick, danger?, disabled? }] -- falsy entries
 * are skipped, so callers can write `canDelete && {...}` inline. Renders
 * nothing when no items are left.
 *
 * label is the accessible name (and the menu's). By default the button is a
 * "..." icon; pass triggerText (and optionally triggerIcon) for a visible
 * label, and triggerClassName to restyle it.
 *
 * The menu is portalled to <body> with fixed positioning, so a scrolling
 * parent (a Board column) cannot clip it. It opens below the button, or above
 * when there is no room below, and is kept inside the viewport horizontally.
 * Scrolling or resizing closes it rather than leaving it detached.
 *
 * Keyboard: opening moves focus to the first item; ArrowUp/ArrowDown move
 * between items, Escape closes and returns focus to the button. A click or
 * tap outside closes it too.
 */
export default function OverflowMenu({
  items,
  label = 'More actions',
  triggerText,
  triggerIcon: TriggerIcon = triggerText ? null : MoreHorizontal,
  triggerClassName = 'btn-secondary flex items-center px-2.5 text-sm',
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const visible = items.filter(Boolean);

  // Place the menu once it has rendered and its size is known.
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !buttonRef.current) return;
    const b = buttonRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    const below = b.bottom + GAP + m.height <= window.innerHeight - EDGE;
    const top = below ? b.bottom + GAP : Math.max(EDGE, b.top - GAP - m.height);
    const left = Math.min(Math.max(EDGE, b.right - m.width), window.innerWidth - m.width - EDGE);
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    // Any scroll except one inside the menu would leave it detached.
    const onScroll = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // Focus the first item once the menu is positioned.
  useEffect(() => {
    if (open && position) menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, [open, position]);

  if (!visible.length) return null;

  const close = (returnFocus) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) buttonRef.current?.focus();
  };

  const onMenuKeyDown = (e) => {
    const enabled = [...menuRef.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const index = enabled.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      enabled[(index + step + enabled.length) % enabled.length]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const choose = (item) => {
    close(true);
    item.onClick();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close(false) : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={triggerClassName}
      >
        {TriggerIcon && <TriggerIcon size={triggerText ? 14 : 16} aria-hidden="true" />}
        {triggerText}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: 'hidden' }}
            className="fixed w-56 max-w-[calc(100vw-16px)] bg-surface border border-border rounded-xl shadow-popover p-1.5 z-50"
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
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus-visible:bg-track ${
                    item.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-track'
                  }`}
                >
                  {Icon && <Icon size={14} className={item.danger ? '' : 'text-muted'} aria-hidden="true" />}
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
