import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";

/**
 * A searchable dropdown for picking one item out of a long list — built
 * for cases like the misconduct-type catalog, where a school can have
 * 100+ entries and a plain <select> forces someone to scroll and read
 * every option in order to find the one they want.
 *
 * Type to filter (matches against `label`, or `searchText` if given, so a
 * search can also match a description that isn't shown in the label).
 * Arrow keys + Enter move through the *filtered* list; Escape closes
 * without picking. Options can carry a `group` (e.g. severity) which is
 * rendered as a sticky sub-header, and results keep whatever order the
 * caller passed in — grouping doesn't re-sort them.
 *
 * options: [{ id, label, group?, searchText?, disabled? }]
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  disabled = false,
  renderOption, // (option) => ReactNode — optional custom row content
  emptyText = "No matches",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o.id) === String(value));

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.searchText || o.label).toLowerCase().includes(q));
  }, [options, query]);

  // Groups results while keeping the caller's original ordering — this
  // only clusters same-group items under a shared header, it never
  // reorders the underlying list.
  const grouped = useMemo(() => {
    const groups = [];
    const byName = new Map();
    filtered.forEach((o) => {
      const g = o.group || "";
      if (!byName.has(g)) {
        byName.set(g, { name: g, items: [] });
        groups.push(byName.get(g));
      }
      byName.get(g).items.push(o);
    });
    return groups;
  }, [filtered]);

  const selectableFlat = useMemo(() => filtered.filter((o) => !o.disabled), [filtered]);

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setHighlight(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(option) {
    if (option.disabled) return;
    onChange(String(option.id));
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, selectableFlat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = selectableFlat[highlight];
      if (opt) pick(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={openDropdown}
          onKeyDown={handleKeyDown}
          className="form-field w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-left shadow-sm outline-none transition-all hover:border-slate-300 focus:border-brand-400 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown size={16} className="text-slate-400 shrink-0" />
        </button>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={selected ? selected.label : placeholder}
            className="form-field w-full rounded-xl border border-brand-400 bg-white pl-9 pr-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1.5 w-full max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1.5">
          {grouped.length === 0 ? (
            <p className="px-3.5 py-2.5 text-sm text-slate-400">{emptyText}</p>
          ) : (
            grouped.map((group) => (
              <div key={group.name || "_none_"}>
                {group.name && (
                  <p className="sticky top-0 z-10 -mx-0 bg-slate-100 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.name}
                  </p>
                )}
                {group.items.map((o) => {
                  const idx = selectableFlat.indexOf(o);
                  const isHighlighted = idx === highlight;
                  const isSelected = String(o.id) === String(value);
                  return (
                    <button
                      type="button"
                      key={o.id}
                      disabled={o.disabled}
                      onMouseEnter={() => !o.disabled && setHighlight(idx)}
                      onClick={() => pick(o)}
                      className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left ${
                        o.disabled
                          ? "text-slate-300 cursor-not-allowed"
                          : isHighlighted
                          ? "bg-brand-50 text-brand-700"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {renderOption ? renderOption(o) : <span className="truncate">{o.label}</span>}
                      {isSelected && <Check size={14} className="text-brand-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
