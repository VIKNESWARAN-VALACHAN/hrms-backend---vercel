// middleware/ipGate.js
// npm i ipaddr.js
const ipaddr = require('ipaddr.js');
const { dbPromise } = require('../models/db'); // use the same pool as checkIn

function normalizeIp(ip) {
  if (!ip) return '';
  // strip IPv6 mapped IPv4 form: ::ffff:203.0.113.5
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function parseCidr(cidr) {
  // returns [ipObj, prefixLen] or null
  try {
    if (cidr.includes(':')) return ipaddr.IPv6.parseCIDR(cidr);
    return ipaddr.IPv4.parseCIDR(cidr);
  } catch {
    return null;
  }
}

function matchCidr(ipStr, cidr) {
  try {
    let ip = ipaddr.parse(ipStr);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();

    const parsed = parseCidr(cidr);
    if (!parsed) return false;

    const [rangeIp, prefix] = parsed;

    // normalize family
    if (ip.kind() !== rangeIp.kind()) {
      if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress() && rangeIp.kind() === 'ipv4') {
        ip = ip.toIPv4Address();
      } else {
        return false;
      }
    }
    return ip.match(rangeIp, prefix);
  } catch {
    return false;
  }
}

function getClientIp(req, trustProxy, allowedProxyList) {
  // default from socket/ip
  let ip = normalizeIp(req.socket?.remoteAddress || req.ip || '');

  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map(s => normalizeIp(s.trim()))
      .filter(Boolean);

    if (xff.length) {
      // If you maintain allowed proxies, drop known proxy hops from the right
      let chain = [...xff];
      if (allowedProxyList?.length) {
        while (chain.length && allowedProxyList.includes(chain[chain.length - 1])) {
          chain.pop();
        }
      }
      // last remaining is the client
      if (chain.length) ip = chain[chain.length - 1];
    }
  }
  return ip;
}

async function getEffectivePolicy(companyId, employeeId) {
  const [rows] = await dbPromise.query(
    `SELECT scope, company_id, employee_id, mode, trust_proxy, allowed_proxy_ips
       FROM attendance_ip_policy
      WHERE (scope='EMPLOYEE' AND employee_id=?)
         OR (scope='COMPANY'  AND company_id=?)
         OR (scope='GLOBAL')
      ORDER BY FIELD(scope,'EMPLOYEE','COMPANY','GLOBAL')`,
    [employeeId, companyId]
  );

  // Effective: take mode from top row; trust_proxy / allowed_proxy_ips with fallback.
  const top = rows[0] || {};
  const trust_proxy = (() => {
    for (const r of rows) if (r.trust_proxy !== null && r.trust_proxy !== undefined) return !!r.trust_proxy;
    return true; // default
  })();
  const allowed_proxy_ips = (() => {
    for (const r of rows) if (r.allowed_proxy_ips) return r.allowed_proxy_ips;
    return null;
  })();

  return {
    mode: top.mode || 'FLAG_ONLY',
    trust_proxy,
    allowed_proxy_ips
  };
}

async function getEmployeeAndOffice(employeeId) {
  const [rows] = await dbPromise.query(
    `SELECT id, company_id, office_id FROM employees WHERE id=? LIMIT 1`,
    [employeeId]
  );
  return rows?.[0] || null;
}

async function getEmployeeOverrides(employeeId) {
  const [rows] = await dbPromise.query(
    `SELECT ip_address FROM employee_ip_overrides WHERE employee_id=?`,
    [employeeId]
  );
  return (rows || []).map(r => r.ip_address);
}

async function getOfficeCidrs(officeId) {
  if (!officeId) return [];
  const [rows] = await dbPromise.query(
    `SELECT id AS whitelist_id, cidr
       FROM office_ip_whitelists
      WHERE office_id=? AND is_active=1`,
    [officeId]
  );
  return rows; // [{whitelist_id, cidr}, ...]
}


