import { ChevronDown, Lock } from "lucide-react";

/**
 * ScopeBar + ScopeGroup: lay out a row of scope pickers (e.g. Academic
 * year / Term / Class) as separate, self-contained boxes — each with its
 * own label, background, and border — so the three choices stay clearly
 * separated no matter how many pills each group has or how the boxes
 * wrap on a narrow screen. (An earlier version used a plain vertical
 * divider line between groups, but that line only made sense when every
 * group's pills stayed on one row — as soon as a group's pills wrapped
 * onto a second line, the divider no longer lined up with anything and
 * the groups visually ran back into each other.)
 */
export function ScopeGroup({ label, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </div>
  );
}

export function ScopeBar({ children }) {
  return <div className="flex flex-wrap items-start gap-3 mb-6">{children}</div>;
}

/**
 * Compact row of tap/click pills — used in place of a <Select> for quick
 * toggles like "which term am I looking at" where there are only a
 * handful of options and switching between them should feel like
 * flipping a tab, not opening a dropdown menu.
 *
 * `options` items: { id, label, locked? }. A locked option is shown
 * greyed out with a lock icon and can't be selected (mirrors
 * TermLockBadge's meaning elsewhere in the app).
 */
export default function PillSelect({ options, value, onChange, emptyLabel = "Nothing to pick yet" }) {
  if (!options.length) {
    return <p className="py-1.5 text-xs text-slate-400">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = String(opt.id) === String(value);
        return (
          <button
            key={opt.id}
            type="button"
            disabled={opt.locked}
            onClick={() => onChange(String(opt.id))}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap
              ${
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : opt.locked
                  ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
          >
            {opt.locked && <Lock size={10} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact native dropdown for picking an academic year. Used in place of
 * PillSelect for years specifically — a school can accumulate a lot of
 * academic years over time, and a pill per year gets noisy/wraps badly,
 * unlike term (always just a handful).
 *
 * `options` items: { id, label, isCurrent? }. The currently-open academic
 * year isn't marked with a "(current)" text suffix — instead the control
 * itself is styled differently (brand-tinted) whenever the picked year is
 * the current one, and the current year's entry is bolded in the list, so
 * "which year is open right now" reads as a visual state, not a label glued
 * onto the name.
 *
 * `fullWidth` swaps the compact chip sizing (used next to a "Year" label
 * in a scope bar) for a taller, block-level control that lines up with the
 * regular `<Select>` fields it sits beside inside a `Field`/grid form —
 * same brand-tint-when-current behavior, just sized to match its
 * neighbors instead of standing out as a mini pill.
 */
export function YearSelect({ options, value, onChange, emptyLabel = "No years yet", fullWidth = false }) {
  if (!options.length) {
    return <p className="py-1.5 text-xs text-slate-400">{emptyLabel}</p>;
  }
  const selected = options.find((opt) => String(opt.id) === String(value));
  const isCurrent = selected?.isCurrent ?? false;

  return (
    <div className={`relative ${fullWidth ? "w-full" : "inline-flex items-center"}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none border font-semibold outline-none transition-colors cursor-pointer
          ${fullWidth ? "w-full rounded-xl pl-3.5 pr-9 py-2.5 text-sm" : "rounded-lg py-1.5 pl-2.5 pr-7 text-xs"}
          ${
            isCurrent
              ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
              : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} style={opt.isCurrent ? { fontWeight: 700 } : undefined}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={fullWidth ? 14 : 12}
        className={`pointer-events-none absolute ${fullWidth ? "right-3.5 top-1/2 -translate-y-1/2" : "right-2"} ${
          isCurrent ? "text-brand-500" : "text-slate-400"
        }`}
      />
    </div>
  );
}
