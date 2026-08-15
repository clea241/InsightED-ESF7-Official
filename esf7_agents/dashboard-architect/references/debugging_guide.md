# ESF7 Dashboard Debugging & Flow Checklist

Use this guide when investigating issues, flow breaks, or unexpected behavior in [Dashboard.jsx](file:///e:/InsightED%20-%20ESF7%20Official/client/src/pages/Dashboard.jsx).

---

## 🔍 Common Debugging Scenarios & Fix Patterns

### 1. Stats Loading / Memory Leak on Component Unmount
* **Symptom**: Console warning `"Can't perform a React state update on an unmounted component"`.
* **Root Cause**: `api.getDashboardStats()` resolution fires after component unmounts.
* **Fix Check**: Verify `isCancelled` flag is checked before `setStats(data)` and `setLoading(false)` inside `useEffect`:
  ```javascript
  useEffect(() => {
    let isCancelled = false;
    const fetchDashboardStats = async () => {
      setLoading(true);
      try {
        const data = await api.getDashboardStats();
        if (!isCancelled) setStats(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    fetchDashboardStats();
    return () => { isCancelled = true; };
  }, [schoolInfo?.schoolId]);
  ```

### 2. High Number of "Unspecified" Age Brackets
* **Symptom**: Demographic card shows majority of staff in `'Unspecified'`.
* **Root Cause**: Property key mismatch on personnel objects. The code supports `birthdate`, `dateOfBirth`, `dob`, `birthDate`.
* **Fix Check**: Ensure upstream imports or form saved data map birthdate to one of these standardized keys.

### 3. Out-of-Field Teaching KPI Showing 0% or Incorrect Counts
* **Symptom**: Out-of-Field KPI card displays 0 evaluated teachers or misaligned subject matches.
* **Root Cause**:
  * Teachers have missing `degreeMajor` / `major` or set to string `'NONE'` / `'N/A'`.
  * Subject names in `workloadRows` use different casing or abbreviations (e.g. `'MATH'` vs `'MATHEMATICS'`).
* **Fix Check**: Verify string matching uses `.toUpperCase().trim()` and checks `sub.includes(major) || major.includes(sub)`.

### 4. Overload Pay Eligibility Badge Showing False During Instructional Term
* **Symptom**: Term 1/2/3 badge displays `⛔ No Overload Pay` when it should be eligible.
* **Root Cause**: Backend API `term_calendar_status` returned `block_type !== 'INSTRUCTIONAL'` or `overload_pay_eligible: false`.
* **Fix Check**: Ensure backend calendar controller checks the DepEd SY 2026-2027 instructional date ranges (June 8 - Sept 1, Sept 16 - Dec 4, Jan 4 - Mar 23).

### 5. Stale Stats After Modal Excel Upload (`ESF7UploadModal`)
* **Symptom**: After uploading an ESF7 file via modal, dashboard numbers (roster count, organized classes) don't immediately refresh.
* **Root Cause**: `ESF7UploadModal` finished uploading but `fetchDashboardStats()` or AppContext state refresh wasn't called on modal close.
* **Fix Check**: Ensure `ESF7UploadModal` triggers context refetch or triggers `fetchDashboardStats()` callback upon upload success.

---

## 🛠 Pre-Commit / Pre-Deployment Checklist

Before approving changes to `Dashboard.jsx`:

- [ ] **Context Hooks intact**: `useApp()` continues to supply `personnel`, `classSections`, `schoolInfo`, `setActiveView`.
- [ ] **View switches valid**: All `setActiveView` target strings exist in `App.jsx` views router.
- [ ] **No mutated global state**: Direct array mutations (`personnel.sort()`, `classSections.push()`) are strictly avoided; pure array iterations (`filter`, `map`, `reduce`, `forEach`) are used.
- [ ] **Styles & Responsive Layout**: Check grid layout compatibility across mobile (single column) and desktop (3-column hero/stat row).
- [ ] **Static Audit Passes**: Run `node esf7_agents/dashboard-architect/scripts/audit_dashboard_flows.js`.
