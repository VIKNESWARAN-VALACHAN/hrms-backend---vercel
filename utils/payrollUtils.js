const db = require('../models/db'); // Your DB instance

// 1. Get Salary Info
async function getBasicSalary(employeeId) {
  const [result] = await db.query('SELECT basic_salary FROM employee_salary WHERE employee_id = ?', [employeeId]);
  return result?.basic_salary || 0;
}

// 2. Get Recurring Allowances (Taxable & Non-taxable)
async function getTotalAllowances(employeeId) {
  const [rows] = await db.query(`
    SELECT ea.amount, am.is_taxable
    FROM employee_allowances ea
    JOIN allowance_master am ON ea.allowance_id = am.id
    WHERE ea.employee_id = ? AND ea.is_recurring = 1
  `, [employeeId]);

  let taxable = 0;
  let nonTaxable = 0;

  for (const row of rows) {
    if (row.is_taxable) taxable += row.amount;
    else nonTaxable += row.amount;
  }

  return { taxable, nonTaxable };
}

// 3. Get Overtime Payment
async function calculateOT(employeeId) {
  const [configRow] = await db.query(`SELECT ot_multiplier FROM payroll_config LIMIT 1`);
  const otRate = configRow?.ot_multiplier || 1.5;

  const [rows] = await db.query(`
    SELECT SUM(hours) as total_hours FROM employee_overtimes 
    WHERE employee_id = ? AND approved = 1
  `, [employeeId]);

  const totalHours = rows?.[0]?.total_hours || 0;
  const basicSalary = await getBasicSalary(employeeId);
  const hourlyRate = basicSalary / 26 / 8;

  return totalHours * hourlyRate * otRate;
}

// 4. Get Claim Total
async function getApprovedClaims(employeeId) {
  const [rows] = await db.query(`
    SELECT SUM(amount) as total FROM employee_claims 
    WHERE employee_id = ? AND approved = 1
  `, [employeeId]);
  return rows?.[0]?.total || 0;
}

// 5. Get Loan Deduction
async function getLoanDeduction(employeeId) {
  const [rows] = await db.query(`
    SELECT installment FROM employee_loans 
    WHERE employee_id = ? AND status = 'Active'
  `);
  return rows.reduce((sum, loan) => sum + loan.monthly_installment, 0);
}

// 6. Get Other Deductions
async function getDeductions(employeeId) {
  const [rows] = await db.query(`
    SELECT SUM(amount) as total FROM employee_deductions 
    WHERE employee_id = ? AND is_recurring = 1
  `);
  return rows?.[0]?.total || 0;
}

// 7. Statutory Contributions (mock for now — replace with logic)
async function getStatutoryDeductions(employeeId) {
  return {
    epf: 400,
    socso: 15,
    eis: 5,
    pcb: 100
  };
}

// 8. Calculate Gross
async function calculateGrossSalary(employeeId) {
  const basic = await getBasicSalary(employeeId);
  const { taxable, nonTaxable } = await getTotalAllowances(employeeId);
  const ot = await calculateOT(employeeId);
  const claims = await getApprovedClaims(employeeId);

  return basic + taxable + nonTaxable + ot + claims;
}

// 9. Calculate Net
async function calculateNetSalary(employeeId) {
  const gross = await calculateGrossSalary(employeeId);
  const { epf, socso, eis, pcb } = await getStatutoryDeductions(employeeId);
  const loan = await getLoanDeduction(employeeId);
  const otherDeductions = await getDeductions(employeeId);

  const totalDeductions = epf + socso + eis + pcb + loan + otherDeductions;
  return gross - totalDeductions;
}

module.exports = {
  calculateGrossSalary,
  calculateNetSalary,
  getStatutoryDeductions,
  getLoanDeduction,
  getDeductions,
  getTotalAllowances,
  calculateOT,
  getApprovedClaims
};
