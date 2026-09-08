const fs = require('fs');
const filePath = 'client/src/pages/SchoolProfile.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add inclusive state
const oldStateHook = `  // Form State separated by level
  const [hasElemSpecialPrograms, setHasElemSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [elemSpecialProgram, setElemSpecialProgram] = useState(false);

  const [hasJhsSpecialPrograms, setHasJhsSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [jhsSpecialPrograms, setJhsSpecialPrograms] = useState([]);

  const [shsCurriculumModel, setShsCurriculumModel] = useState('Standard K-12 SHS Curriculum');
  const [isSaving, setIsSaving] = useState(false);`;

const newStateHook = `  // Form State separated by level
  const [hasElemSpecialPrograms, setHasElemSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [elemSpecialProgram, setElemSpecialProgram] = useState(false);

  // Inclusive Programs State (ALS, SNED, IPED, MADRASAH)
  const [hasElemInclusive, setHasElemInclusive] = useState('no'); // 'yes' | 'no'
  const [elemInclusivePrograms, setElemInclusivePrograms] = useState([]); // ['ALS-ES', 'SNED-ES', 'IPED-ES', 'MADRASAH-ES']

  const [hasJhsSpecialPrograms, setHasJhsSpecialPrograms] = useState('no'); // 'yes' | 'no'
  const [jhsSpecialPrograms, setJhsSpecialPrograms] = useState([]);

  const [hasJhsInclusive, setHasJhsInclusive] = useState('no'); // 'yes' | 'no'
  const [jhsInclusivePrograms, setJhsInclusivePrograms] = useState([]); // ['ALS-JHS', 'SNED-JHS', 'IPED-JHS', 'MADRASAH-JHS']

  const [hasShsInclusive, setHasShsInclusive] = useState('no'); // 'yes' | 'no'
  const [shsInclusivePrograms, setShsInclusivePrograms] = useState([]); // ['ALS-SHS', 'SNED-SHS', 'IPED-SHS']

  const [shsCurriculumModel, setShsCurriculumModel] = useState('Standard K-12 SHS Curriculum');
  const [isSaving, setIsSaving] = useState(false);`;

content = content.replace(oldStateHook, newStateHook);

// 2. In loadConfig, load inclusive programs
const oldLoadConfigInner = `        if (config) {
          setHasElemSpecialPrograms(config.hasElemSpecialPrograms ? 'yes' : 'no');
          setElemSpecialProgram(!!config.elemSpecialProgram);

          setHasJhsSpecialPrograms(config.hasJhsSpecialPrograms ? 'yes' : 'no');
          setJhsSpecialPrograms(Array.isArray(config.jhsSpecialPrograms) ? config.jhsSpecialPrograms : []);

          if (config.shsCurriculumModel) {
            setShsCurriculumModel(config.shsCurriculumModel);
          }
        } else if (schoolInfo.specialPrograms || schoolInfo.shsCurriculumModel) {
          const progs = Array.isArray(schoolInfo.specialPrograms) ? schoolInfo.specialPrograms : [];
          const hasElem = progs.includes('SPECIAL SCIENCE ELEMENTARY SCHOOL');
          const jhsProgs = progs.filter(p => p !== 'SPECIAL SCIENCE ELEMENTARY SCHOOL');

          setHasElemSpecialPrograms(hasElem ? 'yes' : 'no');
          setElemSpecialProgram(hasElem);

          setHasJhsSpecialPrograms(jhsProgs.length > 0 ? 'yes' : 'no');
          setJhsSpecialPrograms(jhsProgs);

          if (schoolInfo.shsCurriculumModel) {
            setShsCurriculumModel(schoolInfo.shsCurriculumModel);
          }
        }`;

