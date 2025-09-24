const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');
const { sendEmail } = require('../utils/mailer');


//npm install exceljs
//npm install pdfkit
//npm install bwip-js



// Compare two objects, return an array of {field, old, new}
function diffAssetFields(oldRow, newRow) {
  const diffs = [];
  for (const key of Object.keys(newRow)) {
    if (oldRow[key] !== newRow[key]) {
      diffs.push({ field: key, old: oldRow[key], new: newRow[key] });
    }
  }
  return diffs;
}


// =======================
// PRODUCTS
// =======================


exports.getAllProducts = async (req, res) => {
  try {
    const { category_id, brand_id, model_id, location_id, keyword } = req.query;

    let sql = `
      SELECT 
        p.*, 
        b.name AS brand_name, 
        m.model_name,
        c.name AS category_name,
        u.name AS unit_name,
        al.name AS location_name
      FROM products p
      LEFT JOIN asset_brands b ON p.brand_id = b.id
      LEFT JOIN asset_models m ON p.model_id = m.id
      LEFT JOIN asset_categories c ON p.category_id = c.id
      LEFT JOIN asset_units u ON p.id = u.id
      LEFT JOIN asset_locations al ON p.location_id = al.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (brand_id) {
      sql += ` AND p.brand_id = ?`;
      params.push(brand_id);
    }

    if (model_id) {
      sql += ` AND p.model_id = ?`;
      params.push(model_id);
    }

    if (location_id) {
      sql += ` AND p.location_id = ?`;
      params.push(location_id);
    }

    if (keyword) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [results] = await dbPromise.query(sql, params);
    res.json(results);
  } catch (err) {
     console.error('Error fetching products:', err);
     res.status(500).json({ error: 'Failed to fetch products.' });
    //next(err);
  }
};


exports.getAllProductsPaging = async (req, res) => {
  try {
    const { category, brand_id, model_id, location, keyword } = req.query;
    let { page, limit } = req.query;

    // Default values for pagination
    page = parseInt(page) > 0 ? parseInt(page) : 1;
    limit = parseInt(limit) > 0 ? parseInt(limit) : 20;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT 
        p.*, 
        b.name AS brand_name, 
        m.model_name
      FROM products p
      LEFT JOIN asset_brands b ON p.brand_id = b.id
      LEFT JOIN asset_models m ON p.model_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ` AND p.category = ?`;
      params.push(category);
    }

    if (brand_id) {
      sql += ` AND p.brand_id = ?`;
      params.push(brand_id);
    }

    if (model_id) {
      sql += ` AND p.model_id = ?`;
      params.push(model_id);
    }

    if (location) {
      sql += ` AND p.storage_location = ?`;
      params.push(location);
    }

    if (keyword) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    // --- Get total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as temp`;
    const [countRows] = await dbPromise.query(countSql, params);
    const total = countRows[0]?.total || 0;

    // --- Add paging
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [results] = await dbPromise.query(sql, params);

    res.json({
      data: results,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
     console.error('Error fetching products:', err);
     res.status(500).json({ error: 'Failed to fetch products.' });
    //next(err);
  }
};


exports.createProduct1 = async (req, res, next) => {
  try {
    const { 
      sku, 
      name, 
      category_id,     // expect FK not string
      brand_id, 
      model_id, 
      unit_id,         // expect FK not string
      min_stock, 
      max_stock, 
      reorder_level, 
      description, 
      location_id      // expect FK not string
    } = req.body;

    // Validate required fields
    if (!sku || !name || !category_id) {
      return res.status(400).json({ error: 'SKU, name and category_id are required' });
    }

    // Validate category_id exists
    const [[category]] = await dbPromise.query('SELECT id FROM asset_categories WHERE id = ?', [category_id]);
    if (!category) return res.status(400).json({ error: 'Invalid category_id' });

    // Validate unit_id exists
    if (unit_id) {
      const [[unit]] = await dbPromise.query('SELECT id FROM asset_units WHERE id = ?', [unit_id]);
      if (!unit) return res.status(400).json({ error: 'Invalid unit_id' });
    }

    // Validate location_id exists
    if (location_id) {
      const [[location]] = await dbPromise.query('SELECT id FROM asset_locations WHERE id = ?', [location_id]);
      if (!location) return res.status(400).json({ error: 'Invalid location_id' });
    }

    // Validate brand_id exists
    if (brand_id) {
      const [[brand]] = await dbPromise.query('SELECT id FROM asset_brands WHERE id = ?', [brand_id]);
      if (!brand) return res.status(400).json({ error: 'Invalid brand_id' });
    }

    // Validate model_id exists
    if (model_id) {
      const [[model]] = await dbPromise.query('SELECT id FROM asset_models WHERE id = ?', [model_id]);
      if (!model) return res.status(400).json({ error: 'Invalid model_id' });
    }

    const sql = `INSERT INTO products 
      (sku, name, category_id, brand_id, model_id, unit_id, min_stock, max_stock, reorder_level, description, location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const [result] = await dbPromise.query(sql, [
      sku, name, category_id, brand_id, model_id, unit_id, 
      min_stock, max_stock, reorder_level, description, location_id
    ]);

    // Audit log
    await dbPromise.query(
      `INSERT INTO product_audit_log (product_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [result.insertId, '__all__', '', JSON.stringify(req.body), req.user.email, 'INSERT']
    );
    
    res.json({ id: result.insertId });
  } catch (err) {
      console.error('Error create Product:', err);
     res.status(500).json({ error: 'Failed to create products.' });
    //next(err);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const { 
      sku, 
      name, 
      category_id,     // expect FK not string
      brand_id, 
      model_id, 
      unit_id,         // expect FK not string
      min_stock, 
      max_stock, 
      reorder_level, 
      description, 
      location_id      // expect FK not string
    } = req.body;

    // Validate required fields
    if (!sku || !name || !category_id) {
      return res.status(400).json({ error: 'SKU, name and category_id are required' });
    }

    // Validate category_id exists
    const [[category]] = await dbPromise.query('SELECT id FROM asset_categories WHERE id = ?', [category_id]);
    if (!category) return res.status(400).json({ error: 'Invalid category_id' });

    // Validate unit_id exists
    if (unit_id) {
      const [[unit]] = await dbPromise.query('SELECT id FROM asset_units WHERE id = ?', [unit_id]);
      if (!unit) return res.status(400).json({ error: 'Invalid unit_id' });
    }

    // Validate location_id exists
    if (location_id) {
      const [[location]] = await dbPromise.query('SELECT id FROM asset_locations WHERE id = ?', [location_id]);
      if (!location) return res.status(400).json({ error: 'Invalid location_id' });
    }

    // Validate brand_id exists
    if (brand_id) {
      const [[brand]] = await dbPromise.query('SELECT id FROM asset_brands WHERE id = ?', [brand_id]);
      if (!brand) return res.status(400).json({ error: 'Invalid brand_id' });
    }

    // Validate model_id exists
    if (model_id) {
      const [[model]] = await dbPromise.query('SELECT id FROM asset_models WHERE id = ?', [model_id]);
      if (!model) return res.status(400).json({ error: 'Invalid model_id' });
    }

    const sql = `INSERT INTO products 
      (sku, name, category_id, brand_id, model_id, unit_id, min_stock, max_stock, reorder_level, description, location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const [result] = await dbPromise.query(sql, [
      sku, name, category_id, brand_id, model_id, unit_id, 
      min_stock, max_stock, reorder_level, description, location_id
    ]);

    // Audit log - always set as system for now
    await dbPromise.query(
      `INSERT INTO product_audit_log (product_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [result.insertId, '__all__', '', JSON.stringify(req.body), "system", 'INSERT']
    );
    
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('Error create Product:', err);
    res.status(500).json({ error: 'Failed to create product.' });
    // next(err);
  }
};



exports.getProductById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json(rows[0]);
  } catch (err) {
     console.error('Error fetching product:', err);
     res.status(500).json({ error: 'Failed to fetch product.' });
    //next(err);
  }
};


exports.updateProduct1 = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const {
      sku, 
      name, 
      category_id,      // integer FK
      brand_id, 
      model_id,
      unit_id,          // integer FK
      min_stock, 
      max_stock, 
      reorder_level, 
      description, 
      location_id       // integer FK
    } = req.body;

    // Validate category_id
    const [[category]] = await dbPromise.query('SELECT id FROM asset_categories WHERE id = ?', [category_id]);
    if (!category) return res.status(400).json({ error: 'Invalid category_id' });

    // Validate brand_id
    if (brand_id) {
      const [[brand]] = await dbPromise.query('SELECT id FROM asset_brands WHERE id = ?', [brand_id]);
      if (!brand) return res.status(400).json({ error: 'Invalid brand_id' });
    }

    // Validate model_id
    if (model_id) {
      const [[model]] = await dbPromise.query('SELECT id FROM asset_models WHERE id = ?', [model_id]);
      if (!model) return res.status(400).json({ error: 'Invalid model_id' });
    }

    // Validate unit_id
    if (unit_id) {
      const [[unit]] = await dbPromise.query('SELECT id FROM asset_units WHERE id = ?', [unit_id]);
      if (!unit) return res.status(400).json({ error: 'Invalid unit_id' });
    }

    // Validate location_id
    if (location_id) {
      const [[location]] = await dbPromise.query('SELECT id FROM asset_locations WHERE id = ?', [location_id]);
      if (!location) return res.status(400).json({ error: 'Invalid location_id' });
    }

    // Get old data for audit
    const [oldRows] = await dbPromise.query('SELECT * FROM products WHERE id = ?', [productId]);
    if (!oldRows[0]) return res.status(404).json({ error: 'Product not found.' });
    const oldData = oldRows[0];

    // Update product (use FKs not string values)
    const sql = `
      UPDATE products SET 
        sku = ?, 
        name = ?, 
        category_id = ?, 
        brand_id = ?, 
        model_id = ?, 
        unit_id = ?, 
        min_stock = ?, 
        max_stock = ?, 
        reorder_level = ?, 
        description = ?, 
        location_id = ?
      WHERE id = ?
    `;
    await dbPromise.query(sql, [
      sku, name, category_id, brand_id, model_id, unit_id, 
      min_stock, max_stock, reorder_level, description, location_id, productId
    ]);

    // Compose new row as in DB for audit diff
    const newData = {
      ...oldData,
      sku, name, category_id, brand_id, model_id, unit_id,
      min_stock, max_stock, reorder_level, description, location_id
    };

    // Compare fields for audit
    function diffFields(oldObj, newObj) {
      const diffs = [];
      for (const key of Object.keys(newObj)) {
        if (oldObj[key] !== newObj[key]) {
          diffs.push({ field: key, old: oldObj[key], new: newObj[key] });
        }
      }
      return diffs;
    }
    const changes = diffFields(oldData, newData);

    // Log changes to audit table
    for (const c of changes) {
      await dbPromise.query(
        `INSERT INTO product_audit_log 
          (product_id, field_changed, old_value, new_value, changed_by, action, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          productId,
          c.field,
          c.old !== undefined && c.old !== null ? String(c.old) : '',
          c.new !== undefined && c.new !== null ? String(c.new) : '',
          req.user?.email || 'system',
          'UPDATE'
        ]
      );
    }

    res.json({ success: true, changedFields: changes.map(x => x.field) });
  } catch (err) {
    next(err);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      sku, 
      name, 
      category_id,
      brand_id, 
      model_id, 
      unit_id,
      min_stock, 
      max_stock, 
      reorder_level, 
      description, 
      location_id 
    } = req.body;

    // Check product exists
    const [[oldProduct]] = await dbPromise.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!oldProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Validate category_id exists
    if (category_id) {
      const [[category]] = await dbPromise.query('SELECT id FROM asset_categories WHERE id = ?', [category_id]);
      if (!category) return res.status(400).json({ error: 'Invalid category_id' });
    }

    // Validate unit_id exists
    if (unit_id) {
      const [[unit]] = await dbPromise.query('SELECT id FROM asset_units WHERE id = ?', [unit_id]);
      if (!unit) return res.status(400).json({ error: 'Invalid unit_id' });
    }

    // Validate location_id exists
    if (location_id) {
      const [[location]] = await dbPromise.query('SELECT id FROM asset_locations WHERE id = ?', [location_id]);
      if (!location) return res.status(400).json({ error: 'Invalid location_id' });
    }

    // Validate brand_id exists
    if (brand_id) {
      const [[brand]] = await dbPromise.query('SELECT id FROM asset_brands WHERE id = ?', [brand_id]);
      if (!brand) return res.status(400).json({ error: 'Invalid brand_id' });
    }

    // Validate model_id exists
    if (model_id) {
      const [[model]] = await dbPromise.query('SELECT id FROM asset_models WHERE id = ?', [model_id]);
      if (!model) return res.status(400).json({ error: 'Invalid model_id' });
    }

    // Build update SQL (all fields editable)
    const sql = `
      UPDATE products SET 
        sku=?, 
        name=?, 
        category_id=?, 
        brand_id=?, 
        model_id=?, 
        unit_id=?, 
        min_stock=?, 
        max_stock=?, 
        reorder_level=?, 
        description=?, 
        location_id=?
      WHERE id=?
    `;

    await dbPromise.query(sql, [
      sku, name, category_id, brand_id, model_id, unit_id, 
      min_stock, max_stock, reorder_level, description, location_id, id
    ]);

    // Audit log
    await dbPromise.query(
      `INSERT INTO product_audit_log (product_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [id, '__all__', JSON.stringify(oldProduct), JSON.stringify(req.body), "system", 'UPDATE']
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error update Product:', err);
    res.status(500).json({ error: 'Failed to update product.' });
  }
};


exports.deleteProduct1 = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const [rows] = await dbPromise.query('SELECT * FROM products WHERE id = ?', [productId]);
    const oldData = rows[0];
    // Audit log before delete
    await dbPromise.query(
      `INSERT INTO product_audit_log (product_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [productId, '__all__', JSON.stringify(oldData), '', req.user.email, 'DELETE']
    );
    await dbPromise.query('DELETE FROM products WHERE id = ?', [productId]);
    res.json({ success: true });
  } catch (err) { next(err); }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const [rows] = await dbPromise.query('SELECT * FROM products WHERE id = ?', [productId]);
    const oldData = rows[0];
    // Use fallback for changed_by
    const changedBy = req.user?.email || 'system';

    // Audit log before delete
    await dbPromise.query(
      `INSERT INTO product_audit_log (product_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [productId, '__all__', JSON.stringify(oldData), '', changedBy, 'DELETE']
    );
    await dbPromise.query('DELETE FROM products WHERE id = ?', [productId]);
    res.json({ success: true });
  } catch (err) { next(err); }
};


// =======================
// STOCK MOVEMENTS
// =======================

