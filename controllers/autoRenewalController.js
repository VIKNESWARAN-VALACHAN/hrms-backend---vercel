const { dbPromise } = require('../models/db');
const AutoRenewalService = require('../services/autoRenewalService');

const autoRenewalService = new AutoRenewalService(dbPromise);

// ✅ Process all auto-renewals
exports.processAutoRenewals = async (req, res) => {
  try {
    const {
      dryRun = false,
      gracePeriodDays = 7,
      advanceNoticeDays = null
    } = req.body;

    const result = await autoRenewalService.processAutoRenewals({
      dryRun,
      gracePeriodDays,
      advanceNoticeDays
    });

    res.status(200).json({
      success: true,
      message: dryRun ? 'Auto-renewal preview completed' : 'Auto-renewal process completed',
      data: result
    });
  } catch (err) {
    console.error('Error processing auto-renewals:', err);
    res.status(500).json({ error: 'Failed to process auto-renewals' });
  }
};

// ✅ Get renewal preview
exports.getRenewalPreview = async (req, res) => {
  try {
    const {
      employeeId = null,
      benefitTypeId = null,
      gracePeriodDays = 7,
      advanceNoticeDays = null
    } = req.query;

    const result = await autoRenewalService.processAutoRenewals({
      dryRun: true,
      gracePeriodDays: parseInt(gracePeriodDays),
      advanceNoticeDays: advanceNoticeDays ? parseInt(advanceNoticeDays) : null
    });

    let filteredResults = result.results;
    if (employeeId) {
      filteredResults = filteredResults.filter(r => r.employeeId == employeeId);
    }
    if (benefitTypeId) {
      filteredResults = filteredResults.filter(r => r.benefitTypeId == benefitTypeId);
    }

    res.status(200).json({
      success: true,
      message: 'Renewal preview generated successfully',
      data: {
        ...result,
        results: filteredResults,
        totalFiltered: filteredResults.length
      }
    });
  } catch (err) {
    console.error('Error getting renewal preview:', err);
    res.status(500).json({ error: 'Failed to get renewal preview' });
  }
};

// ✅ Process renewals for a specific employee
exports.processEmployeeRenewals = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { dryRun = false } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    const result = await autoRenewalService.processEmployeeRenewals(
      parseInt(employeeId),
      { dryRun }
    );

    res.status(200).json({
      success: true,
      message: dryRun
        ? `Renewal preview for employee ${employeeId} completed`
        : `Auto-renewal for employee ${employeeId} completed`,
      data: result
    });
  } catch (err) {
    console.error('Error processing employee renewal:', err);
    res.status(500).json({ error: 'Failed to process employee renewals' });
  }
};

// ✅ Get benefits due for renewal
exports.getBenefitsDueForRenewal = async (req, res) => {
  try {
    const {
      gracePeriodDays = 7,
      advanceNoticeDays = null
    } = req.query;

    const connection = await dbPromise.getConnection();

    try {
      const benefits = await autoRenewalService.getBenefitsDueForRenewal(
        connection,
        parseInt(gracePeriodDays),
        advanceNoticeDays ? parseInt(advanceNoticeDays) : null
      );

      res.status(200).json({
        success: true,
        message: 'Benefits due for renewal retrieved successfully',
        data: {
          count: benefits.length,
          benefits: benefits.map(b => ({
            id: b.id,
            employeeId: b.employee_id,
            employeeName: `${b.first_name} ${b.last_name}`,
            benefitType: b.benefit_name,
            frequency: b.frequency,
            entitled: b.entitled,
            claimed: b.claimed,
            effectiveFrom: b.effective_from,
            effectiveTo: b.effective_to,
            companyName: b.company_name
          }))
        }
      });
    } finally {
      await connection.release();
    }
  } catch (err) {
    console.error('Error fetching benefits due for renewal:', err);
    res.status(500).json({ error: 'Failed to get benefits due for renewal' });
  }
};

// ✅ Manual renewal of a specific benefit
exports.manualRenewal = async (req, res) => {
  try {
    const { benefitId } = req.params;
    const { dryRun = false } = req.body;

    if (!benefitId) {
      return res.status(400).json({ error: 'Benefit ID is required' });
    }

    const connection = await dbPromise.getConnection();

    try {
      const [rows] = await connection.execute(`
        SELECT 
          eb.*, bt.name as benefit_name, bt.is_recurring,
          e.first_name, e.last_name, c.name as company_name
        FROM employee_benefits eb
        JOIN benefit_types bt ON eb.benefit_type_id = bt.id
        JOIN employees e ON eb.employee_id = e.id
        JOIN companies c ON eb.company_id = c.id
        WHERE eb.id = ? AND eb.is_active = 1
      `, [benefitId]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Benefit not found or inactive' });
      }

      const benefit = rows[0];

      if (!benefit.is_recurring) {
        return res.status(400).json({ error: 'Benefit type is not recurring' });
      }

      const renewalResult = await autoRenewalService.renewBenefit(
        connection,
        benefit,
        dryRun
      );

      res.status(200).json({
        success: true,
        message: dryRun ? 'Manual renewal preview completed' : 'Manual renewal completed successfully',
        data: renewalResult
      });
    } finally {
      await connection.release();
    }
  } catch (err) {
    console.error('Error processing manual renewal:', err);
    res.status(500).json({ error: 'Failed to manually renew benefit' });
  }
};
