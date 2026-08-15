const http = require('http');

http.get('http://localhost:5000/api/personnel/autofill-template', { headers: { 'x-school-id': '502624' } }, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const list = JSON.parse(data);
    console.log(`Fetched ${list.length} draft personnel records.`);

    const postData = JSON.stringify({ personnelList: list });
    const req = http.request('http://localhost:5000/api/personnel/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-school-id': '502624',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res2) => {
      let body2 = '';
      res2.on('data', c => body2 += c);
      res2.on('end', () => {
        console.log('Result:', body2);
        process.exit(0);
      });
    });
    req.write(postData);
    req.end();
  });
});
