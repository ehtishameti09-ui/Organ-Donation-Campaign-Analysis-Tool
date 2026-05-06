import { useState, useEffect, useMemo } from 'react';
import { getEmployees, addEmployee, updateEmployee, toggleEmployeeStatus, getApprovedHospitals } from '../utils/auth';
import { toast } from '../utils/toast';

const formatPKPhone = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('92')) {
    const rest = digits.slice(2, 12);
    if (rest.length <= 3) return `+92 ${rest}`;
    return `+92 ${rest.slice(0, 3)} ${rest.slice(3)}`;
  }
  const local = digits.slice(0, 11);
  if (local.length <= 4) return local;
  return `${local.slice(0, 4)}-${local.slice(4)}`;
};

const ROLES = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'data_entry', label: 'Data Entry Operator' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'admin', label: 'Admin' },
];

const EmployeeManagement = ({ currentUser }) => {
  const [employees, setEmployees] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    name: '', email: '', role: 'doctor', department: '', phone: '', specialization: '', password: '',
    hospitalId: '', hospitalName: '',
  });

  useEffect(() => {
    refresh();
    getApprovedHospitals().then(all => {
      if (currentUser?.linkedHospitalId) {
        setHospitals(all.filter(h => h.id === currentUser.linkedHospitalId));
      } else {
        setHospitals(all);
      }
    }).catch(() => {});
  }, []);

  const refresh = async () => {
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch {}
  };

  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (search && !e.name?.toLowerCase().includes(search.toLowerCase()) && !e.email?.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter !== 'all' && e.role !== roleFilter) return false;
      if (statusFilter === 'approved' && (e.banned || e.status !== 'approved')) return false;
      if (statusFilter === 'suspended' && !e.banned) return false;
      if (currentUser?.role === 'admin' && currentUser?.linkedHospitalId) {
        if (e.linkedHospitalId != currentUser.linkedHospitalId) return false;
      }
      return true;
    });
  }, [employees, search, roleFilter, statusFilter, currentUser]);

  const resetForm = () => {
    const ownHospital = currentUser?.linkedHospitalId
      ? hospitals.find(h => h.id === currentUser.linkedHospitalId)
      : null;
    setFormData({
      name: '', email: '', role: 'doctor', department: '', phone: '',
      specialization: '', password: '',
      hospitalId: ownHospital?.id || '',
      hospitalName: ownHospital?.hospitalName || ownHospital?.name || '',
    });
    setEditingEmployee(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toast('Name and email are required.', 'error'); return;
    }
    if (!formData.phone.trim()) {
      toast('Phone number is required.', 'error'); return;
    }
    if (formData.phone.replace(/\D/g, '').length < 10) {
      toast('Please enter a valid phone number (e.g. 0302-5191070).', 'error'); return;
    }

    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, {
          name: formData.name,
          department: formData.department,
          phone: formData.phone,
          specialization: formData.specialization,
          role: formData.role,
          hospitalId: formData.hospitalId,
          hospitalName: formData.hospitalName,
        }, currentUser.id);
        toast('Employee updated successfully.', 'success');
      } else {
        await addEmployee({
          ...formData,
          password: formData.password || 'Temp@1234',
        }, currentUser.id);
        toast('Employee added successfully.', 'success');
      }
      await refresh();
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleToggleStatus = async (emp) => {
    try {
      await toggleEmployeeStatus(emp.id, currentUser.id);
      const action = emp.banned ? 'activated' : 'suspended';
      const msg = emp.banned
        ? `${emp.name}'s account has been activated.`
        : `${emp.name}'s account has been suspended.`;
      toast(msg, emp.banned ? 'success' : 'warning');
      await refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const openEdit = (emp) => {
    setEditingEmployee(emp);
    const linkedHosp = hospitals.find(h => h.id == emp.linkedHospitalId);
    setFormData({
      name: emp.name,
      email: emp.email,
      role: emp.role,
      department: emp.department || '',
      phone: emp.phone || '',
      specialization: emp.specialization || '',
      password: '',
      hospitalId: emp.linkedHospitalId || '',
      hospitalName: linkedHosp?.hospitalName || linkedHosp?.name || '',
    });
    setShowAddModal(true);
  };

  const getRoleBadge = (role) => {
    const map = {
      doctor: { bg: 'var(--primary-light)', color: 'var(--primary)', label: 'Doctor' },
      data_entry: { bg: '#f3f0ff', color: '#7c5cbf', label: 'Data Entry' },
      auditor: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Auditor' },
      admin: { bg: 'var(--danger-light)', color: 'var(--danger)', label: 'Admin' },
    };
    const m = map[role] || { bg: 'var(--surface3)', color: 'var(--text2)', label: role };
    return <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '600', background: m.bg, color: m.color }}>{m.label}</span>;
  };

  const getStatusBadge = (status, banned) => {
    if (banned) return <span className="badge badge-amber">Suspended</span>;
    if (status === 'approved') return <span className="badge badge-green">Active</span>;
    if (status === 'banned') return <span className="badge badge-amber">Suspended</span>;
    return <span className="badge badge-gray">{status}</span>;
  };

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => !e.banned && e.status === 'approved').length,
    suspended: employees.filter(e => e.banned).length,
    doctors: employees.filter(e => e.role === 'doctor').length,
  }), [employees]);

  return (
    <div>
      {/* Stats */}
      <div className="grid4" style={{ marginBottom: '24px' }}>
        {[
          { label: 'Total Employees', value: stats.total, color: 'var(--primary)', bg: 'var(--primary-light)' },
          { label: 'Active', value: stats.active, color: 'var(--accent)', bg: 'var(--accent-light)' },
          { label: 'Suspended', value: stats.suspended, color: 'var(--warning)', bg: 'var(--warning-light)' },
          { label: 'Doctors', value: stats.doctors, color: '#7c5cbf', bg: '#f3f0ff' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '16px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select className="form-input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width: '160px' }}>
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '140px' }}>
          <option value="all">All Status</option>
          <option value="approved">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowAddModal(true); }}>
          + Add Employee
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
              {['Name', 'Email', 'Role', 'Department', 'Assigned Hospital', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>No employees found.</td></tr>
            )}
            {filtered.map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
                      {emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{emp.name}</div>
                      {emp.specialization && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{emp.specialization}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text2)' }}>{emp.email}</td>
                <td style={{ padding: '12px 16px' }}>{getRoleBadge(emp.role)}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text2)' }}>{emp.department || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text2)' }}>
                  {emp.linkedHospitalId
                    ? (hospitals.find(h => h.id == emp.linkedHospitalId)?.hospitalName || `Hospital #${emp.linkedHospitalId}`)
                    : '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>{getStatusBadge(emp.status, emp.banned)}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(emp)}>Edit</button>
                    <button
                      className="btn btn-sm"
                      style={{ background: emp.banned ? 'var(--accent-light)' : 'var(--warning-light)', color: emp.banned ? 'var(--accent)' : 'var(--warning)', border: 'none' }}
                      onClick={() => handleToggleStatus(emp)}
                    >
                      {emp.banned ? 'Activate' : 'Suspend'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setShowAddModal(false); resetForm(); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px', color: 'var(--text1)' }}>
              {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>
              {editingEmployee ? 'Update employee information.' : 'Fill in the details to add a new team member.'}
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Employee name" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-input" type="email" value={formData.email} disabled={!!editingEmployee}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="employee@email.com" required />
              </div>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-input" value={formData.role}
                    onChange={e => setFormData(p => ({ ...p, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input className="form-input" value={formData.department}
                    onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} placeholder="e.g. Nephrology" />
                </div>
              </div>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Phone *</label>
                  <input className="form-input" type="tel" value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: formatPKPhone(e.target.value) }))}
                    placeholder="03XX-XXXXXXX" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Specialization</label>
                  <input className="form-input" value={formData.specialization}
                    onChange={e => setFormData(p => ({ ...p, specialization: e.target.value }))} placeholder="e.g. Kidney Transplant" />
                </div>
              </div>
              {hospitals.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Assigned Hospital</label>
                  {currentUser?.linkedHospitalId ? (
                    <input className="form-input" value={formData.hospitalName} readOnly
                      style={{ background: 'var(--bg2)', color: 'var(--text2)', cursor: 'not-allowed' }} />
                  ) : (
                    <select className="form-input" value={formData.hospitalId}
                      onChange={e => {
                        const h = hospitals.find(h => h.id == e.target.value);
                        setFormData(p => ({ ...p, hospitalId: e.target.value, hospitalName: h ? (h.hospitalName || h.name) : '' }));
                      }}>
                      <option value="">— None —</option>
                      {hospitals.map(h => <option key={h.id} value={h.id}>{h.hospitalName || h.name}</option>)}
                    </select>
                  )}
                </div>
              )}
              {!editingEmployee && (
                <div className="form-group">
                  <label className="form-label">Initial Password</label>
                  <input className="form-input" type="password" autoComplete="new-password" value={formData.password}
                    onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} placeholder="Leave blank for Temp@1234" />
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingEmployee ? 'Save Changes' : 'Add Employee'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowAddModal(false); resetForm(); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;
