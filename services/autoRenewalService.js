const { dbPromise } = require('../models/db');
const moment = require('moment');

// ✅ Get benefits due for renewal
exports.getBenefitsDueForRenewal = async (gracePeriodDays, advanceNoticeDays) => {
  const today = moment().format('YYYY-MM-DD');
  const gracePeriodDate = moment().subtract(gracePeriodDays, 'days').format('YYYY-MM-DD');

  const yearlyAdvanceDate = moment().add(advanceNoticeDays || 30, 'days').format('YYYY-MM-DD');
  const monthlyAdvanceDate = moment().add(advanceNoticeDays || 3, 'days').format('YYYY-MM-DD');

  const sql = `
    SELECT 
      eb.*, bt.name as benefit_name, bt.is_recurring,
      e.first_name, e.last_name, e.email,
      c.name as company_name
    FROM employee_benefits eb
    JOIN benefit_types bt ON eb.benefit_type_id = bt.id
    JOIN employees e ON eb.employee_id = e.id
    JOIN companies c ON eb.company_id = c.id
    WHERE eb.is_active = 1 AND bt.is_active = 1 AND bt.is_recurring = 1
    AND (
      (eb.frequency = 'Yearly' AND eb.effective_to BETWEEN ? AND ?)
      OR
      (eb.frequency = 'Monthly' AND eb.effective_to BETWEEN ? AND ?)
    )
    ORDER BY eb.effective_to ASC, eb.employee_id ASC
  `;

  const [rows] = await dbPromise.query(sql, [
    gracePeriodDate, yearlyAdvanceDate,
    gracePeriodDate, monthlyAdvanceDate
  ]);

  return rows;
};

// ✅ Check if benefit renewal already exists
exports.checkExistingRenewal = async (employeeId, benefitTypeId, effectiveFrom) => {
  const sql = `
    SELECT id FROM employee_benefits 
    WHERE employee_id = ? AND benefit_type_id = ? AND effective_from = ? AND is_active = 1 LIMIT 1
  `;
  const [rows] = await dbPromise.query(sql, [employeeId, benefitTypeId, effectiveFrom]);
  return rows.length > 0 ? rows[0] : null;
};

// ✅ Deactivate expired benefit
exports.deactivateExpiredBenefit = async (benefitId) => {
  const sql = `UPDATE employee_benefits SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await dbPromise.query(sql, [benefitId]);
};

// ✅ Renew a specific benefit
exports.renewBenefit = async (benefit, dryRun = false) => {
  const currentEffectiveTo = moment(benefit.effective_to);
  let newEffectiveFrom, newEffectiveTo;

  if (benefit.frequency === 'Monthly') {
    newEffectiveFrom = currentEffectiveTo.clone().add(1, 'day');
    newEffectiveTo = newEffectiveFrom.clone().endOf('month');
  } else if (benefit.frequency === 'Yearly') {
    newEffectiveFrom = currentEffectiveTo.clone().add(1, 'day');
    newEffectiveTo = newEffectiveFrom.clone().add(1, 'year').subtract(1, 'day');
  } else {
    throw new Error(`Unsupported frequency: ${benefit.frequency}`);
  }

  const renewalData = {
    employee_id: benefit.employee_id,
    benefit_type_id: benefit.benefit_type_id,
    company_id: benefit.company_id,
    entitled: benefit.entitled,
    claimed: 0.00,
    frequency: benefit.frequency,
    effective_from: newEffectiveFrom.format('YYYY-MM-DD'),
    effective_to: newEffectiveTo.format('YYYY-MM-DD'),
    amount: benefit.amount,
    start_date: newEffectiveFrom.format('YYYY-MM-DD'),
    end_date: newEffectiveTo.format('YYYY-MM-DD'),
    is_active: 1
  };

  if (dryRun) {
    return {
      benefitId: benefit.id,
      employeeId: benefit.employee_id,
      benefitType: benefit.benefit_name,
      status: 'preview',
      currentPeriod: {
        from: benefit.effective_from,
        to: benefit.effective_to
      },
      proposedNewPeriod: {
        from: renewalData.effective_from,
        to: renewalData.effective_to
      },
      entitledAmount: renewalData.entitled,
      frequency: benefit.frequency
    };
  }

  const existing = await exports.checkExistingRenewal(
    renewalData.employee_id,
    renewalData.benefit_type_id,
    renewalData.effective_from
  );

  if (existing) {
    return {
      benefitId: benefit.id,
      employeeId: benefit.employee_id,
      benefitType: benefit.benefit_name,
      status: 'skipped',
      reason: 'Renewal already exists',
      existingRenewalId: existing.id
    };
  }

  const insertSQL = `
    INSERT INTO employee_benefits 
    (employee_id, benefit_type_id, company_id, entitled, claimed, frequency, 
     effective_from, effective_to, amount, start_date, end_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await dbPromise.query(insertSQL, [
    renewalData.employee_id,
    renewalData.benefit_type_id,
    renewalData.company_id,
    renewalData.entitled,
    renewalData.claimed,
    renewalData.frequency,
    renewalData.effective_from,
    renewalData.effective_to,
    renewalData.amount,
    renewalData.start_date,
    renewalData.end_date,
    renewalData.is_active
  ]);

  if (moment().isAfter(currentEffectiveTo)) {
    await exports.deactivateExpiredBenefit(benefit.id);
  }

  return {
    benefitId: benefit.id,
    newBenefitId: result.insertId,
    employeeId: benefit.employee_id,
    benefitType: benefit.benefit_name,
    status: 'success',
    oldPeriod: {
      from: benefit.effective_from,
      to: benefit.effective_to
    },
    newPeriod: {
      from: renewalData.effective_from,
      to: renewalData.effective_to
    },
    entitledAmount: renewalData.entitled
  };
};

// ✅ Process all auto renewals
exports.processAutoRenewals = async ({ dryRun = false, gracePeriodDays = 7, advanceNoticeDays = null }) => {
  const connection = await dbPromise.getConnection();
  await connection.beginTransaction();

  try {
    const benefits = await exports.getBenefitsDueForRenewal(gracePeriodDays, advanceNoticeDays);
    const results = [];

    for (const benefit of benefits) {
      try {
        const result = await exports.renewBenefit(benefit, dryRun);
        results.push(result);
      } catch (err) {
        console.error('Failed renewal:', err);
        results.push({
          benefitId: benefit.id,
          employeeId: benefit.employee_id,
          benefitType: benefit.benefit_name,
          status: 'failed',
          error: err.message
        });
      }
    }

    if (!dryRun) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return {
      totalProcessed: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    await connection.release();
  }
};

// ✅ Process renewals for specific employee
exports.processEmployeeRenewals = async (employeeId, { dryRun = false }) => {
  const sql = `
    SELECT eb.*, bt.name as benefit_name, bt.is_recurring
    FROM employee_benefits eb
    JOIN benefit_types bt ON eb.benefit_type_id = bt.id
    WHERE eb.employee_id = ?
      AND eb.is_active = 1
      AND bt.is_active = 1
      AND bt.is_recurring = 1
      AND eb.effective_to <= CURDATE()
  `;

  const [benefits] = await dbPromise.query(sql, [employeeId]);
  const results = [];

  for (const benefit of benefits) {
    const result = await exports.renewBenefit(benefit, dryRun);
    results.push(result);
  }

  return {
    employeeId,
    totalProcessed: results.length,
    results
  };
};
