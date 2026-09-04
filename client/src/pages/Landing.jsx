import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { 
  FiArrowRight, 
  FiUser, 
  FiGrid, 
  FiShield, 
  FiCheckCircle, 
  FiLayers, 
  FiClock, 
  FiFileText,
  FiX
} from 'react-icons/fi';

export default function Landing({ onGetStarted }) {
  const { setActiveView } = useApp() || {};
  const { user } = useAuth() || {};
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  const handleStart = () => {
    if (typeof onGetStarted === 'function') {
      onGetStarted();
    } else if (setActiveView) {
      setActiveView('dashboard');
    }
  };

  return (
    <div className="esf7-landing-wrapper">
      <style>{`
        .esf7-landing-wrapper {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #08315F;
          font-family: var(--font-body, 'Plus Jakarta Sans', sans-serif);
          user-select: none;
          z-index: 100;
        }

        /* High-Definition, Wide-Angle Background Photo (Zoomed Out) */
        .esf7-landing-bg {
          position: absolute;
          inset: -4%;
          width: 108%;
          height: 108%;
          background-image: 
            linear-gradient(180deg, rgba(8, 49, 95, 0.10) 0%, rgba(8, 49, 95, 0.28) 100%),
            url('/deped_campus_bg.jpg'),
            url('/landingpage.jpg');
          background-size: cover;
          background-position: center 46%;
          background-repeat: no-repeat;
          filter: contrast(1.05) brightness(1.03) saturate(1.1);
          transform: scale(0.98);
          transition: transform 8s ease-out;
        }

        .esf7-landing-wrapper:hover .esf7-landing-bg {
          transform: scale(1.0);
        }

        /* Subtle Outer Frame Vignette to make the glass card float */
        .esf7-landing-outer-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 70%, rgba(8, 49, 95, 0.4) 100%);
          pointer-events: none;
        }

        /* Luminous Blue-Tinted Frosted Glass Viewport Frame */
        .esf7-glass-card {
          position: relative;
          z-index: 10;
          width: 90%;
          max-width: 1140px;
          height: 84vh;
          max-height: 720px;
          border-radius: 36px;
          background: linear-gradient(145deg, rgba(7, 89, 133, 0.18) 0%, rgba(8, 49, 95, 0.26) 100%);
          backdrop-filter: blur(8px) saturate(140%);
          -webkit-backdrop-filter: blur(8px) saturate(140%);
          border: 1.5px solid rgba(186, 230, 253, 0.55);
          box-shadow: 
            0 25px 50px -12px rgba(8, 49, 95, 0.40),
            0 0 35px rgba(125, 211, 252, 0.16),
            inset 0 1px 2px rgba(255, 255, 255, 0.65),
            inset 0 0 24px rgba(7, 89, 133, 0.18);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 34px 44px;
          box-sizing: border-box;
          animation: landingFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes landingFadeIn {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        /* Top Header inside glass card */
        .esf7-glass-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }

        .esf7-glass-icon-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.22);
          border: 1px solid rgba(255, 255, 255, 0.6);
          color: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.7);
        }

        .esf7-glass-icon-btn:hover {
          background: rgba(255, 255, 255, 0.38);
          border-color: #FFFFFF;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 0 16px rgba(255, 255, 255, 0.4);
        }

        .esf7-glass-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .esf7-glass-brand-title {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.38em;
          color: #FFFFFF;
          text-transform: uppercase;
          text-shadow: 0 2px 12px rgba(8, 49, 95, 0.8), 0 1px 3px rgba(0, 0, 0, 0.6);
          margin-left: 0.38em;
        }

        .esf7-glass-brand-sub {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          color: #E0F2FE;
          text-transform: uppercase;
          opacity: 0.95;
          margin-top: 3px;
          text-shadow: 0 1px 8px rgba(8, 49, 95, 0.8);
        }

        .esf7-glass-portal-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 20px 8px 16px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.22);
          border: 1px solid rgba(255, 255, 255, 0.6);
          color: #FFFFFF;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.7);
        }

        .esf7-glass-portal-btn:hover {
          background: rgba(255, 255, 255, 0.38);
          border-color: #FFFFFF;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 0 16px rgba(255, 255, 255, 0.4);
        }

        .esf7-portal-avatar {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #08315F;
          border: 1px solid rgba(255, 255, 255, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
        }

        /* Hero Center Section */
        .esf7-glass-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin: auto 0;
          padding: 10px 0;
        }

        .esf7-glass-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 18px;
          border-radius: 999px;
          background: rgba(8, 49, 95, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.45);
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          margin-bottom: 22px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.4);
        }

        .esf7-glass-title {
          font-size: 58px;
          font-weight: 800;
          color: #FFFFFF;
          letter-spacing: -0.03em;
          line-height: 1.12;
          margin: 0 0 16px 0;
          text-shadow: 
            0 4px 20px rgba(8, 49, 95, 0.9),
            0 2px 6px rgba(0, 0, 0, 0.7);
          max-width: 860px;
        }

        .esf7-glass-desc {
          font-size: 17px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.95);
          max-width: 660px;
          margin: 0 0 38px 0;
          font-weight: 500;
          text-shadow: 0 2px 10px rgba(8, 49, 95, 0.8), 0 1px 3px rgba(0, 0, 0, 0.6);
        }

        /* Primary Action Button: Let's Get Started */
        .esf7-glass-cta-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 16px 44px;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(125, 211, 252, 0.22) 100%);
          border: 1.5px solid rgba(255, 255, 255, 0.85);
          color: #FFFFFF;
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 
            0 14px 36px rgba(8, 49, 95, 0.45),
            0 0 20px rgba(125, 211, 252, 0.25),
            inset 0 1px 2px rgba(255, 255, 255, 0.9);
          text-shadow: 0 1px 4px rgba(8, 49, 95, 0.6);
        }

        .esf7-glass-cta-btn:hover {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.42) 0%, rgba(125, 211, 252, 0.35) 100%);
          border-color: #FFFFFF;
          transform: translateY(-3px) scale(1.02);
          box-shadow: 
            0 20px 48px rgba(7, 89, 133, 0.55),
            0 0 30px rgba(125, 211, 252, 0.45),
            inset 0 1px 2px rgba(255, 255, 255, 1);
        }

        .esf7-glass-cta-btn:active {
          transform: translateY(0) scale(0.99);
        }

        .esf7-cta-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transition: transform 0.3s ease;
        }

        .esf7-glass-cta-btn:hover .esf7-cta-icon-wrapper {
          transform: translateX(4px);
          background: rgba(255, 255, 255, 0.5);
        }

        /* Quick Menu Modal Popup */
        .esf7-quick-menu-modal {
          position: absolute;
          top: 90px;
          left: 44px;
          width: 280px;
          background: rgba(8, 49, 95, 0.85);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.5);
          z-index: 50;
          animation: menuPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes menuPop {
          from { opacity: 0; transform: translateY(-8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .esf7-quick-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 14px;
          border-radius: 14px;
          color: #FFFFFF;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .esf7-quick-menu-item:hover {
          background: rgba(255, 255, 255, 0.18);
        }

        @media (max-width: 768px) {
          .esf7-glass-card {
            width: 95%;
            height: 92vh;
            padding: 24px 20px;
            border-radius: 26px;
          }
          .esf7-glass-title {
            font-size: 34px;
          }
          .esf7-glass-desc {
            font-size: 14px;
            margin-bottom: 26px;
          }
          .esf7-glass-cta-btn {
            padding: 14px 32px;
            font-size: 15px;
          }
        }
      `}</style>

      {/* High-Definition Background Image */}
      <div className="esf7-landing-bg" />
      <div className="esf7-landing-outer-vignette" />

      {/* Main Glassmorphic Viewport Frame */}
      <div className="esf7-glass-card">
        {/* Top Header Bar */}
        <header className="esf7-glass-topbar">
          <button 
            className="esf7-glass-icon-btn" 
            title="Quick Options"
            onClick={() => setShowQuickMenu(!showQuickMenu)}
          >
            {showQuickMenu ? <FiX size={18} /> : <FiGrid size={18} />}
          </button>

          <div className="esf7-glass-brand">
            <span className="esf7-glass-brand-title">INSIGHTED</span>
            <span className="esf7-glass-brand-sub">eSF7 Workspace</span>
          </div>

          <button 
            className="esf7-glass-portal-btn"
            onClick={handleStart}
            title="Access School Head Portal"
          >
            <span>{user ? 'Dashboard' : 'Portal Access'}</span>
            <div className="esf7-portal-avatar">
              <FiUser size={14} />
            </div>
          </button>
        </header>

        {/* Quick Dropdown / Options Menu */}
        {showQuickMenu && (
          <div className="esf7-quick-menu-modal">
            <div 
              className="esf7-quick-menu-item"
              onClick={() => { setShowQuickMenu(false); handleStart(); }}
            >
              <FiShield size={16} color="#7DD3FC" />
              <span>School Dashboard</span>
            </div>
            <div 
              className="esf7-quick-menu-item"
              onClick={() => { setShowQuickMenu(false); setActiveView('roster'); }}
            >
              <FiLayers size={16} color="#7DD3FC" />
              <span>Personnel Roster</span>
            </div>
            <div 
              className="esf7-quick-menu-item"
              onClick={() => { setShowQuickMenu(false); setActiveView('workload'); }}
            >
              <FiClock size={16} color="#7DD3FC" />
              <span>Workload Timetable</span>
            </div>
            <div 
              className="esf7-quick-menu-item"
              onClick={() => { setShowQuickMenu(false); setActiveView('validation'); }}
            >
              <FiFileText size={16} color="#7DD3FC" />
              <span>eSF7 Report Generator</span>
            </div>
          </div>
        )}

        {/* Center Hero Area */}
        <section className="esf7-glass-hero">
          <div className="esf7-glass-badge">
            <FiCheckCircle size={14} color="#34D399" />
            <span>DepEd Electronic School Form 7</span>
          </div>

          <h1 className="esf7-glass-title">
            Faculty &amp; Workload Intelligence
          </h1>

          <p className="esf7-glass-desc">
            Unified DepEd teacher profiling, national plantilla compliance, automated timetable matrix, and 3-Term overload computation.
          </p>

          <button 
            className="esf7-glass-cta-btn"
            onClick={handleStart}
          >
            <span>Let's Get Started</span>
            <div className="esf7-cta-icon-wrapper">
              <FiArrowRight size={17} />
            </div>
          </button>
        </section>

        {/* Bottom Spacing */}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
