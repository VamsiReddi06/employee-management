require('dotenv').config();
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: 'employee.sid',
  secret: process.env.SESSION_SECRET || 'local-demo-secret-change-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 4 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

function validateEmployee(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Send employee details as a JSON object.';
  const fields = ['employee_id', 'name', 'email', 'phone', 'department', 'position', 'salary', 'status'];
  for (const field of fields) {
    if (input[field] === undefined || String(input[field]).trim() === '') {
      return `${field.replace('_', ' ')} is required.`;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email).trim())) return 'Enter a valid email address.';
  const salary = Number(input.salary);
  if (!Number.isFinite(salary) || salary < 0) return 'Salary must be a non-negative number.';
  if (!['Active', 'Inactive'].includes(input.status)) return 'Status must be Active or Inactive.';
  return null;
}

function employeeValues(input) {
  return [input.employee_id, input.name, input.email, input.phone, input.department, input.position]
    .map(value => String(value).trim())
    .concat(Number(input.salary), input.status);
}

function handleDatabaseError(error, res) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'That employee ID is already in use.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
}

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.adminId = admin.id;
  req.session.username = admin.username;
  return res.json({ message: 'Login successful.', username: admin.username });
});

app.get('/api/session', requireLogin, (req, res) => res.json({ username: req.session.username }));

app.post('/api/logout', (req, res) => {
  req.session.destroy(error => {
    if (error) return res.status(500).json({ error: 'Could not log out. Please try again.' });
    res.clearCookie('employee.sid', { httpOnly: true, sameSite: 'lax' });
    return res.json({ message: 'Logged out.' });
  });
});

app.get('/api/employees', requireLogin, (req, res) => {
  const search = `%${String(req.query.search || '').trim()}%`;
  const employees = db.prepare(`SELECT * FROM employees
    WHERE employee_id LIKE ? OR name LIKE ? OR department LIKE ? OR position LIKE ?
    ORDER BY id DESC`).all(search, search, search, search);
  return res.json(employees);
});

app.get('/api/employees/:id', requireLogin, (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(req.params.id));
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  return res.json(employee);
});

app.post('/api/employees', requireLogin, (req, res) => {
  const validationError = validateEmployee(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const result = db.prepare(`INSERT INTO employees
      (employee_id, name, email, phone, department, position, salary, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...employeeValues(req.body));
    return res.status(201).json({ message: 'Employee added.', id: result.lastInsertRowid });
  } catch (error) { return handleDatabaseError(error, res); }
});

app.put('/api/employees/:id', requireLogin, (req, res) => {
  const validationError = validateEmployee(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const result = db.prepare(`UPDATE employees SET employee_id = ?, name = ?, email = ?,
      phone = ?, department = ?, position = ?, salary = ?, status = ? WHERE id = ?`)
      .run(...employeeValues(req.body), Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Employee not found.' });
    return res.json({ message: 'Employee updated.' });
  } catch (error) { return handleDatabaseError(error, res); }
});

app.delete('/api/employees/:id', requireLogin, (req, res) => {
  const result = db.prepare('DELETE FROM employees WHERE id = ?').run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Employee not found.' });
  return res.json({ message: 'Employee deleted.' });
});

app.get('/api/dashboard', requireLogin, (req, res) => {
  const totals = db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) AS inactive,
    COUNT(DISTINCT department) AS departments FROM employees`).get();
  return res.json({ total: totals.total, active: totals.active || 0, inactive: totals.inactive || 0, departments: totals.departments });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

if (require.main === module) {
  app.listen(port, () => console.log(`Employee dashboard running at http://localhost:${port}`));
}
module.exports = app;
