INSERT INTO asset_types (id, name) VALUES
(1, 'Laptop'),
(2, 'Monitor'),
(3, 'Printer');

INSERT INTO asset_statuses (id, name) VALUES
(1, 'In Use'),
(2, 'In Stock'),
(3, 'Under Repair'),
(4, 'Scrapped');

INSERT INTO product_categories (id, name) VALUES
(1, 'IT Equipment'),
(2, 'Office Supplies');

INSERT INTO locations (id, name) VALUES
(1, 'Warehouse A'),
(2, 'Main Office');

INSERT INTO products (id, sku, name, category, brand, model, unit, min_stock, max_stock, reorder_level, description, storage_location, created_at) VALUES
(1, 'SKU-0001', 'Product 1', 'IT Equipment', 'Dell', 'Model-3963', 'pcs', 5, 50, 10, 'Police these involve dark professor enjoy surface.', 'Warehouse A', '2025-01-28 10:20:36'),
(2, 'SKU-0002', 'Product 2', 'IT Equipment', 'Lenovo', 'Model-4710', 'pcs', 5, 50, 10, 'Take job her scene west.', 'Warehouse A', '2025-02-16 07:39:46'),
(3, 'SKU-0003', 'Product 3', 'IT Equipment', 'Lenovo', 'Model-6630', 'pcs', 5, 50, 10, 'Evidence memory thousand subject short.', 'Warehouse A', '2025-03-24 13:10:42'),
(4, 'SKU-0004', 'Product 4', 'IT Equipment', 'HP', 'Model-4183', 'pcs', 5, 50, 10, 'Remain turn month open arm network type experience.', 'Warehouse A', '2025-04-02 05:05:50'),
(5, 'SKU-0005', 'Product 5', 'IT Equipment', 'HP', 'Model-3268', 'pcs', 5, 50, 10, 'Others among hundred office investment show.', 'Warehouse A', '2025-05-18 13:51:35');

INSERT INTO assets (id, serial_number, product_id, asset_type_id, status_id, brand, model, purchase_date, warranty_expiry, invoice_ref, supplier, location, description, attachments, qr_code_url, asset_group_id, color, assigned_to, assigned_department, assignment_start_date) VALUES
(1, 'SN-00001', 1, 1, 2, 'HP', 'Model-129', '2023-02-17', '2026-06-24', 'INV-10001', 'Richard, Young and Larson', 'Main Office', 'Occur follow room up doctor discussion example.', NULL, NULL, NULL, 'Grey', NULL, NULL, NULL),
(2, 'SN-00002', 2, 2, 3, 'HP', 'Model-825', '2023-05-07', '2026-07-15', 'INV-10002', 'Burnett, Gutierrez and Washington', 'Main Office', 'Small reality we current full yes.', NULL, NULL, NULL, 'Black', NULL, NULL, NULL),
(3, 'SN-00003', 3, 3, 3, 'Dell', 'Model-682', '2022-12-19', '2026-10-08', 'INV-10003', 'Ramirez Ltd', 'Main Office', 'Try guess stuff.', NULL, NULL, NULL, 'Black', NULL, NULL, NULL),
(4, 'SN-00004', 4, 2, 3, 'Dell', 'Model-225', '2023-05-15', '2027-03-07', 'INV-10004', 'Romero-Young', 'Main Office', 'Food out matter compare matter imagine sometimes.', NULL, NULL, NULL, 'Black', NULL, NULL, NULL),
(5, 'SN-00005', 5, 1, 2, 'Dell', 'Model-694', '2022-10-18', '2025-09-07', 'INV-10005', 'Carrillo-Doyle', 'Main Office', 'Executive example last with.', NULL, NULL, NULL, 'Black', NULL, NULL, NULL);

