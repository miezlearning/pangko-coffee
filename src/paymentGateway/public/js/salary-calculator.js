// Salary Calculator Logic
// Supports two distribution modes:
// - per-employee: each employee has an individual percentage (must total <= 100)
// - per-role: roles (groups) have percentages and employees share equally within their role

let employees = [];
let groups = [];
let mode = 'per-role'; // 'per-role' | 'per-employee' | 'per-equal'

// Load employees from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    loadMode();
    loadGroups();
    loadEmployees();
    migrateEmployeesToDefaultRoleIfMissing();
    initModeUI();
    renderGroupsUI();
    renderEmployeesList();
    calculateSalaries();
});

// Load employees from localStorage
function loadEmployees() {
    const saved = localStorage.getItem('pangko_employees');
    if (saved) {
        try {
            employees = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load employees:', e);
            employees = [];
        }
    }
}

// Save employees to localStorage
function saveEmployees() {
    localStorage.setItem('pangko_employees', JSON.stringify(employees));
}

// Mode persistence
function loadMode() {
    const saved = localStorage.getItem('pangko_salary_mode');
    if (saved === 'per-employee' || saved === 'per-role') {
        mode = saved;
    }
}

function saveMode() {
    localStorage.setItem('pangko_salary_mode', mode);
}

function initModeUI() {
    const select = document.getElementById('mode-select');
    if (!select) return;
    // set current
    select.value = mode;
    select.addEventListener('change', () => {
        const val = select.value;
        if (val === 'per-role' || val === 'per-employee' || val === 'per-equal') {
            mode = val;
            saveMode();
            // Re-render everything to reflect mode change
            renderGroupsUI();
            renderEmployeesList();
            calculateSalaries();
            showToast(`✅ Mode diubah ke "${getModeLabel(val)}"`, 'success');
        }
    });
}

function getModeLabel(modeValue) {
    switch(modeValue) {
        case 'per-role': return 'Per Role (rata dalam role)';
        case 'per-employee': return 'Per Karyawan (persen individu)';
        case 'per-equal': return 'Rata per Individu (semua sama rata)';
        default: return modeValue;
    }
}

// Groups (roles) persistence and defaults
function loadGroups() {
    const saved = localStorage.getItem('pangko_groups');
    if (saved) {
        try {
            groups = JSON.parse(saved);
        } catch (e) {
            groups = getDefaultGroups();
        }
    } else {
        groups = getDefaultGroups();
    }
}

function saveGroups() {
    localStorage.setItem('pangko_groups', JSON.stringify(groups));
}

function getDefaultGroups() {
    // Default requested: CEO 70%, Karyawan Biasa 30%, Barista 0%
    return [
        { id: 'ceo', name: 'CEO', percentage: 70 },
        { id: 'barista', name: 'Barista', percentage: 0 },
        { id: 'staff', name: 'Karyawan Biasa', percentage: 30 },
    ];
}

function migrateEmployeesToDefaultRoleIfMissing() {
    // Assign default role 'staff' if roleId missing
    let changed = false;
    employees = employees.map(emp => {
        if (!emp.roleId) {
            changed = true;
            return { ...emp, roleId: 'staff' };
        }
        return emp;
    });
    if (changed) saveEmployees();
}

