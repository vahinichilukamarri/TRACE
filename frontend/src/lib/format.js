export function formatCurrency(value, currency = "INR") {
  if (value === null || value === undefined) return "—";
  const symbol = currency === "INR" ? "₹" : currency + " ";
  const num = Number(value);
  return `${symbol}${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatCompactCurrency(value, currency = "INR") {
  if (value === null || value === undefined) return "—";
  const symbol = currency === "INR" ? "₹" : currency + " ";
  const num = Number(value);
  if (Math.abs(num) >= 1e7) return `${symbol}${(num / 1e7).toFixed(2)}Cr`;
  if (Math.abs(num) >= 1e5) return `${symbol}${(num / 1e5).toFixed(2)}L`;
  if (Math.abs(num) >= 1e3) return `${symbol}${(num / 1e3).toFixed(1)}K`;
  return `${symbol}${num.toFixed(0)}`;
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function formatPercentFromWhole(value, digits = 1) {
  // For values already expressed 0-100
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelative(value) {
  if (!value) return "—";
  const d = new Date(value);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function truncateId(id, len = 10) {
  if (!id) return "—";
  return id.length > len ? `${id.slice(0, len)}…` : id;
}
