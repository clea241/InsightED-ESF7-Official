const http = require('http');

async function run() {
  const payload = JSON.stringify({
    school_id: '123456',
    school_year: 'SY 26-27',
    type: 'teaching',
    salutation: 'MR.',
    first_name: 'TESTADD',
    middle_name: 'N/A',
    last_name: 'USERADD',
    name_extension: undefined,
    sex_at_birth: undefined,
    civil_status: undefined,
    solo_parent: undefined,
    religion: undefined,
    ethnic_group: undefined,
    birthdate: undefined,
    philsys_no: undefined,
    tin: undefined,
    no_tin: undefined,
    employee_no: undefined,
    deped_email: null,
    deployment_status: 'Own Station',
    position: 'TEACHER I',
    designation: undefined,
    fund_source: undefined,
    nature_of_appointment: undefined,
    hiring_arrangement: undefined,
    grade_levels_taught: [],
    college_degree: undefined,
    major: undefined,
    minor: undefined,
    post_graduate_degree: 'N/A',
    discipline: undefined,
    eligibility: undefined,
    prc_specialization: undefined,
    prc_license_no: undefined,
    prc_expiry_date: undefined
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/personnel',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  console.log('Sending exact browser POST...');
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('Response status:', res.statusCode);
      console.log('Response data:', data);
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
  });

  req.write(payload);
  req.end();
}

run();
