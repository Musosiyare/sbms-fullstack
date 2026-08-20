import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { FileText, Download, AlertTriangle } from "lucide-react";
import PillSelect, { ScopeBar, ScopeGroup, YearSelect } from "../components/ui/PillSelect";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { useScopePicker } from "../hooks/useScopePicker";
import { useAuth } from "../context/AuthContext";
import { getClassScores } from "../api/sbms";
import ConductReportModal from "../components/ConductReportModal";
import ClassConductReportModal from "../components/ClassConductReportModal";

// Deliberation decision — plain colored text, no pill/background. One
// line only (term name inline, same color, slightly muted) so it never
// wraps or competes visually with the rest of the row.
const DELIBERATION_BADGE = {
  dismissed_permanently: { label: "Dismissed", className: "text-red-700" },
  dismissed_term: { label: "Dismissed (Term)", className: "text-amber-700" },
  stained: { label: "Stained", className: "text-slate-600" },
};

// Dismissed students get one quiet signal: a thin colored line down the
// left edge of the row. Everything else in the row — name, admission no.,
// marks — stays the same color and weight as any other row; only the
// Decision cell itself carries color, so there's exactly one place the
// eye needs to check, not five.
const DISMISSED_ROW = {
  dismissed_permanently: { cell: "border-l-2 border-l-red-400" },
  dismissed_term: { cell: "border-l-2 border-l-amber-400" },
};

const CAN_APPROVE = ["dean_of_discipline", "disciplinary_officer"];