// Add new employee
function addEmployee() {
    const nameInput = document.getElementById('employee-name');
    const percentageInput = document.getElementById('employee-percentage');
    const roleSelect = document.getElementById('employee-role');
    
    const name = nameInput.value.trim();
    const percentage = parseFloat(percentageInput.value);
    const roleId = roleSelect ? roleSelect.value : 'staff';
    
    // Validation
    if (!name) {
        showToast('❌ Nama karyawan tidak boleh kosong', 'error');
        return;
    }
    
    if (mode === 'per-employee') {
        if (isNaN(percentage) || percentage <= 0) {
            showToast('❌ Persentase harus lebih dari 0', 'error');
            return;
        }
    }
    
    // Enforce total percentage <= 100 only for per-employee mode
    if (mode === 'per-employee') {
        const currentTotal = employees.reduce((sum, emp) => sum + emp.percentage, 0);
        const newTotal = currentTotal + percentage;
        if (newTotal > 100) {
            const remaining = Math.max(0, 100 - currentTotal);
            const sisaText = remaining % 1 === 0 ? remaining.toString() : remaining.toFixed(1);
            showToast(`⚠️ Total persentase akan melebihi 100% (sisa ${sisaText}%). Sesuaikan persentasenya.`, 'warning');
            return;
        }
    }
    
    // Check if name already exists
    if (employees.some(emp => emp.name.toLowerCase() === name.toLowerCase())) {
        showToast('❌ Karyawan dengan nama ini sudah ada', 'error');
        return;
    }
    
    // Add employee
    const employee = {
        id: Date.now(),
        name: name,
        percentage: mode === 'per-employee' ? percentage : 0,
        roleId
    };
    
    employees.push(employee);
    saveEmployees();
    
    // Clear inputs first
    nameInput.value = '';
    percentageInput.value = '';
    if (roleSelect) roleSelect.selectedIndex = 0;
    
    // Update UI
    renderEmployeesList();
    calculateSalaries();
    
    showToast(`✅ ${name} berhasil ditambahkan`, 'success');
}

// Remove employee
function removeEmployee(id) {
    const employee = employees.find(emp => emp.id === id);
    if (!employee) return;
    
    if (confirm(`Hapus ${employee.name} dari daftar?`)) {
        employees = employees.filter(emp => emp.id !== id);
        saveEmployees();
        renderEmployeesList();
        calculateSalaries();
        showToast(`🗑️ ${employee.name} dihapus`, 'info');
    }
}

// Clear all employees
function clearAllEmployees() {
    if (employees.length === 0) {
        showToast('⚠️ Daftar karyawan sudah kosong', 'warning');
        return;
    }
    
    if (confirm(`Hapus semua ${employees.length} karyawan?`)) {
        employees = [];
        saveEmployees();
        renderEmployeesList();
        calculateSalaries();
        showToast('🗑️ Semua karyawan dihapus', 'info');
    }
}

// Update employee percentage (inline edit)
function updateEmployeePercentage(id) {
    if (mode === 'per-role' || mode === 'per-equal') {
        showToast('ℹ️ Mode pembagian per-role aktif. Ubah persentase di bagian Role, bukan per karyawan.', 'info');
        renderEmployeesList();
        return;
    }
    const input = document.getElementById(`percentage-${id}`);
    const newPercentage = parseFloat(input.value);
    
    if (isNaN(newPercentage) || newPercentage <= 0) {
        showToast('❌ Persentase tidak valid', 'error');
        renderEmployeesList(); // Reset to original value
        return;
    }
    
    const employee = employees.find(emp => emp.id === id);
    if (employee) {
        const oldPercentage = employee.percentage;
        // Enforce total percentage <= 100 when editing inline
        const currentTotal = employees.reduce((sum, emp) => sum + emp.percentage, 0);
        const prospectiveTotal = currentTotal - oldPercentage + newPercentage;
        if (prospectiveTotal > 100) {
            const remaining = Math.max(0, 100 - (currentTotal - oldPercentage));
            const sisaText = remaining % 1 === 0 ? remaining.toString() : remaining.toFixed(1);
            showToast(`⚠️ Tidak bisa melebihi 100%. Sisa yang tersedia: ${sisaText}%`, 'warning');
            // Revert input to old value to reflect unchanged state
            input.value = oldPercentage;
            return;
        }

        employee.percentage = newPercentage;
        saveEmployees();
        
        // Only re-render and recalculate if value actually changed
        if (oldPercentage !== newPercentage) {
            renderEmployeesList();
            calculateSalaries();
            showToast(`✅ Persentase ${employee.name} diupdate`, 'success');
        }
    }
}

