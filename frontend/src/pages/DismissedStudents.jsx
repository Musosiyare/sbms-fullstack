import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Download, UserX, Cpu } from "lucide-react";
import { toast } from "sonner";
import { Field, Select } from "../components/ui/FormField";
import { YearSelect } from "../components/ui/PillSelect";
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
  dismissed_permanently: {
    label: "Dismissed permanently",
    className: "text-red-700",
  },
  dismissed_term: {
    label: "Dismissed (term)",
    className: "text-amber-700",
  },
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * School-wide list of every dismissed student — pulled from the same
 * Deliberation table the dashboard's exceeded-marks flow writes to. That
 * includes students the system itself auto-dismissed for crossing half
 * the year's cumulative marks with nobody having formally decided on
 * them (see deliberationController.applySystemYearlyDismissals) — those
 * rows are indistinguishable from a staff decision here except that
 * "Decided by" reads "System" instead of a person's name, since they're
 * the exact same kind of Deliberation row, just authored differently.
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
  const systemCount = students.filter((s) => s.decidedBy === "System").length;

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
      subtitle="Every student dismissed this year — by staff decision, or automatically by the system for exceeding a year's marks."
      actions={
        <Button variant="primary" onClick={handleDownload} disabled={!students.length || exporting}>
          <Download size={15} /> {exporting ? "Generating…" : "Download PDF"}
        </Button>
      }
    >
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Field label="Academic year">
          <YearSelect
            fullWidth
            options={academicYears.map((y) => ({ id: y.id, label: y.name, isCurrent: y.isCurrent }))}
            value={academicYearId}
            onChange={setAcademicYearId}
            emptyLabel="No academic years yet"
          />
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
          {systemCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-700">
              <Cpu size={12} /> {systemCount} dismissed automatically by the system
            </span>
          )}
        </div>
      )}

      <Table>
        <Thead>
          <tr>
            <Th>Student</Th>
            <Th className="hidden lg:table-cell">Class</Th>
            <Th className="hidden lg:table-cell">Term</Th>
            <Th>Decision</Th>
            <Th className="hidden md:table-cell">Reason</Th>
            <Th className="hidden sm:table-cell">Decided by</Th>
            <Th className="text-right">Date</Th>
          </tr>
        </Thead>
        <tbody>
          {!academicYearId ? (
            <EmptyRow colSpan={7}>Pick an academic year above.</EmptyRow>
          ) : data === null ? (
            <EmptyRow colSpan={7}>Loading...</EmptyRow>
          ) : students.length === 0 ? (
            <EmptyRow colSpan={7}>No dismissed students match these filters.</EmptyRow>
          ) : (
            students.map((s) => {
              const meta = DECISION_META[s.decision] || { label: s.decision, className: "text-slate-600" };
              const bySystem = s.decidedBy === "System";
              return (
                <tr key={s.deliberationId}>
                  <Td className="max-w-[160px] sm:max-w-[220px]">
                    <div className="font-medium text-slate-800 truncate">
                      {s.firstName} {s.lastName}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {s.admissionNumber || "—"}
                      {s.className ? ` · ${s.className}` : ""}
                      <span className="lg:hidden">{s.termName ? ` · ${s.termName}` : ""}</span>
                    </div>
                  </Td>
                  <Td className="hidden lg:table-cell">{s.className || "—"}</Td>
                  <Td className="hidden lg:table-cell">{s.termName || "—"}</Td>
                  <Td className="whitespace-nowrap">
                    <span className={meta.className}>{meta.label}</span>
                    {bySystem && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-violet-700 sm:hidden">
                        <Cpu size={11} /> System
                      </span>
                    )}
                  </Td>
                  <Td className="hidden md:table-cell max-w-[180px] xl:max-w-[260px] truncate" title={s.reason || ""}>
                    {s.reason || "—"}
                  </Td>
                  <Td className="hidden sm:table-cell whitespace-nowrap">
                    {bySystem ? (
                      <span className="inline-flex items-center gap-1 text-violet-700">
                        <Cpu size={12} /> System
                      </span>
                    ) : (
                      s.decidedBy || "—"
                    )}
                  </Td>
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
