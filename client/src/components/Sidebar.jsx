import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import LogoutPasscodeModal from './LogoutPasscodeModal';

export default function Sidebar() {
  const { activeView, setActiveView, incomingRequests } = useApp();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [openSections, setOpenSections] = useState({
    esf7: true,
    portals: true,
    overload: true,
    others: true
  });

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = [
    {
      key: 'esf7',
      title: 'ESF7 Core Registry',
      items: [
        { view: 'dashboard', label: 'Dashboard', icon: '⌂' },
        { view: 'school', label: 'School Profile', icon: '🏛' },
        { view: 'roster', label: 'Personnel Roster', icon: '☷' },
        { view: 'profile', label: 'Personnel Profiling', icon: '✎' },
        { view: 'designation', label: 'Designations', icon: '⚜' },
        { view: 'classes', label: 'Organized Classes', icon: '▦' },
        { view: 'workload', label: 'Workload', icon: '◷' },
        { view: 'deployment', label: 'Deployment', icon: '⇄' },
        { view: 'validation', label: 'Validation Center', icon: '⛨' },
        { view: 'submission', label: 'eSF7 Submission', icon: '📋' }
      ]
    },
    {
      key: 'portals',
      title: 'Portals & Utilities',
      items: [
        { view: 'room-qr', label: 'Room QR Portal', icon: '⛶' },
        { view: 'requests', label: 'Requests', icon: '✉', badge: incomingRequests.length > 0 ? incomingRequests.length : null }
      ]
    },
    {
      key: 'overload',
      title: 'Teaching Overload',
      items: [
        { view: 'overload', label: 'Overload', icon: '⇄' }
      ]
    },
    {
      key: 'others',
      title: 'Others',
      items: [
        { view: 'allowances', label: 'Allowances & Incentives', icon: '₱' }
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
                  style={{ transform: openSections[sec.key] ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                >
                  ▼
                </span>
              </button>

              {/* Section Items */}
              {openSections[sec.key] && (
                <div className="section-items">
                  {sec.items.map((item) => (
                    <button
                      key={item.view}
                      className={activeView === item.view ? 'active' : ''}
                      data-icon={item.icon}
                      onClick={() => setActiveView(item.view)}
                      type="button"
                    >
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="nav-badge">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* VERY BOTTOM SECTION: Validation Center, Submission & Sign Out */}
          <div className="sidebar-bottom-section">
            {/* Validation Center Button - Quality Assurance */}
            <button
              className={activeView === 'validation' ? 'active' : ''}
              data-icon="⛨"
              onClick={() => setActiveView('validation')}
              type="button"
            >
              <span>Validation Center</span>
            </button>

            {/* Submission Button - Final Sign-off */}
            <button
              className={activeView === 'submission' ? 'active' : ''}
              data-icon="📋"
              onClick={() => setActiveView('submission')}
              type="button"
            >
              <span>eSF7 Submission</span>
            </button>

            {/* Sign Out Button */}
            <button
              className="signout-btn"
              data-icon="⎋"
              onClick={() => setIsLogoutModalOpen(true)}
              type="button"
            >
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
