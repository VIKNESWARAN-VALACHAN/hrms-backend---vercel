/**
 * Converts a date to Singapore timezone (GMT+8)
 * @param {Date|string} date - Date object or date string to convert
 * @param {string} format - Output format: 'full' (default), 'date', 'time', 'sql', 'iso'
 * @returns {string|Date} Formatted date string or Date object in Singapore timezone
 */

const { format: formatDate,formatInTimeZone, toZonedTime,fromZonedTime} = require('date-fns-tz');

const toSingaporeTime = (date, format = 'full') => {
    // Create Date object if string provided
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Convert to Singapore timezone (GMT+8)
    const options = { timeZone: 'Asia/Singapore' };
    
    switch (format) {

      case 'year':
        // Return year only (YYYY)
        options.year = 'numeric';
        return dateObj.toLocaleDateString('en-US', options);
      case 'month':
        // Return month only (MM)
        options.month = '2-digit';
        return dateObj.toLocaleDateString('en-US', options);
      case 'date':
        // Return date only (YYYY-MM-DD)
        options.year = 'numeric';
        options.month = '2-digit';
        options.day = '2-digit';
        return dateObj.toLocaleDateString('en-CA', options);
        
      case 'time':
        // Return time only (HH:MM:SS)
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        options.hour12 = false;
        return dateObj.toLocaleTimeString('en-US', options);
        
      case 'sql':
        // Return MySQL datetime format (YYYY-MM-DD HH:MM:SS)
        const sgDate = new Date(dateObj.toLocaleString('en-US', options));
        return sgDate.toISOString().slice(0, 19).replace('T', ' ');
        
      case 'iso':
        // Return ISO format
        return new Date(dateObj.toLocaleString('en-US', options)).toISOString();
        
      case 'date-object':
        // Return Date object in Singapore timezone
        return new Date(dateObj.toLocaleString('en-US', options));
        
      case 'date-object-utc':
        // Return Date object in Singapore timezone
        // return formatInTimeZone(dateObj, 'Asia/Singapore',"yyyy-MM-dd'T'HH:mm:ssXXX");
        return fromZonedTime(date, timeZone)
      case 'full':
      default:
        // Return full datetime (YYYY-MM-DD HH:MM:SS)
        options.year = 'numeric';
        options.month = '2-digit';
        options.day = '2-digit';
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        options.hour12 = false;
        return dateObj.toLocaleString('en-CA', options).replace(',', '');
    }
  };
  
  // Examples of usage:
// toSingaporeTime(new Date(), 'sql') => '2023-08-15 14:30:45' (for SQL queries)
// toSingaporeTime(new Date(), 'date') => '2023-08-15' (date only)
// toSingaporeTime(new Date(), 'time') => '14:30:45' (time only)
// toSingaporeTime(new Date()) => '2023-08-15 14:30:45' (full datetime)


  module.exports = {
    toSingaporeTime
  }; 