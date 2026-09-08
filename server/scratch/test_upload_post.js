const fs = require('fs');
const path = require('path');
const http = require('http');

async function testUpload() {
  const sampleFile = 'E:\\ESF7 Official\\eSF7-R04A-Laguna-108348_MAJAYJAY-ES-UPDATED.xlsb';
  if (!fs.existsSync(sampleFile)) {
    console.error('Sample file not found at:', sampleFile);
    return;
  }

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const fileData = fs.readFileSync(sampleFile);
  const schoolId = '800099';

  let postData = '';
  postData += `--${boundary}\r\n`;
  postData += `Content-Disposition: form-data; name="school_id"\r\n\r\n${schoolId}\r\n`;
  postData += `--${boundary}\r\n`;
  postData += `Content-Disposition: form-data; name="file"; filename="sample_esf7.xlsb"\r\n`;
  postData += `Content-Type: application/vnd.ms-excel.sheet.binary.macroEnabled.12\r\n\r\n`;

  const postDataEnd = `\r\n--${boundary}--\r\n`;

  const payloadLength = Buffer.byteLength(postData) + fileData.length + Buffer.byteLength(postDataEnd);

  const req = http.request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/esf7-upload',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payloadLength
    }
  }, (res) => {
    let resBody = '';
    res.on('data', chunk => resBody += chunk);
    res.on('end', () => {
      console.log('Upload response status:', res.statusCode);
      try {
        console.log('Response body:', JSON.parse(resBody));
      } catch (e) {
        console.log('Raw body:', resBody);
      }
    });
  });

  req.on('error', (err) => console.error('Upload request error:', err));
  req.write(postData);
  req.write(fileData);
  req.write(postDataEnd);
  req.end();
}

testUpload();
