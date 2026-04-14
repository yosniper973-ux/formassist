import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";

/** Synchronise l'état online/offline avec le store */
export function useOnline() {
  const setOnline = useAppStore((s) => s.setOnline);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnline]);
}
