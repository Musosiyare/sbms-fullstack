import { useEffect, useState } from "react";
import { X, Download, List } from "lucide-react";
import { toast } from "sonner";
import { getClassConductReport } from "../api/sbms";
import ConductReportPaper from "./ConductReportPaper";
import { exportConductReportPdf, exportConductMarksPdf } from "../utils/pdf";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Same idea as ConductReportModal, but for the whole class at once: fetches
 * every active student's termly report in a single request, previews them
 * on screen as consecutive A4 pages, and offers two downloads built
 * natively with jsPDF (not a DOM screenshot, so the output stays crisp and
 * matches the on-screen fonts/colors exactly): "Conduct report" — the full
 * per-student reports — and "Conduct marks" — a lighter list of just names
 * and remaining marks.
 */
export default function ClassConductReportModal({ classId, termId, academicYearId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(null); // "report" | "marks" | null

  useEffect(() => {
    if (!classId) return;
    setData(null);
    setError("");
    getClassConductReport(classId, { termId, academicYearId })
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || "Couldn't load these reports."));
  }, [classId, termId, academicYearId]);

  if (!classId) return null;

  const fileBase = data ? `${slugify(data.class.name)}-${slugify(data.term.name)}` : "class-conduct-report";

  function handleDownloadReport() {
    if (!data) return;
    setExporting("report");
    try {
      const reports = data.students.map((s) => ({
        school: data.school,
        class: data.class,
        academicYear: data.academicYear,
        term: data.term,
        deanOfDiscipline: data.deanOfDiscipline,
        generatedAt: data.generatedAt,
        student: s.student,
        score: s.score,
        status: s.status,
        incidents: s.incidents,
      }));
      exportConductReportPdf(reports, `${fileBase}-conduct-report.pdf`);
    } catch (err) {
      toast.error("Couldn't generate the PDF", { description: err?.message });
    } finally {
      setExporting(null);
    }
  }

  function handleDownloadMarks() {
    if (!data) return;
    setExporting("marks");
    try {
      exportConductMarksPdf(
        {
          school: data.school,
          klass: data.class,
          academicYear: data.academicYear,
          term: data.term,
          deanOfDiscipline: data.deanOfDiscipline,
          students: data.students,
        },
        `${fileBase}-conduct-marks.pdf`
      );
    } catch (err) {
      toast.error("Couldn't generate the PDF", { description: err?.message });
    } finally {
      setExporting(null);
    }
  }

  const canDownload = Boolean(data) && data.students.length > 0;

  return (
    <div className="conduct-report-modal-root fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto">
      <div className="conduct-report-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <p className="text-sm font-medium text-slate-700">
          {data ? `${data.class.name} — ${data.students.length} report${data.students.length === 1 ? "" : "s"}` : "Class conduct reports"}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadMarks}
            disabled={!canDownload || exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 px-3.5 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <List size={15} /> {exporting === "marks" ? "Generating…" : "Conduct marks"}
          </button>
          <button
            onClick={handleDownloadReport}
            disabled={!canDownload || exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 text-white px-3.5 py-2 text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            <Download size={15} /> {exporting === "report" ? "Generating…" : "Conduct report"}
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
        ) : !data ? (
          <p className="text-center text-sm text-slate-200">Loading reports…</p>
        ) : data.students.length === 0 ? (
          <p className="text-center text-sm text-slate-200">No students in this class.</p>
        ) : (
          <div className="conduct-report-print-area space-y-8">
            {data.students.map((s) => (
              <div key={s.student.id} className="conduct-report-page shadow-lg">
                <ConductReportPaper
                  report={{
                    school: data.school,
                    class: data.class,
                    academicYear: data.academicYear,
                    term: data.term,
                    deanOfDiscipline: data.deanOfDiscipline,
                    generatedAt: data.generatedAt,
                    student: s.student,
                    score: s.score,
                    status: s.status,
                    incidents: s.incidents,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
