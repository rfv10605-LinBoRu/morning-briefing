// 匯入 Excel（避免重複：後端會檢查 type+name+unitPrice）
async function importItems() {
  const text = document.getElementById('excelPaste').value.trim();
  if (!text) return alert('請貼上 Excel 表格內容');

  const rows = text.split('\n').map(r => r.split('\t'));
  const items = rows.map(r => ({
    type: r[0],          // 類型
    name: r[1],          // 項目
    note: r[2] || '',    // 項目備註
    unit: r[3] || '',    // 單位
    unitPrice: parseFloat(r[4]) // 單價
  }));


  const res = await fetch('http://localhost:3000/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });

  const result = await res.json();
  if (result.success) {
    document.getElementById('excelPaste').value = ''; // ✅ 匯入後清空輸入框
    loadItems();

    // ✅ 顯示提示訊息：哪些項目被略過
    if (result.skipped && result.skipped.length > 0) {
      const skippedList = result.skipped
        .map(i => `${i.type}-${i.name} $${i.unitPrice}`)
        .join('\n');
      alert(`以下項目已存在，未新增：\n${skippedList}`);
    } else {
      alert('匯入成功，沒有重複項目');
    }
  } else {
    alert('匯入失敗');
  }
}

// 顯示清單（前端彙整：同類型+名稱+金額+備註合併）
async function loadItems() {
  const res = await fetch('http://localhost:3000/api/items');
  const items = await res.json();

  // ✅ 彙整相同 type+name+unitPrice+note
  const grouped = {};
  items.forEach(item => {
    const key = `${item.type}-${item.name}-${item.unitPrice}-${item.note || ''}`;
    if (!grouped[key]) {
      grouped[key] = { ...item };
    } else {
      // 如果有重複，可以選擇加總或覆蓋
      grouped[key].unitPrice = item.unitPrice; // 覆蓋最新金額
      grouped[key].note = item.note;           // 覆蓋最新備註
    }
  });

  const tbody = document.querySelector('#itemsTable tbody');
  tbody.innerHTML = Object.values(grouped).map(item => `
    <tr>
      <td>${item.type}</td>
      <td><input type="text" value="${item.name}" data-id="${item.id}" data-field="name"></td>
      <td><input type="text" value="${item.note || ''}" data-id="${item.id}" data-field="note"></td>
      <td><input type="text" value="${item.unit || ''}" data-id="${item.id}" data-field="unit"></td>
      <td><input type="number" step="0.5" value="${item.unitPrice}" data-id="${item.id}" data-field="unitPrice"></td>
      <td>
        <button class="delete-btn" onclick="deleteItem(${item.id})">刪除</button>
        <button class="edit-btn" onclick="updateItem(${item.id})">更新</button>
      </td>
    </tr>
  `).join('');


  // ✅ 更新件數顯示
  document.getElementById('itemCount').textContent = `(${Object.keys(grouped).length} 件)`;
}



// 刪除單筆
async function deleteItem(id) {
  if (!confirm('確定要刪除這筆資料嗎？')) return;

  const res = await fetch(`http://localhost:3000/api/items/${id}`, { method: 'DELETE' });
  const result = await res.json();
  if (result.success) {
    loadItems();
  } else {
    alert('刪除失敗');
  }
}

// 更新單筆
async function updateItem(id) {
  const nameInput = document.querySelector(`input[data-id="${id}"][data-field="name"]`);
  const priceInput = document.querySelector(`input[data-id="${id}"][data-field="unitPrice"]`);
  const noteInput = document.querySelector(`input[data-id="${id}"][data-field="note"]`); // ✅ 新增
  const unitInput = document.querySelector(`input[data-id="${id}"][data-field="unit"]`);

  const updatedItem = {
    name: nameInput.value,
    note: noteInput.value,
    unit: unitInput.value,
    unitPrice: parseFloat(priceInput.value)
  };

  const res = await fetch(`http://localhost:3000/api/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedItem)
  });

  const result = await res.json();
  if (result.success) {
    alert('更新成功');
    loadItems();
  } else {
    alert('更新失敗');
  }
}


// ✅ 清空所有項目
async function clearItems() {
  if (!confirm('確定要清空所有項目嗎？')) return;
  const res = await fetch('http://localhost:3000/api/items/clear', { method: 'DELETE' });
  const result = await res.json();
  if (result.success) {
    loadItems();
  } else {
    alert('清空失敗');
  }
}

// 刪除符合 type+name+unitPrice 的其中一筆
async function deleteOneItem(type, name, unitPrice) {
  if (!confirm(`確定要刪除 ${type}-${name} $${unitPrice} 的其中一筆嗎？`)) return;

  const res = await fetch('http://localhost:3000/api/items/one', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name, unitPrice })
  });

  const result = await res.json();
  if (result.success) {
    loadItems();
  } else {
    alert('刪除失敗：' + (result.message || ''));
  }
}

async function deduplicateItems() {
  if (!confirm('確定要清除重複項目嗎？')) return;
  const res = await fetch('http://localhost:3000/api/items/deduplicate', { method: 'DELETE' });
  const result = await res.json();
  if (result.success) {
    alert(`已清除 ${result.removed} 組重複項目`);
    loadItems();
  } else {
    alert('清除失敗');
  }
}


// 頁面載入時顯示
loadItems();