exports.getAllStockMovements = async (req, res) => {
  try {
    const { product_id, movement_type, date } = req.query;
    let sql = `
      SELECT 
        sm.*, 
        p.name as product_name,
        r.name as reason_name,
        al.name as location_name
      FROM stock_movements sm 
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN stock_movement_reasons r ON sm.reason_id = r.id
      LEFT JOIN asset_locations al ON sm.location_id = al.id
      WHERE 1=1
    `;
    const params = [];

    if (product_id) {
      sql += ` AND sm.product_id = ?`;
      params.push(product_id);
    }
    if (movement_type) {
      sql += ` AND sm.movement_type = ?`;
      params.push(movement_type);
    }
    if (date) {
      sql += ` AND DATE(sm.movement_date) = ?`;
      params.push(date);
    }

    sql += ` ORDER BY sm.movement_date DESC, sm.id DESC`;

    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};


exports.getAllStockMovementsPaging = async (req, res, next) => {
  try {
    const { product_id, movement_type, date } = req.query;
    let { page, limit } = req.query;

    page = parseInt(page) > 0 ? parseInt(page) : 1;
    limit = parseInt(limit) > 0 ? parseInt(limit) : 20;
    const offset = (page - 1) * limit;

    let sql = `SELECT sm.*, p.name as product_name FROM stock_movements sm JOIN products p ON sm.product_id = p.id WHERE 1=1`;
    const params = [];

    if (product_id) {
      sql += ` AND sm.product_id = ?`;
      params.push(product_id);
    }
    if (movement_type) {
      sql += ` AND sm.movement_type = ?`;
      params.push(movement_type);
    }
    if (date) {
      sql += ` AND DATE(sm.movement_date) = ?`;
      params.push(date);
    }

    // Count
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) temp`;
    const [countRows] = await dbPromise.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await dbPromise.query(sql, params);

    res.json({
      data: rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
};


exports.createStockMovement = async (req, res, next) => {
  try {
    const { product_id, movement_type, quantity, reason_id, performed_by, issued_to, location_id } = req.body;

    // 1. Validate required FKs
    // Validate product_id
    const [[product]] = await dbPromise.query('SELECT id FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(400).json({ error: 'Invalid product_id' });

    // Validate reason_id
    if (reason_id) {
      const [[reason]] = await dbPromise.query('SELECT id FROM stock_movement_reasons WHERE id = ?', [reason_id]);
      if (!reason) return res.status(400).json({ error: 'Invalid reason_id' });
    }

    // Validate location_id
    if (location_id) {
      const [[loc]] = await dbPromise.query('SELECT id FROM asset_locations WHERE id = ?', [location_id]);
      if (!loc) return res.status(400).json({ error: 'Invalid location_id' });
    }

    // 2. For outgoing movements, check negative stock
    if (['Stock Out', 'Lost/Damaged', 'Repair Out'].includes(movement_type)) {
      const [[stock]] = await dbPromise.query(`
        SELECT IFNULL(SUM(
          CASE 
            WHEN movement_type IN ('Stock In', 'Return', 'Repair In', 'Adjustment') THEN quantity
            WHEN movement_type IN ('Stock Out', 'Lost/Damaged', 'Repair Out') THEN -quantity
            ELSE 0
          END
        ), 0) AS balance
        FROM stock_movements
        WHERE product_id = ?
      `, [product_id]);

      if ((stock.balance ?? 0) < quantity) {
        return res.status(400).json({
          error: 'Insufficient stock',
          current_stock: stock.balance,
          attempted_reduction: quantity
        });
      }
    }

    // 3. Insert new stock movement
    const sql = `
      INSERT INTO stock_movements 
        (product_id, movement_type, quantity, reason_id, performed_by, issued_to, location_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await dbPromise.query(sql, [
      product_id, movement_type, quantity, reason_id, performed_by, issued_to, location_id
    ]);

    // 4. Audit log for each field
    const newId = result.insertId;
    const fields = {
      product_id, movement_type, quantity, reason_id, performed_by, issued_to, location_id
    };
    for (const [field, value] of Object.entries(fields)) {
      await dbPromise.query(
        `INSERT INTO stock_movement_audit_log 
          (stock_movement_id, field_changed, old_value, new_value, changed_by, action, changed_at)
         VALUES (?, ?, '', ?, ?, 'INSERT', NOW())`,
        [
          newId,
          field,
          value !== undefined && value !== null ? String(value) : '',
          req.user?.email || 'system'
        ]
      );
    }

    res.json({ id: newId, auditLogged: Object.keys(fields).length });
  } catch (err) {
    next(err);
  }
};


exports.updateStockMovement = async (req, res, next) => {
  try {
    const movementId = req.params.id;
    const {
      product_id,
      movement_type,
      quantity,
      reason,
      performed_by,
      issued_to,
      location
    } = req.body;

    // 1. Get old data for audit
    const [oldRows] = await dbPromise.query('SELECT * FROM stock_movements WHERE id = ?', [movementId]);
    if (!oldRows[0]) return res.status(404).json({ error: 'Stock movement not found.' });
    const oldData = oldRows[0];

    // 2. Update the record
    const sql = `
      UPDATE stock_movements SET
        product_id = ?, movement_type = ?, quantity = ?, reason = ?, performed_by = ?, issued_to = ?, location = ?
      WHERE id = ?
    `;
    await dbPromise.query(sql, [
      product_id,
      movement_type,
      quantity,
      reason,
      performed_by,
      issued_to,
      location,
      movementId
    ]);

    // 3. Prepare new data for comparison
    const newData = {
      ...oldData,
      product_id, movement_type, quantity, reason, performed_by, issued_to, location
    };

    // 4. Compare and find changed fields
    const changedFields = [];
    for (const key of ['product_id', 'movement_type', 'quantity', 'reason', 'performed_by', 'issued_to', 'location']) {
      if (oldData[key] != newData[key]) { // != allows string/number compare
        changedFields.push({
          field: key,
          old: oldData[key],
          new: newData[key]
        });
      }
    }

    // 5. Insert audit logs for each changed field
    for (const change of changedFields) {
      await dbPromise.query(
        `INSERT INTO stock_movement_audit_log 
          (stock_movement_id, field_changed, old_value, new_value, changed_by, action, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          movementId,
          change.field,
          change.old !== undefined && change.old !== null ? String(change.old) : '',
          change.new !== undefined && change.new !== null ? String(change.new) : '',
          req.user?.email || 'system',
          'UPDATE'
        ]
      );
    }

    res.json({
      success: true,
      changed: changedFields.map(f => f.field),
      auditLogged: changedFields.length
    });
  } catch (err) {
    next(err);
  }
};


exports.getStockMovementById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        sm.*,
        p.name as product_name,
        r.name as reason_name,
        al.name as location_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN stock_movement_reasons r ON sm.reason_id = r.id
      LEFT JOIN asset_locations al ON sm.location_id = al.id
      WHERE sm.id = ?`, 
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Stock movement not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};



exports.deleteStockMovement = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch the stock movement before deleting
    const [rows] = await dbPromise.query(
      'SELECT * FROM stock_movements WHERE id = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Stock movement not found.' });
    }
    const oldRecord = rows[0];

    // 2. Insert audit log for each field
    for (const [field, value] of Object.entries(oldRecord)) {
      if (field === 'id') continue; // skip the PK, or include if needed
      await dbPromise.query(
        `INSERT INTO stock_movement_audit_log
          (stock_movement_id, field_changed, old_value, new_value, changed_by, action, changed_at)
         VALUES (?, ?, ?, '', ?, 'DELETE', NOW())`,
        [
          id,
          field,
          value !== undefined && value !== null ? String(value) : '',
          req.user?.email || 'system'
        ]
      );
    }

    // 3. Delete the stock movement
    await dbPromise.query('DELETE FROM stock_movements WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};


// =======================
// ASSETS
// =======================

exports.getAllAssets1 = async (req, res) => {
  try {
    const { status, assigned_to, keyword } = req.query;
    let sql = `SELECT a.*, p.name as product_name FROM assets a LEFT JOIN products p ON a.product_id = p.id WHERE 1=1`;
    const params = [];

    if (status) {
      sql += ` AND a.status_id = ?`;
      params.push(status);
    }
    if (assigned_to) {
      sql += ` AND a.assigned_to = ?`;
      params.push(assigned_to);
    }
    if (keyword) {
      sql += ` AND (a.serial_number LIKE ? OR p.name LIKE ? OR a.description LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    // console.error('Error fetching assets:', err);
    // res.status(500).json({ error: 'Failed to fetch assets.' });
    next(err);
  }
};

exports.getAllAssets = async (req, res, next) => {
  try {
    const { status, assigned_to, keyword } = req.query;
    let sql = `
          SELECT 
        a.*, 
        p.name AS product_name,
        b.name AS brand_name,
        m.model_name AS model_name,
        t.name AS type_name,
        s.name AS status_name,
        l.name AS location_name,
        c.name AS category_name,
        u.name AS unit_name,
        e.name AS assigned_to_name,            
        d.department_name AS assigned_department_name      
      FROM assets a
      LEFT JOIN products p ON a.product_id = p.id
      LEFT JOIN asset_brands b ON a.brand_id = b.id
      LEFT JOIN asset_models m ON a.model_id = m.id
      LEFT JOIN asset_types t ON a.asset_type_id = t.id
      LEFT JOIN asset_statuses s ON a.status_id = s.id
      LEFT JOIN asset_locations l ON a.location = l.id
      LEFT JOIN asset_categories c ON p.category_id = c.id
      LEFT JOIN asset_units u ON p.id = u.id
      LEFT JOIN employees e ON a.assigned_to = e.id             
      LEFT JOIN departments d ON a.assigned_department = d.id    
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND a.status_id = ?`;
      params.push(status);
    }
    if (assigned_to) {
      sql += ` AND a.assigned_to = ?`;
      params.push(assigned_to);
    }
    if (keyword) {
      sql += ` AND (a.serial_number LIKE ? OR p.name LIKE ? OR a.description LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};


exports.getAllAssetsPaging = async (req, res, next) => {
  try {
    const { status, assigned_to, keyword } = req.query;
    let { page, limit } = req.query;

    page = parseInt(page) > 0 ? parseInt(page) : 1;
    limit = parseInt(limit) > 0 ? parseInt(limit) : 20;
    const offset = (page - 1) * limit;

    let sql = `SELECT a.*, p.name as product_name FROM assets a LEFT JOIN products p ON a.product_id = p.id WHERE 1=1`;
    const params = [];

    if (status) {
      sql += ` AND a.status_id = ?`;
      params.push(status);
    }
    if (assigned_to) {
      sql += ` AND a.assigned_to = ?`;
      params.push(assigned_to);
    }
    if (keyword) {
      sql += ` AND (a.serial_number LIKE ? OR p.name LIKE ? OR a.description LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) temp`;
    const [countRows] = await dbPromise.query(countSql, params);
    const total = countRows[0]?.total || 0;

    // Add paging
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await dbPromise.query(sql, params);

    res.json({
      data: rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
};

exports.createAsset = async (req, res, next) => {
  try {
    const { 
      serial_number,
      product_id,
      asset_type_id,
      status_id,
      brand_id,
      model_id,
      purchase_date,
      warranty_expiry,
      invoice_ref,
      supplier,
      location,
      description,
      attachments,
      qr_code_url,
      asset_group_id,
      color,
      assigned_to,
      assigned_department,
      assignment_start_date
    } = req.body;

    // --- Validate brand_id exists ---
    const [[brand]] = await dbPromise.query('SELECT id FROM asset_brands WHERE id = ?', [brand_id]);
    if (!brand) return res.status(400).json({ error: 'Invalid brand_id' });

    // --- Validate model_id exists AND belongs to brand ---
    const [[model]] = await dbPromise.query(
      'SELECT id FROM asset_models WHERE id = ? AND brand_id = ?',
      [model_id, brand_id]
    );
    if (!model) return res.status(400).json({ error: 'Invalid model_id for this brand' });

    // --- Insert asset ---
    const sql = `INSERT INTO assets (
      serial_number, product_id, asset_type_id, status_id,
      brand_id, model_id, purchase_date, warranty_expiry,
      invoice_ref, supplier, location, description, attachments,
      qr_code_url, asset_group_id, color, assigned_to,
      assigned_department, assignment_start_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const [result] = await dbPromise.query(sql, [
      serial_number, product_id, asset_type_id, status_id,
      brand_id, model_id, purchase_date, warranty_expiry,
      invoice_ref, supplier, location, description, attachments,
      qr_code_url, asset_group_id, color, assigned_to,
      assigned_department, assignment_start_date
    ]);
    
    // --- Audit log: Log entire asset as created ---
    await dbPromise.query(
      `INSERT INTO asset_audit_log (asset_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        result.insertId,
        '__all__',
        '', // no old value on create
        JSON.stringify({ 
          serial_number, product_id, asset_type_id, status_id, brand_id, model_id,
          purchase_date, warranty_expiry, invoice_ref, supplier, location, description,
          attachments, qr_code_url, asset_group_id, color, assigned_to, assigned_department,
          assignment_start_date
        }),
        (req.user && req.user.email) ? req.user.email : 'system',
        'INSERT'
      ]
    );

    res.json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
};     

exports.getAssetById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await dbPromise.query(
      `SELECT a.*,
              p.name AS product_name,
              b.name AS brand_name,
              m.model_name,
              t.name AS type_name,
              s.name AS status_name,
              l.name AS location_name,
              c.name AS category_name,
              u.name AS unit_name,
              emp.name AS assigned_to_name,
              d.department_name AS assigned_department_name
         FROM assets a
    LEFT JOIN products p ON a.product_id = p.id
    LEFT JOIN asset_brands b ON a.brand_id = b.id
    LEFT JOIN asset_models m ON a.model_id = m.id
    LEFT JOIN asset_types t ON a.asset_type_id = t.id
    LEFT JOIN asset_statuses s ON a.status_id = s.id
    LEFT JOIN asset_locations l ON a.location = l.id
    LEFT JOIN asset_categories c ON a.id = c.id
    LEFT JOIN asset_units u ON a.id = u.id
    LEFT JOIN employees emp ON a.assigned_to = emp.id
    LEFT JOIN departments d ON a.assigned_department = d.id
      WHERE a.id =  ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};



exports.updateAsset = async (req, res, next) => {
  try {
    const assetId = req.params.id;

    // 1. Get old values
    const [oldRows] = await dbPromise.query('SELECT * FROM assets WHERE id = ?', [assetId]);
    if (!oldRows.length) return res.status(404).json({ error: 'Asset not found' });
    const oldData = oldRows[0];

    // 2. Update asset as usual
    // Make sure the order matches your DB columns!
    const fields = [
      'serial_number', 'product_id', 'asset_type_id', 'status_id',
      'brand_id', 'model_id', 'purchase_date', 'warranty_expiry',
      'invoice_ref', 'supplier', 'location', 'description', 'attachments',
      'qr_code_url', 'asset_group_id', 'color', 'assigned_to',
      'assigned_department', 'assignment_start_date'
    ];
    const updateSql = `
      UPDATE assets SET
        serial_number = ?, product_id = ?, asset_type_id = ?, status_id = ?,
        brand_id = ?, model_id = ?, purchase_date = ?, warranty_expiry = ?,
        invoice_ref = ?, supplier = ?, location = ?, description = ?, attachments = ?,
        qr_code_url = ?, asset_group_id = ?, color = ?, assigned_to = ?,
        assigned_department = ?, assignment_start_date = ?
      WHERE id = ?
    `;
    const values = fields.map(f => req.body[f]);
    values.push(assetId);

    await dbPromise.query(updateSql, values);

    // 3. Compose new row as would be in DB (merge old with req.body, as some may be omitted in patch request)
    const newData = { ...oldData, ...req.body };

    // 4. Diff and log changed fields
    const changes = diffAssetFields(oldData, newData);
    for (const c of changes) {
      await dbPromise.query(
        `INSERT INTO asset_audit_log (asset_id, field_changed, old_value, new_value, changed_by, action, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [assetId, c.field, String(c.old ?? ''), String(c.new ?? ''), req.user?.email || 'system', 'UPDATE']
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.deleteAsset = async (req, res, next) => {
  try {
    const assetId = req.params.id;
    const [rows] = await dbPromise.query('SELECT * FROM assets WHERE id = ?', [assetId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found.' });
    }
    const oldData = rows[0];
    // Audit log before delete
    await dbPromise.query(
      `INSERT INTO asset_audit_log (asset_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        assetId,
        '__all__',
        JSON.stringify(oldData),
        '',
        (req.user && req.user.email) ? req.user.email : 'system',
        'DELETE'
      ]
    );
    await dbPromise.query('DELETE FROM assets WHERE id = ?', [assetId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.assignAsset = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { assigned_to, assigned_department, assignment_start_date } = req.body;
    if (!assigned_to || !assigned_department) {
      return res.status(400).json({ error: 'Both assigned_to and assigned_department required' });
    }
    await dbPromise.query(
      'UPDATE assets SET assigned_to = ?, assigned_department = ?, assignment_start_date = ? WHERE id = ?',
      [assigned_to, assigned_department, assignment_start_date, id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.returnAsset = async (req, res) => {
  try {
    const assetId = req.params.id;
    const { return_date, condition, reason, note } = req.body;

    // Validate asset exists
    const [assets] = await dbPromise.query('SELECT * FROM assets WHERE id = ?', [assetId]);
    if (!assets.length) return res.status(404).json({ error: 'Asset not found' });

    // Mark as returned (update status_id, etc.)
    await dbPromise.query(
      `UPDATE assets SET status_id = ?, assigned_to = NULL, assigned_department = NULL, assignment_start_date = NULL WHERE id = ?`,
      [5, assetId] // replace 5 with your "Returned" status_id
    );

    // Log the return (use assetId here)
    await dbPromise.query(
      `INSERT INTO asset_audit_log (asset_id, field_changed, old_value, new_value, changed_by, action, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        assetId,  // <-- Corrected here!
        'return',
        null,
        JSON.stringify({ return_date, condition, reason, note }),
        req.user?.email || 'system',
        'RETURN'
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to return asset' });
  }
};


// =======================
// ASSETS REQUESTS
// =======================

exports.getAssetRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const [[row]] = await dbPromise.query(`
      SELECT
        ar.*,
        ars.status_name,
        emp.name AS employee_name,
        behalf.name AS behalf_name,
        at.name AS asset_type_name,
        ab.name AS brand_name,
        am.model_name
      FROM asset_requests ar
      LEFT JOIN asset_request_status ars ON ar.status_id = ars.id
      LEFT JOIN employees emp ON ar.employee_id = emp.id
      LEFT JOIN employees behalf ON ar.submitted_on_behalf = behalf.id
      LEFT JOIN asset_types at ON ar.asset_type_id = at.id
      LEFT JOIN asset_brands ab ON ar.brand_id = ab.id
      LEFT JOIN asset_models am ON ar.model_id = am.id
      WHERE ar.id = ?
    `, [id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get asset request', details: err.message });
  }
};



exports.deleteAssetRequest = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM asset_requests WHERE id = ?', [req.params.id]);
    res.json({ message: 'Asset request deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting asset request', details: err.message });
  }
};

// =======================
// MASTER TABLES
// =======================

exports.getProductCategories = async (req, res) => {
  try {
  const [rows] = await dbPromise.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ""');
  res.json(rows.map(row => row.category));
  } catch (err) {
    res.status(500).json({ error: 'Error fetching product categories', details: err.message });
  }
};

exports.getAssetStatuses = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM asset_statuses ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching asset statuses', details: err.message });
  }
};

exports.getAssetTypes = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM asset_types ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching asset types', details: err.message });
  }
};

exports.getAssetLocations = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM asset_locations ORDER BY location_name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching asset locations', details: err.message });
  }
};

// =======================
// DASH ASSET STATE
// =======================

exports.getAssetStats = async (req, res) => {
  try {
    const [
      [totalAssets],
      [assignedAssets],
      [attachmentsUploaded],
      [lostOrDamagedAssets],
      [repairOut],
      [repairIn],
      [pendingAssetRequests],
      [expiringWarranty],
      [expiredWarranty],
      categories,
      brands,
      locations,
      departments
    ] = await Promise.all([
      dbPromise.query(`SELECT COUNT(*) AS count FROM assets`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM assets WHERE assigned_to IS NOT NULL`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM assets WHERE attachments IS NOT NULL AND attachments != ''`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM assets WHERE status_id IN (SELECT id FROM asset_statuses WHERE status IN ('Lost', 'Damaged'))`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM stock_movements WHERE movement_type = 'Repair Out'`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM stock_movements WHERE movement_type = 'Repair In'`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM asset_requests WHERE status = 'Pending'`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM assets WHERE warranty_expiry BETWEEN CURDATE() AND LAST_DAY(CURDATE())`),
      dbPromise.query(`SELECT COUNT(*) AS count FROM assets WHERE warranty_expiry < CURDATE()`),

      // Grouped stats
      dbPromise.query(`
        SELECT pc.name AS category, COUNT(*) AS count
        FROM assets a
        JOIN products p ON a.product_id = p.id
        JOIN asset_categories pc ON p.category_id = pc.id
        GROUP BY pc.name
        ORDER BY count DESC
        LIMIT 5
      `),

      dbPromise.query(`
        SELECT brand, COUNT(*) AS count
        FROM assets
        WHERE brand IS NOT NULL AND brand != ''
        GROUP BY brand
        ORDER BY count DESC
        LIMIT 5
      `),

      dbPromise.query(`
        SELECT location, COUNT(*) AS count
        FROM assets
        WHERE location IS NOT NULL AND location != ''
        GROUP BY location
        ORDER BY count DESC
        LIMIT 5
      `),

      dbPromise.query(`
        SELECT d.name AS department, COUNT(*) AS count
        FROM assets a
        JOIN departments d ON a.assigned_department = d.id
        GROUP BY d.name
        ORDER BY count DESC
        LIMIT 5
      `)
    ]);

    res.json({
      totalAssets: totalAssets.count,
      assignedAssets: assignedAssets.count,
      unassignedAssets: totalAssets.count - assignedAssets.count,
      attachmentsUploaded: attachmentsUploaded.count,
      lostOrDamagedAssets: lostOrDamagedAssets.count,
      repairStatus: {
        repairOut: repairOut.count,
        repairIn: repairIn.count
      },
      warranty: {
        expiringThisMonth: expiringWarranty.count,
        expired: expiredWarranty.count
      },
      pendingAssetRequests: pendingAssetRequests.count,
      topCategories: categories,
      topBrands: brands,
      byLocation: locations,
      assignedDepartments: departments
    });

  } catch (error) {
    console.error('Error fetching asset stats:', error);
    res.status(500).json({ error: 'Failed to fetch asset statistics' });
  }
};

// =======================
// QR CODE 
// =======================

exports.getAssetQRCodeData = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await dbPromise.query(
      `SELECT a.id, a.serial_number, a.color, a.assignment_start_date, 
              a.qr_last_generated,
			  b.name AS brand,
              t.name AS type,
              e.name AS owner,
			   d.department_name AS owner_department
       FROM assets a
       LEFT JOIN products p ON a.product_id = p.id
       LEFT JOIN asset_categories c ON p.category_id = c.id
       LEFT JOIN asset_types t ON a.asset_type_id = t.id
       LEFT JOIN asset_statuses s ON a.status_id = s.id
       LEFT JOIN employees e ON a.assigned_to = e.id
       LEFT JOIN departments d ON a.assigned_department = d.id
       LEFT JOIN asset_brands b ON a.brand_id = b.name
       WHERE a.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    const asset = rows[0];

    const qrData = {
      Brand: asset.brand || '',
      Type: asset.type || '',
      SerialNo: asset.serial_number,
      Color: asset.color || '',
      Owner: asset.owner || '',
      OwnerDept: asset.owner_department || '',
      StartDate: asset.assignment_start_date || ''
    };

    await dbPromise.query(`UPDATE assets SET qr_last_generated = NOW() WHERE id = ?`, [id]);

    res.json({
      asset_id: id,
      qr_data: qrData,
      generated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
  } catch (err) {
    res.status(500).json({ message: 'Error generating QR data', details: err.message });
  }
};

exports.searchAssetWithQR = async (req, res) => {
  try {
    const { q } = req.query;
    const [rows] = await dbPromise.query(
      `SELECT a.id, a.serial_number, a.color, a.assignment_start_date, 
              b.name AS brand, t.name AS type,
              e.name AS owner, d.name AS owner_department
       FROM assets a
       LEFT JOIN products p ON a.product_id = p.id
       LEFT JOIN asset_categories c ON p.category_id = c.id
       LEFT JOIN asset_types t ON a.asset_type_id = t.id
       LEFT JOIN asset_statuses s ON a.status_id = s.id
       LEFT JOIN employees e ON a.assigned_to = e.id
       LEFT JOIN departments d ON a.assigned_department = d.id
       LEFT JOIN asset_brands b ON a.brand = b.name
       WHERE a.serial_number = ? OR p.name LIKE ?`,
      [q, `%${q}%`]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    const asset = rows[0];
    const qrData = {
      Brand: asset.brand || '',
      Type: asset.type || '',
      SerialNo: asset.serial_number,
      Color: asset.color || '',
      Owner: asset.owner || '',
      OwnerDept: asset.owner_department || '',
      StartDate: asset.assignment_start_date || ''
    };

    res.json({ asset_id: asset.id, qr_data: qrData });
  } catch (err) {
    res.status(500).json({ message: 'Error searching asset', details: err.message });
  }
};


// =======================
// Asset Grouping
// =======================

// Fix asset group methods to use correct column names
exports.createAssetGroup = async (req, res) => {
  try {
    const { name, assetIds } = req.body;
    
    if (!name || !Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({ error: 'Group name and at least one asset ID are required' });
    }

    // Validate all asset IDs exist
    const [existingAssets] = await dbPromise.query(
      'SELECT id FROM assets WHERE id IN (?)', 
      [assetIds]
    );
    
    if (existingAssets.length !== assetIds.length) {
      return res.status(400).json({ error: 'One or more asset IDs are invalid' });
    }

    const [groupResult] = await dbPromise.query(
      'INSERT INTO asset_groups (name) VALUES (?)', 
      [name]
    );
    
    const groupId = groupResult.insertId;
    const values = assetIds.map(assetId => [groupId, assetId]);
    
    await dbPromise.query(
      'INSERT INTO asset_group_items (group_id, asset_id) VALUES ?', 
      [values]
    );
    
    res.status(201).json({ 
      message: 'Asset group created', 
      groupId,
      assetCount: assetIds.length 
    });
  } catch (error) {
    console.error('Error creating asset group:', error);
    res.status(500).json({ message: 'Failed to create asset group' });
  }
};

exports.getAssetGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const [group] = await dbPromise.query(`SELECT * FROM asset_groups WHERE id = ?`, [id]);
    const [items] = await dbPromise.query(
      `SELECT a.* FROM asset_group_items agi
       JOIN assets a ON agi.asset_id = a.id
       WHERE agi.group_id = ?`,
      [id]
    );

    if (group.length === 0) {
      return res.status(404).json({ message: 'Asset group not found' });
    }

    res.json({ group: group[0], assets: items });
  } catch (error) {
    console.error('Error fetching asset group:', error);
    res.status(500).json({ message: 'Failed to fetch asset group' });
  }
};


exports.getAllAssetGroups = async (req, res) => {
  try {
    const [groups] = await dbPromise.query(`
SELECT 
    ag.id,
    ag.name,
    COUNT(agi.asset_id) AS asset_count,
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'id', a.id,
        'serial_number', a.serial_number,
        'brand', a.brand,
        'model', a.model,
        'status_id', a.status_id,
        'location', a.location,
        'purchase_date', a.purchase_date,
        'warranty_expiry', a.warranty_expiry,
        'assigned_to', a.assigned_to,
        'assigned_department', a.assigned_department
      )
    ) AS assets
FROM asset_groups ag
LEFT JOIN asset_group_items agi ON ag.id = agi.group_id
LEFT JOIN assets a ON agi.asset_id = a.id
GROUP BY ag.id
ORDER BY ag.id ASC
LIMIT 0, 1000;

    `);

    // Check if assets need parsing (some MySQL drivers return parsed JSON)
    const formattedGroups = groups.map(group => ({
      ...group,
      assets: group.assets && typeof group.assets === 'string' 
        ? JSON.parse(group.assets) 
        : group.assets || []
    }));

    res.json(formattedGroups);
  } catch (error) {
    console.error('Error fetching asset groups:', error);
    res.status(500).json({ message: 'Failed to fetch asset groups' });
  }
};

exports.updateAssetGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, assetIds } = req.body;
    await dbPromise.query(`UPDATE asset_groups SET group_name = ? WHERE id = ?`, [groupName, id]);
    await dbPromise.query(`DELETE FROM asset_group_items WHERE group_id = ?`, [id]);
    if (Array.isArray(assetIds) && assetIds.length > 0) {
      const values = assetIds.map(assetId => [id, assetId]);
      await dbPromise.query(`INSERT INTO asset_group_items (group_id, asset_id) VALUES ?`, [values]);
    }
    res.json({ message: 'Asset group updated' });
  } catch (error) {
    console.error('Error updating asset group:', error);
    res.status(500).json({ message: 'Failed to update asset group' });
  }
};

exports.deleteAssetGroup = async (req, res) => {
  try {
    const { id } = req.params;
    await dbPromise.query(`DELETE FROM asset_group_items WHERE group_id = ?`, [id]);
    await dbPromise.query(`DELETE FROM asset_groups WHERE id = ?`, [id]);
    res.json({ message: 'Asset group deleted' });
  } catch (error) {
    console.error('Error deleting asset group:', error);
    res.status(500).json({ message: 'Failed to delete asset group' });
  }
};

exports.getUnassignedAssets = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT * FROM assets 
      WHERE id NOT IN (SELECT asset_id FROM asset_group_items)
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching unassigned assets:', err);
    res.status(500).json({ message: 'Failed to fetch unassigned assets' });
  }
};


// =======================
// Assign / Return Asset Groups
// =======================

exports.assignAssetGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to, assigned_department, assignment_start_date } = req.body;
    await dbPromise.query(
      `UPDATE assets a
       JOIN asset_group_items agi ON a.id = agi.asset_id
       SET a.assigned_to = ?, a.assigned_department = ?, a.assignment_start_date = ?
       WHERE agi.group_id = ?`,
      [assigned_to, assigned_department, assignment_start_date, id]
    );
    res.json({ message: 'Asset group assigned successfully' });
  } catch (error) {
    console.error('Error assigning asset group:', error);
    res.status(500).json({ message: 'Failed to assign asset group' });
  }
};

exports.returnAssetGroup = async (req, res) => {
  try {
    const { id } = req.params;
    await dbPromise.query(
      `UPDATE assets a
       JOIN asset_group_items agi ON a.id = agi.asset_id
       SET a.assigned_to = NULL, a.assigned_department = NULL, a.assignment_start_date = NULL
       WHERE agi.group_id = ?`,
      [id]
    );
    res.json({ message: 'Asset group returned successfully' });
  } catch (error) {
    console.error('Error returning asset group:', error);
    res.status(500).json({ message: 'Failed to return asset group' });
  }
};

// =======================
// Asset Transfer
// =======================


exports.transferAsset1 = async (req, res) => {
  try {
    const { id } = req.params;
    const { to_employee_id, to_department_id, notes } = req.body;

    // Get the current assigned_to as from_employee_id (before update)
    const [[asset]] = await dbPromise.query(
      `SELECT assigned_to FROM assets WHERE id = ?`, [id]
    );
    const from_employee_id = asset ? asset.assigned_to : null;

    // Update asset assignment
    await dbPromise.query(
      `UPDATE assets SET assigned_to = ?, assigned_department = ?, assignment_start_date = NOW() WHERE id = ?`,
      [to_employee_id, to_department_id, id]
    );

    await dbPromise.query(
      `INSERT INTO asset_history (asset_id, action, from_employee_id, to_employee_id, action_date, notes)
       VALUES (?, 'Transfer', ?, ?, NOW(), ?)`,
      [id, from_employee_id, to_employee_id, notes || '']
    );

    res.json({ message: 'Asset transferred successfully' });
  } catch (error) {
    console.error('Error transferring asset:', error);
    res.status(500).json({ message: 'Failed to transfer asset' });
  }
};

// Add in inventoryController.js
exports.transferAsset = async (req, res) => {
  try {
    const assetId = req.params.id;
    const { assigned_to, assigned_department, transfer_date, reason, note } = req.body;

    // 1. Validate asset exists
    const [assets] = await dbPromise.query('SELECT * FROM assets WHERE id = ?', [assetId]);
    if (!assets.length) return res.status(404).json({ error: 'Asset not found' });

    // 2. Do the transfer
    await dbPromise.query(
      `UPDATE assets
        SET assigned_to = ?, assigned_department = ?, assignment_start_date = ?
        WHERE id = ?`,
      [assigned_to, assigned_department, transfer_date, assetId]
    );

    // 3. Optionally, audit log
    await dbPromise.query(
      `INSERT INTO asset_audit_log (asset_id, field_changed, old_value, new_value, changed_by, action, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        assetId,
        'transfer',
        JSON.stringify({
          from: {
            assigned_to: assets[0].assigned_to,
            assigned_department: assets[0].assigned_department,
          },
          to: { assigned_to, assigned_department },
        }),
        JSON.stringify({ transfer_date, reason, note }),
        req.user?.email || 'system',
        'TRANSFER'
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to transfer asset' });
  }
};



// =======================
// Asset History Log
// =======================

exports.getAssetHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const [logs] = await dbPromise.query(
      `SELECT
          h.id,
          h.action,
          emp_from.name AS from_employee,
          emp_to.name AS to_employee,
          h.action_date AS timestamp,
          h.notes
        FROM asset_history h
        LEFT JOIN employees emp_from ON h.from_employee_id = emp_from.id
        LEFT JOIN employees emp_to ON h.to_employee_id = emp_to.id
        WHERE h.asset_id = ?
        ORDER BY h.action_date DESC`,
      [id]
    );
    res.json(logs);
  } catch (error) {
    console.error('Error fetching asset history:', error);
    res.status(500).json({ message: 'Failed to fetch asset history' });
  }
};



// =======================
// QR Code Print Output (PDF)
// =======================

// Enhanced PDF Label Generation
exports.generateAssetLabelPDFVersion2 = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await dbPromise.query(`
      SELECT a.*, b.name AS brand_name, m.model_name
      FROM assets a
      LEFT JOIN asset_brands b ON a.brand_id = b.id
      LEFT JOIN asset_models m ON a.model_id = m.id
      WHERE a.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    const asset = rows[0];
    const doc = new PDFDocument({ size: [100, 150] }); // Small label size
    
    // Generate barcode
    const barcodeSvg = await bwipjs.toBuffer({
      bcid: 'code128', // Barcode type
      text: asset.serial_number,
      scale: 2,
      height: 10,
      includetext: true
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="asset_${id}_label.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);
    
    // Add content
    doc.image(barcodeSvg, 10, 10, { width: 80 });
    doc.fontSize(8).text(`Asset ID: ${asset.id}`, 10, 50);
    doc.text(`Brand: ${asset.brand_name}`, 10, 60);
    doc.text(`Model: ${asset.model_name}`, 10, 70);
    doc.text(`SN: ${asset.serial_number}`, 10, 80);
    
    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ 
      message: 'Failed to generate label',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

exports.generateAssetLabelPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await dbPromise.query(
      `SELECT 
        b.name AS brand, 
        t.name AS type, 
        a.serial_number, 
        a.color, 
        e.name AS owner, 
        d.department_name AS owner_department, 
        a.assignment_start_date 
      FROM assets a 
      LEFT JOIN products p ON a.product_id = p.id 
      LEFT JOIN asset_brands b ON p.brand_id = b.id 
      LEFT JOIN asset_types t ON a.asset_type_id = t.id 
      LEFT JOIN employees e ON a.assigned_to = e.id 
      LEFT JOIN departments d ON a.assigned_department = d.id 
      WHERE a.id = 1
      `,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }
    const asset = rows[0];
    const data = {
      Brand: asset.brand,
      Type: asset.type,
      SerialNo: asset.serial_number,
      Color: asset.color,
      Owner: asset.owner,
      OwnerDept: asset.owner_department,
      StartDate: asset.assignment_start_date
    };
    res.json({ label_data: data });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate label', details: err.message });
  }
};

// Enhanced PDF Generation
exports.generateAssetLabelPDFversion2 = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await dbPromise.query(`
      SELECT 
        a.serial_number, a.color, a.assignment_start_date,
        b.name AS brand_name, m.model_name,
        e.name AS assigned_to_name, d.department_name
      FROM assets a
      LEFT JOIN asset_brands b ON a.brand_id = b.id
      LEFT JOIN asset_models m ON a.model_id = m.id
      LEFT JOIN employees e ON a.assigned_to = e.id
      LEFT JOIN departments d ON a.assigned_department = d.id
      WHERE a.id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = rows[0];
    const doc = new PDFDocument({ size: [100, 150] });
    
    // Generate barcode
    const barcodeBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: asset.serial_number,
      scale: 2,
      height: 10,
      includetext: true
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=asset_${id}_label.pdf`);

    // Build PDF
    doc.pipe(res);
    doc.image(barcodeBuffer, 10, 10, { width: 80 });
    doc.fontSize(8)
       .text(`Asset: ${asset.serial_number}`, 10, 50)
       .text(`Brand: ${asset.brand_name}`, 10, 60)
       .text(`Model: ${asset.model_name}`, 10, 70)
       .text(`Assigned: ${asset.assigned_to_name || 'N/A'}`, 10, 80);
    
    doc.end();
  } catch (err) {
    console.error('PDF generation failed:', err);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// =======================
// Barcode for SKU
// =======================


exports.generateProductBarcode = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await dbPromise.query(`SELECT sku, name FROM products WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const product = rows[0];
    res.json({ sku: product.sku, name: product.name, barcode_text: product.sku });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate barcode', details: err.message });
  }
};

// =======================
// Low Stock Notification
// =======================

exports.getLowStockAlerts = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `  SELECT 
        p.id AS product_id, 
        p.name AS product_name, 
        p.sku,
        b.name AS brand_name,
        m.model_name,
        c.name AS category_name,
        u.name AS unit_name,
        al.name AS location_name,
        IFNULL((
          SELECT SUM(
            CASE 
              WHEN sm.movement_type IN ('Stock In', 'Return', 'Repair In', 'Adjustment') THEN sm.quantity
              WHEN sm.movement_type IN ('Stock Out', 'Lost/Damaged', 'Repair Out') THEN -sm.quantity
              ELSE 0
            END
          )
          FROM stock_movements sm
          WHERE sm.product_id = p.id
        ), 0) AS stock_balance,
        p.min_stock,
        p.max_stock,
        p.reorder_level
      FROM products p
      LEFT JOIN asset_brands b ON p.brand_id = b.id
      LEFT JOIN asset_models m ON p.model_id = m.id
      LEFT JOIN asset_categories c ON p.id = c.id
      LEFT JOIN asset_units u ON p.id = u.id
      LEFT JOIN asset_locations al ON p.location_id = al.id
      WHERE 1=1
      GROUP BY p.id
      HAVING stock_balance <= p.min_stock
      ORDER BY stock_balance ASC, p.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch low stock alerts', details: err.message });
  }
};

// =======================
// Stock Import/Export via Excel
// =======================

exports.importStockFromExcel1 = async (req, res) => {
  try {
    if (!req.files?.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.files.file;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.data);
    const worksheet = workbook.getWorksheet(1);

    // Load all brands and models for lookup
    const [brands] = await dbPromise.query('SELECT id, name FROM asset_brands');
    const brandMap = new Map(brands.map(b => [b.name.trim().toLowerCase(), b.id]));
    const [models] = await dbPromise.query('SELECT id, brand_id, model_name FROM asset_models');
    const modelMap = new Map(models.map(m => [`${m.brand_id}|${m.model_name.trim().toLowerCase()}`, m.id]));

    const products = [];
    const errors = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      // Adjust columns based on your Excel structure
      const sku = row.getCell(1).value && String(row.getCell(1).value).trim();
      const name = row.getCell(2).value && String(row.getCell(2).value).trim();
      const category = row.getCell(3).value && String(row.getCell(3).value).trim();
      const unit = row.getCell(4).value && String(row.getCell(4).value).trim();
      const min_stock = parseInt(row.getCell(5).value || 0, 10);
      const max_stock = parseInt(row.getCell(6).value || 0, 10);
      const reorder_level = parseInt(row.getCell(7).value || 0, 10);
      const description = row.getCell(8).value && String(row.getCell(8).value).trim();
      const storage_location = row.getCell(9).value && String(row.getCell(9).value).trim();
      const brandName = row.getCell(10).value && String(row.getCell(10).value).trim();
      const modelName = row.getCell(11).value && String(row.getCell(11).value).trim();

      if (!sku || !name || !brandName || !modelName) {
        errors.push({ row: rowNumber, error: 'Missing required fields (SKU, Name, Brand, Model)' });
        continue;
      }

      // --- Brand lookup or auto-create ---
      let brand_id = brandMap.get(brandName.toLowerCase());
      if (!brand_id) {
        try {
          const [brandResult] = await dbPromise.query('INSERT INTO asset_brands (name) VALUES (?)', [brandName]);
          brand_id = brandResult.insertId;
          brandMap.set(brandName.toLowerCase(), brand_id);
        } catch (err) {
          errors.push({ row: rowNumber, error: `Failed to create brand: ${brandName}` });
          continue;
        }
      }

      // --- Model lookup or auto-create ---
      let model_id = modelMap.get(`${brand_id}|${modelName.toLowerCase()}`);
      if (!model_id) {
        try {
          const [modelResult] = await dbPromise.query(
            'INSERT INTO asset_models (brand_id, model_name) VALUES (?, ?)',
            [brand_id, modelName]
          );
          model_id = modelResult.insertId;
          modelMap.set(`${brand_id}|${modelName.toLowerCase()}`, model_id);
        } catch (err) {
          errors.push({ row: rowNumber, error: `Failed to create model: ${modelName} for brand: ${brandName}` });
          continue;
        }
      }

      products.push([
        sku, name, category, unit, min_stock, max_stock, reorder_level,
        description, storage_location, brand_id, model_id
      ]);
    }

    if (products.length === 0) {
      return res.status(400).json({ 
        message: 'No valid products found to import.',
        errors
      });
    }

    // Batch insert for MySQL
    const batchSize = 100;
    let imported = 0;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      try {
        await dbPromise.query(
          `INSERT INTO products 
            (sku, name, category, unit, min_stock, max_stock, reorder_level, description, storage_location, brand_id, model_id)
           VALUES ?`,
          [batch]
        );
        imported += batch.length;
      } catch (err) {
        errors.push({ batch: `${i+1}-${i+batch.length}`, error: err.message });
      }
    }

    res.json({ 
      success: true,
      imported,
      errors,
      message: errors.length
        ? 'Import completed with some errors'
        : 'Import successful'
    });
  } catch (err) {
    console.error('Failed to import stock:', err);
    res.status(500).json({ 
      message: 'Failed to import stock',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

exports.importStockFromExcel = async (req, res) => {
  try {
    if (!req.files?.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.files.file;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.data);
    const worksheet = workbook.getWorksheet(1);

    // Preload maps for lookup
    const [brands] = await dbPromise.query('SELECT id, name FROM asset_brands');
    const brandMap = new Map(brands.map(b => [b.name.trim().toLowerCase(), b.id]));

    const [models] = await dbPromise.query('SELECT id, brand_id, model_name FROM asset_models');
    const modelMap = new Map(models.map(m => [`${m.brand_id}|${m.model_name.trim().toLowerCase()}`, m.id]));

    const [categories] = await dbPromise.query('SELECT id, name FROM asset_categories');
    const categoryMap = new Map(categories.map(c => [c.name.trim().toLowerCase(), c.id]));

    const [units] = await dbPromise.query('SELECT id, name FROM asset_units');
    const unitMap = new Map(units.map(u => [u.name.trim().toLowerCase(), u.id]));

    const [locations] = await dbPromise.query('SELECT id, name FROM asset_locations');
    const locationMap = new Map(locations.map(l => [l.name.trim().toLowerCase(), l.id]));

    const products = [];
    const errors = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      const sku = row.getCell(1).value && String(row.getCell(1).value).trim();
      const name = row.getCell(2).value && String(row.getCell(2).value).trim();
      const category_name = row.getCell(3).value && String(row.getCell(3).value).trim();
      const unit_name = row.getCell(4).value && String(row.getCell(4).value).trim();
      const min_stock = parseInt(row.getCell(5).value || 0, 10);
      const max_stock = parseInt(row.getCell(6).value || 0, 10);
      const reorder_level = parseInt(row.getCell(7).value || 0, 10);
      const description = row.getCell(8).value && String(row.getCell(8).value).trim();
      const location_name = row.getCell(9).value && String(row.getCell(9).value).trim();
      const brandName = row.getCell(10).value && String(row.getCell(10).value).trim();
      const modelName = row.getCell(11).value && String(row.getCell(11).value).trim();

      if (!sku || !name || !brandName || !modelName || !category_name || !unit_name || !location_name) {
        errors.push({ row: rowNumber, error: 'Missing required fields (SKU, Name, Brand, Model, Category, Unit, Location)' });
        continue;
      }

      // Category lookup
      let category_id = categoryMap.get(category_name.toLowerCase());
      if (!category_id) {
        errors.push({ row: rowNumber, error: `Invalid category: ${category_name}` });
        continue;
      }

      // Unit lookup
      let unit_id = unitMap.get(unit_name.toLowerCase());
      if (!unit_id) {
        errors.push({ row: rowNumber, error: `Invalid unit: ${unit_name}` });
        continue;
      }

      // Location lookup
      let location_id = locationMap.get(location_name.toLowerCase());
      if (!location_id) {
        errors.push({ row: rowNumber, error: `Invalid location: ${location_name}` });
        continue;
      }

      // --- Brand lookup or auto-create ---
      let brand_id = brandMap.get(brandName.toLowerCase());
      if (!brand_id) {
        try {
          const [brandResult] = await dbPromise.query('INSERT INTO asset_brands (name) VALUES (?)', [brandName]);
          brand_id = brandResult.insertId;
          brandMap.set(brandName.toLowerCase(), brand_id);
        } catch (err) {
          errors.push({ row: rowNumber, error: `Failed to create brand: ${brandName}` });
          continue;
        }
      }

      // --- Model lookup or auto-create ---
      let model_id = modelMap.get(`${brand_id}|${modelName.toLowerCase()}`);
      if (!model_id) {
        try {
          const [modelResult] = await dbPromise.query(
            'INSERT INTO asset_models (brand_id, model_name) VALUES (?, ?)',
            [brand_id, modelName]
          );
          model_id = modelResult.insertId;
          modelMap.set(`${brand_id}|${modelName.toLowerCase()}`, model_id);
        } catch (err) {
          errors.push({ row: rowNumber, error: `Failed to create model: ${modelName} for brand: ${brandName}` });
          continue;
        }
      }

      // Push normalized row (all FKs)
      products.push([
        sku, name, category_id, brand_id, model_id, unit_id, 
        min_stock, max_stock, reorder_level, description, location_id
      ]);
    }

    if (products.length === 0) {
      return res.status(400).json({ 
        message: 'No valid products found to import.',
        errors
      });
    }

    // Batch insert for MySQL
    const batchSize = 100;
    let imported = 0;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      try {
        await dbPromise.query(
          `INSERT INTO products 
            (sku, name, category_id, brand_id, model_id, unit_id, min_stock, max_stock, reorder_level, description, location_id)
           VALUES ?`,
          [batch]
        );
        imported += batch.length;
      } catch (err) {
        errors.push({ batch: `${i+1}-${i+batch.length}`, error: err.message });
      }
    }

    res.json({ 
      success: true,
      imported,
      errors,
      message: errors.length
        ? 'Import completed with some errors'
        : 'Import successful'
    });
  } catch (err) {
    console.error('Failed to import stock:', err);
    res.status(500).json({ 
      message: 'Failed to import stock',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};


// Implement proper Excel export
exports.exportStockToExcel = async (req, res) => {
  try {
    const [products] = await dbPromise.query(`
      SELECT 
        p.sku, p.name, p.category,
        b.name AS brand, m.model_name,
        p.unit, p.min_stock, p.max_stock, p.reorder_level,
        p.storage_location
      FROM products p
      LEFT JOIN asset_brands b ON p.brand_id = b.id
      LEFT JOIN asset_models m ON p.model_id = m.id
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Add headers
    worksheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Brand', key: 'brand', width: 20 },
      { header: 'Model', key: 'model_name', width: 20 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Min Stock', key: 'min_stock', width: 10 },
      { header: 'Max Stock', key: 'max_stock', width: 10 },
      { header: 'Reorder Level', key: 'reorder_level', width: 15 },
      { header: 'Location', key: 'storage_location', width: 20 }
    ];

    // Add data rows
    worksheet.addRows(products);

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=products_inventory.xlsx'
    );

    // Send the file
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting to Excel:', err);
    res.status(500).json({ error: 'Failed to export inventory data' });
  }
};

// =======================
// Inventory Summary Charts
// =======================

exports.getInventorySummaryCharts = async (req, res) => {
  try {
    const [categoryStats] = await dbPromise.query(`
      SELECT pc.name AS category, COUNT(*) AS count
      FROM assets a
      JOIN products p ON a.product_id = p.id
      JOIN asset_categories pc ON p.category_id = pc.id
      GROUP BY pc.name
    `);

    const [locationStats] = await dbPromise.query(`
      SELECT location, COUNT(*) AS count
      FROM assets
      WHERE location IS NOT NULL AND location != ''
      GROUP BY location
    `);

    const [statusStats] = await dbPromise.query(`
      SELECT s.status, COUNT(*) AS count
      FROM assets a
      JOIN asset_statuses s ON a.status_id = s.id
      GROUP BY s.status
    `);

    res.json({ categoryStats, locationStats, statusStats });
  } catch (err) {
    console.error('Error fetching inventory summary:', err);
    res.status(500).json({ message: 'Failed to fetch inventory summary', details: err.message });
  }
};

// =======================
// Asset Usage/Movement Logs
// =======================

exports.getAssetMovementLogs = async (req, res) => {
  try {
    const [logs] = await dbPromise.query(`
      SELECT sm.id, sm.asset_id, sm.movement_type, sm.date, sm.quantity, sm.reason, e.name AS performed_by
      FROM stock_movements sm
      LEFT JOIN employees e ON sm.performed_by = e.id
      ORDER BY sm.date DESC
    `);
    res.json(logs);
  } catch (err) {
    console.error('Error fetching asset movement logs:', err);
    res.status(500).json({ message: 'Failed to fetch movement logs', details: err.message });
  }
};

// =======================
// Warranty Expiry Notifications
// =======================

exports.getWarrantyExpiries = async (req, res) => {
  try {
    const [expiringSoon] = await dbPromise.query(`
      SELECT id, serial_number, warranty_expiry
      FROM assets
      WHERE warranty_expiry BETWEEN CURDATE() AND LAST_DAY(CURDATE())
    `);

    const [expired] = await dbPromise.query(`
      SELECT id, serial_number, warranty_expiry
      FROM assets
      WHERE warranty_expiry < CURDATE()
    `);

    res.json({ expiringSoon, expired });
  } catch (err) {
    console.error('Error fetching warranty expiries:', err);
    res.status(500).json({ message: 'Failed to fetch warranty expiry data', details: err.message });
  }
};

// =======================
// Configuration
// =======================

exports.getBrands = async (req, res) => {
  try {
    // Get unique brands from products table
    const [productBrands] = await dbPromise.query('SELECT DISTINCT brand as name FROM products');
    
    // Get unique brands from assets table
    const [assetBrands] = await dbPromise.query('SELECT DISTINCT brand as name FROM assets');
    
    // Combine and deduplicate
    const allBrands = [...productBrands, ...assetBrands];
    const uniqueBrands = [...new Map(allBrands.map(item => [item.name, item])).values()];
    
    // Sort alphabetically
    uniqueBrands.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json(uniqueBrands);
  } catch (err) {
    console.error('Error fetching brands:', err);
    res.status(500).json({ message: 'Error fetching brands', details: err.message });
  }
};

exports.getModels = async (req, res) => {
  try {
    // Get models from products table (treating product name as model)
    const [productModels] = await dbPromise.query(`
      SELECT 
        id, 
        brand as brand_name, 
        model as model_name 
      FROM products
      ORDER BY model ASC
    `);
    
    // Get models from assets table
    const [assetModels] = await dbPromise.query(`
      SELECT 
        id, 
        brand as brand_name, 
        model as model_name 
      FROM assets
      ORDER BY model ASC
    `);
    
    // Combine results
    const allModels = [...productModels, ...assetModels];
    
    res.json(allModels);
  } catch (err) {
    console.error('Error fetching models:', err);
    res.status(500).json({ message: 'Error fetching models', details: err.message });
  }
};

exports.createModel = async (req, res) => {
  try {
    const { brand_id, model_name } = req.body;

    // 1. Validate input
    if (!brand_id || !model_name) {
      return res.status(400).json({ error: 'brand_id and model_name required' });
    }

    // 2. Check duplicate
    const [[existing]] = await dbPromise.query(
      'SELECT id FROM asset_models WHERE brand_id = ? AND model_name = ?',
      [brand_id, model_name]
    );
    if (existing) {
      return res.status(409).json({ error: 'Model already exists for this brand' });
    }

    // 3. Insert if not exists
    await dbPromise.query(
      'INSERT INTO asset_models (brand_id, model_name) VALUES (?, ?)',
      [brand_id, model_name]
    );
    res.json({ message: 'Model created successfully' });
  } catch (err) {
     next(err);
    //res.status(500).json({ message: 'Failed to create model', details: err.message });
  }
};


exports.getModelsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const [rows] = await dbPromise.query('SELECT id, model_name FROM asset_models WHERE brand_id = ?', [brandId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching models by brand:', err);
    res.status(500).json({ message: 'Failed to fetch models by brand', details: err.message });
  }
};


// Add this to your controller
exports.getAssetRequestStatuses = async (req, res) => {
  const [rows] = await dbPromise.query('SELECT * FROM asset_request_status ORDER BY id ASC');
  res.json(rows);
};

// controllers/inventoryController.js

exports.getAssetRequestsById = async (req, res) => {
  try {
    const { employee_id, status, page = 1, pageSize = 20 } = req.query;
    let sql = `
      SELECT ar.*, 
        ars.status_name, 
        emp.name AS employee_name,
        behalf.name AS behalf_name,
        at.name AS asset_type_name,
        ab.name AS brand_name,
        am.model_name
      FROM asset_requests ar
      LEFT JOIN asset_request_status ars ON ar.status_id = ars.id
      LEFT JOIN employees emp ON ar.employee_id = emp.id
      LEFT JOIN employees behalf ON ar.submitted_on_behalf = behalf.id
      LEFT JOIN asset_types at ON ar.asset_type_id = at.id
      LEFT JOIN asset_brands ab ON ar.brand_id = ab.id
      LEFT JOIN asset_models am ON ar.model_id = am.id
      WHERE 1=1
    `;
    const params = [];

    if (employee_id) {
      sql += ` AND (ar.employee_id = ? OR ar.submitted_on_behalf = ?)`;
      params.push(employee_id, employee_id);
    }
    if (status) {
      sql += ` AND ars.status_name = ?`;
      params.push(status);
    }
    sql += ` ORDER BY ar.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving asset requests', details: err.message });
  }
};



exports.getAllAssetRequests = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT
    ar.*,
    ars.status_name,
    emp.name AS employee_name,
    behalf.name AS behalf_name,
    at.name AS asset_type_name,
    ab.name AS brand_name,
    am.model_name
  FROM asset_requests ar
  LEFT JOIN asset_request_status ars ON ar.status_id = ars.id
  LEFT JOIN employees emp ON ar.employee_id = emp.id
  LEFT JOIN employees behalf ON ar.submitted_on_behalf = behalf.id
  LEFT JOIN asset_types at ON ar.asset_type_id = at.id
  LEFT JOIN asset_brands ab ON ar.brand_id = ab.id
  LEFT JOIN asset_models am ON ar.model_id = am.id
  ORDER BY ar.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving asset requests', details: err.message });
  }
};

// GET /api/inventory/asset-requests-paging?page=1&limit=20&status=Pending&keyword=abc
exports.getAllAssetRequestsPaging = async (req, res) => {
  try {
    let { page, limit, status, keyword } = req.query;
    page = parseInt(page) > 0 ? parseInt(page) : 1;
    limit = parseInt(limit) > 0 ? parseInt(limit) : 10;
    const offset = (page - 1) * limit;

    // Base SQL
    let sql = `
      SELECT
        ar.*,
        ars.status_name,
        emp.name AS employee_name,
        behalf.name AS behalf_name,
        at.name AS asset_type_name,
        ab.name AS brand_name,
        am.model_name
      FROM asset_requests ar
      LEFT JOIN asset_request_status ars ON ar.status_id = ars.id
      LEFT JOIN employees emp ON ar.employee_id = emp.id
      LEFT JOIN employees behalf ON ar.submitted_on_behalf = behalf.id
      LEFT JOIN asset_types at ON ar.asset_type_id = at.id
      LEFT JOIN asset_brands ab ON ar.brand_id = ab.id
      LEFT JOIN asset_models am ON ar.model_id = am.id
      WHERE 1=1
    `;
    const params = [];

    // Filters
    if (status) {
      sql += ' AND ars.status_name = ? ';
      params.push(status);
    }
    if (keyword) {
      sql += ` AND (
        ar.serial_no LIKE ? OR
        emp.name LIKE ? OR
        behalf.name LIKE ? OR
        at.name LIKE ? OR
        ab.name LIKE ? OR
        am.model_name LIKE ? OR
        ar.purpose LIKE ?
      )`;
      for (let i = 0; i < 7; ++i) params.push(`%${keyword}%`);
    }

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) temp`;
    const [countRows] = await dbPromise.query(countSql, params);
    const total = countRows[0]?.total || 0;

    // Apply ordering, limit, offset
    sql += ` ORDER BY ar.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Final query
    const [rows] = await dbPromise.query(sql, params);

    res.json({
      data: rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving asset requests', details: err.message });
  }
};

exports.getAssetRequestHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await dbPromise.query(`
      SELECT arh.*, ars.status_name, e.name AS changed_by_name
      FROM asset_request_history arh
      LEFT JOIN asset_request_status ars ON arh.status_id = ars.id
      LEFT JOIN employees e ON arh.changed_by = e.id
      WHERE arh.request_id = ?
      ORDER BY arh.changed_at ASC
    `, [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get history', details: err.message });
  }
};


exports.getAllAssetRequestsPaging1 = async (req, res, next) => {
  try {
    let { page, limit } = req.query;

    page = parseInt(page) > 0 ? parseInt(page) : 1;
    limit = parseInt(limit) > 0 ? parseInt(limit) : 20;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT ar.*, ars.status_name
      FROM asset_requests ar
      LEFT JOIN asset_request_status ars ON ar.status_id = ars.id
      WHERE 1=1
    `;
    const params = [];

    // If you want to filter by employee, status, etc, add more query logic

    const countSql = `SELECT COUNT(*) as total FROM (${sql}) temp`;
    const [countRows] = await dbPromise.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ` ORDER BY ar.request_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await dbPromise.query(sql, params);

    res.json({
      data: rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
};

exports.createAssetRequest1 = async (req, res) => {
  try {
    const {
      employee_id, submitted_on_behalf, category, asset_type_id, brand, model,
      serial_no, purpose, remarks, attachment, quantity, status_id
    } = req.body;

    // Optionally validate status_id exists
    if (status_id) {
      const [[statusRow]] = await dbPromise.query('SELECT id FROM asset_request_status WHERE id = ?', [status_id]);
      if (!statusRow) return res.status(400).json({ error: 'Invalid status_id' });
    }

    // 1. Insert the asset request and get the new ID
    const [result] = await dbPromise.query(`
      INSERT INTO asset_requests
      (employee_id, submitted_on_behalf, category, asset_type_id, brand, model, serial_no, purpose, remarks, attachment, quantity, status_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      employee_id, submitted_on_behalf, category, asset_type_id, brand, model, serial_no, purpose, remarks, attachment, quantity, status_id
    ]);
    const newRequestId = result.insertId;

    // 2. Fetch employee info (assuming employee_id is mandatory)
    if (employee_id) {
      const [[employee]] = await dbPromise.query('SELECT name, email FROM employees WHERE id = ?', [employee_id]);
      if (employee && employee.email) {
        // 3. Send email notification
        await sendEmail({
          to: employee.email,
          subject: `Your Asset Request Has Been Submitted`,
          templateName: 'asset_request_submitted', // Make sure this template exists
          variables: {
            employeeName: employee.name || '',
            requestId: newRequestId
          }
        });
      }
    }

    res.json({ message: 'Asset request created', request_id: newRequestId });
  } catch (err) {
    res.status(500).json({ error: 'Error creating asset request', details: err.message });
  }
};

// POST /api/asset-requests
exports.createAssetRequest1 = async (req, res) => {
  try {
    // Typical fields for asset requests (add/remove as needed)
    const {
      employee_id,           // Employee making request (required)
      submitted_on_behalf,   // If someone requests for others (optional)
      category,
      asset_type_id,
      brand,
      model,
      serial_no,
      purpose,
      remarks,
      attachment,
      quantity,
    } = req.body;

    // Default status_id for a new request (e.g., Pending=1)
    const status_id = 1;

    // Validate employee_id
    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID required' });
    }
    const [[employee]] = await dbPromise.query(
      'SELECT id, name, email FROM employees WHERE id = ?', [employee_id]
    );
    if (!employee) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    // Insert new request
    const [result] = await dbPromise.query(
      `INSERT INTO asset_requests
        (employee_id, submitted_on_behalf, category, asset_type_id, brand, model, serial_no, purpose, remarks, attachment, quantity, status_id, request_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        employee_id, submitted_on_behalf, category, asset_type_id, brand, model,
        serial_no, purpose, remarks, attachment, quantity, status_id
      ]
    );
    const request_id = result.insertId;

    // Log to history table
    await dbPromise.query(
      `INSERT INTO asset_request_history
         (request_id, status_id, changed_by, remarks, changed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [request_id, status_id, employee_id, remarks || 'Submitted']
    );

    // Send email notification to requester
    if (employee.email) {
      await sendEmail({
        to: employee.email,
        subject: 'Your Asset Request has been submitted',
        templateName: 'asset_request_submitted',
        variables: {
          employeeName: employee.name,
          requestId: request_id,
          status: 'Pending'
        }
      });
    }

    res.status(201).json({ message: 'Asset request created', request_id });
  } catch (err) {
    console.error('Error in createAssetRequest:', err);
    res.status(500).json({ error: 'Error creating asset request', details: err.message });
  }
};

exports.createAssetRequest12 = async (req, res) => {
  try {
    const {
      employee_id,
      submitted_on_behalf,
      category,
      asset_type_id,
      brand_id,
      model_id,
      serial_no,
      purpose,
      remarks,
      attachment,
      quantity,
    } = req.body;

    const status_id = 1; // Pending

    // Validate employee_id
    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID required' });
    }
    const [[employee]] = await dbPromise.query(
      'SELECT id, name, email FROM employees WHERE id = ?', [employee_id]
    );
    if (!employee) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    // Insert into asset_requests (notice brand_id/model_id)
    const [result] = await dbPromise.query(
      `INSERT INTO asset_requests
        (employee_id, submitted_on_behalf, category, asset_type_id, brand_id, model_id, serial_no, purpose, remarks, attachment, quantity, status_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        employee_id,
        submitted_on_behalf || null,
        category,
        asset_type_id,
        brand_id,
        model_id,
        serial_no || null,
        purpose,
        remarks,
        attachment,
        quantity,
        status_id
      ]
    );
    const request_id = result.insertId;

    // Log to history table (use 'notes' instead of 'remarks')
    await dbPromise.query(
      `INSERT INTO asset_request_history
         (request_id, status_id, changed_by, notes, changed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [request_id, status_id, employee_id, remarks || 'Submitted']
    );

    // Send email notification
    if (employee.email) {
      await sendEmail({
        to: employee.email,
        subject: 'Your Asset Request has been submitted',
        templateName: 'asset_request_submitted',
        variables: {
          employeeName: employee.name,
          requestId: request_id,
          status: 'Pending'
        }
      });
    }

    res.status(201).json({ message: 'Asset request created', request_id });
  } catch (err) {
    console.error('Error in createAssetRequest:', err);
    res.status(500).json({ error: 'Error creating asset request', details: err.message });
  }
};

exports.createAssetRequest = async (req, res) => {
  try {
    const {
      employee_id,
      submitted_on_behalf,
      category,
      asset_type_id,
      brand_id,
      model_id,
      serial_no,
      purpose,
      remarks,
      attachment,
      quantity,
    } = req.body;

    const status_id = 1;

    // Validate employee
    if (!employee_id) return res.status(400).json({ error: 'Employee ID required' });

    const [[employee]] = await dbPromise.query(
      'SELECT id, name, email FROM employees WHERE id = ?', [employee_id]
    );
    if (!employee) return res.status(400).json({ error: 'Invalid employee ID' });

    // Insert request
    const [result] = await dbPromise.query(
      `INSERT INTO asset_requests
        (employee_id, submitted_on_behalf, category, asset_type_id, brand_id, model_id, serial_no, purpose, remarks, attachment, quantity, status_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        employee_id,
        submitted_on_behalf,
        category,
        asset_type_id,
        brand_id,
        model_id,
        serial_no || null,
        purpose,
        remarks,
        attachment,
        quantity,
        status_id
      ]
    );
    const request_id = result.insertId;

    // Insert history
    await dbPromise.query(
      `INSERT INTO asset_request_history
         (request_id, status_id, changed_by, notes, changed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [request_id, status_id, employee_id, remarks || 'Submitted']
    );

    // Email (optional)
    if (employee.email) {
      await sendEmail({
        to: employee.email,
        subject: 'Your Asset Request has been submitted',
        templateName: 'asset_request_submitted',
        variables: {
          employeeName: employee.name,
          requestId: request_id,
          status: 'Pending'
        }
      });
    }

    res.status(201).json({ message: 'Asset request created', request_id });
  } catch (err) {
    console.error('Error in createAssetRequest:', err);
    res.status(500).json({ error: 'Error creating asset request', details: err.message });
  }
};


// Fix asset request status handling
exports.updateAssetRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id, remarks } = req.body;

    // Validate status exists
    const [[status]] = await dbPromise.query(
      'SELECT id FROM asset_request_status WHERE id = ?',
      [status_id]
    );
    
    if (!status) {
      return res.status(400).json({ error: 'Invalid status ID' });
    }

    await dbPromise.query(
      `UPDATE asset_requests 
       SET status_id = ?, remarks = ?
       WHERE id = ?`,
      [status_id, remarks, id]
    );

    // Log the status change
    await dbPromise.query(
      `INSERT INTO asset_request_history 
       (request_id, status_id, changed_by, remarks)
       VALUES (?, ?, ?, ?)`,
      [id, status_id, req.user.id, remarks]
    );

        // Fetch request + user email (assuming asset_requests has employee_id, and employees has email)
    const [[requestRow]] = await dbPromise.query(`
      SELECT ar.*, e.email, e.name 
      FROM asset_requests ar
      LEFT JOIN employees e ON ar.employee_id = e.id
      WHERE ar.id = ?
    `, [id]);
    if (requestRow?.email) {
      // Prepare email variables for template
      await sendEmail({
        to: requestRow.email,
        subject: `Asset Request #${id} Status Update: ${status.status_name}`,
        templateName: 'asset_request_status', // Must exist in templates/
        variables: {
          employeeName: requestRow.name || '-',
          requestId: id,
          status: status.status_name,
          remarks: remarks || '',
        }
      });
    }

    res.json({ message: 'Asset request status updated' });
  } catch (err) {
    console.error('Error updating asset request:', err);
    res.status(500).json({ error: 'Failed to update asset request' });
  }
};

// Get all alert configs
exports.getAlertConfigs = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM alert_config');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert configs.' });
  }
};

// Create/update an alert config
exports.upsertAlertConfig = async (req, res) => {
  try {
    const { alert_type, product_id, category, threshold, is_active } = req.body;
    // Upsert logic: unique on alert_type, product_id, category
    const sql = `
      INSERT INTO alert_config (alert_type, product_id, category, threshold, is_active, last_updated)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE threshold=VALUES(threshold), is_active=VALUES(is_active), last_updated=NOW()
    `;
    await dbPromise.query(sql, [alert_type, product_id, category, threshold, is_active]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upsert alert config.' });
  }
};

// Delete an alert config
exports.deleteAlertConfig = async (req, res) => {
  try {
    const { id } = req.params;
    await dbPromise.query('DELETE FROM alert_config WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete alert config.' });
  }
};


// Update getStockBalance method
exports.getStockBalance = async (req, res) => {
  try {
    const { product_id, keyword } = req.query;
    let sql = `
      SELECT 
        p.id AS product_id, 
        p.name AS product_name, 
        p.sku,
        b.name AS brand_name,
        m.model_name,
        c.name AS category_name,
        u.name AS unit_name,
        al.name AS location_name,
        IFNULL((
          SELECT SUM(
            CASE 
              WHEN sm.movement_type IN ('Stock In', 'Return', 'Repair In', 'Adjustment') THEN sm.quantity
              WHEN sm.movement_type IN ('Stock Out', 'Lost/Damaged', 'Repair Out') THEN -sm.quantity
              ELSE 0
            END
          )
          FROM stock_movements sm
          WHERE sm.product_id = p.id
        ), 0) AS stock_balance,
        p.min_stock,
        p.max_stock,
        p.reorder_level
      FROM products p
      LEFT JOIN asset_brands b ON p.brand_id = b.id
      LEFT JOIN asset_models m ON p.model_id = m.id
      LEFT JOIN asset_categories c ON p.category_id = c.id
      LEFT JOIN asset_units u ON p.id = u.id
      LEFT JOIN asset_locations al ON p.location_id = al.id
      WHERE 1=1
    `;
    const params = [];

    if (product_id) {
      sql += ` AND p.id = ?`;
      params.push(product_id);
    }
    if (keyword) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ` GROUP BY p.id ORDER BY p.name`;

    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock balance', details: err.message });
  }
};

// PATCH: /assets/:id/status
exports.updateAssetStatus = async (req, res) => {
  try {
    const assetId = req.params.id;
    const { status_id, remarks } = req.body;

    // Validate status
    const [[statusRow]] = await dbPromise.query(
      'SELECT id FROM asset_statuses WHERE id = ?', [status_id]
    );
    if (!statusRow) return res.status(400).json({ error: 'Invalid status_id' });

    // Get old data for audit
    const [[oldAsset]] = await dbPromise.query('SELECT * FROM assets WHERE id = ?', [assetId]);
    if (!oldAsset) return res.status(404).json({ error: 'Asset not found.' });

    // Update
    await dbPromise.query(
      `UPDATE assets SET status_id = ? WHERE id = ?`, [status_id, assetId]
    );

    // Log asset history
    await dbPromise.query(
      `INSERT INTO asset_history (asset_id, action, from_status_id, to_status_id, action_date, notes)
       VALUES (?, 'Status Change', ?, ?, NOW(), ?)`,
      [assetId, oldAsset.status_id, status_id, remarks || '']
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update asset status', details: err.message });
  }
};

exports.updateAssetRequestStatusNew = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id, changed_by, remarks } = req.body;

    // Validate status_id exists
    const [[statusRow]] = await dbPromise.query(
      'SELECT id FROM asset_request_status WHERE id = ?', [status_id]
    );
    if (!statusRow) return res.status(400).json({ error: 'Invalid status_id' });

    await dbPromise.query(
      `UPDATE asset_requests SET status_id = ? WHERE id = ?`, [status_id, id]
    );

    // changed_by: get from body or req.user
    const changer = changed_by || req.user?.id || null;
    if (!changer) return res.status(400).json({ error: 'changed_by (employee ID) is required' });

    await dbPromise.query(
      `INSERT INTO asset_request_history 
        (request_id, status_id, changed_by, notes, changed_at)
      VALUES (?, ?, ?, ?, NOW())`,
      [id, status_id, changer, remarks]
    );

    // TODO: call notification function here
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update request status', details: err.message });
  }
};


// PATCH: /asset-requests/:id/status
exports.updateAssetRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id, remarks } = req.body;

    // Validate status_id exists
    const [[statusRow]] = await dbPromise.query(
      'SELECT id FROM asset_request_status WHERE id = ?', [status_id]
    );
    if (!statusRow) return res.status(400).json({ error: 'Invalid status_id' });

    await dbPromise.query(
      `UPDATE asset_requests SET status_id = ? WHERE id = ?`, [status_id, id]
    );

    await dbPromise.query(
      `INSERT INTO asset_request_history 
        (request_id, status_id, changed_by, remarks, changed_at)
      VALUES (?, ?, ?, ?, NOW())`,
      [id, status_id, req.user.id, remarks]
    );

    // TODO: call notification function here
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update request status', details: err.message });
  }
};