INSERT INTO feedback_requests (id, staff_id, section_id, category_id, feedback_type_id, status_id, description, attachments, assigned_pic, escalation_level, submitted_at, updated_at) VALUES
(1, 9, 1, 2, 1, 2, 'Too attack strategy. American account analysis right spend fear.', NULL, 'Wanda Vasquez', 1, '2025-05-11 09:47:51', '2025-05-06 14:23:00'),
(2, 8, 2, 1, 2, 1, 'Oil sort public more speak become. Draw any although special win.', NULL, 'Christopher Williams', 1, '2025-02-22 02:01:48', '2025-03-15 08:59:13'),
(3, 1, 1, 2, 2, 2, 'Once space now cause natural especially step. As arm nation.
Create bring rock man fire.', NULL, 'John Stokes', 1, '2025-03-10 02:23:07', '2025-02-09 16:03:33'),
(4, 1, 1, 2, 2, 1, 'Probably simple might hundred science. Full civil others suddenly.', NULL, 'Justin White', 1, '2025-05-18 11:36:49', '2025-04-22 02:15:52'),
(5, 8, 2, 1, 1, 1, 'Allow why raise behavior image allow successful. Item realize smile election.', NULL, 'Jessica Lewis', 1, '2025-04-23 21:57:47', '2025-04-13 12:55:05');


INSERT INTO asset_groups (id, name) VALUES
(1, 'Laptop Group A'),
(2, 'Printer Group B');

DELETE FROM stock_movements WHERE id BETWEEN 1 AND 5;
DELETE FROM asset_history WHERE id BETWEEN 1 AND 5;
DELETE FROM asset_requests WHERE id BETWEEN 1 AND 5;


INSERT INTO asset_group_items (id, group_id, asset_id) VALUES
(1, 2, 1),
(2, 2, 2),
(3, 2, 3),
(4, 1, 4),
(5, 1, 5);

INSERT INTO asset_history (id, asset_id, action, from_employee_id, to_employee_id, action_date, notes) VALUES
(1, 1, 'Transfer', 7, 9, '2025-01-21 00:02:57', 'Beautiful husband possible its wear floor.'),
(2, 2, 'Return', 6, 2, '2025-01-26 16:40:33', 'Rule consumer yard sell prove area.'),
(3, 3, 'Repair', 10, 4, '2025-01-04 12:57:48', 'Report face seat thus.'),
(4, 4, 'Transfer', 9, 2, '2025-04-10 05:14:08', 'Human ten spring oil.'),
(5, 5, 'Return', 2, 3, '2025-04-11 19:26:11', 'Important building end technology member apply hope majority.');

INSERT INTO asset_requests (id, employee_id, submitted_on_behalf, category, asset_type_id, brand, model, serial_no, purpose, remarks, attachment, quantity, created_at) VALUES
(1, 4, 6, 'IT Equipment', 2, 'Dell', 'Model-220', 'REQ-SN-0001', 'Replacement', 'Oil glass suffer nice event like morning.', NULL, 1, '2025-01-06 08:32:52'),
(2, 5, 4, 'IT Equipment', 3, 'Dell', 'Model-118', 'REQ-SN-0002', 'Replacement', 'Himself conference next new seat huge during.', NULL, 3, '2025-05-25 04:00:22'),
(3, 4, 4, 'IT Equipment', 1, 'Dell', 'Model-526', 'REQ-SN-0003', 'Replacement', 'Into Congress industry that.', NULL, 1, '2025-05-02 04:48:05'),
(4, 5, 7, 'IT Equipment', 1, 'HP', 'Model-264', 'REQ-SN-0004', 'Replacement', 'Anything school environment least bar strong project play.', NULL, 2, '2025-01-25 23:21:52'),
(5, 2, 6, 'IT Equipment', 2, 'HP', 'Model-908', 'REQ-SN-0005', 'Replacement', 'Forget source public phone reach seven.', NULL, 3, '2025-05-15 02:20:36');

INSERT INTO stock_movements (id, product_id, movement_type, quantity, reason, performed_by, issued_to, location, movement_date) VALUES
(1, 1, 'Adjustment', 6, 'Stand paper themselves arrive people drop responsibility.', 4, 6, 'Warehouse A', '2025-04-11 19:01:27'),
(2, 2, 'Stock Out', 6, 'Remember national nice east necessary.', 1, 10, 'Warehouse A', '2025-06-18 20:22:31'),
(3, 3, 'Adjustment', 4, 'Hot bit effort about four.', 4, 10, 'Warehouse A', '2025-05-10 17:41:51'),
(4, 4, 'Stock Out', 1, 'Little hold career even church idea crime.', 1, 4, 'Warehouse A', '2025-06-19 20:48:18'),
(5, 5, 'Stock Out', 9, 'Threat country safe government something.', 1, 10, 'Warehouse A', '2025-01-01 21:49:01');



INSERT INTO public_holidays (holiday_date, title, description, location_id, is_global)
VALUES
('2025-01-01', 'New Year''s Day', 'Public holiday nationwide', NULL, TRUE),
('2025-01-29', 'Thaipusam', 'Observed in Selangor, KL, Penang, etc.', NULL, FALSE),
('2025-02-01', 'Federal Territory Day', 'KL, Labuan, Putrajaya only', NULL, FALSE),
('2025-02-19', 'Chinese New Year', 'Day 1 of Chinese New Year', NULL, TRUE),
('2025-02-20', 'Chinese New Year (2nd Day)', 'Day 2 of Chinese New Year', NULL, TRUE),
('2025-03-28', 'Nuzul Al-Quran', 'Observed in several states', NULL, FALSE),
('2025-04-10', 'Hari Raya Aidilfitri', 'First day of Hari Raya Aidilfitri', NULL, TRUE),
('2025-04-11', 'Hari Raya Aidilfitri Holiday', 'Second day of Hari Raya Aidilfitri', NULL, TRUE),
('2025-05-01', 'Labour Day', 'Public holiday nationwide', NULL, TRUE),
('2025-05-17', 'Wesak Day', 'Observed nationwide', NULL, TRUE),
('2025-06-07', 'Agong''s Birthday', 'Public holiday nationwide', NULL, TRUE),
('2025-06-06', 'Hari Raya Haji', 'Public holiday nationwide', NULL, TRUE),
('2025-06-27', 'Awal Muharram', 'Islamic New Year', NULL, TRUE),
('2025-08-31', 'National Day (Merdeka)', 'Public holiday nationwide', NULL, TRUE),
('2025-09-16', 'Malaysia Day', 'Public holiday nationwide', NULL, TRUE),
('2025-10-06', 'Prophet Muhammad''s Birthday (Maulidur Rasul)', 'Public holiday nationwide', NULL, TRUE),
('2025-11-29', 'Deepavali', 'Observed in most states except Sarawak', NULL, FALSE),
('2025-12-25', 'Christmas Day', 'Public holiday nationwide', NULL, TRUE);


-- Drop tables if exist (drop child first)
DROP TABLE IF EXISTS currency_rates;
DROP TABLE IF EXISTS banks;

-- Create banks table
CREATE TABLE banks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bank_name VARCHAR(100) NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'MYR',
  type VARCHAR(50) DEFAULT 'Bank',
  status ENUM('Active', 'Inactive') DEFAULT 'Active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create currency_rates table with FK to banks
CREATE TABLE currency_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bank_id INT NOT NULL,
  from_code VARCHAR(3) NOT NULL,
  to_code VARCHAR(3) NOT NULL,
  rate DECIMAL(10,4) NOT NULL,
  effective_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  updated_by INT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_expired BOOLEAN DEFAULT 0,
  FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
);

