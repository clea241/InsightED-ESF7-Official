const db = require('./server/db');
async function test() {
  try {
    await db.query("UPDATE submission_queue SET status='pending' WHERE id=6");
    const qw = require('./server/queue_worker');
    await qw.processNextJob();
    console.log("DONE");
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
test();