// PATCH /api/asset-requests/:id/approve
exports.approveAssetRequest1 = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id, remarks } = req.body;

    // status_id = Approved, Rejected, etc (lookup from asset_request_status table)
    if (!status_id) return res.status(400).json({ error: 'Status ID required' });

    // Check status exists
    const [[statusRow]] = await dbPromise.query(
      'SELECT id, status_name FROM asset_request_status WHERE id = ?', [status_id]
    );
    if (!statusRow) return res.status(400).json({ error: 'Invalid status ID' });

    // Get current request and employee info
    const [[requestRow]] = await dbPromise.query(`
      SELECT ar.*, e.email, e.name
      FROM asset_requests ar
      LEFT JOIN employees e ON ar.employee_id = e.id
      WHERE ar.id = ?
    `, [id]);
    if (!requestRow) return res.status(404).json({ error: 'Asset request not found' });

    // Update status and optionally remarks
    await dbPromise.query(
      `UPDATE asset_requests SET status_id = ?, remarks = ? WHERE id = ?`,
      [status_id, remarks, id]
    );

    // Log history (assumes req.user has id, else use system)
    await dbPromise.query(
      `INSERT INTO asset_request_history
         (request_id, status_id, changed_by, remarks, changed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [id, status_id, req.user?.id || null, remarks || statusRow.status_name]
    );

    // Email notification to requester
    if (requestRow.email) {
      await sendEmail({
        to: requestRow.email,
        subject: `Asset Request #${id} Status: ${statusRow.status_name}`,
        templateName: 'asset_request_status', // Must exist
        variables: {
          employeeName: requestRow.name,
          requestId: id,
          status: statusRow.status_name,
          remarks: remarks || '',
        }
      });
    }

    res.json({ message: `Asset request ${statusRow.status_name.toLowerCase()}` });
  } catch (err) {
    console.error('Error in approveAssetRequest:', err);
    res.status(500).json({ error: 'Failed to update/approve asset request', details: err.message });
  }
};

