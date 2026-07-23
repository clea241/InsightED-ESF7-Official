import React from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { activeView, setActiveView, incomingRequests } = useApp();
  const { logout } = useAuth();

  const navItems = [
    { view: 'dashboard', label: 'Dashboard', icon: '⌂' },
    { view: 'school', label: 'School Profile', icon: '🏛' },
    { view: 'roster', label: 'Personnel Roster', icon: '☷' },
    { view: 'profile', label: 'Personnel Profiling', icon: '✎' },
    { view: 'classes', label: 'Organized Classes', icon: '▦' },
    { view: 'workload', label: 'Workload', icon: '◷' },
    { view: 'overload', label: 'Overload', icon: '⇄' },
    { view: 'allowances', label: 'Allowances & Incentives', icon: '₱' },
    { view: 'requests', label: 'Requests', icon: '✉', badge: incomingRequests.length > 0 ? incomingRequests.length : null },
    { view: 'validation', label: 'Validation Center', icon: '⛨' },
    { view: 'room-qr', label: 'Room QR Portal', icon: '⛶' },
  ];

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="brand-container">
        <img 
          src="/OFFICIAL LOGO/InsightED logo 5 x 3 in white outline.png" 
          alt="InsightED Logo" 
          className="brand-logo brand-logo-landscape"
          onError={(e) => {
            e.target.src = "/OFFICIAL LOGO/InsightED logo 5 x 3 in.png";
          }}
        />
        <div className="brand-divider"></div>
        <img 
          src="/OFFICIAL LOGO/ESF7_logo02.png" 
          alt="ESF7 Logo" 
          className="brand-logo"
          onError={(e) => {
            e.target.src = "/OFFICIAL LOGO/ESF7_logo.png";
          }}
        />
      </div>
      <nav className="nav" aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {navItems.map((item) => (
          <button
            key={item.view}
            className={activeView === item.view ? 'active' : ''}
            data-icon={item.icon}
            onClick={() => setActiveView(item.view)}
            type="button"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left' }}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span style={{
                background: '#EF4444',
                color: 'white',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '999px',
                marginRight: '10px'
              }}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
        <button
          className="signout-btn"
          data-icon="⎋"
          onClick={logout}
          type="button"
          style={{ marginTop: 'auto', color: '#fca5a5', borderTop: '1.5px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}
        >
          Sign Out
        </button>
      </nav>
    </aside>
  );
}
