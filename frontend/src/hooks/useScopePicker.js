import { useEffect, useState } from "react";
import { getAcademicYears, getTerms, getClasses, getStudents } from "../api/sbms";
import { useGlobalScope } from "../context/ScopeContext";

/**
 * Loads academic years once, defaults to whichever is flagged current
 * (only if nothing's already selected globally), and cascades
 * terms/classes -> students as the person narrows their selection.
 * Shared by ReportMistake, Records, ClassReport, and Dashboard so the
 * "which year / term / class / student" picking logic only lives in one
 * place.
 *
 * academicYearId/termId come from ScopeContext (see context/ScopeContext)
 * so the choice persists across pages and page reloads — pick Term 2 on
 * the Dashboard, then click over to Records, and it's still Term 2, not
 * back to whatever's open. classId/studentId stay local to each page,
 * since which class/student someone's looking at is a per-page thing.
 */
export function useScopePicker({ needsStudent = true } = {}) {
  const { academicYearId, setAcademicYearId, termId, setTermId } = useGlobalScope();

  const [academicYears, setAcademicYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAcademicYears()
      .then((years) => {
        setAcademicYears(years);
        // Only fall back to "current" if nothing's already selected
        // (globally) — a year picked earlier, on this page or another,
        // should stick.
        if (!academicYearId) {
          const current = years.find((y) => y.isCurrent) || years[0];
          if (current) setAcademicYearId(String(current.id));
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    setClassId("");
    setStudentId("");
    getTerms(academicYearId).then((list) => {
      setTerms(list);
      // Keep the globally-selected term if it still belongs to this
      // academic year; otherwise (first load, or the year just changed)
      // fall back to whichever term is currently open in the shared
      // mid-term reporting system.
      const stillValid = list.some((t) => String(t.id) === String(termId));
      if (!termId || !stillValid) {
        const open = list.find((t) => !t.isLocked);
        setTermId(open ? String(open.id) : "");
      }
    });
    getClasses(academicYearId).then(setClasses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearId]);

  useEffect(() => {
    if (!needsStudent) return;
    if (!classId) {
      setStudents([]);
      return;
    }
    setStudentId("");
    // termId included: a student dismissed_permanently is excluded from
    // every term's roster, one dismissed_term is only excluded from the
    // term they were dismissed for — see referenceController.students.
    getStudents(classId, termId).then(setStudents);
  }, [classId, termId, needsStudent]);

  // Reports/records should only ever be created against the current
  // academic year — older years stay pickable here purely so their
  // existing history can still be browsed (Records/ClassReport/Dashboard
  // all share this hook), but pages that create new reports/records use
  // this flag to warn and block submission when something else is picked.
  const isCurrentAcademicYear =
    !academicYearId || academicYears.find((y) => String(y.id) === String(academicYearId))?.isCurrent !== false;

  return {
    academicYears,
    isCurrentAcademicYear,
    terms,
    classes,
    students,
    academicYearId,
    setAcademicYearId,
    termId,
    setTermId,
    classId,
    setClassId,
    studentId,
    setStudentId,
    loading,
  };
}
