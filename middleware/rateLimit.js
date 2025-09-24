// middleware/rateLimit.js
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.windowMs = 60000; // 1 minute
    this.maxRequests = 60;
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(time => now - time < this.windowMs);
      if (validTimestamps.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, validTimestamps);
      }
    }
  }

  check(ip) {
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];
    const recentRequests = timestamps.filter(time => now - time < this.windowMs);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(ip, recentRequests);
    return true;
  }

  middleware() {
    return (req, res, next) => {
      const clientIP = this.getClientIP(req);
      
      if (!this.check(clientIP)) {
        return res.status(429).json({
          success: false,
          error: 'Too many requests'
        });
      }

      next();
    };
  }

  getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    return forwarded ? forwarded.split(',')[0].trim() : req.ip;
  }
}

// ✅ FIX: Create instance and export middleware directly
const limiter = new RateLimiter();
const rateLimitMiddleware = limiter.middleware();

module.exports = { rateLimitMiddleware };