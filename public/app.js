const loginPage = document.querySelector('#loginPage');
const mainPage = document.querySelector('#mainPage');
const loginForm = document.querySelector('#loginForm');
const employeeDialog = document.querySelector('#employeeDialog');
const employeeForm = document.querySelector('#employeeForm');
const fields = ['employee_id', 'name', 'email', 'phone', 'department', 'position', 'salary', 'status'];
let searchTimer;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2800);
}

function showDashboard(username) {
  loginPage.classList.add('hidden');
  mainPage.classList.remove('hidden');
  document.querySelector('#welcomeUser').textContent = username ? `Signed in as ${username}` : 'Signed in';
  refreshDashboard();
  loadEmployees();
}

async function checkSession() {
  try {
    const sessionInfo = await api('/api/session');
    showDashboard(sessionInfo.username);
  } catch {
    loginPage.classList.remove('hidden');
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const errorBox = document.querySelector('#loginError');
  errorBox.classList.add('hidden');
  try {
    const result = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.querySelector('#username').value,
        password: document.querySelector('#password').value
      })
    });
    showDashboard(result.username);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (error) {
    showToast(error.message);
    return;
  }
  mainPage.classList.add('hidden');
  loginPage.classList.remove('hidden');
  loginForm.reset();
});

document.querySelector('#addButton').addEventListener('click', () => openEmployeeDialog());
document.querySelector('#closeDialog').addEventListener('click', () => employeeDialog.close());
document.querySelector('#cancelButton').addEventListener('click', () => employeeDialog.close());
document.querySelector('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadEmployees, 250);
});

function openEmployeeDialog(employee = null) {
  employeeForm.reset();
  document.querySelector('#formError').classList.add('hidden');
  document.querySelector('#editId').value = employee?.id || '';
  document.querySelector('#dialogTitle').textContent = employee ? 'Edit employee' : 'Add employee';
  if (employee) {
    for (const field of fields) document.querySelector(`#${field}`).value = employee[field];
  }
  employeeDialog.showModal();
}

async function loadEmployees() {
  try {
    const search = document.querySelector('#search').value;
    const employees = await api(`/api/employees?search=${encodeURIComponent(search)}`);
    const table = document.querySelector('#employeeTable');
    table.replaceChildren();
    if (!employees.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td class="empty" colspan="6">No employees found. Add your first employee to get started.</td>';
      table.append(row);
      return;
    }
    for (const employee of employees) {
      const row = document.createElement('tr');
      const initials = employee.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      row.innerHTML = `
        <td><span class="avatar">${escapeHtml(initials)}</span>
          <div>${escapeHtml(employee.name)}</div>
          <div>${escapeHtml(employee.employee_id)} - ${escapeHtml(employee.email)}</div></td>
        <td>${escapeHtml(employee.department)}</td>
        <td>${escapeHtml(employee.position)}</td>
        <td>${formatSalary(employee.salary)}</td>
        <td><span class="badge ${employee.status === 'Active' ? 'active' : 'inactive'}">${escapeHtml(employee.status)}</span></td>
        <td><div class="row-actions"><button class="small-button edit" type="button">Edit</button>
          <button class="small-button delete" type="button">Delete</button></div></td>`;
      row.querySelector('.edit').addEventListener('click', () => openEmployeeDialog(employee));
      row.querySelector('.delete').addEventListener('click', () => deleteEmployee(employee.id, employee.name));
      table.append(row);
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshDashboard() {
  try {
    const stats = await api('/api/dashboard');
    for (const key of ['total', 'active', 'inactive', 'departments']) {
      document.querySelector(`#${key}`).textContent = stats[key];
    }
  } catch (error) {
    showToast(error.message);
  }
}

employeeForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#editId').value;
  const employee = {};
  for (const field of fields) employee[field] = document.querySelector(`#${field}`).value;
  try {
    const result = await api(id ? `/api/employees/${id}` : '/api/employees', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(employee)
    });
    employeeDialog.close();
    await Promise.all([loadEmployees(), refreshDashboard()]);
    showToast(result.message);
  } catch (error) {
    const errorBox = document.querySelector('#formError');
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  }
});

async function deleteEmployee(id, name) {
  if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
  try {
    const result = await api(`/api/employees/${id}`, { method: 'DELETE' });
    await Promise.all([loadEmployees(), refreshDashboard()]);
    showToast(result.message);
  } catch (error) {
    showToast(error.message);
  }
}

function formatSalary(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

checkSession();
