import api from "./client";

// Builds multipart/form-data for endpoints that accept evidence files
// alongside regular fields — axios sets the multipart Content-Type (with
// boundary) automatically whenever the body is a FormData instance.
function toFormData(payload, files) {
  const fd = new FormData();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) fd.append(key, value);
  });
  (files || []).forEach((file) => fd.append("evidence", file));
  return fd;
}

export const getAcademicYears = () => api.get("/reference/academic-years").then((r) => r.data);
export const getTerms = (academicYearId) =>
  api.get("/reference/terms", { params: { academicYearId } }).then((r) => r.data);
export const getClasses = (academicYearId) =>
  api.get("/reference/classes", { params: { academicYearId } }).then((r) => r.data);
export const getStudents = (classId, termId) =>
  api.get("/reference/students", { params: { classId, termId } }).then((r) => r.data);
export const searchStudents = (q) => api.get("/reference/students/search", { params: { q } }).then((r) => r.data);
export const getDisciplineStaff = () => api.get("/reference/discipline-staff").then((r) => r.data);

export const getMisconductTypes = () => api.get("/misconduct-types").then((r) => r.data);
export const createMisconductType = (payload) => api.post("/misconduct-types", payload).then((r) => r.data);
export const updateMisconductType = (id, payload) => api.patch(`/misconduct-types/${id}`, payload).then((r) => r.data);
export const deleteMisconductType = (id) => api.delete(`/misconduct-types/${id}`).then((r) => r.data);

export const createReport = (payload, files) =>
  api
    .post("/misconduct-records/report", files && files.length ? toFormData(payload, files) : payload)
    .then((r) => r.data);
export const createRecord = (payload, files) =>
  api
    .post("/misconduct-records", files && files.length ? toFormData(payload, files) : payload)
    .then((r) => r.data);
export const bulkClassRecord = (payload) => api.post("/misconduct-records/class", payload).then((r) => r.data);
export const bulkClassReport = (payload) => api.post("/misconduct-records/class-report", payload).then((r) => r.data);
export const approveRecord = (id, payload) => api.patch(`/misconduct-records/${id}/approve`, payload).then((r) => r.data);
export const rejectRecord = (id, reason) => api.patch(`/misconduct-records/${id}/reject`, { reason }).then((r) => r.data);
export const bulkApproveRecords = (ids) => api.post("/misconduct-records/bulk-approve", { ids }).then((r) => r.data);
export const bulkRejectRecords = (ids, reason) => api.post("/misconduct-records/bulk-reject", { ids, reason }).then((r) => r.data);
export const listRecords = (params) => api.get("/misconduct-records", { params }).then((r) => r.data);
export const updateReport = (id, payload) => api.patch(`/misconduct-records/${id}`, payload).then((r) => r.data);
export const deleteReport = (id) => api.delete(`/misconduct-records/${id}`).then((r) => r.data);

export const addEvidence = (recordId, files) =>
  api.post(`/misconduct-records/${recordId}/evidence`, toFormData({}, files)).then((r) => r.data);
export const deleteEvidence = (recordId, evidenceId) =>
  api.delete(`/misconduct-records/${recordId}/evidence/${evidenceId}`).then((r) => r.data);
// responseType "blob" so the Authorization header still applies (a plain
// <a href>/<img src> can't carry it) — the caller turns this into an
// object URL to preview or download.
export const fetchEvidenceBlob = (recordId, evidenceId) =>
  api.get(`/misconduct-records/${recordId}/evidence/${evidenceId}`, { responseType: "blob" }).then((r) => r.data);

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
export const getWeekendPermission = (recordId) =>
  api.get(`/reports/record/${recordId}/weekend-permission`).then((r) => r.data);
export const getDismissedStudentsReport = (params) =>
  api.get("/reports/dismissed-students", { params }).then((r) => r.data);

export const getExceededStudents = (params) => api.get("/deliberations/exceeded", { params }).then((r) => r.data);
export const submitDeliberation = (payload) => api.post("/deliberations", payload).then((r) => r.data);
export const undoDeliberation = (id) => api.delete(`/deliberations/${id}`).then((r) => r.data);

export const openDiscussion = (payload) => api.post("/discussions", payload).then((r) => r.data);
export const closeDiscussion = (id, note) => api.patch(`/discussions/${id}/close`, { note }).then((r) => r.data);
export const reopenDiscussion = (id) => api.patch(`/discussions/${id}/reopen`).then((r) => r.data);
export const postDiscussionMessage = (id, message) =>
  api.post(`/discussions/${id}/messages`, { message }).then((r) => r.data);
export const getDiscussionForRecord = (misconductRecordId) =>
  api.get("/discussions", { params: { misconductRecordId } }).then((r) => r.data);
export const listDiscussions = (params) => api.get("/discussions", { params }).then((r) => r.data);
export const getDiscussion = (id) => api.get(`/discussions/${id}`).then((r) => r.data);