const newLoadConfigInner = `        const allInclusive = Array.isArray(config?.inclusivePrograms)
          ? config.inclusivePrograms
          : (Array.isArray(schoolInfo?.inclusivePrograms) ? schoolInfo.inclusivePrograms : []);

        const elemInc = allInclusive.filter(p => p.endsWith('-ES'));
        setHasElemInclusive(elemInc.length > 0 ? 'yes' : 'no');
        setElemInclusivePrograms(elemInc);

        const jhsInc = allInclusive.filter(p => p.endsWith('-JHS'));
        setHasJhsInclusive(jhsInc.length > 0 ? 'yes' : 'no');
        setJhsInclusivePrograms(jhsInc);

        const shsInc = allInclusive.filter(p => p.endsWith('-SHS'));
        setHasShsInclusive(shsInc.length > 0 ? 'yes' : 'no');
        setShsInclusivePrograms(shsInc);

        if (config) {
          setHasElemSpecialPrograms(config.hasElemSpecialPrograms ? 'yes' : 'no');
          setElemSpecialProgram(!!config.elemSpecialProgram);

          setHasJhsSpecialPrograms(config.hasJhsSpecialPrograms ? 'yes' : 'no');
          setJhsSpecialPrograms(Array.isArray(config.jhsSpecialPrograms) ? config.jhsSpecialPrograms : []);

          if (config.shsCurriculumModel) {
            setShsCurriculumModel(config.shsCurriculumModel);
          }
        } else if (schoolInfo.specialPrograms || schoolInfo.shsCurriculumModel) {
          const progs = Array.isArray(schoolInfo.specialPrograms) ? schoolInfo.specialPrograms : [];
          const hasElem = progs.includes('SPECIAL SCIENCE ELEMENTARY SCHOOL');
          const jhsProgs = progs.filter(p => p !== 'SPECIAL SCIENCE ELEMENTARY SCHOOL');

          setHasElemSpecialPrograms(hasElem ? 'yes' : 'no');
          setElemSpecialProgram(hasElem);

          setHasJhsSpecialPrograms(jhsProgs.length > 0 ? 'yes' : 'no');
          setJhsSpecialPrograms(jhsProgs);

          if (schoolInfo.shsCurriculumModel) {
            setShsCurriculumModel(schoolInfo.shsCurriculumModel);
          }
        }`;

content = content.replace(oldLoadConfigInner, newLoadConfigInner);

// 3. In handleConfirmAndProceed, bundle selectedInclusive
const oldConfigDataSave = `      const configData = {
        hasElemSpecialPrograms: hasElemSpecialPrograms === 'yes',
        elemSpecialProgram: hasElemSpecialPrograms === 'yes' && elemSpecialProgram,
        hasJhsSpecialPrograms: hasJhsSpecialPrograms === 'yes',
        jhsSpecialPrograms: hasJhsSpecialPrograms === 'yes' ? jhsSpecialPrograms : [],
        specialPrograms: selectedPrograms,
        shsCurriculumModel: isSHSActive ? shsCurriculumModel : null,
        schoolYear: schoolInfo.schoolYear || 'SY 26-27'
      };`;

const newConfigDataSave = `      const selectedInclusive = [
        ...(isElemActive && hasElemInclusive === 'yes' ? elemInclusivePrograms : []),
        ...(isJHSActive && hasJhsInclusive === 'yes' ? jhsInclusivePrograms : []),
        ...(isSHSActive && hasShsInclusive === 'yes' ? shsInclusivePrograms : [])
      ];

      const configData = {
        hasElemSpecialPrograms: hasElemSpecialPrograms === 'yes',
        elemSpecialProgram: hasElemSpecialPrograms === 'yes' && elemSpecialProgram,
        hasJhsSpecialPrograms: hasJhsSpecialPrograms === 'yes',
        jhsSpecialPrograms: hasJhsSpecialPrograms === 'yes' ? jhsSpecialPrograms : [],
        specialPrograms: selectedPrograms,
        hasElemInclusive: hasElemInclusive === 'yes',
        elemInclusivePrograms: hasElemInclusive === 'yes' ? elemInclusivePrograms : [],
        hasJhsInclusive: hasJhsInclusive === 'yes',
        jhsInclusivePrograms: hasJhsInclusive === 'yes' ? jhsInclusivePrograms : [],
        hasShsInclusive: hasShsInclusive === 'yes',
        shsInclusivePrograms: hasShsInclusive === 'yes' ? shsInclusivePrograms : [],
        inclusivePrograms: selectedInclusive,
        shsCurriculumModel: isSHSActive ? shsCurriculumModel : null,
        schoolYear: schoolInfo.schoolYear || 'SY 26-27'
      };`;

content = content.replace(oldConfigDataSave, newConfigDataSave);

// Also update setSchoolInfo in handleConfirmAndProceed
const oldSetSchoolInfo = `      if (setSchoolInfo) {
        setSchoolInfo(prev => ({
          ...prev,
          specialPrograms: selectedPrograms,
          shsCurriculumModel: configData.shsCurriculumModel
        }));
      }`;

const newSetSchoolInfo = `      if (setSchoolInfo) {
        setSchoolInfo(prev => ({
          ...prev,
          specialPrograms: selectedPrograms,
          shsCurriculumModel: configData.shsCurriculumModel,
          inclusivePrograms: selectedInclusive
        }));
      }`;

