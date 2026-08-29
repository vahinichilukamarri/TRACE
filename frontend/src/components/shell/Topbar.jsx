import { useEffect, useState } from "react";
import { Play, ChevronDown, Wifi, WifiOff } from "lucide-react";
import { useEvalRun } from "../../lib/EvalRunContext";
import { api } from "../../lib/api";
import { formatTime } from "../../lib/format";

export default function Topbar({ title, subtitle }) {
  const { runs, selectedRunId, setSelectedRunId, running, triggerEvaluation } = useEvalRun();
  const [online, setOnline] = useState(null);

  useEffect(() => {
    let mounted = true;
    api
      .health()
      .then(() => mounted && setOnline(true))
      .catch(() => mounted && setOnline(false));
    const id = setInterval(() => {
      api
        .health()
        .then(() => mounted && setOnline(true))
        .catch(() => mounted && setOnline(false));
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-mist-dark bg-bone/90 px-8 py-5 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-obsidian">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-obsidian/50">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1.5 px-2 text-obsidian/50 md:flex">
          {online ? <Wifi size={13} strokeWidth={1.75} /> : <WifiOff size={13} strokeWidth={1.75} />}
          <span className="kicker !text-current">{online === null ? "Connecting" : online ? "Backend Live" : "Backend Offline"}</span>
        </div>

        <div className="relative">
          <select
            value={selectedRunId || ""}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="appearance-none border border-mist-dark bg-bone-soft py-2 pl-3 pr-8 text-sm text-obsidian outline-none focus:border-obsidian"
          >
            {runs.length === 0 && <option value="">No evaluation runs yet</option>}
            {runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.dataset_size} cases · {formatTime(r.created_at)}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-obsidian/40" />
        </div>

        <button
          onClick={() => triggerEvaluation(300)}
          disabled={running}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={13} strokeWidth={2} />
          {running ? "Running…" : "Run Evaluation"}
        </button>
      </div>
    </header>
  );
}
