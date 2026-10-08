import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const NodeMap = React.lazy(() => import('./pages/NodeMap'));
const Roster = React.lazy(() => import('./pages/Roster'));
const PersonnelProfile = React.lazy(() => import('./pages/PersonnelProfile'));
const OrganizedClasses = React.lazy(() => import('./pages/OrganizedClasses'));
const Workload = React.lazy(() => import('./pages/Workload'));
const Overload = React.lazy(() => import('./pages/Overload'));
const ValidationCenter = React.lazy(() => import('./pages/ValidationCenter'));
const RoomQR = React.lazy(() => import('./pages/RoomQR'));
const RequestCenter = React.lazy(() => import('./pages/RequestCenter'));
const RoomProfiling = React.lazy(() => import('./pages/RoomProfiling'));
const SchoolProfile = React.lazy(() => import('./pages/SchoolProfile'));
const Allowances = React.lazy(() => import('./pages/Allowances'));
const Designations = React.lazy(() => import('./pages/Designations'));
const Deployment = React.lazy(() => import('./pages/Deployment'));
const Submission = React.lazy(() => import('./pages/Submission'));
import SchoolHeadChatWidget from './components/SchoolHeadChatWidget';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Landing from './pages/Landing';
import LoadingScreen from './components/LoadingScreen';
import ServerHealthModal from './components/ServerHealthModal';
import SaveStatusIndicator from './components/SaveStatusIndicator';
import { subscribeHealth } from './services/serverHealth';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { subscribeDraftError, setDraftErrorContext, buildErrorReport, copyTextToClipboard } from './services/draftErrorReporter';

const VIEW_LABELS = {
  dashboard: 'School Dashboard',
  nodemap: 'eSF7 Process Map',
  school: 'School Profile',
  roster: 'Faculty & Staff Roster',
  profile: 'Personnel Profiling',
  designation: 'Personnel Designations',
  classes: 'Organized Classes & Sections',
  organized_classes: 'Organized Classes & Sections',
  'organized-classes': 'Organized Classes & Sections',
  workload: 'Faculty Workload & Timetable',
  deployment: 'Faculty Deployment',
  overload: 'Teaching Overload & Payroll',
  allowances: 'Personnel Allowances',
  validation: 'eSF7 Validation & Integrity Center',
  submission: 'Official eSF7 Submission',
  'room-qr': 'Faculty Room QR Profiling',
  requests: 'Inter-School Request Center'
};

function MainAppContent() {
  const urlParams = new URLSearchParams(window.location.search);
  const isRoomProfiling = urlParams.get('view') === 'room-profiling';

  const { user, loading: authLoading } = useAuth();
  const appState = useApp() || {};
  const { 
    activeView = 'landing', 
    setActiveView = () => {}, 
    isNodeUnlocked = () => true, 
    showToast = () => {}, 
    toast = null, 
    setToast = () => {}, 
    customModal = null,
    isInitialized = false
  } = appState;

  // Hooks must always be declared unconditionally at top
  const [pageTransitionLoading, setPageTransitionLoading] = React.useState(false);
  const prevViewRef = React.useRef(activeView);



  // One shared draft-error notice (auto-save / journey save / personnel fetch); cleared by the next success.
  const [draftError, setDraftError] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [serverLocked, setServerLocked] = React.useState(false);
  React.useEffect(() => subscribeDraftError((e) => { setDraftError(e); setCopied(false); }), []);
  React.useEffect(() => subscribeHealth((h) => setServerLocked(!!h.locked)), []);
  React.useEffect(() => {
    setDraftErrorContext({ userId: user?.id || user?.email || user?.username || null, role: user?.role || null });
  }, [user]);
  const handleCopyDraftError = async () => {
    if (!draftError) return;
    if (await copyTextToClipboard(buildErrorReport(draftError))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);

  React.useEffect(() => {
    if (user && isInitialized && prevViewRef.current !== activeView && activeView !== 'landing') {
      prevViewRef.current = activeView;
      setPageTransitionLoading(true);
      const timer = setTimeout(() => {
        setPageTransitionLoading(false);
      }, 350);
      return () => clearTimeout(timer);
    }
    prevViewRef.current = activeView;
  }, [activeView, user, isInitialized]);

  // Public Faculty Room QR Profiling bypass (No Login Required)
  if (isRoomProfiling || activeView === 'room-profiling') {
    return <React.Suspense fallback={<LoadingScreen message="Loading..." />}><RoomProfiling /></React.Suspense>;
  }

  if (authLoading) {
    return <LoadingScreen message="Authenticating session..." />;
  }

  // Enforce Login first: Users see Login BEFORE entering the app
  if (!user) {
    return <Login />;
  }

  // If user is authenticated and AppContext is still initializing initial data from DB / cloud draft
  if (!isInitialized) {
    return <LoadingScreen message="Loading InsightED eSF7 Database..." />;
  }

  // After login: show Landing Page when activeView === 'landing'
  if (activeView === 'landing') {
    return <Landing onGetStarted={() => setActiveView('dashboard')} />;
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

      {pageTransitionLoading && (
        <LoadingScreen message={`Loading ${VIEW_LABELS[activeView] || 'Module'}...`} />
      )}

      <div className="app">
        <main className="main" style={{ marginLeft: 0, width: '100%' }}>
          <Topbar />
          <React.Suspense fallback={<LoadingScreen message="Loading module..." />}>
          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'nodemap' && <NodeMap />}
          {activeView === 'school' && <SchoolProfile />}
          {activeView === 'roster' && <Roster />}
          {activeView === 'profile' && <PersonnelProfile />}
          {(activeView === 'designation' || activeView === 'designations') && <Designations />}
          {(activeView === 'classes' || activeView === 'organized_classes' || activeView === 'organized-classes') && <OrganizedClasses />}
          {activeView === 'workload' && <Workload />}
          {activeView === 'deployment' && <Deployment />}
          {activeView === 'overload' && <Overload />}
          {activeView === 'allowances' && <Allowances />}
          {activeView === 'validation' && <ValidationCenter />}
          {activeView === 'submission' && <Submission />}
          {activeView === 'room-qr' && <RoomQR />}
          {activeView === 'requests' && <RequestCenter />}
          </React.Suspense>
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
          {toast.type === 'error' ? <FiAlertTriangle size={18} /> : <FiCheckCircle size={18} />} <span>{toast.message}</span>
        </div>
      )}

      {/* Draft save/sync failure notice (single instance, updates in place) */}
      {draftError && !serverLocked && (
        <div role="alert" style={{
          position: 'fixed',
          top: toast ? '84px' : '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #EF4444, #B91C1C)',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '12px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          zIndex: 99998,
          fontSize: '14px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: '320px',
          maxWidth: '90vw'
        }}>
          <FiAlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Saving or syncing failed ({draftError.action}). Your draft is still kept locally on this device.
          </span>
          {draftError.retry && (
            <button
              onClick={() => { try { draftError.retry(); } catch (e) {} }}
              style={{
                background: 'white',
                color: '#B91C1C',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Retry
            </button>
          )}
          <button
            onClick={handleCopyDraftError}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {copied ? 'Copied' : 'Copy error details'}
          </button>
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

      <SaveStatusIndicator />

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
        <ServerHealthModal />
      </AppProvider>
    </AuthProvider>
  );
}