exports.approveAssetRequest11 = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id, remarks } = req.body;

    // Validate status_id
    if (!status_id) return res.status(400).json({ error: 'Status ID required' });

    // Get status name
    const [[statusRow]] = await dbPromise.query(
      'SELECT id, status_name FROM asset_request_status WHERE id = ?', [status_id]
    );
    if (!statusRow) return res.status(400).json({ error: 'Invalid status ID' });

    // Get current request & employee info
    const [[requestRow]] = await dbPromise.query(`
      SELECT ar.*, e.email, e.name
      FROM asset_requests ar
      LEFT JOIN employees e ON ar.employee_id = e.id
      WHERE ar.id = ?
    `, [id]);
    if (!requestRow) return res.status(404).json({ error: 'Asset request not found' });

    // Update request
    await dbPromise.query(
      `UPDATE asset_requests SET status_id = ?, remarks = ? WHERE id = ?`,
      [status_id, remarks, id]
    );

    // INSERT (never update) new status history
    const changedBy = req.user?.id ?? 1; // fallback to admin 1 for now

    await dbPromise.query(
      `INSERT INTO asset_request_history
        (request_id, status_id, changed_by, notes, changed_at)
      VALUES (?, ?, ?, ?, NOW())`,
      [id, status_id, changedBy, remarks || statusRow.status_name]
    );



    // Send email (optional)
    if (requestRow.email) {
      await sendEmail({
        to: requestRow.email,
        subject: `Asset Request #${id} Status: ${statusRow.status_name}`,
        templateName: 'asset_request_status',
        variables: {
          employeeName: requestRow.name,
          requestId: id,
          status: statusRow.status_name,
          remarks: remarks || '',
        }
      });
    }

    res.json({ message: `Asset request ${statusRow.status_name.toLowerCase()}` });
  } catch (err) {
    console.error('Error in approveAssetRequest:', err);
    res.status(500).json({ error: 'Failed to update/approve asset request', details: err.message });
  }
};

