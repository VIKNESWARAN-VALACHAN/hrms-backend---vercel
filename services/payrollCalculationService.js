
const { dbPromise } = require('../models/db');

async function getEmployeeTotalRelief(employee_id) {
  const [rows] = await dbPromise.query(
    `SELECT SUM(rc.amount) AS total_relief
     FROM employee_reliefs er
     JOIN relief_categories rc ON rc.id = er.relief_id
     WHERE er.employee_id = ?`,
    [employee_id]
  );
  return parseFloat(rows[0].total_relief || 0);
}

async function getApprovedClaimsForEmployee(employeeId, periodFrom, periodTo) {
  const [claims] = await dbPromise.query(
    `SELECT cr.amount, cr.benefit_type_id, bt.name AS benefit_type_name
      FROM claim_requests cr
      JOIN benefit_types bt ON bt.id = cr.benefit_type_id
      WHERE cr.employee_id = ? AND cr.status = 'Approved'
        AND cr.claim_date BETWEEN ? AND ?`,
    [employeeId, periodFrom, periodTo]
  );
  
  return claims.map(claim => ({
     label: 'Claim Reimbursement',//label: claim.benefit_type_name || 'Claim Reimbursement',
    amount: parseFloat(claim.amount),
    type: 'Earning'
  }));

}

async function calculatePCBProgressive(monthlyTaxable, pcbConfigs, reliefAmount, employeeId) {
  try {
    // 1. Get employee details including dependents count
    const [employeeData] = await dbPromise.query(`
      SELECT 
        e.marital_status,
        (SELECT COUNT(*) FROM employee_dependents ed 
         WHERE ed.employee_id = e.id 
         AND ed.relationship IN ('Child', 'Son', 'Daughter')) AS num_children
      FROM employees e
      WHERE e.id = ?
    `, [employeeId]);

    if (!employeeData.length) {
      throw new Error('Employee not found');
    }

    const employee = employeeData[0];
    const maritalStatus = employee.marital_status || 'Single';
    const numChildren = parseInt(employee.num_children) || 0;

    // Rest of your PCB calculation remains the same...
    const annualTaxable = monthlyTaxable * 12;
    const chargeableIncome = annualTaxable - reliefAmount;
    
    if (chargeableIncome <= 0) return 0;

    // Find matching tax brackets
    const brackets = pcbConfigs
      .filter(r => 
        r.marital_status === maritalStatus && 
        parseInt(r.num_children) === numChildren
      )
      .sort((a, b) => parseFloat(a.income_from) - parseFloat(b.income_from));

    if (brackets.length === 0) {
      throw new Error(`No PCB tax brackets found for ${maritalStatus} with ${numChildren} children`);
    }

    // Calculate tax progressively
    let tax = 0;
    let remaining = chargeableIncome;

    for (const bracket of brackets) {
      const from = parseFloat(bracket.income_from);
      const to = parseFloat(bracket.income_to);
      const rate = parseFloat(bracket.tax_rate) / 100;
      const fixedAmount = parseFloat(bracket.tax_amount);

      if (chargeableIncome > from) {
        const taxable = Math.min(remaining, to - from);
        
        if (taxable > 0) {
          tax += fixedAmount + (taxable * rate);
        }
        
        remaining -= taxable;
      }
      if (remaining <= 0) break;
    }

    // Convert annual tax to monthly and round to 2 decimal places
    return parseFloat((tax / 12).toFixed(2));

  } catch (err) {
    console.error('PCB Calculation Error:', err);
    throw err;
  }
}

