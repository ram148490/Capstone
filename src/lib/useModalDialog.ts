import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Wires standard WAI-ARIA dialog behaviour onto a modal panel element:
 *
 *  - moves keyboard focus into the dialog when it opens
 *  - restores focus to the element that opened it when it closes
 *  - Escape closes the dialog
 *  - Tab / Shift+Tab stay inside the dialog (focus trap)
 *  - the background page cannot scroll while the dialog is open
 *
 * Attach the returned ref to the panel that carries
 * `role="dialog" aria-modal="true" aria-labelledby={...} tabIndex={-1}`.
 *
 * Pass `isOpen` for a dialog whose component stays mounted and merely returns
 * null when closed (e.g. AuthModal). Conditionally-rendered dialogs can omit it.
 */
export function useModalDialog(onClose: () => void, isOpen: boolean = true) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const restoreFocusTo = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      if (!panel) return [];
      const nodes = panel.querySelectorAll(FOCUSABLE);
      return (Array.from(nodes) as HTMLElement[]).filter((el) => el.offsetParent !== null);
    };

    // Focus the dialog container itself (tabIndex=-1), not its first control:
    // screen readers then announce the dialog name + role, and the user isn't
    // dropped onto the close button or an arbitrary field. Tab proceeds into the
    // content from there.
    (panel ?? focusables()[0])?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevBodyOverflow;
      restoreFocusTo?.focus?.();
    };
  }, [isOpen]);

  return panelRef;
}
