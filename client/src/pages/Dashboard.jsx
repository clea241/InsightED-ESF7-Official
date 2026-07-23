import React from 'react';
import { useApp } from '../context/AppContext';
import '../premium-dashboard.css';

export default function Dashboard() {
  const { personnel, getValidationIssues } = useApp();

  const ownedPersonnel = personnel.filter(p => !p.isShared);
  
  const totalCount = ownedPersonnel.length;
  const teachingCount = ownedPersonnel.filter(p => p.type === 'teaching').length;
  const relatedCount = ownedPersonnel.filter(p => p.type === 'teaching-related').length;
  const nonTeachingCount = ownedPersonnel.filter(p => p.type === 'non-teaching').length;

  const issues = getValidationIssues();
  
  // Calculate compliance percentage
  const totalChecks = 4; // We run 4 rule areas
  let passedChecks = 0;
  
  const rules = [
    {
      id: 'tin',
      name: 'TIN Identity Verification',
      desc: 'All personnel must have a valid TIN or explicitly confirm "No TIN available".',
      passed: !ownedPersonnel.some(p => !p.tin && !p.noTin)
    },
    {
      id: 'birthdate',
      name: 'Demographics & Birthdate Records',
      desc: 'All personnel must have birthdates recorded for retirement and service tracking.',
      passed: !ownedPersonnel.some(p => !p.birthdate)
    },
    {
      id: 'workload',
      name: 'Teaching Workload Assignments',
      desc: 'All active teaching personnel must have classroom teaching hours assigned.',
      passed: !ownedPersonnel.some(p => p.type === 'teaching' && (p.teachingLoadMinutes || 0) === 0)
    },
    {
      id: 'email',
      name: 'Official Communication Domain',
      desc: 'All personnel must be assigned an official @deped.gov.ph email domain.',
      passed: !ownedPersonnel.some(p => !p.depedEmail || !p.depedEmail.endsWith('@deped.gov.ph'))
    }
  ];

  rules.forEach(r => { if (r.passed) passedChecks++; });
  const compliancePct = Math.round((passedChecks / totalChecks) * 100);

  // Compute workload histogram bins (average daily hours)
  const dailyLoads = ownedPersonnel
    .filter(p => p.type === 'teaching')
    .map(p => (p.teachingLoadMinutes || 0) / 5 / 60);

  const bins = [
    { label: '0–2 hrs', count: dailyLoads.filter(h => h >= 0 && h < 2).length },
    { label: '2–4 hrs', count: dailyLoads.filter(h => h >= 2 && h < 4).length },
    { label: '4–6 hrs', count: dailyLoads.filter(h => h >= 4 && h < 6).length },
    { label: '6+ hrs', count: dailyLoads.filter(h => h >= 6).length }
  ];
  const maxBinCount = Math.max(1, ...bins.map(b => b.count));
  const avgDailyLoad = dailyLoads.length ? (dailyLoads.reduce((sum, h) => sum + h, 0) / dailyLoads.length).toFixed(1) : 0;

  // Donut Chart logic matching prototype
  const donutColors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"];
  let cumulativePct = 0;
  const segments = bins.map((bin, index) => {
    const start = cumulativePct;
    const share = dailyLoads.length ? (bin.count / dailyLoads.length) * 100 : 0;
    cumulativePct += share;
    return `${donutColors[index % donutColors.length]} ${start}% ${cumulativePct}%`;
  });
  const donutStyle = {
    background: dailyLoads.length 
      ? `conic-gradient(${segments.join(', ')})`
      : 'conic-gradient(#E2E8F0 0% 100%)'
  };

  const maxPosCount = Math.max(1, teachingCount, relatedCount, nonTeachingCount);

  return (
    <section id="dashboard" className="view premium-dashboard">
      <div className="premium-kpis">
        <div className="premium-kpi-card">
          <div className="premium-kpi-title">👥 Total Personnel</div>
          <div className="premium-kpi-value">{totalCount}</div>
        </div>
        <div className="premium-kpi-card">
          <div className="premium-kpi-title">👨‍🏫 Teaching</div>
          <div className="premium-kpi-value">{teachingCount}</div>
        </div>
        <div className="premium-kpi-card">
          <div className="premium-kpi-title">📚 Related Teaching</div>
          <div className="premium-kpi-value">{relatedCount}</div>
        </div>
        <div className="premium-kpi-card">
          <div className="premium-kpi-title">💼 Non-Teaching</div>
          <div className="premium-kpi-value">{nonTeachingCount}</div>
        </div>
      </div>

      <div className="premium-dashboard-grid">
        {/* Card 1: Position Distribution */}
        <div className="premium-card">
          <div className="premium-card-header">
            <h2 className="premium-card-title">Position Distribution</h2>
            <p className="premium-card-subtitle">Overview of headcount by position categories.</p>
          </div>
          <div>
            <div className="premium-position-row">
              <div className="premium-position-label">Teaching</div>
              <div className="premium-progress-track">
                <div className="premium-progress-bar premium-progress-teaching" style={{ width: `${(teachingCount / maxPosCount) * 100}%` }}></div>
              </div>
              <div className="premium-position-value">{teachingCount}</div>
            </div>
            <div className="premium-position-row">
              <div className="premium-position-label">Related Teaching</div>
              <div className="premium-progress-track">
                <div className="premium-progress-bar premium-progress-related" style={{ width: `${(relatedCount / maxPosCount) * 100}%` }}></div>
              </div>
              <div className="premium-position-value">{relatedCount}</div>
            </div>
            <div className="premium-position-row">
              <div className="premium-position-label">Non-Teaching</div>
              <div className="premium-progress-track">
                <div className="premium-progress-bar premium-progress-nonteaching" style={{ width: `${(nonTeachingCount / maxPosCount) * 100}%` }}></div>
              </div>
              <div className="premium-position-value">{nonTeachingCount}</div>
            </div>
          </div>
        </div>

        {/* Card 2: Workload Histogram */}
        <div className="premium-card">
          <div className="premium-card-header">
            <h2 className="premium-card-title">Daily Teaching Load</h2>
            <p className="premium-card-subtitle">Average daily teaching hours across all teaching personnel.</p>
          </div>
          <div className="premium-histogram-container">
            {bins.map((bin, i) => (
              <div key={i} className="premium-histogram-bar-wrap">
                <div className="premium-histogram-value">{bin.count}</div>
                <div className="premium-histogram-bar" style={{ height: `${(bin.count / maxBinCount) * 100}%` }}></div>
                <div className="premium-histogram-label">{bin.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
             <span style={{ fontSize: '12px', fontWeight: 'bold', background: '#DBEAFE', color: '#1D4ED8', padding: '4px 8px', borderRadius: '6px' }}>{teachingCount} teachers</span>
             <span style={{ fontSize: '12px', fontWeight: 'bold', background: '#D1FAE5', color: '#059669', padding: '4px 8px', borderRadius: '6px' }}>{avgDailyLoad}h avg daily</span>
          </div>
        </div>

        {/* Card 3: Donut Chart Legend */}
        <div className="premium-card">
          <div className="premium-card-header">
            <h2 className="premium-card-title">Load Distribution</h2>
            <p className="premium-card-subtitle">Distribution of teaching hours.</p>
          </div>
          <div className="premium-donut-container">
            <div className="premium-donut" style={donutStyle}></div>
            <div className="premium-donut-legend">
              {bins.map((bin, idx) => {
                const share = dailyLoads.length ? ((bin.count / dailyLoads.length) * 100).toFixed(1) : 0;
                return (
                  <div key={idx} className="premium-donut-legend-item">
                    <span className="premium-donut-swatch" style={{ background: donutColors[idx] }}></span>
                    <span>{bin.label}: {bin.count} ({share}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card 4: Validation Checklist (Spans full width if we wanted, but we'll stick to grid) */}
        <div className="premium-card" style={{ gridColumn: '1 / -1' }}>
          <div className="premium-compliance-header">
            <div>
              <h2 className="premium-card-title">eSF7 Compliance Audit</h2>
              <p className="premium-card-subtitle">Real-time school-head quality auditing checks for official submission.</p>
            </div>
            <div className="premium-compliance-score">
              <span>Compliance</span>
              {compliancePct}%
            </div>
          </div>
          <div className="premium-checklist">
            {rules.map((rule) => (
              <div key={rule.id} className={`premium-checklist-item ${rule.passed ? 'passed' : 'pending'}`}>
                <div className={`premium-check-icon ${rule.passed ? 'passed' : 'pending'}`}>
                  {rule.passed ? '✓' : '!'}
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '15px', color: 'var(--navy)', marginBottom: '4px' }}>{rule.name}</strong>
                  <span style={{ fontSize: '13px', color: 'var(--slate-500, #64748B)' }}>{rule.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
