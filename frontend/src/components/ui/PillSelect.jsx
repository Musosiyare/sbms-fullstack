import { Lock } from "lucide-react";

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
export default function PillSelect({ options, value, onChange }) {
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
