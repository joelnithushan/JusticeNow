/**
 * JusticeNow — Quick Exit coordination context.
 *
 * WHY THIS EXISTS
 * The person this protects may be reporting someone who has physical access
 * to her phone. If that person walks in mid-report she needs to be out of the
 * app in one tap, with nothing left on screen and nothing recoverable.
 *
 * This context is the wiring between the Quick Exit button and any page that
 * holds in-progress case data (currently the report form). A page registers a
 * reset callback; when the user taps Quick Exit the button runs every
 * registered callback SYNCHRONOUSLY, wiping that in-progress data before the
 * screen changes.
 *
 * PRIVACY: everything here lives in memory only. We deliberately keep NO draft
 * in any device storage (localStorage/sessionStorage/indexedDB/cookies), so a
 * half-written description of an assault can never survive on the device.
 * There is intentionally no "resume your draft" feature, however convenient.
 */

import React, { createContext, useCallback, useContext, useRef } from 'react';

const QuickExitContext = createContext(null);

/**
 * Safe fallback so components that use the hook still work when rendered
 * outside a provider (e.g. in isolation in a unit test). A missing provider
 * must never crash a reporter-facing page.
 */
const NOOP = {
  registerClear: () => () => {},
  clearAll: () => {},
};

export function QuickExitProvider({ children }) {
  // Reset callbacks registered by pages holding in-progress case data.
  // Kept in a ref (not state) so registering never triggers a re-render.
  const resettersRef = useRef(new Set());

  // Returns an unregister function so a page cleans up when it unmounts.
  const registerClear = useCallback((fn) => {
    resettersRef.current.add(fn);
    return () => {
      resettersRef.current.delete(fn);
    };
  }, []);

  const clearAll = useCallback(() => {
    // Run every reset synchronously. We must NOT await anything here: the
    // screen has to change in the same tick the user taps Quick Exit. A reset
    // that throws must never block the exit, so each is guarded individually.
    resettersRef.current.forEach((fn) => {
      try {
        fn();
      } catch {
        /* swallow — leaving the app safely is more important than any reset */
      }
    });
  }, []);

  return (
    <QuickExitContext.Provider value={{ registerClear, clearAll }}>
      {children}
    </QuickExitContext.Provider>
  );
}

export function useQuickExit() {
  return useContext(QuickExitContext) ?? NOOP;
}

export default QuickExitContext;
