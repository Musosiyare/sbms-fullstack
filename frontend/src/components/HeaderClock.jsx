import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/** Small live clock for the header — re-renders once a second, nothing fancier. */
export default function HeaderClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="hidden md:flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-100 px-3 py-1.5 text-slate-500 shrink-0">
      <Clock size={13} />
      <span className="text-xs font-medium tabular-nums">{time}</span>
      <span className="text-xs text-slate-300">·</span>
      <span className="text-xs text-slate-400">{date}</span>
    </div>
  );
}
