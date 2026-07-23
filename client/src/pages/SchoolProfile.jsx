import React from 'react';
import { useApp } from '../context/AppContext';

const OFFERING_METADATA = {
  'Elementary': { title: 'Elementary', subtitle: 'Kinder to Grade 6', icon: '🏫', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  'JHS': { title: 'Junior High School', subtitle: 'Grade 7 to Grade 10', icon: '📖', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  'SHS': { title: 'Senior High School', subtitle: 'Grade 11 to Grade 12', icon: '🎓', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' }
};

export default function SchoolProfile() {
  const { schoolInfo } = useApp();
  const currentOfferings = Array.isArray(schoolInfo.curricularOffering) ? schoolInfo.curricularOffering : [];

  return (
    <section id="school" className="view grid" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <article className="card" style={{ border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)' }}>
        
        {/* Sleek Header Banner */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', padding: '32px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '28px' }}>🏫</span>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', letterSpacing: '-0.02em', color: '#f8fafc' }}>School Profile Profile & Registry</h2>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', maxWidth: '600px', lineHeight: '1.5' }}>
              Official administrative details retrieved directly from the **Unit 1 Schools Identity Registry**. These fields are read-only in the ESF7 Personnel Portal.
            </p>
          </div>
          <div style={{ background: '#10b981', color: 'white', padding: '8px 16px', borderRadius: '30px', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>🛡️</span> Official Registry Match
          </div>
        </div>

        <div style={{ padding: '32px', background: '#ffffff' }}>
          {/* Identity Grid Section */}
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>School ID</label>
              <span style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>{schoolInfo.schoolId || '999163'}</span>
            </div>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>School Name</label>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{schoolInfo.schoolName || 'Test School'}</span>
            </div>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Region</label>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#334155' }}>{schoolInfo.region || 'Region IV-A'}</span>
            </div>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Division</label>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#334155' }}>{schoolInfo.division || 'Sample Division'}</span>
            </div>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>District</label>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#334155' }}>{schoolInfo.district || 'Sample District'}</span>
            </div>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>School Year</label>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#2563eb' }}>{schoolInfo.schoolYear || '2026-2027'}</span>
            </div>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Number of Shifts</label>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#334155' }}>{schoolInfo.numberOfShifts || '1'} Shift</span>
            </div>
          </div>

          {/* Curricular Offerings Section */}
          <div style={{ borderTop: '1.5px solid #f1f5f9', paddingTop: '32px' }}>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.01em' }}>Curricular Offerings Portfolio</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Below are the official programs registered for this school. Active programs automatically unlock their corresponding grade levels and subjects in your Workload builder.
              </p>
            </div>

            {/* Visual Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {Object.entries(OFFERING_METADATA).map(([key, meta]) => {
                const isActive = currentOfferings.includes(key);
                return (
                  <div
                    key={key}
                    style={{
                      padding: '20px',
                      borderRadius: '16px',
                      background: isActive ? meta.bg : '#ffffff',
                      border: isActive ? `1.5px solid ${meta.border}` : '1.5px solid #cbd5e1',
                      boxShadow: isActive ? '0 4px 12px -2px rgba(0,0,0,0.02)' : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: isActive ? 1 : 0.5,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Decorative Corner Glow */}
                    {isActive && (
                      <div style={{
                        position: 'absolute',
                        top: '-20px',
                        right: '-20px',
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: meta.color,
                        filter: 'blur(30px)',
                        opacity: 0.3
                      }} />
                    )}

                    <div style={{
                      fontSize: '26px',
                      background: isActive ? '#ffffff' : '#f1f5f9',
                      padding: '10px',
                      borderRadius: '12px',
                      boxShadow: isActive ? '0 4px 8px -2px rgba(0,0,0,0.05)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {meta.icon}
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: isActive ? '#0f172a' : '#64748b' }}>{meta.title}</h4>
                        {isActive && (
                          <span style={{ fontSize: '10px', background: meta.color, color: 'white', padding: '1px 6px', borderRadius: '20px', fontWeight: '700' }}>Active</span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: isActive ? '#475569' : '#94a3b8' }}>{meta.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
