// 載入人件/工項
async function loadItems() {
  const res = await fetch('http://localhost:3000/api/items');
  const items = await res.json();

  // ✅ 用 type+name+unitPrice 當 key 去重
  const grouped = {};
  items.forEach(item => {
    const key = `${item.type}-${item.name}-${item.note || ''}-${item.unit || ''}-${item.unitPrice}`;
    if (!grouped[key]) {
      grouped[key] = item;
    }
  });

  const tbody = document.querySelector('#itemsTable tbody');
  tbody.innerHTML = '';
  Object.values(grouped).forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.type}</td>
      <td>${item.name}</td>
      <td>${item.note || ''}</td>
      <td>${item.unit || ''}</td>
      <td>$${item.unitPrice}</td>
      <td><input type="number" step="0.5" min="0" value="0"
                 data-id="${item.id}" data-price="${item.unitPrice}"></td>
      <td><input type="text" placeholder="輸入大樓備註"
                 data-id="${item.id}" data-field="buildingNote"></td> <!-- ✅ 新增 -->
    `;
    tbody.appendChild(row);
  });
}


// 新增大樓
async function submitBuilding() {
  const code = document.getElementById('buildingCode').value.trim();
  const name = document.getElementById('buildingName').value.trim();
  const inputs = document.querySelectorAll('#itemsTable input[type="number"]');

  const selectedItems = [];
  let subtotal = 0;

  inputs.forEach(input => {
    const quantity = parseFloat(input.value);
    if (quantity > 0) {
      const itemId = input.dataset.id;
      const unitPrice = parseFloat(input.dataset.price);

      // ✅ 找到對應的大樓備註欄位
      const noteInput = document.querySelector(`#itemsTable input[data-field="buildingNote"][data-id="${itemId}"]`);
      const buildingNote = noteInput?.value?.trim() || '';

      selectedItems.push({ itemId, quantity, buildingNote }); // ✅ 加入備註
      subtotal += unitPrice * quantity;
    }
  });

  const total = subtotal * 1.10 * 1.05;

  const res = await fetch('http://localhost:3000/api/buildings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name, items: selectedItems })
  });

  const result = await res.json();
  if (result.success) {
    document.getElementById('summary').innerHTML = `
      <p>未稅未管銷：$${subtotal.toFixed(0)}</p>
      <p>含稅含管銷：$${total.toFixed(0)}</p>
    `;
    loadBuildings();
  } else {
    alert('新增失敗');
  }
}

// 顯示大樓清單
async function loadBuildings() {
  const res = await fetch('http://localhost:3000/api/buildings');
  const buildings = await res.json();

  const tbody = document.querySelector('#buildingsTable tbody');
  tbody.innerHTML = '';

  for (const b of buildings) {
    // 查詢每棟大樓的項目明細
    const detailRes = await fetch(`http://localhost:3000/api/buildings/${b.id}`);
    const detail = await detailRes.json();

    let subtotal = 0;
    detail.items.forEach(i => {
      subtotal += i.unitPrice * i.quantity;
    });
    const total = subtotal * 1.10 * 1.05;

    // ✅ 顯示大樓基本資料
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${b.code}</td>
      <td>${b.name}</td>
      <td>$${subtotal.toFixed(0)}</td>
      <td>$${total.toFixed(0)}</td>
      <td>
        <button class="delete-btn" onclick="deleteBuilding(${b.id})">刪除整棟</button>
      </td>
    `;
    tbody.appendChild(row);
  }
}

// 刪除整棟大樓
async function deleteBuilding(id) {
  if (!confirm('確定要刪除這棟大樓嗎？')) return;

  const res = await fetch(`http://localhost:3000/api/buildings/${id}`, { method: 'DELETE' });
  const result = await res.json();
  if (result.success) {
    loadBuildings();
  } else {
    alert('刪除失敗');
  }
}

// ✅ 搜尋/篩選項目 (直接綁定 HTML 裡的 #itemSearch)
document.getElementById('itemSearch').addEventListener('input', function () {
  const keyword = this.value.toLowerCase();
  const rows = document.querySelectorAll('#itemsTable tbody tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(keyword) ? '' : 'none';
  });
});

// 刪除符合 type+name+unitPrice 的其中一筆 (某大樓的項目)
async function deleteOneBuildingItem(buildingId, type, name, unitPrice) {
  if (!confirm(`確定要刪除 ${type}-${name} $${unitPrice} 的其中一筆嗎？`)) return;

  const res = await fetch('http://localhost:3000/api/building-items/one', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buildingId, type, name, unitPrice })
  });

  const result = await res.json();
  if (result.success) {
    loadBuildings(); // 或 loadBuildingDetail(buildingId)
  } else {
    alert('刪除失敗：' + (result.message || ''));
  }
}

// 頁面載入時
loadItems();
loadBuildings();