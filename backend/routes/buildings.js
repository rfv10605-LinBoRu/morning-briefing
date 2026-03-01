// morning-briefing/backend/routes/buildings.js
import express from 'express';
import { db } from '../db.js';

const router = express.Router();

// 建立資料表（大樓與綁定項目）
await db.exec(`
  CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT
  );
  CREATE TABLE IF NOT EXISTS building_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buildingId INTEGER,
    itemId INTEGER,
    quantity REAL,
    buildingNote TEXT,
    FOREIGN KEY(buildingId) REFERENCES buildings(id),
    FOREIGN KEY(itemId) REFERENCES items(id)
  );
`);

// ✅ 如果 building_items 表中尚未有 buildingNote 欄位，就新增
const columns = await db.all(`PRAGMA table_info(building_items)`);
const hasBuildingNote = columns.some(col => col.name === 'buildingNote');
if (!hasBuildingNote) {
  await db.exec(`ALTER TABLE building_items ADD COLUMN buildingNote TEXT`);
}

// ✅ 新增大樓（含綁定項目）
router.post('/', async (req, res) => {
  const { code, name, items = [] } = req.body;

  try {
    const result = await db.run(
      'INSERT INTO buildings (code, name) VALUES (?, ?)',
      code, name
    );
    const buildingId = result.lastID;

    for (const item of items) {
      await db.run(
        'INSERT INTO building_items (buildingId, itemId, quantity, buildingNote) VALUES (?, ?, ?, ?)',
        buildingId, item.itemId, item.quantity, item.buildingNote || ''
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('新增大樓失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 取得所有大樓
router.get('/', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM buildings');
    res.json(rows);
  } catch (err) {
    console.error('取得大樓清單失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 取得某大樓的明細 (含項目備註 + 單位 + 大樓備註)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const building = await db.get('SELECT * FROM buildings WHERE id = ?', id);

    const items = await db.all(`
      SELECT 
        bi.id AS buildingItemId,
        i.type,
        i.name,
        i.note,
        i.unit,
        i.unitPrice,
        bi.quantity,
        bi.buildingNote
      FROM building_items bi
      JOIN items i ON bi.itemId = i.id
      WHERE bi.buildingId = ?
    `, id);

    res.json({ ...building, items });
  } catch (err) {
    console.error('查詢大樓明細失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 更新大樓基本資料
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { code, name } = req.body;

  try {
    await db.run(
      'UPDATE buildings SET code = ?, name = ? WHERE id = ?',
      code, name, id
    );
    res.json({ success: true });
  } catch (err) {
    console.error('更新大樓失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 刪除大樓（含綁定項目）
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await db.run('DELETE FROM building_items WHERE buildingId = ?', id);
    await db.run('DELETE FROM buildings WHERE id = ?', id);
    res.json({ success: true });
  } catch (err) {
    console.error('刪除大樓失敗', err);
    res.status(500).json({ success: false });
  }
});

export default router;