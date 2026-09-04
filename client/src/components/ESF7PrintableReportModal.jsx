import React from 'react';
import { FiPrinter, FiX, FiAlertTriangle, FiCheck } from 'react-icons/fi';

export default function ESF7PrintableReportModal({ isOpen, onClose, schoolInfo, personnel, signature, isLocked, errorsCount }) {
  if (!isOpen) return null;

  const schoolIdStr   = schoolInfo?.schoolId || schoolInfo?.school_id || '108348';
  const schoolNameStr = schoolInfo?.schoolName || schoolInfo?.school_name || 'MAJAYJAY ELEMENTARY SCHOOL';
  const regionStr     = schoolInfo?.region || 'REGION IV-A';
  const divisionStr   = schoolInfo?.division || 'LAGUNA';
  const districtStr   = schoolInfo?.district || 'MAJAYJAY';
  const schoolYearStr = schoolInfo?.schoolYear || schoolInfo?.school_year || 'SY 2026-2027';

  // Dynamic School Head Detection from Personnel Roster
  const schoolHead = (personnel || []).find(p => 
    p.isSchoolHead || 
    p.is_school_head || 
    (p.position || '').toUpperCase().includes('PRINCIPAL') || 
    (p.position || '').toUpperCase().includes('SCHOOL HEAD') || 
    (p.position || '').toUpperCase().includes('HEAD TEACHER') || 
    (p.position || '').toUpperCase().includes('TIC') || 
    (p.position || '').toUpperCase().includes('TEACHER-IN-CHARGE')
  );

  const middleInitial = schoolHead?.middleName && schoolHead.middleName !== 'N/A' && schoolHead.middleName !== 'NONE'
    ? ` ${schoolHead.middleName.charAt(0)}.`
    : '';

  const schoolHeadFullName = schoolHead
    ? `${schoolHead.lastName || ''}, ${schoolHead.firstName || ''}${middleInitial}`.toUpperCase()
    : (schoolInfo?.certifiedBy || 'SCHOOL HEAD / PRINCIPAL');

  const schoolHeadPosition = schoolHead?.position
    ? `${schoolHead.position} / School Head`
    : (schoolInfo?.certifiedTitle || 'School Head Signature & Official Designation');

  const finalSig = signature || schoolHead?.e_signature_url || schoolHead?.signature || schoolInfo?.certifiedSignature;

  const teachingList = (personnel || []).filter(p => p.type !== 'non-teaching');
  const nonTeachingList = (personnel || []).filter(p => p.type === 'non-teaching');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="esf7-printable-overlay">
      <style dangerouslySetInnerHTML={{ __html: `
        .esf7-printable-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(6px);
          z-index: 999999;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .esf7-print-toolbar {
          width: 100%;
          max-width: 1400px;
          width: 96vw;
          background: #0F172A;
          color: white;
          padding: 14px 24px;
          border-radius: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .esf7-print-sheet {
          background: white;
          color: #0F172A;
          width: 100%;
          max-width: 1400px;
          width: 96vw;
          padding: 32px;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          font-family: Arial, Helvetica, sans-serif;
          box-sizing: border-box;
        }

        .esf7-header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }

        .esf7-header-table td {
          padding: 4px 8px;
          font-size: 12px;
        }

        .esf7-data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-top: 16px;
        }

        .esf7-data-table th, .esf7-data-table td {
          border: 1px solid #334155;
          padding: 6px 8px;
          vertical-align: middle;
        }

        .esf7-data-table th {
          background: #F1F5F9;
          font-weight: 700;
          text-align: center;
          text-transform: uppercase;
          font-size: 10px;
        }

        @page {
          size: 13in 8.5in;
          margin: 8mm 10mm;
        }

        @media print {
          html, body {
            width: 100% !important;
            height: auto !important;
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .esf7-printable-overlay {
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important; height: auto !important;
            background: white !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .esf7-print-toolbar, nav, header, sidebar, .no-print {
            display: none !important;
          }

          .esf7-print-sheet {
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }

          .esf7-data-table {
            page-break-inside: auto;
          }

          .esf7-data-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          .esf7-data-table thead {
            display: table-header-group;
          }
        }
      ` }} />

      {/* Top Action Bar (Hidden during printing) */}
      <div className="esf7-print-toolbar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiPrinter size={22} style={{ color: 'var(--navy)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
              eSF7 Printable Report & Class Program Preview
            </h3>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>
              DepEd Official Format · Uses browser print formatting (Save as PDF supported)
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              background: 'linear-gradient(180deg, #10B981, #059669)',
              color: 'white',
              fontWeight: '800',
              fontSize: '13px',
              padding: '10px 22px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FiPrinter size={15} /> Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#334155',
              color: 'white',
              fontWeight: '700',
              fontSize: '13px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FiX size={15} /> Close Preview
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div className="esf7-print-sheet">
        {/* DepEd Official Header Frame Matching Excel SF7 Template */}
        <div style={{
          border: '2px solid #1E40AF',
          padding: '12px 16px',
          marginBottom: '20px',
          background: 'white',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* DepEd Official Seal Logo */}
            <div style={{ flexShrink: 0, paddingLeft: '8px' }}>
              <img
                src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/deped.png`}
                alt="DepEd Logo"
                style={{ height: '75px', width: 'auto', objectFit: 'contain', display: 'block' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>

            {/* Header Title & Metadata Grid */}
            <div style={{ flex: 1 }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: '0 0 2px 0', fontSize: '18px', fontWeight: '900', color: '#0F172A', fontFamily: 'Arial, sans-serif' }}>
                  School Form 7 (SF7) School Personnel Assignment List and Basic Profile
                </h2>
                <span style={{ fontSize: '10.5px', color: '#334155', fontStyle: 'italic', display: 'block' }}>
                  (This replaces Form 12-Monthly Status Report for Teachers, Form 19-Assignment List, Form 29-Teacher Program and Form 31-Summary Information of Teachers)
                </span>
              </div>

              {/* Input Box Metadata Grid Matching Screenshot */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', fontWeight: '700', color: '#0F172A' }}>
                {/* Row 1: School ID, Region, Division */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>School ID</span>
                    <div style={{ border: '1.5px solid #000', padding: '2px 14px', minWidth: '120px', textAlign: 'center', fontWeight: '800', background: 'white' }}>
                      {schoolIdStr}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Region</span>
                    <div style={{ border: '1.5px solid #000', padding: '2px 14px', minWidth: '90px', textAlign: 'center', fontWeight: '800', background: 'white' }}>
                      {regionStr}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Division</span>
                    <div style={{ border: '1.5px solid #000', padding: '2px 14px', minWidth: '160px', textAlign: 'center', fontWeight: '800', background: 'white' }}>
                      {divisionStr}
                    </div>
                  </div>
                </div>

                {/* Row 2: School Name, District, School Year */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>School Name</span>
                    <div style={{ border: '1.5px solid #000', padding: '2px 14px', minWidth: '220px', textAlign: 'center', fontWeight: '800', background: 'white' }}>
                      {schoolNameStr}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>District</span>
                    <div style={{ border: '1.5px solid #000', padding: '2px 14px', minWidth: '130px', textAlign: 'center', fontWeight: '800', background: 'white' }}>
                      {districtStr}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>School Year</span>
                    <div style={{ border: '1.5px solid #000', padding: '2px 14px', minWidth: '100px', textAlign: 'center', fontWeight: '800', background: 'white' }}>
                      {schoolYearStr}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Official DepEd 3-Column Position Summary Table matching eSF7 Format */}
        {(() => {
          const teachingMap = {};
          const nonTeachingMap = {};
          const otherFundingRows = [];
          let totalTeachingCount = 0;
          let totalNonTeachingCount = 0;

          (personnel || []).forEach(p => {
            const fund = String(p.fundSource || p.fund_source || 'NATIONAL').trim().toUpperCase();
            const pos = (p.position || p.position_title || 'TEACHER I').toUpperCase().trim();
            const isNonTeaching = p.type === 'non-teaching' || pos.includes('ADMINISTRATIVE') || pos.includes('OFFICER') || pos.includes('ASSISTANT') || pos.includes('AIDE') || pos.includes('PROJECT') || pos.includes('UTILITY') || pos.includes('SECURITY') || pos.includes('DRIVER') || pos.includes('NURSE') || pos.includes('BOOKKEEPER') || pos.includes('ACCOUNTANT');

            if (fund === 'NATIONAL') {
              if (isNonTeaching) {
                nonTeachingMap[pos] = (nonTeachingMap[pos] || 0) + 1;
                totalNonTeachingCount++;
              } else {
                teachingMap[pos] = (teachingMap[pos] || 0) + 1;
                totalTeachingCount++;
              }
            } else {
              // (C) Other Appointments and Funding Source (MOOE, SEF, LGU, PTA, NGO, OTHERS)
              otherFundingRows.push({
                title: pos,
                appointment: (p.natureOfAppointment || p.nature_of_appointment || p.hiringArrangement || 'JOB ORDER / COS').toUpperCase(),
                fundSource: fund
              });
            }
          });

          const activeTeachingRows = Object.keys(teachingMap).map(t => ({ title: t, count: teachingMap[t] }));
          const activeNonTeachingRows = Object.keys(nonTeachingMap).map(t => ({ title: t, count: nonTeachingMap[t] }));
          const maxRows = Math.max(activeTeachingRows.length, activeNonTeachingRows.length, otherFundingRows.length, 6);

          return (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '10px', border: '1.5px solid #000' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', textAlign: 'center', fontWeight: '800' }}>
                  <th colSpan="2" style={{ border: '1px solid #000', padding: '6px', width: '34%' }}>
                    (A) Nationally-Funded Teaching & Teaching Related Items
                  </th>
                  <th colSpan="2" style={{ border: '1px solid #000', padding: '6px', width: '33%' }}>
                    (B) Nationally-Funded Non Teaching Items
                  </th>
                  <th colSpan="3" style={{ border: '1px solid #000', padding: '6px', width: '33%' }}>
                    (C) Other Appointments and Funding Source
                  </th>
                </tr>
                <tr style={{ background: '#F8FAFC', fontSize: '9px', textAlign: 'center', fontWeight: '700' }}>
                  <th style={{ border: '1px solid #000', padding: '4px' }}>Title of Plantilla Position</th>
                  <th style={{ border: '1px solid #000', padding: '4px', width: '50px' }}>Number of Incumbent</th>
                  <th style={{ border: '1px solid #000', padding: '4px' }}>Title of Plantilla Position</th>
                  <th style={{ border: '1px solid #000', padding: '4px', width: '50px' }}>Number of Incumbent</th>
                  <th style={{ border: '1px solid #000', padding: '4px' }}>Title of Position</th>
                  <th style={{ border: '1px solid #000', padding: '4px' }}>Appointment</th>
                  <th style={{ border: '1px solid #000', padding: '4px' }}>Fund Source</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRows }).map((_, rIdx) => {
                  const tItem = activeTeachingRows[rIdx];
                  const ntItem = activeNonTeachingRows[rIdx];
                  const otherItem = otherFundingRows[rIdx];

                  return (
                    <tr key={rIdx} style={{ textAlign: 'left', height: '18px' }}>
                      <td style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: '600' }}>
                        {tItem ? tItem.title : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontWeight: '700' }}>
                        {tItem ? tItem.count : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: '600' }}>
                        {ntItem ? ntItem.title : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontWeight: '700' }}>
                        {ntItem ? ntItem.count : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: '600' }}>
                        {otherItem ? otherItem.title : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 6px', color: otherItem ? '#000' : '#64748B' }}>
                        {otherItem ? otherItem.appointment : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: otherItem ? '700' : 'normal', color: otherItem ? '#000' : '#64748B' }}>
                        {otherItem ? otherItem.fundSource : ''}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: '800', background: '#F1F5F9' }}>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', textTransform: 'uppercase' }}>TOTAL</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{totalTeachingCount}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', textTransform: 'uppercase' }}>TOTAL</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{totalNonTeachingCount}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', textTransform: 'uppercase' }}>TOTAL (OTHER)</td>
                  <td colSpan="2" style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{otherFundingRows.length}</td>
                </tr>
              </tbody>
            </table>
          );
        })()}

        {/* Official DepEd eSF7 Teacher Class Program Master Table */}
        <table className="esf7-data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', border: '1.5px solid #000' }}>
          <thead>
            <tr style={{ background: '#F1F5F9', textAlign: 'center', fontWeight: '800' }}>
              <th style={{ border: '1px solid #000', padding: '4px 6px', whiteSpace: 'nowrap', width: '75px' }}>TIN / ID</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', minWidth: '130px' }}>Name of Teacher</th>
              <th style={{ border: '1px solid #000', padding: '4px', whiteSpace: 'nowrap', width: '45px' }}>Sex</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', whiteSpace: 'nowrap', width: '60px' }}>Funding</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', minWidth: '90px' }}>Position Title</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', minWidth: '90px' }}>Appointment</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', minWidth: '85px' }}>Degree</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', minWidth: '75px' }}>Major</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', minWidth: '130px' }}>Subject / Assignment</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', whiteSpace: 'nowrap', width: '45px' }}>Grade</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', minWidth: '70px' }}>Section</th>
              <th style={{ border: '1px solid #000', padding: '2px 1px', width: '14px', fontSize: '8.5px', textAlign: 'center' }}>M</th>
              <th style={{ border: '1px solid #000', padding: '2px 1px', width: '14px', fontSize: '8.5px', textAlign: 'center' }}>T</th>
              <th style={{ border: '1px solid #000', padding: '2px 1px', width: '14px', fontSize: '8.5px', textAlign: 'center' }}>W</th>
              <th style={{ border: '1px solid #000', padding: '2px 1px', width: '16px', fontSize: '8.5px', textAlign: 'center', whiteSpace: 'nowrap' }}>TH</th>
              <th style={{ border: '1px solid #000', padding: '2px 1px', width: '14px', fontSize: '8.5px', textAlign: 'center' }}>F</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', whiteSpace: 'nowrap', width: '55px' }}>From</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', whiteSpace: 'nowrap', width: '55px' }}>To</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', whiteSpace: 'nowrap', width: '45px' }}>Min/Wk</th>
            </tr>
          </thead>
          <tbody>
            {(personnel || []).map((p, pIdx) => {
              const firstName  = (p.firstName || p.first_name || '').toUpperCase();
              const middleName = (p.middleName || p.middle_name || '').toUpperCase();
              const lastName   = (p.lastName || p.last_name || '').toUpperCase();
              const fullName   = [lastName, firstName, middleName].filter(Boolean).join(', ') || 'TEACHER';
              const idVal      = p.tin || p.philsysNo || p.philsys_no || p.id || 'N/A';
              const rawSex     = (p.sexAtBirth || p.sex || p.sex_at_birth || 'FEMALE').toUpperCase();
              const sex        = rawSex.startsWith('M') ? 'M' : 'F';
              const funding    = (p.fundSource || p.fund_source || p.fundingSource || p.funding_source || 'NATIONAL').toUpperCase();
              const pos        = (p.position || p.position_title || 'TEACHER I').toUpperCase();
              const appt       = (p.natureOfAppointment || p.nature_of_appointment || 'REGULAR PERMANENT').toUpperCase();
              const degree     = (p.collegeDegree || p.college_degree || 'BACHELOR DEGREE').toUpperCase();
              const major      = (p.major || p.major_specialization || 'GENERAL').toUpperCase();
              const minor      = (p.minor || 'N/A').toUpperCase();

              const workloads  = p.workloadRows && p.workloadRows.length > 0 ? p.workloadRows : [
                { subject: p.type === 'non-teaching' ? 'ADMINISTRATIVE' : 'TEACHING ASSIGNMENT', gradeLevel: p.type === 'non-teaching' ? 'NG' : '4', sectionName: '', days: ['MON','TUE','WED','THU','FRI'], startTime: '07:30', endTime: '08:15' }
              ];

              let teacherTotalMins = 0;
              const totalRows = workloads.length + 1; // Workloads + 1 summary total row

              const format12Hr = (timeStr) => {
                if (!timeStr) return '';
                if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) return timeStr;
                const parts = timeStr.split(':');
                let h = parseInt(parts[0], 10);
                const m = parts[1] || '00';
                if (isNaN(h)) return timeStr;
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12;
                if (h === 0) h = 12;
                return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
              };

              const getDayMark = (daysArr, code) => {
                if (!Array.isArray(daysArr)) daysArr = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
                const str = daysArr.map(d => String(d).toUpperCase()).join(' ');
                if (code === 'M') return str.includes('MON') || str.includes('M') ? 'M' : '';
                if (code === 'T') return str.includes('TUE') || str.includes('T') ? 'T' : '';
                if (code === 'W') return str.includes('WED') || str.includes('W') ? 'W' : '';
                if (code === 'TH') return str.includes('THU') || str.includes('TH') ? 'TH' : '';
                if (code === 'F') return str.includes('FRI') || str.includes('F') ? 'F' : '';
                return '';
              };

              return (
                <React.Fragment key={p.id || pIdx}>
                  {workloads.map((w, wIdx) => {
                    const startStr = w.startTime || w.start_time || '07:30';
                    const endStr   = w.endTime || w.end_time || '08:15';
                    const sMins    = parseInt(startStr.split(':')[0] || 0) * 60 + parseInt(startStr.split(':')[1] || 0);
                    const eMins    = parseInt(endStr.split(':')[0] || 0) * 60 + parseInt(endStr.split(':')[1] || 0);
                    const dailyMins = Math.max(0, eMins - sMins);
                    const daysArr  = Array.isArray(w.days) ? w.days : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
                    const weeklyMins = dailyMins * (daysArr.length || 5);
                    teacherTotalMins += weeklyMins;

                    const subjectName = (w.subject || w.subject_name || w.task || (p.type === 'non-teaching' ? 'ADMINISTRATIVE' : 'TEACHING')).toUpperCase();
                    const rawGrade    = w.gradeLevel || w.grade_level || (p.type === 'non-teaching' || pos.includes('PRINCIPAL') ? 'NG' : '4');
                    let gradeVal = String(rawGrade).trim();
                    if (gradeVal.toUpperCase() === 'NG' || gradeVal.toUpperCase().includes('NON')) {
                      gradeVal = 'NG';
                    } else if (gradeVal.toUpperCase().includes('KINDER') || gradeVal.toUpperCase() === 'K') {
                      gradeVal = 'K';
                    } else {
                      const m = gradeVal.match(/\d+/);
                      if (m) gradeVal = m[0];
                    }
                    const secVal      = (w.sectionName || w.section_name || '').toUpperCase();

                    return (
                      <tr key={w.id || wIdx} style={{ height: '18px' }}>
                        {wIdx === 0 && (
                          <>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 4px', fontFamily: 'monospace', textAlign: 'center', verticalAlign: 'middle', fontWeight: '700', whiteSpace: 'nowrap' }}>{idVal}</td>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: '800', verticalAlign: 'middle' }}>{fullName}</td>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{sex}</td>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{funding}</td>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 6px', verticalAlign: 'middle', fontWeight: '600' }}>{pos}</td>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 6px', verticalAlign: 'middle' }}>{appt}</td>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 6px', verticalAlign: 'middle' }}>{degree}</td>
                            <td rowSpan={totalRows} style={{ border: '1px solid #000', padding: '3px 6px', verticalAlign: 'middle' }}>{major}</td>
                          </>
                        )}
                        <td style={{ border: '1px solid #000', padding: '2px 5px', fontWeight: '700' }}>{subjectName}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center', fontWeight: '800', whiteSpace: 'nowrap' }}>{gradeVal}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center' }}>{secVal}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 1px', textAlign: 'center', fontWeight: '700', fontSize: '8.5px', width: '14px' }}>{getDayMark(daysArr, 'M')}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 1px', textAlign: 'center', fontWeight: '700', fontSize: '8.5px', width: '14px' }}>{getDayMark(daysArr, 'T')}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 1px', textAlign: 'center', fontWeight: '700', fontSize: '8.5px', width: '14px' }}>{getDayMark(daysArr, 'W')}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 1px', textAlign: 'center', fontWeight: '700', fontSize: '8.5px', width: '16px' }}>{getDayMark(daysArr, 'TH')}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 1px', textAlign: 'center', fontWeight: '700', fontSize: '8.5px', width: '14px' }}>{getDayMark(daysArr, 'F')}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>{format12Hr(startStr)}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>{format12Hr(endStr)}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 6px', textAlign: 'right', fontWeight: '700', whiteSpace: 'nowrap' }}>{weeklyMins}</td>
                      </tr>
                    );
                  })}
                  {/* Teacher Total Minutes Summary Row */}
                  <tr style={{ fontWeight: '800', background: '#F8FAFC', borderBottom: '2px solid #000' }}>
                    <td colSpan="10" style={{ border: '1px solid #000', padding: '3px 8px', textAlign: 'right', textTransform: 'uppercase' }}>Total</td>
                    <td style={{ border: '1px solid #000', padding: '3px 8px', textAlign: 'right', color: '#047857', fontSize: '11px', whiteSpace: 'nowrap' }}>{teacherTotalMins}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Footer Certification */}
        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '11px', pageBreakInside: 'avoid' }}>
          <div>
            <span>Generated via <strong>InsightED eSF7 Platform</strong></span><br />
            <span style={{ color: '#64748B' }}>Date Generated: {new Date().toLocaleDateString()}</span>
            {isLocked && (
              <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '2px 8px', borderRadius: '4px', fontSize: '9.5px', fontWeight: '800' }}>
                <FiAlertTriangle size={10} /> DRAFT REPORT — {errorsCount || 'PENDING'} VALIDATION ISSUES REMAINING
              </div>
            )}
          </div>
          <div style={{ textAlign: 'center', minWidth: '260px', borderTop: '1.5px solid #0F172A', paddingTop: '6px', position: 'relative' }}>
            {finalSig ? (
              <div style={{ marginBottom: '6px' }}>
                <img 
                  src={finalSig} 
                  alt="School Head E-Signature" 
                  style={{ maxHeight: '48px', maxWidth: '180px', objectFit: 'contain', display: 'block', margin: '0 auto' }} 
                />
                <span style={{ fontSize: '9px', fontWeight: '800', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', letterSpacing: '0.04em' }}>
                  <FiCheck size={10} /> CERTIFIED & DIGITALLY SIGNED
                </span>
              </div>
            ) : isLocked ? (
              <div style={{ marginBottom: '6px', fontSize: '10px', color: '#D97706', fontWeight: '800', fontStyle: 'italic' }}>
                [ PENDING VALIDATION & SIGNATURE ]
              </div>
            ) : null}
            <strong style={{ display: 'block', fontSize: '12px', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {schoolHeadFullName}
            </strong>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '600', display: 'block' }}>
              {schoolHeadPosition}
            </span>
            <span style={{ fontSize: '9px', color: '#64748B', display: 'block', marginTop: '2px' }}>
              School Head Signature & Official Designation
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
