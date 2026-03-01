// morning-briefing/backend/routes/vendors.js
import express from 'express';
import { db } from '../db.js';

const router = express.Router();

// 建立 vendors 資料表 (含分類欄位)
await db.exec(`
  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,            -- 廠商抬頭
    taxId TEXT,           -- 統一編號
    contactPerson TEXT,   -- 負責人
    phone TEXT,           -- 連絡電話
    address TEXT,         -- 登記地址
    category TEXT         -- 廠商分類
  )
`);

// 如果舊表沒有 category 欄位，補上
const columns = await db.all(`PRAGMA table_info(vendors)`);
const hasCategory = columns.some(col => col.name === 'category');
if (!hasCategory) {
  await db.exec(`ALTER TABLE vendors ADD COLUMN category TEXT`);
}

// ✅ 新增廠商
router.post('/', async (req, res) => {
  const { name, taxId, contactPerson, phone, address, category } = req.body;

  await db.run(
    `INSERT INTO vendors (name, taxId, contactPerson, phone, address, category)
     VALUES (?, ?, ?, ?, ?, ?)`,
    name, taxId, contactPerson, phone, address, category || ''
  );

  res.json({ success: true });
});

// ✅ 查詢所有廠商
router.get('/', async (req, res) => {
  const rows = await db.all('SELECT * FROM vendors ORDER BY id DESC');
  res.json(rows);
});

// ✅ 查詢單一廠商
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', id);
  res.json(vendor);
});

// ✅ 更新廠商
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, taxId, contactPerson, phone, address, category } = req.body;

  try {
    const result = await db.run(
      `UPDATE vendors 
       SET name = ?, taxId = ?, contactPerson = ?, phone = ?, address = ?, category = ?
       WHERE id = ?`,
      name, taxId, contactPerson, phone, address, category, id
    );

    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: '找不到廠商' });
    }
  } catch (err) {
    console.error('更新廠商失敗', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 刪除廠商
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db.run('DELETE FROM vendors WHERE id = ?', id);
  res.json({ success: true });
});

// ✅ 查詢某廠商的所有合約
router.get('/:id/contracts', async (req, res) => {
  const { id } = req.params;
  const rows = await db.all(`
    SELECT c.id, c.type, c.amount, c.startDate, c.endDate, c.isOutsourced,
           b.code AS buildingCode, b.name AS buildingName,
           i.name AS itemName,
           v.name AS vendorName
    FROM contracts c
    JOIN buildings b ON c.buildingId = b.id
    LEFT JOIN items i ON c.itemId = i.id
    LEFT JOIN vendors v ON c.vendorId = v.id
    WHERE c.vendorId = ?
    ORDER BY c.id DESC
  `, id);

  res.json(rows);
});

export default router;