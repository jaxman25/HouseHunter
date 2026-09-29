import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Web keyboard shortcuts (prompt4 #8).
 *
 * Registers a single window keydown listener on web only and dispatches:
 *   `/`  → focusSearchRef (typically the search input)
 *   `f`  → onOpenFilters
 *   `?`  → onToggleHelp
 *
 * Keystrokes are ignored while typing in inputs/textareas/contenteditable
 * and when any modifier key is held. `Esc` is intentionally NOT global —
 * modals close themselves via {@link useEscapeKey}.
 */
export function useKeyboardShortcuts(handlers: {
  focusSearchRef?: React.RefObject<{ focus: () => void } | null>;
  onOpenFilters?: () => void;
  onToggleHelp?: () => void;
}) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const { focusSearchRef, onOpenFilters, onToggleHelp } = handlersRef.current;
      if (isTypingTarget(e.target)) return;

      if (e.key === '/') {
        e.preventDefault();
        focusSearchRef?.current?.focus();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        onOpenFilters?.();
      } else if (e.key === '?') {
        e.preventDefault();
        onToggleHelp?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/**
 * Esc-to-close for modals on web (RN's Modal onRequestClose doesn't fire
 * from the browser Escape key). Mount next to any modal: when `active`,
 * Escape invokes onClose. Typed characters are never swallowed.
 */
export function useEscapeKey(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !active || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (typing) return;
      e.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, active]);
}
