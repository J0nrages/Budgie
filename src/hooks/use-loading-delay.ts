import { useEffect, useState } from "react";

export function useLoadingDelay(isLoading: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const startedAt = Date.now();
    const reset = window.setTimeout(() => setElapsedMs(0), 0);
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 500);

    return () => {
      window.clearTimeout(reset);
      window.clearInterval(interval);
    };
  }, [isLoading]);

  return isLoading ? elapsedMs : 0;
}
