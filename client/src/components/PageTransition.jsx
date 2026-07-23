import React from 'react';

const PageTransition = ({ children }) => {
    return (
        <div style={{ animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }} className="w-full h-full">
            {children}
        </div>
    );
};

export default PageTransition;
