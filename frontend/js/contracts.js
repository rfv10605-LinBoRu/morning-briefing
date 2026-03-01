let allItems = [];
let allVendors = [];

async function loadItems() {
  const res = await fetch('http://localhost:3000/api/items');
  allItems = await res.json();
}

async function loadVendors() {
  const res = await fetch('http://localhost:3000/api/vendors');
  allVendors = await res.json();

  const vendorSelect = document.getElementById('vendor');
  vendorSelect.innerHTML = '';
  allVendors.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.name} (${v.taxId})`;
    vendorSelect.appendChild(opt);
  });
}

function loadItemNames() {
  const type = document.getElementById('type').value;
  const itemSelect = document.getElementById('itemName');
  itemSelect.innerHTML = '';

  const filtered = allItems.filter(i => i.type === type);
  filtered.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i.id;
    opt.textContent = i.name;
    itemSelect.appendChild(opt);
  });
}

async function loadBuildings() {
  const res = await fetch('http://localhost:3000/api/buildings');
  const buildings = await res.json();
  const select = document.getElementById('building');
  buildings.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `${b.code} - ${b.name}`;
    select.appendChild(opt);
  });

  select.addEventListener('change', showBuildingCost);
}

async function showBuildingCost() {
  const buildingId = document.getElementById('building').value;
  if (!buildingId) return;

  const res = await fetch(`http://localhost:3000/api/buildings/${buildingId}`);
  const building = await res.json();

  let subtotal = 0;
  building.items.forEach(i => {
    subtotal += i.unitPrice * i.quantity;
  });
  const total = subtotal * 1.10 * 1.05;

  document.getElementById('costInfo').innerHTML = `
    未稅未管銷：$${subtotal.toFixed(0)}<br>
    含稅含管銷：$${total.toFixed(0)}
  `;
}

async function submitContract() {
  const buildingId = document.getElementById('building').value;
  const type = document.getElementById('type').value;
  const itemId = document.getElementById('itemName').value;
  const vendorId = document.getElementById('vendor').value;
  const isOutsourced = document.getElementById('isOutsourced').value === 'true';
  const amount = parseFloat(document.getElementById('amount').value);
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  const res = await fetch('http://localhost:3000/api/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buildingId, type, itemId, vendorId, isOutsourced, amount, startDate, endDate })
  });

  const result = await res.json();
  document.getElementById('result').textContent = result.success ? '合約已建立 ✅' : '合約建立失敗 ❌';
  if (result.success) loadContracts();
}

async function loadContracts() {
  const res = await fetch('http://localhost:3000/api/contracts');
  const contracts = await res.json();

  const tbody = document.querySelector('#contractsTable tbody');
  tbody.innerHTML = '';
  contracts.forEach(c => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${c.buildingCode} - ${c.buildingName}</td>
      <td>${c.type} - ${c.itemName}</td>
      <td>${c.isOutsourced ? '外包' : '自派'}</td>
      <td>${c.vendorName}</td>
      <td>$${c.amount}</td>
      <td>${c.startDate} ~ ${c.endDate}</td>
      <td>
        <button onclick="showAnalysis(${c.id})">分析</button>
        <button class="delete-btn" onclick="deleteContract(${c.id})">刪除</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function deleteContract(id) {
  if (!confirm('確定要刪除這份合約嗎？')) return;

  const res = await fetch(`http://localhost:3000/api/contracts/${id}`, { method: 'DELETE' });
  const result = await res.json();
  if (result.success) loadContracts();
}

async function showAnalysis(contractId) {
  const res = await fetch(`http://localhost:3000/api/contracts/${contractId}/analysis`);
  const data = await res.json();

  alert(`
    大樓：${data.buildingCode} - ${data.buildingName}
    項目：${data.itemName}
    廠商：${data.vendorName}
    合約金額：$${data.contractAmount}
    大樓成本：$${data.totalCost}
    利潤：$${data.profit} (${data.status})
  `);
}

// 初始化
loadBuildings();
loadItems();
loadVendors();
loadContracts();