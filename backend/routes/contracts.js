// morning-briefing/backend/routes/contracts.js
import express from 'express';
import { db } from '../db.js';

const router = express.Router();

// 建立 contracts 資料表
await db.exec(`
  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buildingId INTEGER,
    type TEXT,              -- 人件 / 工項
    itemId INTEGER,         -- 對應 items 表的 id
    vendorId INTEGER,       -- 對應 vendors 表的 id
    isOutsourced INTEGER,   -- 1 表示外包，0 表示自派
    amount REAL,            -- 下包金額
    startDate TEXT,
    endDate TEXT
  )
`);

// ✅ 新增合約
router.post('/', async (req, res) => {
  const { buildingId, type, itemId, vendorId, isOutsourced, amount, startDate, endDate } = req.body;

  await db.run(
    `INSERT INTO contracts (buildingId, type, itemId, vendorId, isOutsourced, amount, startDate, endDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    buildingId, type, itemId, vendorId, isOutsourced ? 1 : 0, amount, startDate, endDate
  );

  res.json({ success: true });
});

// ✅ 查詢所有合約（JOIN buildings + items + vendors）
router.get('/', async (req, res) => {
  const rows = await db.all(`
    SELECT c.id, c.type, c.amount, c.startDate, c.endDate, c.isOutsourced,
           b.code AS buildingCode, b.name AS buildingName,
           i.name AS itemName,
           v.name AS vendorName
    FROM contracts c
    JOIN buildings b ON c.buildingId = b.id
    LEFT JOIN items i ON c.itemId = i.id
    LEFT JOIN vendors v ON c.vendorId = v.id
    ORDER BY c.id DESC
  `);
  res.json(rows);
});

// ✅ 查詢單一合約
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const contract = await db.get(`
    SELECT c.*, b.code AS buildingCode, b.name AS buildingName,
           i.name AS itemName,
           v.name AS vendorName
    FROM contracts c
    JOIN buildings b ON c.buildingId = b.id
    LEFT JOIN items i ON c.itemId = i.id
    LEFT JOIN vendors v ON c.vendorId = v.id
    WHERE c.id = ?
  `, id);

  res.json(contract);
});

// ✅ 刪除合約
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db.run('DELETE FROM contracts WHERE id = ?', id);
  res.json({ success: true });
});

// ✅ 合約 vs 大樓成本分析
router.get('/:id/analysis', async (req, res) => {
  const { id } = req.params;

  const contract = await db.get(`
    SELECT c.*, b.code AS buildingCode, b.name AS buildingName,
           i.name AS itemName,
           v.name AS vendorName
    FROM contracts c
    JOIN buildings b ON c.buildingId = b.id
    LEFT JOIN items i ON c.itemId = i.id
    LEFT JOIN vendors v ON c.vendorId = v.id
    WHERE c.id = ?
  `, id);

  if (!contract) {
    return res.status(404).json({ error: '合約不存在' });
  }

  const items = await db.all(`
    SELECT i.unitPrice, bi.quantity
    FROM building_items bi
    JOIN items i ON bi.itemId = i.id
    WHERE bi.buildingId = ?
  `, contract.buildingId);

  let subtotal = 0;
  items.forEach(i => { subtotal += i.unitPrice * i.quantity; });
  const totalCost = subtotal * 1.10 * 1.05;
  const profit = contract.amount - totalCost;

  res.json({
    contractId: contract.id,
    buildingCode: contract.buildingCode,
    buildingName: contract.buildingName,
    itemName: contract.itemName,
    vendorName: contract.vendorName,
    contractAmount: contract.amount,
    subtotal,
    totalCost,
    profit,
    status: profit >= 0 ? '利潤' : '虧損'
  });
});

export default router;