const crypto = require('crypto');

function generateAlphanumericId(prefix) {
  const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 character random uppercase hex string
  return `${prefix}-${randomStr}`;
}

module.exports = {
  generateSchoolId: () => generateAlphanumericId('SCH'),
  generatePersonnelId: () => generateAlphanumericId('PER'),
  generateEmploymentId: () => generateAlphanumericId('EMP'),
  generateQualificationId: () => generateAlphanumericId('QLF'),
  generateTrainingId: () => generateAlphanumericId('TRN'),
  generateSectionId: () => generateAlphanumericId('SEC'),
  generateWorkloadId: () => generateAlphanumericId('WKL'),
  generateWorkloadDateId: () => generateAlphanumericId('WKD'),
  generateTransferId: () => generateAlphanumericId('TRF'),
  generateDesignationId: () => generateAlphanumericId('DSG')
};
