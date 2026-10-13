import { useEffect, useRef } from "react";

// Each dialog owns its keyboard behavior; only the topmost nested dialog responds.
export function useAdminDialog(
  onClose: () => void,
  busy = false,
  enabled = true,
  selector = '.admin-modal-backdrop [role="dialog"]',
) {
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    if (!enabled) return;
    const dialogs = document.querySelectorAll<HTMLElement>(selector);
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length > 0);
    dialog.tabIndex = -1;
    (focusable()[0] || dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      const open = document.querySelectorAll('[role="dialog"]');
      if (open[open.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
      } else if (event.key === "Tab") {
        const items = focusable();
        const first = items[0] || dialog,
          last = items.at(-1) || dialog;
        if (
          !dialog.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [enabled, selector]);
}
