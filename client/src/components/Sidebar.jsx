import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { checkBeforeLeave, isAnyScreenDirty } from '../services/dirtyGuard';
import LogoutPasscodeModal from './LogoutPasscodeModal';
import { 
  FiHome, 
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
  FiLogOut,
  FiChevronDown,
  FiLock,
  FiUnlock
} from 'react-icons/fi';

export default function Sidebar() {
  const { activeView, setActiveView, incomingRequests, bypassNodeLocks, setBypassNodeLocks } = useApp();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleLogoutClick = async () => {
    if (isAnyScreenDirty()) {
      const canProceed = await checkBeforeLeave({ actionType: 'logout' });
      if (!canProceed) return;
    }
    setIsLogoutModalOpen(true);
  };

  const [openSections, setOpenSections] = useState({
    general: true,
    phase1: true,
    phase2: true,
    phase3: true
  });

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = [
    {
      key: 'general',
      title: 'Navigation & Overview',
      items: [
        { view: 'landing', label: 'Welcome Page', Icon: FiHome },
        { view: 'dashboard', label: 'Dashboard', Icon: FiGrid }
      ]
    },
    {
      key: 'phase1',
      title: 'Phase 1: Setup & Profiling',
      items: [
        { view: 'school', label: '01. School Profile', Icon: FiBookOpen },
        { view: 'roster', label: '02. Personnel Roster', Icon: FiUsers },
        { view: 'room-qr', label: '03. Room QR Portal', Icon: FiMaximize },
        { view: 'profile', label: '04. Personnel Profiling', Icon: FiUserCheck }
      ]
    },
    {
      key: 'phase2',
      title: 'Phase 2: Classes & Workload',
      items: [
        { view: 'requests', label: '05. Request Center', Icon: FiMail, badge: incomingRequests?.length > 0 ? incomingRequests.length : null },
        { view: 'classes', label: '06. Organized Classes', Icon: FiGrid },
        { view: 'designation', label: '07. Designations', Icon: FiBookmark },
        { view: 'workload', label: '08. Workload & Timetable', Icon: FiClock }
      ]
    },
    {
      key: 'phase3',
      title: 'Phase 3: Benefits & Submission',
      items: [
        { view: 'allowances', label: '09. Allowances & Incentives', Icon: FiDollarSign, isLocked: !bypassNodeLocks },
        { view: 'overload', label: '10. Overload Center', Icon: FiRepeat },
        { view: 'validation', label: '11. Validation Center', Icon: FiShield }
      ]
    }
  ];

  return (
    <>
      <aside className="sidebar">
        {/* Brand Logos */}
        <div className="brand-container">
          <img 
            src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/InsightED logo 5 x 3 in white outline.png`} 
            alt="InsightED Logo" 
            className="brand-logo brand-logo-landscape"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = `${import.meta.env.BASE_URL}OFFICIAL LOGO/InsightED logo 5 x 3 in.png`;
            }}
          />
          <div className="brand-divider"></div>
          <img 
            src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/ESF7_logo02.png`} 
            alt="ESF7 Logo" 
            className="brand-logo"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = `${import.meta.env.BASE_URL}OFFICIAL LOGO/deped.png`;
            }}
          />
        </div>

        {/* Main Navigation List */}
        <nav className="nav" aria-label="Primary">
          {sections.map((sec) => (
            <div key={sec.key} className="sidebar-section">
              {/* Collapsible Section Header */}
              <button
                type="button"
                className="section-header-btn"
                onClick={() => toggleSection(sec.key)}
              >
                <span className="sidebar-section-title">{sec.title}</span>
                <span 
                  className="sidebar-chevron" 
                  style={{ transform: openSections[sec.key] ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-flex', alignItems: 'center' }}
                >
                  <FiChevronDown size={14} />
                </span>
              </button>

              {/* Section Items */}
              {openSections[sec.key] && (
                <div className="section-items">
                  {sec.items.map((item) => {
                    const IconComponent = item.Icon;
                    return (
                      <button
                        key={item.view}
                        className={activeView === item.view ? 'active' : ''}
                        onClick={() => setActiveView(item.view)}
                        type="button"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                      >
                        {IconComponent && <IconComponent size={16} style={{ flexShrink: 0 }} />}
                        <span>{item.label}</span>
                        {item.isLocked && (
                          <span style={{
                            marginLeft: 'auto',
                            fontSize: '9px',
                            fontWeight: '800',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#F1F5F9',
                            color: '#64748B',
                            border: '1px solid #CBD5E1',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase'
                          }}>
                            Locked
                          </span>
                        )}
                        {item.badge && (
                          <span className="nav-badge">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {/* VERY BOTTOM SECTION: Validation Center & Sign Out */}
          <div className="sidebar-bottom-section">
            {/* Validation Center Button - Quality Assurance */}
            <button
              className={activeView === 'validation' ? 'active' : ''}
              onClick={() => setActiveView('validation')}
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <FiShield size={16} style={{ flexShrink: 0 }} />
              <span>Validation Center</span>
            </button>

            {/* Sign Out Button */}
            <button
              className="signout-btn"
              onClick={handleLogoutClick}
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <FiLogOut size={16} style={{ flexShrink: 0 }} />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>
      </aside>

      <LogoutPasscodeModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
      />
    </>
  );
}
