import React, { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const PinLogin = ({ rememberedUser, onSwitchAccount, onUsePassword }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleKeyPress = useCallback((num) => {
    if (error) setError('');
    if (pin.length < 6) {
      setPin(prev => prev + num);
      
      // Auto-submit on 6th digit
      if (pin.length === 5) {
        verifyPin(pin + num);
      }
    }
  }, [error, pin.length]);

  const handleDelete = useCallback(() => {
    if (error) setError('');
    setPin(prev => prev.slice(0, -1));
  }, [error]);
  
  const verifyPin = async (completedPin) => {
    setLoading(true);
    const identifier = rememberedUser?.school_id || rememberedUser?.schoolId || rememberedUser?.email;

    try {
      const response = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: identifier,
          pin: completedPin
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success && data.user && data.token) {
        login(data.user, data.token);
      } else {
        setError(data.error || 'Incorrect PIN');
        setPin(''); 
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', width: '100%' }}>
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        backgroundColor: '#dbeafe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.06)',
        marginBottom: '16px',
        outline: '4px solid white',
        outlineOffset: '-2px',
        overflow: 'hidden'
      }}>
        <span style={{ color: '#2563eb', fontSize: '30px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '-1px' }}>
          {rememberedUser?.school_id?.charAt(0) || 'S'}
        </span>
      </div>
      
      <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px', color: '#1e293b', textAlign: 'center' }}>
        Welcome, {rememberedUser?.school_id || 'School Head'}!
      </h2>
      <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>
        Enter your 6-digit PIN to continue
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '32px' }}>
        {[...Array(6)].map((_, i) => (
          <div 
            key={i} 
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '2px solid transparent',
              transition: 'all 0.2s',
              backgroundColor: pin.length > i ? '#2563eb' : '#e2e8f0',
              transform: pin.length > i ? 'scale(1.1)' : 'scale(1)',
              borderColor: error ? '#ef4444' : 'transparent'
            }}
          />
        ))}
      </div>

      <div style={{ height: '24px', marginBottom: '8px' }}>
          {error && <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: '700' }}>{error}</p>}
      </div>

      {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '256px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid #dbeafe',
                borderTop: '4px solid #2563eb',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
          </div>
      ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 24px', marginBottom: '32px', width: '100%', maxWidth: '280px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num.toString())}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#f8fafc',
                  border: 'none',
                  fontSize: '24px',
                  fontWeight: '600',
                  margin: '0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  color: '#334155',
                  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              >
                {num}
              </button>
            ))}
            <div style={{ gridColumnStart: 2 }}>
              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#f8fafc',
                  border: 'none',
                  fontSize: '24px',
                  fontWeight: '600',
                  margin: '0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  color: '#334155',
                  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              >
                0
              </button>
            </div>
            <div style={{ gridColumnStart: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'none',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'colors 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#334155'}
                onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '28px', height: '28px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                </svg>
              </button>
            </div>
          </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px', marginBottom: '8px' }}>
        <button
          type="button"
          onClick={onUsePassword}
          style={{ color: '#2563eb', fontWeight: 'bold', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Use Password Instead
        </button>
        
        <button
          type="button"
          onClick={onSwitchAccount}
          style={{ color: '#94a3b8', fontWeight: '500', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          Not you? Switch Account
        </button>
      </div>
    </div>
  );
};

export default PinLogin;
