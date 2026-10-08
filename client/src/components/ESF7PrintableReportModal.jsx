import React, { useState, useEffect } from 'react';
import { FiPrinter, FiX, FiAlertTriangle, FiCheck } from 'react-icons/fi';
import { detectPersonnelTypeFromPosition } from '../context/AppContext';

// The wrapper owns the open/closed decision so the inner component always calls its hooks in the same order.
export default function ESF7PrintableReportModal(props) {
  if (!props.isOpen) return null;
  return <ESF7PrintableReportModalContent {...props} />;
}

function ESF7PrintableReportModalContent({ isOpen, onClose, schoolInfo, personnel, signature, isLocked, errorsCount, selectedTerm = '1st' }) {
  const [activePrintTerm, setActivePrintTerm] = useState(selectedTerm || '1st');

  useEffect(() => {
    if (selectedTerm) setActivePrintTerm(selectedTerm);
  }, [selectedTerm]);

  const schoolIdStr   = schoolInfo?.schoolId || schoolInfo?.school_id || '108348';
  const schoolNameStr = schoolInfo?.schoolName || schoolInfo?.school_name || 'MAJAYJAY ELEMENTARY SCHOOL';
  const regionStr     = schoolInfo?.region || 'REGION IV-A';
  const divisionStr   = schoolInfo?.division || 'LAGUNA';
  const districtStr   = schoolInfo?.district || 'MAJAYJAY';
  const schoolYearStr = schoolInfo?.schoolYear || schoolInfo?.school_year || 'SY 2026-2027';

  // Dynamic School Head Detection strictly following the toggle in Personnel Roster
  const schoolHead = (personnel || []).find(p => p.isSchoolHead === true || p.is_school_head === true) ||
    (personnel || []).find(p => {
      const pos = (p.position || '').toUpperCase();
      return pos.includes('PRINCIPAL') || pos.includes('HEAD TEACHER') || pos.includes('TIC') || pos.includes('TEACHER-IN-CHARGE');
    });

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

  const teachingList = (personnel || []).filter(p => {
    const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
    return pType === 'teaching' || pType === 'teaching-related' || pType === 'related-teaching';
  });
  const nonTeachingList = (personnel || []).filter(p => {
    const pType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
    return pType === 'non-teaching';
  });

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
              DepEd Official Format · {activePrintTerm === '1st' ? '1st Term' : activePrintTerm === '2nd' ? '2nd Term' : '3rd Term'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Term Selector in Print Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#334155', padding: '3px', borderRadius: '8px' }}>
            {[
              { id: '1st', label: '1st Term' },
              { id: '2nd', label: '2nd Term' },
              { id: '3rd', label: '3rd Term' }
            ].map(t => {
              const isSelected = activePrintTerm === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActivePrintTerm(t.id)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '11.5px',
                    fontWeight: isSelected ? '800' : '600',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected ? '#2563EB' : 'transparent',
                    color: isSelected ? 'white' : '#94A3B8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

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
                    <div style={{ border: '1.5px solid #000', padding: '2px 14px', minWidth: '130px', textAlign: 'center', fontWeight: '800', background: 'white' }}>
                      {schoolYearStr} ({activePrintTerm === '1st' ? '1st Term' : activePrintTerm === '2nd' ? '2nd Term' : '3rd Term'})
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Official DepEd 3-Column Position Summary Table matching eSF7 Format */}
        {(() => {
          const TEACHING_HIERARCHY = [
            'SCHOOL PRINCIPAL IV', 'SCHOOL PRINCIPAL III', 'SCHOOL PRINCIPAL II', 'SCHOOL PRINCIPAL I', 'PRINCIPAL IV', 'PRINCIPAL III', 'PRINCIPAL II', 'PRINCIPAL I',
            'ASSISTANT SCHOOL PRINCIPAL III', 'ASSISTANT SCHOOL PRINCIPAL II', 'ASSISTANT SCHOOL PRINCIPAL I', 'ASSISTANT PRINCIPAL II', 'ASSISTANT PRINCIPAL I',
            'HEAD TEACHER VI', 'HEAD TEACHER V', 'HEAD TEACHER IV', 'HEAD TEACHER III', 'HEAD TEACHER II', 'HEAD TEACHER I',
            'MASTER TEACHER V', 'MASTER TEACHER IV', 'MASTER TEACHER III', 'MASTER TEACHER II', 'MASTER TEACHER I',
            'SPECIAL SCIENCE TEACHER I', 'SPECIAL EDUCATION TEACHER III', 'SPECIAL EDUCATION TEACHER II', 'SPECIAL EDUCATION TEACHER I', 'SPED TEACHER',
            'TEACHER III', 'TEACHER II', 'TEACHER I',
            'GUIDANCE COORDINATOR III', 'GUIDANCE COORDINATOR II', 'GUIDANCE COORDINATOR I', 'GUIDANCE COUNSELOR III', 'GUIDANCE COUNSELOR II', 'GUIDANCE COUNSELOR I', 'SCHOOL COUNSELOR ASSOCIATE I',
            'VOCATIONAL INSTRUCTION SUPERVISOR', 'VOCATIONAL PLACEMENT COORDINATOR', 'INSTRUCTOR I'
          ];

          const NON_TEACHING_HIERARCHY = [
            'ADMINISTRATIVE OFFICER V', 'ADMINISTRATIVE OFFICER IV', 'ADMINISTRATIVE OFFICER II', 'ADMINISTRATIVE OFFICER I', 'ADMINISTRATIVE OFFICER',
            'ACCOUNTANT III', 'ACCOUNTANT II', 'ACCOUNTANT I',
            'REGISTRAR III', 'REGISTRAR II', 'REGISTRAR I', 'REGISTRAR',
            'SENIOR ADMINISTRATIVE ASSISTANT III', 'SENIOR ADMINISTRATIVE ASSISTANT II', 'SENIOR ADMINISTRATIVE ASSISTANT I',
            'ADMINISTRATIVE ASSISTANT III', 'ADMINISTRATIVE ASSISTANT II', 'ADMINISTRATIVE ASSISTANT I', 'ADMINISTRATIVE ASSISTANT',
            'ADMINISTRATIVE AIDE VI', 'ADMINISTRATIVE AIDE V', 'ADMINISTRATIVE AIDE IV', 'ADMINISTRATIVE AIDE III', 'ADMINISTRATIVE AIDE II', 'ADMINISTRATIVE AIDE I', 'ADMINISTRATIVE AIDE',
            'SECURITY GUARD III', 'SECURITY GUARD II', 'SECURITY GUARD I', 'SECURITY GUARD',
            'UTILITY WORKER II', 'UTILITY WORKER I', 'UTILITY WORKER', 'WATCHMAN', 'DRIVER'
          ];

          const teachingMap = {};
          const nonTeachingMap = {};
          const otherMap = {};

          (personnel || []).forEach(p => {
            const pos = (p.position || p.plantilla_position || p.position_title || 'TEACHER I').toUpperCase().trim();
            const fund = String(p.fundSource || p.fund_source || 'NATIONAL').toUpperCase().trim();
            const isNational = fund === 'NATIONAL';
            const depStatus = String(p.deploymentStatus || p.deployment_status || 'OWN STATION').toUpperCase().trim();

            let statusKey = 'os';
            if (depStatus.includes('CLUSTERED')) statusKey = 'clustered';
            else if (depStatus.includes('BORROWED')) statusKey = 'borrowed';
            else if (depStatus.includes('REASSIGNED')) statusKey = 'reassigned';

            const detectedType = detectPersonnelTypeFromPosition(pos) || p.type || 'teaching';
            const isNonTeaching = ['non-teaching', 'NON-TEACHING'].includes(detectedType) || ['non-teaching', 'NON-TEACHING'].includes(p.type) || ['NON-TEACHING'].includes(p.positionCategory);

            if (isNational) {
              if (isNonTeaching) {
                if (!nonTeachingMap[pos]) nonTeachingMap[pos] = { os: 0, clustered: 0, borrowed: 0, reassigned: 0 };
                nonTeachingMap[pos][statusKey] = (nonTeachingMap[pos][statusKey] || 0) + 1;
              } else {
                if (!teachingMap[pos]) teachingMap[pos] = { os: 0, clustered: 0, borrowed: 0, reassigned: 0 };
                teachingMap[pos][statusKey] = (teachingMap[pos][statusKey] || 0) + 1;
              }
            } else {
              // (C) Other Appointments and Funding Source (Non-National)
              const appt = String(p.natureOfAppointment || p.nature_of_appointment || p.hiringArrangement || p.hiring_arrangement || 'CONTRACTUAL').toUpperCase().trim();
              const groupKey = `${pos}||${appt}||${fund}`;
              if (!otherMap[groupKey]) {
                otherMap[groupKey] = {
                  title: pos,
                  appointment: appt,
                  fundSource: fund,
                  teaching: 0,
                  nonTeaching: 0
                };
              }
              if (isNonTeaching) {
                otherMap[groupKey].nonTeaching++;
              } else {
                otherMap[groupKey].teaching++;
              }
            }
          });

          // Sort by DepEd Hierarchy
          const sortWithHierarchy = (keys, hierarchy) => {
            return keys.sort((a, b) => {
              const idxA = hierarchy.indexOf(a);
              const idxB = hierarchy.indexOf(b);
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              return a.localeCompare(b);
            });
          };

          const activeTeachingRows = sortWithHierarchy(Object.keys(teachingMap), TEACHING_HIERARCHY).map(title => ({
            title,
            ...teachingMap[title]
          }));

          const activeNonTeachingRows = sortWithHierarchy(Object.keys(nonTeachingMap), NON_TEACHING_HIERARCHY).map(title => ({
            title,
            ...nonTeachingMap[title]
          }));

          const otherFundingRows = Object.values(otherMap);
          const maxRows = Math.max(activeTeachingRows.length, activeNonTeachingRows.length, otherFundingRows.length, 6);

          // Subtotals for (A) Teaching
          const sumA = activeTeachingRows.reduce((acc, r) => ({
            os: acc.os + (r.os || 0),
            clustered: acc.clustered + (r.clustered || 0),
            borrowed: acc.borrowed + (r.borrowed || 0),
            reassigned: acc.reassigned + (r.reassigned || 0)
          }), { os: 0, clustered: 0, borrowed: 0, reassigned: 0 });

          // Subtotals for (B) Non-Teaching
          const sumB = activeNonTeachingRows.reduce((acc, r) => ({
            os: acc.os + (r.os || 0),
            clustered: acc.clustered + (r.clustered || 0),
            borrowed: acc.borrowed + (r.borrowed || 0),
            reassigned: acc.reassigned + (r.reassigned || 0)
          }), { os: 0, clustered: 0, borrowed: 0, reassigned: 0 });

          // Subtotals for (C) Other
          const sumC = otherFundingRows.reduce((acc, r) => ({
            teaching: acc.teaching + (r.teaching || 0),
            nonTeaching: acc.nonTeaching + (r.nonTeaching || 0)
          }), { teaching: 0, nonTeaching: 0 });
          const totalC = sumC.teaching + sumC.nonTeaching;

          // Official DepEd Math:
          const totalSchoolPlantillaTeaching = sumA.os + sumA.clustered + sumA.reassigned;
          const totalSchoolPlantillaNonTeaching = sumB.os + sumB.clustered + sumB.reassigned;
          const totalSchoolPlantilla = totalSchoolPlantillaTeaching + totalSchoolPlantillaNonTeaching;

          const totalWarmBodiesTeaching = sumA.os + sumA.clustered + sumA.borrowed;
          const totalWarmBodiesNonTeaching = sumB.os + sumB.clustered + sumB.borrowed;
          const totalWarmBodies = totalWarmBodiesTeaching + totalWarmBodiesNonTeaching + totalC;

          return (
            <div style={{ marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', border: '1.5px solid #000' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', textAlign: 'center', fontWeight: '800' }}>
                    <th colSpan="5" style={{ border: '1px solid #000', padding: '5px', width: '37%' }}>
                      (A) Nationally Funded Teaching & Related-Teaching Items
                    </th>
                    <th colSpan="5" style={{ border: '1px solid #000', padding: '5px', width: '37%' }}>
                      (B) Nationally Funded Non-Teaching Items
                    </th>
                    <th colSpan="5" style={{ border: '1px solid #000', padding: '5px', width: '26%' }}>
                      (C) Other Appointments and Funding Source
                    </th>
                  </tr>
                  <tr style={{ background: '#F8FAFC', fontSize: '8.5px', textAlign: 'center', fontWeight: '700' }}>
                    <th style={{ border: '1px solid #000', padding: '4px', width: '17%' }}>Title of Plantilla Position</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Own Station</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Clustered</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Borrowed</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Reassigned</th>

                    <th style={{ border: '1px solid #000', padding: '4px', width: '17%' }}>Title of Plantilla Position</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Own Station</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Clustered</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Borrowed</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '5%' }}>Reassigned</th>

                    <th style={{ border: '1px solid #000', padding: '4px', width: '10%' }}>Title of Position</th>
                    <th style={{ border: '1px solid #000', padding: '4px', width: '8%' }}>Nature of Appointment</th>
                    <th style={{ border: '1px solid #000', padding: '4px', width: '8%' }}>Other Fund Source</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '4%' }}>Teaching</th>
                    <th style={{ border: '1px solid #000', padding: '3px', width: '4%' }}>Non-Teaching</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxRows }).map((_, rIdx) => {
                    const tItem = activeTeachingRows[rIdx];
                    const ntItem = activeNonTeachingRows[rIdx];
                    const otherItem = otherFundingRows[rIdx];

                    return (
                      <tr key={rIdx} style={{ textAlign: 'left', height: '20px' }}>
                        {/* Section A */}
                        <td style={{ border: '1px solid #000', padding: '3px 5px', fontWeight: '600' }}>
                          {tItem ? tItem.title : ''}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: tItem?.os ? '700' : 'normal' }}>
                          {tItem?.os ? tItem.os : (tItem ? '-' : '')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: tItem?.clustered ? '700' : 'normal' }}>
                          {tItem?.clustered ? tItem.clustered : (tItem ? '-' : '')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: tItem?.borrowed ? '700' : 'normal' }}>
                          {tItem?.borrowed ? tItem.borrowed : (tItem ? '-' : '')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: tItem?.reassigned ? '700' : 'normal' }}>
                          {tItem?.reassigned ? tItem.reassigned : (tItem ? '-' : '')}
                        </td>

                        {/* Section B */}
                        <td style={{ border: '1px solid #000', padding: '3px 5px', fontWeight: '600' }}>
                          {ntItem ? ntItem.title : ''}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: ntItem?.os ? '700' : 'normal' }}>
                          {ntItem?.os ? ntItem.os : (ntItem ? '-' : '')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: ntItem?.clustered ? '700' : 'normal' }}>
                          {ntItem?.clustered ? ntItem.clustered : (ntItem ? '-' : '')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: ntItem?.borrowed ? '700' : 'normal' }}>
                          {ntItem?.borrowed ? ntItem.borrowed : (ntItem ? '-' : '')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: ntItem?.reassigned ? '700' : 'normal' }}>
                          {ntItem?.reassigned ? ntItem.reassigned : (ntItem ? '-' : '')}
                        </td>

                        {/* Section C */}
                        <td style={{ border: '1px solid #000', padding: '3px 5px', fontWeight: '600' }}>
                          {otherItem ? otherItem.title : ''}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: '9px' }}>
                          {otherItem ? otherItem.appointment : ''}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 5px', fontWeight: otherItem ? '700' : 'normal' }}>
                          {otherItem ? otherItem.fundSource : ''}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: otherItem?.teaching ? '700' : 'normal' }}>
                          {otherItem?.teaching ? otherItem.teaching : (otherItem ? '-' : '')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '3px 2px', textAlign: 'center', fontWeight: otherItem?.nonTeaching ? '700' : 'normal' }}>
                          {otherItem?.nonTeaching ? otherItem.nonTeaching : (otherItem ? '-' : '')}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Subtotal Row */}
                  <tr style={{ fontWeight: '800', background: '#F8FAFC' }}>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textTransform: 'uppercase' }}>Total</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumA.os}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumA.clustered}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumA.borrowed}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumA.reassigned}</td>

                    <td style={{ border: '1px solid #000', padding: '4px 6px', textTransform: 'uppercase' }}>Total</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumB.os}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumB.clustered}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumB.borrowed}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumB.reassigned}</td>

                    <td colSpan="3" style={{ border: '1px solid #000', padding: '4px 6px', textTransform: 'uppercase', textAlign: 'right' }}>Total</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumC.teaching}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 2px', textAlign: 'center' }}>{sumC.nonTeaching}</td>
                  </tr>

                  {/* Total School Plantilla Items */}
                  <tr style={{ fontWeight: '800', background: '#F1F5F9' }}>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Total School Plantilla Items</td>
                    <td colSpan="4" style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                      {totalSchoolPlantillaTeaching} <span style={{ fontSize: '8.5px', fontWeight: 'normal' }}>(OS + Clustered + Reassigned)</span>
                    </td>
                    <td colSpan="5" style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                      {totalSchoolPlantillaNonTeaching} <span style={{ fontSize: '8.5px', fontWeight: 'normal' }}>(OS + Clustered + Reassigned)</span>
                    </td>
                    <td colSpan="5" style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', background: '#E2E8F0' }}>
                      Total Plantilla: <strong>{totalSchoolPlantilla}</strong>
                    </td>
                  </tr>

                  {/* Total Warm Bodies */}
                  <tr style={{ fontWeight: '800', background: '#E0F2FE' }}>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Total Warm Bodies <span style={{ fontSize: '8.5px', fontWeight: 'normal' }}>(OS, Clustered, B)</span></td>
                    <td colSpan="4" style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                      {totalWarmBodiesTeaching} <span style={{ fontSize: '8.5px', fontWeight: 'normal' }}>(Teaching)</span>
                    </td>
                    <td colSpan="5" style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                      {totalWarmBodiesNonTeaching} <span style={{ fontSize: '8.5px', fontWeight: 'normal' }}>(Non-Teaching)</span>
                    </td>
                    <td colSpan="5" style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                      Total Warm Bodies: <strong>{totalWarmBodies}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Notes Legend */}
              <div style={{
                marginTop: '6px',
                padding: '6px 10px',
                border: '1px solid #000',
                fontSize: '8.5px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px 12px'
              }}>
                <div><strong>Own Station:</strong> Item and personnel are in the same school.</div>
                <div><strong>Clustered:</strong> Personnel serves in two or more schools (counted under Total Plantilla Items).</div>
                <div><strong>Reassigned:</strong> Item is in the school; personnel serves in another school.</div>
                <div><strong>Borrowed:</strong> Personnel serves in the school; item is in another school.</div>
              </div>
            </div>
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
            {teachingList.map((p, pIdx) => {
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

              const allWorkloads = p.workloadRows || [];
              const termScopedWorkloads = allWorkloads.filter(w => (w.term || '1st') === activePrintTerm);
              const workloads = termScopedWorkloads.length > 0 ? termScopedWorkloads : [
                { subject: p.type === 'non-teaching' ? 'ADMINISTRATIVE' : `NO WORKLOAD (${activePrintTerm === '1st' ? '1st Term' : activePrintTerm === '2nd' ? '2nd Term' : '3rd Term'})`, gradeLevel: p.type === 'non-teaching' ? 'NG' : '4', sectionName: '', days: [], startTime: '', endTime: '', isEmptyRow: true }
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
