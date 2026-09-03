import React, { useState } from 'react';
import { useApp, checkPersonnelWorkloadErrors } from '../context/AppContext';
import PortalHeader from '../components/PortalHeader';
import ESF7UploadModal from '../components/ESF7UploadModal';
import { FiCheckCircle, FiLock, FiPlay, FiMap, FiUploadCloud } from 'react-icons/fi';

export default function NodeMap() {
  const { personnel, classSections, schoolInfo, setActiveView, isNodeUnlocked, isNodeCompleted, bypassNodeLocks, setBypassNodeLocks, incomingRequests } = useApp();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const schoolName = schoolInfo?.schoolName || 'DepEd Integrated School';

  const NODE_SECTIONS = [
    {
      key: 'esf7',
      title: 'ESF7 Core Registry & Operations',
      subtitle: 'Primary school metadata, staffing roster, class sections, assignments, and workload schedules',
      nodes: [
        {
          id: 'school',
          nodeNumber: '01',
          title: 'School Profile',
          subtitle: 'School identity, shift configuration & offerings',
          icon: '🏛',
          view: 'school',
          summary: schoolInfo?.schoolId ? `School ID: ${schoolInfo.schoolId}` : 'Configure school identity'
        },
        {
          id: 'roster',
          nodeNumber: '02',
          title: 'Personnel Roster',
          subtitle: 'Master personnel list & appointment status',
          icon: '☷',
          view: 'roster',
          summary: `${personnel.length} Registered Personnel`
        },
        {
          id: 'profile',
          nodeNumber: '03',
          title: 'Personnel Profiling',
          subtitle: 'Educational qualifications, LET & eligibility',
          icon: '✎',
          view: 'profile',
          summary: `${personnel.filter(p => p.degreeMajor || p.major || p.collegeDegree).length} Profiles Configured`
        },
        {
          id: 'designation',
          nodeNumber: '04',
          title: 'Designations & Duties',
          subtitle: 'Ancillary roles, grade chairpersons & SDS approvals',
          icon: '⚜',
          view: 'designation',
          summary: `${personnel.filter(p => p.designation && p.designation !== 'N/A').length} Assigned Roles`
        },
        {
          id: 'classes',
          nodeNumber: '05',
          title: 'Organized Classes',
          subtitle: 'Section setup, advisers & learner counts',
          icon: '▦',
          view: 'classes',
          summary: `${classSections.length} Class Sections`
        },
        {
          id: 'workload',
          nodeNumber: '06',
          title: 'Workload & Timetable',
          subtitle: 'Teaching schedules, period durations & timetable',
          icon: '◷',
          view: 'workload',
          summary: `${personnel.reduce((acc, p) => acc + (p.workloadRows?.length || 0), 0)} Workload Slots`
        }
      ]
    },
    {
      key: 'portals',
      title: 'Teacher Self-Service & Transfer Portals',
      subtitle: 'Teacher QR passcode generation, self-profiling posters, and incoming/outgoing inter-school requests',
      nodes: [
        {
          id: 'room-qr',
          nodeNumber: '07',
          title: 'Room QR Portal',
          subtitle: 'Teacher passcode identity & self-profiling QR scanner',
          icon: '⛶',
          view: 'room-qr',
          summary: 'QR Posters & Teacher Self-Profiling'
        },
        {
          id: 'requests',
          nodeNumber: '08',
          title: 'Request Center',
          subtitle: 'Incoming and outgoing personnel transfer requests',
          icon: '✉',
          view: 'requests',
          summary: `${incomingRequests?.length || 0} Pending Inter-School Requests`
        }
      ]
    },
    {
      key: 'overload',
      title: 'Teaching Overload Pay',
      subtitle: 'Monthly teaching overload computations, 3-term DepEd calendar exclusions, and payment claims',
      nodes: [
        {
          id: 'overload',
          nodeNumber: '09',
          title: 'Teaching Overload Center',
          subtitle: 'Overload minutes tracking, calendar terms & monthly pay calculations',
          icon: '⇄',
          view: 'overload',
          summary: 'Monthly Overload Computation Engine'
        }
      ]
    },
    {
      key: 'others',
      title: 'Allowances & Compensation',
      subtitle: 'Hardship, PERA, medical, uniform, and supplies allowances tracking per teacher',
      nodes: [
        {
          id: 'allowances',
          nodeNumber: '10',
          title: 'Allowances & Incentives',
          subtitle: 'Financial incentives, medical allowance & uniform indicators',
          icon: '₱',
          view: 'allowances',
          summary: 'Teacher Allowance & Incentive Matrix'
        }
      ]
    },
    {
      key: 'validation',
      title: 'Validation & Certification',
      subtitle: 'Official DepEd eSF7 record validation rules, error auditing, printable reports, and digital certification',
      nodes: [
        {
          id: 'validation',
          nodeNumber: '11',
          title: 'Validation Center',
          subtitle: 'Validation rules, error auditing & quality flags',
          icon: '⛨',
          view: 'validation',
          summary: 'Error & Warning Quality Checks & Digital Certification'
        }
      ]
    }
  ];

  const allNodes = NODE_SECTIONS.flatMap(sec => sec.nodes);
  const completedCount = allNodes.filter(n => isNodeCompleted(n.id)).length;

  return (
    <section id="node-map-page" className="view" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* TYPOGRAPHIC PORTAL HEADER SYSTEM */}
      <PortalHeader
        departmentText="DEPARTMENT OF EDUCATION"
        bureauText={`PROGRESSIVE JOURNEY ROADMAP • ${schoolName}`}
        title="eSF7 School Head Journey Map"
        description="Access, audit, and complete personnel registries sequentially across all journey nodes in a unified visual system matching sidebar sections."
        onBack={() => setActiveView('dashboard')}
        backText="Back to Dashboard"
        actionButton={
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            
            {/* MASSIVE DEV BYPASS TOGGLE FOR TESTING ONLY */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 14px',
              borderRadius: '999px',
              background: bypassNodeLocks 
                ? 'linear-gradient(135deg, rgba(254, 243, 199, 0.95) 0%, rgba(253, 230, 138, 0.9) 100%)' 
                : 'rgba(241, 245, 249, 0.85)',
              border: bypassNodeLocks ? '2px solid #F59E0B' : '1.5px solid #CBD5E1',
              boxShadow: bypassNodeLocks ? '0 4px 14px rgba(245, 158, 11, 0.35)' : 'none',
              transition: 'all 0.25s ease'
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: '900',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: bypassNodeLocks ? '#92400E' : '#64748B'
              }}>
                {bypassNodeLocks ? '⚡ DEV: LOCKS BYPASSED' : '🔒 DEV: STRICT LOCKS'}
              </span>

              <button
                type="button"
                onClick={() => setBypassNodeLocks(!bypassNodeLocks)}
                style={{
                  width: '48px',
                  height: '26px',
                  borderRadius: '999px',
                  background: bypassNodeLocks ? '#F59E0B' : '#94A3B8',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  padding: '2px',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)'
                }}
                title="Toggle for testing purposes only to bypass node locks"
              >
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
                  transform: bypassNodeLocks ? 'translateX(22px)' : 'translateX(0px)',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px'
                }}>
                  {bypassNodeLocks ? '🔓' : '🔒'}
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '900',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#FFFFFF',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(37, 99, 235, 0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.35)';
              }}
            >
              <FiUploadCloud style={{ fontSize: '16px' }} />
              <span>Upload eSF7 (.xlsb)</span>
            </button>

            <div style={{
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '12px',
              padding: '7px 14px',
              textAlign: 'right'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress Status</div>
              <div style={{ fontSize: '13px', fontWeight: '900', color: '#059669' }}>{completedCount} of {allNodes.length} Steps Completed</div>
            </div>
          </div>
        }
      />

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <ESF7UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} />
      )}

      {/* SECTIONED NODE PIPELINE GRID WITH DIVIDERS */}
      {NODE_SECTIONS.map((sec, secIdx) => (
        <div key={sec.key} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* VISUAL SECTION HEADER DIVIDER */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginTop: secIdx > 0 ? '16px' : '4px',
            paddingBottom: '10px',
            borderBottom: '2px solid #E2E8F0'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              color: '#FFFFFF',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '900',
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}>
              SECTION 0{secIdx + 1}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.01em' }}>
                {sec.title}
              </h2>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '500', marginTop: '2px' }}>
                {sec.subtitle}
              </span>
            </div>
          </div>

          {/* NODE CARDS GRID FOR THIS SECTION */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
            {sec.nodes.map(node => {
              const isUnlocked = isNodeUnlocked(node.id);
              const isCompleted = isNodeCompleted(node.id);
              const isActive = isUnlocked && !isCompleted;

              let cardBg = 'rgba(255, 255, 255, 0.85)';
              let borderColor = '#E2E8F0';
              let boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)';
              let nodeNumColor = '#64748B';
              let titleColor = '#0F172A';
              let subtitleColor = '#475569';
              let iconBg = '#F1F5F9';
              let iconColor = '#475569';
              let iconBorder = '1px solid #E2E8F0';
              let summaryBg = '#F8FAFC';
              let summaryColor = '#334155';
              let summaryBorder = '1px solid #E2E8F0';
              let badgeBg = '#F1F5F9';
              let badgeColor = '#475569';
              let badgeBorder = '1px solid #CBD5E1';
              let badgeText = '🔒 Locked';

              const isWorkloadNode = node.id === 'workload';
              const workloadHasIssues = isWorkloadNode && (personnel || []).some(p => checkPersonnelWorkloadErrors(p, personnel, classSections));

              if (isCompleted) {
                cardBg = 'linear-gradient(135deg, rgba(236, 253, 245, 0.95) 0%, rgba(209, 250, 229, 0.85) 100%)';
                borderColor = '#10B981';
                boxShadow = '0 12px 28px -6px rgba(16, 185, 129, 0.2), 0 4px 10px rgba(0, 0, 0, 0.03)';
                nodeNumColor = '#065F46';
                titleColor = '#064E3B';
                subtitleColor = '#166534';
                iconBg = '#D1FAE5';
                iconColor = '#047857';
                iconBorder = '1px solid #A7F3D0';
                summaryBg = 'rgba(255, 255, 255, 0.9)';
                summaryColor = '#065F46';
                summaryBorder = '1px solid #6EE7B7';
                badgeBg = '#059669';
                badgeColor = '#FFFFFF';
                badgeBorder = 'none';
                badgeText = '✓ Completed';
              } else if (isWorkloadNode && workloadHasIssues) {
                cardBg = 'linear-gradient(135deg, rgba(254, 242, 242, 0.95) 0%, rgba(254, 226, 226, 0.85) 100%)';
                borderColor = '#EF4444';
                boxShadow = '0 14px 30px -6px rgba(239, 68, 68, 0.25), 0 4px 10px rgba(0, 0, 0, 0.03)';
                nodeNumColor = '#B91C1C';
                titleColor = '#7F1D1D';
                subtitleColor = '#991B1B';
                iconBg = '#FEE2E2';
                iconColor = '#DC2626';
                iconBorder = '1px solid #FCA5A5';
                summaryBg = 'rgba(255, 255, 255, 0.9)';
                summaryColor = '#991B1B';
                summaryBorder = '1px solid #FCA5A5';
                badgeBg = '#DC2626';
                badgeColor = '#FFFFFF';
                badgeBorder = 'none';
                badgeText = '⚠️ Issues Found';
              } else if (isActive) {
                cardBg = 'linear-gradient(135deg, rgba(239, 246, 255, 0.95) 0%, rgba(219, 234, 254, 0.85) 100%)';
                borderColor = '#2563EB';
                boxShadow = '0 14px 30px -6px rgba(37, 99, 235, 0.25), 0 4px 10px rgba(0, 0, 0, 0.03)';
                nodeNumColor = '#1E40AF';
                titleColor = '#0F172A';
                subtitleColor = '#1E3A8A';
                iconBg = '#DBEAFE';
                iconColor = '#1D4ED8';
                iconBorder = '1px solid #BFDBFE';
                summaryBg = 'rgba(255, 255, 255, 0.9)';
                summaryColor = '#1E3A8A';
                summaryBorder = '1px solid #93C5FD';
                badgeBg = '#2563EB';
                badgeColor = '#FFFFFF';
                badgeBorder = 'none';
                badgeText = '➔ Active Step';
              }

              return (
                <div
                  key={node.id}
                  style={{
                    background: cardBg,
                    backdropFilter: 'blur(16px)',
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: '16px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: boxShadow,
                    transition: 'all 0.25s ease',
                    position: 'relative'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '900', color: nodeNumColor, letterSpacing: '0.08em' }}>
                        NODE {node.nodeNumber}
                      </span>
                      <span style={{
                        background: badgeBg,
                        color: badgeColor,
                        border: badgeBorder,
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: '800'
                      }}>
                        {badgeText}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '10px' }}>
                      <div style={{
                        fontSize: '22px',
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: iconBg,
                        color: iconColor,
                        border: iconBorder,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                      }}>
                        {node.icon}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: titleColor, letterSpacing: '-0.01em' }}>
                          {node.title}
                        </h3>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: subtitleColor, lineHeight: '1.4', fontWeight: '500' }}>
                          {node.subtitle}
                        </p>
                      </div>
                    </div>

                    <div style={{
                      fontSize: '11.5px',
                      fontWeight: '700',
                      color: summaryColor,
                      background: summaryBg,
                      border: summaryBorder,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontFamily: 'monospace'
                    }}>
                      {node.summary}
                    </div>
                  </div>

                  {isUnlocked ? (
                    <button
                      type="button"
                      onClick={() => setActiveView(node.view)}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: isCompleted ? '1.5px solid #059669' : 'none',
                        background: isCompleted
                          ? '#FFFFFF'
                          : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                        color: isCompleted ? '#047857' : '#FFFFFF',
                        fontSize: '13px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: isCompleted ? '0 2px 6px rgba(0,0,0,0.05)' : '0 4px 12px rgba(37, 99, 235, 0.35)',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      {isCompleted ? 'Review Node ➔' : 'Start / Continue Node ➔'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        background: '#F8FAFC',
                        color: '#475569',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        cursor: 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      🔒 Locked (Complete Preceding Step)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
