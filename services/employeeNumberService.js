// services/employeeNumberService.js
const { dbPromise } = require('../models/db');

// services/employeeNumberService.js - Updated generateEmployeeNumber function
const generateEmployeeNumber = async (joinedDate, currentEmployeeNo = null, preview = false) => {
  const date = new Date(joinedDate);
  
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided');
  }
  
  const year = date.getFullYear();
  const prefix = `EMP-${year}`;
  
  // If we have a current employee number and it's valid for this year, return it
  if (currentEmployeeNo && currentEmployeeNo.startsWith(prefix)) {
    // Validate that this employee number doesn't already exist for another employee
    const validation = await validateEmployeeNumber(currentEmployeeNo);
    if (validation.available) {
      return currentEmployeeNo;
    }
  }
  
  let connection;
  
  try {
    if (preview) {
      // For preview mode - no transaction needed
      const [existing] = await dbPromise.execute(
        'SELECT last_seq FROM employee_no_sequences WHERE prefix = ?',
        [prefix]
      );
      
      const nextSeq = existing.length > 0 ? existing[0].last_seq + 1 : 1;
      return `${prefix}-${nextSeq.toString().padStart(4, '0')}`;
    }
    
    // For actual generation - get a connection for transaction
    connection = await dbPromise.getConnection();
    
    await connection.beginTransaction();
    
    const [existing] = await connection.execute(
      'SELECT last_seq FROM employee_no_sequences WHERE prefix = ? FOR UPDATE',
      [prefix]
    );
    
    let nextSeq;
    if (existing.length > 0) {
      nextSeq = existing[0].last_seq + 1;
      await connection.execute(
        'UPDATE employee_no_sequences SET last_seq = ?, updated_at = NOW() WHERE prefix = ?',
        [nextSeq, prefix]
      );
    } else {
      nextSeq = 1;
      await connection.execute(
        'INSERT INTO employee_no_sequences (prefix, last_seq) VALUES (?, ?)',
        [prefix, nextSeq]
      );
    }
    
    await connection.commit();
    return `${prefix}-${nextSeq.toString().padStart(4, '0')}`;
    
  } catch (error) {
    if (connection && !preview) {
      await connection.rollback();
    }
    throw error;
  } finally {
    // Always release the connection back to the pool
    if (connection && !preview) {
      connection.release();
    }
  }
};

// services/employeeNumberService.js - Fixed validateEmployeeNumber function
const validateEmployeeNumber = async (employeeNo) => {
  try {
    if (!employeeNo || typeof employeeNo !== 'string') {
      return {
        available: false,
        message: 'Invalid employee number format'
      };
    }
    
    // Check if employee number exists in database (without deleted_at check)
    const [employees] = await dbPromise.execute(
      'SELECT id FROM employees WHERE employee_no = ?',
      [employeeNo.trim()]
    );
    
    return {
      available: employees.length === 0,
      message: employees.length === 0 
        ? 'Employee number is available' 
        : 'Employee number already exists'
    };
  } catch (error) {
    console.error('Error validating employee number:', error);
    throw error;
  }
};
// Optional: Get current sequence information
const getSequenceInfo = async (year) => {
  try {
    const prefix = `EMP-${year}`;
    const [result] = await dbPromise.execute(
      'SELECT last_seq, updated_at FROM employee_no_sequences WHERE prefix = ?',
      [prefix]
    );
    
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
};

// Optional: Reset sequence (for admin purposes)
const resetSequence = async (year, newSequence = 0) => {
  let connection;
  
  try {
    const prefix = `EMP-${year}`;
    
    connection = await dbPromise.getConnection();
    await connection.beginTransaction();
    
    const [existing] = await connection.execute(
      'SELECT id FROM employee_no_sequences WHERE prefix = ? FOR UPDATE',
      [prefix]
    );
    
    if (existing.length > 0) {
      await connection.execute(
        'UPDATE employee_no_sequences SET last_seq = ?, updated_at = NOW() WHERE prefix = ?',
        [newSequence, prefix]
      );
    } else {
      await connection.execute(
        'INSERT INTO employee_no_sequences (prefix, last_seq) VALUES (?, ?)',
        [prefix, newSequence]
      );
    }
    
    await connection.commit();
    return true;
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  generateEmployeeNumber,
  validateEmployeeNumber,
  getSequenceInfo,
  resetSequence
};