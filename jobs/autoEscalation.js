const { dbPromise } = require('../models/db');

const AUTO_ESCALATION_HOURS = 24;

const runAutoEscalation = async () => {
  const [feedbacks] = await dbPromise.query(`
    SELECT fr.id, fr.section_id, fr.assigned_pic, fr.updated_at
    FROM feedback_requests fr
    WHERE fr.status_id IN (1, 2) -- open, in progress
  `);

  for (const fb of feedbacks) {
    const lastUpdate = new Date(fb.updated_at);
    const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceUpdate < AUTO_ESCALATION_HOURS) continue;

    const [pics] = await dbPromise.query(`
      SELECT * FROM feedback_pic_config
      WHERE section_id = ?
        AND status = 'Active'
      ORDER BY priority ASC
    `, [fb.section_id]);

    const currentIndex = pics.findIndex(pic => pic.email === fb.assigned_pic);
    const nextPIC = pics[currentIndex + 1];

    if (nextPIC) {
      await dbPromise.query(`
        UPDATE feedback_requests
        SET assigned_pic = ?, updated_at = NOW()
        WHERE id = ?
      `, [nextPIC.email, fb.id]);

      await dbPromise.query(`
        INSERT INTO feedback_logs (feedback_id, event, timestamp)
        VALUES (?, ?, NOW())
      `, [fb.id, `Auto escalated to ${nextPIC.name}`]);

      console.log(`Feedback ID ${fb.id} auto-escalated to ${nextPIC.email}`);
    }
  }
};

module.exports = {
  runAutoEscalation
};