exports.approveAssetRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_id, remarks, changed_by } = req.body;

    if (!status_id) return res.status(400).json({ error: 'Status ID required' });
    if (!changed_by) return res.status(400).json({ error: 'changed_by (employee id) required' });

    // Validate status_id
    const [[statusRow]] = await dbPromise.query(
      'SELECT id, status_name FROM asset_request_status WHERE id = ?', [status_id]
    );
    if (!statusRow) return res.status(400).json({ error: 'Invalid status ID' });

    // Validate changed_by (must exist in employees)
    const [[empRow]] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [changed_by]);
    if (!empRow) return res.status(400).json({ error: 'Invalid changed_by (employee id)' });

    // Update request
    await dbPromise.query(
      `UPDATE asset_requests SET status_id = ?, remarks = ? WHERE id = ?`,
      [status_id, remarks, id]
    );

    // INSERT (never update) new status history
    await dbPromise.query(
      `INSERT INTO asset_request_history
        (request_id, status_id, changed_by, notes, changed_at)
      VALUES (?, ?, ?, ?, NOW())`,
      [id, status_id, changed_by, remarks || statusRow.status_name]
    );

    // (Email notification as before...)

    res.json({ message: `Asset request ${statusRow.status_name.toLowerCase()}` });
  } catch (err) {
    console.error('Error in approveAssetRequest:', err);
    res.status(500).json({ error: 'Failed to update/approve asset request', details: err.message });
  }
};