// Render employees list
function renderEmployeesList() {
    const container = document.getElementById('employees-list');
    if (!container) return;

    if (employees.length === 0) {
        // Render empty state markup directly to avoid null references
        container.innerHTML = `
            <div id="empty-state" class="rounded-2xl border border-dashed border-charcoal/20 bg-charcoal/5 px-6 py-10 text-center">
                <div class="text-4xl">👥</div>
                <p class="mt-3 font-semibold text-charcoal/60">Belum ada karyawan</p>
                <p class="mt-1 text-sm text-charcoal/50">Tambahkan karyawan menggunakan form di atas</p>
            </div>
        `;
        return;
    }

    const totalEmployees = employees.length || 1;
    container.innerHTML = employees.map(emp => {
        const salary = calculateEmployeeSalary(emp);
        const role = groups.find(g => g.id === emp.roleId);
        const members = role ? countGroupMembers(role.id) : 0;
        let perPersonPct = 0;
        if (mode === 'per-employee') {
            perPersonPct = emp.percentage || 0;
        } else if (mode === 'per-role' && role && members > 0) {
            perPersonPct = Number(role.percentage || 0) / members;
        } else if (mode === 'per-equal') {
            perPersonPct = 100 / totalEmployees;
        }
        return `
            <div class="group rounded-2xl border border-charcoal/10 bg-white p-4 transition hover:border-matcha/30 hover:shadow-md">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <h3 class="text-lg font-bold text-charcoal">${emp.name}</h3>
                        ${mode === 'per-employee' ? 
                            '<div class="mt-2 flex items-center gap-3">' +
                            '<div class="flex items-center gap-2">' +
                            '<label class="text-xs font-semibold text-charcoal/50">Persentase:</label>' +
                            '<input type="number" id="percentage-' + emp.id + '" value="' + emp.percentage + '" ' +
                            'min="0" max="100" step="0.1" ' +
                            'class="w-20 rounded-lg border border-charcoal/10 bg-white px-2 py-1 text-sm font-semibold text-matcha outline-none ring-matcha/30 focus:ring-2" ' +
                            'onchange="updateEmployeePercentage(' + emp.id + ')" />' +
                            '<span class="text-sm font-bold text-matcha">%</span>' +
                            '</div></div>'
                            : 
                            '<div class="mt-2 flex flex-wrap items-center gap-2">' +
                            (mode === 'per-role' ? 
                                '<div class="inline-flex items-center gap-2 rounded-lg border border-charcoal/10 bg-charcoal/5 px-2 py-1 text-xs font-semibold text-charcoal/70">' +
                                '<span>Role:</span>' +
                                '<span class="rounded-md bg-white px-2 py-[2px] text-charcoal">' + (role ? role.name : '–') + '</span>' +
                                '</div>'
                                : '') +
                            '<div class="inline-flex items-center gap-2 rounded-lg border border-matcha/20 bg-matcha/5 px-2 py-1 text-xs font-semibold text-matcha">' +
                            '<span>Persen Individu:</span>' +
                            '<span class="rounded-md bg-white px-2 py-[2px]">' + perPersonPct.toFixed(2) + '%</span>' +
                            '</div></div>'
                        }
                    </div>
                    <div class="text-right">
                        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-charcoal/50">Gaji</p>
                        <p class="mt-1 text-2xl font-extrabold text-matcha">${formatRupiah(salary)}</p>
                        <button 
                            onclick="removeEmployee(${emp.id})" 
                            class="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                            🗑️ Hapus
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Calculate salary for an employee based on percentage
function calculateEmployeeSalary(emp) {
    const revenueInput = document.getElementById('revenue-input');
    const revenue = parseFloat(revenueInput.value) || 0;
    if (mode === 'per-employee') {
        const p = typeof emp === 'object' ? emp.percentage : emp;
        return (revenue * p) / 100;
    }
    if (mode === 'per-equal') {
        const count = employees.length || 1;
        return revenue / count;
    }
    // per-role equal split
    const role = groups.find(g => g.id === emp.roleId);
    if (!role) return 0;
    const groupMembers = employees.filter(e => e.roleId === role.id).length;
    if (groupMembers === 0) return 0;
    const groupBudget = (revenue * role.percentage) / 100;
    return groupBudget / groupMembers;
}

// Calculate all salaries and update summary
function calculateSalaries() {
    const revenueInput = document.getElementById('revenue-input');
    const revenue = parseFloat(revenueInput.value) || 0;
    
    let totalPercentage, totalDistributed, remainingPercentage;
    if (mode === 'per-employee') {
        totalPercentage = employees.reduce((sum, emp) => sum + emp.percentage, 0);
        totalDistributed = (revenue * totalPercentage) / 100;
        remainingPercentage = 100 - totalPercentage;
    } else if (mode === 'per-role') {
        totalPercentage = groups.reduce((sum, g) => sum + g.percentage, 0);
        // actual distributed is sum of each employee's salary (groups with zero members don't distribute)
        const totalDistributedByEmp = employees.reduce((sum, emp) => sum + calculateEmployeeSalary(emp), 0);
        totalDistributed = totalDistributedByEmp;
        remainingPercentage = Math.max(0, 100 - totalPercentage);
    } else { // per-equal
        totalPercentage = employees.length > 0 ? 100 : 0;
        totalDistributed = employees.length > 0 ? revenue : 0;
        remainingPercentage = employees.length > 0 ? 0 : 100;
    }
    const remaining = revenue - totalDistributed;
    
    // Update summary
    document.getElementById('summary-revenue').textContent = formatRupiah(revenue);
    document.getElementById('summary-distributed').textContent = formatRupiah(totalDistributed);
    document.getElementById('summary-percentage').textContent = totalPercentage.toFixed(1);
    document.getElementById('summary-remaining').textContent = formatRupiah(remaining);
    document.getElementById('summary-remaining-percentage').textContent = remainingPercentage.toFixed(1);
    document.getElementById('summary-employee-count').textContent = employees.length;
    
    // Show warning if total percentage > 100%
    const warning = document.getElementById('percentage-warning');
    const totalEl = document.getElementById('current-total-percentage');
    if (warning && totalEl) {
        if (mode !== 'per-equal' && totalPercentage > 100) {
            warning.classList.remove('hidden');
            totalEl.textContent = totalPercentage.toFixed(1);
        } else {
            warning.classList.add('hidden');
        }
    }
}

// Export summary to text
function exportSummary() {
    const revenueInput = document.getElementById('revenue-input');
    const revenue = parseFloat(revenueInput.value) || 0;
    
    if (employees.length === 0) {
        showToast('⚠️ Tidak ada data untuk di-export', 'warning');
        return;
    }
    
    const totalPercentage = mode === 'per-employee' 
        ? employees.reduce((sum, emp) => sum + emp.percentage, 0)
        : (mode === 'per-role' 
            ? groups.reduce((sum, g) => sum + g.percentage, 0)
            : (employees.length > 0 ? 100 : 0));
    const totalDistributed = mode === 'per-employee'
        ? (revenue * totalPercentage) / 100
        : (mode === 'per-role'
            ? employees.reduce((sum, emp) => sum + calculateEmployeeSalary(emp), 0)
            : (employees.length > 0 ? revenue : 0));
    const remaining = revenue - totalDistributed;
    
    let text = '═══════════════════════════════════════\n';
    text += '       PEMBAGIAN GAJI KARYAWAN\n';
    text += '           PANGKO COFFEE\n';
    text += '═══════════════════════════════════════\n\n';
    text += `Tanggal: ${new Date().toLocaleDateString('id-ID', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    })}\n\n`;
    
    text += '───────────────────────────────────────\n';
    text += 'PENDAPATAN\n';
    text += '───────────────────────────────────────\n';
    text += `Total Pendapatan Bersih: ${formatRupiah(revenue)}\n\n`;
    
    text += '───────────────────────────────────────\n';
    text += 'DETAIL PEMBAGIAN GAJI\n';
    text += '───────────────────────────────────────\n';
    if (mode === 'per-role') {
        text += '\nMODE: PER ROLE (pembagian rata per role)\n';
        groups.forEach(g => {
            text += `- ${g.name}: ${g.percentage}%` + '\n';
        });
        text += '\n';
    } else if (mode === 'per-employee') {
        text += '\nMODE: PER KARYAWAN (persentase individu)\n\n';
    } else {
        text += '\nMODE: RATA PER INDIVIDU (setiap karyawan sama rata)\n\n';
    }
    
    employees.forEach((emp, index) => {
        const salary = calculateEmployeeSalary(emp);
        const role = groups.find(g => g.id === emp.roleId);
        const members = role ? countGroupMembers(role?.id) : 0;
        const perPersonPct = (mode === 'per-role' && role && members > 0)
            ? (Number(role.percentage || 0) / members)
            : 0;
        text += `\n${index + 1}. ${emp.name}\n`;
        if (mode === 'per-employee') {
            text += `   Persentase: ${emp.percentage}%\n`;
        } else if (mode === 'per-role') {
            text += `   Role: ${role ? role.name : '-'}\n`;
            text += `   Persentase Individu: ${perPersonPct.toFixed(2)}%\n`;
        } else {
            const equalPct = employees.length > 0 ? (100 / employees.length) : 0;
            text += `   Persentase Individu: ${equalPct.toFixed(2)}%\n`;
        }
        text += `   Gaji: ${formatRupiah(salary)}\n`;
    });
    
    text += '\n───────────────────────────────────────\n';
    text += 'RINGKASAN\n';
    text += '───────────────────────────────────────\n';
    text += `Total Karyawan: ${employees.length} orang\n`;
    text += `Total Persentase: ${totalPercentage.toFixed(1)}%\n`;
    text += `Total Dibagikan: ${formatRupiah(totalDistributed)}\n`;
    text += `Sisa: ${formatRupiah(remaining)} (${(100 - totalPercentage).toFixed(1)}%)\n\n`;
    
    if (totalPercentage > 100) {
        text += '⚠️ PERHATIAN: Total persentase melebihi 100%!\n\n';
    }
    
    text += '═══════════════════════════════════════\n';
    text += 'Generated by Pangko Coffee Dashboard\n';
    text += '═══════════════════════════════════════\n';
    
    // Create downloadable file
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pembagian-gaji-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('📄 File berhasil di-download', 'success');
}

// Format number to Rupiah
function formatRupiah(number) {
    const n = isNaN(number) ? 0 : Math.round(number);
    // Use locale formatting to avoid corrupting decimals
    return 'Rp ' + n.toLocaleString('id-ID');
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    // Set message
    toastMessage.textContent = message;
    
    // Show toast
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('opacity-0');
    }, 3000);
    
    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove('opacity-0');
    }, 3500);
}

// Allow Enter key to add employee
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('employee-name');
    const percentageInput = document.getElementById('employee-percentage');
    
    [nameInput, percentageInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addEmployee();
            }
        });
    });
});

// ===== Roles (Groups) UI and Handlers =====
function renderGroupsUI() {
    const container = document.getElementById('roles-container');
    if (!container) return;

    // If mode is not per-role, show info and return
    if (mode !== 'per-role') {
        container.innerHTML = `
            <div class="rounded-2xl border border-dashed border-charcoal/20 bg-charcoal/5 px-4 py-3 text-sm text-charcoal/70">
                Mode saat ini bukan "Per Role". Role tidak mempengaruhi pembagian di mode ini.
            </div>
        `;
        // Update totals display to reflect current groups sum even if not used
        const total = groups.reduce((s, g) => s + Number(g.percentage || 0), 0);
        const remaining = Math.max(0, 100 - total);
        const totalEl = document.getElementById('roles-total');
        const remainEl = document.getElementById('roles-remaining');
        if (totalEl) totalEl.textContent = `${total.toFixed(1)}%`;
        if (remainEl) remainEl.textContent = `${remaining.toFixed(1)}%`;

        // Update percentage input for non-per-role modes
        const percInput = document.getElementById('employee-percentage');
        if (percInput) {
            if (mode === 'per-employee') {
                percInput.removeAttribute('disabled');
                percInput.placeholder = '30';
                percInput.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                percInput.setAttribute('disabled', 'disabled');
                percInput.placeholder = mode === 'per-equal' ? 'Auto (semua rata)' : 'Auto (mode per role)';
                percInput.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }

        // Keep role select updated
        const roleSelect = document.getElementById('employee-role');
        if (roleSelect) {
            roleSelect.innerHTML = groups.map(g => '<option value="' + g.id + '">' + g.name + '</option>').join('');
        }
        return;
    }

    // Build rows for each group
    container.innerHTML = groups.map(g => `
        <div class="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-charcoal/10 bg-white/80 p-3">
            <div class="flex items-center gap-3">
                <input type="text" value="${g.name}" 
                    class="w-[200px] rounded-xl border border-charcoal/10 bg-white px-3 py-2 text-sm font-semibold text-charcoal outline-none ring-matcha/30 focus:ring-2"
                    onchange="updateRoleName('${g.id}', this.value)" />
                <div class="flex items-center gap-2">
                    <label class="text-xs font-semibold text-charcoal/50">Persentase:</label>
                    <input type="number" min="0" max="100" step="0.1" value="${g.percentage}" 
                        class="w-24 rounded-lg border border-charcoal/10 bg-white px-2 py-1 text-sm font-semibold text-matcha outline-none ring-matcha/30 focus:ring-2"
                        onchange="updateGroupPercentage('${g.id}', this.value)" />
                    <span class="text-sm font-bold text-matcha">%</span>
                </div>
            </div>
            <div class="text-xs text-charcoal/60">${countGroupMembers(g.id)} anggota</div>
            <button class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                onclick="deleteRole('${g.id}')">Hapus</button>
        </div>
    `).join('') + `
        <div class="mt-3 grid grid-cols-[1fr_auto_auto_auto] items-end gap-3 rounded-2xl border border-dashed border-charcoal/20 bg-charcoal/5 p-3">
            <input id="new-role-name" type="text" placeholder="Nama role (misal: Supervisor)" 
                class="rounded-xl border border-charcoal/10 bg-white px-3 py-2 text-sm outline-none ring-matcha/30 focus:ring-2" />
            <div class="flex items-center gap-2">
                <label class="text-xs font-semibold text-charcoal/50">Persentase:</label>
                <input id="new-role-percentage" type="number" min="0" max="100" step="0.1" placeholder="0" 
                    class="w-24 rounded-lg border border-charcoal/10 bg-white px-2 py-1 text-sm outline-none ring-matcha/30 focus:ring-2" />
                <span class="text-sm font-bold text-matcha">%</span>
            </div>
            <button class="rounded-xl border border-matcha/30 bg-white px-4 py-2 text-sm font-semibold text-matcha hover:bg-matcha hover:text-white"
                onclick="addRole()">➕ Tambah Role</button>
        </div>
    `;

    // Update totals display
    const total = groups.reduce((s, g) => s + Number(g.percentage || 0), 0);
    const remaining = Math.max(0, 100 - total);
    const totalEl = document.getElementById('roles-total');
    const remainEl = document.getElementById('roles-remaining');
    if (totalEl) totalEl.textContent = `${total.toFixed(1)}%`;
    if (remainEl) remainEl.textContent = `${remaining.toFixed(1)}%`;

    // Update per-employee percentage input in Add form based on mode
    const percInput = document.getElementById('employee-percentage');
    if (percInput) {
        if (mode === 'per-employee') {
            // Only enable for per-employee mode
            percInput.removeAttribute('disabled');
            percInput.placeholder = '30';
            percInput.classList.remove('opacity-50', 'cursor-not-allowed');
        } else if (mode === 'per-role') {
            percInput.setAttribute('disabled', 'disabled');
            percInput.placeholder = 'Auto (mode per role)';
            percInput.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            // per-equal
            percInput.setAttribute('disabled', 'disabled');
            percInput.placeholder = 'Auto (semua rata)';
            percInput.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
    // Update Add Employee role select options dynamically
    const roleSelect = document.getElementById('employee-role');
    if (roleSelect) {
        roleSelect.innerHTML = groups.map(g => '<option value="' + g.id + '">' + g.name + '</option>').join('');
    }
}

function updateGroupPercentage(id, value) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
        showToast('❌ Persentase role tidak valid', 'error');
        renderGroupsUI();
        return;
    }
    const idx = groups.findIndex(g => g.id === id);
    if (idx === -1) return;

    // Enforce sum <= 100
    const currentTotalExcluding = groups.reduce((s, g, i) => s + (i === idx ? 0 : Number(g.percentage || 0)), 0);
    const prospectiveTotal = currentTotalExcluding + num;
    if (prospectiveTotal > 100) {
        const remaining = Math.max(0, 100 - currentTotalExcluding);
        showToast('⚠️ Tidak bisa melebihi 100%. Sisa yang tersedia: ' + remaining.toFixed(1) + '%', 'warning');
        renderGroupsUI();
        return;
    }
    groups[idx].percentage = num;
    saveGroups();
    renderGroupsUI();
    renderEmployeesList();
    calculateSalaries();
}

function updateRoleName(id, value) {
    const name = (value || '').trim();
    if (!name) {
        showToast('❌ Nama role tidak boleh kosong', 'error');
        renderGroupsUI();
        return;
    }
    const g = groups.find(gr => gr.id === id);
    if (!g) return;
    g.name = name;
    saveGroups();
    renderGroupsUI();
    renderEmployeesList();
}

function slugify(text) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/\-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function addRole() {
    const nameInput = document.getElementById('new-role-name');
    const percInput = document.getElementById('new-role-percentage');
    if (!nameInput || !percInput) return;
    const name = nameInput.value.trim();
    const percentage = parseFloat(percInput.value);
    if (!name) {
        showToast('❌ Nama role tidak boleh kosong', 'error');
        return;
    }
    if (isNaN(percentage) || percentage < 0) {
        showToast('❌ Persentase role tidak valid', 'error');
        return;
    }
    const currentTotal = groups.reduce((s, g) => s + Number(g.percentage || 0), 0);
    if (currentTotal + percentage > 100) {
        const remaining = Math.max(0, 100 - currentTotal);
        showToast(`⚠️ Tidak bisa melebihi 100%. Sisa tersedia: ${remaining.toFixed(1)}%`, 'warning');
        return;
    }
    let id = slugify(name);
    if (!id) id = `role-${Date.now()}`;
    if (groups.some(g => g.id === id)) {
        id = `${id}-${Date.now().toString().slice(-4)}`;
    }
    groups.push({ id, name, percentage });
    saveGroups();
    nameInput.value = '';
    percInput.value = '';
    renderGroupsUI();
    renderEmployeesList();
    calculateSalaries();
    showToast(`✅ Role "${name}" ditambahkan`, 'success');
}

function deleteRole(id) {
    if (groups.length <= 1) {
        showToast('⚠️ Minimal harus ada 1 role.', 'warning');
        return;
    }
    const g = groups.find(gr => gr.id === id);
    if (!g) return;
    if (!confirm(`Hapus role "${g.name}"? Anggota akan dipindahkan ke role lain.`)) return;
    // Choose fallback role
    const fallback = groups.find(gr => gr.id !== id) || groups[0];
    // Reassign employees
    let changed = false;
    employees = employees.map(emp => {
        if (emp.roleId === id) { changed = true; return { ...emp, roleId: fallback.id }; }
        return emp;
    });
    if (changed) saveEmployees();
    groups = groups.filter(gr => gr.id !== id);
    saveGroups();
    renderGroupsUI();
    renderEmployeesList();
    calculateSalaries();
    showToast(`🗑️ Role "${g.name}" dihapus`, 'info');
}

function countGroupMembers(roleId) {
    return employees.filter(emp => emp.roleId === roleId).length;
}
