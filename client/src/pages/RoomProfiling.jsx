import React, { useState, useEffect } from 'react';
import SearchableDropdown from '../components/SearchableDropdown';
import { useApp, POSITION_OPTIONS_BY_CATEGORY, RELIGION_OPTIONS, ETHNIC_GROUP_OPTIONS, MAJOR_OPTIONS, MINOR_OPTIONS, PRC_SPECIALIZATION_OPTIONS, COLLEGE_DEGREE_OPTIONS, TESDA_CERTIFICATION_OPTIONS, NEAP_TRAINING_OPTIONS } from '../context/AppContext';

export default function RoomProfiling() {
  const { personnel, scannedRoom } = useApp();
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [formData, setFormData] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('identity');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Map personnel to label strings for SearchableDropdown
  const teacherOptions = personnel.map(p => 
    `${p.lastName.toUpperCase()}, ${p.firstName} ${p.middleName || ''} (${p.position}) [${p.id}]`
  );

  const selectedTeacherLabel = selectedTeacherId
    ? (() => {
        const p = personnel.find(p => p.id === selectedTeacherId);
        return p ? `${p.lastName.toUpperCase()}, ${p.firstName} ${p.middleName || ''} (${p.position}) [${p.id}]` : '';
      })()
    : '';

  const handleTeacherChange = (label) => {
    const match = label.match(/\[([^\]]+)\]$/);
    if (match && match[1]) {
      setSelectedTeacherId(match[1]);
    }
  };

  // Handle teacher selection change
  useEffect(() => {
    if (selectedTeacherId) {
      const teacher = personnel.find(p => p.id === selectedTeacherId);
      if (teacher) {
        setFormData({ ...teacher });
        setIsSubmitted(false);
        setIsUnlocked(false);
        setEnteredPasscode('');
        setErrorMessage('');
      }
    } else {
      setFormData(null);
      setIsUnlocked(false);
      setEnteredPasscode('');
      setErrorMessage('');
    }
  }, [selectedTeacherId]);

  const compressProfile = (data) => {
    return {
      id: data.id,
      fn: data.firstName || '',
      ln: data.lastName || '',
      mn: data.middleName || '',
      sx: data.sexAtBirth || '',
      cs: data.civilStatus || '',
      sp: data.soloParent || 'No',
      rl: data.religion || '',
      eg: data.ethnicGroup || '',
      bd: data.birthdate || '',
      ps: data.philsysNo || '',
      ty: data.type || 'teaching',
      psn: data.position || '',
      fs: data.fundSource || 'National',
      na: data.natureOfAppointment || 'Regular',
      nt: data.noTin || false,
      tn: data.tin || '',
      cd: data.collegeDegree || '',
      mj: data.major || '',
      mr: data.minor || '',
      el: data.eligibility || '',
      pr: data.prcSpecialization || 'N/A',
      ntr: data.neapTrainingRows || [],
      ctr: data.certificationRows || [],
      otr: data.otherTrainingRows || []
    };
  };

  const handleVerifyPasscode = (e) => {
    e.preventDefault();
    if (!enteredPasscode) return;
    const cleanCode = enteredPasscode.trim().toUpperCase();
    const latestTeacher = personnel.find(p => p.id === selectedTeacherId);
    const correctCode = latestTeacher && latestTeacher.profilingCode ? latestTeacher.profilingCode.trim().toUpperCase() : '';
    if (cleanCode === correctCode) {
      setIsUnlocked(true);
      setErrorMessage('');
      if (latestTeacher) {
        setFormData({ ...latestTeacher });
      }
    } else {
      setErrorMessage('Incorrect passcode. Please request the correct code from the School Head.');
    }
  };

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleTrainingChange = (key, index, field, value) => {
    const rows = [...(formData[key] || [])];
    rows[index] = { ...rows[index], [field]: value };

    if (field === 'startDate' || field === 'endDate') {
      const cleanStart = rows[index].startDate && typeof rows[index].startDate === 'string' ? rows[index].startDate.substring(0, 10) : '';
      const cleanEnd = rows[index].endDate && typeof rows[index].endDate === 'string' ? rows[index].endDate.substring(0, 10) : '';
      const start = cleanStart ? new Date(cleanStart + "T00:00:00") : null;
      const end = cleanEnd ? new Date(cleanEnd + "T00:00:00") : null;
      
      if (start && end && end < start) {
        rows[index].endDate = '';
        rows[index].days = 0;
        rows[index].totalHours = 0;
      } else if (start && end && end >= start) {
        const days = Math.round((end - start) / 86400000) + 1;
        rows[index].days = days;
        rows[index].hoursPerDay = 8;
        rows[index].totalHours = days * 8;
      } else {
        rows[index].days = 0;
        rows[index].totalHours = 0;
      }
    }

    handleFieldChange(key, rows);
  };

  const addTrainingRow = (key) => {
    const rows = [...(formData[key] || [])];
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    rows.push({ clientKey: tempId, title: '', startDate: '', endDate: '', days: 0, hoursPerDay: 8, totalHours: 0 });
    handleFieldChange(key, rows);
  };

  const removeTrainingRow = (key, index) => {
    const rows = [...(formData[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData) {
      const compressed = compressProfile(formData);
      localStorage.setItem(`pending_submission_${formData.id}`, JSON.stringify(compressed));
      setIsSubmitted(true);
    }
  };

  const getAge = (dobString) => {
    if (!dobString) return null;
    const birth = new Date(dobString + "T00:00:00");
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const currentAge = formData ? getAge(formData.birthdate) : null;

  if (isSubmitted) {
    const compressed = compressProfile(formData);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(JSON.stringify(compressed))}`;

    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '16px' }}>
        <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '24px', textAlign: 'center', background: '#FFFFFF' }}>
          <div className="card-inner" style={{ padding: '40px 24px', display: 'grid', gap: '20px', justifyItems: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--blue-50)', display: 'grid', placeItems: 'center', fontSize: '36px' }}>
              📱
            </div>
            <h1 style={{ color: 'var(--navy)', fontSize: '22px', fontWeight: 800, margin: 0 }}>Profiling Complete!</h1>
            <p className="subtext" style={{ fontSize: '14px', color: 'var(--muted)', margin: 0, lineHeight: '1.4' }}>
              Your profile data for <strong>{formData.firstName} {formData.lastName}</strong> has been locally packed into the submission QR code below.
            </p>
            
            {/* Dynamic Submission QR Code Card */}
            <div style={{ 
              padding: '16px', 
              background: '#FFFFFF', 
              border: '2px solid var(--line)', 
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 16px rgba(0,0,0,0.05)'
            }}>
              <img 
                src={qrUrl} 
                alt="Submission QR Code" 
                style={{ width: '200px', height: '200px', border: '1px solid #ddd', borderRadius: '8px' }}
              />
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--navy)', textTransform: 'uppercase' }}>
                SUBMISSION QR CODE
              </span>
            </div>

            <div style={{ marginTop: '10px', fontSize: '13px', padding: '12px', background: '#F0F9FF', borderRadius: '12px', border: '1.5px solid var(--line)', color: 'var(--blue)', lineHeight: '1.4' }}>
              👉 <strong>Action Required:</strong> Present this screen to your <strong>School Head or Administrator</strong>. They will scan it using their camera to ingest your profile into the school roster instantly.
            </div>

            <button 
              className="btn secondary" 
              onClick={() => {
                setSelectedTeacherId('');
                setFormData(null);
                setIsSubmitted(false);
              }}
              style={{ marginTop: '10px', minWidth: '200px' }}
            >
              Done / Switch Teacher
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <header style={{ 
        background: 'linear-gradient(135deg, var(--navy), var(--blue))', 
        padding: '24px 28px', 
        borderRadius: '24px', 
        color: 'white',
        boxShadow: '0 10px 30px rgba(8, 49, 95, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          INSIGHTED ROOM PORTAL
        </span>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          Personnel Profiling
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
          Verify and complete your profile for <strong>{scannedRoom || 'Faculty Room 1'}</strong>. No registration required.
        </p>
      </header>

      {/* Roster Search / Selection */}
      {(!formData || !isUnlocked) && (
        <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '22px' }}>
          <div className="card-inner" style={{ display: 'grid', gap: '10px' }}>
            <label htmlFor="teacher-select" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 800 }}>
              Who is profiling?
            </label>
            <SearchableDropdown
              options={teacherOptions}
              value={selectedTeacherLabel}
              onChange={handleTeacherChange}
              placeholder="Search / Select your name..."
            />
          </div>
        </article>
      )}

      {formData && !isUnlocked && (
        <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '22px', background: '#FFFFFF', overflow: 'hidden' }}>
          <div className="card-inner" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--blue-50)', display: 'grid', placeItems: 'center', fontSize: '32px', marginBottom: '8px' }}>
              🔐
            </div>
            
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)', margin: '0 0 8px 0' }}>
                Verify Identity
              </h2>
              <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, maxWidth: '400px', lineHeight: '1.5' }}>
                To view or edit the profile of <strong>{formData.firstName} {formData.lastName}</strong>, please enter your 6-character profiling passcode.
              </p>
            </div>

            <form onSubmit={handleVerifyPasscode} style={{ width: '100%', maxWidth: '320px', display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                <label htmlFor="passcode-input" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 800 }}>
                  Enter 6-Character Passcode
                </label>
                <input
                  id="passcode-input"
                  type="text"
                  maxLength={6}
                  placeholder="e.g. M1A2R3"
                  value={enteredPasscode}
                  onChange={(e) => setEnteredPasscode(e.target.value.toUpperCase())}
                  style={{
                    textAlign: 'center',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    letterSpacing: '0.2em',
                    padding: '12px',
                    textTransform: 'uppercase',
                    fontFamily: 'monospace',
                    borderRadius: '12px',
                    border: errorMessage ? '2px solid var(--red)' : '1.5px solid var(--line)'
                  }}
                  autoFocus
                  required
                />
              </div>

              {errorMessage && (
                <div style={{ color: 'var(--red)', fontSize: '12px', fontWeight: 700, padding: '8px 12px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                  ⚠️ {errorMessage}
                </div>
              )}

              <button type="submit" className="btn" style={{ width: '100%', marginTop: '4px' }}>
                Verify & Unlock Form
              </button>
            </form>
          </div>
        </article>
      )}

      {formData && isUnlocked && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Sub Navigation Tabs */}
          <div className="tabs" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`tab ${activeSubTab === 'identity' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('identity')}
            >
              👤 Personal Identity
            </button>
            <button
              type="button"
              className={`tab ${activeSubTab === 'employment' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('employment')}
            >
              💼 Employment Info
            </button>
            <button
              type="button"
              className={`tab ${activeSubTab === 'education' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('education')}
            >
              🎓 Education & Eligibility
            </button>
            <button
              type="button"
              className={`tab ${activeSubTab === 'trainings' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('trainings')}
            >
              🏅 Trainings
            </button>
          </div>

          {/* Form Card */}
          <article className="card" style={{ border: '2.5px solid var(--outline)', borderRadius: '22px', background: '#FFFFFF' }}>
            <div className="card-inner" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Tab Content: Identity */}
              {activeSubTab === 'identity' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>
                    Personal Information (Read-Only)
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', textTransform: 'none', fontWeight: 'normal', marginTop: '4px' }}>
                      To request corrections to your personal information, please notify the School Head.
                    </span>
                  </div>
                  
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>First Name</label>
                    <input 
                      type="text" 
                      value={formData.firstName || ''} 
                      disabled
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Last Name</label>
                    <input 
                      type="text" 
                      value={formData.lastName || ''} 
                      disabled
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Middle Name</label>
                    <input 
                      type="text" 
                      value={formData.middleName || ''} 
                      disabled
                    />
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Sex at Birth</label>
                    <select
                      value={formData.sexAtBirth || ''}
                      disabled
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Civil Status</label>
                    <select
                      value={formData.civilStatus || ''}
                      disabled
                    >
                      <option value="">Select...</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Separated">Separated</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Solo Parent?</label>
                    <select
                      value={formData.soloParent || ''}
                      disabled
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Religion</label>
                    <select
                      value={formData.religion || ''}
                      disabled
                    >
                      <option value="">Select...</option>
                      {RELIGION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Ethnic Group</label>
                    <select
                      value={formData.ethnicGroup || ''}
                      disabled
                    >
                      <option value="">Select...</option>
                      {ETHNIC_GROUP_OPTIONS.map(eg => <option key={eg} value={eg}>{eg}</option>)}
                    </select>
                  </div>

                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>IDs & Dates</div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Birthdate</label>
                    <input 
                      type="date" 
                      value={formData.birthdate ? formData.birthdate.substring(0,10) : ''} 
                      disabled
                    />
                    {currentAge !== null && (
                      <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        Age: <strong>{currentAge} years old</strong>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>PhilSys Card Number (Optional)</label>
                    <input 
                      type="text" 
                      value={formData.philsysNo || ''} 
                      disabled
                    />
                  </div>
                </div>
              )}

              {/* Tab Content: Employment */}
              {activeSubTab === 'employment' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>
                    Position & Appointment (Read-Only)
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', textTransform: 'none', fontWeight: 'normal', marginTop: '4px' }}>
                      To request corrections to your employment details, please notify the School Head.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Personnel Category</label>
                    <select
                      value={formData.type || ''}
                      disabled
                    >
                      <option value="teaching">Teaching</option>
                      <option value="teaching-related">Teaching-Related</option>
                      <option value="non-teaching">Non-Teaching</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Position / Designation</label>
                    <select
                      value={formData.position || ''}
                      disabled
                    >
                      {(POSITION_OPTIONS_BY_CATEGORY[formData.type] || []).map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Fund Source</label>
                    <select
                      value={formData.fundSource || ''}
                      disabled
                    >
                      <option value="National">National</option>
                      <option value="Local (SEF)">Local (SEF)</option>
                      <option value="School Funds">School Funds</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Nature of Appointment</label>
                    <select
                      value={formData.natureOfAppointment || ''}
                      disabled
                    >
                      <option value="Regular">Regular Permanent</option>
                      <option value="Provisional">Provisional</option>
                      <option value="Contractual">Contractual</option>
                      <option value="Substitute">Substitute</option>
                      <option value="Casual/Emergency">Casual/Emergency</option>
                      <option value="Job Order/Contract of Service">Job Order/Contract of Service</option>
                      <option value="Volunteer">Volunteer</option>
                    </select>
                  </div>

                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>TIN Identification</div>

                  <div style={{ display: 'grid', gap: '4px', gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="noTin"
                        checked={formData.noTin || false}
                        disabled
                        style={{ width: '18px', height: '18px' }}
                      />
                      <label htmlFor="noTin" style={{ margin: 0, fontSize: '11px', fontWeight: 800 }}>
                        I do not have a TIN number (No TIN)
                      </label>
                    </div>
                  </div>

                  {!formData.noTin && (
                    <div style={{ display: 'grid', gap: '4px', gridColumn: '1 / -1' }}>
                      <label>TIN Number</label>
                      <input 
                        type="text" 
                        value={formData.tin === 'N/A' ? '' : (formData.tin || '')} 
                        disabled
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Education */}
              {activeSubTab === 'education' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>
                    Baccalaureate Degree & eligibilities (Read-Only)
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', textTransform: 'none', fontWeight: 'normal', marginTop: '4px' }}>
                      To request corrections to your educational credentials or eligibilities, please notify the School Head.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: '4px', gridColumn: '1 / -1' }}>
                    <label>Degree Finished / Baccalaureate</label>
                    <select
                      value={formData.collegeDegree || ''}
                      disabled
                    >
                      <option value="">Select Degree...</option>
                      {COLLEGE_DEGREE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  {formData.collegeDegree && formData.collegeDegree !== 'NONE' && formData.collegeDegree.toUpperCase().includes('EDUCATION') && (
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <label>Major</label>
                      <select
                        value={formData.major || ''}
                        disabled
                      >
                        <option value="">Select Major...</option>
                        {MAJOR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <label>Minor</label>
                    <select
                      value={formData.minor || ''}
                      disabled
                    >
                      <option value="">Select Minor...</option>
                      {MINOR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>Eligibilities</div>

                  <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {(Array.isArray(formData.eligibility) 
                        ? formData.eligibility 
                        : String(formData.eligibility || '').split(',').map(s => s.trim()).filter(Boolean)
                      ).map((el, i) => (
                        <div key={i} className="multi-select-chip" style={{ background: 'var(--blue-50)', border: '1px solid var(--line)', color: 'var(--navy)', padding: '6px 12px' }}>
                          {el}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="profile-subsection" style={{ gridColumn: '1 / -1' }}>PRC Specialization</div>

                  <div style={{ display: 'grid', gap: '4px', gridColumn: '1 / -1' }}>
                    <label>PRC Specialization</label>
                    <select
                      value={formData.prcSpecialization || ''}
                      disabled
                    >
                      <option value="">Select PRC Specialization...</option>
                      {PRC_SPECIALIZATION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Tab Content: Trainings */}
              {activeSubTab === 'trainings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* NEAP SECTION */}
                  <div style={{ border: '1.5px solid var(--line)', padding: '20px', borderRadius: '16px', background: 'var(--blue-50)22' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '15px' }}>NEAP Trainings</h3>
                      <button className="btn secondary" type="button" onClick={() => addTrainingRow('neapTrainingRows')}>
                        + Add NEAP Row
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(formData.neapTrainingRows || []).map((tr, index) => (
                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '12px', background: 'white', border: '1px solid var(--line)', borderRadius: '12px' }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Training Program</label>
                            <SearchableDropdown
                              options={['OTHER (SPECIFY CUSTOM...)', ...NEAP_TRAINING_OPTIONS]}
                              value={tr.title || ''}
                              onChange={(val) => handleTrainingChange('neapTrainingRows', index, 'title', val)}
                              placeholder="SELECT NEAP TRAINING OR TYPE CUSTOM..."
                              allowCustom={true}
                            />
                            {(tr.title === 'OTHER (SPECIFY CUSTOM...)' || (tr.title && !NEAP_TRAINING_OPTIONS.includes(tr.title))) && (
                              <input
                                type="text"
                                placeholder="Type custom NEAP training title *"
                                value={tr.title === 'OTHER (SPECIFY CUSTOM...)' ? '' : tr.title}
                                onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'title', e.target.value.toUpperCase())}
                                style={{ marginTop: '6px', fontSize: '13px', background: '#FFFBEB', borderColor: '#F59E0B' }}
                                required
                              />
                            )}
                          </div>
                          <div>
                            <label>Start Date</label>
                            <input 
                              type="date" 
                              max={new Date().toISOString().split('T')[0]}
                              value={tr.startDate ? tr.startDate.substring(0, 10) : ''} 
                              onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'startDate', e.target.value)}
                            />
                          </div>
                          <div>
                            <label>End Date</label>
                            <input 
                              type="date" 
                              max={new Date().toISOString().split('T')[0]}
                              value={tr.endDate ? tr.endDate.substring(0, 10) : ''} 
                              onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'endDate', e.target.value)}
                            />
                          </div>
                          <div>
                            <label>Hours</label>
                            <input 
                              type="number" 
                              value={tr.totalHours || 0} 
                              onChange={(e) => handleTrainingChange('neapTrainingRows', index, 'totalHours', Number(e.target.value))}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                            <button className="btn danger" type="button" onClick={() => removeTrainingRow('neapTrainingRows', index)} style={{ width: '100%', minHeight: '38px' }}>
                              Delete Row
                            </button>
                          </div>
                        </div>
                      ))}
                      {(formData.neapTrainingRows || []).length === 0 && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>No NEAP training records encoded.</p>
                      )}
                    </div>
                  </div>

                  {/* TESDA / CERTIFICATION SECTION */}
                  <div style={{ border: '1.5px solid var(--line)', padding: '20px', borderRadius: '16px', background: 'var(--blue-50)22' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '15px' }}>TESDA NC / Certifications</h3>
                      <button className="btn secondary" type="button" onClick={() => addTrainingRow('certificationRows')}>
                        + Add Cert Row
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(formData.certificationRows || []).map((tr, index) => (
                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '12px', background: 'white', border: '1px solid var(--line)', borderRadius: '12px' }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Certification Title</label>
                            <SearchableDropdown
                              options={TESDA_CERTIFICATION_OPTIONS}
                              value={tr.title || ''}
                              onChange={(val) => handleTrainingChange('certificationRows', index, 'title', val)}
                              placeholder="SELECT TESDA NC / CERTIFICATION..."
                            />
                          </div>
                          <div>
                            <label>Start Date</label>
                            <input 
                              type="date" 
                              max={new Date().toISOString().split('T')[0]}
                              value={tr.startDate ? tr.startDate.substring(0, 10) : ''} 
                              onChange={(e) => handleTrainingChange('certificationRows', index, 'startDate', e.target.value)}
                            />
                          </div>
                          <div>
                            <label>End Date</label>
                            <input 
                              type="date" 
                              max={new Date().toISOString().split('T')[0]}
                              value={tr.endDate ? tr.endDate.substring(0, 10) : ''} 
                              onChange={(e) => handleTrainingChange('certificationRows', index, 'endDate', e.target.value)}
                            />
                          </div>
                          <div>
                            <label>Hours</label>
                            <input 
                              type="number" 
                              value={tr.totalHours || 0} 
                              onChange={(e) => handleTrainingChange('certificationRows', index, 'totalHours', Number(e.target.value))}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                            <button className="btn danger" type="button" onClick={() => removeTrainingRow('certificationRows', index)} style={{ width: '100%', minHeight: '38px' }}>
                              Delete Row
                            </button>
                          </div>
                        </div>
                      ))}
                      {(formData.certificationRows || []).length === 0 && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>No TESDA or Certification records encoded.</p>
                      )}
                    </div>
                  </div>

                  {/* OTHER TRAININGS SECTION */}
                  <div style={{ border: '1.5px solid var(--line)', padding: '20px', borderRadius: '16px', background: 'var(--blue-50)22' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '15px' }}>Other Trainings</h3>
                      <button className="btn secondary" type="button" onClick={() => addTrainingRow('otherTrainingRows')}>
                        + Add Training Row
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(formData.otherTrainingRows || []).map((tr, index) => (
                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '12px', background: 'white', border: '1px solid var(--line)', borderRadius: '12px' }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Training Title</label>
                            <SearchableDropdown
                              options={[
                                'OTHER (SPECIFY CUSTOM...)',
                                'SCHOOL-BASED INSET',
                                'DIVISION TRAINING WORKSHOP',
                                'REGIONAL MASS TRAINING',
                                'LEARNING ACTION CELL',
                                'RESEARCH CAPABILITY BUILDING',
                                'DRRM TRAINING',
                                'CHILD PROTECTION TRAINING',
                                'MENTAL HEALTH AND PSYCHOSOCIAL SUPPORT'
                              ]}
                              value={tr.title || ''}
                              onChange={(val) => handleTrainingChange('otherTrainingRows', index, 'title', val)}
                              placeholder="SELECT OTHER TRAINING OR TYPE CUSTOM..."
                              allowCustom={true}
                            />
                            {(tr.title === 'OTHER (SPECIFY CUSTOM...)' || (tr.title && ![
                              'SCHOOL-BASED INSET',
                              'DIVISION TRAINING WORKSHOP',
                              'REGIONAL MASS TRAINING',
                              'LEARNING ACTION CELL',
                              'RESEARCH CAPABILITY BUILDING',
                              'DRRM TRAINING',
                              'CHILD PROTECTION TRAINING',
                              'MENTAL HEALTH AND PSYCHOSOCIAL SUPPORT'
                            ].includes(tr.title))) && (
                              <input
                                type="text"
                                placeholder="Type custom training title *"
                                value={tr.title === 'OTHER (SPECIFY CUSTOM...)' ? '' : tr.title}
                                onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'title', e.target.value.toUpperCase())}
                                style={{ marginTop: '6px', fontSize: '13px', background: '#FFFBEB', borderColor: '#F59E0B' }}
                                required
                              />
                            )}
                          </div>
                          <div>
                            <label>Start Date</label>
                            <input 
                              type="date" 
                              max={new Date().toISOString().split('T')[0]}
                              value={tr.startDate ? tr.startDate.substring(0, 10) : ''} 
                              onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'startDate', e.target.value)}
                            />
                          </div>
                          <div>
                            <label>End Date</label>
                            <input 
                              type="date" 
                              max={new Date().toISOString().split('T')[0]}
                              value={tr.endDate ? tr.endDate.substring(0, 10) : ''} 
                              onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'endDate', e.target.value)}
                            />
                          </div>
                          <div>
                            <label>Hours</label>
                            <input 
                              type="number" 
                              value={tr.totalHours || 0} 
                              onChange={(e) => handleTrainingChange('otherTrainingRows', index, 'totalHours', Number(e.target.value))}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                            <button className="btn danger" type="button" onClick={() => removeTrainingRow('otherTrainingRows', index)} style={{ width: '100%', minHeight: '38px' }}>
                              Delete Row
                            </button>
                          </div>
                        </div>
                      ))}
                      {(formData.otherTrainingRows || []).length === 0 && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>No other training records encoded.</p>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </article>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button 
              type="submit" 
              className="btn"
              style={{ padding: '12px 24px', fontSize: '15px' }}
            >
              Submit Profiling Data
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
