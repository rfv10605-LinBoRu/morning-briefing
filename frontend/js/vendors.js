async function submitVendor() {
  const name = document.getElementById('vendorName').value;
  const taxId = document.getElementById('taxId').value;
  const contactPerson = document.getElementById('contactPerson').value;
  const phone = document.getElementById('phone').value;
  const address = document.getElementById('address').value;
  const category = document.getElementById('category').value; // ✅ 新增

  const res = await fetch('http://localhost:3000/api/vendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, taxId, contactPerson, phone, address, category })
  });

  const result = await res.json();
  document.getElementById('result').textContent = result.success ? '廠商已建立 ✅' : '建立失敗 ❌';
  if (result.success) loadVendors();
}

async function loadVendors() {
  const res = await fetch('http://localhost:3000/api/vendors');
  const vendors = await res.json();

  const tbody = document.querySelector('#vendorsTable tbody');
  tbody.innerHTML = '';
  for (const v of vendors) {
    const resContracts = await fetch(`http://localhost:3000/api/vendors/${v.id}/contracts`);
    const contracts = await resContracts.json();

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${v.name}</td>
      <td>${v.taxId}</td>
      <td>${v.contactPerson}</td>
      <td>${v.phone}</td>
      <td>${v.address}</td>
      <td>${v.category || ''}</td> <!-- ✅ 顯示分類 -->
      <td>${contracts.length}</td>
      <td>
        <button onclick="showVendorContracts(${v.id})">查看合約</button>
        <button onclick="openEditModal(${v.id})">編輯</button> <!-- ✅ 編輯 -->
        <button class="delete-btn" onclick="deleteVendor(${v.id})">刪除</button>
      </td>
    `;
    tbody.appendChild(row);
  }
}

async function deleteVendor(id) {
  if (!confirm('確定要刪除這個廠商嗎？')) return;

  const res = await fetch(`http://localhost:3000/api/vendors/${id}`, { method: 'DELETE' });
  const result = await res.json();
  if (result.success) loadVendors();
}

async function showVendorContracts(vendorId) {
  const res = await fetch(`http://localhost:3000/api/vendors/${vendorId}/contracts`);
  const contracts = await res.json();

  const tbody = document.querySelector('#vendorContractsTable tbody');
  tbody.innerHTML = '';
  contracts.forEach(c => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${c.buildingCode} - ${c.buildingName}</td>
      <td>${c.type}</td>
      <td>${c.itemName}</td>
      <td>$${c.amount}</td>
      <td>${c.startDate} ~ ${c.endDate}</td>
    `;
    tbody.appendChild(row);
  });
}

let editingVendorId = null;

function openEditModal(id) {
  editingVendorId = id;
  fetch(`http://localhost:3000/api/vendors/${id}`)
    .then(res => res.json())
    .then(v => {
      document.getElementById('editVendorName').value = v.name;
      document.getElementById('editTaxId').value = v.taxId;
      document.getElementById('editContactPerson').value = v.contactPerson;
      document.getElementById('editPhone').value = v.phone;
      document.getElementById('editAddress').value = v.address;
      document.getElementById('editCategory').value = v.category || '';
      document.getElementById('editModal').style.display = 'block';
    });
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

async function saveVendorEdit() {
  const name = document.getElementById('editVendorName').value;
  const taxId = document.getElementById('editTaxId').value;
  const contactPerson = document.getElementById('editContactPerson').value;
  const phone = document.getElementById('editPhone').value;
  const address = document.getElementById('editAddress').value;
  const category = document.getElementById('editCategory').value;

  const res = await fetch(`http://localhost:3000/api/vendors/${editingVendorId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, taxId, contactPerson, phone, address, category })
  });

  const result = await res.json();
  if (result.success) {
    closeEditModal();
    loadVendors();
  } else {
    alert('更新失敗');
  }
}
// 初始化
loadVendors();