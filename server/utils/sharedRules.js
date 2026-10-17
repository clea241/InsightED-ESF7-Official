// shared/ is an ES module folder; the server is CommonJS, so load it with dynamic import (cached).
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function resolveSharedUrl(file) {
  const candidates = [
    path.join(__dirname, "..", "..", "shared", file),
    path.join(__dirname, "..", "shared", file),
    path.join(process.cwd(), "shared", file),
    path.join(process.cwd(), "..", "shared", file),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return pathToFileURL(c).href;
    }
  }
  // Default to root-relative path if not directly detected
  return pathToFileURL(candidates[0]).href;
}

let timeAllotment;
let scheduleRules;
let allowanceRules;

async function loadTimeAllotment() {
  if (!timeAllotment)
    timeAllotment = import(resolveSharedUrl("timeAllotment.js"));
  return timeAllotment;
}

async function loadScheduleRules() {
  if (!scheduleRules)
    scheduleRules = import(resolveSharedUrl("scheduleRules.js"));
  return scheduleRules;
}

async function loadAllowanceRules() {
  if (!allowanceRules)
    allowanceRules = import(resolveSharedUrl("allowances.js"));
  return allowanceRules;
}

let schoolLevel;
let teacherSections;
async function loadSchoolLevel() {
  if (!schoolLevel) schoolLevel = import(resolveSharedUrl("schoolLevel.js"));
  return schoolLevel;
}

let duplicateAssignment;
async function loadDuplicateAssignment() {
  if (!duplicateAssignment)
    duplicateAssignment = import(resolveSharedUrl("duplicateAssignment.js"));
  return duplicateAssignment;
}

async function loadTeacherSections() {
  if (!teacherSections)
    teacherSections = import(resolveSharedUrl("teacherSections.js"));
  return teacherSections;
}

module.exports = {
  loadTimeAllotment,
  loadScheduleRules,
  loadAllowanceRules,
  loadSchoolLevel,
  loadTeacherSections,
  loadDuplicateAssignment,
};
