const { parseRedisConfig } = require('/mnt/insighted-esf7-staging/server/utils/redisConfig');
const Redis = require('/mnt/insighted-esf7-staging/server/node_modules/ioredis');

async function testAuthClient() {
  console.log('--- Testing Node/ioredis with Redis requirepass on port 6380 ---');

  // Test 1: Connect WITHOUT password (should fail)
  const envNoPass = { REDIS_HOST: '127.0.0.1', REDIS_PORT: '6380', REDIS_PASSWORD: '' };
  const cfgNoPass = parseRedisConfig(envNoPass);
  const clientNoPass = new Redis({
    host: cfgNoPass.host,
    port: cfgNoPass.port,
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  let failedAsExpected = false;
  try {
    await clientNoPass.connect();
    await clientNoPass.ping();
  } catch (err) {
    failedAsExpected = true;
    console.log('1. Correctly rejected unauthenticated client:', err.message);
  } finally {
    clientNoPass.disconnect();
  }

  if (!failedAsExpected) {
    throw new Error('Expected unauthenticated connection to fail, but it succeeded!');
  }

  // Test 2: Connect WITH password (should succeed)
  const envWithPass = { REDIS_HOST: '127.0.0.1', REDIS_PORT: '6380', REDIS_PASSWORD: 'SecretTestRedisAuth123' };
  const cfgWithPass = parseRedisConfig(envWithPass);
  const clientWithPass = new Redis({
    host: cfgWithPass.host,
    port: cfgWithPass.port,
    password: cfgWithPass.password,
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  await clientWithPass.connect();
  const pong = await clientWithPass.ping();
  console.log('2. Authenticated client ping:', pong);

  // Test stream XADD and XREAD on authenticated instance
  const streamKey = 'test:auth:stream';
  const entryId = await clientWithPass.xadd(streamKey, '*', 'testField', 'testValue');
  console.log('3. Authenticated XADD succeeded, entry ID:', entryId);

  const len = await clientWithPass.xlen(streamKey);
  console.log('4. Authenticated XLEN:', len);

  clientWithPass.disconnect();

  console.log('✅ REDIS AUTH INTEGRATION VERIFIED: App correctly handles password authentication and rejects missing auth.');
  process.exit(0);
}

testAuthClient().catch(err => {
  console.error('❌ REDIS AUTH TEST FAILED:', err);
  process.exit(1);
});
