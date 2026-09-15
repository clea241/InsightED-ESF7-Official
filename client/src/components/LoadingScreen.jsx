import React, { useState, useEffect } from 'react';

const LoadingScreen = ({ message = "Loading InsightED eSF7 Database..." }) => {
    const [loopKey, setLoopKey] = useState(0);

    useEffect(() => {
        // The GIF animation runs for 5 seconds (5000ms).
        // Refresh the image instance every 5 seconds so it loops continuously even if the browser stops playback.
        const interval = setInterval(() => {
            setLoopKey(prev => prev + 1);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FFFFFF',
            fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
        }}>
            <img 
                key={loopKey}
                src={`/insighted_loading.gif?v=${loopKey}`} 
                alt="Loading InsightED..." 
                style={{
                    width: '180px',
                    height: 'auto',
                    maxWidth: '85vw',
                    objectFit: 'contain'
                }} 
            />
            {message && (
                <span style={{ 
                    marginTop: '16px',
                    fontSize: '14px', 
                    fontWeight: '600', 
                    color: '#475569',
                    letterSpacing: '-0.01em',
                    textAlign: 'center'
                }}>
                    {message}
                </span>
            )}
        </div>
    );
};

export default LoadingScreen;
