import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import NodeMap from './pages/NodeMap';
import Roster from './pages/Roster';
import PersonnelProfile from './pages/PersonnelProfile';
import OrganizedClasses from './pages/OrganizedClasses';
import Workload from './pages/Workload';
import Overload from './pages/Overload';
import ValidationCenter from './pages/ValidationCenter';
import RoomQR from './pages/RoomQR';
import RequestCenter from './pages/RequestCenter';
import RoomProfiling from './pages/RoomProfiling';
import SchoolProfile from './pages/SchoolProfile';
import Allowances from './pages/Allowances';
import Designations from './pages/Designations';
import Deployment from './pages/Deployment';
import Submission from './pages/Submission';
import SchoolHeadChatWidget from './components/SchoolHeadChatWidget';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import LoadingScreen from './components/LoadingScreen';

function MainAppContent() {
  const urlParams = new URLSearchParams(window.location.search);
  const isRoomProfiling = urlParams.get('view') === 'room-profiling';

  const { user, loading: authLoading } = useAuth();
  const appState = useApp() || {};
  const { 
    activeView = 'dashboard', 
    setActiveView = () => {}, 
    isNodeUnlocked = () => true, 
    showToast = () => {}, 
    toast = null, 
    setToast = () => {}, 
    customModal = null 
  } = appState;

  React.useEffect(() => {
    const standaloneViews = ['dashboard', 'nodemap', 'room-profiling', 'room-qr', 'requests'];
    if (!standaloneViews.includes(activeView) && isNodeUnlocked && !isNodeUnlocked(activeView)) {
      showToast('This node is locked. Complete the preceding steps on the Node Map first.', 'error');
      setActiveView('nodemap');
    }
  }, [activeView, isNodeUnlocked, setActiveView, showToast]);

  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);

  // Public Faculty Room QR Profiling bypass (No Login Required)
  if (isRoomProfiling || activeView === 'room-profiling') {
    return <RoomProfiling />;
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div className="app">
        <main className="main" style={{ marginLeft: 0, width: '100%' }}>
          <Topbar />
          
          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'nodemap' && <NodeMap />}
          {activeView === 'school' && <SchoolProfile />}
          {activeView === 'roster' && <Roster />}
          {activeView === 'profile' && <PersonnelProfile />}
          {activeView === 'designation' && <Designations />}
          {activeView === 'classes' && <OrganizedClasses />}
          {activeView === 'workload' && <Workload />}
          {activeView === 'deployment' && <Deployment />}
          {activeView === 'overload' && <Overload />}
          {activeView === 'allowances' && <Allowances />}
          {activeView === 'validation' && <ValidationCenter />}
          {activeView === 'submission' && <Submission />}
          {activeView === 'room-qr' && <RoomQR />}
          {activeView === 'requests' && <RequestCenter />}
        </main>
      </div>

      {/* Global Toast Notification Banner */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'error' ? 'linear-gradient(135deg, #EF4444, #B91C1C)' : 'linear-gradient(135deg, #059669, #047857)',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '12px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          zIndex: 99999,
          fontSize: '14px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          minWidth: '320px',
          justifyContent: 'center'
        }}>
          {toast.type === 'error' ? '⚠️' : '✅'} {toast.message}
        </div>
      )}

      {/* Global Custom Modal Pop-up */}
      {customModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99998,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '420px',
            maxWidth: '90%',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1.5px solid var(--line)',
            animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', color: 'var(--navy)', fontWeight: '800' }}>
              {customModal.title}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
              {customModal.message}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {customModal.type === 'confirm' && (
                <button 
                  className="btn secondary" 
                  onClick={customModal.onCancel}
                  style={{ minHeight: '38px', padding: '0 16px' }}
                >
                  Cancel
                </button>
              )}
              <button 
                className="btn" 
                onClick={customModal.onConfirm}
                style={{ 
                  minHeight: '38px', 
                  padding: '0 16px', 
                  background: 'linear-gradient(180deg, var(--blue), var(--navy))',
                  borderColor: 'var(--navy)',
                  color: 'white'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Widget for School Head */}
      <SchoolHeadChatWidget />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MainAppContent />
      </AppProvider>
    </AuthProvider>
  );
}