function splitAllowedProxies(text) {
  if (!text) return [];
  // accept comma/newline/space separated
  return text.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * ipGate: run before check-in/out.
 * If ENFORCE and IP not in any allowed set -> 403.
 * If FLAG_ONLY and IP not allowed -> pass through but mark res.locals.ipFlag=true.
 */
function ipGate1() {
  return async (req, res, next) => {
    try {
      const employeeId = Number(req.body?.employee_id || req.query?.employee_id || (req.user && req.user.id));
      if (!employeeId) return res.status(400).json({ error: 'employee_id required' });

      const emp = await getEmployeeAndOffice(employeeId);
      if (!emp) return res.status(404).json({ error: 'Employee not found' });

      const policy = await getEffectivePolicy(emp.company_id, employeeId);//const policy = await getEffectivePolicy(emp.company_id);
      const allowedProxies = splitAllowedProxies(policy.allowed_proxy_ips);
      const clientIp = getClientIp(req, !!policy.trust_proxy, allowedProxies);

      const overrides = await getEmployeeOverrides(employeeId);
      const officeCidrs = await getOfficeCidrs(emp.office_id);

      const hasAnyRules = overrides.length > 0 || officeCidrs.length > 0;

      let allowed = false;
      let source = 'NONE';

      // 1) exact employee override
      if (overrides.includes(clientIp)) {
        allowed = true;
        source = 'EMP_OVERRIDE';
      }

      // 2) office ranges
      if (!allowed && officeCidrs.length) {
        allowed = officeCidrs.some(cidr => matchCidr(clientIp, cidr));
        if (allowed) source = 'OFFICE_RANGE';
      }
      if (!allowed && !hasAnyRules) {
        allowed = true;
        source  = 'NO_RULES';
      }

      // Decide by policy
      if (!allowed) {
        if (policy.mode === 'ENFORCE') {
          return res.status(701).json({
            code: 'IP_BLOCKED',
            message: `Your IP (${clientIp}) is not in the allowed ranges for your office.`
          });
        }
        // FLAG_ONLY: continue, but mark
        res.locals.ipFlag = true;
        res.locals.ipMessage = `Outside allowed IP (${clientIp}). Recorded and flagged.`;
      } else {
        res.locals.ipFlag = false;
      }

      // useful for controllers/logging
      res.locals.ipInfo = {
        clientIp,
        source,
        officeCidrs,
        overrides,
        mode: policy.mode
      };

      next();
    } catch (e) {
      console.error('ipGate error:', e);
      return res.status(500).json({ error: 'IP evaluation failed' });
    }
  };
}

function ipGate() {
  return async (req, res, next) => {
    try {
      const employeeId = Number(req.body?.employee_id || req.query?.employee_id || (req.user && req.user.id));
      if (!employeeId) return res.status(400).json({ error: 'employee_id required' });

      const emp = await getEmployeeAndOffice(employeeId);
      if (!emp) return res.status(404).json({ error: 'Employee not found' });

      const policy = await getEffectivePolicy(emp.company_id, employeeId);
      const allowedProxies = splitAllowedProxies(policy.allowed_proxy_ips);
      const clientIp = getClientIp(req, !!policy.trust_proxy, allowedProxies);

      const overrides   = await getEmployeeOverrides(employeeId);        // [ip,...]
      const officeCidrs = await getOfficeCidrs(emp.office_id);          // [{whitelist_id, cidr},...]

      const hasAnyRules = overrides.length > 0 || officeCidrs.length > 0;

      let allowed = false;
      let source = 'NONE';
      let whitelistId = null;

      // 1) exact employee override
      if (overrides.includes(clientIp)) {
        allowed = true;
        source = 'EMP_OVERRIDE';
      }

      // 2) office ranges (track which row matched)
      if (!allowed && officeCidrs.length) {
        for (const r of officeCidrs) {
          if (matchCidr(clientIp, r.cidr)) {
            allowed = true;
            source = 'OFFICE_RANGE';
            whitelistId = r.whitelist_id;
            break;
          }
        }
      }

      // No rules at all → allow (so users aren’t soft-bricked on fresh setups)
      if (!allowed && !hasAnyRules) {
        allowed = true;
        source  = 'NO_RULES';
      }

      const matchStatus =
        allowed
          ? 'IN_WHITELIST'
          : (hasAnyRules ? 'OUTSIDE_WHITELIST' : null); // null when there are no rules

      // ENFORCE must block
      if (!allowed && policy.mode === 'ENFORCE') {
        // (Optional) if you also want to audit blocked attempts, do it here to a dedicated table.
        return res.status(403).json({
          code: 'IP_BLOCKED',
          message: `Your IP (${clientIp}) is not in the allowed ranges for your office.`,
        });
      }

      // FLAG_ONLY: continue, but mark
      res.locals.ipFlag    = !allowed;
      res.locals.ipMessage = !allowed ? `Outside allowed IP (${clientIp}). Recorded and flagged.` : undefined;

      // hand off everything the controller needs to write into attendance_events
      res.locals.ipInfo = {
        clientIp,
        source,
        officeId: emp.office_id || null,
        whitelistId,                     // may be null
        matchStatus,                     // IN_WHITELIST / OUTSIDE_WHITELIST / null
        mode: policy.mode || null,       // ENFORCE / FLAG_ONLY
        geo: null                        // plug your GeoIP here later if you want
      };

      next();
    } catch (e) {
      console.error('ipGate error:', e);
      return res.status(500).json({ error: 'IP evaluation failed' });
    }
  };
}




module.exports = { ipGate };