exports.sendLowStockAlerts = async () => {
  // This alert_type_id value should match the one you use for "Low Stock" in alert_types
  const LOW_STOCK_ALERT_TYPE_ID = 1; // <-- adjust as per your data

  // 1. Find all products that are low in stock
  const [rows] = await dbPromise.query(`
    SELECT p.id, p.name, p.sku, p.quantity, p.min_stock, b.name AS brand
    FROM products p
    LEFT JOIN asset_brands b ON p.brand_id = b.id
    WHERE p.quantity <= p.min_stock
  `);

  if (rows.length) {
    // 2. Build email content
    const subject = 'Low Stock Alert';
    const body = rows.map(p => `${p.name} (SKU: ${p.sku}, Brand: ${p.brand}) is low: ${p.quantity}/${p.min_stock}`).join('\n');

    // 3. Get recipients
    const emails = await getAlertRecipients(LOW_STOCK_ALERT_TYPE_ID, dbPromise);

    // 4. Send email to each recipient
    for (const email of emails) {
      await sendEmail({
        to: email,
        subject,
        text: body,
      });
    }
  }
};


exports.sendWarrantyAlerts = async () => {
  const WARRANTY_ALERT_TYPE_ID = 2; // <-- adjust accordingly

  const [rows] = await dbPromise.query(`
    SELECT id, serial_number, warranty_expiry
    FROM assets
    WHERE warranty_expiry BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  `);

  if (rows.length) {
    const body = rows.map(a => `${a.serial_number}: Warranty expires on ${a.warranty_expiry}`).join('\n');
    const emails = await getAlertRecipients(WARRANTY_ALERT_TYPE_ID, dbPromise);
    for (const email of emails) {
      await sendEmail({
        to: email,
        subject: 'Warranty Expiry Alert',
        text: body,
      });
    }
  }
};

