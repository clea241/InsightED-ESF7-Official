const http = require("http");

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 5000,
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              data: JSON.parse(body),
              headers: res.headers,
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              raw: body,
              headers: res.headers,
            });
          }
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error("Request Timeout (>8s)"));
    });

    if (data) {
      req.write(typeof data === "string" ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runHealthCheck() {
  console.log("--- Testing Backend Health & API Endpoints for 900230 ---");
  const baseUrl = "http://localhost:5000";

  try {
    // 1. Test Login
    console.log("\n1. Testing Auth Login (/api/auth/passcode-login)...");
    const loginRes = await request(
      `${baseUrl}/api/auth/passcode-login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { schoolId: "900230", passcode: "123456" },
    );

    console.log(`  Status: ${loginRes.status}`);
    if (loginRes.status !== 200 || !loginRes.data?.token) {
      console.error("  ❌ Login Failed:", loginRes.data || loginRes.raw);
      return;
    }
    const token = loginRes.data.token;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "x-school-id": "900230",
      "Content-Type": "application/json",
    };
    console.log("  ✅ Login Success! Token acquired.");

    // 2. Test School Profile Endpoint
    console.log("\n2. Testing /api/school?school_id=900230...");
    const schoolRes = await request(`${baseUrl}/api/school?school_id=900230`, {
      headers: authHeaders,
    });
    console.log(`  Status: ${schoolRes.status}`);
    if (schoolRes.status === 200) {
      console.log(
        "  ✅ School Profile loaded:",
        schoolRes.data?.schoolName,
        "MCOC:",
        schoolRes.data?.curricularOffering,
      );
    } else {
      console.error(
        "  ❌ School Profile Failed:",
        schoolRes.data || schoolRes.raw,
      );
    }

    // 3. Test Personnel Endpoint
    console.log("\n3. Testing /api/personnel?school_id=900230...");
    const personnelRes = await request(
      `${baseUrl}/api/personnel?school_id=900230`,
      { headers: authHeaders },
    );
    console.log(`  Status: ${personnelRes.status}`);
    if (personnelRes.status === 200) {
      const count = Array.isArray(personnelRes.data)
        ? personnelRes.data.length
        : 0;
      console.log(`  ✅ Personnel loaded: ${count} records.`);
    } else {
      console.error(
        "  ❌ Personnel Endpoint Failed:",
        personnelRes.data || personnelRes.raw,
      );
    }

    // 4. Test Sections Endpoint
    console.log("\n4. Testing /api/sections?school_id=900230...");
    const sectionsRes = await request(
      `${baseUrl}/api/sections?school_id=900230`,
      { headers: authHeaders },
    );
    console.log(`  Status: ${sectionsRes.status}`);
    if (sectionsRes.status === 200) {
      console.log("  ✅ Sections loaded.");
    } else {
      console.error(
        "  ❌ Sections Failed:",
        sectionsRes.data || sectionsRes.raw,
      );
    }

    // 5. Test Workloads Endpoint
    console.log("\n5. Testing /api/workloads?school_id=900230...");
    const workloadsRes = await request(
      `${baseUrl}/api/workloads?school_id=900230`,
      { headers: authHeaders },
    );
    console.log(`  Status: ${workloadsRes.status}`);
    if (workloadsRes.status === 200) {
      console.log("  ✅ Workloads loaded.");
    } else {
      console.error(
        "  ❌ Workloads Failed:",
        workloadsRes.data || workloadsRes.raw,
      );
    }

    // 6. Test Salary Matrix
    console.log("\n6. Testing /api/salary-matrix...");
    const salaryRes = await request(`${baseUrl}/api/salary-matrix`, {
      headers: authHeaders,
    });
    console.log(`  Status: ${salaryRes.status}`);
    if (salaryRes.status === 200) {
      console.log("  ✅ Salary Matrix loaded.");
    } else {
      console.error(
        "  ❌ Salary Matrix Failed:",
        salaryRes.data || salaryRes.raw,
      );
    }

    // 7. Test Allowances
    console.log("\n7. Testing /api/allowances?school_id=900230...");
    const allowancesRes = await request(
      `${baseUrl}/api/allowances?school_id=900230`,
      { headers: authHeaders },
    );
    console.log(`  Status: ${allowancesRes.status}`);
    if (allowancesRes.status === 200) {
      console.log("  ✅ Allowances loaded.");
    } else {
      console.error(
        "  ❌ Allowances Failed:",
        allowancesRes.data || allowancesRes.raw,
      );
    }

    // 8. Test Dashboard Stats
    console.log("\n8. Testing /api/dashboard/stats...");
    const dashboardRes = await request(`${baseUrl}/api/dashboard/stats`, {
      headers: authHeaders,
    });
    console.log(`  Status: ${dashboardRes.status}`);
    if (dashboardRes.status === 200) {
      console.log("  ✅ Dashboard stats loaded.");
    } else {
      console.error(
        "  ❌ Dashboard stats Failed:",
        dashboardRes.data || dashboardRes.raw,
      );
    }

    // 9. Test Check Harvest Status
    console.log("\n9. Testing /api/esf7-upload/check/900230...");
    const harvestRes = await request(
      `${baseUrl}/api/esf7-upload/check/900230`,
      { headers: authHeaders },
    );
    console.log(`  Status: ${harvestRes.status}`);
    console.log("  Response:", harvestRes.data);
  } catch (err) {
    console.error(
      "\n❌ Health Check Encountered Error / Timeout:",
      err.message,
    );
  }
}

runHealthCheck();