content = content.replace(oldSetSchoolInfo, newSetSchoolInfo);

// 4. Elementary Card: Add Inclusive Education Programs question
const oldElemCardEnd = `                  {hasElemSpecialPrograms === 'yes' && (
                    <div style={{ borderTop: '1px dashed #6ee7b7', paddingTop: '14px' }}>
                      <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 18px',
                        borderRadius: '10px',
                        border: '1.5px solid #10b981',
                        background: '#ffffff',
                        cursor: 'pointer',
                        fontWeight: '800',
                        fontSize: '13px',
                        color: '#047857'
                      }}>
                        <input
                          type="checkbox"
                          checked={elemSpecialProgram}
                          onChange={(e) => setElemSpecialProgram(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                        />
                        <FiAward size={16} /> SPECIAL SCIENCE ELEMENTARY SCHOOL (SSES)
                      </label>
                    </div>
                  )}
                </div>`;

const newElemCardEnd = `                  {hasElemSpecialPrograms === 'yes' && (
                    <div style={{ borderTop: '1px dashed #6ee7b7', paddingTop: '14px' }}>
                      <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 18px',
                        borderRadius: '10px',
                        border: '1.5px solid #10b981',
                        background: '#ffffff',
                        cursor: 'pointer',
                        fontWeight: '800',
                        fontSize: '13px',
                        color: '#047857'
                      }}>
                        <input
                          type="checkbox"
                          checked={elemSpecialProgram}
                          onChange={(e) => setElemSpecialProgram(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                        />
                        <FiAward size={16} /> SPECIAL SCIENCE ELEMENTARY SCHOOL (SSES)
                      </label>
                    </div>
                  )}

                  {/* Elementary Inclusive Education Programs Question */}
                  <div style={{ marginTop: '16px', borderTop: '1px solid #a7f3d0', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: hasElemInclusive === 'yes' ? '12px' : '0' }}>
                      <div>
                        <label style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                          Does your Elementary School implement Inclusive Education Programs (ALS, SNED, IPED, Madrasah)?
                        </label>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#047857' }}>
                          Select authorized inclusive offerings (e.g. ALS-ES, SNED-ES, IPED-ES, MADRASAH-ES).
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setHasElemInclusive('yes');
                            if (elemInclusivePrograms.length === 0) setElemInclusivePrograms(['ALS-ES', 'SNED-ES']);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasElemInclusive === 'yes' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                            background: hasElemInclusive === 'yes' ? '#10b981' : '#ffffff',
                            color: hasElemInclusive === 'yes' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHasElemInclusive('no');
                            setElemInclusivePrograms([]);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasElemInclusive === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                            background: hasElemInclusive === 'no' ? '#64748b' : '#ffffff',
                            color: hasElemInclusive === 'no' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          NO
                        </button>
                      </div>
                    </div>

                    {hasElemInclusive === 'yes' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        {[
                          { tag: 'ALS-ES', label: 'ALS (Alternative Learning System)' },
                          { tag: 'SNED-ES', label: 'SNED (Special Needs Education)' },
                          { tag: 'IPED-ES', label: 'IPED (Indigenous Peoples Education)' },
                          { tag: 'MADRASAH-ES', label: 'MADRASAH (ALIVE Program)' }
                        ].map(item => {
                          const isChecked = elemInclusivePrograms.includes(item.tag);
                          return (
                            <label
                              key={item.tag}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: isChecked ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#047857' : '#475569'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setElemInclusivePrograms(prev => 
                                    prev.includes(item.tag) ? prev.filter(t => t !== item.tag) : [...prev, item.tag]
                                  );
                                }}
                                style={{ width: '15px', height: '15px', accentColor: '#10b981' }}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>`;

content = content.replace(oldElemCardEnd, newElemCardEnd);

// 5. JHS Card: Add Inclusive Education Programs question
const oldJhsCardEnd = `                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                        {JHS_PROGRAM_OPTIONS.map((item) => {
                          const isChecked = jhsSpecialPrograms.includes(item.label);
                          return (
                            <label
                              key={item.code}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                border: isChecked ? '1.5px solid #2563eb' : '1px solid #dbeafe',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#1e40af' : '#334155',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleJhsProgram(item.label)}
                                style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                              />
                              <FiAward size={15} />
                              <span style={{ flex: 1, lineHeight: '1.4' }}>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>`;