// 1. Stock Movement Trends (per day, last 30 days)
exports.getStockMovementTrends = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        DATE(sm.movement_date) AS move_date,
        p.name AS product_name,
        sm.movement_type,
        SUM(sm.quantity) AS qty
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      WHERE sm.movement_date >= CURDATE() - INTERVAL 30 DAY
      GROUP BY p.id, move_date, sm.movement_type
      ORDER BY move_date DESC, p.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stock movement trends', details: err.message });
  }
};

// 2. Asset Assignment Trends (how many assigned per day, last 30 days)
exports.getAssetAssignmentTrends = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        DATE(assignment_start_date) AS date,
        COUNT(*) AS assigned_count
      FROM assets
      WHERE assignment_start_date >= CURDATE() - INTERVAL 30 DAY
        AND assigned_to IS NOT NULL
      GROUP BY date
      ORDER BY date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get assignment trends', details: err.message });
  }
};

// 3. Approval Time (average, min, max for approved asset requests)
exports.getAssetApprovalTimeStats = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
        SELECT
          AVG(TIMESTAMPDIFF(HOUR, ar.created_at, arh.changed_at)) AS avg_approval_hours,
          MIN(TIMESTAMPDIFF(HOUR, ar.created_at, arh.changed_at)) AS min_approval_hours,
          MAX(TIMESTAMPDIFF(HOUR, ar.created_at, arh.changed_at)) AS max_approval_hours,
          COUNT(*) AS approved_count
      FROM asset_requests ar
      JOIN asset_request_history arh ON arh.request_id = ar.id
      JOIN asset_request_status ars ON arh.status_id = ars.id
      WHERE ars.status_name = 'Approved'
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get approval stats', details: err.message });
  }
};

// 4. Low Stock Products (current stock below min)
exports.getLowStockSummary = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        p.id, p.sku, p.name, 
        IFNULL(SUM(
          CASE 
            WHEN sm.movement_type IN ('Stock In', 'Return', 'Repair In', 'Adjustment') THEN sm.quantity
            WHEN sm.movement_type IN ('Stock Out', 'Lost/Damaged', 'Repair Out') THEN -sm.quantity
            ELSE 0
          END
        ), 0) AS stock_balance,
        p.min_stock
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id
      GROUP BY p.id
      HAVING stock_balance <= p.min_stock
      ORDER BY stock_balance ASC
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get low stock summary', details: err.message });
  }
};

// 5. Warranty Expiry Trends (this month & expired)
exports.getWarrantyExpiryTrends = async (req, res) => {
  try {
    const [expiringSoon] = await dbPromise.query(`
      SELECT id, serial_number, warranty_expiry
      FROM assets
      WHERE warranty_expiry BETWEEN CURDATE() AND LAST_DAY(CURDATE())
    `);
    const [expired] = await dbPromise.query(`
      SELECT id, serial_number, warranty_expiry
      FROM assets
      WHERE warranty_expiry < CURDATE()
    `);
    res.json({ expiringSoon, expired });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get warranty expiry data', details: err.message });
  }
};

// 6. Asset Status Breakdown
exports.getAssetStatusBreakdown = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
SELECT s.name AS status_name, COUNT(*) AS count
FROM assets a
JOIN asset_statuses s ON a.status_id = s.id
GROUP BY s.name
ORDER BY count DESC;
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status breakdown', details: err.message });
  }
};

// 7. Top Products by Stock Movement (last 30 days)
exports.getTopProductsByMovement = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT p.id, p.name, SUM(ABS(sm.quantity)) AS total_movement
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      WHERE sm.movement_date >= CURDATE() - INTERVAL 30 DAY
      GROUP BY p.id
      ORDER BY total_movement DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get top products by movement', details: err.message });
  }
};

// 8. Recent Asset Requests by Status (last 7 days)
exports.getRecentAssetRequestsByStatus = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT ars.status_name, COUNT(*) AS count
      FROM asset_requests ar
      JOIN asset_request_status ars ON ar.status_id = ars.id
      WHERE ar.created_at >= CURDATE() - INTERVAL 7 DAY
      GROUP BY ars.status_name
      ORDER BY count DESC;
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get recent requests by status', details: err.message });
  }
};

