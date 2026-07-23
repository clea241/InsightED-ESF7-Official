import React from 'react';

const LoadingScreen = () => {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(4px)',
            transition: 'opacity 0.3s ease'
        }}>
            <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid var(--blue, #3b82f6)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '16px'
            }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--navy, #1e293b)' }}>Loading InsightED...</span>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default LoadingScreen;
