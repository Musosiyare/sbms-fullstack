import { useEffect, useRef, useState } from "react";
import { Search, X, ChevronRight, Loader2, Lock } from "lucide-react";
import { searchStudents } from "../api/sbms";

const DELIBERATION_BADGE = {
  dismissed_permanently: {
    label: "Dismissed",
    className: "bg-red-100 text-red-800 ring-1 ring-red-300",
    emphasisClassName: "font-display font-extrabold tracking-wide",
  },
  dismissed_term: {
    label: "Dismissed (Term)",
    className: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
    emphasisClassName: "font-display font-extrabold tracking-wide",
  },
  stained: { label: "Stained", className: "bg-slate-200 text-slate-700", emphasisClassName: "" },
};

/**
 * Live "quick jump" search box for the header. Debounces keystrokes,
 * queries GET /reference/students/search, and shows each match's class
 * plus year-to-date conduct marks right in the dropdown — clicking a
 * result opens that student's yearly conduct report (see Layout, which
 * owns the YearlyConductReportModal this component hands its pick to).
 *
 * Deliberately self-contained: Layout only needs to pass `onSelect`, so
 * this can't accidentally couple to whatever page happens to be mounted.
 *
 * Rendered as a normal, always-visible search field in the header (not
 * collapsed behind an icon) so it reads as a first-class piece of the
 * toolbar rather than something hidden away.
 */
export default function StudentSearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [academicYearId, setAcademicYearId] = useState(null);
  const [lockedTerms, setLockedTerms] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchStudents(q);
        if (myRequestId !== requestIdRef.current) return; // a newer keystroke already superseded this
        setResults(data.results || []);
        setAcademicYearId(data.academicYearId || null);
        setLockedTerms(data.lockedTerms || []);
        setActiveIndex(-1);
      } catch {
        if (myRequestId === requestIdRef.current) setResults([]);
      } finally {
        if (myRequestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // The report a search result opens combines every term in the current
  // academic year — same restriction as the Yearly Report page's "View
  // report" button, so a locked term blocks it here too rather than
  // letting the search box sidestep that check.
  const hasLockedTerm = lockedTerms.length > 0;

  function pick(student) {
    if (!academicYearId || hasLockedTerm) return;
    onSelect(student.id, academicYearId);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className={`relative flex items-center rounded-xl border bg-slate-50 shadow-sm transition-all ${
          open ? "border-brand-400 bg-white" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <Search
          size={16}
          className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
            open ? "text-brand-400" : "text-slate-400"
          }`}
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          type="text"
          placeholder="Search students by name or admission no…"
          className="form-field w-full min-w-0 rounded-xl bg-transparent py-2.5 pl-10 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-full max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {loading && results.length === 0 && (
            <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3.5 py-3 text-xs text-slate-400">No students found for "{query.trim()}".</p>
          )}
          {results.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => pick(s)}
              onMouseEnter={() => setActiveIndex(idx)}
              disabled={!academicYearId || hasLockedTerm}
              title={hasLockedTerm ? "Available once every term for this year is unlocked" : undefined}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                idx === activeIndex ? "bg-brand-50" : "hover:bg-slate-50"
              } ${!academicYearId || hasLockedTerm ? "opacity-60 cursor-not-allowed" : ""} ${
                idx !== results.length - 1 ? "border-b border-slate-50" : ""
              }`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                {s.firstName?.[0]?.toUpperCase()}
                {s.lastName?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {s.firstName} {s.lastName}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {s.class?.name || "No class"}
                  {s.admissionNumber ? ` · #${s.admissionNumber}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {s.conduct?.deliberation ? (
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${
                      DELIBERATION_BADGE[s.conduct.deliberation.decision]?.className || "bg-slate-200 text-slate-700"
                    } ${DELIBERATION_BADGE[s.conduct.deliberation.decision]?.emphasisClassName || "font-semibold"}`}
                  >
                    {DELIBERATION_BADGE[s.conduct.deliberation.decision]?.label || s.conduct.deliberation.decision}
                  </span>
                ) : (
                  s.conduct && (
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        s.conduct.atRisk ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {s.conduct.remaining}/{s.conduct.maxMarks}
                    </span>
                  )
                )}
                <ChevronRight size={14} className="text-slate-300" />
              </div>
            </button>
          ))}
          {!loading && results.length > 0 && !academicYearId && (
            <p className="border-t border-slate-100 px-3.5 py-2 text-[11px] text-slate-400">
              Set a current academic year to open student reports.
            </p>
          )}
          {!loading && results.length > 0 && academicYearId && hasLockedTerm && (
            <p className="flex items-center gap-1.5 border-t border-slate-100 px-3.5 py-2 text-[11px] text-amber-600">
              <Lock size={11} className="shrink-0" />
              {lockedTerms.join(", ")} {lockedTerms.length > 1 ? "are" : "is"} locked in the reporting system —
              reports open once every term this year is unlocked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
