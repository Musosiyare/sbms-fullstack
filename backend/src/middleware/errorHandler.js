const multer = require("multer");
const ApiError = require("../utils/ApiError");

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "One of these files is too large — evidence uploads are capped at 15MB each.",
      LIMIT_FILE_COUNT: "Too many files at once — attach up to 6 files per upload.",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field.",
    };
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: messages[err.code] || err.message },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, field: err.field },
    });
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      error: { code: "DUPLICATE_ENTRY", message: "A record with these values already exists" },
    });
  }

  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: err.errors?.[0]?.message || "Invalid data" },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: { code: "SERVER_ERROR", message: "Something went wrong. Please try again." },
  });
};
