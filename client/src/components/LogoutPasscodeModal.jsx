import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { FiKey, FiAlertTriangle, FiArrowRight } from 'react-icons/fi';

export default function LogoutPasscodeModal({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const [passcode, setPasscode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (isOpen) {
      setPasscode(['', '', '', '', '', '']);
      setError('');
      setLoading(false);
      setTimeout(() => {
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePasscodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newPasscode = [...passcode];
    newPasscode[index] = value.slice(-1);
    setPasscode(newPasscode);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !passcode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pastedData)) {
      const digits = pastedData.split('');
      setPasscode(digits);
      setError('');
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerifyAndLogout = async (e) => {
    if (e) e.preventDefault();
    const enteredPin = passcode.join('');

    if (enteredPin.length !== 6) {
      setError('Please enter your full 6-digit passcode.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const schoolId = user?.school_id || localStorage.getItem('school_id') || localStorage.getItem('schoolId') || '';
      const storedUser = localStorage.getItem('remembered_user');
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;
      const expectedPin = user?.pin || user?.passcode || parsedUser?.pin || parsedUser?.passcode;

      let isValid = false;

      // 1. Direct local check if PIN stored in user context
      if (expectedPin && String(expectedPin) === String(enteredPin)) {
        isValid = true;
      } else {
        // 2. Verify via API endpoint if online
        const API_BASE = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${API_BASE}/auth/pin-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            pin: enteredPin
          })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          isValid = true;
        }
      }

      if (isValid) {
        onClose();
        logout();
      } else {
        setError('Incorrect passcode. Please enter your valid 6-digit passcode.');
        setPasscode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      console.error('Logout passcode error:', err);
      setError('Incorrect passcode. Please check your credentials.');
      setPasscode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '24px',
        padding: '32px',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
        border: '1.5px solid rgba(226, 232, 240, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        animation: 'modalSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Lock Icon Header */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: '#FEF2F2',
          border: '1.5px solid #FECACA',
          color: '#DC2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          marginBottom: '16px'
        }}>
          <FiKey />
        </div>

        <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: '800', color: '#0F172A' }}>
          Passcode Required to Logout
        </h3>

        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
          Please enter your 6-digit security passcode to authenticate logout and lock your station.
        </p>

        {error && (
          <div style={{
            width: '100%',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '10px',
            padding: '10px 14px',
            color: '#DC2626',
            fontSize: '12.5px',
            fontWeight: '700',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            <FiAlertTriangle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleVerifyAndLogout} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 6-Digit Input Row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }} onPaste={handlePaste}>
            {passcode.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="password"
                maxLength="1"
                value={digit}
                onChange={(e) => handlePasscodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                style={{
                  width: '44px',
                  height: '50px',
                  fontSize: '22px',
                  textAlign: 'center',
                  fontWeight: '800',
                  borderRadius: '12px',
                  border: error ? '2px solid #FCA5A5' : '2px solid #CBD5E1',
                  outline: 'none',
                  background: '#F8FAFC',
                  color: '#0F172A',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => (e.target.style.borderColor = '#2563EB')}
                onBlur={(e) => (e.target.style.borderColor = error ? '#FCA5A5' : '#CBD5E1')}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: '1.5px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: '800',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {loading ? 'Verifying...' : <>Confirm & Logout <FiArrowRight /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
