import api from "./client";

export const getAcademicYears = () => api.get("/reference/academic-years").then((r) => r.data);
export const getTerms = (academicYearId) =>
  api.get("/reference/terms", { params: { academicYearId } }).then((r) => r.data);
export const getClasses = (academicYearId) =>
  api.get("/reference/classes", { params: { academicYearId } }).then((r) => r.data);
export const getStudents = (classId) => api.get("/reference/students", { params: { classId } }).then((r) => r.data);
export const getDisciplineStaff = () => api.get("/reference/discipline-staff").then((r) => r.data);

export const getMisconductTypes = () => api.get("/misconduct-types").then((r) => r.data);
export const createMisconductType = (payload) => api.post("/misconduct-types", payload).then((r) => r.data);
export const updateMisconductType = (id, payload) => api.patch(`/misconduct-types/${id}`, payload).then((r) => r.data);
export const deleteMisconductType = (id) => api.delete(`/misconduct-types/${id}`).then((r) => r.data);

export const createReport = (payload) => api.post("/misconduct-records/report", payload).then((r) => r.data);
export const createRecord = (payload) => api.post("/misconduct-records", payload).then((r) => r.data);
export const approveRecord = (id, payload) => api.patch(`/misconduct-records/${id}/approve`, payload).then((r) => r.data);
export const rejectRecord = (id, reason) => api.patch(`/misconduct-records/${id}/reject`, { reason }).then((r) => r.data);
export const bulkApproveRecords = (ids) => api.post("/misconduct-records/bulk-approve", { ids }).then((r) => r.data);
export const bulkRejectRecords = (ids, reason) => api.post("/misconduct-records/bulk-reject", { ids, reason }).then((r) => r.data);
export const listRecords = (params) => api.get("/misconduct-records", { params }).then((r) => r.data);

export const getClassScores = (params) => api.get("/reports/class", { params }).then((r) => r.data);
export const getStudentScore = (studentId, params) =>
  api.get(`/reports/student/${studentId}`, { params }).then((r) => r.data);
export const getStudentConductReport = (studentId, params) =>
  api.get(`/reports/student/${studentId}/conduct`, { params }).then((r) => r.data);
export const getClassConductReport = (classId, params) =>
  api.get(`/reports/class/${classId}/conduct`, { params }).then((r) => r.data);
export const getStudentYearlyConductReport = (studentId, params) =>
  api.get(`/reports/student/${studentId}/yearly-conduct`, { params }).then((r) => r.data);
export const getClassYearlyConductReport = (classId, params) =>
  api.get(`/reports/class/${classId}/yearly-conduct`, { params }).then((r) => r.data);

export const openDiscussion = (payload) => api.post("/discussions", payload).then((r) => r.data);
export const closeDiscussion = (id, note) => api.patch(`/discussions/${id}/close`, { note }).then((r) => r.data);
export const reopenDiscussion = (id) => api.patch(`/discussions/${id}/reopen`).then((r) => r.data);
export const postDiscussionMessage = (id, message) =>
  api.post(`/discussions/${id}/messages`, { message }).then((r) => r.data);
export const getDiscussionForRecord = (misconductRecordId) =>
  api.get("/discussions", { params: { misconductRecordId } }).then((r) => r.data);
export const listDiscussions = (params) => api.get("/discussions", { params }).then((r) => r.data);
export const getDiscussion = (id) => api.get(`/discussions/${id}`).then((r) => r.data);
