import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import PortalHeader from '../components/PortalHeader';
import ESF7UploadModal from '../components/ESF7UploadModal';
import { 
  FiCheckCircle, 
  FiLock, 
  FiUnlock, 
  FiPlay, 
  FiMap, 
  FiUploadCloud,
  FiBookOpen,
  FiUsers,
  FiUserCheck,
  FiBookmark,
  FiGrid,
  FiClock,
  FiMaximize,
  FiMail,
  FiRepeat,
  FiDollarSign,
  FiShield,
  FiArrowRight,
  FiCheck
} from 'react-icons/fi';

export default function NodeMap() {
  const { personnel, classSections, schoolInfo, setActiveView, isNodeUnlocked, isNodeCompleted, bypassNodeLocks, setBypassNodeLocks, incomingRequests } = useApp();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const schoolName = schoolInfo?.schoolName || 'DepEd Integrated School';

  const NODE_SECTIONS = [
    {
      key: 'esf7',
      title: 'Core eSF7 Registry & Submission Pipeline',
      subtitle: 'Primary school metadata, staffing roster, class sections, assignments, and workload schedules',
      nodes: [
        {
          id: 'school',
          nodeNumber: '01',
          title: 'School Profile',
          subtitle: 'School identity, shift configuration & offerings',
          Icon: FiBookOpen,
          view: 'school',
          summary: schoolInfo?.schoolId ? `School ID: ${schoolInfo.schoolId}` : 'Configure school identity'
        },
        {
          id: 'roster',
          nodeNumber: '02',
          title: 'Personnel Roster',
          subtitle: 'Master personnel list & appointment status',
          Icon: FiUsers,
          view: 'roster',
          summary: `${personnel.length} Registered Personnel`
        },
        {
          id: 'profile',
          nodeNumber: '03',
          title: 'Personnel Profiling',
          subtitle: 'Educational qualifications, LET & eligibility',
          Icon: FiUserCheck,
          view: 'profile',
          summary: `${personnel.filter(p => p.degreeMajor || p.major || p.collegeDegree).length} Profiles Configured`
        },
        {
          id: 'classes',
          nodeNumber: '04',
          title: 'Organized Classes',
          subtitle: 'Section setup, advisers & learner counts',
          Icon: FiGrid,
          view: 'classes',
          summary: `${classSections.length} Class Sections`
        },
        {
          id: 'designation',
          nodeNumber: '05',
          title: 'Designations & Duties',
          subtitle: 'Ancillary roles, grade chairpersons & SDS approvals',
          Icon: FiBookmark,
          view: 'designation',
          summary: `${personnel.filter(p => p.designation && p.designation !== 'N/A').length} Assigned Roles`
        },
        {
          id: 'workload',
          nodeNumber: '06',
          title: 'Workload & Timetable',
          subtitle: 'Teaching schedules, period durations & timetable',
          Icon: FiClock,
          view: 'workload',
          summary: `${personnel.reduce((acc, p) => acc + (p.workloadRows?.length || 0), 0)} Workload Slots`
        }
      ]
    },
    {
      key: 'administrative',
      title: 'Administrative Tools & Teacher Services',
      subtitle: 'Teacher QR passcode generation, transfer requests, overload pay, allowances, and validation rules',
      nodes: [
        {
          id: 'room-qr',
          nodeNumber: '07',
          title: 'Room QR Portal',
          subtitle: 'Teacher passcode identity & self-profiling QR scanner',
          Icon: FiMaximize,
          view: 'room-qr',
          summary: 'QR Posters & Teacher Self-Profiling'
        },
        {
          id: 'requests',
          nodeNumber: '08',
          title: 'Request Center',
          subtitle: 'Incoming and outgoing personnel transfer requests',
          Icon: FiMail,
          view: 'requests',
          summary: `${incomingRequests?.length || 0} Pending Inter-School Requests`
        },
        {
          id: 'overload',
          nodeNumber: '09',
          title: 'Teaching Overload Center',
          subtitle: 'Overload minutes tracking, calendar terms & monthly pay calculations',
          Icon: FiRepeat,
          view: 'overload',
          summary: 'Monthly Overload Computation Engine'
        },
        {
          id: 'allowances',
          nodeNumber: '10',
          title: 'Allowances & Incentives',
          subtitle: 'Financial incentives, medical allowance & uniform indicators',
          Icon: FiDollarSign,
          view: 'allowances',
          summary: 'Teacher Allowance & Incentive Matrix'
        },
        {
          id: 'validation',
          nodeNumber: '11',
          title: 'Validation Center',
          subtitle: 'Validation rules, error auditing & quality flags',
          Icon: FiShield,
          view: 'validation',
          summary: 'Error & Warning Quality Checks & Digital Certification'
        }
      ]
    }
  ];

  const allNodes = NODE_SECTIONS.flatMap(sec => sec.nodes);
  const completedCount = allNodes.filter(n => isNodeCompleted(n.id)).length;

  return (
    <section id="node-map-page" className="view" style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      
      {/* TYPOGRAPHIC PORTAL HEADER SYSTEM */}
      <PortalHeader
        departmentText="DEPARTMENT OF EDUCATION"
        bureauText={`PROGRESSIVE JOURNEY ROADMAP • ${schoolName}`}
        title="eSF7 School Head Journey Map"
        description="Access, audit, and complete personnel registries sequentially across all journey nodes in a unified visual system matching sidebar sections."
        onBack={() => setActiveView('dashboard')}
        backText="Back to Dashboard"
        actionButton={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            
            {/* DEV BYPASS TOGGLE */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 12px',
              borderRadius: '999px',
              background: bypassNodeLocks 
                ? 'linear-gradient(135deg, rgba(254, 243, 199, 0.95) 0%, rgba(253, 230, 138, 0.9) 100%)' 
                : 'rgba(241, 245, 249, 0.85)',
              border: bypassNodeLocks ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
              boxShadow: bypassNodeLocks ? '0 2px 8px rgba(245, 158, 11, 0.25)' : 'none',
              transition: 'all 0.25s ease'
            }}>
              <span style={{
                fontSize: '10.5px',
                fontWeight: '900',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: bypassNodeLocks ? '#92400E' : '#64748B'
              }}>
                {bypassNodeLocks ? 'DEV: LOCKS BYPASSED' : 'DEV: STRICT LOCKS'}
              </span>

              <button
                type="button"
                onClick={() => setBypassNodeLocks(!bypassNodeLocks)}
                style={{
                  width: '42px',
                  height: '22px',
                  borderRadius: '999px',
                  background: bypassNodeLocks ? '#F59E0B' : '#94A3B8',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  padding: '2px',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.15)'
                }}
                title="Toggle for testing purposes only to bypass node locks"
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  transform: bypassNodeLocks ? 'translateX(20px)' : 'translateX(0px)',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px'
                }}>
                  {bypassNodeLocks ? <FiUnlock size={11} color="#92400E" /> : <FiLock size={11} color="#475569" />}
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '11.5px',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#FFFFFF',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                border: 'none',
                boxShadow: '0 3px 8px rgba(37, 99, 235, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 5px 12px rgba(37, 99, 235, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 3px 8px rgba(37, 99, 235, 0.3)';
              }}
            >
              <FiUploadCloud style={{ fontSize: '14px' }} />
              <span>Import eSF7 Spreadsheet</span>
            </button>
          </div>
        }
      />

      {/* TOP PROGRESS BAR */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--line)',
        borderRadius: '12px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--blue-50)',
            color: 'var(--blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            border: '1px solid var(--blue-100)'
          }}>
            <FiMap size={15} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)', lineHeight: 1.2 }}>
              Registry Completion Status
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>
              {completedCount} of {allNodes.length} Nodes Certified Complete ({Math.round((completedCount / allNodes.length) * 100)}%)
            </div>
          </div>
        </div>

        <div style={{ flex: '1 1 180px', maxWidth: '240px' }}>
          <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              width: `${(completedCount / allNodes.length) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--blue) 0%, #10B981 100%)',
              borderRadius: '999px',
              transition: 'width 0.4s ease'
            }} />
          </div>
        </div>
      </div>

      {/* SECTIONS LIST */}
      {NODE_SECTIONS.map((sec, secIdx) => (
        <div key={sec.key} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: secIdx > 0 ? '6px' : '0' }}>
          
          {/* SECTION HEADER CHIP */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 12px',
            background: 'rgba(241, 245, 249, 0.8)',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            width: 'fit-content'
          }}>
            <div style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: sec.key === 'esf7' ? '#2563EB' : '#059669'
            }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: '900', color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {sec.title}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '500' }}>
                • {sec.subtitle}
              </span>
            </div>
          </div>

          {/* COMPACT NODE CARDS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {sec.nodes.map(node => {
              const isCoreNode = sec.key === 'esf7';
              const isUnlocked = isNodeUnlocked(node.id);
              const isCompleted = isNodeCompleted(node.id);
              const isActive = isUnlocked && !isCompleted;
              const IconComp = node.Icon;

              let cardBg = '#FFFFFF';
              let borderColor = '#E2E8F0';
              let boxShadow = '0 2px 5px rgba(0, 0, 0, 0.03)';
              let nodeNumColor = '#64748B';
              let titleColor = '#0F172A';
              let subtitleColor = '#64748B';
              let iconBg = '#F8FAFC';
              let iconColor = '#475569';
              let iconBorder = '1px solid #E2E8F0';
              let summaryBg = '#F8FAFC';
              let summaryColor = '#334155';
              let summaryBorder = '1px solid #E2E8F0';
              let badgeBg = '#F1F5F9';
              let badgeColor = '#64748B';
              let badgeBorder = '1px solid #CBD5E1';
              let badgeContent = <><FiLock size={10} style={{ marginRight: '3px' }} /> Locked</>;

              if (isCompleted) {
                cardBg = 'linear-gradient(135deg, rgba(236, 253, 245, 0.95) 0%, rgba(209, 250, 229, 0.85) 100%)';
                borderColor = '#10B981';
                boxShadow = '0 4px 12px rgba(16, 185, 129, 0.12)';
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
                badgeContent = <><FiCheck size={10} style={{ marginRight: '3px' }} /> Completed</>;
              } else if (!isCoreNode) {
                // Non-Core Nodes: Always permanently unlocked and available
                cardBg = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
                borderColor = '#CBD5E1';
                boxShadow = '0 3px 8px rgba(0, 0, 0, 0.04)';
                nodeNumColor = '#2563EB';
                titleColor = '#0F172A';
                subtitleColor = '#475569';
                iconBg = '#EFF6FF';
                iconColor = '#2563EB';
                iconBorder = '1px solid #BFDBFE';
                summaryBg = '#F8FAFC';
                summaryColor = '#334155';
                summaryBorder = '1px solid #E2E8F0';
                badgeBg = '#EFF6FF';
                badgeColor = '#1D4ED8';
                badgeBorder = '1px solid #BFDBFE';
                badgeContent = <><FiUnlock size={10} style={{ marginRight: '3px' }} /> Available</>;
              } else if (isActive) {
                // Core Node: Active Current Step
                cardBg = 'linear-gradient(135deg, rgba(239, 246, 255, 0.95) 0%, rgba(219, 234, 254, 0.85) 100%)';
                borderColor = '#2563EB';
                boxShadow = '0 4px 14px rgba(37, 99, 235, 0.15)';
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
                badgeContent = <><FiArrowRight size={10} style={{ marginRight: '3px' }} /> Active Step</>;
              }

              return (
                <div
                  key={node.id}
                  style={{
                    background: cardBg,
                    backdropFilter: 'blur(10px)',
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                    boxShadow: boxShadow,
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <div>
                    {/* Top Row: Node Number + Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '10.5px', fontWeight: '900', color: nodeNumColor, letterSpacing: '0.06em' }}>
                        NODE {node.nodeNumber}
                      </span>
                      <span style={{
                        background: badgeBg,
                        color: badgeColor,
                        border: badgeBorder,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}>
                        {badgeContent}
                      </span>
                    </div>

                    {/* Node Info: Icon + Title + Subtitle */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                      <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '9px',
                        background: iconBg,
                        color: iconColor,
                        border: iconBorder,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}>
                        {IconComp && <IconComp size={16} />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: '800', color: titleColor, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {node.title}
                        </h3>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: subtitleColor, lineHeight: '1.3', fontWeight: '500', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {node.subtitle}
                        </p>
                      </div>
                    </div>

                    {/* Summary Chip */}
                    <div style={{
                      fontSize: '10.5px',
                      fontWeight: '700',
                      color: summaryColor,
                      background: summaryBg,
                      border: summaryBorder,
                      padding: '5px 8px',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {node.summary}
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    disabled={!isUnlocked}
                    onClick={() => setActiveView(node.view)}
                    style={{
                      width: '100%',
                      padding: '7px 12px',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      fontWeight: '800',
                      letterSpacing: '0.02em',
                      border: 'none',
                      cursor: isUnlocked ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                      background: isCompleted 
                        ? '#059669' 
                        : isActive 
                          ? '#2563EB' 
                          : '#E2E8F0',
                      color: isUnlocked ? '#FFFFFF' : '#94A3B8',
                      boxShadow: isCompleted 
                        ? '0 2px 6px rgba(5, 150, 105, 0.25)' 
                        : isActive 
                          ? '0 2px 8px rgba(37, 99, 235, 0.25)' 
                          : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (isUnlocked) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = isCompleted 
                          ? '0 4px 10px rgba(5, 150, 105, 0.35)' 
                          : '0 4px 12px rgba(37, 99, 235, 0.35)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isUnlocked) {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = isCompleted 
                          ? '0 2px 6px rgba(5, 150, 105, 0.25)' 
                          : '0 2px 8px rgba(37, 99, 235, 0.25)';
                      }
                    }}
                  >
                    {!isUnlocked ? (
                      <>
                        <FiLock size={12} />
                        <span>Locked</span>
                      </>
                    ) : isCompleted ? (
                      <>
                        <FiCheckCircle size={12} />
                        <span>Review Node {node.nodeNumber}</span>
                      </>
                    ) : (
                      <>
                        <FiPlay size={12} />
                        <span>Open Node {node.nodeNumber} ➔</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* FOOTER AUDIT NOTICE */}
      <div style={{
        marginTop: '12px',
        padding: '16px 20px',
        borderRadius: '16px',
        background: '#F8FAFC',
        border: '1.5px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        fontSize: '12.5px',
        color: 'var(--muted)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FiShield size={16} color="var(--navy)" />
          <span>
            DepEd Electronic School Form 7 (eSF7) progressive registry journey enforces cross-registry validation integrity prior to final submission.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setActiveView('validation')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--blue)',
            fontWeight: '800',
            cursor: 'pointer',
            padding: 0,
            fontSize: '12.5px'
          }}
        >
          View Quality Check Rules ➔
        </button>
      </div>

      <ESF7UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </section>
  );
}
