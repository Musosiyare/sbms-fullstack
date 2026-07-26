const TONES = {
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
  brand: "bg-brand-50 text-brand-600 ring-1 ring-brand-200",
  manager: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  dod: "bg-brand-50 text-brand-600 ring-1 ring-brand-200",
  officer: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  reporter: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
};

export default function Badge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
