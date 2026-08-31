const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../client/src/pages/Workload.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const targetSnippet = `                                      {/* Usual Days & Minutes */}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                        {row.subject === 'ADVISORY' ? (
                                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0284c7', background: '#e0f2fe', padding: '4px 10px', borderRadius: '6px', display: 'inline-block', border: '1px solid #bae6fd' }}>
                                            FIXED MONDAY to FRIDAY
                                          </span>
                                        ) : (
                                                }}
                                              >
                                                {day}
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>`;

const replacementSnippet = `                                      {/* Usual Days & Minutes */}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                        {row.subject === 'ADVISORY' ? (
                                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0284c7', background: '#e0f2fe', padding: '4px 10px', borderRadius: '6px', display: 'inline-block', border: '1px solid #bae6fd' }}>
                                            FIXED MONDAY to FRIDAY
                                          </span>
                                        ) : (
                                          <div style={{ display: 'flex', gap: '3px', flexWrap: 'nowrap', alignItems: 'center' }}>
                                            {['M', 'T', 'W', 'TH', 'F', 'SAT', 'SUN'].map(day => {
                                              const rowDays = (Array.isArray(row.days) && row.days.length > 0)
                                                ? row.days
                                                : (row.daySchedule || row.day_schedule)
                                                  ? String(row.daySchedule || row.day_schedule).split(',').map(s => s.trim())
                                                  : ['M', 'T', 'W', 'TH', 'F'];
                                              const isSelected = rowDays.some(d => {
                                                const s = String(d).toUpperCase().trim();
                                                if (day === 'M') return s === 'M' || s.startsWith('MON');
                                                if (day === 'T') return s === 'T' || s.startsWith('TUE');
                                                if (day === 'W') return s === 'W' || s.startsWith('WED');
                                                if (day === 'TH') return s === 'TH' || s.startsWith('THU');
                                                if (day === 'F') return s === 'F' || s.startsWith('FRI');
                                                if (day === 'SAT') return s === 'SAT';
                                                if (day === 'SUN') return s === 'SUN';
                                                return false;
                                              });
                                              return (
                                                <button
                                                  key={day}
                                                  type="button"
                                                  disabled={row.subject === 'ADVISORY'}
                                                  onClick={() => {
                                                     if (row.subject === 'ADVISORY') return;
                                                     const newDays = isSelected ? rowDays.filter(x => x !== day) : [...rowDays, day];
                                                     updateWorkloadRowFields(idx, { days: newDays });
                                                  }}
                                                  style={{
                                                    padding: '2px 5px',
                                                    fontSize: '10px',
                                                    fontWeight: '800',
                                                    borderRadius: '4px',
                                                    border: 'none',
                                                    background: isSelected ? 'var(--navy)' : '#f1f5f9',
                                                    color: isSelected ? 'white' : '#64748b',
                                                    cursor: row.subject === 'ADVISORY' ? 'not-allowed' : 'pointer'
                                                  }}
                                                >
                                                  {day}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {/* Live Minutes Badge */}
                                        {(() => {
                                          const isHgp = String(row.subject || '').toUpperCase().trim() === 'HGP' || String(row.subject || '').toUpperCase().trim().includes('HOMEROOM GUIDANCE');
                                          const isAdv = row.subject === 'ADVISORY';
                                          const diffM = (!row.startTime || !row.endTime) ? (isAdv ? 60 : 0) : getTimeDiffMins(row.startTime, row.endTime);
                                          const rDays = (Array.isArray(row.days) && row.days.length > 0)
                                            ? row.days
                                            : (row.daySchedule || row.day_schedule)
                                              ? String(row.daySchedule || row.day_schedule).split(',').map(s => s.trim())
                                              : (isAdv ? ['M', 'T', 'W', 'TH', 'F'] : []);
                                          const daysCount = isAdv ? 5 : rDays.length;
                                          const weeklyM = diffM * daysCount;

                                          if (isHgp) {
                                            return (
                                              <span style={{ fontSize: '10px', fontWeight: '800', color: '#0369a1', background: '#f0f9ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bae6fd', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                ⏱️ {diffM > 0 ? diffM : 60} mins/day ({diffM > 0 ? diffM : 60} mins/wk · Program duration only)
                                              </span>
                                            );
                                          }
                                          if (isAdv) {
                                            return (
                                              <span style={{ fontSize: '10px', fontWeight: '800', color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bae6fd', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                ⏱️ 60 mins/day · 300 mins/wk (5.0 hrs)
                                              </span>
                                            );
                                          }
                                          if (diffM > 0) {
                                            return (
                                              <span style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', background: '#f0fdf4', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                ⏱️ {diffM} mins/day · {weeklyM} mins/wk ({ (weeklyM / 60).toFixed(1) } hrs)
                                              </span>
                                            );
                                          }
                                          return (
                                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8' }}>
                                              ⏱️ 0 mins
                                            </span>
                                          );
                                        })()}
                                      </div>`;

// Normalize line endings
const normContent = content.replace(/\r\n/g, '\n');
const normTarget = targetSnippet.replace(/\r\n/g, '\n');
const normReplacement = replacementSnippet.replace(/\r\n/g, '\n');

if (normContent.includes(normTarget)) {
  const newContent = normContent.replace(normTarget, normReplacement);
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('✓ Successfully replaced in Workload.jsx');
} else {
  console.error('Target snippet not found in Workload.jsx');
}
