// In-memory stand-in for the backend, installed with page/context.route(). It mirrors the real draft contract:
// PUT /api/school/draft answers only after "committing", enforces baseVersion (409 on mismatch), GET returns the version.
// Tests can make it slow, make it fail, or take it "down" (503 everywhere, including /api/health).

export function createFakeServer() {
  const server = {
    draft: { payload: null, version: 0, updatedAt: null },
    puts: [],            // every accepted draft save (payload snapshots)
    putAttempts: 0,
    putLatencyMs: 0,
    down: false,         // everything answers 503 (HTML, like a gateway)
    failDraftPuts: false, // only draft saves fail with 504
    requireToken: null,  // when set, any /api call (except health) without exactly this bearer token answers 401 (rotated JWT_SECRET)
    unauthorized: 0,     // how many calls were answered 401
    roster: null,        // optional personnel list to serve instead of the default single teacher
    lateUndertime: []    // every accepted POST /api/overload-late-undertime body (Overload tardiness / DTR logs)
  };
  return server;
}

const school = {
  schoolId: '302261',
  schoolName: 'E2E ELEMENTARY SCHOOL',
  region: 'REGION IV-A',
  division: 'E2E DIVISION',
  district: 'E2E DISTRICT',
  schoolYear: 'SY 26-27',
  numberOfShifts: 1,
  curricularOffering: ['Elementary', 'JHS', 'SHS']
};

const teacher = {
  id: 'PER-302261-001', prn: 'PRN-E2E-001', schoolId: '302261', firstName: 'JUAN', lastName: 'DELA CRUZ',
  position: 'Teacher I', type: 'teaching', positionCategory: 'TEACHING', workloadRows: [], designations: [], trainings: []
};

export const overloadedTeacher = {
  ...teacher,
  // 7 teaching hours Monday to Friday = 1 hour of daily overload, so the teacher appears in the Overload pickers.
  workloadRows: [{ id: 'wl-1', category: 'Teaching', subject: 'MATHEMATICS', gradeLevel: 'Grade 7', sectionId: '', startTime: '07:00', endTime: '14:00', days: ['M', 'T', 'W', 'TH', 'F'], term: '1st' }]
};

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const gatewayHtml = (route, status) => route.fulfill({ status, contentType: 'text/html', body: '<html><body><h1>' + status + ' Gateway Timeout</h1></body></html>' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function installFakeApi(target, server) {
  await target.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^.*\/api/, '/api');
    const method = req.method();

    if (server.down) return gatewayHtml(route, 503);

    if (server.requireToken && p !== '/api/health' && req.headers()['authorization'] !== `Bearer ${server.requireToken}`) {
      server.unauthorized += 1;
      return json(route, { error: 'Authentication required: missing or invalid token.' }, 401);
    }

    if (p === '/api/health') return json(route, { status: 'ok', db: 'up', queue: { mode: 'redis', redisReachable: true } });

    if (p === '/api/school/draft' && method === 'GET') {
      return json(route, { payload: server.draft.payload, updatedAt: server.draft.updatedAt, version: server.draft.version });
    }
    if (p === '/api/school/draft' && method === 'PUT') {
      server.putAttempts += 1;
      if (server.putLatencyMs) await sleep(server.putLatencyMs);
      if (server.failDraftPuts) return gatewayHtml(route, 504);
      const body = JSON.parse(req.postData() || '{}');
      const base = body.baseVersion;
      if (base !== null && base !== undefined && Number(base) !== server.draft.version) {
        return json(route, { conflict: true, currentVersion: server.draft.version }, 409);
      }
      server.draft = { payload: body.payload, version: server.draft.version + 1, updatedAt: new Date().toISOString() };
      server.puts.push(JSON.parse(JSON.stringify(body.payload)));
      return json(route, { success: true, version: server.draft.version, updatedAt: server.draft.updatedAt });
    }

    if (p === '/api/overload-late-undertime' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      server.lateUndertime.push(body);
      return json(route, { success: true, ...body }, 201);
    }

    if (p === '/api/school' && method === 'GET') return json(route, school);
    if (p === '/api/node-status/school' && method === 'GET') return json(route, { exists: false });
    if (p === '/api/personnel' && method === 'GET') return json(route, server.roster || [teacher]);
    if (p === '/api/dashboard/stats') return json(route, {});
    if (method === 'GET') return json(route, []);
    return json(route, { success: true });
  });
}

// Pre-authenticate: the app trusts localStorage for the session (no server round trip on load).
export async function seedSession(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('__e2e_seeded_once')) {
      localStorage.setItem('token', 'e2e.fake.token');
      localStorage.setItem('remembered_user', JSON.stringify({ id: 'e2e-user', school_id: '302261', role: 'school_head', pin: '123456', name: 'E2E School Head' }));
      localStorage.setItem('school_id', '302261');
      localStorage.setItem('schoolId', '302261');
      localStorage.setItem('activeSchoolId', '302261');
      localStorage.setItem('insighted_active_view', 'school');
      localStorage.setItem('__e2e_seeded_once', '1'); // later reloads (e.g. after logout) must NOT silently log in again
    }
  });
}

// Simulates logging in again (the real login screen needs the auth backend, which is outside this suite).
export async function loginAgain(page, token = 'e2e.fake.token') {
  await page.evaluate((tok) => {
    localStorage.setItem('token', tok);
    localStorage.setItem('remembered_user', JSON.stringify({ id: 'e2e-user', school_id: '302261', role: 'school_head', pin: '123456', name: 'E2E School Head' }));
    localStorage.setItem('school_id', '302261');
    localStorage.setItem('schoolId', '302261');
    localStorage.setItem('activeSchoolId', '302261');
    localStorage.setItem('insighted_active_view', 'school');
  }, token);
  await page.goto('/?view=school');
}
