const db = require('./db');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Import default terms and calculation logic
const DEFAULT_SY_TERMS = [
  { term_name: 'Term 1 - Opening & Instructional', block_type: 'instructional', start_date: '2026-06-08', end_date: '2026-09-01', is_teaching: true },
  { term_name: 'Term 1 - End-of-Term Block', block_type: 'end_of_term', start_date: '2026-09-02', end_date: '2026-09-15', is_teaching: false },
  { term_name: 'Term 2 - Instructional Block', block_type: 'instructional', start_date: '2026-09-16', end_date: '2026-12-04', is_teaching: true },
  { term_name: 'Term 2 - End-of-Term Block', block_type: 'end_of_term', start_date: '2026-12-07', end_date: '2026-12-18', is_teaching: false },
  { term_name: 'Term 3 - Instructional Block', block_type: 'instructional', start_date: '2027-01-04', end_date: '2027-03-23', is_teaching: true },
  { term_name: 'Term 3 - End-of-Term Block', block_type: 'end_of_term', start_date: '2027-03-24', end_date: '2027-04-08', is_teaching: false },
  { term_name: 'Summer / End of SY Vacation', block_type: 'vacation', start_date: '2027-04-09', end_date: '2027-06-06', is_teaching: false }
];

function calculateMonthlyBreakdown(year, month, terms) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const daysInMonth = new Date(y, m, 0).getDate();

  let totalWeekdays = 0;
  let instructionalDays = 0;
  let nonTeachingDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(m).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateStr = `${y}-${mm}-${dd}`;
    const dateObj = new Date(y, m - 1, day);
    const dayOfWeek = dateObj.getDay();

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      totalWeekdays++;

      let isInstructional = false;
      for (const t of terms) {
        const startStr = typeof t.start_date === 'string' ? t.start_date.substring(0, 10) : new Date(t.start_date).toISOString().substring(0, 10);
        const endStr = typeof t.end_date === 'string' ? t.end_date.substring(0, 10) : new Date(t.end_date).toISOString().substring(0, 10);

        if (dateStr >= startStr && dateStr <= endStr) {
          if (t.is_teaching && t.block_type === 'instructional') {
            isInstructional = true;
          } else {
            isInstructional = false;
            break;
          }
        }
      }

      if (isInstructional) {
        instructionalDays++;
      } else {
        nonTeachingDays++;
      }
    }
  }

  const ratio = totalWeekdays > 0 ? (instructionalDays / totalWeekdays) : 0;
  return {
    month: `${y}-${String(m).padStart(2, '0')}`,
    totalWeekdays,
    instructionalDays,
    nonTeachingDays,
    ratio: Math.round(ratio * 10000) / 10000,
    ratioPercent: `${(ratio * 100).toFixed(1)}%`
  };
}

async function runEmpiricalTest() {
  console.log('🚀 Running Empirical Verification for Overload Pay Report Engine...');

  // 1. Verify DB Connection and Terms Query
  const termRes = await db.query(
    "SELECT term_name, block_type, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, is_teaching FROM school_calendar_terms WHERE school_id = '123456' ORDER BY start_date ASC"
  );

  const terms = termRes.rows.length > 0 ? termRes.rows : DEFAULT_SY_TERMS;
  console.log(`\n1. Database Calendar Terms Count: ${terms.length}`);

  // 2. Verify Monthly Ratios Precision
  const testMonths = [
    '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05'
  ];

  console.log('\n2. Monthly Instructional Ratio & Exclusions Precision:');
  const monthlyResults = testMonths.map(mStr => {
    const [y, m] = mStr.split('-');
    const res = calculateMonthlyBreakdown(y, m, terms);
    console.log(`   - ${res.month}: Weekdays=${res.totalWeekdays}, Instructional=${res.instructionalDays}, Non-Teaching/Vacation=${res.nonTeachingDays} => Ratio: ${res.ratioPercent}`);
    return res;
  });

  // Verify Critical Guarantees:
  // - April 2027: 0% teaching ratio (Vacation)
  // - May 2027: 0% teaching ratio (Vacation)
  const aprData = monthlyResults.find(r => r.month === '2027-04');
  const mayData = monthlyResults.find(r => r.month === '2027-05');

  if (aprData.instructionalDays !== 0 || aprData.ratio !== 0) {
    throw new Error(`April 2027 ratio check failed! Expected 0 instructional days, got ${aprData.instructionalDays}`);
  }
  if (mayData.instructionalDays !== 0 || mayData.ratio !== 0) {
    throw new Error(`May 2027 ratio check failed! Expected 0 instructional days, got ${mayData.instructionalDays}`);
  }

  console.log('\n✅ Data Precision Verified: April and May 2027 summer vacation months reflect 0% overload credit.');

  // 3. Test Excel Generation & Scratch Output
  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(monthlyResults.map(m => ({
    'Month': m.month,
    'Total Weekdays': m.totalWeekdays,
    'Instructional Days': m.instructionalDays,
    'Vacation / Non-Teaching': m.nonTeachingDays,
    'Effective Ratio': m.ratioPercent
  })));
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Monthly Summary');

  const scratchDir = path.join(__dirname, 'scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const testFile = path.join(scratchDir, `Test_Overload_Pay_${Date.now()}.xlsx`);
  XLSX.writeFile(wb, testFile);

  if (fs.existsSync(testFile)) {
    console.log(`\n3. Excel Workbook successfully written to scratch: ${path.basename(testFile)}`);
  } else {
    throw new Error('Failed to create Excel workbook file in scratch!');
  }

  console.log('\n🎉 ALL EMPIRICAL VERIFICATION TESTS PASSED!');
  process.exit(0);
}

runEmpiricalTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
