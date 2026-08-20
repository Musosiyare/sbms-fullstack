function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const DELIBERATION_META = {
  dismissed_permanently: {
    label: "Dismissed Permanently",
    className: "text-red-700",
    emphasisClassName: "font-display font-extrabold tracking-wide",
  },
  dismissed_term: {
    label: "Dismissed for the Term",
    className: "text-amber-600",
    emphasisClassName: "font-display font-extrabold tracking-wide",
  },
  stained: { label: "Stained (Retained)", className: "text-slate-700", emphasisClassName: "" },
};

// Each term gets its own accent color so the per-term incident cards are
// easy to tell apart at a glance without relying on the header text alone.
const TERM_ACCENTS = [
  { bar: "bg-teal-700", chip: "bg-teal-50 text-teal-800 border-teal-200" },
  { bar: "bg-indigo-700", chip: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  { bar: "bg-amber-600", chip: "bg-amber-50 text-amber-800 border-amber-200" },
];

/**
 * The year-end conduct report: every term's score laid side by side, the
 * combined yearly total, and the promotion/dismissal decision — the
 * "combine all three terms and decide" process Theo described, on paper.
 * Sized and print-styled the same way as ConductReportPaper (see
 * YearlyConductReportModal for the print stylesheet that keeps this to one
 * page).
 */
export default function YearlyConductReportPaper({ report }) {
  const { school, class: klass, academicYear, student, terms, year, deliberations, incidents, deanOfDiscipline } =
    report;
  const percent = Math.max(0, Math.round((year.remaining / year.maxMarks) * 100));
  const promoted = year.decision === "promoted";
  const deliberation = year.deliberation || null;

  return (
    <div
      className="conduct-report-paper mx-auto bg-white text-slate-900 box-border"
      style={{ width: "210mm", height: "297mm", minHeight: "297mm", padding: "16mm" }}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 pb-4 border-b-[3px] border-teal-950">
          <div className="space-y-0.5">
            <p className="font-display text-xl font-extrabold tracking-wide uppercase text-teal-950">{school.name}</p>
            <p className="text-sm">
              <span className="font-semibold">Class:</span> {klass.name}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Academic Year:</span> {academicYear.name}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Student:</span> {student.firstName} {student.lastName}
              {student.admissionNumber && <span className="font-bold"> {student.admissionNumber}</span>}
            </p>
            {(student.guardianName || student.guardianPhone) && (
              <p className="text-sm">
                <span className="font-semibold">Guardian:</span> {student.guardianName || "—"}
                {student.guardianPhone ? ` — ${student.guardianPhone}` : ""}
              </p>
            )}
          </div>
          <div className="text-right text-sm shrink-0">
            <p className="font-semibold">Date</p>
            <p>{formatDate(report.generatedAt)}</p>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-center text-lg font-bold uppercase tracking-wide mt-6 mb-6">
          Yearly Conduct Report — 2026-2027
        </h1>

        {/* Per-term summary — marks and incident counts together, one row
            per term, so the whole year's picture is a single table instead
            of a marks table plus a separate incidents table. */}
        <table className="w-auto text-xs border-collapse mb-6 rounded-md overflow-hidden shadow-sm">
          <thead>
            <tr className="bg-teal-950">
              <th className="border border-slate-300 px-2.5 py-1.5 text-left font-bold text-white">Term</th>
              <th className="border border-slate-300 px-2.5 py-1.5 text-center w-20 font-bold text-white">Max marks</th>
              <th className="border border-slate-300 px-2.5 py-1.5 text-center w-20 font-bold text-white">Deducted</th>
              <th className="border border-slate-300 px-2.5 py-1.5 text-center w-20 font-bold text-white">Remaining</th>
              <th className="border border-slate-300 px-2.5 py-1.5 text-center w-20 font-bold text-white">Incidents</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t, idx) =>
              t.notApplicable ? (
                <tr key={t.termId} className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} text-black italic`}>
                  <td className="border border-slate-300 px-2.5 py-1.5">{t.termName}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5 text-center" colSpan={4}>
                    N/A — {t.notApplicableReason}
                  </td>
                </tr>
              ) : (
                <tr key={t.termId} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="border border-slate-300 px-2.5 py-1.5 text-black font-medium">{t.termName}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{t.maxMarks}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{t.deducted}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{t.remaining}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{t.incidentsCount}</td>
                </tr>
              )
            )}
            <tr className="bg-slate-200 font-bold">
              <td className="border border-slate-300 px-2.5 py-1.5 text-black">Total</td>
              <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{year.maxMarks}</td>
              <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{year.deducted}</td>
              <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{year.remaining}</td>
              <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums text-black">{incidents?.length || 0}</td>
            </tr>
          </tbody>
        </table>

        {/* Incidents summary — one compact card per term, listing every
            finalized incident that fell in it (title, date, marks lost).
            Text is kept solid black so it reads clearly on a printed/
            scanned page, unlike the muted slate tones used elsewhere. */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Incidents Summary — Per Term</p>
          <div className="grid grid-cols-3 gap-3">
            {terms.map((t, idx) => {
              const accent = TERM_ACCENTS[idx % TERM_ACCENTS.length];
              const allTermIncidents = (incidents || []).filter((i) => i.termId === t.termId);
              const MAX_SHOWN = 6;
              const termIncidents = allTermIncidents.slice(0, MAX_SHOWN);
              const hiddenCount = allTermIncidents.length - termIncidents.length;
              return (
                <div key={t.termId} className="border border-slate-300 rounded-md overflow-hidden">
                  <div className={`${accent.bar} h-1.5 w-full`} />
                  <div className="p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-black">{t.termName}</p>
                      <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 ${accent.chip}`}>
                        {t.notApplicable ? "N/A" : `${allTermIncidents.length} incident${allTermIncidents.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    {t.notApplicable ? (
                      <p className="text-[10px] italic text-slate-400">N/A — {t.notApplicableReason}</p>
                    ) : termIncidents.length === 0 ? (
                      <p className="text-[10px] italic text-black">No incidents recorded.</p>
                    ) : (
                      <ul className="space-y-1">
                        {termIncidents.map((inc) => (
                          <li key={inc.id} className="text-[10px] leading-tight text-black">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold">{inc.title}</span>
                              <span className="shrink-0 font-semibold">-{inc.marksDeducted}</span>
                            </div>
                            <span className="text-black/70">{formatDate(inc.date)}</span>
                          </li>
                        ))}
                        {hiddenCount > 0 && (
                          <li className="text-[10px] italic text-black/70">+{hiddenCount} more this term</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Decision — computed marks-based result, plus the discipline
            office's recorded deliberation (if any) folded into the same
            box instead of a separate one. Kept deliberately small and
            colored (rather than large/black) so it reads as a verdict
            stamp next to the plain-black incident detail above it. */}
        <div className="border-2 border-slate-800 rounded-md p-4 mb-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Remaining {year.remaining} / {year.maxMarks} ({percent}%)
              {deliberation ? " — computed; see recorded deliberation below" : ""}
            </p>
            <p className={`text-xs font-bold uppercase tracking-wide ${promoted ? "text-emerald-700" : "text-red-700"}`}>
              {promoted ? "Promoted" : "Dismissed"}
            </p>
          </div>

          {deliberation && (
            <div className="flex items-center justify-between border-t border-slate-300 mt-3 pt-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Deliberation — {deliberation.termName || "this year"}
                {deliberation.reason ? `: ${deliberation.reason}` : ""}
              </p>
              <p className={`text-xs uppercase tracking-wide ${DELIBERATION_META[deliberation.decision]?.className || "text-slate-700"} font-bold`}>
                {DELIBERATION_META[deliberation.decision]?.label || deliberation.decision}
              </p>
            </div>
          )}
          {deliberation && (
            <p className="text-xs mt-2 text-slate-500">
              Decided by {deliberation.decidedBy || "—"}
              {deliberation.decidedByRole ? ` (${deliberation.decidedByRole})` : ""} · {formatDate(deliberation.decidedAt)}
              {deliberations && deliberations.length > 1 &&
                ` · Other terms: ${deliberations
                  .filter((d) => d.id !== deliberation.id)
                  .map((d) => `${d.termName || "—"} — ${DELIBERATION_META[d.decision]?.label || d.decision}`)
                  .join("; ")}`}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto pt-6 flex items-end justify-between text-sm">
          <div>
            <p className="border-t border-slate-400 pt-1 w-56">Dean of Discipline signature</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{deanOfDiscipline?.name || "Dean of Discipline"}</p>
            <p className="text-slate-500">{deanOfDiscipline?.phone || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
