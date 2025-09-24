// controllers/ipDeviceInfo.controller.js (UPDATED)
class IPDeviceInfoController {
  
  /**
   * Get client's real IP address and device information
   */
  async getIPDeviceInfo(req, res) {
    try {
      // Simple validation without express-validator
      if (req.method !== 'GET') {
        return res.status(405).json({
          success: false,
          error: 'Method not allowed'
        });
      }

      // Get real IP address
      const clientIP = this.getClientIP(req);
      
      // Get detailed device information
      const deviceInfo = this.getDeviceInfo(req);
      
      // Security logging
      console.log(`[IP-API] Request from: ${clientIP}, Device: ${deviceInfo.deviceType}`);

      res.json({
        success: true,
        data: {
          ip: clientIP,
          device: deviceInfo,
          timestamp: new Date().toISOString(),
          detectedVia: 'server-side'
        },
        metadata: {
          version: '1.0',
          source: 'hrms-ip-api'
        }
      });

    } catch (error) {
      console.error('IP device info error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve IP and device information',
        code: 'IP_DETECTION_ERROR'
      });
    }
  }

  // ... rest of the methods remain the same ...
  getClientIP(req) {
    // Implementation remains the same as before
    const ipHeaders = [
      'x-client-ip',
      'x-forwarded-for',
      'cf-connecting-ip',
      'fastly-client-ip',
      'x-real-ip',
      'x-cluster-client-ip',
      'x-forwarded',
      'forwarded-for',
      'forwarded'
    ];

    let ip = 'Unknown';

    for (const header of ipHeaders) {
      const value = req.headers[header];
      if (value) {
        ip = this.parseIPValue(value);
        if (ip && ip !== 'Unknown') break;
      }
    }

    if (ip === 'Unknown') {
      ip = req.socket?.remoteAddress || 
           req.connection?.remoteAddress || 
           'Unknown';
    }

    return this.cleanIPAddress(ip);
  }

  parseIPValue(value) {
    if (typeof value === 'string') {
      return value.split(',')[0].trim();
    } else if (Array.isArray(value)) {
      return value[0].split(',')[0].trim();
    }
    return 'Unknown';
  }

  cleanIPAddress(ip) {
    if (!ip || ip === 'Unknown') return 'Unknown';
    
    if (ip === '::1') return '127.0.0.1';
    
    if (ip.includes('::ffff:')) {
      return ip.replace('::ffff:', '');
    }
    
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length > 2) {
        return ip;
      } else {
        return parts[0];
      }
    }

    return ip;
  }

  getDeviceInfo(req) {
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
    const isTablet = /Tablet|iPad/i.test(userAgent);
    const isDesktop = !isMobile && !isTablet;

    let deviceType = 'Desktop';
    if (isMobile) deviceType = 'Mobile';
    if (isTablet) deviceType = 'Tablet';

    let browser = 'Unknown';
    if (/Chrome/i.test(userAgent)) browser = 'Chrome';
    else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/Safari/i.test(userAgent)) browser = 'Safari';
    else if (/Edge/i.test(userAgent)) browser = 'Edge';

    let os = 'Unknown';
    if (/Windows/i.test(userAgent)) os = 'Windows';
    else if (/Mac OS X/i.test(userAgent)) os = 'macOS';
    else if (/Linux/i.test(userAgent)) os = 'Linux';
    else if (/Android/i.test(userAgent)) os = 'Android';
    else if (/iOS|iPhone|iPad|iPod/i.test(userAgent)) os = 'iOS';

    return {
      userAgent: userAgent.substring(0, 200),
      deviceType,
      browser,
      operatingSystem: os,
      isMobile,
      isTablet,
      isDesktop,
      acceptLanguage: req.headers['accept-language'] || 'Unknown'
    };
  }

  async healthCheck(req, res) {
    res.json({
      status: 'healthy',
      service: 'HRMS IP Device Info API',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }
}

module.exports = new IPDeviceInfoController();