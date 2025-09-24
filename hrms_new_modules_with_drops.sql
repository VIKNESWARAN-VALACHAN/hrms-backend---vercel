
-- HRMS Extended Module Tables (Safe Import with DROP IF EXISTS)

DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS asset_groups;
DROP TABLE IF EXISTS asset_group_items;
DROP TABLE IF EXISTS asset_history;
DROP TABLE IF EXISTS asset_requests;
DROP TABLE IF EXISTS asset_types;
DROP TABLE IF EXISTS asset_statuses;
DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS feedback_requests;
DROP TABLE IF EXISTS feedback_pic_config;
DROP TABLE IF EXISTS feedback_logs;
DROP TABLE IF EXISTS master_feedback_types;
DROP TABLE IF EXISTS master_status;
DROP TABLE IF EXISTS master_categories;
DROP TABLE IF EXISTS master_sections;
DROP TABLE IF EXISTS employee_working_hours;
DROP TABLE IF EXISTS employee_tiers;
DROP TABLE IF EXISTS shift_templates;
DROP TABLE IF EXISTS employee_shift_assignment;
DROP TABLE IF EXISTS public_holidays;
DROP TABLE IF EXISTS banks;
DROP TABLE IF EXISTS currency_codes;
DROP TABLE IF EXISTS currency_rates;


-- ========================================
-- HRMS Extended Module Tables
-- Generated on 2025-06-21 05:17:30
-- ========================================

-- ===== INVENTORY MODULE =====

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) UNIQUE,
  name VARCHAR(100),
  category VARCHAR(50),
  brand VARCHAR(100),
  model VARCHAR(100),
  unit VARCHAR(20),
  min_stock INT,
  max_stock INT,
  reorder_level INT,
  description TEXT,
  storage_location VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT,
  movement_type ENUM('Stock In', 'Stock Out', 'Return', 'Adjustment', 'Lost/Damaged', 'Repair Out', 'Repair In'),
  quantity INT,
  reason TEXT,
  performed_by INT,
  issued_to INT,
  location VARCHAR(100),
  movement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (performed_by) REFERENCES employees(id),
  FOREIGN KEY (issued_to) REFERENCES employees(id)
);

CREATE TABLE assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  serial_number VARCHAR(100) UNIQUE,
  product_id INT,
  asset_type_id INT,
  status_id INT,
  brand VARCHAR(100),
  model VARCHAR(100),
  purchase_date DATE,
  warranty_expiry DATE,
  invoice_ref VARCHAR(100),
  supplier VARCHAR(100),
  location VARCHAR(100),
  description TEXT,
  attachments TEXT,
  qr_code_url TEXT,
  asset_group_id INT,
  color VARCHAR(50),
  assigned_to INT,
  assigned_department INT,
  assignment_start_date DATE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE asset_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE asset_group_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT,
  asset_id INT,
  FOREIGN KEY (group_id) REFERENCES asset_groups(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE TABLE asset_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT,
  action ENUM('Assign', 'Transfer', 'Return', 'Repair', 'Scrap', 'Dispose'),
  from_employee_id INT,
  to_employee_id INT,
  action_date DATETIME,
  notes TEXT,
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE TABLE asset_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT,
  submitted_on_behalf INT,
  category VARCHAR(50),
  asset_type_id INT,
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_no VARCHAR(100),
  purpose VARCHAR(100),
  remarks TEXT,
  attachment TEXT,
  quantity INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== CONFIG TABLES FOR INVENTORY & ASSETS =====

CREATE TABLE asset_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE asset_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

-- ===== STAFF FEEDBACK MODULE =====

CREATE TABLE feedback_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT,
  section_id INT,
  category_id INT,
  feedback_type_id INT,
  status_id INT,
  description TEXT,
  attachments TEXT,
  assigned_pic VARCHAR(100),
  escalation_level INT DEFAULT 1,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

CREATE TABLE feedback_pic_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT,
  name VARCHAR(100),
  email VARCHAR(100),
  priority INT,
  status ENUM('Active', 'Inactive')
);

CREATE TABLE feedback_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feedback_id INT,
  event TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== CONFIG TABLES FOR FEEDBACK =====

CREATE TABLE master_feedback_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE master_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE master_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE master_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100)
);

-- ===== WORKING TIME =====

CREATE TABLE employee_working_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  assigned_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  tier_level ENUM('Employee', 'Manager', 'Senior Manager', 'Director', 'CEO') NOT NULL,
  section_id INT,
  reports_to INT
);

-- ===== SHIFT SETTING =====

CREATE TABLE shift_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50),
  start_time TIME,
  end_time TIME,
  timezone VARCHAR(50),
  is_default BOOLEAN DEFAULT FALSE
);

CREATE TABLE employee_shift_assignment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT,
  shift_id INT,
  start_date DATE,
  end_date DATE,
  assigned_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== HOLIDAY LISTING =====

CREATE TABLE public_holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  holiday_date DATE NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  location_id INT NULL,
  is_global BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== BANK CURRENCY MODULE =====

CREATE TABLE banks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  currency_code VARCHAR(3),
  type VARCHAR(50),
  status ENUM('Active', 'Inactive'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE currency_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(3),
  name VARCHAR(100),
  status ENUM('Active', 'Inactive'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE currency_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_code VARCHAR(3),
  to_code VARCHAR(3),
  rate DECIMAL(10, 4),
  effective_date DATE,
  expiry_date DATE,
  updated_by INT,
  updated_at DATETIME,
  is_expired BOOLEAN
);


ALTER TABLE assets ADD qr_last_generated DATETIME;
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE


CREATE INDEX idx_feedback_staff_id ON feedback_requests(staff_id);
CREATE INDEX idx_assets_serial ON assets(serial_number);


CREATE TABLE brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  model_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);

ALTER TABLE currency_rates
ADD COLUMN bank_id INT AFTER id;