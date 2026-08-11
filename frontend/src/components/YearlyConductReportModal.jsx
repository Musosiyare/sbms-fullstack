import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { toast } from "sonner";
import { getStudentYearlyConductReport } from "../api/sbms";
import YearlyConductReportPaper from "./YearlyConductReportPaper";
import { exportYearlyReportPdf } from "../utils/pdf";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Full-screen viewer for one student's printable yearly conduct report.
 * Used to print natively via window.print(); switched to a jsPDF download
 * for the same reason as ConductReportModal (see that file) — the native
 * print pagination bug that turned one report into 2-3 duplicate pages.
 */
export default function YearlyConductReportModal({ studentId, academicYearId, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setReport(null);
    setError("");
    getStudentYearlyConductReport(studentId, { academicYearId })
      .then(setReport)
      .catch((err) => setError(err?.response?.data?.message || "Couldn't load this report."));
  }, [studentId, academicYearId]);

  if (!studentId) return null;

  function handleDownload() {
    if (!report) return;
    setDownloading(true);
    try {
      const fileBase = `${slugify(report.student.firstName)}-${slugify(report.student.lastName)}-${slugify(report.academicYear.name)}`;
      exportYearlyReportPdf([report], `${fileBase}-yearly-report.pdf`);
    } catch (err) {
      toast.error("Couldn't generate the PDF", { description: err?.message });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="conduct-report-modal-root fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto">
      <div className="conduct-report-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <p className="text-sm font-medium text-slate-700">
          {report ? `${report.student.firstName} ${report.student.lastName} — Yearly Conduct Report` : "Yearly conduct report"}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={!report || downloading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 text-white px-3.5 py-2 text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            <Download size={15} /> {downloading ? "Generating…" : "Download PDF"}
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <X size={15} /> Close
          </button>
        </div>
      </div>

      <div className="conduct-report-body py-8 px-4">
        {error ? (
          <p className="max-w-md mx-auto text-center text-sm text-red-600 bg-white rounded-lg p-6">{error}</p>
        ) : !report ? (
          <p className="text-center text-sm text-slate-200">Loading report…</p>
        ) : (
          <div className="conduct-report-print-area shadow-lg">
            <YearlyConductReportPaper report={report} />
          </div>
        )}
      </div>
    </div>
  );
}
