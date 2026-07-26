/**
 * Generic pager for any list/table. Renders nothing when everything fits
 * on one page. Page numbers collapse with an ellipsis once the list of
 * pages gets long, always keeping the first, last, and a small window
 * around the current page visible.
 */
export default function Pagination({ page, pageCount, totalItems, pageSize, onPageChange, className = "" }) {
  if (pageCount <= 1) return null;

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const pages = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="text-xs text-slate-400">
        Showing {start}–{end} of {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                p === page ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
