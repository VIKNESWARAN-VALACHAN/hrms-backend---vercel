const ipaddr = require('ipaddr.js'); // npm i ipaddr.js

function isValidIp(ip) {
  try { ipaddr.parse(ip); return true; } catch { return false; }
}

function isValidCidr(cidr) {
  try {
    const [base, prefix] = (cidr || '').split('/');
    if (!base || prefix === undefined) return false;
    const addr = ipaddr.parse(base);
    const p = parseInt(prefix, 10);
    const max = addr.kind() === 'ipv4' ? 32 : 128;
    return Number.isInteger(p) && p >= 0 && p <= max;
  } catch { return false; }
}

module.exports = { isValidIp, isValidCidr };
