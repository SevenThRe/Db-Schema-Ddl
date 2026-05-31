CREATE DATABASE IF NOT EXISTS dbtools_lab
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'dbtools_readonly'@'%' IDENTIFIED BY 'dbtools_readonly';
GRANT SELECT, SHOW VIEW ON dbtools_lab.* TO 'dbtools_readonly'@'%';
GRANT ALL PRIVILEGES ON dbtools_lab.* TO 'dbtools_writable'@'%';

USE dbtools_lab;

CREATE TABLE departments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_code (code)
) COMMENT='DBTools lab department master';

CREATE TABLE employees (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  department_id BIGINT NOT NULL,
  employee_no VARCHAR(32) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  hired_on DATE NULL,
  salary DECIMAL(12,2) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employees_employee_no (employee_no),
  KEY idx_employees_department_status (department_id, status),
  CONSTRAINT fk_employees_department
    FOREIGN KEY (department_id) REFERENCES departments(id)
) COMMENT='DBTools lab employee transaction table';

CREATE TABLE schema_change_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  object_name VARCHAR(160) NOT NULL,
  action VARCHAR(32) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT='DBTools lab audit sink';

CREATE VIEW active_employees AS
SELECT
  e.id,
  e.employee_no,
  e.full_name,
  d.code AS department_code,
  d.name AS department_name
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.status = 'active';

DELIMITER //
CREATE PROCEDURE count_active_employees()
BEGIN
  SELECT COUNT(*) AS active_employee_count
  FROM employees
  WHERE status = 'active';
END//
DELIMITER ;

INSERT INTO departments (code, name) VALUES
  ('ENG', 'Engineering'),
  ('OPS', 'Operations'),
  ('FIN', 'Finance');

INSERT INTO employees (department_id, employee_no, full_name, status, hired_on, salary) VALUES
  (1, 'E-1001', 'Aki Tanaka', 'active', '2024-04-01', 82000.00),
  (1, 'E-1002', 'Mina Sato', 'active', '2024-06-15', 79000.00),
  (2, 'E-2001', 'Ken Mori', 'inactive', '2023-11-20', 68000.00),
  (3, 'E-3001', 'Yui Kato', 'active', '2025-01-10', 73000.00);

FLUSH PRIVILEGES;
