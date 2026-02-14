import { useState, useEffect, useCallback } from "react";
import { POLL_INTERVAL } from "./constants";

export function usePolling<T>(path: string, interval?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, interval || POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData, interval]);

  return { data, error, loading };
}