// -- Group all endpoints into a single dashboard summary if needed --
exports.getFullDashboardSummary = async (req, res) => {
  try {
    const [
      [assetStatus], [approvalTime], [lowStock], [warrantyExpiry], [movementTrends], [assignmentTrends], [topProducts], [recentRequests]
    ] = await Promise.all([
      exports.getAssetStatusBreakdown(req, { json: x => x }),
      exports.getAssetApprovalTimeStats(req, { json: x => x }),
      exports.getLowStockSummary(req, { json: x => x }),
      exports.getWarrantyExpiryTrends(req, { json: x => x }),
      exports.getStockMovementTrends(req, { json: x => x }),
      exports.getAssetAssignmentTrends(req, { json: x => x }),
      exports.getTopProductsByMovement(req, { json: x => x }),
      exports.getRecentAssetRequestsByStatus(req, { json: x => x }),
    ]);
    res.json({
      assetStatus, approvalTime, lowStock, warrantyExpiry,
      movementTrends, assignmentTrends, topProducts, recentRequests
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get dashboard summary', details: err.message });
  }
};


// Get emails for given alert_type_id from hrms_2.alert_recipients, expand employee/role/department as needed
async function getAlertRecipients(alert_type_id, dbPromise) {
  // Get all active recipients for this alert type
  const [recipients] = await dbPromise.query(
    `SELECT * FROM alert_recipients WHERE alert_type_id = ? AND is_active = 1`, 
    [alert_type_id]
  );

  let emails = [];

  for (const r of recipients) {
    if (r.recipient_type === 'email') {
      emails.push(r.recipient_value);
    } else if (r.recipient_type === 'employee') {
      // recipient_value is employee_id
      const [[emp]] = await dbPromise.query('SELECT email FROM employees WHERE id = ?', [r.recipient_value]);
      if (emp && emp.email) emails.push(emp.email);
    } else if (r.recipient_type === 'role') {
      // recipient_value is role name or id
      const [emps] = await dbPromise.query('SELECT email FROM employees WHERE role = ?', [r.recipient_value]);
      emails.push(...emps.map(e => e.email));
    } else if (r.recipient_type === 'department') {
      // recipient_value is department_id
      const [emps] = await dbPromise.query('SELECT email FROM employees WHERE department_id = ?', [r.recipient_value]);
      emails.push(...emps.map(e => e.email));
    }
  }
  // Deduplicate, remove blanks
  return [...new Set(emails)].filter(Boolean);
}


// POST /assets/:id/check-out
exports.checkOutAsset = async (req, res, next) => {
  try {
    const assetId = req.params.id;
    const { user_id, department_id, remarks } = req.body;
    const performed_by = req.user?.id || null; // current logged-in staff/admin

    // Optional: Verify asset exists and not already assigned, etc.

    // 1. Update asset assignment (if needed)
    await dbPromise.query(`
      UPDATE assets SET 
        assigned_to = ?, 
        assigned_department = ?, 
        assignment_start_date = NOW()
      WHERE id = ?
    `, [user_id, department_id, assetId]);

    // 2. Insert check-out log
    await dbPromise.query(`
      INSERT INTO asset_checkinout_log 
        (asset_id, action, user_id, department_id, performed_by, remarks)
      VALUES (?, 'check-out', ?, ?, ?, ?)
    `, [assetId, user_id, department_id, performed_by, remarks]);

    res.json({ message: 'Asset checked out', asset_id: assetId });
  } catch (err) {
    next(err);
  }
};

// POST /assets/:id/check-in

exports.checkInAsset = async (req, res, next) => {
  try {
    const assetId = req.params.id;
    const { return_condition_id, return_reason_notes } = req.body;

    // Validate return condition exists
    const [[condition]] = await dbPromise.query(`
      SELECT name FROM asset_return_conditions 
      WHERE id = ? AND is_active = TRUE
    `, [return_condition_id]);

    if (!condition) {
      return res.status(400).json({ error: 'Invalid return condition' });
    }

    // Update asset status based on return condition
    await dbPromise.query(`
      UPDATE assets SET
        assigned_to = NULL,
        assigned_department = NULL,
        status_id = CASE
          WHEN ? = (SELECT id FROM asset_return_conditions WHERE name = 'Damaged') 
            THEN (SELECT id FROM asset_statuses WHERE name = 'Repair')
          WHEN ? = (SELECT id FROM asset_return_conditions WHERE name = 'Lost') 
            THEN (SELECT id FROM asset_statuses WHERE name = 'Lost')
          ELSE status_id
        END
      WHERE id = ?
    `, [return_condition_id, return_condition_id, assetId]);

    // Log the check-in with condition
    await dbPromise.query(`
      INSERT INTO asset_checkinout_log (
        asset_id, action, return_condition_id, return_reason_notes
      ) VALUES (?, 'check-in', ?, ?)
    `, [assetId, return_condition_id, return_reason_notes]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// GET /assets/:id/checkinout-logs
exports.getAssetCheckinoutLog = async (req, res, next) => {
  try {
    const assetId = req.params.id;
    const [logs] = await dbPromise.query(`
      SELECT acl.*, 
             e1.name AS user_name, 
             d.department_name, 
             e2.name AS performed_by_name
      FROM asset_checkinout_log acl
      LEFT JOIN employees e1 ON acl.user_id = e1.id
      LEFT JOIN departments d ON acl.department_id = d.id
      LEFT JOIN employees e2 ON acl.performed_by = e2.id
      WHERE acl.asset_id = ?
      ORDER BY acl.date DESC
    `, [assetId]);
    res.json(logs);
  } catch (err) {
    next(err);
  }
};

exports.getWarrantyReport = async (req, res) => {
  try {
    const { timeframe = '30' } = req.query; // Days to look ahead
    
    const [rows] = await dbPromise.query(`
      SELECT 
        a.id, a.serial_number,
        p.name AS product_name,
        b.name AS brand_name,
        a.purchase_date,
        a.warranty_period_months,
        a.warranty_expiry,
        DATEDIFF(a.warranty_expiry, CURDATE()) AS days_remaining,
        CONCAT(
          FLOOR(DATEDIFF(a.warranty_expiry, a.purchase_date)/30), ' months'
        ) AS warranty_duration
      FROM assets a
      JOIN products p ON a.product_id = p.id
      JOIN asset_brands b ON a.brand_id = b.id
      WHERE 
        a.warranty_expiry IS NOT NULL AND
        a.warranty_expiry BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
      ORDER BY days_remaining ASC
    `, [timeframe]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getReturnAnalysis = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    const [rows] = await dbPromise.query(`
      SELECT 
        arc.name AS return_condition,
        COUNT(*) AS count,
        GROUP_CONCAT(DISTINCT a.product_id) AS affected_products
      FROM asset_checkinout_log l
      JOIN asset_return_conditions arc ON l.return_condition_id = arc.id
      JOIN assets a ON l.asset_id = a.id
      WHERE 
        l.action = 'check-in' AND
        l.created_at BETWEEN ? AND ?
      GROUP BY return_condition_id
      ORDER BY count DESC
    `, [start_date || '1970-01-01', end_date || '2038-01-19']);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// GET /api/asset-return-conditions
exports.getAssetReturnConditions = async (req, res) => {
  const [rows] = await dbPromise.query('SELECT id, name FROM asset_return_conditions WHERE is_active=1');
  res.json(rows);
};


// Create new return condition
exports.createAssetReturnCondition = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const [result] = await dbPromise.query(`
      INSERT INTO asset_return_conditions (name, description)
      VALUES (?, ?)
    `, [name, description]);

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update return condition
exports.updateAssetReturnCondition = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    await dbPromise.query(`
      UPDATE asset_return_conditions 
      SET name = ?, description = ?, is_active = ?
      WHERE id = ?
    `, [name, description, is_active, id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/asset-return-reasons
exports.getAssetReturnReasons = async (req, res) => {
  const [rows] = await dbPromise.query('SELECT id, reason_text FROM asset_return_reasons WHERE is_active=1');
  res.json(rows);
};


exports.getUnits = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT id, name FROM asset_units ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching units', details: err.message });
  }
};

exports.getLocations = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT id, name FROM asset_locations ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching locations', details: err.message });
  }
};


// Stock Movement Reasons CRUD
exports.getStockMovementReasons = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM stock_movement_reasons WHERE is_active = TRUE ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock movement reasons', details: err.message });
  }
};

exports.createStockMovementReason = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const [result] = await dbPromise.query(
      'INSERT INTO stock_movement_reasons (name, description) VALUES (?, ?)',
      [name, description]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create reason', details: err.message });
  }
};

exports.updateStockMovementReason = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    await dbPromise.query(
      'UPDATE stock_movement_reasons SET name = ?, description = ?, is_active = ? WHERE id = ?',
      [name, description, is_active, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update reason', details: err.message });
  }
};


exports.getStockBalance = async (req, res) => {
  try {
    const sql = `
      SELECT 
        p.id, p.name, p.sku,
        b.name AS brand_name,
        psb.balance AS stock_balance,
        p.min_stock, p.reorder_level
      FROM products p
      LEFT JOIN asset_brands b ON p.brand_id = b.id
      LEFT JOIN product_stock_balance psb ON p.id = psb.product_id
      WHERE psb.balance <= p.min_stock
      ORDER BY psb.balance ASC
    `;
    const [rows] = await dbPromise.query(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
};


exports.createBulkAssetRequest = async (req, res, next) => {
  try {
    const { requester_id, department_id, purpose, items } = req.body;

    // Validate required fields
    if (!requester_id || !department_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Requester, department, and at least one item are required' });
    }

    // Start transaction
    await dbPromise.query('START TRANSACTION');

    // 1. Create the bulk request
    const [requestResult] = await dbPromise.query(
      `INSERT INTO asset_bulk_requests 
       (requester_id, department_id, purpose, status_id)
       VALUES (?, ?, ?, 
         (SELECT id FROM asset_request_status WHERE status_name = 'Pending'))`,
      [requester_id, department_id, purpose]
    );
    const requestId = requestResult.insertId;

    // 2. Add request items
    const itemValues = items.map(item => [
      requestId,
      item.asset_type_id,
      item.product_id || null,
      item.quantity || 1,
      item.specifications || null
    ]);

    await dbPromise.query(
      `INSERT INTO asset_bulk_request_items 
       (request_id, asset_type_id, product_id, quantity, specifications)
       VALUES ?`,
      [itemValues]
    );

    // 3. Log the creation
    await dbPromise.query(
      `INSERT INTO asset_request_history
       (request_id, status_id, changed_by, remarks, changed_at)
       VALUES (?, 
         (SELECT id FROM asset_request_status WHERE status_name = 'Pending'), 
         ?, 'Bulk request created', NOW())`,
      [requestId, requester_id]
    );

    await dbPromise.query('COMMIT');

    res.status(201).json({
      message: 'Bulk asset request created',
      request_id: requestId,
      item_count: items.length
    });
  } catch (err) {
    await dbPromise.query('ROLLBACK');
    next(err);
  }
};

exports.getBulkRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get request header
    const [request] = await dbPromise.query(`
      SELECT br.*, ars.status_name, 
             e.name AS requester_name, 
             d.department_name
      FROM asset_bulk_requests br
      JOIN asset_request_status ars ON br.status_id = ars.id
      JOIN employees e ON br.requester_id = e.id
      JOIN departments d ON br.department_id = d.id
      WHERE br.id = ?
    `, [id]);

    if (!request.length) {
      return res.status(404).json({ error: 'Bulk request not found' });
    }

    // Get request items
    const [items] = await dbPromise.query(`
      SELECT bri.*, at.name AS asset_type_name, 
             p.name AS product_name, p.sku
      FROM asset_bulk_request_items bri
      LEFT JOIN asset_types at ON bri.asset_type_id = at.id
      LEFT JOIN products p ON bri.product_id = p.id
      WHERE bri.request_id = ?
    `, [id]);

    // Get request history
    const [history] = await dbPromise.query(`
      SELECT h.*, ars.status_name, e.name AS changed_by_name
      FROM asset_request_history h
      JOIN asset_request_status ars ON h.status_id = ars.id
      LEFT JOIN employees e ON h.changed_by = e.id
      WHERE h.request_id = ?
      ORDER BY h.changed_at DESC
    `, [id]);

    res.json({
      ...request[0],
      items,
      history
    });
  } catch (err) {
    next(err);
  }
};


exports.processBulkRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status_name, approver_id, remarks } = req.body;

    // Validate status
    const validStatuses = ['Approved', 'Rejected', 'Partially Approved'];
    if (!validStatuses.includes(status_name)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await dbPromise.query('START TRANSACTION');

    // 1. Update request status
    await dbPromise.query(`
      UPDATE asset_bulk_requests 
      SET status_id = (SELECT id FROM asset_request_status WHERE status_name = ?)
      WHERE id = ?
    `, [status_name, id]);

    // 2. Log the status change
    await dbPromise.query(`
      INSERT INTO asset_request_history
      (request_id, status_id, changed_by, remarks, changed_at)
      VALUES (?, 
        (SELECT id FROM asset_request_status WHERE status_name = ?), 
        ?, ?, NOW())
    `, [id, status_name, approver_id, remarks || `Bulk request ${status_name.toLowerCase()}`]);

    // 3. If approved, create individual asset records
    if (status_name === 'Approved') {
      const [items] = await dbPromise.query(`
        SELECT * FROM asset_bulk_request_items 
        WHERE request_id = ?
      `, [id]);

      for (const item of items) {
        for (let i = 0; i < item.quantity; i++) {
          await dbPromise.query(`
            INSERT INTO assets (
              product_id, asset_type_id, status_id,
              purchase_date, warranty_expiry, specifications
            ) VALUES (
              ?, ?, 
              (SELECT id FROM asset_statuses WHERE status_name = 'Available'),
              NULL, NULL, ?
            )
          `, [item.product_id, item.asset_type_id, item.specifications]);
        }
      }
    }

    await dbPromise.query('COMMIT');

    res.json({ 
      success: true,
      message: `Bulk request ${status_name.toLowerCase()} successfully`,
      request_id: id
    });
  } catch (err) {
    await dbPromise.query('ROLLBACK');
    next(err);
  }
};



// BRANDS

exports.getAllBrands = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      'SELECT id, name, description, is_active, created_at FROM asset_brands ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createBrand = async (req, res) => {
  const { name, description, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Brand name is required' });
  
  try {
    const [result] = await dbPromise.query(
      'INSERT INTO asset_brands (name, description, is_active) VALUES (?, ?, ?)',
      [name, description || null, is_active !== false] // Default to true if not specified
    );
    res.json({ 
      id: result.insertId, 
      name,
      description,
      is_active: is_active !== false
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Brand name already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
};

exports.getBrandById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query(
      'SELECT id, name, description, is_active, created_at FROM asset_brands WHERE id = ?', 
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Brand not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateBrand = async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;
  
  if (!name) return res.status(400).json({ error: 'Brand name is required' });
  
  try {
    // Check if name exists for another brand
    const [exists] = await dbPromise.query(
      'SELECT id FROM asset_brands WHERE name = ? AND id <> ?', 
      [name, id]
    );
    if (exists.length > 0) return res.status(409).json({ error: 'Brand name already exists' });

    await dbPromise.query(
      'UPDATE asset_brands SET name = ?, description = ?, is_active = ? WHERE id = ?',
      [name, description || null, is_active !== false, id]
    );
    
    res.json({ 
      id, 
      name,
      description,
      is_active: is_active !== false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteBrand = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM asset_brands WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// MODELS

exports.getAllModels = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT m.id, m.model_name, m.brand_id, b.name AS brand_name, m.description, m.is_active, m.created_at
      FROM asset_models m
      LEFT JOIN asset_brands b ON m.brand_id = b.id
      ORDER BY m.model_name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createModel = async (req, res) => {
  const { name, brand_id, description, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Model name is required' });
  if (!brand_id) return res.status(400).json({ error: 'Brand is required' });

  try {
    const [result] = await dbPromise.query(
      'INSERT INTO asset_models (model_name, brand_id, description, is_active) VALUES (?, ?, ?, ?)',
      [name, brand_id, description || null, is_active !== undefined ? is_active : 1]
    );
    res.json({ id: result.insertId, name, brand_id, description, is_active });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Model name already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
};

exports.getModelById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query(
      `SELECT m.id, m.model_name, m.brand_id, b.name AS brand_name, m.description, m.is_active, m.created_at
       FROM asset_models m
       LEFT JOIN asset_brands b ON m.brand_id = b.id
       WHERE m.id = ?`, [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateModel = async (req, res) => {
  const { id } = req.params;
  const { name, brand_id, description, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Model name is required' });
  if (!brand_id) return res.status(400).json({ error: 'Brand is required' });

  try {
    // Check for duplicate name (other than self)
    const [exists] = await dbPromise.query(
      'SELECT id FROM asset_models WHERE model_name = ? AND id <> ?', [name, id]
    );
    if (exists.length > 0) return res.status(409).json({ error: 'Model name already exists' });

    await dbPromise.query(
      'UPDATE asset_models SET model_name = ?, brand_id = ?, description = ?, is_active = ? WHERE id = ?',
      [name, brand_id, description || null, is_active !== undefined ? is_active : 1, id]
    );
    res.json({ id, name, brand_id, description, is_active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteModel = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM asset_models WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// LOCATIONS
exports.getAllLocations = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      'SELECT id, name, description, is_active FROM asset_locations ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createLocation = async (req, res) => {
  const { name, description = '', is_active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'Location name is required' });
  try {
    const [result] = await dbPromise.query(
      'INSERT INTO asset_locations (name, description, is_active) VALUES (?, ?, ?)',
      [name, description, is_active]
    );
    res.json({ id: result.insertId, name, description, is_active });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') res.status(409).json({ error: 'Location name already exists' });
    else res.status(500).json({ error: err.message });
  }
};

exports.getLocationById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query('SELECT id, name, description, is_active FROM asset_locations WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Location not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateLocation = async (req, res) => {
  const { id } = req.params;
  const { name, description = '', is_active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'Location name is required' });
  try {
    const [exists] = await dbPromise.query('SELECT id FROM asset_locations WHERE name = ? AND id <> ?', [name, id]);
    if (exists.length > 0) return res.status(409).json({ error: 'Location name already exists' });
    await dbPromise.query(
      'UPDATE asset_locations SET name = ?, description = ?, is_active = ? WHERE id = ?',
      [name, description, is_active, id]
    );
    res.json({ id, name, description, is_active });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteLocation = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM asset_locations WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};


// TYPES
exports.getAllTypes = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      'SELECT id, name, description, is_active  FROM asset_types ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createType = async (req, res) => {
  const { name, description = '', is_active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'Type name is required' });
  try {
    const [result] = await dbPromise.query(
      'INSERT INTO asset_types (name, description, is_active) VALUES (?, ?, ?)', 
      [name, description, is_active]
    );
    res.json({ id: result.insertId, name, description, is_active });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') res.status(409).json({ error: 'Type name already exists' });
    else res.status(500).json({ error: err.message });
  }
};

exports.getTypeById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query('SELECT id, name, description, is_active  FROM asset_types WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Type not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateType = async (req, res) => {
  const { id } = req.params;
  const { name, description = '', is_active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'Type name is required' });
  try {
    const [exists] = await dbPromise.query('SELECT id FROM asset_types WHERE name = ? AND id <> ?', [name, id]);
    if (exists.length > 0) return res.status(409).json({ error: 'Type name already exists' });
    await dbPromise.query(
      'UPDATE asset_types SET name = ?, description = ?, is_active = ? WHERE id = ?',
      [name, description, is_active, id]
    );
    res.json({ id, name, description, is_active });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteType = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM asset_types WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};


// STATUSES
exports.getAllStatuses = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      'SELECT id, name, description FROM asset_statuses ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createStatus = async (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Status name is required' });
  try {
    const [result] = await dbPromise.query(
      'INSERT INTO asset_statuses (name, description) VALUES (?, ?)', [name, description]
    );
    res.json({ id: result.insertId, name, description });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') res.status(409).json({ error: 'Status name already exists' });
    else res.status(500).json({ error: err.message });
  }
};

exports.getStatusById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query('SELECT id, name, description FROM asset_statuses WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Status not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Status name is required' });
  try {
    const [exists] = await dbPromise.query('SELECT id FROM asset_statuses WHERE name = ? AND id <> ?', [name, id]);
    if (exists.length > 0) return res.status(409).json({ error: 'Status name already exists' });
    await dbPromise.query(
      'UPDATE asset_statuses SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );
    res.json({ id, name, description });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteStatus = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM asset_statuses WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// UNITS
exports.getAllUnits = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT id, name FROM asset_units ORDER BY name ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createUnit = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Unit name is required' });
  try {
    const [result] = await dbPromise.query(
      'INSERT INTO asset_units (name) VALUES (?)', [name]
    );
    res.json({ id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') res.status(409).json({ error: 'Unit name already exists' });
    else res.status(500).json({ error: err.message });
  }
};

exports.getUnitById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query('SELECT id, name FROM asset_units WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Unit not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateUnit = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Unit name is required' });
  try {
    const [exists] = await dbPromise.query('SELECT id FROM asset_units WHERE name = ? AND id <> ?', [name, id]);
    if (exists.length > 0) return res.status(409).json({ error: 'Unit name already exists' });
    await dbPromise.query('UPDATE asset_units SET name = ? WHERE id = ?', [name, id]);
    res.json({ id, name });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteUnit = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM asset_units WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};


// CATEGORIES
exports.getAllCategories = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT id, name, description  FROM asset_categories ORDER BY name ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// CREATE
exports.createCategory = async (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  try {
    const [result] = await dbPromise.query(
      'INSERT INTO asset_categories (name, description) VALUES (?, ?)',
      [name, description]
    );
    res.json({ id: result.insertId, name, description });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') res.status(409).json({ error: 'Category name already exists' });
    else res.status(500).json({ error: err.message });
  }
};

// GET BY ID
exports.getCategoryById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query('SELECT id, name, description FROM asset_categories WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// UPDATE
exports.updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  try {
    // EXCLUDE self in duplicate check
    const [exists] = await dbPromise.query(
      'SELECT id FROM asset_categories WHERE name = ? AND id <> ?',
      [name, id]
    );
    if (exists.length > 0) return res.status(409).json({ error: 'Category name already exists' });

    await dbPromise.query(
      'UPDATE asset_categories SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );
    res.json({ id, name, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.deleteCategory = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM asset_categories WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
