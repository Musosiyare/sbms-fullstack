const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const ApiError = require("../utils/ApiError");

// Evidence files live outside the repo's tracked source, next to the rest
// of the backend (backend/uploads/evidence) — never served statically;
// every read goes through the authenticated download route in
// misconductRecordController so a file can never leak across schools.
const EVIDENCE_DIR = path.join(__dirname, "..", "..", "uploads", "evidence");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

// Photos of the incident/damage, scanned notes, and typed-up write-ups —
// covers what "evidence" realistically means here (a scanned document is
// just an image or a PDF from a scanner app, so no separate case needed).
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB per file
const MAX_FILES = 6; // per upload

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, EVIDENCE_DIR);
  },
  filename(req, file, cb) {
    // Generated name only — the original filename is preserved separately
    // on the MisconductEvidence row (fileName) and restored on download,
    // so this never has to double as anything human-readable.
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      ApiError.badRequest(
        "Evidence must be an image (JPG, PNG, WEBP, HEIC), a PDF, or a Word document.",
        "evidence"
      )
    );
  }
  cb(null, true);
}

const evidenceUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
}).array("evidence", MAX_FILES);

module.exports = { evidenceUpload, EVIDENCE_DIR, MAX_FILE_SIZE, MAX_FILES };
