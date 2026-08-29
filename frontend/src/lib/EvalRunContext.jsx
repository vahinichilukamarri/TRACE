import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

const EvalRunContext = createContext(null);

export function EvalRunProvider({ children }) {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const refreshRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listRuns(20);
      setRuns(data);
      setSelectedRunId((prev) => prev ?? data[0]?.run_id ?? null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerEvaluation = useCallback(
    async (datasetSize = 300) => {
      setRunning(true);
      setError(null);
      try {
        const result = await api.runEvaluation({ dataset_size: datasetSize });
        await refreshRuns();
        setSelectedRunId(result.run_id);
        return result;
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        setRunning(false);
      }
    },
    [refreshRuns]
  );

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  return (
    <EvalRunContext.Provider
      value={{ runs, selectedRunId, setSelectedRunId, loading, running, error, refreshRuns, triggerEvaluation }}
    >
      {children}
    </EvalRunContext.Provider>
  );
}

export function useEvalRun() {
  const ctx = useContext(EvalRunContext);
  if (!ctx) throw new Error("useEvalRun must be used within EvalRunProvider");
  return ctx;
}