const newJhsCardEnd = `                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                        {JHS_PROGRAM_OPTIONS.map((item) => {
                          const isChecked = jhsSpecialPrograms.includes(item.label);
                          return (
                            <label
                              key={item.code}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                border: isChecked ? '1.5px solid #2563eb' : '1px solid #dbeafe',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#1e40af' : '#334155',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleJhsProgram(item.label)}
                                style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                              />
                              <FiAward size={15} />
                              <span style={{ flex: 1, lineHeight: '1.4' }}>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* JHS Inclusive Education Programs Question */}
                  <div style={{ marginTop: '16px', borderTop: '1px solid #bfdbfe', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: hasJhsInclusive === 'yes' ? '12px' : '0' }}>
                      <div>
                        <label style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                          Does your Junior High School implement Inclusive Education Programs (ALS, SNED, IPED, Madrasah)?
                        </label>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#1d4ed8' }}>
                          Select authorized JHS inclusive offerings (e.g. ALS-JHS, SNED-JHS, IPED-JHS, MADRASAH-JHS).
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setHasJhsInclusive('yes');
                            if (jhsInclusivePrograms.length === 0) setJhsInclusivePrograms(['ALS-JHS', 'SNED-JHS']);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasJhsInclusive === 'yes' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            background: hasJhsInclusive === 'yes' ? '#2563eb' : '#ffffff',
                            color: hasJhsInclusive === 'yes' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHasJhsInclusive('no');
                            setJhsInclusivePrograms([]);
                          }}
                          style={{
                            padding: '6px 18px',
                            borderRadius: '8px',
                            border: hasJhsInclusive === 'no' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                            background: hasJhsInclusive === 'no' ? '#64748b' : '#ffffff',
                            color: hasJhsInclusive === 'no' ? '#ffffff' : '#475569',
                            fontWeight: '800',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          NO
                        </button>
                      </div>
                    </div>

                    {hasJhsInclusive === 'yes' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        {[
                          { tag: 'ALS-JHS', label: 'ALS (Alternative Learning System)' },
                          { tag: 'SNED-JHS', label: 'SNED (Special Needs Education)' },
                          { tag: 'IPED-JHS', label: 'IPED (Indigenous Peoples Education)' },
                          { tag: 'MADRASAH-JHS', label: 'MADRASAH (ALIVE Program)' }
                        ].map(item => {
                          const isChecked = jhsInclusivePrograms.includes(item.tag);
                          return (
                            <label
                              key={item.tag}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: isChecked ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                background: isChecked ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                                color: isChecked ? '#1d4ed8' : '#475569'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setJhsInclusivePrograms(prev => 
                                    prev.includes(item.tag) ? prev.filter(t => t !== item.tag) : [...prev, item.tag]
                                  );
                                }}
                                style={{ width: '15px', height: '15px', accentColor: '#2563eb' }}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>`;

content = content.replace(oldJhsCardEnd, newJhsCardEnd);

// 6. Summary Card
const oldSummaryInner = `                {isSHSActive && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', color: '#7c3aed' }}>Senior High Model:</span>
                    <span style={{ fontWeight: '800', color: '#5b21b6', textAlign: 'right' }}>
                      {shsCurriculumModel}
                    </span>
                  </div>
                )}`;

const newSummaryInner = `                {isSHSActive && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: '#7c3aed' }}>Senior High Model:</span>
                    <span style={{ fontWeight: '800', color: '#5b21b6', textAlign: 'right' }}>
                      {shsCurriculumModel}
                    </span>
                  </div>
                )}

                {/* Inclusive Programs Summary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', paddingTop: '4px' }}>
                  <span style={{ fontWeight: '700', color: '#0284c7' }}>Inclusive Programs:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end' }}>
                    {[
                      ...(hasElemInclusive === 'yes' ? elemInclusivePrograms : []),
                      ...(hasJhsInclusive === 'yes' ? jhsInclusivePrograms : []),
                      ...(hasShsInclusive === 'yes' ? shsInclusivePrograms : [])
                    ].length > 0 ? (
                      [
                        ...(hasElemInclusive === 'yes' ? elemInclusivePrograms : []),
                        ...(hasJhsInclusive === 'yes' ? jhsInclusivePrograms : []),
                        ...(hasShsInclusive === 'yes' ? shsInclusivePrograms : [])
                      ].map(tag => (
                        <span key={tag} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' }}>
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontWeight: '800', color: '#64748b' }}>None</span>
                    )}
                  </div>
                </div>`;

content = content.replace(oldSummaryInner, newSummaryInner);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated SchoolProfile.jsx with Inclusive Education offerings!');
