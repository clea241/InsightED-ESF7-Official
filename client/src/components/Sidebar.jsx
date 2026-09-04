import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
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
  FiChevronDown
} from 'react-icons/fi';

export default function Sidebar() {
  const { activeView, setActiveView, incomingRequests } = useApp();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [openSections, setOpenSections] = useState({
    esf7: true,
    portals: true,
    overload: true,
    others: true,
    validation: true
  });

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = [
    {
      key: 'esf7',
      title: 'ESF7 Core Registry',
      items: [
        { view: 'landing', label: 'Welcome Page', Icon: FiHome },
        { view: 'dashboard', label: 'Dashboard', Icon: FiGrid },
        { view: 'school', label: 'School Profile', Icon: FiBookOpen },
        { view: 'roster', label: 'Personnel Roster', Icon: FiUsers },
        { view: 'profile', label: 'Personnel Profiling', Icon: FiUserCheck },
        { view: 'designation', label: 'Designations', Icon: FiBookmark },
        { view: 'classes', label: 'Organized Classes', Icon: FiGrid },
        { view: 'workload', label: 'Workload', Icon: FiClock }
      ]
    },
    {
      key: 'portals',
      title: 'Portals & Utilities',
      items: [
        { view: 'room-qr', label: 'Room QR Portal', Icon: FiMaximize },
        { view: 'requests', label: 'Requests', Icon: FiMail, badge: incomingRequests.length > 0 ? incomingRequests.length : null }
      ]
    },
    {
      key: 'overload',
      title: 'Teaching Overload',
      items: [
        { view: 'overload', label: 'Overload', Icon: FiRepeat }
      ]
    },
    {
      key: 'others',
      title: 'Others',
      items: [
        { view: 'allowances', label: 'Allowances & Incentives', Icon: FiDollarSign }
      ]
    },
    {
      key: 'validation',
      title: 'Quality Audit & Certification',
      items: [
        { view: 'validation', label: 'Validation Center', Icon: FiShield }
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
              onClick={() => setIsLogoutModalOpen(true)}
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
