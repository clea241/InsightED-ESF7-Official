import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const storedToken = localStorage.getItem('token');
            const storedUser = localStorage.getItem('remembered_user');
            if (storedToken && storedUser) {
                try {
                    setUser(JSON.parse(storedUser));
                } catch (e) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('remembered_user');
                }
            }
            setLoading(false);
        };
        initAuth();
    }, []);

    const login = (userData, tokenVal) => {
        localStorage.setItem('token', tokenVal);
        localStorage.setItem('remembered_user', JSON.stringify(userData));
        localStorage.setItem('schoolId', userData.school_id || '');
        setUser(userData);
        setToken(tokenVal);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('remembered_user');
        localStorage.removeItem('schoolId');
        setUser(null);
        setToken(null);
    };

    const confirmLogout = () => {
        logout();
    };

    return (
        <AuthContext.Provider value={{ 
            user, setUser, token, setToken, login, logout, confirmLogout, loading
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
