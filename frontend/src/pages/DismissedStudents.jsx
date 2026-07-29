import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Download, UserX } from "lucide-react";
import { toast } from "sonner";
import { Field, Select } from "../components/ui/FormField";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { getAcademicYears, getTerms, getDismissedStudentsReport } from "../api/sbms";
import { exportDismissedStudentsPdf } from "../utils/pdf";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const DECISION_META = {
  dismissed_permanently: { label: "Dismissed permanently", className: "bg-red-50 text-red-700" },
  dismissed_term: { label: "Dismissed (term)", className: "bg-amber-50 text-amber-700" },
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * School-wide list of every dismissed student — pulled from the same
 * Deliberation decisions the dashboard's exceeded-marks flow records.
 * Deliberately its own scope (not the shared useScopePicker/global term)
 * since "All terms" is the natural default here: someone auditing
 * dismissals usually wants the whole year at a glance, then narrows to a
 * single term or dismissal kind only if they need to.
 */
export default function DismissedStudents() {
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [decision, setDecision] = useState("all");
  const [data, setData] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getAcademicYears().then((years) => {
      setAcademicYears(years);
      const current = years.find((y) => y.isCurrent) || years[0];
      if (current) setAcademicYearId(String(current.id));
    });
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    setTermId("");
    getTerms(academicYearId).then(setTerms);
  }, [academicYearId]);

  useEffect(() => {
    if (!academicYearId) return;
    setData(null);
    getDismissedStudentsReport({ academicYearId, termId: termId || undefined, decision }).then(setData);
  }, [academicYearId, termId, decision]);

  const students = data?.students || [];
  const permanentCount = students.filter((s) => s.decision === "dismissed_permanently").length;
  const termCount = students.filter((s) => s.decision === "dismissed_term").length;

  const selectedTermName = terms.find((t) => String(t.id) === String(termId))?.name || null;
  const fileBase = data ? `${slugify(data.academicYear.name)}-dismissed-students` : "dismissed-students";

  function handleDownload() {
    if (!data || students.length === 0) return;
    setExporting(true);
    try {
      exportDismissedStudentsPdf(
        {
          school: data.school,
          academicYear: data.academicYear,
          termLabel: selectedTermName,
          deanOfDiscipline: data.deanOfDiscipline,
          students,
        },
        `${fileBase}.pdf`
      );
    } catch (err) {
      toast.error("Couldn't generate the PDF", { description: err?.message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card
      title="Dismissed Students"
      subtitle="Every student dismissed this year — permanently, or for a term."
      actions={
        <Button variant="primary" onClick={handleDownload} disabled={!students.length || exporting}>
          <Download size={15} /> {exporting ? "Generating…" : "Download PDF"}
        </Button>
      }
    >
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Field label="Academic year">
          <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Term">
          <Select value={termId} onChange={(e) => setTermId(e.target.value)} disabled={!terms.length}>
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dismissal type">
          <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="all">All dismissals</option>
            <option value="dismissed_permanently">Dismissed permanently</option>
            <option value="dismissed_term">Dismissed for the term</option>
          </Select>
        </Field>
      </div>

      {data && (
        <div className="flex flex-wrap gap-2.5 mb-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-600">
            <UserX size={13} /> {students.length} total
          </span>
          <span className="inline-flex items-center rounded-full bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700">
            {permanentCount} permanent
          </span>
          <span className="inline-flex items-center rounded-full bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-700">
            {termCount} by term
          </span>
        </div>
      )}

      <Table>
        <Thead>
          <tr>
            <Th>Student</Th>
            <Th>Admission No.</Th>
            <Th>Class</Th>
            <Th>Term</Th>
            <Th>Decision</Th>
            <Th>Reason</Th>
            <Th>Decided by</Th>
            <Th className="text-right">Date</Th>
          </tr>
        </Thead>
        <tbody>
          {!academicYearId ? (
            <EmptyRow colSpan={8}>Pick an academic year above.</EmptyRow>
          ) : data === null ? (
            <EmptyRow colSpan={8}>Loading...</EmptyRow>
          ) : students.length === 0 ? (
            <EmptyRow colSpan={8}>No dismissed students match these filters.</EmptyRow>
          ) : (
            students.map((s) => {
              const meta = DECISION_META[s.decision] || { label: s.decision, className: "bg-slate-100 text-slate-600" };
              return (
                <tr key={s.deliberationId}>
                  <Td className="font-medium text-slate-800">
                    {s.firstName} {s.lastName}
                  </Td>
                  <Td>
                    <span className="font-accent font-semibold text-brand-500">{s.admissionNumber || "—"}</span>
                  </Td>
                  <Td>{s.className || "—"}</Td>
                  <Td>{s.termName || "—"}</Td>
                  <Td>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}>
                      {meta.label}
                    </span>
                  </Td>
                  <Td className="max-w-xs truncate" title={s.reason || ""}>
                    {s.reason || "—"}
                  </Td>
                  <Td>{s.decidedBy || "—"}</Td>
                  <Td className="text-right whitespace-nowrap">{formatDate(s.decidedAt)}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </Card>
  );
}
