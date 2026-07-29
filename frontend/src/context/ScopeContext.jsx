import { createContext, useContext, useState } from "react";

const STORAGE_KEY = "sbms_scope";

const ScopeContext = createContext(null);

/**
 * Holds the "which academic year / term am I looking at" choice at the
 * app level instead of inside each page's own useScopePicker() call.
 * Before this, every page defaulted back to the current year + whichever
 * term is open the moment it mounted, so picking Term 2 on the Dashboard
 * and then clicking over to Records would silently snap back to Term 1
 * (or whatever's open) — there was nothing actually remembering the
 * choice between pages. Persisted to localStorage too, so it survives a
 * refresh, not just in-app navigation.
 *
 * Deliberately scoped to just academicYearId/termId — class and student
 * selections stay local to whichever page picks them (useScopePicker's
 * own state), since which class/student someone's looking at is a
 * per-page thing, not a school-wide "what point in time am I viewing"
 * setting the way year/term is.
 */
export function ScopeProvider({ children }) {
  const [academicYearId, setAcademicYearIdState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").academicYearId || "";
    } catch {
      return "";
    }
  });
  const [termId, setTermIdState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").termId || "";
    } catch {
      return "";
    }
  });

  function persist(next) {
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...next }));
    } catch {
      // localStorage unavailable (e.g. private mode) — in-memory state still works for this session.
    }
  }

  function setAcademicYearId(id) {
    setAcademicYearIdState(id);
    persist({ academicYearId: id });
  }

  function setTermId(id) {
    setTermIdState(id);
    persist({ termId: id });
  }

  return (
    <ScopeContext.Provider value={{ academicYearId, setAcademicYearId, termId, setTermId }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useGlobalScope() {
  return useContext(ScopeContext);
}
