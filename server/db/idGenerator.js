const crypto = require("crypto");

function generateAlphanumericId(prefix) {
  const randomStr = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 character random uppercase hex string
  return `${prefix}-${randomStr}`;
}

function generateSchoolId() {
  return generateAlphanumericId("SCH");
}

function generatePersonnelId() {
  return crypto.randomUUID();
}

function generateEmploymentId() {
  return generateAlphanumericId("EMP");
}

function generateQualificationId() {
  return generateAlphanumericId("QLF");
}

function generateTrainingId() {
  return generateAlphanumericId("TRN");
}

function generateSectionId() {
  return generateAlphanumericId("SEC");
}

function generateWorkloadId() {
  return generateAlphanumericId("WKL");
}

function generateWorkloadDateId() {
  return generateAlphanumericId("WKD");
}

function generateTransferId() {
  return generateAlphanumericId("TRF");
}

function generateDesignationId() {
  return generateAlphanumericId("DSG");
}

module.exports = {
  generateSchoolId,
  generatePersonnelId,
  generateEmploymentId,
  generateQualificationId,
  generateTrainingId,
  generateSectionId,
  generateWorkloadId,
  generateWorkloadDateId,
  generateTransferId,
  generateDesignationId,
};
