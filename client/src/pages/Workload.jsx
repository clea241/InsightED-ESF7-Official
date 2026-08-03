import React, { useState, useEffect, useRef } from 'react';

const isAdvisorySub = (sub) => {
  if (!sub) return false;
  const s = String(sub).toUpperCase();
  return s === 'ADVISORY' || s.includes('HOMEROOM GUIDANCE') || s.includes('HGP');
};

const isRemediationSub = (sub) => {
  if (!sub) return false;
  const s = String(sub).toUpperCase();
  return s === 'REMEDIATION' || s.includes('REMEDIAL') || s.includes('ENHANCEMENT');
};

const isAdvisoryOrHgpPair = (rA, rB) => {
  if (!rA || !rB) return false;
  const subA = rA.subject || rA.task || '';
  const subB = rB.subject || rB.task || '';
  if (isAdvisorySub(subA) || isAdvisorySub(subB)) {
    return true;
  }
  return false;
};

function generateWorkloadDelegationHTML({ schoolInfo, selectedTeachers, classSections, customSubjects, GRADE_LEVEL_SUBJECTS, REMEDIATION_FOCUS_BY_CATEGORY }) {
  const payloadData = {
    version: 'INSIGHTED_WORKLOAD_DELEGATION_V1',
    schoolName: schoolInfo?.schoolName || 'DepEd School',
    schoolYear: schoolInfo?.schoolYear || 'SY 26-27',
    generatedAt: new Date().toISOString(),
    gradeSubjects: GRADE_LEVEL_SUBJECTS,
    remediationFocusMap: REMEDIATION_FOCUS_BY_CATEGORY,
    sections: (classSections || []).map(s => ({
      id: s.id,
      sectionName: s.sectionName || s.section_name || '',
      gradeLevel: s.gradeLevel || s.grade_level || ''
    })),
    teachers: selectedTeachers.map(t => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      position: t.position || 'Teacher',
      workloadRows: (t.workloadRows || []).map(r => ({
        id: r.id || `r-${Math.random().toString(36).substring(2, 7)}`,
        category: r.category || 'Elementary',
        subject: r.subject || '',
        remediationSubject: r.remediationSubject || '',
        gradeLevel: r.gradeLevel || '',
        sectionName: r.sectionName || r.section_name || '',
        startTime: r.startTime || (r.subject === 'ADVISORY' || r.subject === 'HGP' ? '07:30' : '08:00'),
        endTime: r.endTime || (r.subject === 'ADVISORY' || r.subject === 'HGP' ? '08:30' : '09:00'),
        days: Array.isArray(r.days) ? r.days : ['M', 'T', 'W', 'TH', 'F']
      }))
    })),
    customSubjects: customSubjects || []
  };

  const rawJson = JSON.stringify(payloadData);
  const jsonB64 = btoa(unescape(encodeURIComponent(rawJson)));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InsightED Workload Delegation Package — ${payloadData.schoolName}</title>
  <style>
    :root {
      --navy: #0f172a;
      --blue: #0284c7;
      --blue-light: #eff6ff;
      --border: #cbd5e1;
      --bg: #f8fafc;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: #334155;
    }
    header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: white;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    header h1 { margin: 0; font-size: 20px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
    header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .export-btn {
      background: linear-gradient(180deg, #10b981, #059669);
      color: white;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }
    .export-btn:hover { opacity: 0.95; }
    .container {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 20px;
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .sidebar {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      height: calc(100vh - 120px);
      overflow-y: auto;
    }
    .sidebar h3 { margin: 0 0 12px; font-size: 14px; color: var(--navy); }
    .teacher-item {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      margin-bottom: 4px;
      transition: all 0.15s;
    }
    .teacher-item:hover { background: #f1f5f9; }
    .teacher-item.active { background: #eff6ff; border-color: #bfdbfe; font-weight: bold; color: #1e40af; }
    .teacher-item .name { font-size: 13px; font-weight: 700; margin: 0; }
    .teacher-item .pos { font-size: 11px; color: #64748b; margin: 2px 0 0; }
    .main-editor {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid var(--border);
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .add-row-btn {
      background: #0284c7;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f8fafc; padding: 10px 8px; text-align: left; border-bottom: 2px solid var(--border); font-weight: 700; color: var(--navy); }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
    input, select { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 12px; width: 100%; box-sizing: border-box; }
    .day-chk { display: flex; gap: 4px; }
    .day-chk label { font-size: 10px; font-weight: bold; cursor: pointer; padding: 2px 4px; border: 1px solid #e2e8f0; border-radius: 4px; }
    .day-chk input { width: auto; }
    .del-btn { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>📋 Workload Delegation Package</h1>
      <p>${payloadData.schoolName} | ${payloadData.schoolYear}</p>
    </div>
    <button class="export-btn" onclick="exportReturnPayload()">📥 Save & Download Return File (.json)</button>
  </header>

  <div class="container">
    <div class="sidebar">
      <h3>Assigned Teachers (<span id="t-count">0</span>)</h3>
      <div id="teacher-list"></div>
    </div>
    <div class="main-editor">
      <div class="editor-header">
        <div>
          <h2 id="active-t-name" style="margin: 0; font-size: 18px; color: var(--navy);">Select a Teacher</h2>
          <span id="active-t-pos" style="font-size: 12px; color: #64748b;">Choose a teacher from the left to edit workload.</span>
        </div>
        <button class="add-row-btn" onclick="addWorkloadRow()">+ Add Workload Row</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div style="background: #f8fafc; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Weekly Teaching Load</div>
          <div id="stat-weekly-hours" style="font-size: 18px; font-weight: 800; color: var(--navy);">0.0 hrs/wk</div>
        </div>
        <div style="background: #f8fafc; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Daily Avg Load</div>
          <div id="stat-daily-avg" style="font-size: 18px; font-weight: 800; color: var(--navy);">0.0 hrs/day</div>
        </div>
        <div id="stat-overload-card" style="background: #f8fafc; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Weekly Overload</div>
          <div id="stat-overload" style="font-size: 18px; font-weight: 800; color: var(--navy);">0.0 hrs/wk</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 240px;">Class Section</th>
            <th style="width: 220px;">Subject</th>
            <th style="width: 140px;">Days</th>
            <th style="width: 100px;">Start Time</th>
            <th style="width: 100px;">End Time</th>
            <th style="width: 60px;">Action</th>
          </tr>
        </thead>
        <tbody id="workload-rows">
          <tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 30px;">Select a teacher on the left to begin encoding workload.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let data = { teachers: [], sections: [] };
    try {
      const rawJsonStr = decodeURIComponent(escape(atob("${jsonB64}")));
      data = JSON.parse(rawJsonStr);
    } catch(e) {
      console.error("Payload decode error:", e);
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:red"><h2>⚠️ Payload Parsing Error</h2><pre>' + e.message + '</pre></div>';
    }
    let activeTeacherId = null;

    document.getElementById('t-count').innerText = (data.teachers || []).length;

    function calculateTeacherWorkload(t) {
      if (!t || !t.workloadRows) return { weeklyHours: '0.0', dailyAvg: '0.0', overload: '0.0' };
      const daysList = ['M', 'T', 'W', 'TH', 'F'];
      let totalMins = 0;

      for (const d of daysList) {
        const intervals = [];
        for (const r of t.workloadRows) {
          if ((r.days || []).includes(d)) {
            const subUpper = String(r.subject || '').toUpperCase().trim();
            if (subUpper === 'HGP') {
              continue;
            } else if (subUpper === 'ADVISORY') {
              totalMins += 60;
            } else if (r.startTime && r.endTime) {
              const [sh, sm] = r.startTime.split(':').map(Number);
              const [eh, em] = r.endTime.split(':').map(Number);
              if (sh !== undefined && eh !== undefined) {
                intervals.push([sh * 60 + sm, eh * 60 + em]);
              }
            }
          }
        }

        if (intervals.length > 0) {
          intervals.sort((a, b) => a[0] - b[0]);
          let merged = [intervals[0]];
          for (let i = 1; i < intervals.length; i++) {
            const current = intervals[i];
            const lastMerged = merged[merged.length - 1];
            if (current[0] <= lastMerged[1]) {
              lastMerged[1] = Math.max(lastMerged[1], current[1]);
            } else {
              merged.push(current);
            }
          }
          for (const [start, end] of merged) {
            totalMins += (end - start);
          }
        }
      }

      const weeklyHoursNum = totalMins / 60;
      const weeklyHours = weeklyHoursNum.toFixed(1);
      const dailyAvg = (weeklyHoursNum / 5).toFixed(1);
      const overloadNum = Math.max(0, weeklyHoursNum - 30);
      const overload = overloadNum.toFixed(1);

      return { weeklyHours, dailyAvg, overload, overloadNum };
    }

    function getSubjectsForGradeInHTML(grade, category) {
      let list = [];
      if (grade && data.gradeSubjects && data.gradeSubjects[grade]) {
        list = data.gradeSubjects[grade];
      } else if (category && data.gradeSubjects && data.gradeSubjects[category]) {
        list = data.gradeSubjects[category];
      } else if (category && category.startsWith('SHS')) {
        list = (data.gradeSubjects && data.gradeSubjects['SHS-CORE SUBJECTS']) || [];
      } else {
        list = (data.gradeSubjects && (data.gradeSubjects['Grade 1'] || data.gradeSubjects['Elementary'])) || [];
      }

      if (data.customSubjects && Array.isArray(data.customSubjects)) {
        const customNames = data.customSubjects.map(cs => typeof cs === 'string' ? cs : cs.name).filter(Boolean);
        list = Array.from(new Set([...list, ...customNames]));
      }

      // Unify REMEDIATION & REMEDIAL/ENHANCEMENT CLASS into one subject option, and filter out ADVISORY from dropdowns
      list = list.map(s => (s === 'REMEDIATION' || s === 'REMEDIAL/ENHANCEMENT CLASS') ? 'REMEDIAL / ENHANCEMENT CLASS' : s)
                 .filter(s => s !== 'ADVISORY');

      return Array.from(new Set(list));
    }

    function renderTeacherList() {
      const listEl = document.getElementById('teacher-list');
      if (!listEl) return;
      listEl.innerHTML = '';
      data.teachers.forEach((t, idx) => {
        const stats = calculateTeacherWorkload(t);
        const item = document.createElement('div');
        item.className = 'teacher-item' + (String(t.id) === String(activeTeacherId) ? ' active' : '');
        item.innerHTML = '<div class="name">' + (t.lastName || '') + ', ' + (t.firstName || '') + '</div><div class="pos">' + (t.position || 'Teacher') + ' (' + ((t.workloadRows || []).length) + ' rows · ' + stats.weeklyHours + 'h)</div>';
        item.onclick = () => selectTeacher(t.id);
        listEl.appendChild(item);
      });
    }

    function selectTeacher(id) {
      activeTeacherId = id;
      renderTeacherList();
      const t = data.teachers.find(x => String(x.id) === String(id));
      if (!t) return;
      const nameEl = document.getElementById('active-t-name');
      const posEl = document.getElementById('active-t-pos');
      if (nameEl) nameEl.innerText = (t.firstName || '') + ' ' + (t.lastName || '');
      if (posEl) posEl.innerText = t.position || 'Teacher';
      renderWorkloadRows();
    }

    function renderWorkloadRows() {
      const tbody = document.getElementById('workload-rows');
      if (!tbody) return;
      tbody.innerHTML = '';
      const t = data.teachers.find(x => String(x.id) === String(activeTeacherId));
      if (!t) return;

      const stats = calculateTeacherWorkload(t);
      document.getElementById('stat-weekly-hours').innerText = stats.weeklyHours + ' hrs/wk';
      document.getElementById('stat-daily-avg').innerText = stats.dailyAvg + ' hrs/day';
      document.getElementById('stat-overload').innerText = stats.overload + ' hrs/wk';

      const ovCard = document.getElementById('stat-overload-card');
      if (stats.overloadNum > 0) {
        ovCard.style.background = '#fffbeb';
        ovCard.style.borderColor = '#f59e0b';
        document.getElementById('stat-overload').style.color = '#b45309';
      } else {
        ovCard.style.background = '#f8fafc';
        ovCard.style.borderColor = 'var(--border)';
        document.getElementById('stat-overload').style.color = 'var(--navy)';
      }

      if (t.workloadRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 30px;">No workload rows. Click "+ Add Workload Row" above.</td></tr>';
        return;
      }

      t.workloadRows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const availableSubjects = getSubjectsForGradeInHTML(row.gradeLevel, row.category);
        const subUpper = String(row.subject || '').toUpperCase().trim();
        const isLockedSub = subUpper === 'ADVISORY' || subUpper === 'HGP' || subUpper === 'HOMEROOM GUIDANCE';

        // 1. Class Section Cell
        const tdSec = document.createElement('td');
        if (isLockedSub) {
          tdSec.innerHTML = '<span style="font-weight: 700; color: var(--navy); font-size: 12px;">[' + (row.gradeLevel || 'Advisory') + '] ' + (row.sectionName || 'Assigned Section') + ' 🔒</span>';
        } else if (data.sections && data.sections.length > 0) {
          const selSec = document.createElement('select');
          selSec.onchange = function() { updateSection(idx, this.value); };
          let opts = '<option value="">-- Choose Section --</option>';
          data.sections.forEach(function(s) {
            const sel = (row.sectionName === s.sectionName) ? 'selected' : '';
            opts += '<option value="' + s.sectionName + '" ' + sel + '>[' + s.gradeLevel + '] ' + s.sectionName + '</option>';
          });
          selSec.innerHTML = opts;
          tdSec.appendChild(selSec);
        } else {
          const inpSec = document.createElement('input');
          inpSec.type = 'text';
          inpSec.value = row.sectionName || '';
          inpSec.placeholder = 'Section name...';
          inpSec.onchange = function() { updateRow(idx, 'sectionName', this.value); };
          tdSec.appendChild(inpSec);
        }
        tr.appendChild(tdSec);

        // 2. Subject Cell
        const tdSub = document.createElement('td');
        if (isLockedSub) {
          tdSub.innerHTML = '<span style="font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 4px 10px; border-radius: 12px; font-size: 11px;">' + row.subject + ' 🔒</span>';
        } else {
          const selSub = document.createElement('select');
          const hasSection = Boolean(row.sectionId || row.sectionName);
          if (!hasSection) {
            selSub.disabled = true;
          }
          selSub.onchange = function() { updateSubjectWithRemediation(idx, this.value); };
          let subOpts = hasSection ? '<option value="">-- Select Subject --</option>' : '<option value="">-- Choose Section First --</option>';
          availableSubjects.forEach(function(sub) {
            const sel = (row.subject === sub) ? 'selected' : '';
            subOpts += '<option value="' + sub + '" ' + sel + '>' + sub + '</option>';
          });
          selSub.innerHTML = subOpts;
          tdSub.appendChild(selSub);

          if (subUpper.includes('REMEDIAL') || subUpper.includes('ENHANCEMENT') || subUpper === 'REMEDIATION') {
            const selRem = document.createElement('select');
            selRem.style.marginTop = '6px';
            selRem.style.borderColor = '#0284c7';
            selRem.style.background = '#f0f9ff';
            selRem.style.fontWeight = '600';
            selRem.style.color = '#0369a1';
            selRem.onchange = function() { updateRow(idx, 'remediationSubject', this.value); };

            const listOpts = (data.remediationFocusMap ? (row.category === 'Elementary' ? data.remediationFocusMap['Elementary'] : (data.remediationFocusMap[row.category] || data.remediationFocusMap['ALL'])) : []) || [];
            const currentRem = row.remediationSubject || (row.gradeLevel === 'Kinder' ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN');
            let remOpts = '<option value="">-- Select Remediation Focus --</option>';
            listOpts.forEach(function(opt) {
              const sel = (currentRem === opt) ? 'selected' : '';
              remOpts += '<option value="' + opt + '" ' + sel + '>Focus: ' + opt + '</option>';
            });
            selRem.innerHTML = remOpts;
            tdSub.appendChild(selRem);
          }
        }
        tr.appendChild(tdSub);

        // 3. Days Cell
        const tdDays = document.createElement('td');
        const divDays = document.createElement('div');
        divDays.className = 'day-chk';
        ['M','T','W','TH','F'].forEach(function(d) {
          const lbl = document.createElement('label');
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          if ((row.days || []).includes(d)) chk.checked = true;
          if (isLockedSub && subUpper === 'ADVISORY') chk.disabled = true;
          chk.onchange = function() { toggleDay(idx, d); };
          lbl.appendChild(chk);
          lbl.appendChild(document.createTextNode(d));
          divDays.appendChild(lbl);
        });
        tdDays.appendChild(divDays);
        tr.appendChild(tdDays);

        // 4. Start & End Time Cells
        if (subUpper === 'ADVISORY') {
          const tdTime = document.createElement('td');
          tdTime.colSpan = 2;
          tdTime.style.textAlign = 'center';
          tdTime.innerHTML = '<span style="font-size: 11px; color: #0284c7; background: #e0f2fe; padding: 4px 10px; border-radius: 6px; font-weight: bold;">⏱️ 60 Mins / Day (Fixed)</span>';
          tr.appendChild(tdTime);
        } else {
          const tdStart = document.createElement('td');
          const inpStart = document.createElement('input');
          inpStart.type = 'time';
          inpStart.value = row.startTime || '08:00';
          inpStart.onchange = function() { updateRow(idx, 'startTime', this.value); };
          tdStart.appendChild(inpStart);
          tr.appendChild(tdStart);

          const tdEnd = document.createElement('td');
          const inpEnd = document.createElement('input');
          inpEnd.type = 'time';
          inpEnd.value = row.endTime || '09:00';
          inpEnd.onchange = function() { updateRow(idx, 'endTime', this.value); };
          tdEnd.appendChild(inpEnd);
          tr.appendChild(tdEnd);
        }

        // 6. Action Cell
        const tdAct = document.createElement('td');
        if (isLockedSub) {
          tdAct.innerHTML = '<span style="font-size: 11px; color: #94a3b8; font-weight: bold;">🔒 Locked</span>';
        } else {
          const btnDel = document.createElement('button');
          btnDel.className = 'del-btn';
          btnDel.innerText = '✕';
          btnDel.onclick = function() { deleteRow(idx); };
          tdAct.appendChild(btnDel);
        }
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
    }

    function updateSection(idx, val) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (!t || !t.workloadRows[idx]) return;

      const sec = (data.sections || []).find(s => s.sectionName === val || String(s.id) === String(val));
      if (sec) {
        t.workloadRows[idx].sectionId = String(sec.id);
        t.workloadRows[idx].sectionName = sec.sectionName;
        t.workloadRows[idx].gradeLevel = sec.gradeLevel;

        const g = String(sec.gradeLevel || '').toUpperCase();
        if (g.includes('11') || g.includes('12')) {
          t.workloadRows[idx].category = 'SHS';
        } else if (g.includes('7') || g.includes('8') || g.includes('9') || g.includes('10')) {
          t.workloadRows[idx].category = 'JHS';
        } else {
          t.workloadRows[idx].category = 'Elementary';
        }

        const available = getSubjectsForGradeInHTML(sec.gradeLevel, t.workloadRows[idx].category);
        if (!available.includes(t.workloadRows[idx].subject)) {
          t.workloadRows[idx].subject = '';
          t.workloadRows[idx].remediationSubject = '';
        }
      } else {
        t.workloadRows[idx].sectionId = '';
        t.workloadRows[idx].sectionName = '';
        t.workloadRows[idx].gradeLevel = '';
        t.workloadRows[idx].subject = '';
        t.workloadRows[idx].remediationSubject = '';
      }
      renderWorkloadRows();
      renderTeacherList();
    }

    function updateSubjectWithRemediation(idx, val) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (!t || !t.workloadRows[idx]) return;

      const row = t.workloadRows[idx];
      row.subject = val;
      const upperVal = String(val || '').toUpperCase().trim();
      if (upperVal.includes('REMEDIAL') || upperVal.includes('ENHANCEMENT') || upperVal === 'REMEDIATION') {
        if (!row.remediationSubject) {
          row.remediationSubject = (row.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN';
        }
      } else {
        row.remediationSubject = '';
      }
      renderWorkloadRows();
      renderTeacherList();
    }

    function addWorkloadRow() {
      if (!activeTeacherId) return alert('Please select a teacher first.');
      const t = data.teachers.find(x => x.id === activeTeacherId);

      let nextStart = '08:00';
      let nextEnd = '09:00';
      const rows = t.workloadRows || [];
      if (rows.length > 0) {
        const lastRow = rows[0];
        if (lastRow.endTime) {
          const [eh, em] = lastRow.endTime.split(':').map(Number);
          if (eh !== undefined && !isNaN(eh)) {
            const endMins = eh * 60 + (em || 0);
            nextStart = String(Math.floor(endMins / 60) % 24).padStart(2, '0') + ':' + String(endMins % 60).padStart(2, '0');
            const nextEndMins = endMins + 60;
            nextEnd = String(Math.floor(nextEndMins / 60) % 24).padStart(2, '0') + ':' + String(nextEndMins % 60).padStart(2, '0');
          }
        }
      }

      t.workloadRows.unshift({
        id: 'r-' + Date.now(),
        category: 'Elementary',
        gradeLevel: 'Grade 1',
        subject: '',
        sectionName: '',
        startTime: nextStart,
        endTime: nextEnd,
        days: ['M', 'T', 'W', 'TH', 'F']
      });

      renderTeacherList();
      renderWorkloadRows();
    }

    function checkTeacherConflictsInHTML(t) {
      if (!t || !t.workloadRows || t.workloadRows.length < 2) return null;

      for (let i = 0; i < t.workloadRows.length; i++) {
        for (let j = i + 1; j < t.workloadRows.length; j++) {
          const r1 = t.workloadRows[i];
          const r2 = t.workloadRows[j];

          const commonDays = (r1.days || []).filter(d => (r2.days || []).includes(d));
          if (commonDays.length === 0) continue;

          const sub1Upper = String(r1.subject || '').toUpperCase().trim();
          const sub2Upper = String(r2.subject || '').toUpperCase().trim();

          const isAdvHgpPair = (sub1Upper === 'ADVISORY' || sub1Upper === 'HGP' || sub1Upper.includes('HOMEROOM')) &&
                               (sub2Upper === 'ADVISORY' || sub2Upper === 'HGP' || sub2Upper.includes('HOMEROOM'));
          if (isAdvHgpPair) {
            const sec1 = String(r1.sectionId || r1.sectionName || '').trim();
            const sec2 = String(r2.sectionId || r2.sectionName || '').trim();
            if (!sec1 || !sec2 || sec1 === sec2) continue;
          }

          if (r1.startTime && r1.endTime && r2.startTime && r2.endTime) {
            const [s1h, s1m] = r1.startTime.split(':').map(Number);
            const [e1h, e1m] = r1.endTime.split(':').map(Number);
            const [s2h, s2m] = r2.startTime.split(':').map(Number);
            const [e2h, e2m] = r2.endTime.split(':').map(Number);

            const start1 = s1h * 60 + (s1m || 0);
            const end1 = e1h * 60 + (e1m || 0);
            const start2 = s2h * 60 + (s2m || 0);
            const end2 = e2h * 60 + (e2m || 0);

            if (start1 < end2 && end1 > start2) {
              return {
                sub1: r1.subject || 'Subject 1',
                sub2: r2.subject || 'Subject 2',
                days: commonDays.join(', '),
                time1: (r1.startTime || '') + ' - ' + (r1.endTime || ''),
                time2: (r2.startTime || '') + ' - ' + (r2.endTime || '')
              };
            }
          }
        }
      }
      return null;
    }

    function updateRow(idx, field, val) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (!t || !t.workloadRows[idx]) return;

      const row = t.workloadRows[idx];
      row[field] = val;

      const subUpper = String(row.subject || '').toUpperCase().trim();
      if (subUpper === 'ADVISORY') {
        row.startTime = '07:30';
        row.endTime = '08:30';
        row.days = ['M', 'T', 'W', 'TH', 'F'];
      }

      if (field === 'startTime' || field === 'endTime') {
        if (row.startTime && row.endTime) {
          const [sh, sm] = row.startTime.split(':').map(Number);
          const [eh, em] = row.endTime.split(':').map(Number);
          if (!isNaN(sh) && !isNaN(eh)) {
            const startMins = sh * 60 + (sm || 0);
            const endMins = eh * 60 + (em || 0);
            const diff = endMins - startMins;

            const isSHS = String(row.gradeLevel || '').includes('11') || String(row.gradeLevel || '').includes('12') || String(row.category || '').includes('SHS');
            const maxMins = isSHS ? 360 : 60;

            if (diff > maxMins) {
              const maxEndMins = startMins + maxMins;
              const maxH = String(Math.floor(maxEndMins / 60) % 24).padStart(2, '0');
              const maxM = String(maxEndMins % 60).padStart(2, '0');
              row.endTime = maxH + ':' + maxM;
              alert(isSHS 
                ? "⚠️ Senior High School (Grade 11 & 12) subject schedule cannot exceed 6 hours. Adjusted to 6 hours max."
                : "⚠️ A single subject period in workload cannot exceed 1 hour (60 minutes). Adjusted to 1 hour max."
              );
            } else if (diff < 0) {
              alert("⚠️ Invalid Time Range: End time must be strictly after start time.");
            }
          }
        }
      }

      renderWorkloadRows();
      renderTeacherList();

      const conflict = checkTeacherConflictsInHTML(t);
      if (conflict) {
        alert(['⚠️ Schedule Conflict Detected:', '"' + conflict.sub1 + '" (' + conflict.time1 + ') overlaps with "' + conflict.sub2 + '" (' + conflict.time2 + ') on ' + conflict.days + '.', 'Please adjust the schedule times to avoid double-booking.'].join('\\n'));
      }
    }

    function toggleDay(idx, day) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (t && t.workloadRows[idx]) {
        const row = t.workloadRows[idx];
        const subUpper = String(row.subject || '').toUpperCase().trim();
        if (subUpper === 'ADVISORY') {
          return alert('🔒 Advisory days are fixed to Monday through Friday (M-F).');
        }

        if (subUpper === 'HGP') {
          row.days = [day]; // HGP is strictly 1 day only
          renderWorkloadRows();
          renderTeacherList();
          return;
        }

        const days = row.days || [];
        if (days.includes(day)) {
          row.days = days.filter(d => d !== day);
        } else {
          row.days = [...days, day];
        }
        renderWorkloadRows();
        renderTeacherList();

        const conflict = checkTeacherConflictsInHTML(t);
        if (conflict) {
          alert(['⚠️ Schedule Conflict Detected:', '"' + conflict.sub1 + '" (' + conflict.time1 + ') overlaps with "' + conflict.sub2 + '" (' + conflict.time2 + ') on ' + conflict.days + '.', 'Please adjust the schedule times to avoid double-booking.'].join('\\n'));
        }
      }
    }

    function deleteRow(idx) {
      const t = data.teachers.find(x => x.id === activeTeacherId);
      if (t && t.workloadRows[idx]) {
        const subUpper = String(t.workloadRows[idx].subject || '').toUpperCase().trim();
        if (subUpper === 'ADVISORY' || subUpper === 'HGP' || subUpper === 'HOMEROOM GUIDANCE') {
          return alert('🔒 Advisory and HGP workload schedules are locked and cannot be deleted.');
        }
        t.workloadRows.splice(idx, 1);
        renderTeacherList();
        renderWorkloadRows();
      }
    }

    function exportReturnPayload() {
      const returnPayload = {
        version: 'INSIGHTED_WORKLOAD_DELEGATION_V1',
        schoolName: data.schoolName,
        schoolYear: data.schoolYear,
        returnedAt: new Date().toISOString(),
        teachersWorkload: {}
      };

      data.teachers.forEach(t => {
        returnPayload.teachersWorkload[t.id] = t.workloadRows;
      });

      const jsonStr = JSON.stringify(returnPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Workload_Return_' + (data.schoolName || 'School').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      alert('✅ Return Payload Downloaded Successfully! Send this .json file back to the School Head.');
    }

    renderTeacherList();
    if (data.teachers && data.teachers.length > 0) {
      selectTeacher(data.teachers[0].id);
    }
  </script>
</body>
</html>`;
}

const SearchableSelect = ({ value, onChange, options = [], disabled = false, placeholder = 'Select...' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  useEffect(() => {
    if (!isOpen) {
      setSearch(selectedOption ? selectedOption.label : '');
    }
  }, [value, isOpen, selectedOption]);

  const handleInputFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
  };

  // Deduplicate options by value to avoid React duplicate key warnings
  const uniqueOptionsMap = new Map();
  (options || []).forEach(opt => {
    if (opt && opt.value !== undefined && !uniqueOptionsMap.has(String(opt.value))) {
      uniqueOptionsMap.set(String(opt.value), opt);
    }
  });

  const filteredOptions = Array.from(uniqueOptionsMap.values()).filter(opt =>
    (opt.label || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (val) => {
    onChange({ target: { value: val } });
    setIsOpen(false);
  };

  return (
    <div className={`searchable-select-container ${disabled ? 'disabled' : ''}`} ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div className="searchable-select-input-wrapper" style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={isOpen ? search : (selectedOption ? selectedOption.label : '')}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="searchable-select-input"
          style={{
            width: '100%',
            paddingRight: '30px',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: `translateY(-50%) ${isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}`,
            pointerEvents: 'none',
            opacity: disabled ? 0.4 : 0.7,
            transition: 'transform 0.2s',
            fontSize: '10px'
          }}
        >
          ▼
        </span>
      </div>

      {isOpen && !disabled && (
        <div
          className="searchable-select-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: '100%',
            maxHeight: '220px',
            overflowY: 'auto',
            background: 'white',
            border: '1.5px solid var(--line)',
            borderRadius: '12px',
            marginTop: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 999
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <div
                key={`${opt.value}-${idx}`}
                onClick={() => handleSelect(opt.value)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: String(opt.value) === String(value) ? '700' : '500',
                  background: String(opt.value) === String(value) ? 'var(--blue-50)' : 'transparent',
                  color: String(opt.value) === String(value) ? 'var(--blue)' : 'var(--navy)',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--blue-50)'}
                onMouseLeave={(e) => e.target.style.background = String(opt.value) === String(value) ? 'var(--blue-50)' : 'transparent'}
              >
                {opt.label}
              </div>
            ))
          ) : (
            <div style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: '13px', textAlign: 'center' }}>
              No matches found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function DatePickerDropdowns({ value, onChange, disabled = false, maxDate, minDate, required = false }) {
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(new Date());
  const containerRef = React.useRef(null);

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const cleanValue = value ? (typeof value === 'string' ? value.substring(0, 10) : formatDate(value)) : '';

  React.useEffect(() => {
    if (cleanValue) {
      const d = new Date(cleanValue + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [cleanValue]);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDisplayDate = () => {
    if (!cleanValue) return 'Select date...';
    const d = new Date(cleanValue + 'T00:00:00');
    if (isNaN(d.getTime())) return 'Select date...';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const firstDayOfMonth = new Date(year, month, 1);
  let startDayIndex = firstDayOfMonth.getDay() - 1;
  if (startDayIndex < 0) startDayIndex = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startDayIndex - 1; i >= 0; i--) {
    cells.push({
      day: daysInPrevMonth - i,
      monthOffset: -1,
      date: new Date(year, month - 1, daysInPrevMonth - i)
    });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i,
      monthOffset: 0,
      date: new Date(year, month, i)
    });
  }
  const totalCells = 42;
  const nextPadding = totalCells - cells.length;
  for (let i = 1; i <= nextPadding; i++) {
    cells.push({
      day: i,
      monthOffset: 1,
      date: new Date(year, month + 1, i)
    });
  }

  const handleDaySelect = (cellDate, e) => {
    e.stopPropagation();
    if (disabled) return;
    if (maxDate && cellDate > maxDate) return;
    if (minDate && cellDate < minDate) return;
    onChange(formatDate(cellDate));
    setShowCalendar(false);
  };

  const isSelected = (cellDate) => {
    return cleanValue && formatDate(cellDate) === cleanValue;
  };

  const isDisabled = (cellDate) => {
    if (maxDate && cellDate > maxDate) return true;
    if (minDate && cellDate < minDate) return true;
    return false;
  };

  const isRed = required && !cleanValue;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => !disabled && setShowCalendar(!showCalendar)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: '12px',
          border: disabled ? '1.5px solid #e2e8f0' : (isRed ? '1.5px solid #EF4444' : '1.5px solid var(--line)'),
          background: disabled ? '#f1f5f9' : (isRed ? '#FEF2F2' : 'white'),
          color: cleanValue ? 'var(--navy)' : 'var(--muted)',
          fontFamily: 'inherit',
          fontSize: '14px',
          minHeight: '44px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        <span style={{ fontWeight: cleanValue ? '500' : 'normal' }}>{getDisplayDate()}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--blue)', opacity: disabled ? 0.5 : 1 }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>

      {showCalendar && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          marginTop: '8px',
          width: '290px',
          background: 'white',
          border: '1.5px solid var(--line)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          padding: '16px',
          zIndex: 1000,
          boxSizing: 'border-box'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#F1F5F9',
              borderRadius: '20px',
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--navy)',
              gap: '4px'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--muted)', marginRight: '2px' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <select
                value={month}
                onChange={(e) => setViewDate(new Date(year, Number(e.target.value), 1))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--navy)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              >
                {monthNames.map((mName, idx) => (
                  <option key={idx} value={idx}>{mName.toUpperCase()}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setViewDate(new Date(Number(e.target.value), month, 1))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--navy)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              >
                {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i).map((yVal) => (
                  <option key={yVal} value={yVal}>{yVal}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--navy)'
                }}
              >
                ←
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--navy)'
                }}
              >
                →
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '6px',
            textAlign: 'center',
            marginBottom: '8px'
          }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <span key={d} style={{
                fontSize: '12px',
                fontWeight: '500',
                color: 'var(--muted)'
              }}>
                {d}
              </span>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '6px',
            textAlign: 'center'
          }}>
            {cells.map((cell, idx) => {
              const active = cell.monthOffset === 0;
              const selected = isSelected(cell.date);
              const disabledDay = isDisabled(cell.date);

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabledDay}
                  onClick={(e) => handleDaySelect(cell.date, e)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: selected
                      ? '#2B3945'
                      : (formatDate(cell.date) === formatDate(new Date()) && !selected)
                        ? 'white'
                        : disabledDay
                          ? 'none'
                          : '#E9EFF6',
                    border: (formatDate(cell.date) === formatDate(new Date())) && !selected
                      ? '1.5px solid #2B3945'
                      : 'none',
                    color: selected
                      ? 'white'
                      : disabledDay
                        ? '#E2E8F0'
                        : active
                          ? '#2B3945'
                          : '#94A3B8',
                    fontSize: '13px',
                    fontWeight: selected ? '600' : 'normal',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: disabledDay ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!selected && !disabledDay) {
                      e.currentTarget.style.background = '#CBD5E1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected && !disabledDay) {
                      e.currentTarget.style.background = (formatDate(cell.date) === formatDate(new Date())) ? 'white' : '#E9EFF6';
                    }
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import {
  useApp,
  SUBJECT_OPTIONS,
  TEACHING_RELATED_TASK_OPTIONS,
  ADMINISTRATIVE_TASK_OPTIONS,
  POSITION_OPTIONS_BY_CATEGORY
} from '../context/AppContext';
import { api } from '../services/api';

let GRADE_LEVEL_SUBJECTS = {
  'Kinder': [
    'ADVISORY',
    'KINDER BLOCKS OF TIME',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 1': [
    'ADVISORY',
    'LANGUAGE',
    'LANGUAGE',
    'READING AND LITERACY',
    'MAKABANSA',
    'MATHEMATICS',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 2': [
    'ADVISORY',
    'HGP',
    'MAKABANSA',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 3': [
    'ADVISORY',
    'HGP',
    'MAKABANSA',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 4': [
    'ADVISORY',
    'HGP',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'EPP/TLE',
    'MAPEH',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 5': [
    'ADVISORY',
    'HGP',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'EPP/TLE',
    'MAPEH',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'Grade 6': [
    'ADVISORY',
    'HGP',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'EPP/TLE',
    'MAPEH',
    'GMRC',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON'
  ],
  'NON-GRADED': [
    'ADVISORY',
    'HGP',
    'KINDER BLOCKS OF TIME',
    'LANGUAGE',
    'READING AND LITERACY',
    'MAKABANSA',
    'ARALING PANLIPUNAN',
    'FILIPINO',
    'ENGLISH',
    'MATHEMATICS',
    'SCIENCE',
    'EPP/TLE',
    'MAPEH',
    'VALUES EDUCATION',
    'GMRC',
    'SPECIAL PROGRAM IN THE ARTS (SPA)',
    'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
    'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
    'SPECIAL PROGRAM IN SPORTS (SPS)',
    'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
    'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
    'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS',
    'ARAL - READING',
    'ARAL - MATH',
    'ARAL - SCIENCE',
    'REMEDIATION',
    'REMEDIAL/ENHANCEMENT CLASS',
    'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
    'TR - RESEARCH SCHOOL COORDINATOR',
    'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
    'TR - ICT SCHOOL COORDINATOR',
    'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
    'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
    'TR - SCHOOL PAPER TRAINER/ADVISER',
    'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
    'TR - SELG / SSLG TRAINER/ADVISER',
    'TR - GRADE LEVEL CHAIRPERSON',
    'TR - LEARNING AREA CHAIRPERSON',
    'COACHING AND MENTORING'
  ]
};

const JHS_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ARALING PANLIPUNAN',
  'FILIPINO',
  'ENGLISH',
  'MATHEMATICS',
  'SCIENCE',
  'EPP/TLE',
  'MAPEH',
  'VALUES EDUCATION',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON'
];

const SHS_SUBJECTS = [
  'ADVISORY',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ORAL COMMUNICATION',
  'READING AND WRITING',
  'KOMUNIKASYON AT PANANALIKSIK SA WIKA AT KULTURANG PILIPINO',
  "PAGBASA AT PAGSUSURI NG IBA'T-IBANG TEKSTO TUNGO SA PANANALIKSIK",
  '21ST CENTURY LITERATURE FROM THE PHILIPPINES AND THE WORLD',
  'CONTEMPORARY PHILIPPINE ARTS FROM THE REGIONS',
  'INTRODUCTION TO THE PHILOSOPHY OF THE HUMAN PERSON / PAMBUNGAD SA PILOSOPIYA NG TAO',
  'UNDERSTANDING CULTURE, SOCIETY AND POLITICS',
  'MEDIA AND INFORMATION LITERACY',
  'GENERAL MATHEMATICS',
  'STATISTICS AND PROBABILITY',
  'PHYSICAL SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PERSONAL DEVELOPMENT / PANSARILING KAUNLARAN',
  'PE AND HEALTH',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS',
  'ENGLISH FOR ACADEMIC AND PROFESSIONAL PURPOSES',
  'ENTREPRENEURSHIP',
  'PRACTICAL RESEARCH 1',
  'EMPOWERMENT TECHNOLOGIES (E-TECH): ICT FPR PROFESSIONAL TRACKS',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (AKADEMIK)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (TECH-VOC)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (ISPORTS)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (SINING)',
  'PRACTICAL RESEARCH 2',
  'RESEARCH PROJECT/CULMINATING ACTIVITY*',
  'BASIC CALCULUS',
  'GENERAL BIOLOGY 1',
  'GENERAL BIOLOGY 2',
  'GENERAL CHEMISTRY 1',
  'GENERAL CHEMISTRY 2',
  'GENERAL PHYSICS 1',
  'GENERAL PHYSICS 2',
  'PRE-CALCULUS',
  'APPLIED ECONOMICS',
  'BUSINESS ETHICS AND SOCIAL RESPONSIBILITY',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 1',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 2',
  'BUSINESS MATH',
  'BUSINESS FINANCE',
  'ORGANIZATION AND MANAGEMENT',
  'PRINCIPLES OF MARKETING',
  'CREATIVE NONFICTION',
  'CREATIVE WRITING/MALIKHAING PAGSULAT',
  'INTRODUCTION TO WORLD RELIGIONS AND BELIEF SYSTEMS',
  'TRENDS, NETWORKS, AND CRITICAL THINKING IN THE 21ST CENTURY CULTURE',
  'COMMUNITY ENGAGEMENT, SOLIDARITY, AND CITIZENSHIP',
  'DISCIPLINE AND IDEAS IN THE APPLIED SCIENCES',
  'DISCIPLINES AND IDEAS IN THE SOCIAL SCIENCES',
  'PHILIPPINE POLITICS AND GOVERNANCE',
  'DISASTER READINESS AND RISK REDUCTION (GAS)',
  'APPRENTICESHIP AND EXPLORATION OF DIFFERENT ARTS FIELDS',
  'CREATIVE INDUSTRIES I: ARTS AND DESIGN APPRECIATION AND PRODUCTION',
  'CREATIVE INDUSTRIES II: PERFORMING ARTS',
  'DEVELOPING FILIPINO IDENTITY IN THE ARTS',
  '(ARTS)EXHIBIT FOR ARTS PRODUCTION (LITERARY ARTS)',
  'EXHIBIT FOR ARTS PRODUCTION (MEDIA ARTS AND VISUAL ARTS)',
  'INTEGRATING THE ELEMENTS AND PRINCIPLES OF ORGANIZATION IN THE ARTS',
  'LEADERSHIP AND MANAGEMENT IN DIFFERENT ARTS FIELDS',
  'PERFORMING ARTS PRODUCTION',
  'PHYSICAL AND PERSONAL DEVELOPMENT IN THE ARTS',
  'APPRENTICESHIP (OFF-CAMPUS)',
  'FITNESS TESTING AND EXERCISE PROGRAMMING',
  'FITNESS, SPORTS, AND RECREATION LEADERSHIP',
  'FUNDAMENTAL OF COACHING',
  'HUMAN MOVEMENT',
  'PRACTICUM (IN-CAMPUS)',
  'PSYCHOSOCIAL ASPECTS OF SPORTS AND EXERCISE',
  'SAFETY AND FIRST AID',
  'SPORTS OFFICIATING AND ACTIVITY MANAGEMENT',
  'AGRICULTURAL CROP PRODUCTION (NC I)',
  'AGRICULTURAL CROP PRODUCTION (NC II)',
  'AGRICULTURAL CROP PRODUCTION (NC III)',
  'ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  'ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  'ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  'ANIMAL PRODUCTION- SWINE (NC II)',
  'AQUACULTURE (NC II)',
  'ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  'ARTIFICIAL INSEMINATION- SWINE (NC II)',
  'FISH CAPTURE (NC II)',
  'FISH PRODUCTS PACKAGING (NC II)',
  'FISH WHARF OPERATION (NC I)',
  'FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  'FOOD PROCESSING (NC II)',
  'HORTICULTURE (NC III)',
  'LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  'ORGANIC AGRICULTURE PRODUCTION (NC II)',
  'PEST MANAGEMENT (NC II)',
  'RICE MACHINERY OPERATION (NC II)',
  'RUBBER PROCESSING (NC II)',
  'RUBBER PRODUCTION (NC I)',
  'SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  'ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  'BARBERING (NC II)',
  'BARTENDING (NC II)',
  'BEAUTY/ NAIL CARE (NC II)',
  'BREAD AND PASTRY PRODUCTION (NC II)',
  'CAREGIVING (NC II)',
  'COMMERCIAL COOKING (NC III)',
  'COOKERY (NC II)',
  'DRESSMAKING (NC II)',
  'EVENTS MANAGEMENT SERVICES (NC III)',
  'FASHION DESIGN (NC III)',
  'FOOD AND BEVERAGE SERVICES (NC II)',
  'FRONT OFFICE SERVICES (NC II)',
  'HAIRDRESSING (NC II)',
  'HAIRDRESSING (NC III)',
  'HANDICRAFT- FASHION ACCESSORIES AND PAPER CRAFT',
  'HANDICRAFT- NEEDLECRAFT',
  'HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  'HANDICRAFT- BASKETRY MACRAME',
  'HOUSEKEEPING (NC II)',
  'TAILORING (NC II)',
  'LOCAL GUIDING SERVICES (NC II)',
  'TOURISM PROMOTION SERVICES (NC II)',
  'TRAVEL SERVICES (NC II)',
  'WELLNESS MASSAGE (NC II)',
  'ANIMATION (NC II)',
  'BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  'COMPUTER SYSTEMS SERVICING (NC II)',
  'COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  'COMPUTER PROGRAMMING JAVA (NC III)',
  'COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  'CONTACT CENTER SERVICES (NC II)',
  'ILLUSTRATION (NC II)',
  'MEDICAL TRANSCRIPTION (NC II)',
  'TECHNICAL DRAFTING (NC II)',
  'TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  'TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  'AUTOMOTIVE SERVICING (NC I)',
  'AUTOMOTIVE SERVICING (NC II)',
  'CARPENTRY (NC II)',
  'CARPENTRY (NC III)',
  'CONSTRUCTION PAINTING (NC II)',
  'ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  'DRIVING (NC II)',
  'ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  'ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  'FURNITURE MAKING- FINISHING (NC II)',
  'GAS METAL ARC WELDING- GMAW (NC II)',
  'GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  'INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  'MACHINING (NC I)',
  'MACHINING (NC II)',
  'MASONRY (NC II)',
  'MECHATRONICS SERVICING (NC II)',
  'MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  'PLUMBING (NC I)',
  'PLUMBING (NC II)',
  'REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  'SHIELDED METAL ARC WELDING (NC I)',
  'SHIELDED METAL ARC WELDING (NC II)',
  'TILE SETTING (NC II)',
  'TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (80)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC I)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC II)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC III)',
  '(GAS) ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  '(GAS) ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  '(GAS) ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  '(GAS) ANIMAL PRODUCTION- SWINE (NC II)',
  '(GAS) AQUACULTURE (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- SWINE (NC II)',
  '(GAS) FISH CAPTURE (NC II)',
  '(GAS) FISH PRODUCTS PACKAGING (NC II)',
  '(GAS) FISH WHARF OPERATION (NC I)',
  '(GAS) FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  '(GAS) FOOD PROCESSING (NC II)',
  '(GAS) HORTICULTURE (NC III)',
  '(GAS) LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) ORGANIC AGRICULTURE PRODUCTION (NC II)',
  '(GAS) PEST MANAGEMENT (NC II)',
  '(GAS) RICE MACHINERY OPERATION (NC II)',
  '(GAS) RUBBER PROCESSING (NC II)',
  '(GAS) RUBBER PRODUCTION (NC I)',
  '(GAS) SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  '(GAS) ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  '(GAS) BARBERING (NC II)',
  '(GAS) BARTENDING (NC II)',
  '(GAS) BEAUTY/ NAIL CARE (NC II)',
  '(GAS) BREAD AND PASTRY PRODUCTION (NC II)',
  '(GAS) CAREGIVING (NC II)',
  '(GAS) COMMERCIAL COOKING (NC III)',
  '(GAS) COOKERY (NC II)',
  '(GAS) DRESSMAKING (NC II)',
  '(GAS) EVENTS MANAGEMENT SERVICES (NC III)',
  '(GAS) FASHION DESIGN (NC III)',
  '(GAS) FOOD AND BEVERAGE SERVICES (NC II)',
  '(GAS) FRONT OFFICE SERVICES (NC II)',
  '(GAS) HAIRDRESSING (NC II)',
  '(GAS) HAIRDRESSING (NC III)',
  '(GAS) HANDICRAFT- FASHION ACCESSORIES AND PAPER CRAFT',
  '(GAS) HANDICRAFT- NEEDLECRAFT',
  '(GAS) HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  '(GAS) HANDICRAFT- BASKETRY MACRAME',
  '(GAS) HOUSEKEEPING (NC II)',
  '(GAS) TAILORING (NC II)',
  '(GAS) LOCAL GUIDING SERVICES (NC II)',
  '(GAS) TOURISM PROMOTION SERVICES (NC II)',
  '(GAS) TRAVEL SERVICES (NC II)',
  '(GAS) WELLNESS MASSAGE (NC II)',
  '(GAS) ANIMATION (NC II)',
  '(GAS) BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  '(GAS) COMPUTER SYSTEMS SERVICING (NC II)',
  '(GAS) COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  '(GAS) COMPUTER PROGRAMMING JAVA (NC III)',
  '(GAS) COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  '(GAS) CONTACT CENTER SERVICES (NC II)',
  '(GAS) ILLUSTRATION (NC II)',
  '(GAS) MEDICAL TRANSCRIPTION (NC II)',
  '(GAS) TECHNICAL DRAFTING (NC II)',
  '(GAS) TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  '(GAS) TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  '(GAS) AUTOMOTIVE SERVICING (NC I)',
  '(GAS) AUTOMOTIVE SERVICING (NC II)',
  '(GAS) CARPENTRY (NC II)',
  '(GAS) CARPENTRY (NC III)',
  '(GAS) CONSTRUCTION PAINTING (NC II)',
  '(GAS) ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  '(GAS) DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  '(GAS) DRIVING (NC II)',
  '(GAS) ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  '(GAS) ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) FURNITURE MAKING- FINISHING (NC II)',
  '(GAS) GAS METAL ARC WELDING- GMAW (NC II)',
  '(GAS) GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  '(GAS) INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  '(GAS) MACHINING (NC I)',
  '(GAS) MACHINING (NC II)',
  '(GAS) MASONRY (NC II)',
  '(GAS) MECHATRONICS SERVICING (NC II)',
  '(GAS) MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  '(GAS) PLUMBING (NC I)',
  '(GAS) PLUMBING (NC II)',
  '(GAS) REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  '(GAS) SHIELDED METAL ARC WELDING (NC I)',
  '(GAS) SHIELDED METAL ARC WELDING (NC II)',
  '(GAS) TILE SETTING (NC II)',
  '(GAS) TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (160)',
  'DISASTER READINESS AND RISK REDUCTION',
  'EARTH SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PHYSICAL SCIENCE',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (240)',
  'NAVIGATIONAL WATCH 1',
  'NAVIGATIONAL WATCH 2',
  'NAVIGATIONAL WATCH 3',
  'ENGINE WATCH 1',
  'ENGINE WATCH 2',
  'SAFETY 1',
  'SAFETY 2',
  'SHIP\'S CATERING SERVICES 1',
  'MARITIME (PB)',
  'INTRODUCTION TO MARITIME CAREER',
  'INTRODUCTION TO MARINE TRANSPORTATION AND ENGINEERING',
  'INTRODUCTION TO MARITIME SAFETY',
  'INQUIRIES, INVESTIGATIONS AND IMMERSION',
  'RESEARCH/CAPSTONE PROJECT',
  'OTHERS SPECIALIZED SUBJECT',
  'EFFECTIVE COMMUNICATION',
  'MABISANG KOMUNIKASYON',
  'GENERAL SCIENCE',
  'LIFE AND CAREER SKILLS',
  'PAG-AARAL NG KASAYSAYAN AT LIPUNANG PILIPINO',
  'ARTS 1 (CREATIVE INDUSTRIES - VISUAL ART, LITERARY ART, MEDIA ART, APPLIED ART, AND TRADITIONAL ART)',
  'ARTS 2 (CREATIVE INDUSTRIES - MUSIC, DANCE, AND THEATER)',
  'FILIPINO IDENTITY THROUGH THE ARTS',
  'LEADERSHIP AND MANGEMENT IN THE ARTS',
  'CITIZENSHIP AND CIVIC ENGAGEMENT',
  'CONTEMPORARY LITERATURE 1',
  'CONTEMPORARY LITERATURE 2',
  'CREATIVE COMPOSITION 1',
  'CREATIVE COMPOSITION 2',
  'FILIPINO 1 (WIKA AT KOMUNIKASYON SA AKADEMIKONG FILIPINO)',
  'FILIPINO 2 (FILIPINO PARA SA LARANG TEKNIKAL-PROPESYONAL)',
  'FILIPINO 2 (FILIPINO SA ISPORTS)',
  'FILIPINO 2 (FILIPINO SA SINING AT DISENYO)',
  'INTRODUCTION TO PHILOSOPHY',
  'MALIKHAING PAGSULAT',
  'PHILIPPINE GOVERNANCE (PHILIPPINE POLITICS AND GOVERNANCE)',
  'SOCIAL SCIENCES (THEORY AND PRACTICE)',
  'BUSINESS 1 (BASIC ACCOUNTING)',
  'BUSINESS 2 (BUSINESS FINANCE AND INCOME TAXATION)',
  'BUSINESS 3 (BUSINESS ECONOMICS)',
  'CONTEMPORARY MARKETING',
  'INTRODUCTION TO ORGANIZATION AND MANAGEMENT',
  'ADVANCED MATHEMATICS 1',
  'ADVANCED MATHEMATICS 2',
  'BIOLOGY 1',
  'BIOLOGY 2',
  'BIOLOGY 3',
  'BIOLOGY 4',
  'CHEMISTRY 1',
  'CHEMISTRY 2',
  'CHEMISTRY 3',
  'CHEMISTRY 4',
  'DATABASE MANAGEMENT',
  'EARTH AND SPACE SCIENCE 1',
  'EARTH AND SPACE SCIENCE 2',
  'EARTH AND SPACE SCIENCE 3',
  'EARTH AND SPACE SCIENCE 4',
  'EMPOWERMENT TECHNOLOGIES',
  'FINITE MATHEMATICS 1',
  'FINITE MATHEMATICS 2',
  'FUNDAMENTALS IN DATA ANALYTICS',
  'GENERAL SCIENCE 3',
  'GENERAL SCIENCE 4',
  'PHYSICS 1',
  'PHYSICS 2',
  'PHYSICS 3',
  'PHYSICS 4',
  'PRE-CALCULUS 1',
  'PRE-CALCULUS 2',
  'TRIGONOMETRY 1',
  'TRIGONOMETRY 2',
  'EXERCISE AND SPORTS PROGRAMMING',
  'HUMAN MOVEMENT 1 (BASIC ANATOMY IN SPORTS AND EXERCISE)',
  'HUMAN MOVEMENT 2 (MOTOR SKILLS DEVELOPMENT)',
  'PHYSICAL EDUCATION 1 (FITNESS AND RECREATION)',
  'PHYSICAL EDUCATION 2 (SPORTS AND DANCE)',
  'SPORTS ACTIVITY MANAGEMENT',
  'SPORTS COACHING',
  'SPORTS OFFICIATING',
  'ARTS APPRENTICESHIP (DANCE, MUSIC, THEATER ARTS, LITERARY ARTS, VISUAL ARTS, VISUAL, MEDIA, APPLIED, AND TRADITIONAL ART)',
  'CREATIVE PRODUCTION AND PRESENTATION',
  'DESIGN AND INNOVATION',
  'RESEARCH METHODS',
  '(IN-CAMPUS) SPORTS',
  '(OFF-CAMPUS) (BUSINESS AND ENTREPRENEURSHIP/ SPORTS HEALTH, AND WELLNESS/ SCIENCE, TECHNOLOGY, ENGINEERING, AND MATHEMATICS)',
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL',
  'AESTHETIC SERVICES (BEAUTY CARE)',
  'BARBERING SERVICES',
  'CAREGIVING (ADULT CARE)',
  'CAREGIVING (CHILD CARE)',
  'HAIRDRESSING SERVICES',
  'WELLNESS SERVICES (HILOT/MASSAGE)',
  'AGRICULTURAL CROPS PRODUCTION',
  'AGRO-ENTREPRENEURSHIP',
  'FISH CAPTURE OPERATION',
  'POULTRY PRODUCTION (CHICKEN)',
  'RUMINANTS PRODUCTION',
  'SWINE PRODUCTION',
  'GARMENTS ARTISANRY',
  'HANDICRAFTS (WEAVING)',
  'AUTOMOTIVE SERVICING (ELECTRICAL REPAIR)',
  'AUTOMOTIVE SERVICING (ENGINE AND CHASSIS REPAIRS)',
  'DRIVING AND AUTOMOTIVE SERVICING',
  'MOTORCYCLE AND SMALL ENGINE SERVICING',
  'CONSTRUCTION OPERATION',
  'MANUAL METAL ARC WELDING',
  'BAKERY OPERATION',
  'FOOD AND BEVERAGE OPERATION',
  'HOTEL OPERATION (FRONT OFFICE SERVICES)',
  'HOTEL OPERATION (HOUSEKEEPING SERVICES)',
  'KITCHEN OPERATIONS',
  'TOURISM SERVICES',
  'COMMERCIAL AIR-CONDITIONING INSTALLATION AND SERVICING',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING SERVICING',
  'ELECTRICAL INSTALLATION MAINTENANCE',
  'ELECTRONICS PRODUCT ASSEMBLY AND SERVICING',
  'MECHATRONICS',
  'PHOTOVOLTAIC SYSTEMS INSTALLATION',
  'COMPUTER PROGRAMMING (JAVA)',
  'COMPUTER PROGRAMMING (.NET TECHNOLOGY)',
  'COMPUTER PROGRAMMING (ORACLE DATABASE)',
  'MARINE ENGINEERING AT THE SUPPORT LEVEL',
  'MARINE TRANSPORTATION AT THE SUPPORT LEVEL',
  'SHIPS CATERING SERVICES',
  'WORK IMMERSION - AESTHETIC, WELLNESS AND HUMAN CARE CLUSTER',
  'WORK IMMERSION - AGRI-FISHERY BUSINESS AND FOOD INNOVATION',
  'WORK IMMERSION - ARTISANRY AND CREATIVE ENTERPRISE',
  'WORK IMMERSION - AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES',
  'WORK IMMERSION - CONSTRUCTION AND BUILDING TECHNOLOGIES',
  'WORK IMMERSION - CREATIVE ARTS AND DESIGN TECHNOLOGIES',
  'WORK IMMERSION - HOSPITALITY AND TOURISM',
  'WORK IMMERSION - INDUSTRIAL TECHNOLOGIES',
  'WORK IMMERSION - ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES',
  'WORK IMMERSION - MARITIME TRANSPORT'
];

const SHS_CORE_SUBJECTS = SHS_SUBJECTS.slice(30, 47);
const SHS_APPLIED_SUBJECTS = SHS_SUBJECTS.slice(47, 59);
const SHS_SPECIALIZED_SUBJECTS = SHS_SUBJECTS.slice(59, 290);
const SSHS_CORE_SUBJECTS = SHS_SUBJECTS.slice(290, 298);
const SSHS_ACADEMIC_SUBJECTS = SHS_SUBJECTS.slice(298, 381);
const SSHS_TECHPRO_SUBJECTS = SHS_SUBJECTS.slice(381);

const SHS_GRADE12_SUBJECTS = [
  'ADVISORY',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL  EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON'
];

const SHS_CORE_GRADE12_SUBJECTS = [
  'ORAL COMMUNICATION',
  'READING AND WRITING',
  "KOMUNIKASYON AT PANANALIKSIK SA WIKA AT KULTURANG PILIPINO",
  "PAGBASA AT PAGSUSURI NG IBA'T-IBANG TEKSTO TUNGO SA PANANALIKSIK",
  '21ST CENTURY LITERATURE FROM THE PHILIPPINES AND THE WORLD',
  'CONTEMPORARY PHILIPPINE ARTS FROM THE REGIONS',
  "INTRODUCTION TO THE PHILOSOPHY OF THE HUMAN PERSON / PAMBUNGAD SA PILOSOPIYA NG TAO",
  'UNDERSTANDING CULTURE, SOCIETY AND POLITICS',
  'MEDIA AND INFORMATION LITERACY',
  'GENERAL MATHEMATICS',
  'STATISTICS AND PROBABILITY',
  'PHYSICAL SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PERSONAL DEVELOPMENT / PANSARILING KAUNLARAN',
  'PE AND HEALTH',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
];

const SHS_APPLIED_GRADE12_SUBJECTS = [
  'ENGLISH FOR ACADEMIC AND PROFESSIONAL PURPOSES',
  'ENTREPRENEURSHIP',
  'PRACTICAL RESEARCH 1',
  'EMPOWERMENT TECHNOLOGIES (E-TECH): ICT FPR PROFESSIONAL TRACKS',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (AKADEMIK)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (TECH-VOC)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (ISPORTS)',
  'PAGSULAT SA FILIPINO SA PILING LARANGAN (SINING)',
  'PRACTICAL RESEARCH 2',
  'RESEARCH PROJECT/CULMINATING ACTIVITY*',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
];

const SHS_SPECIALIZED_GRADE12_SUBJECTS = [
  'BASIC CALCULUS',
  'GENERAL BIOLOGY 1',
  'GENERAL BIOLOGY 2',
  'GENERAL CHEMISTRY 1',
  'GENERAL CHEMISTRY 2',
  'GENERAL PHYSICS 1',
  'GENERAL PHYSICS 2',
  'PRE-CALCULUS',
  'APPLIED ECONOMICS',
  'BUSINESS ETHICS AND SOCIAL RESPONSIBILITY',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 1',
  'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 2',
  'BUSINESS MATH',
  'BUSINESS FINANCE',
  'ORGANIZATION AND MANAGEMENT',
  'PRINCIPLES OF MARKETING',
  'CREATIVE NONFICTION',
  'CREATIVE WRITING/MALIKHAING PAGSULAT',
  'INTRODUCTION TO WORLD RELIGIONS AND BELIEF SYSTEMS',
  'TRENDS, NETWORKS, AND CRITICAL THINKING IN THE 21ST CENTURY CULTURE',
  'COMMUNITY ENGAGEMENT, SOLIDARITY, AND CITIZENSHIP',
  'DISCIPLINE AND IDEAS IN THE APPLIED SCIENCES',
  'DISCIPLINES AND IDEAS IN THE SOCIAL SCIENCES',
  'PHILIPPINE POLITICS AND GOVERNANCE',
  'APPLIED ECONOMICS',
  'DISASTER READINESS AND RISK REDUCTION (GAS)',
  'ORGANIZATION AND MANAGEMENT',
  'APPRENTICESHIP AND EXPLORATION OF DIFFERENT ARTS FIELDS',
  'CREATIVE INDUSTRIES I: ARTS AND DESIGN APPRECIATION AND PRODUCTION',
  'CREATIVE INDUSTRIES II: PERFORMING ARTS',
  'DEVELOPING FILIPINO IDENTITY IN THE ARTS',
  '(ARTS)EXHIBIT FOR ARTS PRODUCTION (LITERARY ARTS)',
  'EXHIBIT FOR ARTS PRODUCTION (MEDIA ARTS AND VISUAL ARTS)',
  'INTEGRATING THE ELEMENTS AND PRINCIPLES OF ORGANIZATION IN THE ARTS',
  'LEADERSHIP AND MANAGEMENT IN DIFFERENT ARTS FIELDS',
  'PERFORMING ARTS PRODUCTION',
  'PHYSICAL AND PERSONAL DEVELOPMENT in the arts',
  'APPRENTICESHIP (OFF-CAMPUS)',
  'FITNESS TESTING AND EXERCISE PROGRAMMING',
  'FITNESS, SPORTS, AND RECREATION LEADERSHIP',
  'FUNDAMENTAL OF COACHING',
  'HUMAN MOVEMENT',
  'PRACTICUM (IN-CAMPUS)',
  'PSYCHOSOCIAL ASPECTS OF SPORTS AND EXERCISE',
  'SAFETY AND FIRST AID',
  'SPORTS OFFICIATING AND ACTIVITY MANAGEMENT',
  'AGRICULTURAL CROP PRODUCTION (NC I)',
  'AGRICULTURAL CROP PRODUCTION (NC II)',
  'AGRICULTURAL CROP PRODUCTION (NC III)',
  'ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  'ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  'ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  'ANIMAL PRODUCTION- SWINE (NC II)',
  'AQUACULTURE (NC II)',
  'ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  'ARTIFICIAL INSEMINATION- SWINE (NC II)',
  'FISH CAPTURE (NC II)',
  'FISH PRODUCTS PACKAGING (NC II)',
  'FISH WHARF OPERATION (NC I)',
  'FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  'FOOD PROCESSING (NC II)',
  'HORTICULTURE (NC III)',
  'LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  'ORGANIC AGRICULTURE PRODUCTION (NC II)',
  'PEST MANAGEMENT (NC II)',
  'RICE MACHINERY OPERATION (NC II)',
  'RUBBER PROCESSING (NC II)',
  'RUBBER PRODUCTION (NC I)',
  'SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  'ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  'BARBERING (NC II)',
  'BARTENDING (NC II)',
  'BEAUTY/ NAIL CARE (NC II)',
  'BREAD AND PASTRY PRODUCTION (NC II)',
  'CAREGIVING (NC II)',
  'COMMERCIAL COOKING (NC III)',
  'COOKERY (NC II)',
  'DRESSMAKING (NC II)',
  'EVENTS MANAGEMENT SERVICES (NC III)',
  'FASHION DESIGN (NC III)',
  'FOOD AND BEVERAGE SERVICES (NC II)',
  'FRONT OFFICE SERVICES (NC II)',
  'HAIRDRESSING (NC II)',
  'HAIRDRESSING (NC III)',
  'HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT',
  'HANDICRAFT- NEEDLECRAFT',
  'HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  'HANDICRAFT- BASKETRY MACRAME',
  'HOUSEKEEPING (NC II)',
  'TAILORING (NC II)',
  'LOCAL GUIDING SERVICES (NC II)',
  'TOURISM PROMOTION SERVICES (NC II)',
  'TRAVEL SERVICES (NC II)',
  'WELLNESS MASSAGE (NC II)',
  'ANIMATION (NC II)',
  'BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  'COMPUTER SYSTEMS SERVICING (NC II)',
  'COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  'COMPUTER PROGRAMMING JAVA (NC III)',
  'COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  'CONTACT CENTER SERVICES (NC II)',
  'ILLUSTRATION (NC II)',
  'MEDICAL TRANSCRIPTION (NC II)',
  'TECHNICAL DRAFTING (NC II)',
  'TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  'TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  'AUTOMOTIVE SERVICING (NC I)',
  'AUTOMOTIVE SERVICING (NC II)',
  'CARPENTRY (NC II)',
  'CARPENTRY (NC III)',
  'CONSTRUCTION PAINTING (NC II)',
  'ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  'DRIVING (NC II)',
  'ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  'ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  'FURNITURE MAKING- FINISHING (NC II)',
  'GAS METAL ARC WELDING- GMAW (NC II)',
  'GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  'INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  'MACHINING (NC I)',
  'MACHINING (NC II)',
  'MASONRY (NC II)',
  'MECHATRONICS SERVICING (NC II)',
  'MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  'PLUMBING (NC I)',
  'PLUMBING (NC II)',
  'REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  'SHIELDED METAL ARC WELDING (NC I)',
  'SHIELDED METAL ARC WELDING (NC II)',
  'TILE SETTING (NC II)',
  'TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (80)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC I)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC II)',
  '(GAS) AGRICULTURAL CROP PRODUCTION (NC III)',
  '(GAS) ANIMAL HEALTH CARE MANAGEMENT (NC III)',
  '(GAS) ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
  '(GAS) ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
  '(GAS) ANIMAL PRODUCTION- SWINE (NC II)',
  '(GAS) AQUACULTURE (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
  '(GAS) ARTIFICIAL INSEMINATION- SWINE (NC II)',
  '(GAS) FISH CAPTURE (NC II)',
  '(GAS) FISH PRODUCTS PACKAGING (NC II)',
  '(GAS) FISH WHARF OPERATION (NC I)',
  '(GAS) FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
  '(GAS) FOOD PROCESSING (NC II)',
  '(GAS) HORTICULTURE (NC III)',
  '(GAS) LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) ORGANIC AGRICULTURE PRODUCTION (NC II)',
  '(GAS) PEST MANAGEMENT (NC II)',
  '(GAS) RICE MACHINERY OPERATION (NC II)',
  '(GAS) RUBBER PROCESSING (NC II)',
  '(GAS) RUBBER PRODUCTION (NC I)',
  '(GAS) SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
  '(GAS) ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
  '(GAS) BARBERING (NC II)',
  '(GAS) BARTENDING (NC II)',
  '(GAS) BEAUTY/ NAIL CARE (NC II)',
  '(GAS) BREAD AND PASTRY PRODUCTION (NC II)',
  '(GAS) CAREGIVING (NC II)',
  '(GAS) COMMERCIAL COOKING (NC III)',
  '(GAS) COOKERY (NC II)',
  '(GAS) DRESSMAKING (NC II)',
  '(GAS) EVENTS MANAGEMENT SERVICES (NC III)',
  '(GAS) FASHION DESIGN (NC III)',
  '(GAS) FOOD AND BEVERAGE SERVICES (NC II)',
  '(GAS) FRONT OFFICE SERVICES (NC II)',
  '(GAS) HAIRDRESSING (NC II)',
  '(GAS) HAIRDRESSING (NC III)',
  '(GAS) HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT',
  '(GAS) HANDICRAFT- NEEDLECRAFT',
  '(GAS) HANDICRAFT- WOODCRAFT LEATHERCRAFT',
  '(GAS) HANDICRAFT- BASKETRY MACRAME',
  '(GAS) HOUSEKEEPING (NC II)',
  '(GAS) TAILORING (NC II)',
  '(GAS) LOCAL GUIDING SERVICES (NC II)',
  '(GAS) TOURISM PROMOTION SERVICES (NC II)',
  '(GAS) TRAVEL SERVICES (NC II)',
  '(GAS) WELLNESS MASSAGE (NC II)',
  '(GAS) ANIMATION (NC II)',
  '(GAS) BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
  '(GAS) COMPUTER SYSTEMS SERVICING (NC II)',
  '(GAS) COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
  '(GAS) COMPUTER PROGRAMMING JAVA (NC III)',
  '(GAS) COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
  '(GAS) CONTACT CENTER SERVICES (NC II)',
  '(GAS) ILLUSTRATION (NC II)',
  '(GAS) MEDICAL TRANSCRIPTION (NC II)',
  '(GAS) TECHNICAL DRAFTING (NC II)',
  '(GAS) TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
  '(GAS) TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)',
  '(GAS) AUTOMOTIVE SERVICING (NC I)',
  '(GAS) AUTOMOTIVE SERVICING (NC II)',
  '(GAS) CARPENTRY (NC II)',
  '(GAS) CARPENTRY (NC III)',
  '(GAS) CONSTRUCTION PAINTING (NC II)',
  '(GAS) ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
  '(GAS) DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
  '(GAS) DRIVING (NC II)',
  '(GAS) ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
  '(GAS) ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)',
  '(GAS) FURNITURE MAKING- FINISHING (NC II)',
  '(GAS) GAS METAL ARC WELDING- GMAW (NC II)',
  '(GAS) GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
  '(GAS) INSTRUMENTATION AND CONTROL SERVICING (NC II)',
  '(GAS) MACHINING (NC I)',
  '(GAS) MACHINING (NC II)',
  '(GAS) MASONRY (NC II)',
  '(GAS) MECHATRONICS SERVICING (NC II)',
  '(GAS) MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)',
  '(GAS) PLUMBING (NC I)',
  '(GAS) PLUMBING (NC II)',
  '(GAS) REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
  '(GAS) SHIELDED METAL ARC WELDING (NC I)',
  '(GAS) SHIELDED METAL ARC WELDING (NC II)',
  '(GAS) TILE SETTING (NC II)',
  '(GAS) TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (160)',
  'DISASTER READINESS AND RISK REDUCTION',
  'EARTH SCIENCE',
  'EARTH AND LIFE SCIENCE',
  'PHYSICAL SCIENCE',
  'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (240)',
  'NAVIGATIONAL WATCH 1',
  'NAVIGATIONAL WATCH 2',
  'NAVIGATIONAL WATCH 3',
  'ENGINE WATCH 1',
  'ENGINE WATCH 2',
  'SAFETY 1',
  'SAFETY 2',
  'SHIP\'S CATERING SERVICES 1',
  'MARITIME (PB)',
  'PRE-CALCULUS',
  'BASIC CALCULUS',
  'GENERAL PHYSICS 1',
  'GENERAL PHYSICS 2',
  'GENERAL CHEMISTRY 1',
  'INTRODUCTION TO MARITIME CAREER',
  'INTRODUCTION TO MARINE TRANSPORTATION AND ENGINEERING',
  'INTRODUCTION TO MARITIME SAFETY',
  'INQUIRIES, INVESTIGATIONS AND IMMERSION',
  'RESEARCH/CAPSTONE PROJECT',
  'OTHERS SPECIALIZED SUBJECT',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
];

const SSHS_ACADEMIC_GRADE12_SUBJECTS = [
  'ARTS 1 (CREATIVE INDUSTRIES - VISUAL ART, LITERARY ART, MEDIA ART, APPLIED ART, AND TRADITIONAL ART)',
  'ARTS 2 (CREATIVE INDUSTRIES - MUSIC, DANCE, AND THEATER)',
  'FILIPINO IDENTITY THROUGH THE ARTS',
  'LEADERSHIP AND MANGEMENT IN THE ARTS',
  'CITIZENSHIP AND CIVIC ENGAGEMENT',
  'CONTEMPORARY LITERATURE 1',
  'CONTEMPORARY LITERATURE 2',
  'CREATIVE COMPOSITION 1',
  'CREATIVE COMPOSITION 2',
  'FILIPINO 1 (WIKA AT KOMUNIKASYON SA AKADEMIKONG FILIPINO)',
  'FILIPINO 2 (FILIPINO PARA SA LARANG TEKNIKAL-PROPESYONAL)',
  'FILIPINO 2 (FILIPINO SA ISPORTS)',
  'FILIPINO 2 (FILIPINO SA SINING AT DISENYO)',
  'INTRODUCTION TO PHILOSOPHY',
  'MALIKHAING PAGSULAT',
  'PHILIPPINE GOVERNANCE (PHILIPPINE POLITICS AND GOVERNANCE)',
  'SOCIAL SCIENCES (THEORY AND PRACTICE)',
  'BUSINESS 1 (BASIC ACCOUNTING)',
  'BUSINESS 2 (BUSINESS FINANCE AND INCOME TAXATION)',
  'BUSINESS 3 (BUSINESS ECONOMICS)',
  'CONTEMPORARY MARKETING',
  'ENTREPRENEURSHIP',
  'INTRODUCTION TO ORGANIZATION AND MANAGEMENT',
  'ADVANCED MATHEMATICS 1',
  'ADVANCED MATHEMATICS 2',
  'BIOLOGY 1',
  'BIOLOGY 2',
  'BIOLOGY 3',
  'BIOLOGY 4',
  'CHEMISTRY 1',
  'CHEMISTRY 2',
  'CHEMISTRY 3',
  'CHEMISTRY 4',
  'DATABASE MANAGEMENT',
  'EARTH AND SPACE SCIENCE 1',
  'EARTH AND SPACE SCIENCE 2',
  'EARTH AND SPACE SCIENCE 3',
  'EARTH AND SPACE SCIENCE 4',
  'EMPOWERMENT TECHNOLOGIES',
  'FINITE MATHEMATICS 1',
  'FINITE MATHEMATICS 2',
  'FUNDAMENTALS IN DATA ANALYTICS',
  'GENERAL SCIENCE 3',
  'GENERAL SCIENCE 4',
  'PHYSICS 1',
  'PHYSICS 2',
  'PHYSICS 3',
  'PHYSICS 4',
  'PRE-CALCULUS 1',
  'PRE-CALCULUS 2',
  'TRIGONOMETRY 1',
  'TRIGONOMETRY 2',
  'EXERCISE AND SPORTS PROGRAMMING',
  'HUMAN MOVEMENT 1 (BASIC ANATOMY IN SPORTS AND EXERCISE)',
  'HUMAN MOVEMENT 2 (MOTOR SKILLS DEVELOPMENT)',
  'PHYSICAL EDUCATION 1 (FITNESS AND RECREATION)',
  'PHYSICAL EDUCATION 2 (SPORTS AND DANCE)',
  'SAFETY AND FIRST AID',
  'SPORTS ACTIVITY MANAGEMENT',
  'SPORTS COACHING',
  'SPORTS OFFICIATING',
  'ARTS APPRENTICESHIP (DANCE, MUSIC, THEATER ARTS, LITERARY ARTS, VISUAL ARTS, VISUAL, MEDIA, APPLIED, AND TRADITIONAL ART)',
  'CREATIVE PRODUCTION AND PRESENTATION',
  'DESIGN AND INNOVATION',
  'RESEARCH METHODS',
  '(IN-CAMPUS) SPORTS',
  '(OFF-CAMPUS) (BUSINESS AND ENTREPRENEURSHIP/ SPORTS HEALTH, AND WELLNESS/ SCIENCE, TECHNOLOGY, ENGINEERING, AND MATHEMATICS)',
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
];

const SSHS_TECHPRO_GRADE12_SUBJECTS = [
  'AESTHETIC SERVICES (BEAUTY CARE)',
  'BARBERING SERVICES',
  'CAREGIVING (ADULT CARE)',
  'CAREGIVING (CHILD CARE)',
  'HAIRDRESSING SERVICES',
  'WELLNESS SERVICES (HILOT/MASSAGE)',
  'AGRICULTURAL CROPS PRODUCTION',
  'AGRO-ENTREPRENEURSHIP',
  'AQUACULTURE',
  'FISH CAPTURE OPERATION',
  'FOOD PROCESSING',
  'ORGANIC AGRICULTURE PRODUCTION',
  'POULTRY PRODUCTION (CHICKEN)',
  'RUMINANTS PRODUCTION',
  'SWINE PRODUCTION',
  'GARMENTS ARTISANRY',
  'HANDICRAFTS (WEAVING)',
  'AUTOMOTIVE SERVICING (ELECTRICAL REPAIR)',
  'AUTOMOTIVE SERVICING (ENGINE AND CHASSIS REPAIRS)',
  'DRIVING AND AUTOMOTIVE SERVICING',
  'MOTORCYCLE AND SMALL ENGINE SERVICING',
  'CARPENTRY',
  'CONSTRUCTION OPERATION',
  'MANUAL METAL ARC WELDING',
  'TECHNICAL DRAFTING',
  'ANIMATION',
  'ILLUSTRATION',
  'VISUAL GRAPHICS DESIGN',
  'BAKERY OPERATION',
  'EVENTS MANAGEMENT SERVICES',
  'FOOD AND BEVERAGE OPERATION',
  'HOTEL OPERATION (FRONT OFFICE SERVICES)',
  'HOTEL OPERATION (HOUSEKEEPING SERVICES)',
  'KITCHEN OPERATIONS',
  'TOURISM SERVICES',
  'COMMERCIAL AIR-CONDITIONING INSTALLATION AND SERVICING',
  'DOMESTIC REFRIGERATION AND AIR-CONDITIONING SERVICING',
  'ELECTRICAL INSTALLATION MAINTENANCE',
  'ELECTRONICS PRODUCT ASSEMBLY AND SERVICING',
  'MECHATRONICS',
  'PHOTOVOLTAIC SYSTEMS INSTALLATION',
  'BROADBAND INSTALLATION',
  'COMPUTER PROGRAMMING (JAVA)',
  'COMPUTER PROGRAMMING (.NET TECHNOLOGY)',
  'COMPUTER PROGRAMMING (ORACLE DATABASE)',
  'COMPUTER SYSTEMS SERVICING',
  'CONTACT CENTER SERVICES',
  'MARINE ENGINEERING AT THE SUPPORT LEVEL',
  'MARINE TRANSPORTATION AT THE SUPPORT LEVEL',
  'SHIPS CATERING SERVICES',
  'WORK IMMERSION - AESTHETIC, WELLNESS AND HUMAN CARE CLUSTER',
  'WORK IMMERSION - AGRI-FISHERY BUSINESS AND FOOD INNOVATION',
  'WORK IMMERSION - ARTISANRY AND CREATIVE ENTERPRISE',
  'WORK IMMERSION - AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES',
  'WORK IMMERSION - CONSTRUCTION AND BUILDING TECHNOLOGIES',
  'WORK IMMERSION - CREATIVE ARTS AND DESIGN TECHNOLOGIES',
  'WORK IMMERSION - HOSPITALITY AND TOURISM',
  'WORK IMMERSION - INDUSTRIAL TECHNOLOGIES',
  'WORK IMMERSION - ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES',
  'WORK IMMERSION - MARITIME TRANSPORT',
  'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS'
];

const ELEMENTARY_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ADMINISTRATIVE',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT',
  'RELATED TASK'
];

const JHS_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ADMINISTRATIVE',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT',
  'RELATED TASK'
];

const SHS_MONO_GRADE_SUBJECTS = [
  'ADVISORY',
  'HGP',
  'ALS LEARNING STRAND',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'ADMINISTRATIVE',
  'ADMIN TASK - PERSONNEL ADMINISTRATION',
  'ADMIN TASK - PROPERTY/PHYSICAL FACILITIES CUSTODIANSHIP',
  'ADMIN TASK - GENERAL ADMINISTRATIVE SUPPORT',
  'ADMIN TASK - FINANCIAL MANAGEMENT',
  'ADMIN TASK - RECORDS MANAGEMENT',
  'ADMIN TASK - PROGRAM MANAGEMENT',
  'RELATED TASK'
];

const JHS_NON_GRADED_SUBJECTS = [
  'ADVISORY',
  'ARALING PANLIPUNAN',
  'FILIPINO',
  'ENGLISH',
  'MATHEMATICS',
  'SCIENCE',
  'EPP/TLE',
  'MAPEH',
  'VALUES EDUCATION',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL  EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'REMEDIATION',
  'REMEDIAL/ENHANCEMENT CLASS',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'COACHING AND MENTORING'
];

const SHS_NON_GRADED_SUBJECTS = [
  'ADVISORY',
  'ARALING PANLIPUNAN',
  'FILIPINO',
  'ENGLISH',
  'MATHEMATICS',
  'SCIENCE',
  'EPP/TLE',
  'MAPEH',
  'VALUES EDUCATION',
  'GMRC',
  'SPECIAL PROGRAM IN THE ARTS (SPA)',
  'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
  'SPECIAL PROGRAM IN JOURNALISM (SPJ)',
  'SPECIAL PROGRAM IN SPORTS (SPS)',
  'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
  'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL  EDUCATION (SPTVE)',
  'SPECIAL PROGRAM IN SCIENCE',
  'SPED MODIFIED SUBJECTS',
  'IP RELATED SUBJECT',
  'MADRASAH SUBJECTS',
  'ARAL - READING',
  'ARAL - MATH',
  'ARAL - SCIENCE',
  'TR - READING / LITERACY AND NUMERACY SCHOOL COORDINATOR',
  'TR - RESEARCH SCHOOL COORDINATOR',
  'TR - SPECIAL NEEDS EDUCATION SCHOOL COORDINATOR',
  'TR - ICT SCHOOL COORDINATOR',
  'TR - GUIDANCE AND COUNSELLING SCHOOL COORDINATOR',
  'TR - INCLUSIVE EDUCATION SCHOOL COORDINATOR',
  'TR - SCHOOL PAPER TRAINER/ADVISER',
  'TR - SPORTS DEVELOPMENT PROGRAMS TRAINER/ADVISER',
  'TR - SELG / SSLG TRAINER/ADVISER',
  'TR - GRADE LEVEL CHAIRPERSON',
  'TR - LEARNING AREA CHAIRPERSON',
  'COACHING AND MENTORING'
];

GRADE_LEVEL_SUBJECTS['Grade 7'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 8'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 9'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 10'] = JHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 11'] = SHS_SUBJECTS;
GRADE_LEVEL_SUBJECTS['Grade 12'] = SHS_GRADE12_SUBJECTS;

// Filter out TR - options from GRADE_LEVEL_SUBJECTS lists programmatically
Object.keys(GRADE_LEVEL_SUBJECTS).forEach(key => {
  if (Array.isArray(GRADE_LEVEL_SUBJECTS[key])) {
    GRADE_LEVEL_SUBJECTS[key] = GRADE_LEVEL_SUBJECTS[key].filter(sub => !sub.startsWith('TR -'));
  }
});

// Also filter out TR - options from other standalone subject arrays in-place
[JHS_SUBJECTS, SHS_SUBJECTS, SHS_GRADE12_SUBJECTS].forEach(arr => {
  if (Array.isArray(arr)) {
    const filtered = arr.filter(sub => !sub.startsWith('TR -'));
    arr.length = 0;
    arr.push(...filtered);
  }
});

const GRADE_LEVELS_BY_CATEGORY = {
  'Elementary': ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED', 'MONO-GRADE'],
  'JHS': ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'NON-GRADED', 'MONO-GRADE'],
  'SHS': ['Grade 11', 'Grade 12', 'NON-GRADED', 'MONO-GRADE'],
  'SHS-CORE SUBJECTS': ['Grade 11', 'Grade 12'],
  'SHS-APPLIED SUBJECTS': ['Grade 11', 'Grade 12'],
  'SHS-SPECIALIZED SUBJECTS': ['Grade 11', 'Grade 12'],
  'SSHS-CORE': ['Grade 11'],
  'SSHS-ACADEMIC': ['Grade 11', 'Grade 12'],
  'SSHS-TECHPRO': ['Grade 11', 'Grade 12']
};


const REMEDIATION_FOCUS_BY_CATEGORY = {
  "Elementary": [
    "KINDER BLOCKS OF TIME",
    "LANGUAGE",
    "READING AND LITERACY",
    "MAKABANSA",
    "ARALING PANLIPUNAN",
    "FILIPINO",
    "ENGLISH",
    "MATHEMATICS",
    "SCIENCE",
    "EPP/TLE",
    "MAPEH",
    "VALUES EDUCATION",
    "GMRC"
  ],
  "ALL": [
    "ARALING PANLIPUNAN",
    "FILIPINO",
    "ENGLISH",
    "MATHEMATICS",
    "SCIENCE",
    "EPP/TLE",
    "MAPEH",
    "VALUES EDUCATION",
    "GMRC"
  ],
  "SHS-CORE SUBJECTS": [
    "ORAL COMMUNICATION",
    "READING AND WRITING",
    "KOMUNIKASYON AT PANANALIKSIK SA WIKA AT KULTURANG PILIPINO",
    "PAGBASA AT PAGSUSURI NG IBA'T-IBANG TEKSTO TUNGO SA PANANALIKSIK",
    "21ST CENTURY LITERATURE FROM THE PHILIPPINES AND THE WORLD",
    "CONTEMPORARY PHILIPPINE ARTS FROM THE REGIONS",
    "INTRODUCTION TO THE PHILOSOPHY OF THE HUMAN PERSON / PAMBUNGAD SA PILOSOPIYA NG TAO",
    "UNDERSTANDING CULTURE, SOCIETY AND POLITICS",
    "MEDIA AND INFORMATION LITERACY",
    "GENERAL MATHEMATICS",
    "STATISTICS AND PROBABILITY",
    "PHYSICAL SCIENCE",
    "EARTH AND LIFE SCIENCE",
    "PERSONAL DEVELOPMENT / PANSARILING KAUNLARAN",
    "PE AND HEALTH"
  ],
  "SHS-APPLIED SUBJECTS": [
    "ENGLISH FOR ACADEMIC AND PROFESSIONAL PURPOSES",
    "ENTREPRENEURSHIP",
    "PRACTICAL RESEARCH 1",
    "EMPOWERMENT TECHNOLOGIES (E-TECH): ICT FPR PROFESSIONAL TRACKS",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (AKADEMIK)",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (TECH-VOC)",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (ISPORTS)",
    "PAGSULAT SA FILIPINO SA PILING LARANGAN (SINING)",
    "PRACTICAL RESEARCH 2",
    "RESEARCH PROJECT/CULMINATING ACTIVITY*"
  ],
  "SHS-SPECIALIZED SUBJECTS": [
    "BASIC CALCULUS",
    "GENERAL BIOLOGY 1",
    "GENERAL BIOLOGY 2",
    "GENERAL CHEMISTRY 1",
    "GENERAL CHEMISTRY 2",
    "GENERAL PHYSICS 1",
    "GENERAL PHYSICS 2",
    "PRE-CALCULUS",
    "APPLIED ECONOMICS",
    "BUSINESS ETHICS AND SOCIAL RESPONSIBILITY",
    "FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 1",
    "FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 2",
    "BUSINESS MATH",
    "BUSINESS FINANCE",
    "ORGANIZATION AND MANAGEMENT",
    "PRINCIPLES OF MARKETING",
    "CREATIVE NONFICTION",
    "CREATIVE WRITING/MALIKHAING PAGSULAT",
    "INTRODUCTION TO WORLD RELIGIONS AND BELIEF SYSTEMS",
    "TRENDS, NETWORKS, AND CRITICAL THINKING IN THE 21ST CENTURY CULTURE",
    "COMMUNITY ENGAGEMENT, SOLIDARITY, AND CITIZENSHIP",
    "DISCIPLINE AND IDEAS IN THE APPLIED SCIENCES",
    "DISCIPLINES AND IDEAS IN THE SOCIAL SCIENCES",
    "PHILIPPINE POLITICS AND GOVERNANCE",
    "APPLIED ECONOMICS",
    "DISASTER READINESS AND RISK REDUCTION (GAS)",
    "ORGANIZATION AND MANAGEMENT",
    "APPRENTICESHIP AND EXPLORATION OF DIFFERENT ARTS FIELDS",
    "CREATIVE INDUSTRIES I: ARTS AND DESIGN APPRECIATION AND PRODUCTION",
    "CREATIVE INDUSTRIES II: PERFORMING ARTS",
    "DEVELOPING FILIPINO IDENTITY IN THE ARTS",
    "(ARTS)EXHIBIT FOR ARTS PRODUCTION (LITERARY ARTS)",
    "EXHIBIT FOR ARTS PRODUCTION (MEDIA ARTS AND VISUAL ARTS)",
    "INTEGRATING THE ELEMENTS AND PRINCIPLES OF ORGANIZATION IN THE ARTS",
    "LEADERSHIP AND MANAGEMENT IN DIFFERENT ARTS FIELDS",
    "PERFORMING ARTS PRODUCTION",
    "PHYSICAL AND PERSONAL DEVELOPMENT IN THE ARTS",
    "APPRENTICESHIP (OFF-CAMPUS)",
    "FITNESS TESTING AND EXERCISE PROGRAMMING",
    "FITNESS, SPORTS, AND RECREATION LEADERSHIP",
    "FUNDAMENTAL OF COACHING",
    "HUMAN MOVEMENT",
    "PRACTICUM (IN-CAMPUS)",
    "PSYCHOSOCIAL ASPECTS OF SPORTS AND EXERCISE",
    "SAFETY AND FIRST AID",
    "SPORTS OFFICIATING AND ACTIVITY MANAGEMENT",
    "AGRICULTURAL CROP PRODUCTION (NC I)",
    "AGRICULTURAL CROP PRODUCTION (NC II)",
    "AGRICULTURAL CROP PRODUCTION (NC III)",
    "ANIMAL HEALTH CARE MANAGEMENT (NC III)",
    "ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)",
    "ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)",
    "ANIMAL PRODUCTION- SWINE (NC II)",
    "AQUACULTURE (NC II)",
    "ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)",
    "ARTIFICIAL INSEMINATION- SWINE (NC II)",
    "FISH CAPTURE (NC II)",
    "FISH PRODUCTS PACKAGING (NC II)",
    "FISH WHARF OPERATION (NC I)",
    "FISHING GEAR REPAIR AND MAINTENANCE (NC III)",
    "FOOD PROCESSING (NC II)",
    "HORTICULTURE (NC III)",
    "LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)",
    "ORGANIC AGRICULTURE PRODUCTION (NC II)",
    "PEST MANAGEMENT (NC II)",
    "RICE MACHINERY OPERATION (NC II)",
    "RUBBER PROCESSING (NC II)",
    "RUBBER PRODUCTION (NC I)",
    "SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)",
    "ATTRACTIONS AND THEME PARKS TOURISM (NC II)",
    "BARBERING (NC II)",
    "BARTENDING (NC II)",
    "BEAUTY/ NAIL CARE (NC II)",
    "BREAD AND PASTRY PRODUCTION (NC II)",
    "CAREGIVING (NC II)",
    "COMMERCIAL COOKING (NC III)",
    "COOKERY (NC II)",
    "DRESSMAKING (NC II)",
    "EVENTS MANAGEMENT SERVICES (NC III)",
    "FASHION DESIGN (NC III)",
    "FOOD AND BEVERAGE SERVICES (NC II)",
    "FRONT OFFICE SERVICES (NC II)",
    "HAIRDRESSING (NC II)",
    "HAIRDRESSING (NC III)",
    "HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT",
    "HANDICRAFT- NEEDLECRAFT",
    "HANDICRAFT- WOODCRAFT LEATHERCRAFT",
    "HANDICRAFT- BASKETRY MACRAME",
    "HOUSEKEEPING (NC II)",
    "TAILORING (NC II)",
    "LOCAL GUIDING SERVICES (NC II)",
    "TOURISM PROMOTION SERVICES (NC II)",
    "TRAVEL SERVICES (NC II)",
    "WELLNESS MASSAGE (NC II)",
    "ANIMATION (NC II)",
    "BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)",
    "COMPUTER SYSTEMS SERVICING (NC II)",
    "COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)",
    "COMPUTER PROGRAMMING JAVA (NC III)",
    "COMPUTER PROGRAMMING ORACLE DATABASE (NC III)",
    "CONTACT CENTER SERVICES (NC II)",
    "ILLUSTRATION (NC II)",
    "MEDICAL TRANSCRIPTION (NC II)",
    "TECHNICAL DRAFTING (NC II)",
    "TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)",
    "TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)",
    "AUTOMOTIVE SERVICING (NC I)",
    "AUTOMOTIVE SERVICING (NC II)",
    "CARPENTRY (NC II)",
    "CARPENTRY (NC III)",
    "CONSTRUCTION PAINTING (NC II)",
    "ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)",
    "DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)",
    "DRIVING (NC II)",
    "ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)",
    "ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)",
    "FURNITURE MAKING- FINISHING (NC II)",
    "GAS METAL ARC WELDING- GMAW (NC II)",
    "GAS TUNGSTEN ARC WELDING- GTAW (NC II)",
    "INSTRUMENTATION AND CONTROL SERVICING (NC II)",
    "MACHINING (NC I)",
    "MACHINING (NC II)",
    "MASONRY (NC II)",
    "MECHATRONICS SERVICING (NC II)",
    "MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)",
    "PLUMBING (NC I)",
    "PLUMBING (NC II)",
    "REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)",
    "SHIELDED METAL ARC WELDING (NC I)",
    "SHIELDED METAL ARC WELDING (NC II)",
    "TILE SETTING (NC II)",
    "TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)",
    "WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (80)",
    "(GAS) AGRICULTURAL CROP PRODUCTION (NC I)",
    "(GAS) AGRICULTURAL CROP PRODUCTION (NC II)",
    "(GAS) AGRICULTURAL CROP PRODUCTION (NC III)",
    "(GAS) ANIMAL HEALTH CARE MANAGEMENT (NC III)",
    "(GAS) ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)",
    "(GAS) ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)",
    "(GAS) ANIMAL PRODUCTION- SWINE (NC II)",
    "(GAS) AQUACULTURE (NC II)",
    "(GAS) ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)",
    "(GAS) ARTIFICIAL INSEMINATION- SWINE (NC II)",
    "(GAS) FISH CAPTURE (NC II)",
    "(GAS) FISH PRODUCTS PACKAGING (NC II)",
    "(GAS) FISH WHARF OPERATION (NC I)",
    "(GAS) FISHING GEAR REPAIR AND MAINTENANCE (NC III)",
    "(GAS) FOOD PROCESSING (NC II)",
    "(GAS) HORTICULTURE (NC III)",
    "(GAS) LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)",
    "(GAS) ORGANIC AGRICULTURE PRODUCTION (NC II)",
    "(GAS) PEST MANAGEMENT (NC II)",
    "(GAS) RICE MACHINERY OPERATION (NC II)",
    "(GAS) RUBBER PROCESSING (NC II)",
    "(GAS) RUBBER PRODUCTION (NC I)",
    "(GAS) SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)",
    "(GAS) ATTRACTIONS AND THEME PARKS TOURISM (NC II)",
    "(GAS) BARBERING (NC II)",
    "(GAS) BARTENDING (NC II)",
    "(GAS) BEAUTY/ NAIL CARE (NC II)",
    "(GAS) BREAD AND PASTRY PRODUCTION (NC II)",
    "(GAS) CAREGIVING (NC II)",
    "(GAS) COMMERCIAL COOKING (NC III)",
    "(GAS) COOKERY (NC II)",
    "(GAS) DRESSMAKING (NC II)",
    "(GAS) EVENTS MANAGEMENT SERVICES (NC III)",
    "(GAS) FASHION DESIGN (NC III)",
    "(GAS) FOOD AND BEVERAGE SERVICES (NC II)",
    "(GAS) FRONT OFFICE SERVICES (NC II)",
    "(GAS) HAIRDRESSING (NC II)",
    "(GAS) HAIRDRESSING (NC III)",
    "(GAS) HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT",
    "(GAS) HANDICRAFT- NEEDLECRAFT",
    "(GAS) HANDICRAFT- WOODCRAFT LEATHERCRAFT",
    "(GAS) HANDICRAFT- BASKETRY MACRAME",
    "(GAS) HOUSEKEEPING (NC II)",
    "(GAS) TAILORING (NC II)",
    "(GAS) LOCAL GUIDING SERVICES (NC II)",
    "(GAS) TOURISM PROMOTION SERVICES (NC II)",
    "(GAS) TRAVEL SERVICES (NC II)",
    "(GAS) WELLNESS MASSAGE (NC II)",
    "(GAS) ANIMATION (NC II)",
    "(GAS) BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)",
    "(GAS) COMPUTER SYSTEMS SERVICING (NC II)",
    "(GAS) COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)",
    "(GAS) COMPUTER PROGRAMMING JAVA (NC III)",
    "(GAS) COMPUTER PROGRAMMING ORACLE DATABASE (NC III)",
    "(GAS) CONTACT CENTER SERVICES (NC II)",
    "(GAS) ILLUSTRATION (NC II)",
    "(GAS) MEDICAL TRANSCRIPTION (NC II)",
    "(GAS) TECHNICAL DRAFTING (NC II)",
    "(GAS) TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)",
    "(GAS) TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)",
    "(GAS) AUTOMOTIVE SERVICING (NC I)",
    "(GAS) AUTOMOTIVE SERVICING (NC II)",
    "(GAS) CARPENTRY (NC II)",
    "(GAS) CARPENTRY (NC III)",
    "(GAS) CONSTRUCTION PAINTING (NC II)",
    "(GAS) ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)",
    "(GAS) DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)",
    "(GAS) DRIVING (NC II)",
    "(GAS) ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)",
    "(GAS) ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)",
    "(GAS) FURNITURE MAKING- FINISHING (NC II)",
    "(GAS) GAS METAL ARC WELDING- GMAW (NC II)",
    "(GAS) GAS TUNGSTEN ARC WELDING- GTAW (NC II)",
    "(GAS) INSTRUMENTATION AND CONTROL SERVICING (NC II)",
    "(GAS) MACHINING (NC I)",
    "(GAS) MACHINING (NC II)",
    "(GAS) MASONRY (NC II)",
    "(GAS) MECHATRONICS SERVICING (NC II)",
    "(GAS) MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)",
    "(GAS) PLUMBING (NC I)",
    "(GAS) PLUMBING (NC II)",
    "(GAS) REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)",
    "(GAS) SHIELDED METAL ARC WELDING (NC I)",
    "(GAS) SHIELDED METAL ARC WELDING (NC II)",
    "(GAS) TILE SETTING (NC II)",
    "(GAS) TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)",
    "WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (160)",
    "DISASTER READINESS AND RISK REDUCTION",
    "EARTH SCIENCE",
    "EARTH AND LIFE SCIENCE",
    "PHYSICAL SCIENCE",
    "WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY (240)",
    "NAVIGATIONAL WATCH 1",
    "NAVIGATIONAL WATCH 2",
    "NAVIGATIONAL WATCH 3",
    "ENGINE WATCH 1",
    "ENGINE WATCH 2",
    "SAFETY 1",
    "SAFETY 2",
    "SHIP'S CATERING SERVICES 1",
    "MARITIME (PB)",
    "PRE-CALCULUS",
    "BASIC CALCULUS",
    "GENERAL PHYSICS 1",
    "GENERAL PHYSICS 2",
    "GENERAL CHEMISTRY 1",
    "INTRODUCTION TO MARITIME CAREER",
    "INTRODUCTION TO MARINE TRANSPORTATION AND ENGINEERING",
    "INTRODUCTION TO MARITIME SAFETY",
    "INQUIRIES, INVESTIGATIONS AND IMMERSION",
    "RESEARCH/CAPSTONE PROJECT",
    "OTHERS SPECIALIZED SUBJECT"
  ],
  "SSHS-CORE": [
    "EFFECTIVE COMMUNICATION",
    "MABISANG KOMUNIKASYON",
    "GENERAL MATHEMATICS",
    "GENERAL SCIENCE",
    "LIFE AND CAREER SKILLS",
    "PAG-AARAL NG KASAYSAYAN AT LIPUNANG PILIPINO"
  ],
  "SSHS-ACADEMIC": [
    "ARTS 1 (CREATIVE INDUSTRIES - VISUAL ART, LITERARY ART, MEDIA ART, APPLIED ART, AND TRADITIONAL ART)",
    "ARTS 2 (CREATIVE INDUSTRIES - MUSIC, DANCE, AND THEATER)",
    "FILIPINO IDENTITY THROUGH THE ARTS",
    "LEADERSHIP AND MANGEMENT IN THE ARTS",
    "CITIZENSHIP AND CIVIC ENGAGEMENT",
    "CONTEMPORARY LITERATURE 1",
    "CONTEMPORARY LITERATURE 2",
    "CREATIVE COMPOSITION 1",
    "CREATIVE COMPOSITION 2",
    "FILIPINO 1 (WIKA AT KOMUNIKASYON SA AKADEMIKONG FILIPINO)",
    "FILIPINO 2 (FILIPINO PARA SA LARANG TEKNIKAL-PROPESYONAL)",
    "FILIPINO 2 (FILIPINO SA ISPORTS)",
    "FILIPINO 2 (FILIPINO SA SINING AT DISENYO)",
    "INTRODUCTION TO PHILOSOPHY",
    "MALIKHAING PAGSULAT",
    "PHILIPPINE GOVERNANCE (PHILIPPINE POLITICS AND GOVERNANCE)",
    "SOCIAL SCIENCES (THEORY AND PRACTICE)",
    "BUSINESS 1 (BASIC ACCOUNTING)",
    "BUSINESS 2 (BUSINESS FINANCE AND INCOME TAXATION)",
    "BUSINESS 3 (BUSINESS ECONOMICS)",
    "CONTEMPORARY MARKETING",
    "ENTREPRENEURSHIP",
    "INTRODUCTION TO ORGANIZATION AND MANAGEMENT",
    "ADVANCED MATHEMATICS 1",
    "ADVANCED MATHEMATICS 2",
    "BIOLOGY 1",
    "BIOLOGY 2",
    "BIOLOGY 3",
    "BIOLOGY 4",
    "CHEMISTRY 1",
    "CHEMISTRY 2",
    "CHEMISTRY 3",
    "CHEMISTRY 4",
    "DATABASE MANAGEMENT",
    "EARTH AND SPACE SCIENCE 1",
    "EARTH AND SPACE SCIENCE 2",
    "EARTH AND SPACE SCIENCE 3",
    "EARTH AND SPACE SCIENCE 4",
    "EMPOWERMENT TECHNOLOGIES",
    "FINITE MATHEMATICS 1",
    "FINITE MATHEMATICS 2",
    "FUNDAMENTALS IN DATA ANALYTICS",
    "GENERAL SCIENCE 3",
    "GENERAL SCIENCE 4",
    "PHYSICS 1",
    "PHYSICS 2",
    "PHYSICS 3",
    "PHYSICS 4",
    "PRE-CALCULUS 1",
    "PRE-CALCULUS 2",
    "TRIGONOMETRY 1",
    "TRIGONOMETRY 2",
    "EXERCISE AND SPORTS PROGRAMMING",
    "HUMAN MOVEMENT 1 (BASIC ANATOMY IN SPORTS AND EXERCISE)",
    "HUMAN MOVEMENT 2 (MOTOR SKILLS DEVELOPMENT)",
    "PHYSICAL EDUCATION 1 (FITNESS AND RECREATION)",
    "PHYSICAL EDUCATION 2 (SPORTS AND DANCE)",
    "SAFETY AND FIRST AID",
    "SPORTS ACTIVITY MANAGEMENT",
    "SPORTS COACHING",
    "SPORTS OFFICIATING",
    "ARTS APPRENTICESHIP (DANCE, MUSIC, THEATER ARTS, LITERARY ARTS, VISUAL ARTS, VISUAL, MEDIA, APPLIED, AND TRADITIONAL ART)",
    "CREATIVE PRODUCTION AND PRESENTATION",
    "DESIGN AND INNOVATION",
    "RESEARCH METHODS",
    "(IN-CAMPUS) SPORTS",
    "(OFF-CAMPUS) (BUSINESS AND ENTREPRENEURSHIP/ SPORTS HEALTH, AND WELLNESS/ SCIENCE, TECHNOLOGY, ENGINEERING, AND MATHEMATICS)",
    "ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL"
  ],
  "SSHS-TECHPRO": [
    "AESTHETIC SERVICES (BEAUTY CARE)",
    "BARBERING SERVICES",
    "CAREGIVING (ADULT CARE)",
    "CAREGIVING (CHILD CARE)",
    "HAIRDRESSING SERVICES",
    "WELLNESS SERVICES (HILOT/MASSAGE)",
    "AGRICULTURAL CROPS PRODUCTION",
    "AGRO-ENTREPRENEURSHIP",
    "AQUACULTURE",
    "FISH CAPTURE OPERATION",
    "FOOD PROCESSING",
    "ORGANIC AGRICULTURE PRODUCTION",
    "POULTRY PRODUCTION (CHICKEN)",
    "RUMINANTS PRODUCTION",
    "SWINE PRODUCTION",
    "GARMENTS ARTISANRY",
    "HANDICRAFTS (WEAVING)",
    "AUTOMOTIVE SERVICING (ELECTRICAL REPAIR)",
    "AUTOMOTIVE SERVICING (ENGINE AND CHASSIS REPAIRS)",
    "DRIVING AND AUTOMOTIVE SERVICING",
    "MOTORCYCLE AND SMALL ENGINE SERVICING",
    "CARPENTRY",
    "CONSTRUCTION OPERATION",
    "MANUAL METAL ARC WELDING",
    "TECHNICAL DRAFTING",
    "ANIMATION",
    "ILLUSTRATION",
    "VISUAL GRAPHICS DESIGN",
    "BAKERY OPERATION",
    "EVENTS MANAGEMENT SERVICES",
    "FOOD AND BEVERAGE OPERATION",
    "HOTEL OPERATION (FRONT OFFICE SERVICES)",
    "HOTEL OPERATION (HOUSEKEEPING SERVICES)",
    "KITCHEN OPERATIONS",
    "TOURISM SERVICES",
    "COMMERCIAL AIR-CONDITIONING INSTALLATION AND SERVICING",
    "DOMESTIC REFRIGERATION AND AIR-CONDITIONING SERVICING",
    "ELECTRICAL INSTALLATION MAINTENANCE",
    "ELECTRONICS PRODUCT ASSEMBLY AND SERVICING",
    "MECHATRONICS",
    "PHOTOVOLTAIC SYSTEMS INSTALLATION",
    "BROADBAND INSTALLATION",
    "COMPUTER PROGRAMMING (JAVA)",
    "COMPUTER PROGRAMMING (.NET TECHNOLOGY)",
    "COMPUTER PROGRAMMING (ORACLE DATABASE)",
    "COMPUTER SYSTEMS SERVICING",
    "CONTACT CENTER SERVICES",
    "MARINE ENGINEERING AT THE SUPPORT LEVEL",
    "MARINE TRANSPORTATION AT THE SUPPORT LEVEL",
    "SHIPS CATERING SERVICES",
    "WORK IMMERSION - AESTHETIC, WELLNESS AND HUMAN CARE CLUSTER",
    "WORK IMMERSION - AGRI-FISHERY BUSINESS AND FOOD INNOVATION",
    "WORK IMMERSION - ARTISANRY AND CREATIVE ENTERPRISE",
    "WORK IMMERSION - AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES",
    "WORK IMMERSION - CONSTRUCTION AND BUILDING TECHNOLOGIES",
    "WORK IMMERSION - CREATIVE ARTS AND DESIGN TECHNOLOGIES",
    "WORK IMMERSION - HOSPITALITY AND TOURISM",
    "WORK IMMERSION - INDUSTRIAL TECHNOLOGIES",
    "WORK IMMERSION - ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES",
    "WORK IMMERSION - MARITIME TRANSPORT",
    "ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL"
  ]
};

export default function Workload() {
  const {
    personnel,
    setPersonnel,
    activePersonnelId,
    setActivePersonnelId,
    updatePersonnelInfo,
    savePersonnelChanges,
    classSections,
    schoolInfo,
    workloadTransfers,
    addWorkloadTransfer,
    removeWorkloadTransfer,
    showToast,
    showAlert,
    showConfirm
  } = useApp();

  // Helper to expand high-level offerings like SHS into the subcategories expected by Workload builder
  const getExpandedOfferings = () => {
    const raw = Array.isArray(schoolInfo?.curricularOffering) && schoolInfo.curricularOffering.length > 0
      ? schoolInfo.curricularOffering
      : ['Elementary', 'JHS', 'SHS'];
    const expanded = [...raw];
    if (expanded.includes('SHS')) {
      const shsSubCategories = ['SHS-CORE SUBJECTS', 'SHS-APPLIED SUBJECTS', 'SHS-SPECIALIZED SUBJECTS', 'SSHS-CORE', 'SSHS-ACADEMIC', 'SSHS-TECHPRO'];
      shsSubCategories.forEach(cat => {
        if (!expanded.includes(cat)) {
          expanded.push(cat);
        }
      });
    }
    return expanded;
  };

  // Form states for Workload Transfer
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [substituteTeacherId, setSubstituteTeacherId] = useState('');
  const [transferStartDate, setTransferStartDate] = useState('');
  const [transferEndDate, setTransferEndDate] = useState('');
  const [selectedWorkloadIndexes, setSelectedWorkloadIndexes] = useState([]);

  // By-Section view state
  const [workloadView, setWorkloadView] = useState('by-personnel');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [newSlot, setNewSlot] = useState({ teacherId: '', subject: '', startTime: '08:00', endTime: '09:00', days: ['M', 'T', 'W', 'TH', 'F'] });
  const [slotConflict, setSlotConflict] = useState(null);

  // Timetable Schedule Verification State & Modal
  const [showAttentionModal, setShowAttentionModal] = useState(false);
  const verifiedModalDismissedMap = useRef({});

  // Multi-Date Calendar Selector Modal State
  const [calendarModalConfig, setCalendarModalConfig] = useState(null); // { category, taskIdx, taskName }
  const [calendarSelectedDates, setCalendarSelectedDates] = useState([]); // Array of 'YYYY-MM-DD'
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth()); // 0-indexed
  const [calendarStartTime, setCalendarStartTime] = useState('08:00');
  const [calendarEndTime, setCalendarEndTime] = useState('17:00');

  const openCalendarModal = (category, taskIdx, task) => {
    const existingDates = (task.dates || []).map(d => d.date).filter(Boolean);
    const firstStartTime = task.dates?.[0]?.startTime || '08:00';
    const firstEndTime = task.dates?.[0]?.endTime || '17:00';

    setCalendarModalConfig({ category, taskIdx, taskName: task.task || 'Task' });
    setCalendarSelectedDates(existingDates);
    setCalendarStartTime(firstStartTime);
    setCalendarEndTime(firstEndTime);

    if (existingDates.length > 0) {
      const parts = existingDates[0].split('-');
      if (parts.length === 3) {
        setCalendarYear(parseInt(parts[0], 10));
        setCalendarMonth(parseInt(parts[1], 10) - 1);
      }
    } else {
      setCalendarYear(new Date().getFullYear());
      setCalendarMonth(new Date().getMonth());
    }
  };

  const handleApplyCalendarDates = () => {
    if (!calendarModalConfig) return;
    const { category, taskIdx } = calendarModalConfig;

    const newDates = calendarSelectedDates.map(dStr => ({
      date: dStr,
      startTime: calendarStartTime,
      endTime: calendarEndTime
    }));

    if (newDates.length === 0) {
      newDates.push({ date: '', startTime: calendarStartTime, endTime: calendarEndTime });
    }

    updateTaskField(category, taskIdx, 'dates', newDates);
    const appliedName = calendarModalConfig.taskName;
    const count = calendarSelectedDates.length;
    setCalendarModalConfig(null);
    if (showToast) showToast(`✓ Applied ${count} selected date(s) to ${appliedName}!`);
  };

  const toggleCalendarDate = (dStr) => {
    setCalendarSelectedDates(prev => {
      if (prev.includes(dStr)) {
        return prev.filter(x => x !== dStr);
      } else {
        return [...prev, dStr];
      }
    });
  };

  const handleSelectAllWeekdaysInMonth = () => {
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const newDates = [...calendarSelectedDates];

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(calendarYear, calendarMonth, day);
      const dayOfWeek = d.getDay(); // 0 = Sun, 6 = Sat
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const mm = String(calendarMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dStr = `${calendarYear}-${mm}-${dd}`;
        if (!newDates.includes(dStr)) {
          newDates.push(dStr);
        }
      }
    }
    setCalendarSelectedDates(newDates);
  };

  const handleToggleSpecificDayOfWeek = (targetDayOfWeek) => {
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const monthDayStrings = [];

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(calendarYear, calendarMonth, day);
      if (d.getDay() === targetDayOfWeek) {
        const mm = String(calendarMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        monthDayStrings.push(`${calendarYear}-${mm}-${dd}`);
      }
    }

    const allAlreadySelected = monthDayStrings.length > 0 && monthDayStrings.every(dStr => calendarSelectedDates.includes(dStr));

    if (allAlreadySelected) {
      setCalendarSelectedDates(prev => prev.filter(dStr => !monthDayStrings.includes(dStr)));
    } else {
      setCalendarSelectedDates(prev => {
        const set = new Set([...prev, ...monthDayStrings]);
        return Array.from(set);
      });
    }
  };

  const handleVerifySchedule = (personId) => {
    if (!personId) return;

    // 1. Update AppContext React state
    setPersonnel(prev => (Array.isArray(prev) ? prev : []).map(p => {
      if (p.id === personId) {
        return { ...p, workloadVerified: true, needsTimeReview: false };
      }
      return p;
    }));

    // 2. Update active editPerson state in Workload component
    setEditPerson(prev => {
      if (prev && prev.id === personId) {
        return { ...prev, workloadVerified: true, needsTimeReview: false };
      }
      return prev;
    });

    // 3. Update localStorage draft if present
    const draftKey = `draft_workload_${personId}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed) {
          localStorage.setItem(draftKey, JSON.stringify({ ...parsed, workloadVerified: true, needsTimeReview: false }));
        }
      } catch (e) {}
    }

    verifiedModalDismissedMap.current[personId] = true;
    setShowAttentionModal(false);
    if (showToast) showToast("✓ Timetable schedule confirmed and saved!");
  };

  const handleConfirmAllAndSave = async () => {
    let confirmedCount = 0;
    const errorTeachers = [];

    const updatedPersonnelList = (personnel || []).map(p => {
      if (p.isDraft) return p;

      // Check if this teacher has duration or overlap blocking errors
      const tRows = p.workloadRows || [];
      const hasErrors = tRows.some((r, rIdx) => {
        if (getRowDurationError(r)) return true;
        return tRows.some((otherR, oIdx) => {
          if (rIdx === oIdx) return false;
          if (!r.startTime || !r.endTime || !otherR.startTime || !otherR.endTime) return false;
          const daysOverlap = (r.days || []).some(d => (otherR.days || []).includes(d));
          if (!daysOverlap) return false;
          const ns = parseTimeToMinutes(r.startTime), ne = parseTimeToMinutes(r.endTime);
          const rs = parseTimeToMinutes(otherR.startTime), re = parseTimeToMinutes(otherR.endTime);
          if (ns < re && ne > rs) {
            if (isAdvisoryOrHgpPair(r, otherR)) return false;
            return true;
          }
          return false;
        });
      });

      if (hasErrors) {
        errorTeachers.push(`${p.lastName}, ${p.firstName}`);
        return p; // Skip unverified teacher with errors
      }

      // Mark verified
      confirmedCount++;
      const updatedP = { ...p, workloadVerified: true, needsTimeReview: false };

      // Update local storage draft if present
      const draftKey = `draft_workload_${p.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed) {
            localStorage.setItem(draftKey, JSON.stringify({ ...parsed, workloadVerified: true, needsTimeReview: false }));
          }
        } catch (e) {}
      }

      return updatedP;
    });

    // Batch update React state in AppContext
    setPersonnel(updatedPersonnelList);

    // Update active editPerson if present
    if (editPerson) {
      const activeUpdated = updatedPersonnelList.find(x => x.id === editPerson.id);
      if (activeUpdated) setEditPerson(activeUpdated);
    }

    setShowAttentionModal(false);

    if (errorTeachers.length === 0) {
      if (showToast) showToast(`✓ Successfully confirmed & saved timetables for ALL ${confirmedCount} personnel!`);
      await showAlert("Batch Timetable Verification", `✓ All ${confirmedCount} personnel schedules have been confirmed and saved!`);
    } else {
      await showAlert(
        "Batch Timetable Verification",
        `✓ Confirmed and saved ${confirmedCount} personnel schedules!\n\n⚠️ ${errorTeachers.length} personnel were skipped due to red duration errors (> 60m / > 6h SHS) or schedule overlaps:\n• ${errorTeachers.slice(0, 5).join('\n• ')}${errorTeachers.length > 5 ? `\n...and ${errorTeachers.length - 5} more` : ''}`
      );
    }
  };

  // Filter states
  const [gradeFilter, setGradeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [layoutType, setLayoutType] = useState('list'); // 'list' | 'card'
  const [timeSortOrder, setTimeSortOrder] = useState('desc'); // 'added' | 'asc' | 'desc'
  const [newlyAddedWorkloadId, setNewlyAddedWorkloadId] = useState(null);
  const workloadCardRefs = React.useRef({});

  // Delegation & Batch Import state
  const [showOrganizedClassCheckModal, setShowOrganizedClassCheckModal] = useState(false);
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [selectedTeacherIdsForDelegation, setSelectedTeacherIdsForDelegation] = useState([]);
  const [delegationSearch, setDelegationSearch] = useState('');
  const [delegationGradeFilter, setDelegationGradeFilter] = useState('all');
  const [showImportBatchModal, setShowImportBatchModal] = useState(false);
  const [importedBatchData, setImportedBatchData] = useState(null);
  const batchImportFileRef = useRef(null);

  useEffect(() => {
    if (showDelegationModal && selectedTeacherIdsForDelegation.length === 0) {
      const validTeacherIds = (personnel || []).map(p => String(p.id));
      setSelectedTeacherIdsForDelegation(validTeacherIds);
    }
  }, [showDelegationModal, personnel]);

  const handleGenerateDelegationPackageHTML = () => {
    const selIds = selectedTeacherIdsForDelegation.map(id => String(id));
    console.log('[Delegation HTML] personnel count:', (personnel || []).length);
    console.log('[Delegation HTML] selIds:', selIds);
    console.log('[Delegation HTML] personnel IDs:', (personnel || []).map(p => String(p.id)));
    const rawSelected = (personnel || []).filter(p => selIds.includes(String(p.id)));
    console.log('[Delegation HTML] rawSelected count:', rawSelected.length);

    if (rawSelected.length === 0) {
      showAlert("No Teachers Selected", "Please select at least one teacher to delegate workload entry.");
      return;
    }

    const selectedTeachers = rawSelected.map(p => {
      const draftKey = `draft_workload_${p.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let personData = { ...p };
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed && Array.isArray(parsed.workloadRows)) {
            personData.workloadRows = parsed.workloadRows;
          }
        } catch (e) {
          console.error("Failed to parse draft workload for teacher", p.id, e);
        }
      }
      if (!Array.isArray(personData.workloadRows)) {
        personData.workloadRows = [];
      }
      return personData;
    });

    const htmlContent = generateWorkloadDelegationHTML({
      schoolInfo,
      selectedTeachers,
      classSections,
      customSubjects: schoolInfo?.subjectsConfig?.customSubjects || [],
      GRADE_LEVEL_SUBJECTS,
      REMEDIATION_FOCUS_BY_CATEGORY
    });

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Workload_Delegation_Package_${(schoolInfo?.schoolName || 'School').replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDelegationModal(false);
    showToast(`Workload Delegation Package HTML generated for ${selectedTeachers.length} teachers!`, 'success');
  };

  const handleBatchJSONImportSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const payload = JSON.parse(event.target.result);
        if (payload && payload.version === 'INSIGHTED_WORKLOAD_DELEGATION_V1' && payload.teachersWorkload) {
          setImportedBatchData(payload);
          setShowImportBatchModal(true);
        } else {
          showAlert("Invalid Data File", "The uploaded file is not a valid InsightED Workload Return payload.");
        }
      } catch (err) {
        console.error("Failed to parse batch JSON file", err);
        showAlert("File Read Error", "Could not read the JSON file. Please ensure it is valid.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApproveAndMergeBatchImport = async () => {
    if (!importedBatchData || !importedBatchData.teachersWorkload) return;

    let mergedCount = 0;
    const teachersMap = importedBatchData.teachersWorkload;

    Object.entries(teachersMap).forEach(([personnelId, rows]) => {
      const targetPerson = personnel.find(p => p.id === personnelId);
      if (targetPerson) {
        const draftKey = `draft_workload_${personnelId}`;
        const savedDraft = localStorage.getItem(draftKey);
        let basePerson = targetPerson;
        if (savedDraft) {
          try {
            const parsed = JSON.parse(savedDraft);
            if (parsed) basePerson = parsed;
          } catch (e) {}
        }
        const updated = { ...basePerson, workloadRows: rows };
        localStorage.setItem(draftKey, JSON.stringify(updated));
        mergedCount++;
      }
    });

    if (dbPerson && teachersMap[dbPerson.id]) {
      const updatedActive = { ...currentPerson, workloadRows: teachersMap[dbPerson.id] };
      setEditPerson(updatedActive);
    }

    setShowImportBatchModal(false);
    setImportedBatchData(null);
    showToast(`Successfully merged workloads for ${mergedCount} teachers locally!`, 'success');
  };

  useEffect(() => {
    if (newlyAddedWorkloadId && workloadCardRefs.current[newlyAddedWorkloadId]) {
      const el = workloadCardRefs.current[newlyAddedWorkloadId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
      const timer = setTimeout(() => {
        setNewlyAddedWorkloadId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyAddedWorkloadId]);

  useEffect(() => {
    setNewlyAddedWorkloadId(null);
  }, [activePersonnelId]);

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 99999;
    let str = timeStr.trim();
    if (str.includes('-')) {
      str = str.split('-')[0].trim();
    }
    const upperStr = str.toUpperCase();
    const isPM = upperStr.includes('PM');
    const isAM = upperStr.includes('AM');
    const cleanStr = upperStr.replace(/[^\d:]/g, '');
    const parts = cleanStr.split(':');
    if (parts.length < 2) return 99999;

    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  const getAssignedGradeLevels = (p) => {
    if (!p) return [];
    const assigned = [...(Array.isArray(p.assignedGradeLevels) ? p.assignedGradeLevels : [])];
    (classSections || []).forEach(s => {
      if (s.advisorId && p.id && String(s.advisorId) === String(p.id) && !assigned.includes(s.gradeLevel)) {
        assigned.push(s.gradeLevel);
      }
    });
    return assigned;
  };

  // Filter people list based on search query, grade level, and category (teaching / teaching-related)
  const filteredPeople = personnel.filter(p => {
    if (p.isDraft) return false;

    // 1. Search filter
    const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
    const position = (p.position || '').toLowerCase();
    const query = teacherSearch.toLowerCase().trim();
    const matchesSearch = fullName.includes(query) || position.includes(query);

    // 2. Category filter
    const matchesCat = categoryFilter === 'all' || p.type === categoryFilter;

    // 3. Grade Level filter
    let matchesGrade = true;
    if (gradeFilter !== 'all') {
      if (p.type === 'non-teaching') {
        matchesGrade = false;
      } else {
        const assigned = getAssignedGradeLevels(p);
        const rowGrades = (p.workloadRows || []).map(r => r.gradeLevel).filter(Boolean);
        matchesGrade = assigned.includes(gradeFilter) || rowGrades.includes(gradeFilter);
      }
    }

    return matchesSearch && matchesCat && matchesGrade;
  });

  const dbPerson = filteredPeople.find(p => p.id === activePersonnelId) || filteredPeople[0] || null;
  const [editPerson, setEditPerson] = useState(null);

  useEffect(() => {
    if (dbPerson) {
      const draftKey = `draft_workload_${dbPerson.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let person = dbPerson;
      if (savedDraft) {
        try {
          person = JSON.parse(savedDraft);
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }

      const isNonTeachingPerson = (person.type === 'non-teaching') || (
        String(person.position || '').toUpperCase().includes('ADMINISTRATIVE') ||
        String(person.position || '').toUpperCase().includes('ADAS') ||
        String(person.position || '').toUpperCase().includes('BOOKKEEPER') ||
        String(person.position || '').toUpperCase().includes('SECURITY') ||
        String(person.position || '').toUpperCase().includes('UTILITY') ||
        String(person.position || '').toUpperCase().includes('NURSE') ||
        String(person.position || '').toUpperCase().includes('DRIVER') ||
        String(person.position || '').toUpperCase().includes('AIDE') ||
        String(person.position || '').toUpperCase().includes('ACCOUNTANT') ||
        String(person.position || '').toUpperCase().includes('DISBURSING')
      );

      if (isNonTeachingPerson && person.workloadRows && person.workloadRows.length > 0) {
        let currentAdmin = [...(person.administrativeRows || [])];
        let currentTR = [...(person.teachingRelatedRows || [])];

        person.workloadRows.forEach((w, wIdx) => {
          const taskName = w.subject || w.task || 'Administrative Duties';
          const taskUpper = String(taskName).toUpperCase();
          const isTR = taskUpper.includes('TR') || taskUpper.includes('TEACHING RELATED') || taskUpper.includes('TEACHING-RELATED');

          const newRow = {
            id: `migrated-${Date.now()}-${wIdx}`,
            task: taskName,
            dates: [
              {
                date: '',
                startTime: w.startTime || '08:00',
                endTime: w.endTime || '17:00',
                days: w.days || ['M', 'T', 'W', 'TH', 'F']
              }
            ]
          };

          if (isTR) {
            if (!currentTR.some(r => r.task === taskName)) currentTR.push(newRow);
          } else {
            if (!currentAdmin.some(r => r.task === taskName)) currentAdmin.push(newRow);
          }
        });

        person = {
          ...person,
          workloadRows: [],
          administrativeRows: currentAdmin,
          teachingRelatedRows: currentTR
        };
      }

      let updatedRows = (isNonTeachingPerson) ? [] : (person.workloadRows || []).map(r => {
        let normSecId = (r.sectionId !== undefined && r.sectionId !== null && r.sectionId !== '')
          ? String(r.sectionId)
          : ((r.section_id !== undefined && r.section_id !== null && r.section_id !== '') ? String(r.section_id) : '');
        const normSub = r.subject || r.subject_name || '';
        const normGrade = r.gradeLevel || r.grade_level || '';
        if (!normSecId && normGrade) {
          const normGradeClean = normGrade.replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
          const matchingSec = (classSections || []).find(s =>
            s.gradeLevel && s.gradeLevel.replace(/\s*[\u2013\u2014-]\s*/g, ' - ') === normGradeClean
          );
          if (matchingSec) {
            normSecId = String(matchingSec.id);
          }
        }
        let normCat = r.category;
        if (!normCat && normGrade) {
          for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
            if (grades.includes(normGrade)) {
              normCat = cat;
              break;
            }
          }
        }
        return {
          ...r,
          sectionId: normSecId,
          subject: String(normSub || '').toUpperCase().trim(),
          gradeLevel: normGrade,
          category: normCat || 'Elementary'
        };
      });
      let rowsChanged = false;

      const advisorySections = (classSections || []).filter(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));
      const defaultAdvSecId = advisorySections.length > 0 ? String(advisorySections[0].id) : '';

      // Filter out obsolete HOMEROOM GUIDANCE rows and duplicate ADVISORY / HGP rows per section
      const seenAdvisorySecs = new Set();
      const seenHgpSecs = new Set();
      let cleanedRows = [];
      let didClean = false;

      updatedRows.forEach(r => {
        const subUpper = String(r.subject || '').toUpperCase().trim();
        if (subUpper === 'HOMEROOM GUIDANCE' || subUpper === 'HOMEROOM GUIDANCE (HGP)') {
          didClean = true;
          return;
        }
        if (subUpper === 'ADVISORY') {
          let secKey = String(r.sectionId || r.section_id || defaultAdvSecId || 'GLOBAL_ADV');
          if (!seenAdvisorySecs.has(secKey)) {
            seenAdvisorySecs.add(secKey);
            cleanedRows.push({ ...r, subject: 'ADVISORY', sectionId: r.sectionId || defaultAdvSecId || '' });
          } else {
            didClean = true;
          }
        } else if (subUpper === 'HGP') {
          let secKey = String(r.sectionId || r.section_id || defaultAdvSecId || 'GLOBAL_HGP');
          if (!seenHgpSecs.has(secKey)) {
            seenHgpSecs.add(secKey);
            cleanedRows.push({ ...r, subject: 'HGP', sectionId: r.sectionId || defaultAdvSecId || '' });
          } else {
            didClean = true;
          }
        } else {
          cleanedRows.push(r);
        }
      });

      if (didClean) {
        updatedRows = cleanedRows;
        rowsChanged = true;
      }

      if (advisorySections.length === 0) {
        const initialLen = updatedRows.length;
        updatedRows = updatedRows.filter(r => r.subject !== 'ADVISORY' && r.subject !== 'HGP' && r.subject !== 'HOMEROOM GUIDANCE');
        if (updatedRows.length !== initialLen) rowsChanged = true;
      } else {
        advisorySections.forEach(sec => {
          // 1. Check if ADVISORY exists in the workload rows for this section
          let advisoryIdx = updatedRows.findIndex(r => r.subject === 'ADVISORY' && (String(r.sectionId) === String(sec.id) || !r.sectionId));
          if (advisoryIdx === -1) {
            const newAdv = {
              id: `local-work-adv-${sec.id}-${Date.now()}`,
              sectionId: String(sec.id),
              gradeLevel: sec.gradeLevel,
              subject: 'ADVISORY',
              startTime: '07:30',
              endTime: '08:30',
              days: ['M', 'T', 'W', 'TH', 'F']
            };
            updatedRows.push(newAdv);
            advisoryIdx = updatedRows.length - 1;
            rowsChanged = true;
          } else {
            // Ensure sectionId and gradeLevel are synced with the active class section
            const existing = updatedRows[advisoryIdx];
            if (String(existing.sectionId) !== String(sec.id) || existing.gradeLevel !== sec.gradeLevel) {
              updatedRows[advisoryIdx] = {
                ...existing,
                sectionId: String(sec.id),
                gradeLevel: sec.gradeLevel
              };
              rowsChanged = true;
            }
          }

          // 2. Check if HGP exists in the workload rows for this section
          const hgpIdx = updatedRows.findIndex(r => (r.subject === 'HGP' || r.subject === 'HOMEROOM GUIDANCE') && (String(r.sectionId) === String(sec.id) || !r.sectionId));
          const advRow = updatedRows[advisoryIdx];
          const startTime = advRow?.startTime || '07:30';
          const endTime = advRow?.endTime || '08:30';

          if (hgpIdx === -1) {
            updatedRows.push({
              id: `local-work-hgp-${sec.id}-${Date.now() + 1}`,
              sectionId: String(sec.id),
              gradeLevel: sec.gradeLevel,
              subject: 'HGP',
              startTime,
              endTime,
              days: ['F']
            });
            rowsChanged = true;
          } else {
            const existingHgp = updatedRows[hgpIdx];
            if (existingHgp.subject !== 'HGP' || String(existingHgp.sectionId) !== String(sec.id) || existingHgp.gradeLevel !== sec.gradeLevel) {
              updatedRows[hgpIdx] = {
                ...existingHgp,
                subject: 'HGP',
                sectionId: String(sec.id),
                gradeLevel: sec.gradeLevel,
                startTime: existingHgp.startTime || startTime,
                endTime: existingHgp.endTime || endTime
              };
              rowsChanged = true;
            }
          }
        });
      }

      // Post-sanitization: Strictly enforce maximum ONE ADVISORY row and ONE HGP row per teacher
      const finalSanitizedRows = [];
      const seenAdvFinal = new Set();
      const seenHgpFinal = new Set();

      updatedRows.forEach(r => {
        const subUpper = String(r.subject || '').toUpperCase().trim();
        if (subUpper === 'ADVISORY') {
          if (seenAdvFinal.has('ADVISORY_SINGLETON')) {
            rowsChanged = true;
            return; // Drop duplicate ADVISORY row
          }
          seenAdvFinal.add('ADVISORY_SINGLETON');
        } else if (subUpper === 'HGP') {
          if (seenHgpFinal.has('HGP_SINGLETON')) {
            rowsChanged = true;
            return; // Drop duplicate HGP row
          }
          seenHgpFinal.add('HGP_SINGLETON');
        }
        finalSanitizedRows.push(r);
      });

      if (finalSanitizedRows.length !== updatedRows.length) {
        updatedRows = finalSanitizedRows;
        rowsChanged = true;
      }

      if (rowsChanged) {
        const updatedPerson = { ...person, workloadRows: updatedRows };
        setEditPerson(updatedPerson);
        localStorage.setItem(draftKey, JSON.stringify(updatedPerson));
      } else {
        setEditPerson(person);
      }
    } else {
      setEditPerson(null);
    }
  }, [activePersonnelId, dbPerson, classSections]);

  const currentPerson = editPerson || dbPerson;

  useEffect(() => {
    if (currentPerson && currentPerson.workloadVerified === false && !verifiedModalDismissedMap.current[currentPerson.id]) {
      setShowAttentionModal(true);
    } else {
      setShowAttentionModal(false);
    }
  }, [currentPerson?.id, currentPerson?.workloadVerified]);



  const handleFieldChangeForPerson = (personId, key, value) => {
    if (!personId) return;
    const baseP = personnel.find(p => p.id === personId);
    if (!baseP) return;

    const draftKey = `draft_workload_${personId}`;
    const savedDraft = localStorage.getItem(draftKey);
    let targetPerson = baseP;
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed) targetPerson = parsed;
      } catch (e) {}
    }

    const updated = { ...targetPerson, [key]: value };
    if (currentPerson && currentPerson.id === personId) {
      setEditPerson(updated);
    }
    localStorage.setItem(draftKey, JSON.stringify(updated));
  };

  const handleFieldChange = (key, value) => {
    if (!currentPerson) return;
    handleFieldChangeForPerson(currentPerson.id, key, value);
  };

  const getSubjectsForGrade = (grade, category = 'Elementary') => {
    const normGrade = grade ? String(grade).replace(/\s*[\u2013\u2014-]\s*/g, ' - ') : '';
    if (normGrade && normGrade.includes(' - ')) {
      const parts = normGrade.split(' - ');
      const union = new Set();
      parts.forEach(p => {
        const subs = getSubjectsForGrade(p, category);
        subs.forEach(s => union.add(s));
      });
      return Array.from(union);
    }

    let baseList = [];
    if (grade === 'MONO-GRADE') {
      if (category === 'Elementary') baseList = ELEMENTARY_MONO_GRADE_SUBJECTS;
      else if (category === 'JHS') baseList = JHS_MONO_GRADE_SUBJECTS;
      else if (category === 'SHS') baseList = SHS_MONO_GRADE_SUBJECTS;
      else baseList = ELEMENTARY_MONO_GRADE_SUBJECTS;
    } else if (grade === 'NON-GRADED') {
      if (category === 'JHS') baseList = JHS_NON_GRADED_SUBJECTS;
      else if (category === 'SHS') baseList = SHS_NON_GRADED_SUBJECTS;
      else baseList = JHS_NON_GRADED_SUBJECTS;
    } else if (grade === 'Grade 11' || grade === 'Grade 12') {
      const isGrade12 = grade === 'Grade 12';
      if (category === 'SHS') baseList = isGrade12 ? SHS_GRADE12_SUBJECTS : SHS_SUBJECTS;
      else if (category === 'SHS-CORE SUBJECTS') baseList = isGrade12 ? SHS_CORE_GRADE12_SUBJECTS : SHS_CORE_SUBJECTS;
      else if (category === 'SHS-APPLIED SUBJECTS') baseList = isGrade12 ? SHS_APPLIED_GRADE12_SUBJECTS : SHS_APPLIED_SUBJECTS;
      else if (category === 'SHS-SPECIALIZED SUBJECTS') baseList = isGrade12 ? SHS_SPECIALIZED_GRADE12_SUBJECTS : SHS_SPECIALIZED_SUBJECTS;
      else if (category === 'SSHS-CORE') baseList = SSHS_CORE_SUBJECTS;
      else if (category === 'SSHS-ACADEMIC') baseList = isGrade12 ? SSHS_ACADEMIC_GRADE12_SUBJECTS : SSHS_ACADEMIC_SUBJECTS;
      else if (category === 'SSHS-TECHPRO') baseList = isGrade12 ? SSHS_TECHPRO_GRADE12_SUBJECTS : SSHS_TECHPRO_SUBJECTS;
      else baseList = isGrade12 ? SHS_GRADE12_SUBJECTS : SHS_SUBJECTS;
    } else {
      baseList = GRADE_LEVEL_SUBJECTS[grade] || SUBJECT_OPTIONS;
    }

    // Load custom subjects added under "Subjects Taught"
    const storedCustom = (() => {
      try {
        const saved = schoolInfo?.subjectsConfig?.customSubjects || (localStorage.getItem('school_custom_subjects') ? JSON.parse(localStorage.getItem('school_custom_subjects')) : []);
        return Array.isArray(saved) ? saved : [];
      } catch (e) {
        return [];
      }
    })();

    const customNames = storedCustom
      .map(cs => typeof cs === 'string' ? cs : cs?.name)
      .filter(Boolean);

    // Merge base subjects with custom subjects, unify REMEDIATION & REMEDIAL/ENHANCEMENT CLASS, filter ADVISORY
    const unifiedList = (baseList || []).map(s => {
      const u = String(s || '').toUpperCase().trim();
      return (u === 'REMEDIATION' || u === 'REMEDIAL/ENHANCEMENT CLASS') ? 'REMEDIAL / ENHANCEMENT CLASS' : u;
    });
    const uppercaseCustom = customNames.map(c => String(c || '').toUpperCase().trim());
    const merged = Array.from(new Set([...unifiedList, ...uppercaseCustom]));

    // Check disabled map for standard subjects
    const disabledMap = (() => {
      try {
        return schoolInfo?.subjectsConfig?.disabledMap || (localStorage.getItem('school_disabled_subjects') ? JSON.parse(localStorage.getItem('school_disabled_subjects')) : {});
      } catch (e) {
        return {};
      }
    })();

    return merged.filter(subName => {
      if (subName === 'ADVISORY') return false; // ADVISORY is auto-assigned to Section Advisors only
      if (customNames.includes(subName)) return true; // Always include custom subjects (e.g. TEST)
      if (disabledMap[subName] === true) return false;
      return true;
    });
  };

  const handleCommitTransfer = async () => {
    if (!absentTeacherId || !substituteTeacherId || !transferStartDate || !transferEndDate || selectedWorkloadIndexes.length === 0) {
      await showAlert("Fields Required", "Please fill out all transfer fields and select at least one workload item to transfer.");
      return;
    }

    if (absentTeacherId === substituteTeacherId) {
      await showAlert("Validation Error", "The absent teacher and substitute teacher cannot be the same person.");
      return;
    }

    const absentTeacher = personnel.find(p => p.id === absentTeacherId);
    const subTeacher = personnel.find(p => p.id === substituteTeacherId);

    const transferredRows = selectedWorkloadIndexes.map(idx => absentTeacher.workloadRows[idx]);

    addWorkloadTransfer({
      absentTeacherId,
      substituteTeacherId,
      startDate: transferStartDate,
      endDate: transferEndDate,
      workloadRows: transferredRows
    });

    // Reset form
    setAbsentTeacherId('');
    setSubstituteTeacherId('');
    setTransferStartDate('');
    setTransferEndDate('');
    setSelectedWorkloadIndexes([]);
    showToast("Workload transfer committed successfully!");
  };

  const handleCancelTransfer = async (transferId) => {
    if (await showConfirm("End Coverage?", "Are you sure you want to end/cancel this workload transfer coverage?")) {
      removeWorkloadTransfer(transferId);
      showToast("Workload transfer ended.");
    }
  };

  // Compute dynamic default schedule time and day from previous workload entries (Default 1 hour)
  const getWorkloadScheduleDefaults = (workloadRows) => {
    let nextStart = '08:00';
    let nextEnd = '09:00';
    let nextDays = ['M', 'T', 'W', 'TH', 'F'];

    const rows = Array.isArray(workloadRows) ? workloadRows.filter(r => r && r.startTime && r.endTime) : [];

    if (rows.length > 0) {
      // Find the most recently added teaching subject row, or fallback to top row
      const candidateRow = rows.find(r => !isAdvisorySub(r.subject)) || rows[0];

      if (candidateRow && candidateRow.endTime) {
        const startMins = parseTimeToMinutes(candidateRow.startTime);
        const endMins = parseTimeToMinutes(candidateRow.endTime);

        if (endMins < 99999) {
          const hours = Math.floor(endMins / 60) % 24;
          const mins = endMins % 60;
          const pad = (v) => String(v).padStart(2, '0');
          nextStart = `${pad(hours)}:${pad(mins)}`;

          let duration = 60; // Default 1 hour (60-minute) period
          if (startMins < 99999 && endMins > startMins) {
            duration = Math.min(60, endMins - startMins);
          }
          if (duration <= 0) duration = 60;

          const nextEndMins = endMins + duration;
          const endHours = Math.floor(nextEndMins / 60) % 24;
          const endMinsRem = nextEndMins % 60;
          nextEnd = `${pad(endHours)}:${pad(endMinsRem)}`;
        }

        if (Array.isArray(candidateRow.days) && candidateRow.days.length > 0) {
          nextDays = [...candidateRow.days];
        }
      }
    }

    return { nextStart, nextEnd, nextDays };
  };

  const addWorkloadRow = () => {
    if (currentPerson?.type === 'non-teaching') {
      if (showToast) showToast("Non-teaching personnel cannot be assigned classroom teaching subjects.", "warning");
      return;
    }
    const assignedGrades = getAssignedGradeLevels(currentPerson);

    let initialGrade = 'Grade 1';
    let initialCategory = 'Elementary';

    if (assignedGrades.length > 0) {
      initialGrade = assignedGrades[0];
      // Find a category that supports this grade level
      const validCats = [];
      for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
        if (grades.includes(initialGrade)) {
          validCats.push(cat);
        }
      }
      if (validCats.length > 0) {
        // If there's school curricular offerings filter, try to match it
        const offerings = getExpandedOfferings();
        const matchedCat = validCats.find(c => offerings.includes(c));
        initialCategory = matchedCat || validCats[0];
      }
    } else {
      const offerings = getExpandedOfferings();
      initialCategory = offerings[0] || 'Elementary';
      const gradesForCategory = GRADE_LEVELS_BY_CATEGORY[initialCategory] || [];
      initialGrade = gradesForCategory[0] || 'Grade 1';
    }

    const initialSubjects = getSubjectsForGrade(initialGrade, initialCategory);
    const validInitialSubject = initialSubjects.find(s => !isAdvisorySub(s)) || initialSubjects[0] || '';

    const rows = [...(currentPerson.workloadRows || [])];
    const { nextStart, nextEnd, nextDays } = getWorkloadScheduleDefaults(rows);

    const newId = `new-workload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newRow = {
      id: newId,
      category: initialCategory,
      subject: validInitialSubject,
      gradeLevel: initialGrade,
      sectionId: '',
      startTime: nextStart,
      endTime: nextEnd,
      days: nextDays
    };
    rows.unshift(newRow);
    setNewlyAddedWorkloadId(newId);
    handleFieldChange('workloadRows', rows);
  };

  const removeWorkloadRow = (index) => {
    const row = (currentPerson.workloadRows || [])[index];
    if (row && isAdvisorySub(row.subject)) {
      return;
    }
    const rows = [...(currentPerson.workloadRows || [])].filter((_, idx) => idx !== index);
    handleFieldChange('workloadRows', rows);
  };

  const isSHSRow = (row) => {
    if (!row) return false;
    const grade = String(row.gradeLevel || '').trim();
    const category = String(row.category || '').toUpperCase();
    const subject = String(row.subject || '').toUpperCase();

    return (
      grade === 'Grade 11' ||
      grade === 'Grade 12' ||
      grade.includes('11') ||
      grade.includes('12') ||
      category.includes('SHS') ||
      category.includes('SSHS') ||
      subject.includes('SHS')
    );
  };

  const getTimeDiffMins = (start, end) => {
    if (!start || !end) return 0;
    const [sh, sm] = String(start).split(':').map(Number);
    const [eh, em] = String(end).split(':').map(Number);
    if (isNaN(sh) || isNaN(eh)) return 0;
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  const getRowDurationError = (row) => {
    if (!row || !row.startTime || !row.endTime) return null;
    const diffMins = getTimeDiffMins(row.startTime, row.endTime);
    if (diffMins <= 0) return "End time must be after start time";

    const subStr = String(row.subject || row.task || '').toUpperCase();
    const gStr = String(row.gradeLevel || '').toUpperCase();
    
    // KINDER BLOCKS OF TIME: Automatic 3 Hours (180 mins) — No max / no min duration error!
    if (subStr.includes('KINDER BLOCKS OF TIME') || subStr.includes('KINDER') || gStr.includes('KINDER')) {
      return null;
    }

    const isSHS = isSHSRow(row);
    const maxMins = isSHS ? 360 : 60;
    if (diffMins > maxMins) {
      return isSHS 
        ? `Exceeds max 6 hours (360 mins) for SHS (Current: ${diffMins} mins)`
        : `Exceeds max 1 hour (60 mins) for Elementary/JHS (Current: ${diffMins} mins)`;
    }
    return null;
  };

  const updateWorkloadRow = async (index, field, value) => {
    const rows = [...(currentPerson.workloadRows || [])];
    let updatedRow = { ...rows[index], [field]: value };

    if (field === 'startTime' || field === 'endTime') {
      const sTime = updatedRow.startTime;
      const eTime = updatedRow.endTime;
      if (sTime && eTime) {
        const diff = getTimeDiffMins(sTime, eTime);
        const isSHS = isSHSRow(updatedRow);
        const maxMins = isSHS ? 360 : 60;

        if (diff > maxMins) {
          const [sh, sm] = sTime.split(':').map(Number);
          const maxEndMins = sh * 60 + sm + maxMins;
          const maxEndH = String(Math.floor(maxEndMins / 60) % 24).padStart(2, '0');
          const maxEndM = String(maxEndMins % 60).padStart(2, '0');
          updatedRow.endTime = `${maxEndH}:${maxEndM}`;

          await showAlert(
            `Maximum Duration ${isSHS ? '6 Hours' : '1 Hour'}`,
            isSHS
              ? "Senior High School (Grade 11 & Grade 12) subject schedule cannot exceed 6 hours. The end time has been adjusted to 6 hours max."
              : "A single subject period in workload cannot exceed 1 hour (60 minutes). The end time has been adjusted to 1 hour max."
          );
        } else if (diff < 0) {
          await showAlert(
            "Invalid Time Range",
            "End time must be after start time."
          );
        }
      }
    } else if (field === 'hgpMinutes') {
      if (value > 60) {
        updatedRow.hgpMinutes = 60;
        await showAlert(
          "HGP Duration Limit",
          "HGP duration cannot exceed 60 minutes (1 hour)."
        );
      }
    }

    rows[index] = updatedRow;
    handleFieldChange('workloadRows', rows);
  };

  const updateWorkloadRowFields = async (index, fieldValues) => {
    const rows = [...(currentPerson.workloadRows || [])];
    let updatedRow = { ...rows[index], ...fieldValues };

    if (fieldValues.startTime || fieldValues.endTime || fieldValues.gradeLevel || fieldValues.category || fieldValues.subject) {
      const sTime = updatedRow.startTime;
      const eTime = updatedRow.endTime;
      if (sTime && eTime) {
        const diff = getTimeDiffMins(sTime, eTime);
        const isSHS = isSHSRow(updatedRow);
        const maxMins = isSHS ? 360 : 60;

        if (diff > maxMins) {
          const [sh, sm] = sTime.split(':').map(Number);
          const maxEndMins = sh * 60 + sm + maxMins;
          const maxEndH = String(Math.floor(maxEndMins / 60) % 24).padStart(2, '0');
          const maxEndM = String(maxEndMins % 60).padStart(2, '0');
          updatedRow.endTime = `${maxEndH}:${maxEndM}`;

          await showAlert(
            `Maximum Duration ${isSHS ? '6 Hours' : '1 Hour'}`,
            isSHS
              ? "Senior High School (Grade 11 & Grade 12) subject schedule cannot exceed 6 hours. The end time has been adjusted to 6 hours max."
              : "A single subject period in workload cannot exceed 1 hour (60 minutes). The end time has been adjusted to 1 hour max."
          );
        }
      }
    }

    rows[index] = updatedRow;
    handleFieldChange('workloadRows', rows);
  };

  const handleSectionChangeForRow = (index, sectionId) => {
    const rows = [...(currentPerson.workloadRows || [])];
    const section = (classSections || []).find(s => String(s.id) === String(sectionId));

    if (section) {
      let resolvedCategory = 'Elementary';
      for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
        if (grades.includes(section.gradeLevel)) {
          resolvedCategory = cat;
          break;
        }
      }
      const newSubjects = getSubjectsForGrade(section.gradeLevel, resolvedCategory);
      const isCurrentValid = newSubjects.includes(rows[index].subject);

      rows[index] = {
        ...rows[index],
        sectionId: String(sectionId),
        sectionName: section.sectionName,
        gradeLevel: section.gradeLevel,
        category: resolvedCategory,
        subject: isCurrentValid ? rows[index].subject : '',
        remediationSubject: isCurrentValid ? rows[index].remediationSubject : ''
      };
    } else {
      rows[index] = {
        ...rows[index],
        sectionId: '',
        sectionName: '',
        gradeLevel: '',
        subject: '',
        remediationSubject: ''
      };
    }
    handleFieldChange('workloadRows', rows);
  };

  const toggleWorkloadDay = (rowIndex, day) => {
    const rows = [...(currentPerson.workloadRows || [])];
    const targetRow = rows[rowIndex];
    if (!targetRow) return;

    const subUpper = String(targetRow.subject || '').toUpperCase().trim();
    if (subUpper === 'ADVISORY') {
      return alert('🔒 Advisory days are fixed to Monday through Friday (M-F).');
    }

    if (subUpper === 'HGP') {
      const advRow = rows.find(r => r.subject === 'ADVISORY' && (String(r.sectionId) === String(targetRow.sectionId) || (!r.sectionId && !targetRow.sectionId)));
      const advDays = advRow?.days || ['M', 'T', 'W', 'TH', 'F'];
      if (!advDays.includes(day)) return; // Restrict HGP to ADVISORY days only
      targetRow.days = [day]; // HGP is strictly 1 day only
      handleFieldChange('workloadRows', rows);
      return;
    }

    const days = [...(targetRow.days || [])];
    let newDays = [];
    if (days.includes(day)) {
      newDays = days.filter(d => d !== day);
    } else {
      newDays = [...days, day];
    }
    targetRow.days = newDays;

    handleFieldChange('workloadRows', rows);
  };

  // 2. Extra Tasks (Teaching-Related / Administrative Tasks)
  const addTaskRow = (key, optionsList) => {
    const rows = [...(currentPerson[key] || [])];
    if (key === 'teachingRelatedRows' || key === 'administrativeRows') {
      rows.push({ task: optionsList[0], dates: [{ date: '', startTime: '08:00', endTime: '09:00' }] });
    } else {
      rows.push({ task: optionsList[0], hours: 0, days: [] });
    }
    handleFieldChange(key, rows);
  };

  const removeTaskRow = (key, index) => {
    const rows = [...(currentPerson[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
  };

  const updateTaskField = (key, index, field, value) => {
    const rows = [...(currentPerson[key] || [])];
    rows[index] = { ...rows[index], [field]: value };
    handleFieldChange(key, rows);
  };

  const toggleTaskDay = (key, rowIndex, day) => {
    const rows = [...(currentPerson[key] || [])];
    const days = [...(rows[rowIndex].days || [])];
    if (days.includes(day)) {
      rows[rowIndex].days = days.filter(d => d !== day);
    } else {
      rows[rowIndex].days = [...days, day];
    }
    handleFieldChange(key, rows);
  };

  // Helper to compute coverage minutes for a teacher
  const getCoverageMinutes = (transfers, teacherId) => {
    let teachingMins = 0;
    let relatedMins = 0;
    let adminMins = 0;

    const activeCoverages = (transfers || []).filter(t => t.substituteTeacherId === teacherId);
    activeCoverages.forEach(cov => {
      (cov.workloadRows || []).forEach(row => {
        if (!row.startTime || !row.endTime) return;
        const [startH, startM] = row.startTime.split(':').map(Number);
        const [endH, endM] = row.endTime.split(':').map(Number);
        const diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        const daysCount = Array.isArray(row.days) ? row.days.length : 0;
        const totalRowMins = diffMinutes > 0 ? diffMinutes * daysCount : 0;

        const isTR = row.subject.toUpperCase().startsWith('TR -') || row.subject.toUpperCase() === 'ADVISORY' || row.subject.toUpperCase() === 'COACHING AND MENTORING';
        const isAdmin = row.subject.toUpperCase().startsWith('ADMIN TASK -') || row.subject.toUpperCase() === 'ADMINISTRATIVE' || row.subject.toUpperCase() === 'RELATED TASK';

        if (isTR) {
          relatedMins += totalRowMins;
        } else if (isAdmin) {
          adminMins += totalRowMins;
        } else {
          teachingMins += totalRowMins;
        }
      });
    });

    return { teachingMins, relatedMins, adminMins };
  };

  // Calculations for display
  const coverageLoads = getCoverageMinutes(workloadTransfers, currentPerson?.id || '');
  const coverageTeachingHours = (coverageLoads.teachingMins / 60);
  const coverageRelatedHours = (coverageLoads.relatedMins / 60);
  const coverageAdminHours = (coverageLoads.adminMins / 60);
  const totalCoverageHours = coverageTeachingHours + coverageRelatedHours + coverageAdminHours;

  const baseWeeklyTeachingMinutes = (() => {
    const rows = currentPerson?.workloadRows || [];
    const daysList = ['M', 'T', 'W', 'TH', 'F'];
    let totalMins = 0;

    for (const d of daysList) {
      const intervals = [];
      for (const r of rows) {
        if ((r.days || []).includes(d)) {
          if (r.subject === 'HGP') {
            // HGP is tracked for program duration only and does not add extra teaching load hours
            continue;
          } else if (r.subject === 'ADVISORY') {
            totalMins += 60;
          } else if (r.startTime && r.endTime) {
            const [startH, startM] = r.startTime.split(':').map(Number);
            const [endH, endM] = r.endTime.split(':').map(Number);
            intervals.push([startH * 60 + startM, endH * 60 + endM]);
          }
        }
      }

      // Merge overlapping intervals for this day
      if (intervals.length > 0) {
        intervals.sort((a, b) => a[0] - b[0]);
        let merged = [intervals[0]];
        for (let i = 1; i < intervals.length; i++) {
          const current = intervals[i];
          const lastMerged = merged[merged.length - 1];
          if (current[0] <= lastMerged[1]) {
            lastMerged[1] = Math.max(lastMerged[1], current[1]);
          } else {
            merged.push(current);
          }
        }
        for (const [start, end] of merged) {
          totalMins += (end - start);
        }
      }
    }
    return totalMins;
  })();

  const baseWeeklyTeachingHours = baseWeeklyTeachingMinutes / 60;
  const totalWeeklyTeachingHours = baseWeeklyTeachingHours + coverageTeachingHours;
  const weeklyTeachingHours = totalWeeklyTeachingHours.toFixed(1);
  const dailyAvgTeachingHours = (Number(weeklyTeachingHours) / 5).toFixed(1);
  const teachingOverloadHours = Math.max(0, Number(weeklyTeachingHours) - 30).toFixed(1);
  const dailyOverloadHours = (Number(teachingOverloadHours) / 5).toFixed(1);

  const baseWeeklyRelatedHours = ((currentPerson?.teachingRelatedRows) || []).reduce((total, row) => {
    const daysCount = Array.isArray(row.days) ? row.days.length : 0;
    return total + ((Number(row.hours) || 0) * daysCount);
  }, 0);
  const totalWeeklyRelatedHours = baseWeeklyRelatedHours + coverageRelatedHours;
  const weeklyRelatedHours = totalWeeklyRelatedHours.toFixed(1);

  const baseWeeklyAdminHours = ((currentPerson?.administrativeRows) || []).reduce((total, row) => {
    const daysCount = Array.isArray(row.days) ? row.days.length : 0;
    return total + ((Number(row.hours) || 0) * daysCount);
  }, 0);
  const totalWeeklyAdminHours = baseWeeklyAdminHours + coverageAdminHours;
  const weeklyAdminHours = totalWeeklyAdminHours.toFixed(1);

  // ── By-Section helpers ────────────────────────────────────────────────

  const sectionSlots = (() => {
    if (!selectedSectionId) return [];
    const slots = [];
    personnel.forEach(p => {
      const draftKey = `draft_workload_${p.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      let activeP = p;
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed) activeP = parsed;
        } catch (e) {}
      }

      (activeP.workloadRows || []).forEach((row, rowIdx) => {
        let rowSecId = row.sectionId;
        if (!rowSecId && row.subject === 'ADVISORY') {
          const advisorySec = (classSections || []).find(s => s.advisorId && p.id && String(s.advisorId) === String(p.id));
          if (advisorySec) rowSecId = String(advisorySec.id);
        }
        if (rowSecId && String(rowSecId) === String(selectedSectionId)) {
          slots.push({ ...row, sectionId: String(rowSecId), personnelId: p.id, personnelName: `${p.firstName} ${p.lastName}`, rowIdx });
        }
      });
    });
    return slots;
  })();

  const checkConflict = (teacherId, sectionId, startTime, endTime, days) => {
    if (!startTime || !endTime || !days || !days.length) return null;

    const ns = parseTimeToMinutes(startTime);
    const ne = parseTimeToMinutes(endTime);

    if (ns >= ne) {
      return {
        type: 'invalid_time',
        message: 'End time must be strictly later than start time.'
      };
    }

    // 1. Check Section Schedule Conflict
    if (sectionId) {
      for (const slot of sectionSlots) {
        const daysOverlap = (days || []).some(d => (slot.days || []).includes(d));
        if (!daysOverlap) continue;
        const rs = parseTimeToMinutes(slot.startTime);
        const re = parseTimeToMinutes(slot.endTime);
        if (ns < re && ne > rs) {
          return {
            type: 'section',
            subject: slot.subject,
            teacherName: slot.personnelName,
            startTime: slot.startTime,
            endTime: slot.endTime,
            days: slot.days
          };
        }
      }
    }

    // 2. Check Teacher Busy Conflict
    if (teacherId) {
      const teacher = personnel.find(p => p.id === teacherId);
      if (teacher) {
        const draftKey = `draft_workload_${teacherId}`;
        const savedDraft = localStorage.getItem(draftKey);
        let activeTeacher = teacher;
        if (savedDraft) {
          try {
            const parsed = JSON.parse(savedDraft);
            if (parsed) activeTeacher = parsed;
          } catch (e) {}
        }

        const allRows = [
          ...(activeTeacher.workloadRows || []),
          ...(activeTeacher.teachingRelatedRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task })),
          ...(activeTeacher.administrativeRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task }))
        ];
        for (const row of allRows) {
          if (!row.startTime || !row.endTime) continue;
          const daysOverlap = (days || []).some(d => (row.days || []).includes(d));
          if (!daysOverlap) continue;
          const rs = parseTimeToMinutes(row.startTime);
          const re = parseTimeToMinutes(row.endTime);
          if (ns < re && ne > rs) {
            return {
              type: 'teacher',
              subject: row.subject,
              teacherName: `${teacher.firstName} ${teacher.lastName}`,
              startTime: row.startTime,
              endTime: row.endTime,
              days: row.days
            };
          }
        }
      }
    }
    return null;
  };

  useEffect(() => {
    if (workloadView === 'by-section' && selectedSectionId) {
      const c = checkConflict(newSlot.teacherId, selectedSectionId, newSlot.startTime, newSlot.endTime, newSlot.days);
      setSlotConflict(c);
    }
  }, [newSlot.teacherId, newSlot.startTime, newSlot.endTime, newSlot.days, selectedSectionId, personnel, classSections, workloadView]);

  const handleAddSectionSlot = async () => {
    if (!selectedSectionId || !newSlot.teacherId || !newSlot.subject || !newSlot.startTime || !newSlot.endTime || !newSlot.days.length) {
      await showAlert("Fields Required", "Please fill in all fields before adding a slot.");
      return;
    }
    const conflict = checkConflict(newSlot.teacherId, selectedSectionId, newSlot.startTime, newSlot.endTime, newSlot.days);
    if (conflict) {
      setSlotConflict(conflict);
      await showAlert("Schedule Conflict", conflict.type === 'invalid_time' ? conflict.message : "Cannot add slot due to a time conflict with an existing schedule.");
      return;
    }
    const sec = (classSections || []).find(s => s.id === selectedSectionId);
    let cat = 'JHS';
    for (const [c, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
      if (grades.includes(sec?.gradeLevel || '')) { cat = c; break; }
    }
    const newRow = { category: cat, subject: newSlot.subject, remediationSubject: newSlot.remediationSubject || '', gradeLevel: sec?.gradeLevel || '', sectionId: selectedSectionId, startTime: newSlot.startTime, endTime: newSlot.endTime, days: newSlot.days };

    const targetTeacher = personnel.find(p => p.id === newSlot.teacherId);
    if (!targetTeacher) return;

    const draftKey = `draft_workload_${targetTeacher.id}`;
    const savedDraft = localStorage.getItem(draftKey);
    let activeRows = targetTeacher.workloadRows || [];
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed && Array.isArray(parsed.workloadRows)) activeRows = parsed.workloadRows;
      } catch (e) {}
    }

    handleFieldChangeForPerson(targetTeacher.id, 'workloadRows', [...activeRows, newRow]);
    setSlotConflict(null);
    const { nextStart: slotNextStart, nextEnd: slotNextEnd, nextDays: slotNextDays } = getWorkloadScheduleDefaults(sectionSlots);
    setNewSlot({ teacherId: '', subject: '', remediationSubject: '', startTime: slotNextStart, endTime: slotNextEnd, days: slotNextDays });
  };

  const handleRemoveSectionSlot = (personnelId, rowIdx) => {
    const targetTeacher = personnel.find(p => p.id === personnelId);
    if (!targetTeacher) return;

    const draftKey = `draft_workload_${targetTeacher.id}`;
    const savedDraft = localStorage.getItem(draftKey);
    let activeRows = targetTeacher.workloadRows || [];
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed && Array.isArray(parsed.workloadRows)) activeRows = parsed.workloadRows;
      } catch (e) {}
    }

    const updatedRows = activeRows.filter((_, i) => i !== rowIdx);
    handleFieldChangeForPerson(targetTeacher.id, 'workloadRows', updatedRows);
  };

  const toggleNewSlotDay = (day) => {
    setNewSlot(prev => {
      const days = prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day];
      const updated = { ...prev, days };
      const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
      setSlotConflict(c);
      return updated;
    });
  };

  const handleSaveChangesDirectly = async () => {
    if (!currentPerson) return;

    // Check for workload conflicts
    const hasAnyConflict = (currentPerson.workloadRows || []).some((row, idx) => {
      return (currentPerson.workloadRows || []).some((otherRow, otherIdx) => {
        if (idx === otherIdx) return false;
        if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
        const daysOverlap = (row.days || []).some(d => (otherRow.days || []).includes(d));
        if (!daysOverlap) return false;
        const ns = parseTimeToMinutes(row.startTime), ne = parseTimeToMinutes(row.endTime);
        const rs = parseTimeToMinutes(otherRow.startTime), re = parseTimeToMinutes(otherRow.endTime);
        if (ns < re && ne > rs) {
          if (isAdvisoryOrHgpPair(row, otherRow)) return false;
          return true;
        }
        return false;
      });
    });

    if (hasAnyConflict) {
      await showAlert("Schedule Conflict", "Cannot save. There are overlapping schedule times in the workload rows. Please resolve them first.");
      return;
    }

    try {
      await savePersonnelChanges(currentPerson.id, currentPerson);

      // Sync workload schedule changes directly to PostgreSQL server
      await api.updatePersonnelWorkloadRows(
        currentPerson.id,
        currentPerson.workloadRows || [],
        currentPerson.teachingRelatedRows || [],
        currentPerson.administrativeRows || []
      );

      localStorage.removeItem(`draft_workload_${currentPerson.id}`);
      showToast("Workload changes saved to database successfully.");
    } catch (err) {
      await showAlert("Error", "Failed to save workload changes: " + err.message);
    }
  };

  const handleSaveValidate = async () => {
    if (!currentPerson) return;

    // Check for workload conflicts
    const hasAnyConflict = (currentPerson.workloadRows || []).some((row, idx) => {
      return (currentPerson.workloadRows || []).some((otherRow, otherIdx) => {
        if (idx === otherIdx) return false;
        if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
        const daysOverlap = (row.days || []).some(d => (otherRow.days || []).includes(d));
        if (!daysOverlap) return false;
        const ns = parseTimeToMinutes(row.startTime), ne = parseTimeToMinutes(row.endTime);
        const rs = parseTimeToMinutes(otherRow.startTime), re = parseTimeToMinutes(otherRow.endTime);
        if (ns < re && ne > rs) {
          if (isAdvisoryOrHgpPair(row, otherRow)) return false;
          return true;
        }
        return false;
      });
    });

    if (hasAnyConflict) {
      await showAlert("Schedule Conflict", "Cannot save. There are overlapping schedule times in the workload rows. Please resolve them first.");
      return;
    }

    try {
      const updated = { ...currentPerson, workloadVerified: true };
      setEditPerson(updated);

      // Update local state first
      await savePersonnelChanges(currentPerson.id, updated);

      // Sync workload schedule changes directly to PostgreSQL server
      await api.updatePersonnelWorkloadRows(
        currentPerson.id,
        updated.workloadRows || [],
        updated.teachingRelatedRows || [],
        updated.administrativeRows || []
      );

      // Verify workload status on PostgreSQL server
      await api.verifyPersonnel(currentPerson.id, { field: 'workload', value: true });

      localStorage.removeItem(`draft_workload_${currentPerson.id}`);
      showToast("Workload verified and saved successfully!");
    } catch (err) {
      await showAlert("Error", "Failed to save and validate workload: " + err.message);
    }
  };
  // ────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────

  return (
    <section id="workload" className="view grid">
      <datalist id="school-times">
        <option value="06:00" />
        <option value="06:30" />
        <option value="07:00" />
        <option value="07:30" />
        <option value="08:00" />
        <option value="08:30" />
        <option value="09:00" />
        <option value="09:30" />
        <option value="10:00" />
        <option value="10:30" />
        <option value="11:00" />
        <option value="11:30" />
        <option value="12:00" />
        <option value="12:30" />
        <option value="13:00" />
        <option value="13:30" />
        <option value="14:00" />
        <option value="14:30" />
        <option value="15:00" />
        <option value="15:30" />
        <option value="16:00" />
        <option value="16:30" />
        <option value="17:00" />
        <option value="17:30" />
        <option value="18:00" />
      </datalist>
      <article className="card">
        <div className="card-inner">

          {/* ── View Mode Toggle & Delegation Actions ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '6px', background: 'var(--blue-50)', padding: '5px', borderRadius: '12px', width: 'fit-content', border: '1.5px solid var(--line)' }}>
              <button type="button" onClick={() => setWorkloadView('by-personnel')}
                style={{
                  padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s',
                  background: workloadView === 'by-personnel' ? 'linear-gradient(180deg, var(--blue), var(--navy))' : 'transparent',
                  color: workloadView === 'by-personnel' ? 'white' : 'var(--navy)'
                }}
              >👤 By Personnel</button>
              <button type="button" onClick={() => setWorkloadView('by-section')}
                style={{
                  padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s',
                  background: workloadView === 'by-section' ? 'linear-gradient(180deg, var(--blue), var(--navy))' : 'transparent',
                  color: workloadView === 'by-section' ? 'white' : 'var(--navy)'
                }}
              >🏫 By Section</button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn"
                onClick={handleConfirmAllAndSave}
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                  color: 'white',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                  cursor: 'pointer'
                }}
                title="Confirm and save timetable schedules for all personnel"
              >
                ✓ Confirm All & Save
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowOrganizedClassCheckModal(true);
                }}
                style={{ background: '#0284c7', color: 'white', fontWeight: 'bold', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>📤</span> Delegation Package (HTML)
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => batchImportFileRef.current?.click()}
                style={{ border: '1.5px solid #0284c7', color: '#0284c7', fontWeight: 'bold', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>📥</span> Import Batch (.json)
              </button>
              <input
                type="file"
                ref={batchImportFileRef}
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleBatchJSONImportSelect}
              />
            </div>
          </div>

          {/* ── BY SECTION VIEW ── */}
          {workloadView === 'by-section' && (
            <div>
              <div className="workload-header" style={{ marginBottom: '20px' }}>
                <h2>Workload Management · By Section</h2>
                <p className="subtext">Assign teachers to class sections by subject and schedule. Conflicts are automatically detected and blocked.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div className="workload-personnel-picker" style={{ border: '2.5px solid var(--gold)', background: 'linear-gradient(180deg, #FFFBEB, #fff)', boxShadow: 'inset 0 -3px 0 rgba(251,191,36,.45)' }}>
                  <SearchableSelect
                    value={selectedSectionId}
                    placeholder="-- Choose a section --"
                    options={(classSections || []).map(s => ({ value: s.id, label: `${s.gradeLevel} — ${s.sectionName}` }))}
                    onChange={(e) => {
                      setSelectedSectionId(e.target.value);
                      setSlotConflict(null);
                      setNewSlot({ teacherId: '', subject: '', startTime: '08:00', endTime: '09:00', days: ['M', 'T', 'W', 'TH', 'F'] });
                    }}
                  />
                  <p className="field-help" style={{ marginTop: '4px' }}>Select a class section to manage its weekly subject schedule.</p>
                </div>

                {selectedSectionId && (() => {
                  const sec = (classSections || []).find(s => s.id === selectedSectionId);
                  const adviser = sec?.advisorId ? personnel.find(p => p.id === sec.advisorId) : null;
                  return (
                    <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--blue))', borderRadius: '14px', padding: '16px 20px', color: 'white' }}>
                      <p style={{ fontSize: '10px', opacity: 0.7, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Section Info</p>
                      <h3 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '800' }}>{sec?.gradeLevel} — {sec?.sectionName}</h3>
                      <p style={{ margin: '0 0 2px', fontSize: '12px', opacity: 0.85 }}>Class Adviser: <strong>{adviser ? `${adviser.firstName} ${adviser.lastName}` : 'Not assigned'}</strong></p>
                      <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>{sectionSlots.length} schedule slot{sectionSlots.length !== 1 ? 's' : ''} assigned</p>
                    </div>
                  );
                })()}
              </div>

              {!selectedSectionId && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1.5px solid var(--line)', borderRadius: '16px' }}>
                  <p style={{ fontSize: '32px', margin: '0 0 8px' }}>🏫</p>
                  <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--navy)', margin: '0 0 6px' }}>Select a Section to Begin</p>
                  <p style={{ fontSize: '13px', maxWidth: '380px', margin: '0 auto' }}>Choose a class section above to view its schedule and assign teachers.</p>
                </div>
              )}

              {selectedSectionId && (<>

                {/* Schedule Table */}
                <div className="workload-section-panel" style={{ marginBottom: '24px' }}>
                  <div className="workload-section-title">
                    <div>
                      <h3>Current Section Schedule</h3>
                      <p className="subtext">All subjects assigned to this section with their teachers and time slots.</p>
                    </div>
                  </div>
                  {sectionSlots.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', border: '1.5px solid var(--line)', borderRadius: '12px' }}>
                      <p style={{ fontSize: '24px', margin: '0 0 6px' }}>📋</p>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: 'var(--navy)', margin: '0 0 4px' }}>No schedule slots yet</p>
                      <p style={{ fontSize: '12px' }}>Use the form below to add subjects and assign teachers to this section.</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'white', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(180deg, var(--blue-50), white)', borderBottom: '1.5px solid var(--line)' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Subject</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Teacher</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Time</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Days</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--navy)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionSlots.map((slot, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--navy)' }}>{slot.subject}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--slate-700)' }}>{slot.personnelName}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--slate-700)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px' }}>{slot.startTime} – {slot.endTime}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                {(slot.days || []).map(d => (
                                  <span key={d} style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: '700' }}>{d}</span>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <button className="btn danger" type="button" onClick={() => handleRemoveSectionSlot(slot.personnelId, slot.rowIdx)} style={{ padding: '4px 12px', fontSize: '11px', minHeight: 'auto' }}>Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Add Slot Form */}
                <div className="workload-section-panel" style={{ background: 'linear-gradient(180deg, #f0f9ff, #fff)', border: '1.5px solid #bfdbfe', borderRadius: '16px', padding: '20px' }}>
                  <div className="workload-section-title" style={{ marginBottom: '16px' }}>
                    <div>
                      <h3>+ Add Schedule Slot</h3>
                      <p className="subtext">Assign a teacher and subject to a time slot. Conflicts will be blocked automatically.</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label>Teacher</label>
                      {(() => {
                        const teacherOptions = personnel
                          .filter(p => !p.isDraft && (p.type === 'teaching' || p.type === 'teaching-related') && getAssignedGradeLevels(p).length > 0)
                          .map(p => ({
                            value: p.id,
                            label: `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}`
                          }));

                        return (
                          <SearchableSelect
                            value={newSlot.teacherId}
                            placeholder="Select teacher..."
                            options={teacherOptions}
                            onChange={(e) => {
                              const teacherId = e.target.value;
                              setNewSlot(prev => {
                                const updated = { ...prev, teacherId };
                                const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
                                setSlotConflict(c);
                                return updated;
                              });
                            }}
                          />
                        );
                      })()}
                      {(() => {
                        const selectedTeacher = personnel.find(p => p.id === newSlot.teacherId);
                        if (!selectedTeacher) return null;
                        const teacherScheduleRows = [
                          ...(selectedTeacher.workloadRows || []),
                          ...(selectedTeacher.teachingRelatedRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task, isTR: true })),
                          ...(selectedTeacher.administrativeRows || []).map(r => ({ startTime: r.startTime, endTime: r.endTime, days: r.days, subject: r.task, isAdmin: true }))
                        ];
                        return (
                          <div style={{ marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                            <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>📅 Teacher's Weekly Busy Schedule:</strong>
                            {teacherScheduleRows.length === 0 ? (
                              <span style={{ color: 'var(--muted)' }}>No assigned classes or tasks yet.</span>
                            ) : (
                              <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--slate-700)', maxHeight: '120px', overflowY: 'auto' }}>
                                {teacherScheduleRows.map((r, i) => (
                                  <li key={i} style={{ marginBottom: '2px' }}>
                                    <strong>{r.subject}</strong>: {r.startTime} – {r.endTime} [{(r.days || []).join(', ')}]
                                    {r.isTR && <span style={{ color: 'var(--blue)', marginLeft: '4px', fontSize: '9px', fontWeight: 'bold' }}>(TR)</span>}
                                    {r.isAdmin && <span style={{ color: 'var(--purple)', marginLeft: '4px', fontSize: '9px', fontWeight: 'bold' }}>(Admin)</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label>Subject</label>
                      {(() => {
                        const sec = (classSections || []).find(s => s.id === selectedSectionId);
                        let rawSubjects = [];
                        if (!sec) {
                          rawSubjects = SUBJECT_OPTIONS;
                        } else {
                          let cat = 'JHS';
                          for (const [c, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
                            if (grades.includes(sec.gradeLevel)) {
                              cat = c;
                              break;
                            }
                          }
                          rawSubjects = getSubjectsForGrade(sec.gradeLevel, cat);
                        }

                        const subjectOptions = rawSubjects
                          .filter(s => s !== 'ADVISORY')
                          .map(s => ({ value: s, label: s }));

                        return (
                          <SearchableSelect
                            disabled={!selectedSectionId}
                            value={newSlot.subject || ''}
                            placeholder={!selectedSectionId ? 'Select section first…' : 'Select subject…'}
                            options={subjectOptions}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (isRemediationSub(val)) {
                                const defaultSub = (sec?.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN';
                                setNewSlot(prev => ({ ...prev, subject: val, remediationSubject: defaultSub }));
                              } else {
                                setNewSlot(prev => ({ ...prev, subject: val, remediationSubject: '' }));
                              }
                            }}
                          />
                        );
                      })()}

                      {/* Secondary Remediation Dropdown */}
                      {(() => {
                        const sec = (classSections || []).find(s => s.id === selectedSectionId);
                        if (isRemediationSub(newSlot.subject)) {
                          const isKinder = sec?.gradeLevel === 'Kinder';
                          const subOptions = isKinder
                            ? [
                              'KINDER BLOCKS OF TIME',
                              'LANGUAGE',
                              'READING AND LITERACY',
                              'MAKABANSA',
                              'ARALING PANLIPUNAN',
                              'FILIPINO',
                              'ENGLISH',
                              'MATHEMATICS',
                              'SCIENCE',
                              'EPP/TLE',
                              'MAPEH',
                              'VALUES EDUCATION',
                              'GMRC'
                            ]
                            : [
                              'ARALING PANLIPUNAN',
                              'FILIPINO',
                              'ENGLISH',
                              'MATHEMATICS',
                              'SCIENCE',
                              'EPP/TLE',
                              'MAPEH',
                              'VALUES EDUCATION',
                              'GMRC'
                            ];
                          const subSubjectValue = newSlot.remediationSubject || (isKinder ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN');

                          return (
                            <div style={{ marginTop: '8px' }}>
                              <label style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 'bold' }}>Remediation Focus</label>
                              <select
                                value={subSubjectValue}
                                onChange={(e) => setNewSlot(prev => ({ ...prev, remediationSubject: e.target.value }))}
                                style={{ width: '100%' }}
                              >
                                {subOptions.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div>
                      <label>Start Time</label>
                      <input type="time" list="school-times" value={newSlot.startTime} onChange={(e) => {
                        const startTime = e.target.value;
                        setNewSlot(prev => {
                          const updated = { ...prev, startTime };
                          const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
                          setSlotConflict(c);
                          return updated;
                        });
                      }} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label>End Time</label>
                      <input type="time" list="school-times" value={newSlot.endTime} onChange={(e) => {
                        const endTime = e.target.value;
                        setNewSlot(prev => {
                          const updated = { ...prev, endTime };
                          const c = checkConflict(updated.teacherId, selectedSectionId, updated.startTime, updated.endTime, updated.days);
                          setSlotConflict(c);
                          return updated;
                        });
                      }} style={{ width: '100%' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label>Days</label>
                      <div className="day-checks">
                        {['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN'].map(day => (
                          <div key={day} className={`day-check ${newSlot.days.includes(day) ? 'checked' : ''}`} onClick={() => toggleNewSlotDay(day)}
                            style={{ background: newSlot.days.includes(day) ? 'linear-gradient(180deg, var(--blue), var(--navy))' : 'white', color: newSlot.days.includes(day) ? 'white' : 'var(--blue)' }}
                          >
                            {day === 'M' ? 'Monday' : day === 'T' ? 'Tuesday' : day === 'W' ? 'Wednesday' : day === 'TH' ? 'Thursday' : day === 'F' ? 'Friday' : day === 'SAT' ? 'Saturday' : 'Sunday'}
                          </div>
                        ))}
                      </div>
                    </div>
                    {slotConflict && (
                      <div style={{ gridColumn: '1 / -1', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <span style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</span>
                        <div>
                          <p style={{ margin: '0 0 4px', fontWeight: '700', color: '#b91c1c', fontSize: '13px' }}>
                            {slotConflict.type === 'section' ? 'Section Schedule Conflict Detected' : 'Teacher Schedule Conflict Detected'}
                          </p>
                          <p style={{ margin: 0, color: '#7f1d1d', fontSize: '12px' }}>
                            {slotConflict.type === 'section'
                              ? `This section already has ${slotConflict.subject} scheduled from ${slotConflict.startTime} – ${slotConflict.endTime} (assigned to ${slotConflict.teacherName}) on [${(slotConflict.days || []).join(', ')}]. Please choose a different time slot or day.`
                              : `${slotConflict.teacherName} is already assigned to ${slotConflict.subject} from ${slotConflict.startTime} – ${slotConflict.endTime} on [${(slotConflict.days || []).join(', ')}]. Please choose a different time or teacher.`}
                          </p>
                        </div>
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <button className="btn ok" type="button" onClick={handleAddSectionSlot}
                        disabled={!!slotConflict}
                        style={{
                          width: '100%',
                          background: slotConflict ? '#cbd5e1' : 'linear-gradient(180deg, var(--blue), var(--navy))',
                          color: slotConflict ? '#64748b' : 'white',
                          fontWeight: '700',
                          border: 'none',
                          cursor: slotConflict ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {slotConflict ? '⚠️ Fix Conflict to Add' : '+ Add Slot to Section'}
                      </button>
                    </div>
                  </div>
                </div>
              </>)}
            </div>
          )}

          {/* ── BY PERSONNEL VIEW (split-screen layout) ── */}
          {workloadView === 'by-personnel' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start', marginTop: '10px' }}>
              {/* Left Column: Teacher Roster Sidebar */}
              <div style={{ background: 'white', padding: '16px', borderRadius: '16px', border: '1.5px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '12px', height: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--navy)', margin: 0, fontWeight: 'bold' }}>Select Teacher</h3>

                {/* Search Input */}
                <input
                  type="text"
                  placeholder="Search name or position..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                />

                {/* Dropdown Filters Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>GRADE LEVEL</label>
                    <select
                      value={gradeFilter}
                      onChange={(e) => setGradeFilter(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px', background: 'white' }}
                    >
                      <option value="all">All Grades</option>
                      {['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'MONO-GRADE'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>CATEGORY</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px', background: 'white' }}
                    >
                      <option value="all">ALL CATEGORIES</option>
                      <option value="teaching">TEACHING</option>
                      <option value="teaching-related">RELATED-TEACHING</option>
                      <option value="non-teaching">NON-TEACHING</option>
                    </select>
                  </div>
                </div>

                {/* Vertical Teacher List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                  {filteredPeople.map((p) => {
                    const isActive = currentPerson && p.id === currentPerson.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setActivePersonnelId(p.id)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: isActive ? '1.5px solid var(--blue)' : '1.5px solid var(--line)',
                          background: isActive ? '#F0F9FF' : 'white',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        <span style={{ fontWeight: '700', fontSize: '13.5px', color: isActive ? 'var(--blue)' : 'var(--navy)' }}>
                          {p.firstName} {p.lastName}
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)' }}>
                          <span>{p.position}</span>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {p.workloadVerified === false && (
                              <span style={{
                                background: '#FEF3C7',
                                color: '#D97706',
                                border: '1px solid #FCD34D',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '8.5px',
                                fontWeight: '700'
                              }}>
                                ⚠️ Time Review
                              </span>
                            )}
                            {p.workloadVerified === true && (
                              <span style={{
                                background: '#DCFCE7',
                                color: '#15803D',
                                border: '1px solid #86EFAC',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '8.5px',
                                fontWeight: '700'
                              }}>
                                ✓ Confirmed & Saved
                              </span>
                            )}
                            <span style={{
                              background: p.type === 'teaching' ? '#e0f2fe' : p.type === 'teaching-related' ? '#fae8ff' : '#f1f5f9',
                              color: p.type === 'teaching' ? '#0369a1' : p.type === 'teaching-related' ? '#a21caf' : '#475569',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '9px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}>
                              {p.type === 'teaching-related' ? 'Related' : p.type}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredPeople.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '13px' }}>
                      No matching teachers found.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Workload Editor */}
              <div style={{ minWidth: 0 }}>
                {!currentPerson ? (
                  <div className="card" style={{ padding: '40px', textAlign: 'center', border: '1.5px solid var(--line)', borderRadius: '16px', background: 'white' }}>
                    <h3 style={{ color: 'var(--navy)', margin: 0 }}>No Teacher Selected</h3>
                    <p className="subtext" style={{ margin: '8px 0 0 0' }}>Please select a teacher from the roster list on the left to configure workloads.</p>
                  </div>
                ) : (
                  <>
                    {/* Schedule Time Verification Banner */}
                    {(() => {
                      const currentTeacherRows = currentPerson?.workloadRows || [];
                      const hasBlockingErrors = currentTeacherRows.some((r, rIdx) => {
                        if (getRowDurationError(r)) return true;
                        return currentTeacherRows.some((otherR, oIdx) => {
                          if (rIdx === oIdx) return false;
                          if (!r.startTime || !r.endTime || !otherR.startTime || !otherR.endTime) return false;
                          const daysOverlap = (r.days || []).some(d => (otherR.days || []).includes(d));
                          if (!daysOverlap) return false;
                          const ns = parseTimeToMinutes(r.startTime), ne = parseTimeToMinutes(r.endTime);
                          const rs = parseTimeToMinutes(otherR.startTime), re = parseTimeToMinutes(otherR.endTime);
                          if (ns < re && ne > rs) {
                            if (isAdvisoryOrHgpPair(r, otherR)) return false;
                            return true;
                          }
                          return false;
                        });
                      });

                      if (!currentPerson || currentPerson.workloadVerified !== false) return null;

                      return (
                        <div style={{
                          background: hasBlockingErrors ? '#FEF2F2' : '#FFFBEB',
                          border: `1.5px solid ${hasBlockingErrors ? '#EF4444' : '#F59E0B'}`,
                          borderRadius: '12px',
                          padding: '14px 18px',
                          marginBottom: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                          boxShadow: '0 2px 4px rgba(245, 158, 11, 0.15)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>{hasBlockingErrors ? '🔴' : '⚠️'}</span>
                            <div>
                              <strong style={{ color: hasBlockingErrors ? '#991B1B' : '#92400E', fontSize: '13.5px', display: 'block' }}>
                                {hasBlockingErrors ? 'Fix Invalid Duration / Overlapping Time Slots First' : 'Auto-Populated Schedule Requires Time Verification'}
                              </strong>
                              <span style={{ color: hasBlockingErrors ? '#B91C1C' : '#B45309', fontSize: '12px', fontWeight: hasBlockingErrors ? '600' : '400' }}>
                                {hasBlockingErrors
                                  ? `Please fix red duration errors (> 60m / > 6h SHS) or overlaps for ${currentPerson.firstName} ${currentPerson.lastName} before confirming.`
                                  : `Please inspect all Start Times, End Times, and Days for ${currentPerson.firstName} ${currentPerson.lastName}.`}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={hasBlockingErrors}
                            onClick={() => handleVerifySchedule(currentPerson.id)}
                            style={{
                              background: hasBlockingErrors ? '#CBD5E1' : 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                              color: hasBlockingErrors ? '#64748B' : '#FFFFFF',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '8px 18px',
                              fontWeight: '700',
                              fontSize: '12px',
                              cursor: hasBlockingErrors ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                              boxShadow: hasBlockingErrors ? 'none' : '0 4px 6px -1px rgba(217, 119, 6, 0.3)'
                            }}
                            title={hasBlockingErrors ? "Fix red duration errors or overlapping schedules before confirming" : "Confirm and save schedule"}
                          >
                            {hasBlockingErrors ? '🚫 Fix Errors First' : '✓ Confirm Schedule'}
                          </button>
                        </div>
                      );
                    })()}

                    {/* Non-Teaching Personnel Banner */}
                    {currentPerson?.type === 'non-teaching' && (
                      <div style={{
                        background: '#F1F5F9', border: '1.5px solid #CBD5E1', borderRadius: '12px',
                        padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px'
                      }}>
                        <span style={{ fontSize: '24px' }}>💼</span>
                        <div>
                          <strong style={{ color: '#1E293B', fontSize: '14px', display: 'block' }}>
                            Non-Teaching Personnel
                          </strong>
                          <span style={{ color: '#475569', fontSize: '12px' }}>
                            {currentPerson.firstName} {currentPerson.lastName} ({currentPerson.position || 'Non-Teaching'}) is classified as non-teaching and automatically has <strong>0.0 teaching workload hours</strong>.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Draft Banner if exists */}
                    {localStorage.getItem(`draft_workload_${currentPerson?.id}`) && (
                      <div style={{ padding: '12px 16px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '12px', color: '#B45309', fontSize: '13px', marginBottom: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>⚠️ You have unsaved workload changes for this personnel (draft stored locally).</span>
                        <button className="btn secondary" style={{ minHeight: '28px', padding: '0 10px', fontSize: '12px', background: 'white', color: '#B45309', borderColor: '#FCD34D' }} type="button" onClick={async () => {
                          if (await showConfirm("Discard Draft?", "Are you sure you want to discard your unsaved changes and revert to the server data?")) {
                            localStorage.removeItem(`draft_workload_${dbPerson.id}`);
                            setEditPerson(dbPerson);
                          }
                        }}>
                          Discard Draft
                        </button>
                      </div>
                    )}

                    {/* Workload KPIs */}
                    <div className="workload-kpis">
                      <div className="kpi">
                        <span>Total Teaching Load</span>
                        <strong>{weeklyTeachingHours} hrs</strong>
                        {coverageTeachingHours > 0 && <small style={{ color: 'var(--blue)', fontSize: '10px', display: 'block', marginTop: '2px' }}>(includes {coverageTeachingHours.toFixed(1)}h coverage)</small>}
                      </div>
                      <div className="kpi">
                        <span>Average per Day</span>
                        <strong>{dailyAvgTeachingHours} hrs</strong>
                      </div>
                      <div className="kpi">
                        <span>Overload per Day</span>
                        <strong>{dailyOverloadHours} hrs</strong>
                      </div>
                      <div className="kpi">
                        <span>Overload per Week</span>
                        <strong>{teachingOverloadHours} hrs</strong>
                      </div>
                    </div>

                    {/* Subject schedule panel */}
                    {currentPerson.type === 'teaching' && (
                      <div className="workload-section-panel">
                        <div className="workload-section-title">
                          <div>
                            <h3>Teaching Workload Rows</h3>
                            <p className="subtext">
                              Classroom subject periods assigned to this teacher.
                              {getAssignedGradeLevels(currentPerson).length > 0 ? (
                                <span style={{ marginLeft: '8px', color: 'var(--blue)', fontWeight: 'bold' }}>
                                  (Assigned Grades: {getAssignedGradeLevels(currentPerson).join(', ')})
                                </span>
                              ) : (
                                <span style={{ marginLeft: '8px', color: 'var(--muted)' }}>
                                  (No pre-assigned grade levels - showing all options)
                                </span>
                              )}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            {/* Time Sort Select Dropdown */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600' }}>Sort Time:</span>
                              <select
                                value={timeSortOrder}
                                onChange={(e) => setTimeSortOrder(e.target.value)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: '1.5px solid var(--line)',
                                  fontSize: '12px',
                                  background: 'white',
                                  color: '#334155',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="added">Newest First (Added)</option>
                                <option value="asc">Earliest First (Asc)</option>
                                <option value="desc">Latest First (Desc)</option>
                              </select>
                            </div>

                            {/* View Mode Toggle Segmented Control */}
                            <div style={{ display: 'flex', border: '1.5px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
                              <button
                                type="button"
                                onClick={() => setLayoutType('card')}
                                style={{
                                  padding: '8px 12px',
                                  background: layoutType === 'card' ? '#f1f5f9' : 'white',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: layoutType === 'card' ? 'bold' : 'normal',
                                  color: layoutType === 'card' ? 'var(--blue)' : 'var(--muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Grid/Cards View"
                              >
                                <span>▦</span> Cards
                              </button>
                              <button
                                type="button"
                                onClick={() => setLayoutType('list')}
                                style={{
                                  padding: '8px 12px',
                                  background: layoutType === 'list' ? '#f1f5f9' : 'white',
                                  border: 'none',
                                  borderLeft: '1.5px solid var(--line)',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: layoutType === 'list' ? 'bold' : 'normal',
                                  color: layoutType === 'list' ? 'var(--blue)' : 'var(--muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="List View"
                              >
                                <span>≡</span> List
                              </button>
                            </div>
                            <button className="btn secondary" type="button" onClick={addWorkloadRow}>+ Add subject schedule</button>
                          </div>
                        </div>

                        <div className="workload-builder" style={layoutType === 'list' ? { display: 'block', background: 'white', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px' } : {}}>
                          {layoutType === 'list' && (currentPerson.workloadRows || []).length > 0 && (
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: '150px 1fr 125px 125px 170px 80px',
                              gap: '12px',
                              alignItems: 'center',
                              padding: '8px 16px',
                              fontWeight: '700',
                              fontSize: '11px',
                              color: '#64748b',
                              textTransform: 'uppercase',
                              borderBottom: '1.5px solid var(--line)',
                              marginBottom: '8px'
                            }}>
                              <div>Section</div>
                              <div>Subject</div>
                              <div>Start Time</div>
                              <div>End Time</div>
                              <div>Usual Days</div>
                              <div style={{ textAlign: 'right' }}>Actions</div>
                            </div>
                          )}

                          {(() => {
                            const rawRows = currentPerson.workloadRows || [];
                            const indexedRows = rawRows.map((r, originalIdx) => ({ ...r, originalIdx }));
                            let sortedRows = [...indexedRows];
                            if (timeSortOrder === 'asc') {
                              sortedRows.sort((a, b) => {
                                const minA = parseTimeToMinutes(a.startTime);
                                const minB = parseTimeToMinutes(b.startTime);
                                if (minA !== minB) return minA - minB;
                                const endMinA = parseTimeToMinutes(a.endTime);
                                const endMinB = parseTimeToMinutes(b.endTime);
                                if (endMinA !== endMinB) return endMinA - endMinB;
                                return a.originalIdx - b.originalIdx;
                              });
                            } else if (timeSortOrder === 'desc') {
                              sortedRows.sort((a, b) => {
                                const minA = parseTimeToMinutes(a.startTime);
                                const minB = parseTimeToMinutes(b.startTime);
                                if (minA !== minB) return minB - minA;
                                const endMinA = parseTimeToMinutes(a.endTime);
                                const endMinB = parseTimeToMinutes(b.endTime);
                                if (endMinA !== endMinB) return endMinB - endMinA;
                                return a.originalIdx - b.originalIdx;
                              });
                            }

                            return sortedRows.map((row) => {
                              const idx = row.originalIdx;
                              const advisorySec = (classSections || []).find(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));
                              if (isAdvisorySub(row.subject) && advisorySec && !row.sectionId) {
                                row.sectionId = String(advisorySec.id);
                                row.gradeLevel = advisorySec.gradeLevel;
                              }
                              const hasConflict = (currentPerson.workloadRows || []).some((otherRow, otherIdx) => {
                                if (idx === otherIdx) return false;
                                if (!row.startTime || !row.endTime || !otherRow.startTime || !otherRow.endTime) return false;
                                const daysOverlap = (row.days || []).some(d => (otherRow.days || []).includes(d));
                                if (!daysOverlap) return false;
                                const ns = parseTimeToMinutes(row.startTime), ne = parseTimeToMinutes(row.endTime);
                                const rs = parseTimeToMinutes(otherRow.startTime), re = parseTimeToMinutes(otherRow.endTime);

                                if (ns < re && ne > rs) {
                                  if (isAdvisoryOrHgpPair(row, otherRow)) return false;
                                  return true;
                                }
                                return false;
                              });

                              const cardRowId = row.id || `workload-row-${idx}`;
                              const isNewlyAdded = newlyAddedWorkloadId && (String(row.id) === String(newlyAddedWorkloadId) || String(cardRowId) === String(newlyAddedWorkloadId));

                              const durationErr = getRowDurationError(row);
                              const cardHasError = hasConflict || !!durationErr;

                              return (
                                <div
                                  key={idx}
                                  ref={(el) => {
                                    if (row.id) workloadCardRefs.current[row.id] = el;
                                    workloadCardRefs.current[cardRowId] = el;
                                  }}
                                  className={`${layoutType === 'card' ? 'workload-row' : ''} ${isNewlyAdded ? 'workload-card-newly-added' : ''}`}
                                  style={{
                                    ...(layoutType === 'list'
                                      ? {
                                          padding: '10px 16px',
                                          borderBottom: '1px solid var(--line)',
                                          background: cardHasError ? '#FEF2F2' : 'white',
                                          borderLeft: cardHasError ? '4px solid #EF4444' : 'none'
                                        }
                                      : (cardHasError ? { border: '1.5px solid #EF4444', background: '#FEF2F2', padding: '16px', borderRadius: '12px' } : {})),
                                    position: 'relative'
                                  }}
                                >
                                  {isNewlyAdded && (
                                    <span className="badge-new-item">Just Added</span>
                                  )}

                                  {cardHasError && (
                                    <div style={{
                                      background: '#FEF2F2',
                                      color: '#B91C1C',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid #FCA5A5',
                                      marginBottom: '8px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}>
                                      <span>🔴</span> {durationErr || 'Schedule Overlap Conflict: Time slot overlaps with another subject or task.'}
                                    </div>
                                  )}

                                  {layoutType === 'list' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 125px 125px 170px 80px', gap: '12px', alignItems: 'center', width: '100%' }}>
                                      {/* Section */}
                                      <div>
                                        {(() => {
                                          const assignedGrades = getAssignedGradeLevels(currentPerson);
                                          const filteredSections = (classSections || []).filter(s => {
                                            if (assignedGrades.length === 0) return true;
                                            const sGradeNorm = (s.gradeLevel || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
                                            const assignedNorm = assignedGrades.map(g => (g || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - '));
                                            if (assignedGrades.includes(s.gradeLevel) || assignedNorm.includes(sGradeNorm)) return true;
                                            if (sGradeNorm.includes(' - ')) {
                                              const grades = sGradeNorm.split(' - ');
                                              return grades.some(g => assignedNorm.includes(g) || assignedGrades.includes(g));
                                            }
                                            return false;
                                          });

                                          const advisorySec = (classSections || []).find(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));
                                          if (advisorySec && !filteredSections.some(s => String(s.id) === String(advisorySec.id))) {
                                            filteredSections.push(advisorySec);
                                          }
                                          const currentSecId = String(row.sectionId || row.section_id || '');
                                          if (currentSecId) {
                                            const currentSavedSec = (classSections || []).find(s => String(s.id) === currentSecId);
                                            if (currentSavedSec && !filteredSections.some(s => String(s.id) === currentSecId)) {
                                              filteredSections.push(currentSavedSec);
                                            }
                                          }

                                          const sectionOptions = filteredSections.map(s => ({
                                            value: String(s.id),
                                            label: `${s.sectionName} (${s.gradeLevel})`
                                          }));
                                          return (
                                            <SearchableSelect
                                              disabled={row.subject === 'ADVISORY' || row.subject === 'HGP'}
                                              value={(row.subject === 'ADVISORY' || row.subject === 'HGP') && advisorySec ? String(advisorySec.id) : currentSecId}
                                              onChange={(e) => handleSectionChangeForRow(idx, e.target.value)}
                                              options={sectionOptions}
                                              placeholder="Select section…"
                                            />
                                          );
                                        })()}
                                      </div>

                                      {/* Subject */}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {(() => {
                                          const currentSecId = String(row.sectionId || row.section_id || '');
                                          const currentSub = row.subject || row.subject_name || '';
                                          const subjectList = (() => {
                                            if (!currentSecId && !currentSub) return [];
                                            const assignedGrades = getAssignedGradeLevels(currentPerson);
                                            if (row.gradeLevel) {
                                              return getSubjectsForGrade(row.gradeLevel, row.category || 'Elementary');
                                            } else if (assignedGrades.length > 0) {
                                              const unionSubjects = new Set();
                                              assignedGrades.forEach(g => {
                                                let resolvedCategory = 'Elementary';
                                                for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) {
                                                  if (grades.includes(g)) {
                                                    resolvedCategory = cat;
                                                    break;
                                                  }
                                                }
                                                getSubjectsForGrade(g, resolvedCategory).forEach(sub => unionSubjects.add(sub));
                                              });
                                              return Array.from(unionSubjects);
                                            } else {
                                              return SUBJECT_OPTIONS;
                                            }
                                          })();
                                          const filteredSubjectList = subjectList.filter(sub => {
                                            if (sub === 'ADVISORY' || sub === 'HGP') {
                                              const exists = (currentPerson.workloadRows || []).some((r, i) => i !== idx && r.subject === sub);
                                              return !exists;
                                            }
                                            return true;
                                          });
                                          if (currentSub && !filteredSubjectList.includes(currentSub)) {
                                            filteredSubjectList.push(currentSub);
                                          }
                                          const subjectOptions = filteredSubjectList.map(s => ({ value: s, label: s }));
                                          return (
                                            <SearchableSelect
                                              disabled={!currentSecId || row.subject === 'ADVISORY' || row.subject === 'HGP'}
                                              value={currentSub}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                if (isRemediationSub(val)) {
                                                  const defaultSub = (row.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN';
                                                  updateWorkloadRowFields(idx, { subject: val, remediationSubject: defaultSub });
                                                } else {
                                                  updateWorkloadRowFields(idx, { subject: val, remediationSubject: '' });
                                                }
                                              }}
                                              options={subjectOptions}
                                              placeholder={!currentSecId ? 'Select section first…' : 'Select subject…'}
                                            />
                                          );
                                        })()}
                                        {isRemediationSub(row.subject) && (
                                          <SearchableSelect
                                            value={row.remediationSubject || (row.gradeLevel === 'Kinder' ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN')}
                                            onChange={(e) => updateWorkloadRow(idx, 'remediationSubject', e.target.value)}
                                            options={
                                              (row.category === 'Elementary'
                                                ? REMEDIATION_FOCUS_BY_CATEGORY['Elementary']
                                                : (REMEDIATION_FOCUS_BY_CATEGORY[row.category] || REMEDIATION_FOCUS_BY_CATEGORY['ALL'])
                                              ).map(opt => ({ value: opt, label: opt }))
                                            }
                                          />
                                        )}
                                      </div>

                                      {/* Start & End Time / Fixed Duration */}
                                      {row.subject === 'ADVISORY' ? (
                                        <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <span style={{ fontSize: '11px', color: '#0284c7', background: '#e0f2fe', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold' }}>
                                            ⏱️ 60 Mins / Day (Fixed)
                                          </span>
                                        </div>
                                      ) : (
                                        <>
                                          {/* Start Time */}
                                          <div>
                                            <input type="time" list="school-times" value={row.startTime} onChange={(e) => updateWorkloadRow(idx, 'startTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)' }} />
                                          </div>

                                          {/* End Time */}
                                          <div>
                                            <input type="time" list="school-times" value={row.endTime} onChange={(e) => updateWorkloadRow(idx, 'endTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)' }} />
                                          </div>
                                        </>
                                      )}

                                      {/* Usual Days */}
                                      <div>
                                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                          {(() => {
                                            const isHgp = row.subject === 'HGP';
                                            const advRow = isHgp ? (currentPerson.workloadRows || []).find(r => r.subject === 'ADVISORY' && (String(r.sectionId) === String(row.sectionId) || (!r.sectionId && !row.sectionId))) : null;
                                            const advDays = advRow ? (advRow.days || []) : ['M', 'T', 'W', 'TH', 'F'];

                                            return (isHgp ? ['M', 'T', 'W', 'TH', 'F'] : ['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN']).map(day => {
                                              const isAllowed = !isHgp || advDays.includes(day);
                                              const isChecked = row.days?.includes(day);
                                              return (
                                                <div
                                                  key={day}
                                                  onClick={() => {
                                                    if (isAllowed) toggleWorkloadDay(idx, day);
                                                  }}
                                                  style={{
                                                    padding: '4px 8px',
                                                    fontSize: '11px',
                                                    minWidth: '28px',
                                                    textAlign: 'center',
                                                    borderRadius: '6px',
                                                    cursor: isAllowed ? 'pointer' : 'not-allowed',
                                                    fontWeight: 'bold',
                                                    background: isChecked ? 'linear-gradient(180deg, var(--blue), var(--navy))' : (isAllowed ? '#f1f5f9' : '#e2e8f0'),
                                                    color: isChecked ? 'white' : (isAllowed ? '#475569' : '#94a3b8'),
                                                    border: '1px solid transparent',
                                                    opacity: isAllowed ? 1 : 0.45,
                                                    transition: 'all 0.15s'
                                                  }}
                                                  title={!isAllowed ? `Day ${day} is not selected in ADVISORY` : (day === 'M' ? 'Monday' : day === 'T' ? 'Tuesday' : day === 'W' ? 'Wednesday' : day === 'TH' ? 'Thursday' : day === 'F' ? 'Friday' : day === 'SAT' ? 'Saturday' : 'Sunday')}
                                                >
                                                  {day}
                                                </div>
                                              );
                                            });
                                          })()}
                                        </div>
                                      </div>

                                      {/* Action Button */}
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                        {row.subject === 'ADVISORY' || row.subject === 'HGP' ? (
                                          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>Locked 🔒</span>
                                        ) : (
                                          <button className="btn danger sm" type="button" onClick={() => removeWorkloadRow(idx)}>Remove</button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {/* ✕ Remove / Lock badge - top right */}
                                      {row.subject === 'ADVISORY' || row.subject === 'HGP' ? (
                                        <span style={{ position: 'absolute', top: '12px', right: '14px', fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>🔒 Locked</span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => removeWorkloadRow(idx)}
                                          style={{ position: 'absolute', top: '10px', right: '14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', color: '#ef4444', opacity: 0.6, transition: 'opacity 0.15s', lineHeight: 1 }}
                                          onMouseEnter={(e) => e.target.style.opacity = 1}
                                          onMouseLeave={(e) => e.target.style.opacity = 0.6}
                                          title="Remove Schedule"
                                        >✕</button>
                                      )}

                                      {/* Badges row */}
                                      {(() => {
                                        let bgBadge = '#f0f9ff', clrBadge = '#0369a1';
                                        if (String(row.gradeLevel).toLowerCase().includes('kinder')) { bgBadge = '#fdf2f8'; clrBadge = '#be185d'; }
                                        else if (String(row.gradeLevel).toLowerCase().includes('grade 11') || String(row.gradeLevel).toLowerCase().includes('grade 12')) { bgBadge = '#faf5ff'; clrBadge = '#6b21a8'; }
                                        else if (String(row.gradeLevel).toLowerCase().includes('grade 7') || String(row.gradeLevel).toLowerCase().includes('grade 8') || String(row.gradeLevel).toLowerCase().includes('grade 9') || String(row.gradeLevel).toLowerCase().includes('grade 10')) { bgBadge = '#eff6ff'; clrBadge = '#1d4ed8'; }
                                        const linkedSec = (classSections || []).find(s => String(s.id) === String(row.sectionId || row.section_id || ''));
                                        return (
                                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginRight: '50px' }}>
                                            <span style={{ background: bgBadge, color: clrBadge, padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.02em' }}>{row.gradeLevel || 'No Grade'}</span>
                                            {linkedSec && (
                                              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                                                [{linkedSec.gradeLevel} - {linkedSec.sectionName}]
                                              </span>
                                            )}
                                            {(row.sectionId || row.section_id) && (
                                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Section Adviser</span>
                                            )}
                                            {row.category && (
                                              <span style={{ background: row.category === 'Elementary' ? '#f0fdf4' : '#fffbeb', color: row.category === 'Elementary' ? '#15803d' : '#b45309', padding: '3px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{row.category}</span>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      {/* Subject Title */}
                                      <h4 style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: '800', color: 'var(--navy)' }}>{row.subject || 'Select Subject'}</h4>
                                      {/* Divider */}
                                      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '2px 0 4px' }} />

                                      {/* Compact fields grid */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                                        <div>
                                          <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Section</label>
                                          {(() => {
                                            const assignedGrades = getAssignedGradeLevels(currentPerson);
                                            const filteredSections = (classSections || []).filter(s => {
                                              if (assignedGrades.length === 0) return true;
                                              const sGradeNorm = (s.gradeLevel || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
                                              const assignedNorm = assignedGrades.map(g => (g || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - '));
                                              if (assignedGrades.includes(s.gradeLevel) || assignedNorm.includes(sGradeNorm)) return true;
                                              if (sGradeNorm.includes(' - ')) {
                                                const grades = sGradeNorm.split(' - ');
                                                return grades.some(g => assignedNorm.includes(g) || assignedGrades.includes(g));
                                              }
                                              return false;
                                            });
                                            const advisorySec = (classSections || []).find(s => s.advisorId && dbPerson.id && String(s.advisorId) === String(dbPerson.id));
                                            if (advisorySec && !filteredSections.some(s => String(s.id) === String(advisorySec.id))) filteredSections.push(advisorySec);
                                            let currentSecId = String(row.sectionId || row.section_id || '');
                                            if (!currentSecId && row.gradeLevel) {
                                              const targetGradeNorm = row.gradeLevel.replace(/\s*[\u2013\u2014-]\s*/g, ' - ');
                                              const autoSec = (classSections || []).find(s => (s.gradeLevel || '').replace(/\s*[\u2013\u2014-]\s*/g, ' - ') === targetGradeNorm);
                                              if (autoSec) currentSecId = String(autoSec.id);
                                            }
                                            if (currentSecId) {
                                              const currentSavedSec = (classSections || []).find(s => String(s.id) === currentSecId);
                                              if (currentSavedSec && !filteredSections.some(s => String(s.id) === currentSecId)) filteredSections.push(currentSavedSec);
                                            }
                                            const sectionOptions = filteredSections.map(s => ({ value: String(s.id), label: `${s.sectionName} (${s.gradeLevel})` }));
                                            return (
                                              <SearchableSelect
                                                disabled={isAdvisorySub(row.subject)}
                                                value={isAdvisorySub(row.subject) && advisorySec ? String(advisorySec.id) : currentSecId}
                                                onChange={(e) => handleSectionChangeForRow(idx, e.target.value)}
                                                options={sectionOptions}
                                                placeholder="Select section…"
                                              />
                                            );
                                          })()}
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Subject</label>
                                          {(() => {
                                            const currentSecId = String(row.sectionId || row.section_id || '');
                                            const currentSub = row.subject || row.subject_name || '';
                                            const subjectList = (() => {
                                              if (!currentSecId && !currentSub) return [];
                                              const assignedGrades = getAssignedGradeLevels(currentPerson);
                                              if (row.gradeLevel) return getSubjectsForGrade(row.gradeLevel, row.category || 'Elementary');
                                              else if (assignedGrades.length > 0) {
                                                const unionSubjects = new Set();
                                                assignedGrades.forEach(g => {
                                                  let resolvedCategory = 'Elementary';
                                                  for (const [cat, grades] of Object.entries(GRADE_LEVELS_BY_CATEGORY)) { if (grades.includes(g)) { resolvedCategory = cat; break; } }
                                                  getSubjectsForGrade(g, resolvedCategory).forEach(sub => unionSubjects.add(sub));
                                                });
                                                return Array.from(unionSubjects);
                                              } else return SUBJECT_OPTIONS;
                                            })();
                                            const filteredSubjectList = subjectList.filter(sub => {
                                              if (sub === 'ADVISORY' || sub === 'HGP') { return !(currentPerson.workloadRows || []).some((r, i) => i !== idx && r.subject === sub); }
                                              return true;
                                            });
                                            if (currentSub && !filteredSubjectList.includes(currentSub)) {
                                              filteredSubjectList.push(currentSub);
                                            }
                                            return (
                                              <SearchableSelect
                                                disabled={!currentSecId || row.subject === 'ADVISORY' || row.subject === 'HGP'}
                                                value={currentSub}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  if (isRemediationSub(val)) { updateWorkloadRowFields(idx, { subject: val, remediationSubject: (row.gradeLevel === 'Kinder') ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN' }); }
                                                  else { updateWorkloadRowFields(idx, { subject: val, remediationSubject: '' }); }
                                                }}
                                                options={filteredSubjectList.map(s => ({ value: s, label: s }))}
                                                placeholder={!currentSecId ? 'Select section first…' : 'Select subject…'}
                                              />
                                            );
                                          })()}
                                        </div>
                                        {row.sectionId && (row.gradeLevel === 'Grade 11' || row.gradeLevel === 'Grade 12') && (
                                          <div>
                                            <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>SHS Category</label>
                                            <SearchableSelect
                                              value={row.category || 'SHS-CORE SUBJECTS'}
                                              onChange={(e) => {
                                                const newCat = e.target.value;
                                                const newSubjects = getSubjectsForGrade(row.gradeLevel, newCat);
                                                updateWorkloadRowFields(idx, { category: newCat, subject: newSubjects.includes(row.subject) ? row.subject : (newSubjects.find(s => s !== 'ADVISORY' && s !== 'HGP') || '') });
                                              }}
                                              options={[
                                                { value: 'SHS-CORE SUBJECTS', label: 'SHS-CORE SUBJECTS' },
                                                { value: 'SHS-APPLIED SUBJECTS', label: 'SHS-APPLIED SUBJECTS' },
                                                { value: 'SHS-SPECIALIZED SUBJECTS', label: 'SHS-SPECIALIZED SUBJECTS' },
                                                { value: 'SSHS-CORE', label: 'SSHS-CORE' },
                                                { value: 'SSHS-ACADEMIC', label: 'SSHS-ACADEMIC' },
                                                { value: 'SSHS-TECHPRO', label: 'SSHS-TECHPRO' }
                                              ]}
                                            />
                                          </div>
                                        )}
                                        {isRemediationSub(row.subject) && (
                                          <div>
                                            <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Remediation Focus</label>
                                            {(() => {
                                              const subOptions = row.category === 'Elementary' ? REMEDIATION_FOCUS_BY_CATEGORY['Elementary'] : (REMEDIATION_FOCUS_BY_CATEGORY[row.category] || REMEDIATION_FOCUS_BY_CATEGORY['ALL']);
                                              return (
                                                <SearchableSelect
                                                  value={row.remediationSubject || (row.gradeLevel === 'Kinder' ? 'KINDER BLOCKS OF TIME' : 'ARALING PANLIPUNAN')}
                                                  onChange={(e) => updateWorkloadRow(idx, 'remediationSubject', e.target.value)}
                                                  options={subOptions.map(opt => ({ value: opt, label: opt }))}
                                                />
                                              );
                                            })()}
                                          </div>
                                        )}
                                        {row.subject === 'ADVISORY' ? (
                                           <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#e0f2fe', borderRadius: '6px', textAlign: 'center', color: '#0284c7', fontSize: '11px', fontWeight: 'bold' }}>
                                             ⏱️ 60 Mins / Day (Fixed Duration)
                                           </div>
                                         ) : (
                                           <>
                                             <div>
                                               <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Start Time</label>
                                               <input type="time" list="school-times" value={row.startTime} onChange={(e) => updateWorkloadRow(idx, 'startTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12px' }} />
                                             </div>
                                             <div>
                                               <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>End Time</label>
                                               <input type="time" list="school-times" value={row.endTime} onChange={(e) => updateWorkloadRow(idx, 'endTime', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12px' }} />
                                             </div>
                                           </>
                                         )}
                                      </div>

                                      {/* Day chips */}
                                      <div style={{ marginTop: '4px' }}>
                                        <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Usual Days</label>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                          {(row.subject === 'HGP' ? ['M', 'T', 'W', 'TH', 'F'] : ['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN']).map(day => (
                                            <div
                                              key={day}
                                              onClick={() => toggleWorkloadDay(idx, day)}
                                              style={{
                                                padding: '3px 8px', fontSize: '10px', minWidth: '26px', textAlign: 'center',
                                                borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                                                background: row.days?.includes(day) ? 'linear-gradient(180deg, var(--blue), var(--navy))' : '#f1f5f9',
                                                color: row.days?.includes(day) ? 'white' : '#475569',
                                                border: '1px solid transparent', transition: 'all 0.15s'
                                              }}
                                              title={day === 'M' ? 'Monday' : day === 'T' ? 'Tuesday' : day === 'W' ? 'Wednesday' : day === 'TH' ? 'Thursday' : day === 'F' ? 'Friday' : day === 'SAT' ? 'Saturday' : 'Sunday'}
                                            >{day}</div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Conflict warning inside card */}
                                      {hasConflict && (
                                        <div style={{ color: '#EF4444', fontSize: '10px', fontWeight: 'bold', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          ⚠️ Time conflict with another period on the same day(s).
                                        </div>
                                      )}
                                    </>
                                  )}
                              </div>
                            )
                          })
                        })()}
                        </div>
                      </div>
                    )}

                    {/* Extra Tasks builders */}
                    <div className="workload-section-panel" style={{ marginTop: '20px' }}>
                      <div className="workload-section-title">
                        <h3>Advisory and Extra Task Builders</h3>
                      </div>

                      <div className="task-assignment-grid">

                        {/* Teaching-related tasks */}
                        <div className="multi-task-panel">
                          <div className="multi-task-panel-head">
                            <label>Teaching-Related Tasks</label>
                            <button className="btn secondary" type="button" onClick={() => addTaskRow('teachingRelatedRows', TEACHING_RELATED_TASK_OPTIONS)}>
                              + Add task
                            </button>
                          </div>
                          <div className="multi-task-rows">
                            {(currentPerson.teachingRelatedRows || []).map((row, idx) => (
                              <div key={idx} className="multi-task-row teaching-related-layout" style={{ alignItems: 'flex-start' }}>
                                <div>
                                  <label>Task Type</label>
                                  <SearchableSelect
                                    value={row.task}
                                    onChange={(e) => updateTaskField('teachingRelatedRows', idx, 'task', e.target.value)}
                                    options={TEACHING_RELATED_TASK_OPTIONS.map(opt => ({ value: opt, label: opt }))}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                  {(row.dates || []).map((dateEntry, dateIdx) => (
                                    <div key={dateIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                      <div style={{ flex: 1 }}>
                                        <label>Date</label>
                                        <DatePickerDropdowns
                                          value={dateEntry.date || ''}
                                          onChange={(val) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], date: val };
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>Start Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.startTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], startTime: e.target.value };
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>End Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.endTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], endTime: e.target.value };
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      {(row.dates || []).length > 1 && (
                                        <button
                                          type="button"
                                          style={{
                                            padding: 0,
                                            height: '34px',
                                            width: '34px',
                                            minWidth: '34px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: '20px',
                                            fontSize: '14px',
                                            background: '#FEE2E2',
                                            color: '#EF4444',
                                            border: 'none',
                                            cursor: 'pointer',
                                            marginRight: '8px'
                                          }}
                                          onClick={() => {
                                            const updatedDates = (row.dates || []).filter((_, dIdx) => dIdx !== dateIdx);
                                            updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                          }}
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="btn secondary"
                                      style={{ fontSize: '11px', padding: '4px 10px', minHeight: 'auto' }}
                                      onClick={() => {
                                        const updatedDates = [...(row.dates || [])];
                                        updatedDates.push({ date: '', startTime: '08:00', endTime: '09:00' });
                                        updateTaskField('teachingRelatedRows', idx, 'dates', updatedDates);
                                      }}
                                    >
                                      + Add Single Date
                                    </button>
                                    <button
                                      type="button"
                                      className="btn"
                                      style={{
                                        background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        fontSize: '11px',
                                        padding: '4px 12px',
                                        minHeight: 'auto',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                      onClick={() => openCalendarModal('teachingRelatedRows', idx, row)}
                                    >
                                      📅 Select Dates on Calendar
                                    </button>
                                  </div>
                                </div>
                                <button className="btn danger" type="button" onClick={() => removeTaskRow('teachingRelatedRows', idx)} style={{ marginTop: '20px' }}>Remove</button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Administrative tasks */}
                        <div className="multi-task-panel">
                          <div className="multi-task-panel-head">
                            <label>Administrative Tasks</label>
                            <button className="btn secondary" type="button" onClick={() => addTaskRow('administrativeRows', ADMINISTRATIVE_TASK_OPTIONS)}>
                              + Add task
                            </button>
                          </div>
                          <div className="multi-task-rows">
                            {(currentPerson.administrativeRows || []).map((row, idx) => (
                              <div key={idx} className="multi-task-row" style={{ alignItems: 'flex-start' }}>
                                <div>
                                  <label>Task Type</label>
                                  <SearchableSelect
                                    value={row.task}
                                    onChange={(e) => updateTaskField('administrativeRows', idx, 'task', e.target.value)}
                                    options={ADMINISTRATIVE_TASK_OPTIONS.map(opt => ({ value: opt, label: opt }))}
                                  />
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                    <div style={{ width: '120px' }}>
                                      <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Start Time</label>
                                      <input
                                        type="time"
                                        value={row.startTime || '08:00'}
                                        onChange={(e) => updateTaskField('administrativeRows', idx, 'startTime', e.target.value)}
                                        style={{ width: '100%', padding: '4px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--line)' }}
                                      />
                                    </div>
                                    <div style={{ width: '120px' }}>
                                      <label style={{ fontSize: '11px', fontWeight: 'bold' }}>End Time</label>
                                      <input
                                        type="time"
                                        value={row.endTime || '12:00'}
                                        onChange={(e) => updateTaskField('administrativeRows', idx, 'endTime', e.target.value)}
                                        style={{ width: '100%', padding: '4px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--line)' }}
                                      />
                                    </div>
                                    <div style={{ flex: 1, minWidth: '180px' }}>
                                      <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>Usual Days (MTWTHF)</label>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        {['M', 'T', 'W', 'Th', 'F'].map(day => {
                                          const selectedDays = Array.isArray(row.days) ? row.days : ['M', 'T', 'W', 'Th', 'F'];
                                          const isSel = selectedDays.includes(day);
                                          return (
                                            <button
                                              key={day}
                                              type="button"
                                              onClick={() => {
                                                const currentDays = [...selectedDays];
                                                const nextDays = isSel ? currentDays.filter(d => d !== day) : [...currentDays, day];
                                                updateTaskField('administrativeRows', idx, 'days', nextDays);
                                              }}
                                              style={{
                                                padding: '3px 8px',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                borderRadius: '4px',
                                                border: isSel ? 'none' : '1px solid var(--line)',
                                                background: isSel ? '#0284C7' : '#FFFFFF',
                                                color: isSel ? '#FFFFFF' : '#334155',
                                                cursor: 'pointer'
                                              }}
                                            >
                                              {day}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                  {(row.dates || []).map((dateEntry, dateIdx) => (
                                    <div key={dateIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                      <div style={{ flex: 1 }}>
                                        <label>Date</label>
                                        <DatePickerDropdowns
                                          value={dateEntry.date || ''}
                                          onChange={(val) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], date: val };
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>Start Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.startTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], startTime: e.target.value };
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      <div style={{ width: '110px' }}>
                                        <label>End Time</label>
                                        <input
                                          type="time"
                                          value={dateEntry.endTime || ''}
                                          onChange={(e) => {
                                            const updatedDates = [...(row.dates || [])];
                                            updatedDates[dateIdx] = { ...updatedDates[dateIdx], endTime: e.target.value };
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        />
                                      </div>
                                      {(row.dates || []).length > 1 && (
                                        <button
                                          type="button"
                                          style={{
                                            padding: 0,
                                            height: '34px',
                                            width: '34px',
                                            minWidth: '34px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: '20px',
                                            fontSize: '14px',
                                            background: '#FEE2E2',
                                            color: '#EF4444',
                                            border: 'none',
                                            cursor: 'pointer',
                                            marginRight: '8px'
                                          }}
                                          onClick={() => {
                                            const updatedDates = (row.dates || []).filter((_, dIdx) => dIdx !== dateIdx);
                                            updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                          }}
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="btn secondary"
                                      style={{ fontSize: '11px', padding: '4px 10px', minHeight: 'auto' }}
                                      onClick={() => {
                                        const updatedDates = [...(row.dates || [])];
                                        updatedDates.push({ date: '', startTime: '08:00', endTime: '09:00' });
                                        updateTaskField('administrativeRows', idx, 'dates', updatedDates);
                                      }}
                                    >
                                      + Add Single Date
                                    </button>
                                    <button
                                      type="button"
                                      className="btn"
                                      style={{
                                        background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        fontSize: '11px',
                                        padding: '4px 12px',
                                        minHeight: 'auto',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                      onClick={() => openCalendarModal('administrativeRows', idx, row)}
                                    >
                                      📅 Select Dates on Calendar
                                    </button>
                                  </div>
                                </div>
                                <button className="btn danger" type="button" onClick={() => removeTaskRow('administrativeRows', idx)} style={{ marginTop: '20px' }}>Remove</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </article>

      {/* ── ORGANIZED CLASS COMPLETION CHECK MODAL ── */}
      {showOrganizedClassCheckModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                🏫
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
                  Is Organized Classes Completed?
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Confirmation required before downloading Delegation Package
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, margin: '0 0 16px' }}>
              The downloaded HTML Delegation package embeds your school's official <strong>Organized Class Sections</strong> so encoders (Person A) can select class sections directly from a dropdown list.
            </p>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--navy)' }}>Registered School Sections:</span>
              <span style={{ background: '#0284c7', color: 'white', fontWeight: '800', fontSize: '12px', padding: '4px 10px', borderRadius: '20px' }}>
                {(classSections || []).length} Section(s) Found
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowOrganizedClassCheckModal(false)}
                style={{ padding: '10px 16px', borderRadius: '8px' }}
              >
                Not Yet — Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setShowOrganizedClassCheckModal(false);
                  const allIds = (personnel || []).map(p => String(p.id));
                  console.log('[OrganizedCheck → Delegation] setting teacher IDs:', allIds);
                  setSelectedTeacherIdsForDelegation(allIds);
                  setShowDelegationModal(true);
                }}
                style={{ padding: '10px 20px', fontWeight: 'bold', borderRadius: '8px', background: '#0284c7' }}
              >
                Yes, Complete → Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WORKLOAD DELEGATION PACKAGE (HTML EXPORT) MODAL ── */}
      {showDelegationModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
              📤 Export Workload Delegation Package (HTML)
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
              Select the teachers you want Person A (or Department Head) to encode. This exports a standalone HTML file that works offline on any computer.
            </p>

            {/* Search & Grade Level Filter controls */}
            {(() => {
              const visibleTeachers = personnel.filter(p => {
                const fullName = `${p.firstName || ''} ${p.lastName || ''} ${p.position || ''}`.toLowerCase();
                const matchesSearch = fullName.includes(delegationSearch.toLowerCase().trim());
                if (!matchesSearch) return false;
                if (delegationGradeFilter === 'all') return true;

                const assigned = getAssignedGradeLevels(p);
                const rowGrades = (p.workloadRows || []).map(r => r.gradeLevel).filter(Boolean);
                const allGrades = Array.from(new Set([...assigned, ...rowGrades]));
                return allGrades.includes(delegationGradeFilter);
              });

              const selIdsStr = selectedTeacherIdsForDelegation.map(String);
              const allVisibleSelected = visibleTeachers.length > 0 && visibleTeachers.every(p => selIdsStr.includes(String(p.id)));

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="text"
                      placeholder="Search teacher..."
                      value={delegationSearch}
                      onChange={(e) => setDelegationSearch(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px' }}
                    />
                    <select
                      value={delegationGradeFilter}
                      onChange={(e) => setDelegationGradeFilter(e.target.value)}
                      style={{ padding: '8px 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '12px', background: 'white', fontWeight: 'bold', color: 'var(--navy)' }}
                    >
                      <option value="all">All Grades</option>
                      {['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        const visibleIdsStr = visibleTeachers.map(p => String(p.id));
                        if (allVisibleSelected) {
                          setSelectedTeacherIdsForDelegation(prev => prev.filter(id => !visibleIdsStr.includes(String(id))));
                        } else {
                          setSelectedTeacherIdsForDelegation(prev => Array.from(new Set([...prev.map(String), ...visibleIdsStr])));
                        }
                      }}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                    >
                      {allVisibleSelected ? 'Deselect Visible' : 'Select Visible'}
                    </button>
                  </div>

                  {/* Teachers Checklist */}
                  <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '10px', padding: '8px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {visibleTeachers.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                        No teachers found for the selected grade filter.
                      </div>
                    ) : (
                      visibleTeachers.map(p => {
                        const pIdStr = String(p.id);
                        const isChecked = selIdsStr.includes(pIdStr);
                        const assignedGrades = getAssignedGradeLevels(p);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px',
                              background: isChecked ? '#eff6ff' : 'transparent', cursor: 'pointer', fontSize: '12px',
                              border: isChecked ? '1px solid #bfdbfe' : '1px solid transparent'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedTeacherIdsForDelegation(prev => prev.filter(id => String(id) !== pIdStr));
                                  } else {
                                    setSelectedTeacherIdsForDelegation(prev => [...prev, pIdStr]);
                                  }
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <div>
                                <div style={{ fontWeight: isChecked ? '700' : '600', color: isChecked ? '#1e40af' : '#334155' }}>
                                  {p.lastName}, {p.firstName}
                                </div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>{p.position || 'Teacher'}</div>
                              </div>
                            </div>
                            {assignedGrades.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {assignedGrades.slice(0, 3).map(g => (
                                  <span key={g} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: 'bold' }}>
                                    {g}
                                  </span>
                                ))}
                                {assignedGrades.length > 3 && (
                                  <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: 'bold' }}>
                                    +{assignedGrades.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)' }}>
                Selected: {selectedTeacherIdsForDelegation.length} teachers
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowDelegationModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={selectedTeacherIdsForDelegation.length === 0}
                  onClick={handleGenerateDelegationPackageHTML}
                  style={{ padding: '8px 20px', borderRadius: '8px', fontWeight: 'bold' }}
                >
                  Generate HTML Package →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BATCH IMPORT PREVIEW & MERGE MODAL ── */}
      {showImportBatchModal && importedBatchData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px', width: '560px', maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
              📥 Batch Workload Import Preview
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              From: <strong>{importedBatchData.schoolName}</strong> ({importedBatchData.schoolYear})
            </p>

            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid var(--line)', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--navy)', marginBottom: '8px' }}>
                Workload Payload Summary:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#334155', maxHeight: '200px', overflowY: 'auto' }}>
                {Object.entries(importedBatchData.teachersWorkload || {}).map(([pId, rows]) => {
                  const p = personnel.find(x => x.id === pId);
                  return (
                    <li key={pId} style={{ marginBottom: '4px' }}>
                      <strong>{p ? `${p.lastName}, ${p.firstName}` : pId}</strong>: {rows.length} workload rows
                    </li>
                  );
                })}
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setShowImportBatchModal(false);
                  setImportedBatchData(null);
                }}
                style={{ padding: '10px 18px', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleApproveAndMergeBatchImport}
                style={{ padding: '10px 24px', fontWeight: 'bold', borderRadius: '8px' }}
              >
                Approve & Merge Workloads
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ATTENTION TIMETABLE VERIFICATION MODAL ── */}
      {showAttentionModal && currentPerson && (
        <div className="modal-backdrop" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '16px', padding: '28px',
            maxWidth: '540px', width: '90%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '2.5px solid #F59E0B'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                background: '#FEF3C7', color: '#D97706', borderRadius: '50%',
                width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '26px', flexShrink: 0, boxShadow: '0 2px 4px rgba(245, 158, 11, 0.2)'
              }}>
                ⚠️
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#78350F', fontWeight: '800' }}>
                  ATTENTION: Timetable Verification Required
                </h3>
                <span style={{ fontSize: '12.5px', color: '#B45309', fontWeight: '700', textTransform: 'uppercase' }}>
                  {currentPerson.firstName} {currentPerson.lastName} ({currentPerson.position || 'Teacher'})
                </span>
              </div>
            </div>

            <div style={{
              background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px',
              padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: '#92400E', lineHeight: '1.6'
            }}>
              <strong style={{ display: 'block', marginBottom: '4px', color: '#78350F' }}>
                Auto-Populated Schedules Notice:
              </strong>
              This teacher's timetable schedule was auto-populated from an uploaded eSF7 file. Please inspect the <strong>Start Time</strong>, <strong>End Time</strong>, and <strong>Usual Days</strong> for all subject periods to ensure accuracy.
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  verifiedModalDismissedMap.current[currentPerson.id] = true;
                  setShowAttentionModal(false);
                }}
                style={{
                  background: '#F1F5F9',
                  color: '#334155',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                Inspect Schedule
              </button>
              <button
                type="button"
                onClick={handleConfirmAllAndSave}
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  flex: 1,
                  boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                }}
              >
                ✓ Confirm All & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MULTI-DATE CALENDAR SELECTOR MODAL ── */}
      {calendarModalConfig && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '16px', padding: '24px',
            width: '500px', maxWidth: '92vw', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1.5px solid var(--line)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--navy)' }}>
                  📅 Select Dates on Calendar
                </h3>
                <span style={{ fontSize: '12px', color: '#0284c7', fontWeight: '700' }}>
                  {calendarModalConfig.taskName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCalendarModalConfig(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            {/* Month Header Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary"
                style={{ minHeight: 'auto', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear(prev => prev - 1);
                  } else {
                    setCalendarMonth(prev => prev - 1);
                  }
                }}
              >
                ◀ Prev
              </button>
              <span style={{ fontWeight: '800', fontSize: '15px', color: 'var(--navy)' }}>
                {new Date(calendarYear, calendarMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                className="btn secondary"
                style={{ minHeight: 'auto', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear(prev => prev + 1);
                  } else {
                    setCalendarMonth(prev => prev + 1);
                  }
                }}
              >
                Next ▶
              </button>
            </div>

            {/* Quick Select Bar & Time Configuration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px', background: '#EFF6FF', padding: '12px', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#1E40AF', display: 'block', marginBottom: '2px' }}>Start Time</label>
                <input
                  type="time"
                  list="school-times"
                  value={calendarStartTime}
                  onChange={(e) => setCalendarStartTime(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #93C5FD', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#1E40AF', display: 'block', marginBottom: '2px' }}>End Time</label>
                <input
                  type="time"
                  list="school-times"
                  value={calendarEndTime}
                  onChange={(e) => setCalendarEndTime(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #93C5FD', fontSize: '12px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: '11px', padding: '4px 10px', minHeight: 'auto', flex: 1 }}
                onClick={handleSelectAllWeekdaysInMonth}
              >
                ✓ Select All Weekdays (M-F)
              </button>
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: '11px', padding: '4px 10px', minHeight: 'auto', color: '#EF4444', borderColor: '#FCA5A5' }}
                onClick={() => setCalendarSelectedDates([])}
              >
                Clear All
              </button>
            </div>

            {/* Quick Specific Day Selection Toolbar */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px', background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--navy)', marginRight: '2px' }}>Toggle Day:</span>
              {[
                { label: 'All M', dayIndex: 1 },
                { label: 'All T', dayIndex: 2 },
                { label: 'All W', dayIndex: 3 },
                { label: 'All TH', dayIndex: 4 },
                { label: 'All F', dayIndex: 5 },
                { label: 'All SAT', dayIndex: 6 },
                { label: 'All SUN', dayIndex: 0 },
              ].map(({ label, dayIndex }) => {
                const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const monthDayStrings = [];
                for (let day = 1; day <= totalDays; day++) {
                  const d = new Date(calendarYear, calendarMonth, day);
                  if (d.getDay() === dayIndex) {
                    const mm = String(calendarMonth + 1).padStart(2, '0');
                    const dd = String(day).padStart(2, '0');
                    monthDayStrings.push(`${calendarYear}-${mm}-${dd}`);
                  }
                }
                const isFullySelected = monthDayStrings.length > 0 && monthDayStrings.every(dStr => calendarSelectedDates.includes(dStr));

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleToggleSpecificDayOfWeek(dayIndex)}
                    style={{
                      padding: '3px 7px',
                      fontSize: '10.5px',
                      fontWeight: '700',
                      borderRadius: '6px',
                      border: isFullySelected ? 'none' : '1px solid #CBD5E1',
                      background: isFullySelected ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : '#FFFFFF',
                      color: isFullySelected ? '#FFFFFF' : '#334155',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Click to select or unselect all ${label.replace('All ', '')}s in this month`}
                  >
                    {isFullySelected ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>

            {/* Calendar Days Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '16px' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dName, dIdx) => (
                <div
                  key={dName}
                  onClick={() => handleToggleSpecificDayOfWeek(dIdx)}
                  style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', padding: '4px 0', cursor: 'pointer', borderRadius: '4px', userSelect: 'none' }}
                  title={`Click to toggle all ${dName}s in this month`}
                >
                  {dName}
                </div>
              ))}
              {(() => {
                const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
                const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const gridCells = [];

                for (let i = 0; i < firstDayIndex; i++) {
                  gridCells.push(<div key={`blank-${i}`} style={{ height: '36px' }} />);
                }

                for (let day = 1; day <= totalDays; day++) {
                  const mm = String(calendarMonth + 1).padStart(2, '0');
                  const dd = String(day).padStart(2, '0');
                  const dStr = `${calendarYear}-${mm}-${dd}`;
                  const isSelected = calendarSelectedDates.includes(dStr);
                  const dObj = new Date(calendarYear, calendarMonth, day);
                  const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;

                  gridCells.push(
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleCalendarDate(dStr)}
                      style={{
                        height: '36px',
                        borderRadius: '8px',
                        border: isSelected ? 'none' : '1px solid var(--line)',
                        background: isSelected ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : isWeekend ? '#F8FAFC' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : isWeekend ? '#94A3B8' : '#1E293B',
                        fontWeight: isSelected ? '800' : '600',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 4px rgba(2, 132, 199, 0.3)' : 'none'
                      }}
                    >
                      {isSelected ? `✓ ${day}` : day}
                    </button>
                  );
                }
                return gridCells;
              })()}
            </div>

            {/* Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '14px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--navy)' }}>
                Selected: <strong style={{ color: '#0284c7' }}>{calendarSelectedDates.length} Date(s)</strong>
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px' }}
                  onClick={() => setCalendarModalConfig(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                    color: 'white',
                    fontWeight: 'bold',
                    borderRadius: '8px',
                    padding: '8px 20px',
                    fontSize: '12px'
                  }}
                  onClick={handleApplyCalendarDates}
                >
                  Apply Selected Dates ({calendarSelectedDates.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
