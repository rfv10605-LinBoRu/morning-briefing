// morning-briefing/backend/routes/building-items.js
import express from 'express';
import { db } from '../db.js';

const router = express.Router();

const columns = await db.all(`PRAGMA table_info(building_items)`);
const hasNote = columns.some(col => col.name === 'buildingNote');
if (!hasNote) {
  await db.exec(`ALTER TABLE building_items ADD COLUMN buildingNote TEXT`);
}

// ✅ 新增項目到某棟大樓（含 buildingNote）
router.post('/', async (req, res) => {
  const { buildingId, itemId, quantity, buildingNote } = req.body;
  try {
    await db.run(
      'INSERT INTO building_items (buildingId, itemId, quantity, buildingNote) VALUES (?, ?, ?, ?)',
      buildingId, itemId, quantity, buildingNote || ''
    );
    res.json({ success: true });
  } catch (err) {
    console.error('新增大樓項目失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 刪除某筆項目（依 id）
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run('DELETE FROM building_items WHERE id = ?', id);
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: '找不到項目' });
    }
  } catch (err) {
    console.error('刪除大樓項目失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 刪除符合 buildingId + type + name + unitPrice 的其中一筆
router.delete('/one', async (req, res) => {
  const { buildingId, type, name, unitPrice } = req.body;
  try {
    const result = await db.run(
      `DELETE FROM building_items 
       WHERE id = (
         SELECT bi.id FROM building_items bi
         JOIN items i ON bi.itemId = i.id
         WHERE bi.buildingId = ? AND i.type = ? AND i.name = ? AND i.unitPrice = ?
         LIMIT 1
       )`,
      buildingId, type, name, unitPrice
    );

    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: '找不到符合的項目' });
    }
  } catch (err) {
    console.error('刪除符合條件的大樓項目失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 更新某筆項目的大樓備註
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { buildingNote } = req.body;
  try {
    const result = await db.run(
      'UPDATE building_items SET buildingNote = ? WHERE id = ?',
      buildingNote, id
    );
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: '找不到項目' });
    }
  } catch (err) {
    console.error('更新大樓備註失敗', err);
    res.status(500).json({ success: false });
  }
});

export default router;