class ApiError extends Error {
  constructor(statusCode, code, message, field = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
  }

  static badRequest(message, field) {
    return new ApiError(400, "VALIDATION_ERROR", message, field);
  }
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Forbidden") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static conflict(message = "Conflict", code = "DUPLICATE_ENTRY") {
    return new ApiError(409, code, message);
  }
}

module.exports = ApiError;
