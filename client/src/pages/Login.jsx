import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import BlueprintBackground from '../components/BlueprintBackground';
import PinLogin from '../components/PinLogin';
import PageTransition from '../components/PageTransition';

export default function Login() {
  const { login } = useAuth();
  const [schoolId, setSchoolId] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState('passcode'); // 'passcode' | 'password'
  const [rememberedUser, setRememberedUser] = useState(() => {
    const stored = localStorage.getItem('remembered_user');
    return stored ? JSON.parse(stored) : null;
  });

  const handlePasscodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newPasscode = [...passcode];
    newPasscode[index] = value.slice(-1);
    setPasscode(newPasscode);

    if (value && index < 5) {
      const nextInput = document.getElementById(`passcode-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handlePasscodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !passcode[index] && index > 0) {
      const prevInput = document.getElementById(`passcode-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!schoolId.trim()) {
      setError('Please enter your School ID.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (loginMode === 'passcode') {
        const finalPin = passcode.join('');
        if (finalPin.length !== 6) {
          setError('Please enter a 6-digit passcode.');
          setLoading(false);
          return;
        }

        const API_BASE = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${API_BASE}/auth/pin-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId.trim(),
            pin: finalPin
          })
        });

        const data = await response.json();

        if (response.ok && data.success && data.user && data.token) {
          login(data.user, data.token);
        } else {
          setError(data.error || 'Incorrect PIN.');
        }
      } else {
        if (!password.trim()) {
          setError('Please enter your password.');
          setLoading(false);
          return;
        }

        const API_BASE = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${API_BASE}/auth/migrate-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: schoolId.trim(),
            password: password.trim()
          })
        });

        const data = await response.json();

        if (response.ok && data.success && data.user && data.token) {
          login(data.user, data.token);
        } else {
          setError(data.error || 'Invalid credentials.');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    localStorage.removeItem('remembered_user');
    setRememberedUser(null);
    setLoginMode('passcode');
  };

  return (
    <PageTransition>
      <div style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        background: 'transparent',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        {/* Animated Contours Background */}
        <BlueprintBackground />

        {/* Floating Modal-Style Card */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '1000px',
          backgroundColor: 'white',
          borderRadius: '2.5rem',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          border: '1.5px solid rgba(255, 255, 255, 0.2)'
        }}>
          
          {/* LEFT PANEL: Logo, Brand & Taglines (Navy theme) */}
          <div style={{
            width: '50%',
            backgroundColor: '#09203b',
            color: 'white',
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '10px 18px',
              borderRadius: '16px',
              border: '1.5px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(12px)'
            }}>
              <img src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/deped.png`} alt="DepEd" style={{ height: '36px', objectFit: 'contain' }} />
              <img src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/bagongpilipinas.png`} alt="Bagong Pilipinas" style={{ height: '36px', objectFit: 'contain' }} />
              <img src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/hrod.png`} alt="HROD" style={{ height: '36px', objectFit: 'contain' }} />
            </div>

            {/* Large Centered Logo Box */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '24px 0' }}>
              <div style={{
                width: '240px',
                height: '100px',
                backgroundColor: 'white',
                borderRadius: '1.5rem',
                boxShadow: 'inset 0 4px 6px -1px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px',
                marginBottom: '24px',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  width: '100%',
                  height: '100%'
                }}>
                  <img 
                    src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/InsightED logo 2x2.png`} 
                    alt="InsightED Logo" 
                    style={{ height: '78px', width: 'auto', objectFit: 'contain' }}
                  />
                  <span style={{ fontSize: '22px', fontWeight: '850', color: '#1e293b' }}>+</span>
                  <img 
                    src={`${import.meta.env.BASE_URL}OFFICIAL LOGO/ESF7_logo.png`} 
                    alt="ESF7 Logo" 
                    style={{ height: '62px', width: 'auto', objectFit: 'contain' }}
                  />
                </div>
              </div>
              <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'white', letterSpacing: '-0.02em', margin: 0 }}>
                Insight<span style={{ color: '#ef4444' }}>ED</span> x ESF7
              </h1>
              <p style={{ color: '#94a3b8', fontWeight: '800', uppercase: 'true', tracking: '0.1em', fontSize: '11px', marginTop: '6px', letterSpacing: '0.1em' }}>
                SCHOOL HEAD PORTAL
              </p>
              <p style={{ color: '#cbd5e1', fontSize: '13px', marginTop: '16px', maxWidth: '320px', lineHeight: '1.6' }}>
                Streamlining school data collection and reporting for real-time evidence-based management and decision-making.
              </p>
            </div>

            {/* Bottom coordinates reference */}
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.15em' }}>
              COORD // 14.5995° N • 120.9842° E
            </div>
          </div>

          {/* RIGHT PANEL: Login Input Fields (White theme) */}
          <div style={{
            width: '50%',
            backgroundColor: 'white',
            color: '#1e293b',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '48px',
            position: 'relative'
          }}>
            {/* SVG S-curve bulging right */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '64px',
              pointerEvents: 'none',
              zIndex: 10
            }}>
              <svg style={{ height: '100%', width: '100%', fill: '#09203b' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M0,0 L15,0 C100,25 70,75 0,100 Z" />
              </svg>
            </div>

            <div style={{ position: 'relative', zIndex: 20 }}>
              {rememberedUser && loginMode === 'passcode' ? (
                <PinLogin 
                  rememberedUser={rememberedUser}
                  onSwitchAccount={handleSwitchAccount}
                  onUsePassword={() => setLoginMode('password')}
                />
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--navy, #1e293b)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                      Sign In Portal
                    </h2>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                      Enter credentials assigned to your school station.
                    </p>
                  </div>

                  {error && (
                    <div style={{
                      background: '#fef2f2',
                      border: '1.5px solid #fecaca',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      color: '#ef4444',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      ⚠️ {error}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      School Identifier
                    </label>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#f8fafc',
                      border: '2px solid var(--line, #e2e8f0)',
                      borderRadius: '12px',
                      padding: '0 16px'
                    }}>
                      <span style={{ color: '#94a3b8', fontSize: '18px', marginRight: '10px' }}>✉️</span>
                      <input
                        type="text"
                        value={schoolId}
                        onChange={(e) => setSchoolId(e.target.value)}
                        placeholder="6-digit School ID"
                        required
                        style={{
                          flex: 1,
                          padding: '14px 0',
                          border: 'none',
                          background: 'transparent',
                          fontSize: '14px',
                          outline: 'none',
                          fontFamily: 'inherit',
                          fontWeight: '600'
                        }}
                      />
                    </div>
                  </div>

                  {loginMode === 'passcode' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        6-Digit Passcode
                      </label>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '6px' }}>
                        {passcode.map((digit, index) => (
                          <input
                            key={index}
                            id={`passcode-${index}`}
                            type="password"
                            maxLength="1"
                            value={digit}
                            onChange={(e) => handlePasscodeChange(index, e.target.value)}
                            onKeyDown={(e) => handlePasscodeKeyDown(index, e)}
                            style={{
                              width: '46px',
                              height: '52px',
                              fontSize: '22px',
                              textAlign: 'center',
                              fontWeight: '800',
                              borderRadius: '12px',
                              border: '2px solid var(--line, #e2e8f0)',
                              outline: 'none',
                              background: '#f8fafc',
                              transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--blue, #2563eb)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--line, #e2e8f0)'}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Password
                      </label>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#f8fafc',
                        border: '2px solid var(--line, #e2e8f0)',
                        borderRadius: '12px',
                        padding: '0 16px'
                      }}>
                        <span style={{ color: '#94a3b8', fontSize: '18px', marginRight: '10px' }}>🔒</span>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter Password"
                          required
                          style={{
                            flex: 1,
                            padding: '14px 0',
                            border: 'none',
                            background: 'transparent',
                            fontSize: '14px',
                            outline: 'none',
                            fontFamily: 'inherit',
                            fontWeight: '600'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.05em' }}>
                      {loginMode === 'passcode' ? '🔑 PASSCODE MODE' : '🔒 PASSWORD MODE'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMode(loginMode === 'passcode' ? 'password' : 'passcode');
                        setError('');
                      }}
                      style={{
                        color: 'var(--blue, #2563eb)',
                        background: 'none',
                        border: 'none',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      Use {loginMode === 'passcode' ? 'Password' : 'Passcode'} Instead
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      background: 'linear-gradient(180deg, var(--blue, #2563eb), var(--navy, #1e293b))',
                      color: 'white',
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      fontWeight: '800',
                      fontSize: '14px',
                      cursor: 'pointer',
                      marginTop: '8px',
                      transition: 'opacity 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {loading ? 'Authenticating...' : 'SIGN IN →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
