function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * The year-end conduct report: every term's score laid side by side, the
 * combined yearly total, and the promotion/dismissal decision — the
 * "combine all three terms and decide" process Theo described, on paper.
 * Sized and print-styled the same way as ConductReportPaper (see
 * YearlyConductReportModal for the print stylesheet that keeps this to one
 * page).
 */
export default function YearlyConductReportPaper({ report }) {
  const { school, class: klass, academicYear, student, terms, year, incidents, deanOfDiscipline } = report;
  const percent = Math.max(0, Math.round((year.remaining / year.maxMarks) * 100));
  const promoted = year.decision === "promoted";

  return (
    <div
      className="conduct-report-paper mx-auto bg-white text-slate-900 box-border"
      style={{ width: "210mm", height: "297mm", minHeight: "297mm", padding: "16mm" }}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 pb-4 border-b-2 border-slate-800">
          <div className="space-y-0.5">
            <p className="text-xl font-bold tracking-wide uppercase">{school.name}</p>
            <p className="text-sm">
              <span className="font-semibold">Class:</span> {klass.name}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Academic Year:</span> {academicYear.name}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Student:</span> {student.firstName} {student.lastName}
              {student.admissionNumber ? ` (${student.admissionNumber})` : ""}
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
          Yearly Conduct Report — {academicYear.name}
        </h1>

        {/* Per-term breakdown */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 text-left">Term</th>
              <th className="border border-slate-300 px-3 py-2 text-center w-28">Max marks</th>
              <th className="border border-slate-300 px-3 py-2 text-center w-28">Deducted</th>
              <th className="border border-slate-300 px-3 py-2 text-center w-28">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.termId}>
                <td className="border border-slate-300 px-3 py-2">{t.termName}</td>
                <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">{t.maxMarks}</td>
                <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">{t.deducted}</td>
                <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">{t.remaining}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="border border-slate-300 px-3 py-2">Total</td>
              <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">{year.maxMarks}</td>
              <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">{year.deducted}</td>
              <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">{year.remaining}</td>
            </tr>
          </tbody>
        </table>

        {/* Incidents summary */}
        <div className="mb-6">
          <p className="text-sm font-semibold mb-2">Incidents summary</p>
          {incidents && incidents.length > 0 ? (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left">Incident</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left w-24">Term</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left w-24">Date</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center w-20">Marks</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id}>
                    <td className="border border-slate-300 px-2.5 py-1.5">{i.title}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5">{i.termName}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5">{formatDate(i.date)}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums">
                      -{i.marksDeducted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500">No finalized incidents this year.</p>
          )}
        </div>

        {/* Decision */}
        <div className="border-2 border-slate-800 rounded-md p-4 mb-8">
          <div className="grid grid-cols-3 gap-4 text-sm mb-3">
            <div>
              <p className="text-slate-500">Total marks</p>
              <p className="font-semibold tabular-nums">{year.maxMarks}</p>
            </div>
            <div>
              <p className="text-slate-500">Marks deducted</p>
              <p className="font-semibold tabular-nums">{year.deducted}</p>
            </div>
            <div>
              <p className="text-slate-500">Remaining marks</p>
              <p className="font-semibold tabular-nums">
                {year.remaining} / {year.maxMarks} ({percent}%)
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-300 pt-3">
            <p className="text-sm text-slate-600">
              Decision: remaining marks {promoted ? "at or above" : "below"} 50% of the year total.
            </p>
            <p className={`text-base font-bold uppercase tracking-wide ${promoted ? "text-emerald-700" : "text-red-700"}`}>
              {promoted ? "Promoted" : "Dismissed"}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-6 flex items-end justify-between text-sm">
          <div>
            <p className="border-t border-slate-400 pt-1 w-56">Dean of Discipline signature</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{deanOfDiscipline?.name || "Dean of Discipline"}</p>
            <p className="text-slate-500">{deanOfDiscipline?.email || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
