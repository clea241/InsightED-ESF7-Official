import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const ALL_MONTHS = [
  { id: '2026-06', label: 'June 2026' },
  { id: '2026-07', label: 'July 2026' },
  { id: '2026-08', label: 'August 2026' },
  { id: '2026-09', label: 'September 2026' },
  { id: '2026-10', label: 'October 2026' },
  { id: '2026-11', label: 'November 2026' },
  { id: '2026-12', label: 'December 2026' },
  { id: '2027-01', label: 'January 2027' },
  { id: '2027-02', label: 'February 2027' },
  { id: '2027-03', label: 'March 2027' },
  { id: '2027-04', label: 'April 2027' },
  { id: '2027-05', label: 'May 2027' }
];

export default function OverloadPayModal({ isOpen, onClose, schoolId = '123456', schoolYear = 'SY 2026-2027' }) {
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState(ALL_MONTHS.map(m => m.id));
  const [generating, setGenerating] = useState(false);
  const [downloadResult, setDownloadResult] = useState(null);
  const [error, setError] = useState(null);
  const [editingTerms, setEditingTerms] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetchCalendarData();
  }, [isOpen, schoolId, schoolYear]);

  const fetchCalendarData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCalendarTerms(schoolId, schoolYear);
      if (res.success) {
        setTerms(res.terms || []);
        setMonthlyBreakdown(res.monthlyBreakdown || []);
      } else {
        setError(res.error || 'Failed to load calendar terms');
      }
    } catch (err) {
      console.error(err);
      setError('Network error fetching school calendar schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleMonthToggle = (mId) => {
    if (selectedMonths.includes(mId)) {
      setSelectedMonths(selectedMonths.filter(id => id !== mId));
    } else {
      setSelectedMonths([...selectedMonths, mId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedMonths.length === ALL_MONTHS.length) {
      setSelectedMonths([]);
    } else {
      setSelectedMonths(ALL_MONTHS.map(m => m.id));
    }
  };

  const handleTermChange = (idx, field, value) => {
    const updated = [...terms];
    updated[idx] = { ...updated[idx], [field]: value };
    setTerms(updated);
  };

  const handleSaveTerms = async () => {
    setLoading(true);
    try {
      const res = await api.saveCalendarTerms(schoolId, schoolYear, terms);
      if (res.success) {
        await fetchCalendarData();
        setEditingTerms(false);
      } else {
        alert(res.error || 'Failed to save term updates');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving term updates');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (selectedMonths.length === 0) {
      alert('Please select at least one month for the overload pay report.');
      return;
    }

    setGenerating(true);
    setDownloadResult(null);
    setError(null);

    try {
      const res = await api.generateOverloadPayReport({
        school_id: schoolId,
        school_year: schoolYear,
        months: selectedMonths,
        calendar_overrides: terms
      });

      if (res.success) {
        setDownloadResult(res);
      } else {
        setError(res.error || 'Report generation failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Error generating overload pay report workbook.');
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(to right, #f8fafc, #ffffff)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
              📊 Overload Pay Report Engine (SY 2026-2027)
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              DepEd 3-Term School Calendar Schedule & Effective Teaching Ratio Adjustment
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 0,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: '#64748b'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ display: 'inline-block', width: '30px', height: '30px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: '12px', fontSize: '14px' }}>Loading School Calendar Terms...</p>
            </div>
          ) : (
            <>
              {/* Term Schedule Cards */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#334155' }}>
                    🗓️ SY 2026-2027 Calendar Term Schedule Breakdown
                  </h4>
                  <button
                    onClick={() => setEditingTerms(!editingTerms)}
                    style={{
                      background: editingTerms ? '#fef2f2' : '#f0f9ff',
                      color: editingTerms ? '#dc2626' : '#0284c7',
                      border: `1px solid ${editingTerms ? '#fca5a5' : '#bae6fd'}`,
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {editingTerms ? 'Cancel Editing' : '✏️ Customize Term Boundaries'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {terms.map((t, idx) => {
                    const isTeach = t.is_teaching && t.block_type === 'instructional';
                    const isVacation = t.block_type === 'vacation';
                    const bgColor = isTeach ? '#f0fdf4' : isVacation ? '#fef2f2' : '#fffbe6';
                    const borderColor = isTeach ? '#bbf7d0' : isVacation ? '#fecaca' : '#ffe58f';
                    const badgeColor = isTeach ? '#166534' : isVacation ? '#991b1b' : '#854d0e';

                    return (
                      <div key={idx} style={{
                        background: bgColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '10px',
                        padding: '12px',
                        fontSize: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <strong style={{ color: '#1e293b' }}>{t.term_name}</strong>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '700',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isTeach ? '#dcfce7' : isVacation ? '#fee2e2' : '#fef9c3',
                            color: badgeColor
                          }}>
                            {isTeach ? 'TEACHING' : isVacation ? 'VACATION' : 'END-OF-TERM'}
                          </span>
                        </div>

                        {editingTerms ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                            <label style={{ fontSize: '11px', color: '#64748b' }}>Start Date:</label>
                            <input
                              type="date"
                              value={t.start_date}
                              onChange={(e) => handleTermChange(idx, 'start_date', e.target.value)}
                              style={{ padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                            />
                            <label style={{ fontSize: '11px', color: '#64748b' }}>End Date:</label>
                            <input
                              type="date"
                              value={t.end_date}
                              onChange={(e) => handleTermChange(idx, 'end_date', e.target.value)}
                              style={{ padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' }}
                            />
                          </div>
                        ) : (
                          <p style={{ margin: 0, color: '#475569' }}>
                            📅 {t.start_date} to {t.end_date}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {editingTerms && (
                  <div style={{ marginTop: '12px', textAlign: 'right' }}>
                    <button
                      onClick={handleSaveTerms}
                      style={{
                        background: '#16a34a',
                        color: '#fff',
                        border: 0,
                        borderRadius: '6px',
                        padding: '6px 16px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Save Custom Schedule
                    </button>
                  </div>
                )}
              </div>

              {/* Month Selection & Ratio Breakdown Table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#334155' }}>
                    📈 Monthly Instructional Ratio & Month Toggles
                  </h4>
                  <button
                    onClick={handleSelectAll}
                    style={{
                      background: 'none',
                      border: 0,
                      color: '#2563eb',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    {selectedMonths.length === ALL_MONTHS.length ? 'Deselect All' : 'Select All Months'}
                  </button>
                </div>

                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', color: '#475569' }}>
                        <th style={{ padding: '10px', textAlign: 'center', width: '40px' }}>Include</th>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Month</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Total Weekdays</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Instructional Days</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Vacation / Non-Teaching</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Effective Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_MONTHS.map((mObj) => {
                        const bData = monthlyBreakdown.find(b => b.month === mObj.id) || {
                          totalWeekdays: 0,
                          instructionalDays: 0,
                          nonTeachingDays: 0,
                          ratioPercent: '0%'
                        };

                        const isChecked = selectedMonths.includes(mObj.id);
                        const isZero = bData.instructionalDays === 0;

                        return (
                          <tr key={mObj.id} style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isChecked ? (isZero ? '#fff5f5' : '#ffffff') : '#f8fafc',
                            opacity: isChecked ? 1 : 0.6
                          }}>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleMonthToggle(mObj.id)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: '600', color: '#1e293b' }}>
                              {mObj.label}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', color: '#475569' }}>
                              {bData.totalWeekdays} days
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', color: '#16a34a', fontWeight: '600' }}>
                              {bData.instructionalDays} days
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', color: isZero ? '#dc2626' : '#ea580c' }}>
                              {bData.nonTeachingDays} days
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontWeight: '700',
                                fontSize: '11px',
                                background: isZero ? '#fee2e2' : parseFloat(bData.ratioPercent) < 50 ? '#fef9c3' : '#dcfce7',
                                color: isZero ? '#991b1b' : parseFloat(bData.ratioPercent) < 50 ? '#854d0e' : '#166534'
                              }}>
                                {bData.ratioPercent}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div style={{
                  padding: '12px 16px',
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '13px'
                }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Progress Indicator or Download Ready Result */}
              {generating && (
                <div style={{
                  padding: '16px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1d4ed8', marginBottom: '8px' }}>
                    ⏳ Computing Overload Pay Ratios & Generating Excel Workbook...
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#dbeafe', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '100%', height: '100%', background: '#2563eb', animation: 'progressPulse 1.5s infinite' }} />
                  </div>
                </div>
              )}

              {downloadResult && (
                <div style={{
                  padding: '16px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '10px',
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <strong style={{ color: '#166534', fontSize: '14px' }}>🎉 Overload Pay Report Ready!</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#15803d' }}>
                      Generated {downloadResult.summary?.length || 0} personnel overload pay schedules.
                    </p>
                  </div>
                  <a
                    href={downloadResult.downloadUrl}
                    download={downloadResult.filename}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '8px 18px',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '13px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    📥 Download Excel (.xlsx)
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          justify: 'flex-end',
          gap: '10px',
          background: '#f8fafc',
          borderRadius: '0 0 16px 16px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={generating || loading}
            style={{
              background: generating ? '#94a3b8' : '#2563eb',
              border: 0,
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#ffffff',
              cursor: generating ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
            }}
          >
            {generating ? 'Processing Report...' : '📊 Generate Overload Pay Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
