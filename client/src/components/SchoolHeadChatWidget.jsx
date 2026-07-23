import React, { useState, useEffect, useRef } from 'react';

// Helper to resolve School Head backend server URL dynamically
const getChatApiUrl = (path) => {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const base = isDev ? 'http://localhost:5000' : window.location.origin;
  return `${base}${path}`;
};

const SchoolHeadChatWidget = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeBubble, setActiveBubble] = useState('SDO'); // 'SDO' | 'HRMO' | 'ADMIN'
  const [selectedRoomId, setSelectedRoomId] = useState(null); // Active room ID
  const [showNewChatSelector, setShowNewChatSelector] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Dev Token State (for cross-port local development)
  const [tokenInput, setTokenInput] = useState('');
  const [storedToken, setStoredToken] = useState(localStorage.getItem('token') || '');

  // API Backend States
  const [contacts, setContacts] = useState({ SDOs: [], HRMO: null, ADMIN: null });
  const [rooms, setRooms] = useState([]); // List of active rooms from backend
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Check if current user is a School Head
  const userRole = localStorage.getItem('userRole') || (currentUser && currentUser.role);
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // On localhost, we always show the floating bubble so developers can see it and paste a token if needed
  const isSchoolHead = isDev || userRole === 'School Head' || userRole === 'school_head';

  // 0. Fetch current user details from SchoolHead server
  useEffect(() => {
    if (!storedToken) return;

    fetch(getChatApiUrl('/api/auth/me'), {
      headers: { 'Authorization': `Bearer ${storedToken}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.user) {
        setCurrentUser(data.user);
      }
    })
    .catch(err => console.error('[SH CHAT] Fetch user info failed:', err));
  }, [storedToken]);

  // 1. Fetch active rooms & contacts on open
  useEffect(() => {
    if (!isSchoolHead || !isOpen || !storedToken) return;

    // Load active rooms
    fetch(getChatApiUrl('/api/chat/rooms'), {
      headers: { 'Authorization': `Bearer ${storedToken}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setRooms(data.rooms || []);
      }
    })
    .catch(err => console.error('[SH CHAT] Load rooms error:', err));

    // Load contacts list
    fetch(getChatApiUrl('/api/chat/contacts'), {
      headers: { 'Authorization': `Bearer ${storedToken}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.contacts) {
        setContacts({
          SDOs: data.contacts.SDOs || [],
          HRMO: data.contacts.HRMO,
          ADMIN: data.contacts.ADMIN
        });
      }
    })
    .catch(err => console.error('[SH CHAT] Fetch contacts error:', err));
  }, [isSchoolHead, isOpen, currentUser, storedToken]);

  // 2. Fetch messages for active room
  useEffect(() => {
    if (!selectedRoomId || !isOpen || !storedToken) return;
    setLoading(true);

    fetch(getChatApiUrl(`/api/chat/rooms/${selectedRoomId}/messages`), {
      headers: { 'Authorization': `Bearer ${storedToken}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setMessages(data.messages || []);
      }
    })
    .catch(err => {
      console.error('[SH CHAT] Load messages error:', err);
      setMessages([]);
    })
    .finally(() => setLoading(false));
  }, [selectedRoomId, isOpen, storedToken]);

  // 3. Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading, uploading]);

  if (!isSchoolHead) return null;

  // Save pasted dev token
  const handleSaveDevToken = (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    
    localStorage.setItem('token', tokenInput.trim());
    localStorage.setItem('userRole', 'School Head');
    setStoredToken(tokenInput.trim());
    setTokenInput('');
  };

  // Start new chat with target SDO, HRMO, or Admin
  const handleStartNewChat = (contact) => {
    if (!storedToken) return;
    fetch(getChatApiUrl('/api/chat/room'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storedToken}`
      },
      body: JSON.stringify({ target_uid: contact.uid })
    })
    .then(res => res.json())
    .then(roomData => {
      if (roomData.success) {
        setSelectedRoomId(roomData.room_id);
        setShowNewChatSelector(false);

        // Refresh rooms list
        return fetch(getChatApiUrl('/api/chat/rooms'), {
          headers: { 'Authorization': `Bearer ${storedToken}` }
        });
      } else {
        throw new Error(roomData.error || 'Failed to initialize room');
      }
    })
    .then(res => res && res.json())
    .then(data => {
      if (data && data.success) {
        setRooms(data.rooms || []);
      }
    })
    .catch(err => console.error('[SH CHAT] Start new chat error:', err));
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    let roomId = selectedRoomId;

    // For HRMO / ADMIN tabs, if no room is selected yet, we auto-create/find it on send
    if ((activeBubble === 'HRMO' || activeBubble === 'ADMIN') && !roomId) {
      const contact = contacts[activeBubble];
      if (!contact) return;

      fetch(getChatApiUrl('/api/chat/room'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${storedToken}`
        },
        body: JSON.stringify({ target_uid: contact.uid })
      })
      .then(res => res.json())
      .then(roomData => {
        if (roomData.success) {
          setSelectedRoomId(roomData.room_id);
          postMessageToBackend(roomData.room_id);
        }
      })
      .catch(err => console.error('[SH CHAT] Auto room create error:', err));
      return;
    }

    if (roomId) {
      postMessageToBackend(roomId);
    }
  };

  const postMessageToBackend = (roomId) => {
    if (!inputMessage.trim() || !storedToken) return;
    const body = {
      room_id: roomId,
      message_text: inputMessage
    };

    setInputMessage('');

    fetch(getChatApiUrl('/api/chat/messages'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storedToken}`
      },
      body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const userUid = currentUser?.uid || localStorage.getItem('uid');
        setMessages(prev => [...prev, {
          ...data.message,
          sender_uid: userUid,
          first_name: currentUser?.first_name || 'You',
          last_name: currentUser?.last_name || '',
          sender_role: 'School Head',
          sender_position: currentUser?.position || null
        }]);
      }
    })
    .catch(err => console.error('[SH CHAT] Send message error:', err));
  };

  // Upload file buffer to backend (Azure storage / local fallback)
  const uploadImageFile = (file) => {
    const roomId = selectedRoomId;
    if (!roomId || !storedToken) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    fetch(getChatApiUrl('/api/chat/upload'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${storedToken}`
      },
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        return fetch(getChatApiUrl('/api/chat/messages'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${storedToken}`
          },
          body: JSON.stringify({
            room_id: roomId,
            message_type: 'image',
            attachment_url: data.url,
            message_text: 'Sent an image attachment'
          })
        });
      } else {
        throw new Error(data.error || 'Failed to upload image');
      }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const userUid = currentUser?.uid || localStorage.getItem('uid');
        setMessages(prev => [...prev, {
          ...data.message,
          sender_uid: userUid,
          first_name: currentUser?.first_name || 'You',
          last_name: currentUser?.last_name || '',
          sender_role: 'School Head',
          sender_position: currentUser?.position || null
        }]);
      }
    })
    .catch(err => {
      console.error('[SH CHAT] Upload attachment failed:', err);
      alert('Failed to send image attachment.');
    })
    .finally(() => setUploading(false));
  };

  // Capture copy-paste screenshot clipboards
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          uploadImageFile(file);
        }
      }
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageFile(file);
    }
  };

  // Filter rooms based on active tab bubble
  const displayedRooms = rooms.filter(room => {
    if (activeBubble === 'SDO') {
      return room.participant_role === 'School Division Office' || room.participant_role === 'Regional Division Office' || room.participant_role === 'RO/SDO' || room.participant_role === 'Ro/sdo';
    } else if (activeBubble === 'HRMO') {
      return room.participant_role === 'HRMO' || room.participant_role === 'Personnel';
    } else {
      return room.participant_role === 'Admin' || room.participant_role === 'Super Admin';
    }
  });

  const activeRoom = rooms.find(r => r.room_id === selectedRoomId);

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#1d4ed8',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 14px rgba(29, 78, 216, 0.4), 0 2px 5px rgba(0, 0, 0, 0.1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'rotate(135deg) scale(0.9)' : 'scale(1)',
        }}
        title="Open Support Chat"
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </button>

      {/* Chat Drawer Panel */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '96px',
          right: '24px',
          zIndex: 9998,
          width: '380px',
          height: '520px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          animation: 'slideUpSH 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideUpSH {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}} />

          {/* Header Part 1: Title & Role */}
          <div style={{
            backgroundColor: '#1e40af',
            padding: '16px 16px 12px 16px',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #1d4ed8'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', letterSpacing: '-0.02em' }}>InsightED Chat</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', opacity: 0.8 }}>Logged in as School Head</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: storedToken ? '#22c55e' : '#ef4444' }}></span>
              {storedToken ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          {!storedToken ? (
            /* DEV TOKEN MISSING SCREEN (Only shown on local development when token is not populated in localStorage) */
            <div style={{ flex: 1, padding: '24px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔑</div>
              <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#1e293b', fontWeight: '700' }}>Local Dev Authorization</h4>
              <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                Since this portal runs on a separate port (5173) than the main School Head app, you need to copy and paste your token from the main portal's localStorage here to test the chat feature locally.
              </p>
              <form onSubmit={handleSaveDevToken} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input 
                  type="text" 
                  value={tokenInput} 
                  onChange={(e) => setTokenInput(e.target.value)} 
                  placeholder="Paste JWT Token..." 
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button 
                  type="submit" 
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#1d4ed8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Save and Connect
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* Header Part 2: Bubble Tabs (SDO, HRMO, ADMIN) */}
              <div style={{
                display: 'flex',
                backgroundColor: '#1e40af',
                padding: '4px 8px 12px 8px',
                gap: '12px',
                justifyContent: 'space-around',
              }}>
                {[
                  { id: 'SDO', label: 'SDO', sub: 'Division Office', color: '#3b82f6' },
                  { id: 'HRMO', label: 'HRMO', sub: 'Human Resources', color: '#10b981' },
                  { id: 'ADMIN', label: 'ADMIN', sub: 'Support (999009)', color: '#f59e0b' }
                ].map((bubble) => {
                  const isActive = activeBubble === bubble.id;
                  return (
                    <button
                      key={bubble.id}
                      onClick={() => {
                        setActiveBubble(bubble.id);
                        setSelectedRoomId(null);
                        setShowNewChatSelector(false);
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        borderRadius: '12px',
                        border: 'none',
                        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: isActive ? 'inset 0 1px 3px rgba(0,0,0,0.2)' : 'none',
                        borderBottom: isActive ? `3px solid ${bubble.color}` : '3px solid transparent',
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: bubble.color,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        marginBottom: '4px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}>
                        {bubble.label[0]}
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: isActive ? 'bold' : 'normal' }}>{bubble.label}</span>
                      <span style={{ fontSize: '8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{bubble.sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Chat Panel Body */}
              <div style={{
                flex: 1,
                backgroundColor: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {!selectedRoomId ? (
                  /* HISTORY DIRECTORY & CONTACTS SELECTOR */
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>
                        {activeBubble === 'SDO' ? 'Active SDO Discussions' : `${activeBubble} Channel`}
                      </span>

                      {activeBubble === 'SDO' && (
                        <button
                          onClick={() => setShowNewChatSelector(!showNewChatSelector)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '16px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                          }}
                        >
                          <span>+ New Message</span>
                        </button>
                      )}
                    </div>

                    {/* SDO Directory dropdown selector */}
                    {showNewChatSelector && activeBubble === 'SDO' && (
                      <div style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '8px',
                        marginBottom: '12px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                      }}>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                          Select SDO Representative:
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                          {contacts.SDOs.map(sdo => (
                            <button
                              key={sdo.uid}
                              onClick={() => handleStartNewChat(sdo)}
                              style={{
                                textAlign: 'left',
                                padding: '8px',
                                backgroundColor: '#f1f5f9',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '600',
                                transition: 'background 0.2s',
                              }}
                              onMouseOver={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                              onMouseOut={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                            >
                              <span style={{ display: 'block', fontWeight: '700' }}>{sdo.first_name} {sdo.last_name}</span>
                              <span style={{ fontSize: '9px', color: '#64748b' }}>{sdo.role} {sdo.position ? `(${sdo.position})` : ''}</span>
                            </button>
                          ))}
                          {contacts.SDOs.length === 0 && (
                            <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
                              No division SDOs found
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Active chat rooms listing */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {displayedRooms.map((room) => (
                        <div
                          key={room.room_id}
                          onClick={() => setSelectedRoomId(room.room_id)}
                          style={{
                            padding: '12px',
                            backgroundColor: '#ffffff',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px'
                          }}
                          onMouseOver={e => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
                          }}
                          onMouseOut={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}>
                              {room.first_name} {room.last_name}
                            </span>
                            <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                              {room.last_message_time ? new Date(room.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>
                            {room.participant_role}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            color: '#94a3b8',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '4px'
                          }}>
                            {room.last_message ? room.last_message : 'Click to start conversation.'}
                          </span>
                        </div>
                      ))}
                      {displayedRooms.length === 0 && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', padding: '24px 0' }}>
                          <span style={{ fontSize: '12px' }}>No active discussions found.</span>
                          {activeBubble !== 'SDO' && contacts[activeBubble] && (
                            <button
                              onClick={() => handleStartNewChat(contacts[activeBubble])}
                              style={{
                                marginTop: '10px',
                                padding: '6px 12px',
                                backgroundColor: '#1d4ed8',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              Start Support Chat
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ACTIVE CHAT WINDOW */
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <button
                        onClick={() => {
                          setSelectedRoomId(null);
                          // Refresh rooms list
                          fetch(getChatApiUrl('/api/chat/rooms'), {
                            headers: { 'Authorization': `Bearer ${storedToken}` }
                          })
                          .then(res => res.json())
                          .then(data => { if (data.success) setRooms(data.rooms || []); });
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: '#1d4ed8',
                          border: '1px solid #1d4ed8',
                          borderRadius: '6px',
                          backgroundColor: 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        &larr; Back
                      </button>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeRoom?.first_name} {activeRoom?.last_name}
                      </span>
                    </div>

                    {/* Messages Flow */}
                    <div style={{
                      flex: 1,
                      padding: '16px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      {loading ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifySelf: 'center', color: '#94a3b8', fontSize: '13px', margin: 'auto' }}>
                          Loading thread...
                        </div>
                      ) : messages.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', color: '#94a3b8', margin: 'auto' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px', opacity: 0.6 }}>
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                          </svg>
                          <span style={{ fontSize: '12px', fontWeight: '500' }}>No messages yet.</span>
                          <span style={{ fontSize: '10px', marginTop: '4px' }}>Send a text or paste a screenshot to start.</span>
                        </div>
                      ) : (
                        messages.map((msg) => {
                          const selfUid = currentUser?.uid || localStorage.getItem('uid');
                          const isSelf = msg.sender_uid === selfUid;
                          const timestamp = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const displayRole = isSelf ? 'You' : `${msg.sender_role || activeBubble}${msg.sender_position ? ` (${msg.sender_position})` : ''}`;

                          return (
                            <div
                              key={msg.id}
                              style={{
                                alignSelf: isSelf ? 'flex-end' : 'flex-start',
                                maxWidth: '75%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: isSelf ? 'flex-end' : 'flex-start'
                              }}
                            >
                              <span style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', fontWeight: '500' }}>
                                {displayRole}
                              </span>
                              <div style={{
                                padding: '10px 14px',
                                borderRadius: isSelf ? '16px 16px 0px 16px' : '16px 16px 16px 0px',
                                backgroundColor: isSelf ? '#2563eb' : '#ffffff',
                                color: isSelf ? 'white' : '#1e293b',
                                fontSize: '13px',
                                lineHeight: '1.4',
                                boxShadow: isSelf ? '0 2px 5px rgba(37,99,235,0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                                border: isSelf ? 'none' : '1px solid #e2e8f0',
                                whiteSpace: 'pre-wrap',
                                overflow: 'hidden'
                              }}>
                                {msg.message_type === 'image' ? (
                                  <a href={msg.attachment_url} target="_blank" rel="noreferrer">
                                    <img 
                                      src={msg.attachment_url} 
                                      alt="Screenshot" 
                                      style={{ 
                                        maxWidth: '100%', 
                                        maxHeight: '180px', 
                                        borderRadius: '8px', 
                                        marginTop: '2px', 
                                        cursor: 'zoom-in',
                                        display: 'block'
                                      }} 
                                    />
                                  </a>
                                ) : (
                                  msg.message_text
                                )}
                              </div>
                              <span style={{ fontSize: '9px', color: '#94a3b8', marginTop: '3px' }}>
                                {timestamp}
                              </span>
                            </div>
                          );
                        })
                      )}

                      {/* Uploading progress overlay */}
                      {uploading && (
                        <div style={{ alignSelf: 'flex-end', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div style={{
                            padding: '10px 14px',
                            borderRadius: '16px 16px 0px 16px',
                            backgroundColor: '#bfdbfe', 
                            color: '#1e3a8a',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <svg className="animate-spin" style={{ width: '12px', height: '12px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25"></circle>
                              <path d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor"></path>
                            </svg>
                            Uploading image...
                          </div>
                        </div>
                      )}

                      {isTyping && (
                        <div style={{ alignSelf: 'flex-start', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
                            Typing...
                          </span>
                          <div style={{
                            padding: '8px 14px',
                            borderRadius: '16px 16px 16px 0px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            width: 'fit-content'
                          }}>
                            <span style={{ width: '6px', height: '6px', backgroundColor: '#94a3b8', borderRadius: '50%', display: 'inline-block', animation: 'bounceSH 1.4s infinite ease-in-out both' }}></span>
                            <span style={{ width: '6px', height: '6px', backgroundColor: '#94a3b8', borderRadius: '50%', display: 'inline-block', animation: 'bounceSH 1.4s infinite ease-in-out both 0.2s' }}></span>
                            <span style={{ width: '6px', height: '6px', backgroundColor: '#94a3b8', borderRadius: '50%', display: 'inline-block', animation: 'bounceSH 1.4s infinite ease-in-out both 0.4s' }}></span>
                          </div>
                          <style dangerouslySetInnerHTML={{__html: `
                            @keyframes bounceSH {
                              0%, 80%, 100% { transform: scale(0); }
                              40% { transform: scale(1.0); }
                            }
                          `}} />
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input form */}
                    <form
                      onSubmit={handleSendMessage}
                      style={{
                        padding: '12px 16px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        gap: '8px',
                        backgroundColor: '#ffffff',
                        alignItems: 'center'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!selectedRoomId || uploading}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          border: 'none',
                          cursor: (selectedRoomId && !uploading) ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        title="Attach Image"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                          <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                      </button>

                      <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onPaste={handlePaste}
                        placeholder="Message... (Paste Ctrl+V screenshots)"
                        disabled={!selectedRoomId || uploading}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: '24px',
                          border: '1px solid #cbd5e1',
                          outline: 'none',
                          fontSize: '13px',
                          transition: 'border-color 0.2s',
                          backgroundColor: (selectedRoomId && !uploading) ? 'white' : '#f1f5f9'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#1d4ed8'}
                        onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                      />
                      <button
                        type="submit"
                        disabled={!inputMessage.trim() || !selectedRoomId || uploading}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: (inputMessage.trim() && selectedRoomId && !uploading) ? '#2563eb' : '#cbd5e1',
                          color: 'white',
                          border: 'none',
                          cursor: (inputMessage.trim() && selectedRoomId && !uploading) ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default SchoolHeadChatWidget;