export default function ClassReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canApprove = CAN_APPROVE.includes(user.sbmsRole);
  const scope = useScopePicker({ needsStudent: false });
  const [scores, setScores] = useState(null);
  const [reportStudentId, setReportStudentId] = useState(null);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);

  // Jumps to the Records page's "All Reports" queue, pre-filtered to this
  // student's pending report(s) so staff can act on it right away instead
  // of hunting for it again.
  function viewPendingReports(student) {
    const params = new URLSearchParams({
      tab: "reports",
      status: "pending",
      academicYearId: scope.academicYearId,
      classId: scope.classId,
      search: `${student.firstName} ${student.lastName}`.trim(),
    });
    navigate(`/records?${params.toString()}`);
  }

  useEffect(() => {
    if (!scope.classId || !scope.termId || !scope.academicYearId) {
      setScores(null);
      return;
    }
    getClassScores({ classId: scope.classId, termId: scope.termId, academicYearId: scope.academicYearId }).then(
      setScores
    );
  }, [scope.classId, scope.termId, scope.academicYearId]);

  const canOpenReports = Boolean(scope.classId && scope.termId && scope.academicYearId) && scores?.length > 0;

  return (
    <Card
      actions={
        <Button variant="primary" onClick={() => setReportsModalOpen(true)} disabled={!canOpenReports}>
          <Download size={15} /> Download reports
        </Button>
      }
    >
      <ScopeBar>
        <ScopeGroup label="Academic year">
          <YearSelect
            options={scope.academicYears.map((y) => ({ id: y.id, label: y.name, isCurrent: y.isCurrent }))}
            value={scope.academicYearId}
            onChange={scope.setAcademicYearId}
            emptyLabel="No academic years yet"
          />
        </ScopeGroup>
        <ScopeGroup label="Term">
          <PillSelect
            options={scope.terms.map((t) => ({ id: t.id, label: t.name, locked: t.isLocked }))}
            value={scope.termId}
            onChange={scope.setTermId}
            emptyLabel="Pick a year first"
          />
        </ScopeGroup>
        <ScopeGroup label="Class">
          <YearSelect
            options={scope.classes.map((c) => ({ id: c.id, label: c.name, isCurrent: true }))}
            value={scope.classId}
            onChange={scope.setClassId}
            emptyLabel="Pick a year first"
          />
        </ScopeGroup>
      </ScopeBar>

      <Table className="table-fixed min-w-[680px]">
        <Thead>
          <tr>
            <Th className="w-[14%]">Admission No.</Th>
            <Th className="w-[30%]">Student</Th>
            <Th className="w-[20%] text-center">Term Conduct /{scores?.[0]?.term.maxMarks ?? 40}</Th>
            <Th className="w-[36%] text-right">Report</Th>
          </tr>
        </Thead>
        <tbody>
          {!scope.classId || !scope.termId ? (
            <EmptyRow colSpan={4}>Pick a year, term, and class above.</EmptyRow>
          ) : scores === null ? (
            <EmptyRow colSpan={4}>Loading...</EmptyRow>
          ) : scores.length === 0 ? (
            <EmptyRow colSpan={4}>No students in this class.</EmptyRow>
          ) : (
            scores.map((s) => {
              // A student permanently dismissed in an earlier term this
              // year shouldn't read as a fresh, clean student just because
              // this later term has no records against them — they're not
              // enrolled. carriedOverDismissal (set by the backend when
              // that's the case) takes priority over this term's own
              // deliberation, which won't exist anyway.
              const toneKey = s.carriedOverDismissal ? "dismissed_permanently" : s.deliberation?.decision;
              const tone = DISMISSED_ROW[toneKey];
              return (
              <tr key={s.studentId}>
                <Td className={tone?.cell}>
                  <span className="font-bold text-slate-800">{s.admissionNumber || "—"}</span>
                </Td>
                <Td className="font-medium text-slate-800">
                  <div className="flex items-center gap-2">
                    <span>
                      {s.firstName} {s.lastName}
                    </span>
                    {s.pendingCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 whitespace-nowrap">
                        <AlertTriangle size={11} /> {s.pendingCount} pending
                      </span>
                    )}
                  </div>
                </Td>
                <Td className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    {s.carriedOverDismissal ? (
                      <span className="text-xs text-slate-400">N/A</span>
                    ) : (
                      <span className="font-bold tabular-nums text-slate-800">{s.term.remaining}</span>
                    )}
                    {s.carriedOverDismissal ? (
                      <span
                        className={`whitespace-nowrap text-xs font-medium ${DELIBERATION_BADGE.dismissed_permanently.className}`}
                        title={`Dismissed permanently in ${s.carriedOverDismissal.termName} — not enrolled this term`}
                      >
                        Dismissed · {s.carriedOverDismissal.termName}
                      </span>
                    ) : s.deliberation ? (
                      <span
                        className={`whitespace-nowrap text-xs font-medium ${
                          DELIBERATION_BADGE[s.deliberation.decision]?.className || "text-slate-600"
                        }`}
                      >
                        {DELIBERATION_BADGE[s.deliberation.decision]?.label || s.deliberation.decision}
                      </span>
                    ) : s.systemDeliberationThisYear ? (
                      // The system has already made its year-level call
                      // for this student, recorded against a different
                      // (later) term than the one being viewed here — so
                      // a per-term "At Risk"/"Good" judgment would be
                      // stale and misleading. Just the plain marks
                      // number, no badge, same as the branches above.
                      null
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.term.atRisk ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {s.term.atRisk ? "At Risk" : "Good"}
                      </span>
                    )}
                  </div>
                </Td>
                <Td className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {s.pendingCount > 0 && (
                      <button
                        onClick={() => viewPendingReports(s)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100"
                      >
                        <AlertTriangle size={13} /> {canApprove ? "Review to approve" : "View incidents"}
                      </button>
                    )}
                    <button
                      onClick={() => setReportStudentId(s.studentId)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-500 transition-colors hover:border-brand-400 hover:bg-brand-50"
                    >
                      <FileText size={13} /> View overall report
                    </button>
                  </div>
                </Td>
              </tr>
              );
            })
          )}
        </tbody>
      </Table>

      <ConductReportModal
        studentId={reportStudentId}
        termId={scope.termId}
        academicYearId={scope.academicYearId}
        onClose={() => setReportStudentId(null)}
      />
      {reportsModalOpen && (
        <ClassConductReportModal
          classId={scope.classId}
          termId={scope.termId}
          academicYearId={scope.academicYearId}
          onClose={() => setReportsModalOpen(false)}
        />
      )}
    </Card>
  );
}