// Recalculate payroll totals after any payslip item adjustment.
// IMPORTANT: Reuse the same `conn` (with an active transaction) from the caller.
// - Does NOT begin/commit/rollback transactions.
// - Does NOT change transaction characteristics.
// - Acquires an advisory lock per payroll_id to serialize concurrent edits.
// - Locks rows in a consistent order to avoid deadlocks.
async function recalculatePayrollAfterAdjustment(payrollId, updatedBy, conn) {
  const round2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;

  let locked = false;
  try {
    // 0) Advisory lock (10s timeout)
    const [[{ got_lock }]] = await conn.query(
      `SELECT GET_LOCK(CONCAT('payroll_', ?), 10) AS got_lock`,
      [payrollId]
    );
    if (!got_lock) throw new Error('Unable to acquire payroll advisory lock');
    locked = true;

    // 1) Lock main payroll row first
    const [[payroll]] = await conn.query(`
      SELECT p.*, e.company_id, e.id AS employee_id
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.id = ?
      FOR UPDATE
    `, [payrollId]);
    if (!payroll) throw new Error('Payroll not found');

    // 2) Lock child rows in deterministic order
    const [existingItems] = await conn.query(`
      SELECT * FROM payslip_items
      WHERE payroll_id = ?
      ORDER BY id
      FOR UPDATE
    `, [payrollId]);

    await conn.query(`
      SELECT id
      FROM employer_contributions
      WHERE payroll_id = ?
      ORDER BY id
      FOR UPDATE
    `, [payrollId]); // only to lock rows; values not needed here

    // 3) Split items
    const manualItems = [];
    const systemItems = [];
    for (const i of existingItems) {
      if (['Manual Earning', 'Manual Deduction', 'Adjustment'].includes(i.type)) {
        manualItems.push(i);
      } else {
        systemItems.push(i);
      }
    }

    // 4) Preload allowance flags for all earning labels (avoid N+1 queries)
    const earningLabels = [
      ...new Set(systemItems.filter(i => i.type === 'Earning').map(i => i.label))
    ];
    const allowanceFlagsByName = new Map();
    if (earningLabels.length) {
      const placeholders = earningLabels.map(() => '?').join(',');
      const [allowanceRows] = await conn.query(
        `
        SELECT name,
               COALESCE(is_epf_eligible,0)   AS is_epf_eligible,
               COALESCE(is_socso_eligible,0) AS is_socso_eligible,
               COALESCE(is_eis_eligible,0)   AS is_eis_eligible,
               COALESCE(is_taxable,0)        AS is_taxable,
               COALESCE(is_bonus,0)          AS is_bonus
        FROM allowance_master
        WHERE name IN (${placeholders})
        `,
        earningLabels
      );
      for (const r of allowanceRows) allowanceFlagsByName.set(r.name, r);
    }

      for (const item of manualItems) {
    const amt = +item.amount || 0;
    if (item.type === 'Manual Earning' || item.type === 'Adjustment') {
      if (amt > 0) totalAllowances += amt;
      else totalDeductions += Math.abs(amt);
    } else if (item.type === 'Manual Deduction') {
      totalDeductions += amt;
    }
  }

    // 5) Base totals and statutory bases
    let basic_salary = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    let epfBase = 0, socsoBase = 0, eisBase = 0, pcbTaxable = 0;

    const basicSalaryItem = systemItems.find(i => i.label === 'Basic Salary');
    if (basicSalaryItem) {
      basic_salary = +basicSalaryItem.amount || 0;
      epfBase = socsoBase = eisBase = pcbTaxable = basic_salary;
    }

    for (const item of systemItems) {
      if (item.label === 'Basic Salary') continue;
      const amt = +item.amount || 0;

      if (item.type === 'Earning') {
        totalAllowances += amt;

        const f = allowanceFlagsByName.get(item.label);
        if (f) {
          if (+f.is_epf_eligible)   epfBase  += amt;
          if (+f.is_socso_eligible) socsoBase += amt;
          if (+f.is_eis_eligible)   eisBase  += amt;
          if (+f.is_taxable || +f.is_bonus) pcbTaxable += amt;
        }
      } else if (item.type === 'Deduction') {
        totalDeductions += amt;
      }
    }

    for (const item of manualItems) {
      const amt = +item.amount || 0;
      if (item.type === 'Manual Earning' || item.type === 'Adjustment') {
        if (amt > 0) totalAllowances += amt;
        else totalDeductions += Math.abs(amt);
      } else if (item.type === 'Manual Deduction') {
        totalDeductions += amt;
      }
    }

    // 6) Statutory tables
    const [epfConfigs] = await conn.query(`SELECT * FROM epf_contribution_table`);
    const [socsoConfigs] = await conn.query(`SELECT * FROM socso_contribution_table`);
    const [pcbConfigs] = await conn.query(`SELECT * FROM pcb_tax_table`);

    // 7) Statutory calculations
    let epfEmp = 0, epfEmpl = 0, socsoEmp = 0, socsoEmpl = 0, eisEmp = 0, eisEmpl = 0, pcbEmp = 0;

    const epfRow = epfConfigs.find(r => epfBase >= +r.salary_from && epfBase <= +r.salary_to);
    if (epfRow) {
      epfEmp  = round2(epfBase * (+epfRow.employee_percent / 100));
      epfEmpl = round2(epfBase * (+epfRow.employer_percent / 100));
    }

    const socsoRow = socsoConfigs.find(r => r.act_type === 'Act4' && socsoBase >= +r.salary_from && socsoBase <= +r.salary_to);
    if (socsoRow) {
      socsoEmp  = round2(+socsoRow.employee_fixed_amount || 0);
      socsoEmpl = round2(+socsoRow.employer_fixed_amount || 0);
    }

    const eisRow = socsoConfigs.find(r => r.act_type === 'Act800' && eisBase >= +r.salary_from && eisBase <= +r.salary_to);
    if (eisRow) {
      eisEmp  = round2(+eisRow.employee_fixed_amount || 0);
      eisEmpl = round2(+eisRow.employer_fixed_amount || 0);
    }

    const totalRelief = await getEmployeeTotalRelief(payroll.employee_id); // assumed available
    pcbEmp = await calculatePCBProgressive(pcbTaxable, pcbConfigs, totalRelief, payroll.employee_id); // assumed available
    pcbEmp = round2(pcbEmp);

    const gross_salary = round2(basic_salary + totalAllowances);
    const net_salary = round2(gross_salary - totalDeductions - epfEmp - socsoEmp - eisEmp - pcbEmp);

    // 8) Update payroll
    await conn.query(`
      UPDATE payroll SET
        basic_salary = ?,
        total_allowance = ?,
        gross_salary = ?,
        total_deduction = ?,
        net_salary = ?,
        epf_employee = ?,
        epf_employer = ?,
        socso_employee = ?,
        socso_employer = ?,
        eis_employee = ?,
        eis_employer = ?,
        pcb = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      basic_salary,
      totalAllowances,
      gross_salary,
      totalDeductions,
      net_salary,
      epfEmp,
      epfEmpl,
      socsoEmp,
      socsoEmpl,
      eisEmp,
      eisEmpl,
      pcbEmp,
      payrollId
    ]);

    // 9) Replace statutory items
    await conn.query(`
      DELETE FROM payslip_items
      WHERE payroll_id = ? AND type = 'Statutory'
    `, [payrollId]);

    const statutoryItems = [
      { label: 'EPF',  amount: epfEmp  },
      { label: 'SOCSO', amount: socsoEmp },
      { label: 'EIS',  amount: eisEmp  },
      { label: 'PCB',  amount: pcbEmp  }
    ];
    for (const s of statutoryItems) {
      await conn.query(`
        INSERT INTO payslip_items (payroll_id, label, amount, type, created_at)
        VALUES (?, ?, ?, 'Statutory', NOW())
      `, [payrollId, s.label, s.amount]);
    }

    // 10) Replace employer contributions
    await conn.query(`DELETE FROM employer_contributions WHERE payroll_id = ?`, [payrollId]);

    const employerItems = [
      { label: 'EPF Employer',  amount: epfEmpl },
      { label: 'SOCSO Employer', amount: socsoEmpl },
      { label: 'EIS Employer',  amount: eisEmpl }
    ];
    for (const e of employerItems) {
      await conn.query(`
        INSERT INTO employer_contributions (payroll_id, label, amount, type, created_at)
        VALUES (?, ?, ?, 'Employer Contribution', NOW())
      `, [payrollId, e.label, e.amount]);
    }

    // 11) Read back updated snapshot for response
    const [[updatedPayroll]] = await conn.query(`SELECT * FROM payroll WHERE id = ?`, [payrollId]);
    const [updatedItems] = await conn.query(`SELECT * FROM payslip_items WHERE payroll_id = ? ORDER BY id`, [payrollId]);
    const [updatedEmployer] = await conn.query(`SELECT * FROM employer_contributions WHERE payroll_id = ? ORDER BY id`, [payrollId]);

    return {
      payroll: updatedPayroll,
      payslip_items: updatedItems,
      employer_contributions: updatedEmployer
    };
  } finally {
    if (locked) {
      await conn.query(`SELECT RELEASE_LOCK(CONCAT('payroll_', ?)) AS released`, [payrollId]);
    }
  }
}

async function calculateAndSavePayroll({ 
  payroll_policy_assignment_id, 
  period_from, 
  period_to, 
  generated_by, 
  commit, 
  include_claims = true,             // legacy flag (kept for back-compat)
  claims_mode = 'all',                // NEW: 'all' | 'exclude' | 'claims_only'
  specific_employee_id = null         // for single-employee recalculation
}) {
  try {
    // Normalize & validate claims mode (fallback to legacy flag)
    const validModes = new Set(['all', 'exclude', 'claims_only']);
    if (!validModes.has(claims_mode)) {
      claims_mode = include_claims ? 'all' : 'exclude';
    }

    const CLAIMS_ONLY  = claims_mode === 'claims_only';
    const CLAIMS_EXCL  = claims_mode === 'exclude';
    const DO_STATUTORY = !CLAIMS_ONLY; // <- skip EPF/SOCSO/EIS/PCB & employer items in claims_only

    const payrollPeriod = new Date(period_from);
    const today = new Date();
    const isPastPeriod = payrollPeriod < new Date(today.getFullYear(), today.getMonth(), 1);
    const year = payrollPeriod.getFullYear();
    const month = payrollPeriod.getMonth() + 1;

    // 1. Deactivate expired policies
    await dbPromise.query(`
      UPDATE payroll_policy_assignment
      SET is_active = 0
      WHERE end_date IS NOT NULL AND end_date < CURDATE() AND is_active = 1
    `);

    // 2. Validate policy
    const [policyRows] = await dbPromise.query(
      `SELECT * FROM payroll_policy_assignment WHERE id = ? AND is_active = 1`,
      [payroll_policy_assignment_id]
    );
    if (!policyRows.length) throw new Error('Payroll policy assignment not found or inactive.');
    const policy = policyRows[0];

    const selectedPeriod = new Date(period_from);
    const policyStartDate = policy.start_date ? new Date(policy.start_date) : null;
    const policyEndDate = policy.end_date ? new Date(policy.end_date) : null;
    if (policyStartDate && selectedPeriod < policyStartDate) {
      throw new Error(`Selected period is before policy start date`);
    }
    if (policyEndDate && selectedPeriod > policyEndDate) {
      throw new Error(`Selected period is after policy end date`);
    }

    // 3. Get employees - filter for specific employee if provided
    let employeesQuery = `
      SELECT e.*, c.name AS company_name,
             (SELECT COUNT(*) FROM employee_dependents WHERE employee_id = e.id) AS dependents_count
      FROM employees e INNER JOIN companies c ON e.company_id = c.id
      WHERE e.company_id = ? AND e.status = 'Active'`;
    let params = [policy.company_id];
    
    if (specific_employee_id) {
      employeesQuery += ' AND e.id = ?';
      params.push(specific_employee_id);
    }
    
    if (policy.department_id) {
      employeesQuery += ' AND e.department_id = ?';
      params.push(policy.department_id);
    }
    
    const [employees] = await dbPromise.query(employeesQuery, params);
    if (!employees.length) throw new Error('No employees found');

    // 4. Load configs
    const [allowances] = await dbPromise.query(`
      SELECT a.*, am.name AS allowance_name, am.is_taxable, am.is_bonus, am.is_epf_eligible,
        am.is_socso_eligible, am.is_eis_eligible
      FROM payroll_config_allowance a
      JOIN allowance_master am ON a.allowance_id = am.id
      WHERE a.payroll_config_id = ?`, [policy.payroll_config_id]);

    const [deductions] = await dbPromise.query(`
      SELECT d.*, dm.name AS deduction_name
      FROM payroll_config_deduction d
      JOIN deduction_master dm ON d.deduction_id = dm.id
      WHERE d.payroll_config_id = ?`, [policy.payroll_config_id]);

    const [epfConfigs] = await dbPromise.query('SELECT * FROM epf_contribution_table');
    const [contributionConfigs] = await dbPromise.query('SELECT * FROM socso_contribution_table');
    const [pcbConfigs] = await dbPromise.query('SELECT * FROM pcb_tax_table');

    const payrollsPreview = [];

    // 5. Process each employee
    for (const emp of employees) {
      try {
        // Check existing payroll
        const [existing] = await dbPromise.query(
          `SELECT id, status_code FROM payroll
           WHERE employee_id = ? AND period_year = ? AND period_month = ?`,
          [emp.id, year, month]
        );

        let payroll_id = null;

        if (existing.length) {
          const status = existing[0].status_code;
          
          // For specific employee recalculation, allow updates even for finalized payroll
          if (specific_employee_id && ['FINAL', 'PAID', 'VOID'].includes(status)) {
            console.log(`Skipping recalculation for ${emp.name} - payroll is ${status}`);
            continue;
          } else if (!specific_employee_id && ['FINAL', 'PAID', 'VOID'].includes(status)) {
            payrollsPreview.push({
              payroll_id: existing[0].id,
              employee_id: emp.id,
              employee_name: emp.name,
              error: `Payroll already ${status}`
            });
            continue;
          }
          payroll_id = existing[0].id;
        }

        // 6. Calculate salary components
        const basic_salary = CLAIMS_ONLY ? 0 : parseFloat(emp.salary);
        let gross_salary = basic_salary;
        let totalAllowances = 0;
        let totalDeductions = 0;
        const empAllowances = [];
        const empDeductions = [];
        let epfBase  = CLAIMS_ONLY ? 0 : basic_salary;
        let socsoBase = CLAIMS_ONLY ? 0 : basic_salary;
        let eisBase  = CLAIMS_ONLY ? 0 : basic_salary;

        // Employee allowances
        let empAllowanceDetails = [];
        if (!CLAIMS_ONLY) {
          [empAllowanceDetails] = await dbPromise.query(`
            SELECT ea.amount, am.name AS allowance_name, am.is_taxable, am.is_bonus,
                   am.is_epf_eligible, am.is_socso_eligible, am.is_eis_eligible
            FROM employee_allowances ea
            JOIN allowance_master am ON am.id = ea.allowance_id
            WHERE ea.employee_id = ?`, [emp.id]);

          for (const a of empAllowanceDetails) {
            const amt = parseFloat(a.amount);
            totalAllowances += amt;
            empAllowances.push({ 
              label: a.allowance_name, 
              amount: amt,
              is_taxable: a.is_taxable,
              is_bonus: a.is_bonus,
              is_epf_eligible: a.is_epf_eligible,
              is_socso_eligible: a.is_socso_eligible,
              is_eis_eligible: a.is_eis_eligible
            });
            if (a.is_epf_eligible)   epfBase  += amt;
            if (a.is_socso_eligible) socsoBase += amt;
            if (a.is_eis_eligible)   eisBase  += amt;
          }

          // Policy allowances (avoid duplicates)
          for (const a of allowances) {
            const exists = empAllowanceDetails.some(ea => ea.allowance_name === a.allowance_name);
            if (exists) continue;
            
            let valid = true;
            if (a.cycle_months && a.cycle_start_month) {
              const start = new Date(a.cycle_start_month);
              const current = new Date(period_from);
              const monthDiff = (current.getFullYear() - start.getFullYear()) * 12 +
                               (current.getMonth() - start.getMonth());
              if (monthDiff < 0 || monthDiff >= a.cycle_months) valid = false;
            }
            if (valid && a.amount) {
              const amt = parseFloat(a.amount);
              totalAllowances += amt;
              empAllowances.push({ 
                label: a.allowance_name, 
                amount: amt,
                is_taxable: a.is_taxable,
                is_bonus: a.is_bonus,
                is_epf_eligible: a.is_epf_eligible,
                is_socso_eligible: a.is_socso_eligible,
                is_eis_eligible: a.is_eis_eligible
              });
              if (a.is_epf_eligible)   epfBase  += amt;
              if (a.is_socso_eligible) socsoBase += amt;
              if (a.is_eis_eligible)   eisBase  += amt;
            }
          }
        }

        gross_salary += totalAllowances;

        // Claims (include unless excluded)
        let approvedClaims = [];
        if (!CLAIMS_EXCL) {
          approvedClaims = await getApprovedClaimsForEmployee(emp.id, period_from, period_to);
          approvedClaims.forEach(c => { gross_salary += c.amount; });
        }

        // Employee deductions
        let empDeductionDetails = [];
        if (!CLAIMS_ONLY) {
          [empDeductionDetails] = await dbPromise.query(`
            SELECT ed.amount, dm.name AS deduction_name
            FROM employee_deductions ed
            JOIN deduction_master dm ON dm.id = ed.deduction_id
            WHERE ed.employee_id = ?`, [emp.id]);

          for (const d of empDeductionDetails) {
            const amt = parseFloat(d.amount);
            totalDeductions += amt;
            empDeductions.push({ label: d.deduction_name, amount: amt });
          }

          // Policy deductions (avoid duplicates)
          for (const d of deductions) {
            const exists = empDeductionDetails.some(ed => ed.deduction_name === d.deduction_name);
            if (exists) continue;
            
            let valid = true;
            if (d.cycle_months && d.cycle_start_month) {
              const start = new Date(d.cycle_start_month);
              const current = new Date(period_from);
              const monthDiff = (current.getFullYear() - start.getFullYear()) * 12 +
                               (current.getMonth() - start.getMonth());
              if (monthDiff < 0 || monthDiff >= d.cycle_months) valid = false;
            }
            if (valid && d.amount) {
              const amt = parseFloat(d.amount);
              totalDeductions += amt;
              empDeductions.push({ label: d.deduction_name, amount: amt });
            }
          }
        }

        // Manual payslip adjustments (preserve during single-employee recalculation)
        let manualItems = [];
        if (specific_employee_id && payroll_id) {
          const [manualAdjustments] = await dbPromise.query(`
            SELECT * FROM payslip_items 
            WHERE payroll_id = ? 
              AND label NOT IN ('Basic Salary', 'EPF', 'SOCSO', 'EIS', 'PCB', 'Claim Reimbursement')
              AND type IN ('Manual Earning', 'Manual Deduction', 'Adjustment')
          `, [payroll_id]);
          
          for (const item of manualAdjustments) {
            manualItems.push({
              label: item.label,
              amount: parseFloat(item.amount),
              type: item.type
            });
            if (item.type === 'Manual Earning' || item.type === 'Adjustment') {
              if (parseFloat(item.amount) > 0) gross_salary += parseFloat(item.amount);
              else totalDeductions += Math.abs(parseFloat(item.amount));
            } else if (item.type === 'Manual Deduction') {
              totalDeductions += parseFloat(item.amount);
            }
          }
        }

        // Statutory calculations (skip entirely in claims-only)
        let epfEmp = 0, epfEmpl = 0, socsoEmp = 0, socsoEmpl = 0, eisEmp = 0, eisEmpl = 0, pcbEmp = 0;

        if (DO_STATUTORY) {
          const epfRow = epfConfigs.find(r => epfBase >= parseFloat(r.salary_from) && epfBase <= parseFloat(r.salary_to));
          if (epfRow) {
            epfEmp  = Math.round(epfBase * (parseFloat(epfRow.employee_percent) / 100) * 100) / 100;
            epfEmpl = Math.round(epfBase * (parseFloat(epfRow.employer_percent) / 100) * 100) / 100;
          }

          const socsoRow = contributionConfigs.find(r => r.act_type === 'Act4' && socsoBase >= parseFloat(r.salary_from) && socsoBase <= parseFloat(r.salary_to));
          if (socsoRow) {
            socsoEmp  = parseFloat(socsoRow.employee_fixed_amount || 0);
            socsoEmpl = parseFloat(socsoRow.employer_fixed_amount || 0);
          }

          const eisRow = contributionConfigs.find(r => r.act_type === 'Act800' && eisBase >= parseFloat(r.salary_from) && eisBase <= parseFloat(r.salary_to));
          if (eisRow) {
            eisEmp  = parseFloat(eisRow.employee_fixed_amount || 0);
            eisEmpl = parseFloat(eisRow.employer_fixed_amount || 0);
          }

          // PCB (taxable salary + taxable allowances)
          const totalRelief = await getEmployeeTotalRelief(emp.id);
          let pcbTaxable = basic_salary;
          for (const a of empAllowances) {
            if (a.is_taxable === 1 || a.is_bonus === 1) pcbTaxable += a.amount;
          }
          pcbEmp = await calculatePCBProgressive(pcbTaxable, pcbConfigs, totalRelief, emp.id);
        }

        const net_salary = Math.round((gross_salary - totalDeductions - epfEmp - socsoEmp - eisEmp - pcbEmp) * 100) / 100;

        // Build payslip items
        const payslipItems = [
          ...(!CLAIMS_ONLY ? [{ label: 'Basic Salary', amount: basic_salary, type: 'Earning' }] : []),
          ...(!CLAIMS_ONLY ? empAllowances.map(x => ({ label: x.label, amount: x.amount, type: 'Earning' })) : []),
          ...approvedClaims,
          ...manualItems,
          ...(!CLAIMS_ONLY ? empDeductions.map(x => ({ label: x.label, amount: x.amount, type: 'Deduction' })) : []),
          ...(DO_STATUTORY ? [
            { label: 'EPF',   amount: epfEmp,   type: 'Statutory' },
            { label: 'SOCSO', amount: socsoEmp, type: 'Statutory' },
            { label: 'EIS',   amount: eisEmp,   type: 'Statutory' },
            { label: 'PCB',   amount: pcbEmp,   type: 'Statutory' }
          ] : [])
        ];

        // Employer contributions (empty in claims-only)
        const employerItems = DO_STATUTORY ? [
          { label: 'EPF Employer',   amount: epfEmpl,  type: 'Employer Contribution' },
          { label: 'SOCSO Employer', amount: socsoEmpl, type: 'Employer Contribution' },
          { label: 'EIS Employer',   amount: eisEmpl,  type: 'Employer Contribution' }
        ] : [];

        // Build response object
        const payrollObj = {
          payroll_id: payroll_id,
          employee_id: emp.id,
          period_from,
          period_to,
          company_name: emp.company_name,
          department_name: emp.department,
          position: emp.position,
          employment_type: emp.employment_type,
          employee_no: emp.employee_no,
          employee_name: emp.name,
          ic_passport_no: emp.ic_passport,
          work_location: emp.office,
          joined_date: emp.joined_date,
          confirmation_date: emp.confirmation_date,
          resigned_date: emp.resigned_date,
          nationality: emp.nationality,
          tax_no: emp.income_tax_no,
          dependents: emp.dependents_count,
          marital_status: emp.marital_status,
          currency: emp.currency || 'MYR',
          gross_salary,
          net_salary,
          bank_name: emp.bank_name,
          bank_account_no: emp.bank_account_no,
          bank_account_name: emp.bank_account_name,
          payslip_items: payslipItems,
          employer_contributions: employerItems
        };

        // 8. Save to DB if commit=true
        if (commit) {
          if (!payroll_id) {
            // Create new payroll
            const [[maxRow]] = await dbPromise.query(`
              SELECT MAX(row_order) AS max_order
              FROM payroll
              WHERE period_year = ? AND period_month = ?`, [year, month]);
            const nextRowOrder = (maxRow?.max_order || 0) + 1;

            const [result] = await dbPromise.query(`
              INSERT INTO payroll
              (employee_id, period_year, period_month, basic_salary, total_allowance,
              gross_salary, total_deduction, net_salary, epf_employee, epf_employer,
              socso_employee, socso_employer, eis_employee, eis_employer, pcb,
              status_code, generated_by, row_order, policy_assignment_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              emp.id, year, month,
              basic_salary, totalAllowances, gross_salary,
              totalDeductions, net_salary, epfEmp, epfEmpl,
              socsoEmp, socsoEmpl, eisEmp, eisEmpl, pcbEmp,
              'DRAFT', generated_by, nextRowOrder, payroll_policy_assignment_id
            ]);
            payrollObj.payroll_id = result.insertId;
            payroll_id = result.insertId;

          } else {
            // Update existing payroll
            await dbPromise.query(`
              UPDATE payroll SET
                basic_salary = ?, total_allowance = ?, gross_salary = ?, total_deduction = ?,
                net_salary = ?, epf_employee = ?, epf_employer = ?, socso_employee = ?,
                socso_employer = ?, eis_employee = ?, eis_employer = ?, pcb = ?, 
                updated_at = NOW()
              WHERE id = ?
            `, [
              basic_salary, totalAllowances, gross_salary,
              totalDeductions, net_salary, epfEmp, epfEmpl,
              socsoEmp, socsoEmpl, eisEmp, eisEmpl, pcbEmp, payroll_id
            ]);
          }

          // For recalculation, preserve manual adjustments
          if (specific_employee_id) {
            // Delete only system-generated items, keep manual ones
            await dbPromise.query(`
              DELETE FROM payslip_items 
              WHERE payroll_id = ? 
              AND type NOT IN ('Manual Earning', 'Manual Deduction', 'Adjustment')
            `, [payroll_id]);
            
            await dbPromise.query(`DELETE FROM employer_contributions WHERE payroll_id = ?`, [payroll_id]);
            
            // Insert only system-generated items
            const systemItems = payslipItems.filter(item => 
              !['Manual Earning', 'Manual Deduction', 'Adjustment'].includes(item.type)
            );
            
            for (const item of systemItems) {
              await dbPromise.query(`
                INSERT INTO payslip_items (payroll_id, label, amount, type, created_at)
                VALUES (?, ?, ?, ?, NOW())`, [payroll_id, item.label, item.amount, item.type]);
            }
          } else {
            // Normal generation - replace all items
            await dbPromise.query(`DELETE FROM payslip_items WHERE payroll_id = ?`, [payroll_id]);
            for (const item of payslipItems) {
              await dbPromise.query(`
                INSERT INTO payslip_items (payroll_id, label, amount, type, created_at)
                VALUES (?, ?, ?, ?, NOW())`, [payroll_id, item.label, item.amount, item.type]);
            }
            
            await dbPromise.query(`DELETE FROM employer_contributions WHERE payroll_id = ?`, [payroll_id]);
          }

          // Insert employer contributions only when statutory applies
          if (DO_STATUTORY) {
            for (const item of employerItems) {
              await dbPromise.query(`
                INSERT INTO employer_contributions (payroll_id, label, amount, type, created_at)
                VALUES (?, ?, ?, ?, NOW())`, [payroll_id, item.label, item.amount, item.type]);
            }
          }

          // Log recalculation if it's a specific employee update
          if (specific_employee_id) {
            await dbPromise.query(`
              INSERT INTO payroll_audit_log 
              (payroll_id, action, old_value, new_value, remarks, updated_by, updated_at)
              VALUES (?, 'recalculation', ?, ?, ?, ?, NOW())
            `, [
              payroll_id,
              'triggered',
              'completed',
              'Payroll recalculated after adjustment',
              generated_by
            ]);
          }
        }

        payrollsPreview.push(payrollObj);
      } catch (empErr) {
        console.error(`Payroll calc failed for ${emp.name}:`, empErr);
        payrollsPreview.push({
          employee_id: emp.id,
          employee_name: emp.name,
          error: empErr.message
        });
        continue;
      }
    }

    return commit 
      ? { success: true, count: payrollsPreview.length, data: payrollsPreview } 
      : payrollsPreview;
  } catch (err) {
    console.error('Payroll Calculation Error:', err);
    throw err;
  }
}


module.exports = {
  calculateAndSavePayroll,
  recalculatePayrollAfterAdjustment
};