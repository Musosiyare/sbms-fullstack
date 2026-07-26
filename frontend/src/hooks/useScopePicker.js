import { useEffect, useState } from "react";
import { getAcademicYears, getTerms, getClasses, getStudents } from "../api/sbms";

/**
 * Loads academic years once, defaults to whichever is flagged current, and
 * cascades terms/classes -> students as the person narrows their
 * selection. Shared by ReportMistake, Records, and ClassReport so the
 * "which year / term / class / student" picking logic only lives in one
 * place.
 */
export function useScopePicker({ needsStudent = true } = {}) {
  const [academicYears, setAcademicYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);

  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAcademicYears()
      .then((years) => {
        setAcademicYears(years);
        const current = years.find((y) => y.isCurrent) || years[0];
        if (current) setAcademicYearId(String(current.id));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    setTermId("");
    setClassId("");
    setStudentId("");
    getTerms(academicYearId).then((list) => {
      setTerms(list);
      // Default to the term that's actually open in the shared mid-term
      // reporting system, since that's the only one anyone can pick for
      // a new report/record anyway. Falls back to nothing selected if
      // every term is locked (e.g. between terms).
      const open = list.find((t) => !t.isLocked);
      if (open) setTermId(String(open.id));
    });
    getClasses(academicYearId).then(setClasses);
  }, [academicYearId]);

  useEffect(() => {
    if (!needsStudent) return;
    if (!classId) {
      setStudents([]);
      return;
    }
    setStudentId("");
    getStudents(classId).then(setStudents);
  }, [classId, needsStudent]);

  return {
    academicYears,
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
