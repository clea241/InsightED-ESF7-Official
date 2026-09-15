/**
 * InsightED ESF7 - Development API Request & Response Logger Middleware
 * Provides concise, non-blocking real-time visibility into incoming payloads,
 * route latency, status codes, and SQL/controller errors with automatic credential masking.
 */

// ANSI Color Tokens
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'authorization', 'apiKey', 'api_key']);

function summarizePayload(obj, depth = 0) {
  if (!obj || typeof obj !== 'object') return '';
  if (depth > 1) return '{...}';
  
  const keys = Object.keys(obj);
  if (keys.length === 0) return '';

  const summary = keys.map(key => {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      return `${key}: '***'`;
    }
    const val = obj[key];
    if (Array.isArray(val)) {
      return `${key}: [${val.length} items]`;
    }
    if (typeof val === 'object' && val !== null) {
      const subKeys = Object.keys(val);
      return `${key}: {${subKeys.slice(0, 3).join(', ')}${subKeys.length > 3 ? '...' : ''}}`;
    }
    if (typeof val === 'string' && val.length > 25) {
      return `${key}: "${val.substring(0, 22)}..."`;
    }
    return `${key}: ${JSON.stringify(val)}`;
  });

  return summary.slice(0, 6).join(', ') + (summary.length > 6 ? ` (+${summary.length - 6} more)` : '');
}

function getStatusColor(status) {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  if (status >= 200) return colors.green;
  return colors.reset;
}

function getMethodColor(method) {
  switch (method.toUpperCase()) {
    case 'GET': return colors.cyan;
    case 'POST': return colors.green;
    case 'PUT': return colors.yellow;
    case 'PATCH': return colors.magenta;
    case 'DELETE': return colors.red;
    default: return colors.blue;
  }
}

function devLogger(req, res, next) {
  const startHr = process.hrtime();
  const startTime = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  // Capture payload summary if present (POST, PUT, PATCH)
  let payloadStr = '';
  if (['POST', 'PUT', 'PATCH'].includes(method) && req.body && Object.keys(req.body).length > 0) {
    const summary = summarizePayload(req.body);
    if (summary) {
      payloadStr = ` ${colors.gray}➔ payload: { ${summary} }${colors.reset}`;
    }
  }

  // Intercept response finish to calculate precise latency
  res.on('finish', () => {
    const status = res.statusCode;

    // Silence successful GET requests to keep terminal clean
    if (method === 'GET' && status < 400) {
      return;
    }

    const elapsedHr = process.hrtime(startHr);
    const durationMs = (elapsedHr[0] * 1000 + elapsedHr[1] / 1e6).toFixed(1);
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });

    const methodFormatted = `${getMethodColor(method)}${colors.bold}${method.padEnd(6)}${colors.reset}`;
    const statusFormatted = `${getStatusColor(status)}${colors.bold}${status}${colors.reset}`;
    const durationFormatted = Number(durationMs) > 1000 
      ? `${colors.yellow}${durationMs}ms${colors.reset}` 
      : `${colors.dim}${durationMs}ms${colors.reset}`;

    console.log(
      `${colors.gray}[${timeStr}]${colors.reset} ${methodFormatted} ${url} ${colors.gray}➔${colors.reset} ${statusFormatted} ${durationFormatted}${payloadStr}`
    );
  });

  next();
}

module.exports = devLogger;
