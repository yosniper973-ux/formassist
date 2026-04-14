import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/stores/appStore";

/**
 * Verrouille automatiquement l'app après X minutes d'inactivité.
 * Écoute : mouse, keyboard, touch, scroll.
 */
export function useAutoLock(timeoutMinutes = 15) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isUnlocked, setUnlocked } = useAppStore();

  const lock = useCallback(() => {
    setUnlocked(false);
  }, [setUnlocked]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isUnlocked) {
      timerRef.current = setTimeout(lock, timeoutMinutes * 60 * 1000);
    }
  }, [isUnlocked, lock, timeoutMinutes]);

  useEffect(() => {
    if (!isUnlocked) return;

    const events = ["mousemove", "keydown", "touchstart", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isUnlocked, resetTimer]);
}
