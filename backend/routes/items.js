// morning-briefing/backend/routes/items.js
import express from 'express';
import { db } from '../db.js';

const router = express.Router();

// 建立資料表 (如果尚未建立)
await db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    name TEXT,       -- 項目
    note TEXT,       -- 項目備註
    unit TEXT,       -- ✅ 新增單位
    unitPrice REAL
  )
`);

// ✅ 補上 unit 欄位（如果尚未存在）
const columns = await db.all(`PRAGMA table_info(items)`);
const hasUnit = columns.some(col => col.name === 'unit');
if (!hasUnit) {
  await db.exec(`ALTER TABLE items ADD COLUMN unit TEXT`);
}

// 取得所有人件/工項
router.get('/', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM items');
    res.json(rows);
  } catch (err) {
    console.error('取得項目失敗', err);
    res.status(500).json({ success: false });
  }
});

// 匯入人件/工項（避免重複：type+name+unitPrice+note）
router.post('/', async (req, res) => {
  const items = req.body.items || [];
  try {
    const skipped = [];
    for (const item of items) {
      const existing = await db.get(
        'SELECT * FROM items WHERE type = ? AND name = ? AND note = ? AND unit = ? AND unitPrice = ?',
        item.type, item.name, item.note || '', item.unit || '', item.unitPrice
      );

      if (!existing) {
        await db.run(
          'INSERT INTO items (type, name, note, unit, unitPrice) VALUES (?, ?, ?, ?, ?)',
          item.type, item.name, item.note || '', item.unit || '', item.unitPrice
        );
      } else {
        skipped.push(item); // ✅ 已存在，略過
      }
    }
    res.json({ success: true, skipped });
  } catch (err) {
    console.error('匯入失敗', err);
    res.status(500).json({ success: false });
  }
});


// 刪除人件/工項 (依 id)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run('DELETE FROM items WHERE id = ?', id);
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: '找不到項目' });
    }
  } catch (err) {
    console.error('刪除失敗', err);
    res.status(500).json({ success: false });
  }
});

// 更新人件/工項
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, note, unit, unitPrice } = req.body; // ✅ 新增 note

  try {
    await db.run(
      'UPDATE items SET name = ?, note = ?, unit = ?, unitPrice = ? WHERE id = ?',
      name, note, unit, unitPrice, id
    );
    res.json({ success: true });
  } catch (err) {
    console.error('更新失敗', err);
    res.status(500).json({ success: false });
  }
});


// 清空所有項目
router.delete('/clear', async (req, res) => {
  try {
    await db.run('DELETE FROM items');
    res.json({ success: true });
  } catch (err) {
    console.error('清空失敗', err);
    res.status(500).json({ success: false });
  }
});

// 刪除符合 type+name+unitPrice 的其中一筆
router.delete('/one', async (req, res) => {
  const { type, name, unitPrice } = req.body;
  try {
    const result = await db.run(
      `DELETE FROM items 
       WHERE id = (
         SELECT id FROM items 
         WHERE type = ? AND name = ? AND unitPrice = ? 
         LIMIT 1
       )`,
      type, name, unitPrice
    );

    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: '找不到符合的項目' });
    }
  } catch (err) {
    console.error('刪除符合條件失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 清除重複項目（type+name+unitPrice 一樣，只保留一筆）
router.delete('/deduplicate', async (req, res) => {
  try {
    const duplicates = await db.all(`
      SELECT type, name, unitPrice, COUNT(*) as count
      FROM items
      GROUP BY type, name, unitPrice
      HAVING count > 1
    `);

    for (const dup of duplicates) {
      const ids = await db.all(
        'SELECT id FROM items WHERE type = ? AND name = ? AND unitPrice = ? ORDER BY id',
        dup.type, dup.name, dup.unitPrice
      );
      const idsToDelete = ids.slice(1).map(i => i.id); // 保留第一筆，刪掉其他
      for (const id of idsToDelete) {
        await db.run('DELETE FROM items WHERE id = ?', id);
      }
    }

    res.json({ success: true, removed: duplicates.length });
  } catch (err) {
    console.error('清除重複項目失敗', err);
    res.status(500).json({ success: false });
  }
});

export default router;