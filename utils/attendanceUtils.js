/**
 * Calculates the attendance status for a day based on check-in/check-out events
 * @param {Array} events - Array of attendance events with checkIn and checkOut timestamps
 * @param {string} workStart - Work start time in format "HH:MM"
 * @param {string} workEnd - Work end time in format "HH:MM"
 * @param {number} lateGrace - Grace period in minutes before employee is considered late
 * @returns {Object} Status object with attendance status, total minutes, first check-in and last check-out
 */
function calculateDailyStatus(events, workStart, workEnd, lateGrace) {
  let status = 2; // Default to absent
  let totalMinutes = 0;
  let firstCheckIn = null;
  let lastCheckOut = null;

  if (events.length > 0) {
    firstCheckIn = events[0].checkIn;
    lastCheckOut = events[events.length - 1].checkOut;

    // Calculate total worked minutes
    events.forEach(event => {
      if (event.checkOut) {
        totalMinutes += Math.round(
          (event.checkOut.getTime() - event.checkIn.getTime()) / 60000
        );
      }
    });

    // Check late status
    const [startHour, startMinute] = workStart.split(':').map(Number);
    const lateThreshold = new Date(firstCheckIn);
    lateThreshold.setHours(startHour, startMinute + lateGrace);

    status = firstCheckIn > lateThreshold ? 3 : 1; // Late or Present

    // Check partial status
    const [endHour, endMinute] = workEnd.split(':').map(Number);
    const workEndTime = new Date(firstCheckIn);
    workEndTime.setHours(endHour, endMinute);
    
    if (!lastCheckOut || lastCheckOut < workEndTime) {
      status = 4; // Partial
    }
  }

  return { status, totalMinutes, firstCheckIn, lastCheckOut };
}

module.exports = {
  calculateDailyStatus
}; 