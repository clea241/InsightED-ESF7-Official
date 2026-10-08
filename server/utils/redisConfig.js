// Single place that reads and validates the Redis connection settings (REDIS_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD).
// A malformed value throws a RedisConfigError with a message that names the variable, instead of letting the client
// quietly retry a bad address and fall back to PostgreSQL.

class RedisConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RedisConfigError';
  }
}

function parsePort(raw, source) {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new RedisConfigError(`${source} must be a whole number between 1 and 65535, but got "${text}".`);
  }
  const port = Number(text);
  if (port < 1 || port > 65535) {
    throw new RedisConfigError(`${source} must be between 1 and 65535, but got ${port}. Check the value (a typo such as an extra digit is the usual cause).`);
  }
  return port;
}

// Returns { url, host, port, password, display } where `display` is safe to log (no password).
function parseRedisConfig(env = process.env) {
  const password = env.REDIS_PASSWORD || undefined;

  if (env.REDIS_URL && String(env.REDIS_URL).trim() !== '') {
    let parsed;
    try {
      parsed = new URL(String(env.REDIS_URL).trim());
    } catch (e) {
      // The URL parser rejects ports above 65535 with a generic error; give the specific reason when that is the cause.
      const portMatch = /^[a-z]+:\/\/(?:[^@/]*@)?[^:/]+:(\d+)(?:[/?#]|$)/i.exec(String(env.REDIS_URL).trim());
      if (portMatch) parsePort(portMatch[1], 'REDIS_URL port');
      throw new RedisConfigError('REDIS_URL is not a valid URL (expected redis://[user:pass@]host:port).');
    }
    if (!/^rediss?:$/.test(parsed.protocol)) {
      throw new RedisConfigError(`REDIS_URL must start with redis:// or rediss://, but got "${parsed.protocol}//".`);
    }
    if (!parsed.hostname) throw new RedisConfigError('REDIS_URL has no host.');
    const port = parsed.port ? parsePort(parsed.port, 'REDIS_URL port') : 6379;
    return { url: String(env.REDIS_URL).trim(), host: parsed.hostname, port, password, display: `${parsed.hostname}:${port}` };
  }

  const host = String(env.REDIS_HOST || '127.0.0.1').trim();
  if (!host || /\s/.test(host)) {
    throw new RedisConfigError(`REDIS_HOST is not a valid host name: "${host}".`);
  }
  const port = (env.REDIS_PORT === undefined || String(env.REDIS_PORT).trim() === '')
    ? 6379
    : parsePort(env.REDIS_PORT, 'REDIS_PORT');
  return { url: null, host, port, password, display: `${host}:${port}` };
}

module.exports = { parseRedisConfig, RedisConfigError };
