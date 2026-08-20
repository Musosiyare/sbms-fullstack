import { capitalizeFirst } from "../utils/text";

const STATUS_LABEL = {
  finalized: "Finalized",
  pending: "Pending review",
  rejected: "Rejected",
};

const DELIBERATION_META = {
  dismissed_permanently: {
    label: "Dismissed Permanently",
    className: "border-red-700 bg-red-50 text-red-700",
    textClassName: "text-red-700",
    emphasisClassName: "font-display font-extrabold tracking-wide",
  },
  dismissed_term: {
    label: "Dismissed for the Term",
    className: "border-amber-600 bg-amber-50 text-amber-700",
    textClassName: "text-amber-600",
    emphasisClassName: "font-display font-extrabold tracking-wide",
  },
  stained: {
    label: "Stained Record (Retained)",
    className: "border-slate-500 bg-slate-100 text-slate-700",
    textClassName: "text-slate-700",
    emphasisClassName: "",
  },
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * The termly conduct report, laid out like a printed A4 page: school/class
 * header on the left, date on the right, a title, a table of every
 * incident on file for the term, the remaining-marks/status summary, and
 * a Dean of Discipline sign-off footer. Pure presentational — all data
 * comes from GET /reports/student/:studentId/conduct.
 *
 * Sized as a fixed 210mm-wide sheet on screen so it previews the way it'll
 * print; the print stylesheet (see ConductReportModal) hides everything
 * else and lets this element take over the page.
 */
export default function ConductReportPaper({ report }) {
  const {
    school,
    class: klass,
    academicYear,
    term,
    student,
    score,
    status,
    deliberation,
    carriedOverDismissal,
    systemDeliberationThisYear,
    incidents,
    deanOfDiscipline,
  } = report;
  const percent = score.notApplicable ? 0 : Math.max(0, Math.round((score.remaining / score.maxMarks) * 100));
  const good = status === "good";
  // The system may have already made its year-level dismissal call
  // against a different (later) term than the one this page is for —
  // in which case a "Good"/"At Risk" termly status here would be stale
  // and misleading. Same reasoning as the class report table.
  const showTermlyStatus = !deliberation && !carriedOverDismissal && !systemDeliberationThisYear;

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
              <span className="font-semibold">Term:</span> {term.name}
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
          Termly Conduct Report — {term.name}
        </h1>

        {/* Carried-over permanent dismissal notice — this student was
            already permanently dismissed in an earlier term, so this
            term's blank record isn't "clean conduct", it's "not enrolled". */}
        {carriedOverDismissal && (
          <div className="border-2 border-red-700 bg-red-50 rounded-md p-4 mb-6">
            <p className="font-display font-extrabold uppercase tracking-wide text-red-700 text-sm">
              Not applicable — dismissed permanently
            </p>
            <p className="text-sm text-red-700 mt-1">
              This student was permanently dismissed in {carriedOverDismissal.termName}
              {carriedOverDismissal.decidedAt ? ` (${formatDate(carriedOverDismissal.decidedAt)})` : ""} and was not
              enrolled during {term.name}. No conduct marks apply to this term.
            </p>
          </div>
        )}

        {/* Incidents table */}
        <table className="w-full text-xs border-collapse mb-6">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1.5 text-left w-8">#</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left w-20">Date</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Incident</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left w-20">Severity</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left w-24">Status</th>
              <th className="border border-slate-300 px-2 py-1.5 text-center w-16">Marks</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left w-28">Approved by</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-slate-300 px-2 py-4 text-center text-slate-400">
                  No incidents recorded this term.
                </td>
              </tr>
            ) : (
              incidents.map((i, idx) => (
                <tr key={i.id}>
                  <td className="border border-slate-300 px-2 py-1.5 align-top">{idx + 1}</td>
                  <td className="border border-slate-300 px-2 py-1.5 align-top">{formatDate(i.date)}</td>
                  <td className="border border-slate-300 px-2 py-1.5 align-top">
                    <p className="font-medium">{i.title}</p>
                    {i.description && <p className="text-slate-500 mt-0.5">{i.description}</p>}
                    {i.sentHomeFrom && (
                      <p className="text-slate-500 mt-0.5">
                        Sent home: {formatDate(i.sentHomeFrom)} – {formatDate(i.sentHomeTo)}
                      </p>
                    )}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 align-top">
                    {i.severity ? capitalizeFirst(i.severity) : "—"}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 align-top">
                    {STATUS_LABEL[i.status] || i.status}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 align-top text-center tabular-nums">
                    {i.status === "finalized" ? `-${i.marksDeducted}` : "—"}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 align-top">
                    {i.status === "finalized" ? (
                      <>
                        <p>{i.finalizedBy || "—"}</p>
                        {i.finalizedByRole && <p className="text-slate-500">{i.finalizedByRole}</p>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Summary / decision */}
        <div className="border-2 border-slate-800 rounded-md p-4 mb-8">
          <div className="grid grid-cols-3 gap-4 text-sm mb-3">
            <div>
              <p className="text-slate-500">Total marks</p>
              <p className="font-semibold tabular-nums">{score.notApplicable ? "—" : score.maxMarks}</p>
            </div>
            <div>
              <p className="text-slate-500">Marks deducted</p>
              <p className="font-semibold tabular-nums">{score.notApplicable ? "—" : score.deducted}</p>
            </div>
            <div>
              <p className="text-slate-500">Remaining marks</p>
              <p className="font-semibold tabular-nums">
                {score.notApplicable ? "N/A" : `${score.remaining} / ${score.maxMarks} (${percent}%)`}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-300 pt-3">
            <p className="text-sm text-slate-600">
              {carriedOverDismissal
                ? "Status: not enrolled this term (see notice above):"
                : deliberation
                  ? "Status:"
                  : systemDeliberationThisYear
                    ? "Status: system dismissal recorded elsewhere this academic year."
                    : `Status: remaining marks ${good ? "at or above" : "below"} 50% of the term total.`}
            </p>
            {(deliberation || carriedOverDismissal || showTermlyStatus) && (
              <p className={`text-xs uppercase tracking-wide ${deliberation ? `${DELIBERATION_META[deliberation.decision]?.textClassName || "text-slate-700"} ${DELIBERATION_META[deliberation.decision]?.emphasisClassName || "font-bold"}` : carriedOverDismissal ? "font-display font-extrabold text-red-700" : `font-bold ${good ? "text-emerald-700" : "text-amber-600"}`}`}>
                {deliberation
                  ? DELIBERATION_META[deliberation.decision]?.label || deliberation.decision
                  : carriedOverDismissal
                    ? "Dismissed Permanently"
                    : good
                      ? "Good"
                      : "At Risk"}
              </p>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            This is a termly status only — the promotion/dismissal decision is made at year end, combining all three terms.
          </p>
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
