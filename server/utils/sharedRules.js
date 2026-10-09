// shared/ is an ES module folder; the server is CommonJS, so load it with dynamic import (cached).
const path = require('path');
const { pathToFileURL } = require('url');

const sharedUrl = (file) => pathToFileURL(path.join(__dirname, '..', '..', 'shared', file)).href;

let timeAllotment;
let scheduleRules;
let allowanceRules;

async function loadTimeAllotment() {
  if (!timeAllotment) timeAllotment = import(sharedUrl('timeAllotment.js'));
  return timeAllotment;
}

async function loadScheduleRules() {
  if (!scheduleRules) scheduleRules = import(sharedUrl('scheduleRules.js'));
  return scheduleRules;
}

async function loadAllowanceRules() {
  if (!allowanceRules) allowanceRules = import(sharedUrl('allowances.js'));
  return allowanceRules;
}

module.exports = { loadTimeAllotment, loadScheduleRules, loadAllowanceRules };
