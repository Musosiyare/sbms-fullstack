import { useEffect, useState } from "react";
import { X, Printer } from "lucide-react";
import { getStudentConductReport } from "../api/sbms";
import ConductReportPaper from "./ConductReportPaper";

/**
 * Full-screen viewer for one student's printable termly conduct report.
 * Uses its own overlay (rather than the generic Modal) so the print
 * stylesheet below can cleanly take over the whole page: everything except
 * `.conduct-report-print-area` is hidden while printing, and that area is
 * unpinned from the modal's scroll box so it prints as a normal A4 page.
 */
export default function ConductReportModal({ studentId, termId, academicYearId, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentId) return;
    setReport(null);
    setError("");
    getStudentConductReport(studentId, { termId, academicYearId })
      .then(setReport)
      .catch((err) => setError(err?.response?.data?.message || "Couldn't load this report."));
  }, [studentId, termId, academicYearId]);

  if (!studentId) return null;

  return (
    <div className="conduct-report-modal-root fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto print:bg-white print:overflow-visible">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .conduct-report-print-area, .conduct-report-print-area * { visibility: visible; }
          /* The report is now capped to exactly one page (297mm), so the
             modal root can stay 'fixed' during print: that keeps it out of
             normal document flow, meaning the rest of the app behind the
             modal (hidden via visibility:hidden, but still occupying layout
             space since that doesn't remove it from flow) can't push the
             report down into blank leading/trailing pages. */
          .conduct-report-modal-root {
            position: fixed !important;
            inset: 0 !important;
            overflow: visible !important;
          }
          .conduct-report-toolbar { display: none !important; }
          .conduct-report-body { padding: 0 !important; margin: 0 !important; }
          .conduct-report-print-area {
            position: static; margin: 0; padding: 0; box-shadow: none;
          }
          .conduct-report-paper { height: 297mm !important; page-break-inside: avoid; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="conduct-report-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 print:hidden">
        <p className="text-sm font-medium text-slate-700">
          {report ? `${report.student.firstName} ${report.student.lastName} — Termly Conduct Report` : "Conduct report"}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 text-white px-3.5 py-2 text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <X size={15} /> Close
          </button>
        </div>
      </div>

      <div className="conduct-report-body py-8 px-4 print:p-0">
        {error ? (
          <p className="max-w-md mx-auto text-center text-sm text-red-600 bg-white rounded-lg p-6">{error}</p>
        ) : !report ? (
          <p className="text-center text-sm text-slate-200">Loading report…</p>
        ) : (
          <div className="conduct-report-print-area shadow-lg print:shadow-none">
            <ConductReportPaper report={report} />
          </div>
        )}
      </div>
    </div>
  );
}