-- Insert banks
INSERT INTO banks (id, bank_name, currency_code, type, status, created_at, updated_at) VALUES
(1, 'Maybank', 'MYR', 'Bank', 'Active', NOW(), NOW()),
(2, 'CIMB', 'MYR', 'Bank', 'Active', NOW(), NOW()),
(3, 'Public Bank', 'MYR', 'Bank', 'Inactive', NOW(), NOW());

-- Insert currency rates (linked by bank_id)
INSERT INTO currency_rates (bank_id, from_code, to_code, rate, effective_date, expiry_date, updated_by, updated_at, is_expired) VALUES
(1, 'MYR', 'USD', 0.2100, '2025-06-01', '2025-06-30', 1, NOW(), 0),
(1, 'MYR', 'THB', 7.9000, '2025-06-01', '2025-06-30', 1, NOW(), 0),
(2, 'MYR', 'IDR', 3350.0000, '2025-06-01', '2025-06-30', 1, NOW(), 0),
(2, 'MYR', 'PHP', 11.7800, '2025-06-01', '2025-06-30', 1, NOW(), 0),
(3, 'MYR', 'VND', 5615.2500, '2025-06-01', '2025-06-30', 1, NOW(), 0),
(3, 'MYR', 'BDT', 25.5500, '2025-06-01', '2025-06-30', 1, NOW(), 1);



-- CurrencyCodes
INSERT INTO Currency_Codes (id, Code, Name, Status, created_at, updated_at) VALUES
(1, 'USD', 'US Dollar', 'Active', NOW(), NOW()),
(2, 'THB', 'Thai Baht', 'Active', NOW(), NOW()),
(3, 'IDR', 'Indonesian Rupiah', 'Active', NOW(), NOW()),
(4, 'PHP', 'Philippine Peso', 'Active', NOW(), NOW()),
(5, 'VND', 'Vietnamese Dong', 'Active', NOW(), NOW()),
(6, 'BDT', 'Bangladeshi Taka', 'Active', NOW(), NOW());




