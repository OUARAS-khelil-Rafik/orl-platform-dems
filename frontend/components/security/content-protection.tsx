'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SHIELD_IDLE_MESSAGE = 'Contenu protégé';
const PRINT_BLOCKED_MESSAGE = 'Impression désactivée pour protéger le contenu.';
const CLIPBOARD_BLOCKED_MESSAGE = 'Copie et collage désactivés sur cette plateforme.';
const SCREENSHOT_BLOCKED_MESSAGE = 'Capture d’écran non autorisée.';

const isElementTarget = (target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLElement;

const isEditableTarget = (target: EventTarget | null) => {
  if (!isElementTarget(target)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

const hasExplicitClipboardAllowance = (target: EventTarget | null) =>
  isElementTarget(target) && Boolean(target.closest('[data-allow-clipboard="true"]'));

const shouldAllowClipboardEvent = (event: Event) => {
  if (hasExplicitClipboardAllowance(event.target)) {
    return true;
  }

  return event.type === 'paste' && isEditableTarget(event.target);
};

const isPrintShortcut = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p';

const isClipboardShortcut = (event: KeyboardEvent) => {
  const key = event.key?.toLowerCase();

  if (!(event.ctrlKey || event.metaKey)) {
    return false;
  }

  if (key === 'v' && isEditableTarget(event.target)) {
    return false;
  }

  return key === 'c' || key === 'x' || key === 'v' || key === 'a';
};

const isScreenshotShortcut = (event: KeyboardEvent) => {
  const key = event.key?.toLowerCase();

  return (
    event.key === 'PrintScreen' ||
    (event.metaKey && event.shiftKey && (key === '3' || key === '4' || key === '5')) ||
    (event.ctrlKey && event.shiftKey && key === 's')
  );
};

export function ContentProtection() {
  const [shieldMessage, setShieldMessage] = useState(SHIELD_IDLE_MESSAGE);
  const [isShieldVisible, setIsShieldVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const hideShield = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setIsShieldVisible(false);
  }, []);

  const showShield = useCallback((message: string, durationMs = 1800) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setShieldMessage(message);
    setIsShieldVisible(true);
    timeoutRef.current = window.setTimeout(() => {
      setIsShieldVisible(false);
      timeoutRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    document.body.classList.add('content-protection-enabled');

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      showShield(CLIPBOARD_BLOCKED_MESSAGE);
    };

    const handleSelectStart = (event: Event) => {
      if (!isEditableTarget(event.target) && !hasExplicitClipboardAllowance(event.target)) {
        event.preventDefault();
      }
    };

    const handleClipboardEvent = (event: Event) => {
      if (shouldAllowClipboardEvent(event)) {
        return;
      }

      event.preventDefault();
      showShield(CLIPBOARD_BLOCKED_MESSAGE);
    };

    const handleDragStart = (event: DragEvent) => {
      event.preventDefault();
      showShield(CLIPBOARD_BLOCKED_MESSAGE);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPrintShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        showShield(PRINT_BLOCKED_MESSAGE);
        return;
      }

      if (isClipboardShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        showShield(CLIPBOARD_BLOCKED_MESSAGE);
        return;
      }

      if (isScreenshotShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        showShield(SCREENSHOT_BLOCKED_MESSAGE, 2400);
      }
    };

    const handleBeforePrint = () => {
      showShield(PRINT_BLOCKED_MESSAGE, 2400);
    };

    const handleBlur = () => {
      setShieldMessage(SCREENSHOT_BLOCKED_MESSAGE);
      setIsShieldVisible(true);
    };

    const handleFocus = () => {
      hideShield();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setShieldMessage(SCREENSHOT_BLOCKED_MESSAGE);
        setIsShieldVisible(true);
        return;
      }

      hideShield();
    };

    const originalPrint = window.print.bind(window);
    window.print = () => {
      showShield(PRINT_BLOCKED_MESSAGE, 2400);
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('selectstart', handleSelectStart, true);
    document.addEventListener('copy', handleClipboardEvent, true);
    document.addEventListener('cut', handleClipboardEvent, true);
    document.addEventListener('paste', handleClipboardEvent, true);
    document.addEventListener('dragstart', handleDragStart, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.body.classList.remove('content-protection-enabled');
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
      document.removeEventListener('copy', handleClipboardEvent, true);
      document.removeEventListener('cut', handleClipboardEvent, true);
      document.removeEventListener('paste', handleClipboardEvent, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.print = originalPrint;

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [hideShield, showShield]);

  return (
    <div
      aria-live="polite"
      aria-hidden={!isShieldVisible}
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--app-deep-surface)]/95 px-6 text-center text-[var(--app-deep-text)] backdrop-blur-xl transition-opacity duration-200 ${
        isShieldVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="max-w-md rounded-3xl border border-[var(--app-accent)]/35 bg-[var(--app-surface)]/10 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--app-accent)]">Sécurité</p>
        <p className="mt-4 text-2xl font-bold">{shieldMessage}</p>
        <p className="mt-3 text-sm text-[var(--app-deep-text)]/75">
          Le contenu de la plateforme est protégé contre la copie, l’impression et les captures rapides.
        </p>
      </div>
    </div>
  );
}
