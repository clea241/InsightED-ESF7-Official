import React, { useState, useEffect } from 'react';

const LoadingScreen = ({ message = "Loading InsightED eSF7 Database...", inline = false, size = "medium" }) => {
    const [loopKey, setLoopKey] = useState(0);

    useEffect(() => {
        // Balanced, natural looping: refresh image instance every 3200ms (3.2 seconds)
        const interval = setInterval(() => {
            setLoopKey(prev => prev + 1);
        }, 3200);
        return () => clearInterval(interval);
    }, []);

    const rawBase = import.meta.env.BASE_URL || '/';
    const baseUrl = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

    const imgWidth = size === 'small' ? '130px' : size === 'large' ? '220px' : '185px';

    return (
        <div style={{
            position: inline ? 'relative' : 'fixed',
            inset: inline ? 'auto' : 0,
            width: inline ? '100%' : '100vw',
            height: inline ? '100%' : '100vh',
            minHeight: inline ? '360px' : '100vh',
            zIndex: inline ? 10 : 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: inline ? 'transparent' : 'radial-gradient(circle at 50% 40%, #FFFFFF 0%, #F8FAFC 70%, #F1F5F9 100%)',
            fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            overflow: 'hidden',
            padding: inline ? '40px 20px' : '0'
        }}>
            <style>{`
                @keyframes logoSmoothPulse {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 14px rgba(8, 49, 95, 0.08)); }
                    50% { transform: scale(1.02); filter: drop-shadow(0 8px 24px rgba(8, 49, 95, 0.16)); }
                }
            `}</style>

            {/* InsightED Animated Logo GIF (Balanced 3.2s Loop) */}
            <div style={{ 
                animation: 'logoSmoothPulse 3.2s infinite ease-in-out',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <img 
                    key={loopKey}
                    src={`${baseUrl}insighted_loading.gif?v=${loopKey}`} 
                    alt="Loading InsightED..." 
                    style={{
                        width: imgWidth,
                        height: 'auto',
                        maxWidth: '85vw',
                        objectFit: 'contain'
                    }} 
                />
            </div>

            {/* Status Message Pill */}
            {message && (
                <div style={{ 
                    marginTop: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 20px',
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '24px',
                    boxShadow: '0 4px 14px rgba(8, 49, 95, 0.06)'
                }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', boxShadow: '0 0 8px #10B981' }} />
                    <span style={{ 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        color: '#334155',
                        letterSpacing: '-0.01em',
                        textAlign: 'center'
                    }}>
                        {message}
                    </span>
                </div>
            )}
        </div>
    );
};

export default LoadingScreen;
