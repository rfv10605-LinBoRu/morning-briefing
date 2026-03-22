// server.js
// ====== 套件載入 ======
import express from 'express';
import multer from 'multer';
import path from 'path'; // Node.js 內建路徑模組
import fs from 'fs';  // Node.js 內建檔案系統模組
import fsExtra from 'fs-extra';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Readable } from 'stream';
import session from 'express-session';
import { Document, Packer, Paragraph } from 'docx';
import PizZip from 'pizzip'; // 用於處理 docx zip 結構
import Docxtemplater from 'docxtemplater'; // 用於處理 docx 範本
import axios from 'axios';  // 引入 axios
import bodyParser from 'body-parser'; // 用於解析請求主體
import sqlite3 from 'sqlite3';   // 引入 sqlite3
import QRCode from 'qrcode';
import { open } from 'sqlite';
import itemsRouter from './backend/routes/items.js';
import buildingsRouter from './backend/routes/buildings.js';
import contractsRouter from './backend/routes/contracts.js';
import vendorsRouter from './backend/routes/vendors.js';
import buildingItemsRouter from './backend/routes/building-items.js';




// ====== __dirname 模擬 ======
const __filename = fileURLToPath(import.meta.url); // 模擬 CommonJS 的 __filename
const __dirname = dirname(__filename);  // 模擬 CommonJS 的 __dirname


// ====== 基本設定 ======
const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
const TMP_FOLDER = path.join(UPLOADS_ROOT, 'tmp');
const ABNORMAL_UPLOADS_ROOT = path.join(__dirname, 'uploads-abnormal');
const usersPath = path.join(__dirname, 'users.json');
const usersRaw = fs.readFileSync(usersPath, 'utf-8');
const users = JSON.parse(usersRaw);
const router = express.Router();
const CHECK_UPLOADS_ROOT = path.join(__dirname, 'uploads-check');
const db = new sqlite3.Database('./data.db');




// ✅ 建立 employees 表格（含部門欄位）
db.run(`CREATE TABLE IF NOT EXISTS employees (
  employeeId TEXT PRIMARY KEY,
  name TEXT,
  department TEXT,
  title TEXT
)`);

// ✅ 建立 signins 表格
db.run(`CREATE TABLE IF NOT EXISTS signins (
  meetingId TEXT,
  employeeId TEXT,
  signedAt TEXT,
  PRIMARY KEY (meetingId, employeeId)
)`);

// ✅ 建立 meetings 表格
db.run(`CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  name TEXT,
  date TEXT,
  location TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS meeting_attendees (
  meetingId TEXT,
  employeeId TEXT,
  name TEXT,
  department TEXT,
  title TEXT,
  PRIMARY KEY (meetingId, employeeId)
)`);



// ✅ 檢查是否已有 department 欄位（避免重複 ALTER）
db.all(`PRAGMA table_info(employees)`, (err, columns) => {
  if (err) {
    console.error('❌ 無法讀取欄位資訊:', err);
    return;
  }
  const hasDepartment = columns.some(col => col.name === 'department');
  if (!hasDepartment) {
    db.run(`ALTER TABLE employees ADD COLUMN department TEXT`, (err) => {
      if (err) {
        console.error('❌ 新增 department 欄位失敗:', err);
      } else {
        console.log('✅ 已新增 department 欄位');
      }
    });
  } else {
    console.log('⚠️ department 欄位已存在，略過新增');
  }
});



// 確保資料夾存在（同步建立，避免頂層 await 引起不同行為）
try {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
} catch (err) {
  console.error('無法建立 UPLOADS_ROOT:', UPLOADS_ROOT, err);
  process.exit(1);
}
fsExtra.ensureDirSync(UPLOADS_ROOT);
fsExtra.ensureDirSync(TMP_FOLDER);
fsExtra.ensureDirSync(ABNORMAL_UPLOADS_ROOT);
fsExtra.ensureDirSync(path.join(UPLOADS_ROOT, 'tmp'));

// 檢查 Readable.push 原始參數數量（快速偵錯用）
console.log('Readable.push arity:', Readable.prototype.push.length);

// ====== Multer 設定 ======
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TMP_FOLDER);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage });
const uploadMiddleware = upload.array('files', 10); // ✅ 改成單一欄位 'files'
const uploadSingleField = multer({ storage }).array('files', 10);



// ====== 印出路徑確認 ======
console.log('🗂️ 勤前教育資料夾 =', UPLOADS_ROOT);
console.log('🗂️ 暫存資料夾 =', TMP_FOLDER);
console.log('🗂️ 異常事件資料夾 =', ABNORMAL_UPLOADS_ROOT);


// ====== Middleware ======
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
//app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_ROOT));
app.use('/uploads-abnormal', express.static(ABNORMAL_UPLOADS_ROOT));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));
app.use(express.static(path.join(__dirname)));
app.use(express.static('post-system'));
app.use(bodyParser.json());


app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));
app.use(router);
// 掛載 API
app.use('/api/items', itemsRouter);
app.use('/api/buildings', buildingsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/building-items', buildingItemsRouter);

// 建立 SQLite 資料庫連線
const dbPromise = open({
  filename: './data.db',
  driver: sqlite3.Database
});

// 初始化資料表
(async () => {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      name TEXT
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buildingId TEXT,
      floor TEXT,
      taxId TEXT,
      name TEXT,
      UNIQUE(buildingId, taxId)
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buildingId TEXT,
      mailId TEXT,
      carrier TEXT,
      customerTaxId TEXT,
      scannedAt TEXT,
      signedAt TEXT,
      signatureImage TEXT
    );
  `);
})();

// 簡易上傳 request header log（只針對上傳路徑）
app.use((req, res, next) => {
  if (req.path.startsWith('/api/abnormal-events') && req.method === 'POST') {
    console.log('---- Incoming upload request ----');
    console.log('URL:', req.originalUrl);
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      host: req.headers.host,
      origin: req.headers.origin
    });
  }
  next();
});

// ✅ 確保根目錄與 tmp 子目錄存在  ✅ 建立資料夾
fsExtra.ensureDirSync(UPLOADS_ROOT);
fsExtra.ensureDirSync(TMP_FOLDER);
fsExtra.ensureDirSync(ABNORMAL_UPLOADS_ROOT);
fsExtra.ensureDirSync(path.join(UPLOADS_ROOT, 'tmp'));


// 首頁
app.get('/', (req, res) => {
  const user = req.session.user;
  if (!user) return res.redirect('/login');

  const username = user?.name || '使用者';

  let html = `
  <!DOCTYPE html>
  <html lang="zh-Hant">
  <head>
    <meta charset="UTF-8">
    <title>勤前系統首頁</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        font-family: sans-serif;
        margin: 0;
        padding: 20px;
        background-color: #f5f6fa;
        color: #333;
      }
      h1 {
        text-align: center;
        margin-bottom: 24px;
        font-size: 22px;
      }
      .logout-btn {
        display: inline-block;
        padding: 8px 16px;
        background-color: #e74c3c;
        color: white;
        border-radius: 6px;
        text-decoration: none;
        font-weight: bold;
        margin-bottom: 20px;
      }
      .grid {
        display: grid;
        
        grid-template-columns: 200px 200px 200px; /* ✅ 固定三欄 */
        gap: 16px;
        justify-content: center;
        margin-top: 20px;
        max-width: 640px; /* ✅ 限制最大寬度，避免桌機撐太大 */
        margin-left: auto;
        margin-right: auto;
      }

      .square-btn {
        position: relative;
        width: 100%;
        padding-top: 100%; /* ✅ 高度 = 寬度 */
        background-color: #fff;
        border: 1px solid #ddd;
        border-radius: 16px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        transition: transform 0.2s ease;
        overflow: hidden;
      }
      .square-btn:hover {
        transform: translateY(-2px);
      }
      .square-btn a {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        text-decoration: none;
        color: #333;
        font-weight: bold;
        font-size: 20px; /* ✅ 調整字體大小 */
        line-height: 1.4;
        padding: 20px; /* ✅ 調整內距 */
      }
      @media (max-width: 600px) {
        h1 { font-size: 18px; }
        .square-btn a {
          font-size: 14px;
          padding: 10px;
        }
        .grid {
          grid-template-columns: repeat(3, 1fr); /* ✅ 手機三欄 */
        }
      }
    </style>
  </head>
  <body>
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="/uploads/company-logo.png" alt="公司LOGO" style="height: 80px;">
    </div>
    <h1>📋 台北南區系統首頁</h1>
    <div style="text-align:center;">
      <div style="margin-bottom:12px;">👋 歡迎 ${username}</div>
      <a href="/logout" class="logout-btn"> 登出</a>
    </div>

    <div class="grid">
      <div class="square-btn"><a href="/views/upload.html">📤<br>勤前照片上傳</a></div>
      <div class="square-btn"><a href="/gallery">🖼️<br>勤前照片預覽</a></div>
      <div class="square-btn"><a href="/stats">📊<br>勤前統計報表</a></div>
      <div class="square-btn"><a href="/public/abnormal.html">📋<br>建立異常報告</a></div>
      <div class="square-btn"><a href="/public/abnormal-query.html">📑<br>查詢異常報告</a></div>
      <div class="square-btn"><a href="">📊<br>統計異常報告(建置中)</a></div>
      <div class="square-btn"><a href="/public/check.html">🏗️<br>建立查核報告</a></div>
      <div class="square-btn"><a href="/public/check-query.html">🔍<br>查詢查核報告</a></div>
      <div class="square-btn"><a href="post-system/index-1.html">🛠️<br>小工具(建置中)</a></div>
      
    </div>
  </body>
  </html>
  `;

  res.send(html);
});



// 顯示登入頁面
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});


// 處理登入表單
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const matched = users.find(u => u.username === username && u.password === password);

  if (matched) {
    req.session.user = { name: matched.name, username: matched.username };
    return res.redirect('/');
  }

  res.send('❌ 登入失敗，請返回重試');
});

// 處理登出
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});



// ==================== 勤前教育圖片上傳系統 API ====================
// ✅ 下載全部照片為 ZIP
app.get('/download-all', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).send("缺少日期參數");

  res.setHeader('Content-Disposition', `attachment; filename=photos-${date}.zip`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  const baseDir = path.join(__dirname, 'uploads');
  const folders = fs.readdirSync(baseDir);

  folders.forEach(folderName => {
    if (folderName.endsWith(`-${date}`)) {
      const folderPath = path.join(baseDir, folderName);
      const buildingName = folderName.replace(`-${date}`, '');
      if (fs.existsSync(folderPath) && fs.readdirSync(folderPath).length > 0) {
        archive.directory(folderPath, folderName); // folderName 是原始資料夾名稱
        console.log(`✅ 加入 ${buildingName} (${folderPath})`);
      } else {
        console.log(`⚠️ 跳過空資料夾：${folderPath}`);
      }
    }
  });

  archive.finalize();
});

// ✅ 圖片牆預覽頁面
app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'gallery.html'));
});

// ✅ 提供圖片牆時間資料 JSON
app.get('/gallery-data', (req, res) => {
  const { building, date } = req.query;
  if (!date) return res.status(400).json({ error: '請提供日期' });

  const folderPrefix = building ? `${building}-${date}` : date;
  if (!fs.existsSync(UPLOADS_ROOT)) return res.json({ folders: [] });

  const folders = fs.readdirSync(UPLOADS_ROOT).filter(f => f.includes(folderPrefix));
  const result = folders.map(folder => {
    const files = fs.readdirSync(path.join(UPLOADS_ROOT, folder))
      .filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f))
      .map(file => ({
        filename: file,
        url: `/uploads/${folder}/${file}`
      }));
    return { folder, files };
  });

  res.json({ folders: result });
});
// ==================== 勤前教育圖片上傳系統 API ====================

// ✅ 圖片上傳
app.post('/upload-image', upload.array('files', 6), async (req, res) => {   // ✅ 改成 array，限制最多 20 張
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).send('請選擇圖片');
    }

    const building = req.body.building || '未指定大樓';
    const note = req.body.note || '未指定備註';
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const folderName = `${building}-${date}`;
    const folderPath = path.join(UPLOADS_ROOT, folderName);

    if (!folderPath.startsWith(UPLOADS_ROOT + path.sep)) {
      return res.status(403).send('invalid folder');
    }

    await fsExtra.ensureDir(folderPath);

    const savedFiles = [];

    // ✅ 用 Promise.all 確保所有檔案都搬移完成
    await Promise.all(
      files.map(async (file, index) => {
        const ext = path.extname(file.originalname);
        // ✅ 使用 uuid + index 避免檔名衝突
        const savedFilename = `${Date.now()}-${index}-${note}-${uuidv4()}${ext}`;
        const newPath = path.join(folderPath, savedFilename);

        await fsExtra.move(file.path, newPath, { overwrite: true });
        savedFiles.push(`${folderName}/${savedFilename}`);
      })
    );

    res.json({
      message: `✅ 上傳成功，共 ${savedFiles.length} 張`,
      files: savedFiles
    });
  } catch (err) {
    console.error('❌ 上傳圖片失敗:', err);
    res.status(500).json({ error: 'upload failed' });
  }
});



// ✅ 圖片牆刪除圖片
app.post('/delete-image', (req, res) => {
  try {
    const { folder, filename } = req.body;
    if (!folder || !filename) {
      return res.status(400).send({ success: false, message: '缺少 folder 或 filename' });
    }

    const imagePath = path.resolve(UPLOADS_ROOT, folder, filename);
    if (!imagePath.startsWith(UPLOADS_ROOT + path.sep)) {
      return res.status(403).send({ success: false, message: '無效路徑' });
    }

    if (!fs.existsSync(imagePath)) {
      return res.status(404).send({ success: false, message: '圖片不存在' });
    }

    fs.unlinkSync(imagePath);

    const folderPath = path.dirname(imagePath);
    const remaining = fs.readdirSync(folderPath).filter(n => n !== '.' && n !== '..');
    if (remaining.length === 0) {
      try { fs.rmdirSync(folderPath); } catch (err) { console.error('刪除資料夾失敗', err); }
      return res.send({ success: true, message: '圖片已刪除，資料夾為空已刪除' });
    }

    return res.send({ success: true, message: '圖片已刪除' });
  } catch (err) {
    console.error('刪除圖片錯誤', err);
    return res.status(500).send({ success: false, message: '伺服器錯誤' });
  }
});

// ✅ 改為送出 HTML 頁面
app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'stats.html'));
});

// ✅ 提供統計資料 JSON
app.get('/stats-data', (req, res) => {
  const uploadsPath = UPLOADS_ROOT;
  const buildings = [
    '松山金融', '前瞻金融', '全球民權', '產物大樓',
    '芷英大樓', '華航大樓', '南京科技', '互助營造',
    '摩天大樓', '新莊農會', '儒鴻企業', '新板傑仕堡',
    '新板金融', '桃園金融', '新竹大樓', '竹科大樓', '頭份大樓'
  ];

  const now = new Date();
  const selectedMonth = req.query.month || now.toISOString().slice(0, 7);
  const [year, month] = selectedMonth.split('-');
  const daysInMonth = new Date(year, month, 0).getDate();

  const dateList = [];
  const workdayList = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dow = new Date(dateStr).getDay();
    if (dow >= 1 && dow <= 5) workdayList.push(dateStr);
  }

  let holidayListRaw = ['2025-10-06', '115-05-01', '115-04-06', '115-04-03', '115-01-01', '115-02-16', '115-02-17', '115-02-18', '115-02-19', '115-02-20', '115-02-27'];
  if (req.query.holidays) {
    holidayListRaw = holidayListRaw.concat(req.query.holidays.split(',').map(s => s.trim()).filter(Boolean));
  }

  function normalizeHoliday(h) {
    if (!h) return null;
    h = h.trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(h)) {
      const [y, m, d] = h.split('-');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const m2 = h.match(/^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m2) {
      const gy = parseInt(m2[1], 10) + 1911;
      return `${gy}-${String(m2[2]).padStart(2, '0')}-${String(m2[3]).padStart(2, '0')}`;
    }
    return null;
  }

  const holidayList = Array.from(new Set(holidayListRaw.map(normalizeHoliday).filter(Boolean)));
  const filteredWorkdayList = workdayList.filter(d => !holidayList.includes(d));

  const uploadMap = {};
  const buildingStats = {};
  buildings.forEach(building => {
    let count = 0;
    filteredWorkdayList.forEach(date => {
      const folderPath = path.join(uploadsPath, `${building}-${date}`);
      const exists = fs.existsSync(folderPath);
      uploadMap[`${building}-${date}`] = exists;
      if (exists) count++;
    });
    buildingStats[building] = count;
  });

  res.json({
    year,
    month,
    dates: filteredWorkdayList,
    buildings,
    holidays: holidayList,
    buildingStats,
    uploadMap
  });
});



// 臨時搬移舊 uploads 到永久 UPLOADS_ROOT（執行一次後建議移除此 route）
app.post('/admin/migrate-uploads', (req, res) => {
  try {
    const oldRoot = path.join(__dirname, 'uploads'); // 若你之前的 uploads 在專案內
    if (!fs.existsSync(oldRoot)) return res.json({ migrated: false, message: 'no old uploads' });

    fs.readdirSync(oldRoot).forEach(folder => {
      const src = path.join(oldRoot, folder);
      const dst = path.join(UPLOADS_ROOT, folder);
      if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
      fs.readdirSync(src).forEach(file => {
        const s = path.join(src, file);
        const d = path.join(dst, file);
        fs.renameSync(s, d);
      });
    });

    return res.json({ migrated: true });
  } catch (err) {
    console.error('migrate error', err);
    return res.status(500).json({ migrated: false, error: err.message });
  }
});


// 在勤前上傳統計頁面新增下載EXCEL統計表
app.get('/stats/download', async (req, res) => {
  try {
    const uploadsPath = UPLOADS_ROOT;
    const buildings = [
      '松山金融', '前瞻金融', '全球民權', '產物大樓',
      '芷英大樓', '華航大樓', '南京科技', '互助營造',
      '摩天大樓', '新莊農會', '儒鴻企業', '新板傑仕堡',
      '新板金融', '桃園金融', '新竹大樓', '竹科大樓', '頭份大樓'
    ];

    const now = new Date();
    const selectedMonth = req.query.month || now.toISOString().slice(0, 7); // YYYY-MM
    const [year, month] = selectedMonth.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();

    const workdayList = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      const dateObj = new Date(`${year}-${monthStr}-${dayStr}`);
      const dow = dateObj.getDay();
      if (dow >= 1 && dow <= 5) workdayList.push(dateStr);
    }

    let holidayListRaw = ['2025-10-06', '114/10/10'];
    if (req.query.holidays) {
      holidayListRaw = holidayListRaw.concat(req.query.holidays.split(',').map(s => s.trim()).filter(Boolean));
    }
    function normalizeHoliday(h) {
      if (!h) return null;
      h = h.trim();
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(h)) {
        const parts = h.split('-');
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      const m2 = h.match(/^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m2) {
        const gy = parseInt(m2[1], 10) + 1911;
        return `${gy}-${String(m2[2]).padStart(2, '0')}-${String(m2[3]).padStart(2, '0')}`;
      }
      return null;
    }
    const holidayList = Array.from(new Set(holidayListRaw.map(normalizeHoliday).filter(Boolean)));
    const filteredWorkdayList = workdayList.filter(d => !holidayList.includes(d));

    const buildingStats = {};
    buildings.forEach(building => {
      let count = 0;
      filteredWorkdayList.forEach(date => {
        const folderPath = path.join(uploadsPath, `${building}-${date}`);
        if (fs.existsSync(folderPath)) count++;
      });
      buildingStats[building] = count;
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'System';
    wb.created = new Date();

    const summary = wb.addWorksheet('摘要');
    summary.columns = [
      { header: '大樓', key: 'building', width: 24 },
      { header: '已上傳天數', key: 'uploaded', width: 16 },
      { header: '應上班天數', key: 'workdays', width: 16 },
      { header: '上傳率(%)', key: 'rate', width: 12 }
    ];
    summary.getRow(1).font = { bold: true };
    const denom = filteredWorkdayList.length || 0;
    buildings.forEach(b => {
      const uploaded = buildingStats[b] || 0;
      const rate = denom > 0 ? ((uploaded / denom) * 100) : 0;
      summary.addRow({ building: b, uploaded: uploaded, workdays: denom, rate: Math.round(rate * 10) / 10 });
    });

    const detail = wb.addWorksheet('逐日進度');
    const cols = [{ header: '大樓', key: 'building', width: 24 }];
    filteredWorkdayList.forEach(d => cols.push({ header: d, key: d, width: 12 }));
    detail.columns = cols;
    detail.getRow(1).font = { bold: true };

    buildings.forEach(b => {
      const row = { building: b };
      filteredWorkdayList.forEach(d => {
        const folderPath = path.join(uploadsPath, `${b}-${d}`);
        row[d] = fs.existsSync(folderPath) ? '✅' : '⛔';
      });
      detail.addRow(row);
    });

    const meta = wb.addWorksheet('參數');
    meta.addRow(['month', selectedMonth]);
    meta.addRow(['generatedAt', new Date().toISOString()]);
    meta.addRow(['excludedHolidays', holidayList.join(',') || '無']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const filename = `上傳統計_${selectedMonth}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('generate excel error', err);
    res.status(500).send('產生 Excel 發生錯誤');
  }
});






// ==================== 勤前異常事件上傳系統 API ====================
// ✅ 大樓代碼表
const buildingCodeMap = {
  '松山金融': 'L391',
  '前瞻金融': 'L336',
  '全球民權': 'N364',
  '產物大樓': 'L217',
  '芷英大樓': 'N307',
  '華航大樓': 'N236',
  '南京科技': 'L169',
  '互助營造': 'N113',
  '摩天大樓': 'L126',
  '新莊農會': 'N274',
  '儒鴻企業': 'N393',
  '新板傑仕堡': 'L384',
  '新板金融': 'L371',
  '桃園金融': 'L137',
  '新竹大樓': 'L215',
  '竹科大樓': 'L390',
  '亞太經貿': 'L289',
  '新光醫院': 'R125',
  '台中惠國': 'L243',
  '台南大樓': 'L186',
  '頭份大樓': 'L367',
  '新莊大樓': 'L281',
  '自強大樓': 'L171',
};

// ✅ 檔案儲存設定（放最前面）
const abnormalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const displayId = req.params.displayId;
    const dest = path.join(ABNORMAL_UPLOADS_ROOT, displayId);
    fsExtra.ensureDirSync(dest);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const name = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, name);
  }
});
const abnormalUpload = multer({ storage: abnormalStorage });

// ✅ 工具函式
const readAbnormalMeta = async (id) => {
  const metaPath = path.join(ABNORMAL_UPLOADS_ROOT, id, 'meta.json');
  if (!(await fsExtra.pathExists(metaPath))) return null;
  return await fsExtra.readJson(metaPath);
};

const writeAbnormalMeta = async (id, meta) => {
  const dir = path.join(ABNORMAL_UPLOADS_ROOT, id);
  await fsExtra.ensureDir(dir);
  await fsExtra.writeJson(path.join(dir, 'meta.json'), meta, { spaces: 2 });
};

const getNextSerial = async (date, buildingCode) => {
  const ids = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
  let maxSerial = 0;
  for (const id of ids) {
    const meta = await readAbnormalMeta(id);
    if (!meta?.displayId) continue;
    const prefix = `${date}-${buildingCode}-`;
    if (meta.displayId.startsWith(prefix)) {
      const tail = meta.displayId.slice(prefix.length);
      const num = parseInt(tail, 10);
      if (!isNaN(num) && num > maxSerial) maxSerial = num;
    }
  }
  return String(maxSerial + 1).padStart(3, '0');
};

// ✅ 建立事件
app.get('/api/abnormal-events', async (req, res) => {
  try {
    const { building, type, subtype, displayId } = req.query;
    const ids = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
    const out = [];
    const seenDisplayIds = new Set();

    for (const id of ids) {
      const meta = await readAbnormalMeta(id);
      if (!meta || !meta.displayId) continue;

      if (building && meta.building !== building) continue;
      if (type && meta.type !== type) continue;
      //if (subtype && meta.subtype !== subtype) continue;
      if (subtype && (meta.subtype || '').trim() !== subtype.trim()) continue;
      if (displayId && !meta.displayId.includes(displayId)) continue;
      const key = `${meta.displayId}-${meta.id}`;

      if (seenDisplayIds.has(meta.displayId)) continue;
      seenDisplayIds.add(meta.displayId);

      out.push({
        id: meta.id,
        displayId: meta.displayId,
        building: meta.building,
        type: meta.type,
        subtype: meta.subtype || '',
        description: meta.description,
        reportedBy: meta.reportedBy || '',
        status: meta.status,
        createdAt: meta.createdAt
      });
    }

    out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(out.slice(0, 200));
  } catch (err) {
    console.error('查詢事件錯誤:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// ✅ 上傳照片
app.post('/api/abnormal-events/:displayId/files', abnormalUpload.array('files', 20), async (req, res) => {
  try {
    const displayId = req.params.displayId;
    const folderPath = path.join(ABNORMAL_UPLOADS_ROOT, displayId);
    const metaPath = path.join(folderPath, 'meta.json');
    console.log('🧩 displayId:', displayId);
    console.log('📁 folderPath:', folderPath);
    console.log('📄 metaPath:', metaPath);
    const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
    console.log('📁 資料夾列表:', folders);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'event not found' });
    }

    const meta = await fsExtra.readJson(metaPath).catch(() => null);
    if (!meta) return res.status(404).json({ error: 'event meta not found' });

    const now = new Date().toISOString();
    const category = req.body.category || 'general';
    meta.files = meta.files || [];

    for (const f of req.files || []) {
      meta.files.push({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        uploadedAt: now,
        category: category,
        url: `/api/abnormal-events/${displayId}/files/${encodeURIComponent(f.filename)}`
      });
    }

    meta.updatedAt = now;
    await fsExtra.writeJson(metaPath, meta, { spaces: 2 });
    res.json({ ok: true, files: meta.files });
  } catch (err) {
    console.error('上傳異常檔案錯誤:', err);
    res.status(500).json({ error: 'upload error' });
  }
});

// 查詢單一事件詳情
app.get('/api/abnormal-events/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);

    for (const folder of folders) {
      const meta = await readAbnormalMeta(folder);
      if (meta?.id === targetId) {
        return res.json(meta);
      }
    }

    res.status(404).json({ error: '事件不存在' });
  } catch (err) {
    console.error('讀取事件詳情錯誤:', err);
    res.status(500).json({ error: 'server error' });
  }
});

//建立事件 API
app.post('/api/abnormal-events', async (req, res) => {
  try {
    const {
      building, type, subtype, description, reportedBy,
      location, occurTime, phenomenon, judgement,
      handling, suggestion, reason
    } = req.body;

    // 🚫 檢查必要欄位
    if (!building || !type || !description) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    // 🧠 建立 displayId（日期 + 大樓代碼 + 序號）
    const buildingCode = buildingCodeMap[building] || 'XX';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const serial = await getNextSerial(date, buildingCode);
    const displayId = `${date}-${buildingCode}-${serial}`;

    const id = uuidv4(); // ✅ 唯一識別碼

    // 📁 建立資料夾
    const folderPath = path.join(ABNORMAL_UPLOADS_ROOT, displayId);
    await fsExtra.ensureDir(folderPath);

    // 📝 建立 meta.json 資料
    const meta = {
      id,
      displayId,
      building,
      type,
      subtype,
      description,
      reportedBy,
      location,
      occurTime,
      phenomenon,
      judgement,
      handling,
      suggestion,
      reason,
      status: 'reported',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: []
    };

    await writeAbnormalMeta(displayId, meta); // ✅ 儲存 meta.json
    res.json({ id, displayId }); // ✅ 回傳事件識別碼
  } catch (err) {
    console.error('建立事件錯誤:', err);
    res.status(500).json({ error: 'server error' });
  }
});

//abnormal-detail顯示圖片
app.get('/api/abnormal-events/:displayId/files/:filename', async (req, res) => {
  const { displayId, filename } = req.params;
  const filePath = path.join(ABNORMAL_UPLOADS_ROOT, displayId, filename);
  if (!(await fsExtra.pathExists(filePath))) {
    return res.status(404).send('File not found');
  }
  res.sendFile(filePath);
});

//刪除異常事件
app.delete('/api/abnormal-events/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);

    for (const folder of folders) {
      const meta = await readAbnormalMeta(folder);
      if (meta?.id === targetId) {
        await fsExtra.remove(path.join(ABNORMAL_UPLOADS_ROOT, folder));
        return res.json({ ok: true });
      }
    }

    res.status(404).json({ error: '事件不存在' });
  } catch (err) {
    console.error('刪除事件錯誤:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// 變更事件狀態
app.patch('/api/abnormal-events/:id/status', async (req, res) => {
  try {
    const targetId = req.params.id;
    const newStatus = req.body.status;
    if (!newStatus) {
      return res.status(400).json({ error: '缺少狀態欄位' });
    }
    const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
    for (const folder of folders) {
      const meta = await readAbnormalMeta(folder);
      if (meta?.id === targetId) {
        meta.status = newStatus;
        meta.updatedAt = new Date().toISOString();
        await writeAbnormalMeta(folder, meta);
        return res.json({ ok: true });
      }
    }
    res.status(404).json({ error: '事件不存在' });
  } catch (err) {
    console.error('更新事件狀態錯誤:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE 刪除圖片
app.delete('/api/abnormal-events/:id/files/:filename', async (req, res) => {
  const { id, filename } = req.params;
  try {
    const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
    for (const folder of folders) {
      const metaPath = `${ABNORMAL_UPLOADS_ROOT}/${folder}/meta.json`;
      const meta = await fsExtra.readJson(metaPath);
      if (meta?.id === id) {
        const filePath = path.join(ABNORMAL_UPLOADS_ROOT, folder, filename);
        await fsExtra.remove(filePath);
        meta.files = (meta.files || []).filter(f => f.filename !== filename);
        await fsExtra.writeJson(metaPath, meta, { spaces: 2 });
        return res.json({ ok: true });
      }
    }
    res.status(404).json({ error: '事件不存在' });
  } catch (err) {
    console.error('❌ 刪除失敗:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// 下載整個事件資料夾為 ZIP
app.get('/download-folder', async (req, res) => {
  const folderKey = req.query.folder;
  if (!folderKey) return res.status(400).send('❌ 缺少 folder 參數');

  try {
    // 🔍 先嘗試在 uploads-abnormal 中比對 meta.id 或 displayId
    const abnormalFolders = await fs.promises.readdir(ABNORMAL_UPLOADS_ROOT);
    let matched = null;
    let targetPath = null;

    for (const folder of abnormalFolders) {
      const metaPath = path.join(ABNORMAL_UPLOADS_ROOT, folder, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      try {
        const metaRaw = await fs.promises.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaRaw);
        if (meta.id === folderKey || meta.displayId === folderKey) {
          matched = folder;
          targetPath = path.join(ABNORMAL_UPLOADS_ROOT, matched);
          break;
        }
      } catch (err) {
        console.warn('⚠️ 無法解析 meta.json:', metaPath);
      }
    }

    // ✅ 如果異常事件沒找到，再嘗試勤前教育資料夾（直接用 folderKey）
    if (!targetPath) {
      const fallbackPath = path.join(UPLOADS_ROOT, folderKey);
      if (fs.existsSync(fallbackPath)) {
        matched = folderKey;
        targetPath = fallbackPath;
      }
    }

    if (!targetPath) return res.status(404).send(`❌ 找不到對應資料夾：${folderKey}`);
    console.log('📦 matched folder =', matched);
    console.log('📁 targetPath =', targetPath);

    const encodedFilename = encodeURIComponent(matched + '.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.directory(targetPath, false);
    archive.on('error', err => {
      console.error('❌ 壓縮失敗:', err);
      res.status(500).send('❌ 壓縮失敗');
    });
    archive.pipe(res);
    archive.finalize();
  } catch (err) {
    console.error('❌ 下載 ZIP 發生錯誤:', err);
    res.status(500).send('❌ 伺服器錯誤');
  }
});

// PATCH 修改事件內容
app.patch('/api/abnormal-events/:id', async (req, res) => {
  const id = req.params.id;
  const { reason, description, status } = req.body;
  try {
    const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
    for (const folder of folders) {
      const metaPath = `${ABNORMAL_UPLOADS_ROOT}/${folder}/meta.json`;
      const meta = await fsExtra.readJson(metaPath);
      if (meta?.id === id) {
        if (reason) meta.reason = reason;
        if (description) meta.description = description;
        if (status) meta.status = status;
        await fsExtra.writeJson(metaPath, meta, { spaces: 2 });
        return res.json({ ok: true });
      }
    }
    res.status(404).json({ error: '事件不存在' });
  } catch (err) {
    console.error('❌ 修改事件失敗:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST 上傳圖片（多欄位，用 programmatic multer middleware 包裝以捕捉錯誤）
app.post('/api/abnormal-events/:id/files', (req, res) => {
  uploadSingleField(req, res, async (err) => {
    if (err) return res.status(500).json({ error: 'upload error', detail: err.message });

    try {
      const id = req.params.id;
      const category = req.body.category || 'initial';
      const files = req.files;
      if (!files || !files.length) return res.status(400).json({ error: '未收到檔案' });

      let matchedMeta = null;
      let matchedFolder = null;

      const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
      for (const folder of folders) {
        const metaPath = path.join(ABNORMAL_UPLOADS_ROOT, folder, 'meta.json');
        if (!fsExtra.existsSync(metaPath)) continue;
        const meta = await fsExtra.readJson(metaPath);
        if (meta?.id === id) {
          matchedMeta = meta;
          matchedFolder = folder; // UUID 資料夾名稱
          break;
        }
      }

      if (!matchedMeta || !matchedMeta.displayId) {
        return res.status(404).json({ error: '事件不存在' });
      }

      const displayId = matchedMeta.displayId;
      const folderPath = path.join(ABNORMAL_UPLOADS_ROOT, displayId);
      const metaPathFinal = path.join(folderPath, 'meta.json');

      await fsExtra.ensureDir(folderPath);
      matchedMeta.files = matchedMeta.files || [];

      for (const file of files) {
        const safeName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        const targetPath = path.join(folderPath, safeName);
        await fsExtra.move(file.path, targetPath);

        matchedMeta.files.push({
          filename: safeName,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          category,
          url: `/uploads-abnormal/${displayId}/${safeName}`
        });

        console.log(`✅ 已搬移 ${file.originalname} ➡️ ${targetPath}`);
      }

      await fsExtra.writeJson(metaPathFinal, matchedMeta, { spaces: 2 });
      return res.json({ ok: true });
    } catch (err) {
      console.error('❌ 上傳失敗:', err);
      return res.status(500).json({ error: 'server error', detail: err.message });
    }
  });
});


// ✅ 匯出 Word 文件（使用 [[...]] 標籤）
app.get('/api/export-word', async (req, res) => {
  const { displayId } = req.query;
  if (!displayId) return res.status(400).send('缺少 displayId');

  const folderPath = path.join(ABNORMAL_UPLOADS_ROOT, displayId);
  const metaPath = path.join(folderPath, 'meta.json');
  const templatePath = path.join(__dirname, 'templates', 'template.docx');

  try {
    if (!await fsExtra.pathExists(metaPath)) {
      return res.status(404).send('找不到事件');
    }

    const meta = await fsExtra.readJson(metaPath);

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '[[', end: ']]' } // ✅ 改用 [[...]] 標籤
    });

    doc.setData({
      displayId: meta.displayId,
      building: meta.building,
      type: meta.type,
      subtype: meta.subtype,
      description: meta.description,
      handling: meta.handling,
      reportedBy: meta.reportedBy,
      location: meta.location,
      occurTime: meta.occurTime,
      reason: meta.reason, // 新增 reason 欄位
      suggestion: meta.suggestion,  // 新增 suggestion 欄位
      judgement: meta.judgement,  // 新增 judgement 欄位
      phenomenon: meta.phenomenon,  // 新增 phenomenon 欄位
      occurTime: meta.occurTime, // 原始格式（若你還需要）
      occurDateROC: formatToROCDate(meta.occurTime), // 民國年月日
      occurTimeAMPM: formatToAMPM(meta.occurTime),   // 上午／下午格式
      status: meta.status
    });

    try {
      doc.render(); // ✅ 只保留這一次
      const buf = doc.getZip().generate({ type: 'nodebuffer' });
      res.setHeader('Content-Disposition', `attachment; filename=${meta.displayId}.docx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(buf);
    } catch (err) {
      console.error('❌ Word 產生錯誤:', err);
      if (err.properties?.errors) {
        err.properties.errors.forEach(error => {
          console.error('🔍 模板錯誤:', error);
        });
      }
      res.status(500).send('匯出失敗');
    }

  } catch (err) {
    console.error('❌ 匯出 Word 錯誤:', err);
    res.status(500).send('伺服器錯誤');
  }
});

// 工具函式：格式化時間為上午/下午
function formatToAMPM(dateStr) {
  const date = new Date(dateStr);
  const hour = date.getHours();
  const minute = date.getMinutes().toString().padStart(2, '0');
  const period = hour < 12 ? '上午' : '下午';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${hour12}:${minute}`;
}
// 工具函式：格式化日期為民國年月日
function formatToROCDate(dateStr) {
  const date = new Date(dateStr);
  const rocYear = date.getFullYear() - 1911;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${rocYear}/${month}/${day}`;
}



// LINE Notify 函式
async function sendLineNotify(message) {
  const token = '你的LINE_NOTIFY_TOKEN'; // ⚠️ 放你自己的 token
  await axios.post('https://notify-api.line.me/api/notify',
    `message=${encodeURIComponent(message)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      }
    }
  );
}

// 建立異常事件 API
app.post('/api/create-abnormal', async (req, res) => {
  const meta = req.body;

  // TODO: 儲存到 uploads-abnormal 或資料庫
  console.log('📝 建立事件:', meta);

  // 呼叫 LINE Notify
  await sendLineNotify(`
📢 異常事件通知
編號：${meta.displayId}
大樓：${meta.building}
類型：${meta.type}
狀態：${meta.status}
  `);

  res.json({ message: '事件建立成功並已通知' });
});










// ==================== 勤前查核報告上傳系統 API ====================
// 建立查核報告(文字描述)
router.post('/api/check-reports', async (req, res) => {
  try {
    const {
      displayId,
      zone,              // ✅ 區域中文名稱
      building,          // ✅ 大樓代號
      buildingName,      // ✅ 大樓中文名稱
      date,
      inspector,
      department,
      issues
    } = req.body;

    const folder = path.join(CHECK_UPLOADS_ROOT, displayId);
    await fsExtra.ensureDir(folder);

    const metadata = {
      displayId,
      zone,              // ✅ 儲存區域
      building,          // ✅ 儲存代號
      buildingName,      // ✅ 儲存中文名稱
      date,
      inspector,
      department,
      createdAt: new Date().toISOString(),
      issues: issues.map((issue, i) => ({
        id: `issue-${i + 1}`,
        description: issue.description,
        photo: issue.photo || null
      }))
    };

    await fsExtra.writeJson(path.join(folder, 'metadata.json'), metadata, { spaces: 2 });
    res.json({ success: true, id: displayId });
  } catch (err) {
    console.error('❌ 建立查核報告失敗:', err);
    res.status(500).json({ error: 'server error' });
  }
});


// 上傳查核照片(單張)
router.post('/api/upload-photo', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { displayId } = req.body; // ✅ 這行很重要！

    if (!file) throw new Error('No file uploaded');
    if (!displayId) throw new Error('Missing displayId');

    const ext = path.extname(file.originalname);
    const newName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const finalPath = path.join(CHECK_UPLOADS_ROOT, displayId, 'photos', newName);

    await fsExtra.ensureDir(path.dirname(finalPath));
    await fsExtra.move(file.path, finalPath);

    res.json({ filename: newName });
  } catch (err) {
    console.error('❌ 上傳照片失敗:', err);
    res.status(500).json({ error: 'upload failed' });
  }
});


// 查詢查核報告列表(可篩選大樓與部門)
app.get('/api/check-reports', async (req, res) => {
  try {
    const { building, department } = req.query;
    const folders = await fsExtra.readdir(CHECK_UPLOADS_ROOT);
    const out = [];

    for (const folder of folders) {
      const metaPath = path.join(CHECK_UPLOADS_ROOT, folder, 'metadata.json');
      if (!fsExtra.existsSync(metaPath)) continue;

      const meta = await fsExtra.readJson(metaPath);
      if (building && meta.building !== building) continue;
      if (department && meta.department !== department) continue;

      out.push(meta);
    }

    res.json(out);
  } catch (err) {
    console.error('❌ 查詢報告失敗:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// 刪除查核報告
router.delete('/api/check-reports/:id', async (req, res) => {
  const folder = path.join(CHECK_UPLOADS_ROOT, req.params.id);
  try {
    await fsExtra.remove(folder);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 刪除失敗:', err);
    res.status(500).json({ error: 'delete failed' });
  }
});

// 下載查核報告 ZIP
router.get('/api/check-reports/:id/download', async (req, res) => {
  const folder = path.join(CHECK_UPLOADS_ROOT, req.params.id);
  const zipName = `${req.params.id}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip');
  archive.directory(folder, false);
  archive.finalize();
  archive.pipe(res);
});

// 提交查核改善回報 API
// 提交改善回報（僅填寫改善說明與照片，不會自動核定）
router.post('/api/check-reports/improve', async (req, res) => {
  try {
    const { displayId, improvements, improvePhotos } = req.body;
    const metaPath = path.join(CHECK_UPLOADS_ROOT, displayId, 'metadata.json');
    if (!fsExtra.existsSync(metaPath)) throw new Error('metadata not found');

    const meta = await fsExtra.readJson(metaPath);

    for (const issue of meta.issues) {
      if (improvements && improvements[issue.id]) {
        issue.improvement = improvements[issue.id];
        issue.approved = issue.approved || false; // ✅ 預設未核定
      }
      if (improvePhotos && improvePhotos[issue.id]) {
        issue.improvePhoto = improvePhotos[issue.id]; // ✅ 改善後照片
      }
    }

    await fsExtra.writeJson(metaPath, meta, { spaces: 2 });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 改善回報失敗:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// 提交查核核定回報 API
// 主管核定 API（主管呼叫此 API 才能把改善狀態改為已核定）
router.post('/api/check-reports/approve', async (req, res) => {
  try {
    const { displayId, approvedIssues } = req.body;
    const metaPath = path.join(CHECK_UPLOADS_ROOT, displayId, 'metadata.json');
    if (!fsExtra.existsSync(metaPath)) throw new Error('metadata not found');

    const meta = await fsExtra.readJson(metaPath);

    for (const issue of meta.issues) {
      if (approvedIssues && issue.id in approvedIssues) {
        // ✅ 不管 true/false 都更新
        issue.approved = approvedIssues[issue.id] === true;
      }
    }

    await fsExtra.writeJson(metaPath, meta, { spaces: 2 });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 核定失敗:', err);
    res.status(500).json({ error: 'server error' });
  }
});


// ✅ 改善後照片上傳 API
router.post('/api/check-reports/upload-improve-photo', upload.single('file'), async (req, res) => {
  try {
    const { displayId, issueId } = req.body;
    const file = req.file;

    console.log('📥 收到改善後照片上傳請求:', { displayId, issueId, file });

    if (!file) return res.status(400).json({ error: '未選擇照片' });

    const metaPath = path.join(CHECK_UPLOADS_ROOT, displayId, 'metadata.json');
    if (!fsExtra.existsSync(metaPath)) throw new Error('metadata not found');

    const meta = await fsExtra.readJson(metaPath);

    const ext = path.extname(file.originalname);
    const newName = `${issueId}-improve${ext}`;
    const photoDir = path.join(CHECK_UPLOADS_ROOT, displayId, 'photos');
    await fsExtra.ensureDir(photoDir);

    const finalPath = path.join(photoDir, newName);
    console.log('➡️ 準備搬移檔案:', file.path, '→', finalPath);

    await fsExtra.move(file.path, finalPath, { overwrite: true });

    for (const issue of meta.issues) {
      console.log('🔍 檢查 issue:', issue.id, 'vs', issueId);
      if (String(issue.id) === String(issueId)) {
        issue.improvePhoto = newName;
        console.log('✅ 更新成功:', issue.id, '→', newName);
      }
    }

    await fsExtra.writeJson(metaPath, meta, { spaces: 2 });
    res.json({ success: true, filename: newName });
  } catch (err) {
    console.error('❌ 改善後照片上傳失敗:', err.stack);
    res.status(500).json({ error: 'server error' });
  }
});













// ==================== 會議簽到系統 API ====================

// 簽到紀錄
let signins = [];

// ✅ 員工簽到
app.post('/api/signin', (req, res) => {
  const { meetingId, employeeId } = req.body;

  // ✅ 改用 SQL 查詢該場會議的參加人員
  db.get(
    `SELECT * FROM meeting_attendees WHERE meetingId = ? AND employeeId = ?`,
    [meetingId, employeeId],
    (err, attendee) => {
      if (err || !attendee) {
        return res.status(400).json({ error: '此員工不在該場會議的參加名單中' });
      }

      // ✅ 查詢是否已簽到
      db.get(
        `SELECT * FROM signins WHERE meetingId = ? AND employeeId = ?`,
        [meetingId, employeeId],
        (err, existing) => {
          if (existing) {
            return res.status(400).json({ error: '已簽到過' });
          }

          const signedAt = new Date().toISOString();

          // ✅ 寫入簽到紀錄
          db.run(
            `INSERT INTO signins (meetingId, employeeId, signedAt) VALUES (?, ?, ?)`,
            [meetingId, employeeId, signedAt],
            () => {
              res.json({
                success: true,
                record: {
                  meetingId,
                  employeeId,
                  name: attendee.name,
                  department: attendee.department,
                  title: attendee.title || '', // ✅ 如果職稱是空白，顯示空字串
                  signedAt
                }
              });
            }
          );
        }
      );
    }
  );
});


// ✅ 查詢簽到名單
app.get('/api/signins/:meetingId', async (req, res) => {
  const { meetingId } = req.params;
  try {
    const db = await dbPromise;

    const rows = await db.all(`
      SELECT a.employeeId, a.name, a.department, a.title, s.signedAt
      FROM meeting_attendees a
      JOIN signins s
       ON a.meetingId = s.meetingId
       AND a.employeeId = s.employeeId
      WHERE a.meetingId = ?
      ORDER BY s.signedAt ASC
    `, [meetingId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ 查詢未簽到名單
app.get('/api/not-signed/:meetingId', async (req, res) => {
  const { meetingId } = req.params;
  try {
    const db = await dbPromise;

    const rows = await db.all(`
      SELECT a.employeeId, a.name, a.department, a.title
      FROM meeting_attendees a
      WHERE a.meetingId = ?
        AND a.employeeId NOT IN (
          SELECT employeeId FROM signins WHERE meetingId = ?
        )
    `, [meetingId, meetingId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// ✅ 匯出 Excel (建議用 exceljs 套件)
app.get('/api/export/:meetingId', (req, res) => {
  const { meetingId } = req.params;

  db.all(`
    SELECT a.employeeId, a.department, a.name, a.title, s.signedAt
    FROM signins s
    JOIN meeting_attendees a
      ON s.meetingId = a.meetingId AND s.employeeId = a.employeeId
    WHERE s.meetingId = ?
    ORDER BY s.signedAt ASC
  `, [meetingId], async (err, records) => {
    if (err) {
      console.error('匯出失敗', err);
      return res.status(500).json({ error: '匯出失敗' });
    }

    // ✅ 格式化時間
    function formatTime(isoString) {
      if (!isoString) return '';
      const date = new Date(isoString);

      // ✅ 強制轉成台灣時間並取出各部分
      const parts = date.toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour12: true,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).match(/(\d{4})\/(\d{2})\/(\d{2})\s*(上午|下午)\s*(\d{1,2}):(\d{2})/);

      if (!parts) return '';

      const [, yyyy, mm, dd, ampm, hour, minute] = parts;
      return `${yyyy}-${mm}-${dd} ${ampm}${hour}:${minute}`;
    }


    records.forEach((r, i) => {
      r.index = i + 1;
      r.signedAt = formatTime(r.signedAt);
    });

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('簽到名單');

      sheet.columns = [
        { header: '序', key: 'index', width: 6 },
        { header: '員工編號', key: 'employeeId', width: 15 },
        { header: '部門', key: 'department', width: 15 },
        { header: '姓名', key: 'name', width: 15 },
        { header: '職稱', key: 'title', width: 15 },
        { header: '簽到時間', key: 'signedAt', width: 25 }
      ];

      sheet.addRows(records);

      // ✅ 表頭美化
      sheet.getRow(1).eachCell(cell => {
        cell.font = { name: 'Microsoft JhengHei', bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9D9D9' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // ✅ 資料列美化
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell(cell => {
          cell.font = { name: 'Microsoft JhengHei' };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // ✅ 表頭格式
      sheet.getRow(1).eachCell(cell => {
        cell.font = { name: 'Microsoft JhengHei', bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      // ✅ 資料列格式
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell(cell => {
          cell.font = { name: 'Microsoft JhengHei' };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
      });


      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=meeting-${meetingId}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('Excel 生成失敗', err);
      res.status(500).json({ error: '匯出失敗' });
    }
  });
});



// ✅ 新增員工 API
app.post('/api/employees', (req, res) => {
  const { id, name, title, department } = req.body;
  if (!id || !department || !name || !title) {
    return res.status(400).json({ error: '缺少欄位' });
  }
  db.run(`INSERT INTO employees (id, department, name, title) VALUES (?, ?, ?, ?)`, [id, department, name, title], (err) => {
    if (err) return res.status(500).json({ error: '新增失敗' });
    res.json({ success: true });
  });
});



// ✅ 查詢員工列表 API
app.get('/api/employees', (req, res) => {
  db.all(`SELECT * FROM employees`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: '查詢失敗' });
    res.json(rows); // 每筆資料會包含 department
  });
});


// ✅ 刪除所有員工資料 API
app.delete('/api/employees', (req, res) => {
  db.run(`DELETE FROM employees`, (err) => {
    if (err) return res.status(500).json({ error: '清空失敗' });
    res.json({ success: true, message: '已清空所有員工資料' });
  });
});

// ✅ 更新員工資料 API
app.put('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  const { department, name, title } = req.body;
  db.run(`UPDATE employees SET department = ?, name = ?, title = ? WHERE id = ?`, [department, name, title, id], (err) => {
    if (err) return res.status(500).json({ error: '更新失敗' });
    res.json({ success: true });
  });
});

// ✅ 刪除單一員工資料 API
app.delete('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM employees WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ error: '刪除失敗' });
    res.json({ success: true });
  });
});

// ✅刪除某員工的已簽到紀錄
app.delete('/api/signins/:meetingId/:employeeId', (req, res) => {
  const { meetingId, employeeId } = req.params;
  db.run(`DELETE FROM signins WHERE meetingId = ? AND employeeId = ?`, [meetingId, employeeId], function (err) {
    if (err) return res.status(500).json({ error: '刪除失敗' });
    if (this.changes === 0) return res.status(404).json({ error: '找不到紀錄' });
    res.json({ success: true });
  });
});


// 建立會議
app.post('/api/meetings', (req, res) => {
  const { id, name, date, location, attendees } = req.body;
  db.run(`INSERT INTO meetings (id, name, date, location) VALUES (?, ?, ?, ?)`,
    [id, name, date, location], (err) => {
      if (err) return res.status(500).json({ error: '建立會議失敗' });

      attendees.forEach(empId => {
        db.run(`INSERT INTO meeting_attendees (meetingId, employeeId) VALUES (?, ?)`, [id, empId]);
      });

      res.json({ success: true });
    });
});

// 取得所有會議
app.get('/api/meetings', (req, res) => {
  db.all(`SELECT * FROM meetings`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: '查詢失敗' });
    res.json(rows);
  });
});

// 取得某日期已建立的會議數量，用來產生流水號
app.get('/api/meetings/count/:date', (req, res) => {
  const { date } = req.params;
  db.get(`SELECT COUNT(*) as count FROM meetings WHERE date = ?`, [date], (err, row) => {
    if (err) return res.status(500).json({ error: '查詢失敗' });
    res.json({ count: row.count });
  });
});

// 建立會議
app.post('/api/meetings', (req, res) => {
  const { id, name, date, location, attendees } = req.body;
  db.run(`INSERT INTO meetings (id, name, date, location) VALUES (?, ?, ?, ?)`,
    [id, name, date, location], (err) => {
      if (err) return res.status(500).json({ error: '建立會議失敗' });

      attendees.forEach(empId => {
        db.run(`INSERT INTO meeting_attendees (meetingId, employeeId) VALUES (?, ?)`, [id, empId]);
      });

      res.json({ success: true });
    });
});

// 刪除會議（同時刪除參加人員與簽到紀錄）
app.delete('/api/meetings/:meetingId', (req, res) => {
  const { meetingId } = req.params;

  db.run(`DELETE FROM meetings WHERE id = ?`, [meetingId], function (err) {
    if (err) return res.status(500).json({ error: '刪除會議失敗' });
    if (this.changes === 0) return res.status(404).json({ error: '找不到會議' });

    // 同時刪除相關參加人員與簽到紀錄
    db.run(`DELETE FROM meeting_attendees WHERE meetingId = ?`, [meetingId]);
    db.run(`DELETE FROM signins WHERE meetingId = ?`, [meetingId]);

    res.json({ success: true });
  });
});

// 查詢會議參加人員
app.get('/api/meetings/:meetingId/attendees', async (req, res) => {
  const { meetingId } = req.params;
  try {
    const db = await dbPromise;
    const rows = await db.all(
      `SELECT employeeId, name, department, title
       FROM meeting_attendees WHERE meetingId = ?`,
      [meetingId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// 新增會議參加人員
app.post('/api/meetings/:meetingId/attendees', async (req, res) => {
  const { meetingId } = req.params;
  const { employeeId, name, department, title } = req.body;

  try {
    const db = await dbPromise;

    // 寫入快照
    await db.run(
      `INSERT INTO meeting_attendees (meetingId, employeeId, name, department, title)
       VALUES (?, ?, ?, ?, ?)`,
      [meetingId, employeeId, name, department, title]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 刪除單一參加人員
app.delete('/api/meetings/:meetingId/attendees/:employeeId', async (req, res) => {
  const { meetingId, employeeId } = req.params;
  try {
    const db = await dbPromise;
    await db.run(
      `DELETE FROM meeting_attendees WHERE meetingId = ? AND employeeId = ?`,
      [meetingId, employeeId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ 查詢單一會議資訊
app.get('/api/meetings/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  db.get(`SELECT * FROM meetings WHERE id = ?`, [meetingId], (err, row) => {
    if (err) return res.status(500).json({ error: '查詢失敗' });
    if (!row) return res.status(404).json({ error: '找不到會議' });
    res.json(row);
  });
});

// ✅ 提供下載 data.db 檔案(會議簽到系統)
app.get('/download-meeting-db', (req, res) => {
  const filePath = path.join(process.cwd(), 'data.db'); // 根目錄的 data.db
  res.download(filePath, 'meeting.db', (err) => {
    if (err) {
      res.status(500).json({ error: '下載失敗' });
    }
  });
});


// 清空該場會議的所有參加人員
app.delete('/api/meetings/:meetingId/attendees', async (req, res) => {
  const { meetingId } = req.params;
  try {
    const db = await dbPromise;
    await db.run(`DELETE FROM meeting_attendees WHERE meetingId = ?`, [meetingId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ 產生會議簽到 QRCode
app.get('/api/qrcode/:meetingId', async (req, res) => {
  const { meetingId } = req.params;
  const url = `http://localhost:3000/signin.html?meetingId=${meetingId}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(url);
    res.json({ image: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'QRCode 產生失敗' });
  }
});











// ------------------ API ------------------

// 取得客戶清單
app.get('/api/buildings/:buildingId/customers', async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all(
    'SELECT floor, taxId, name FROM customers WHERE buildingId = ?',
    [req.params.buildingId]
  );
  res.json(rows);
});

// 新增客戶
app.post('/api/buildings/:buildingId/customers', async (req, res) => {
  const { floor, taxId, name } = req.body;
  const db = await dbPromise;
  try {
    await db.run(
      'INSERT INTO customers (buildingId, floor, taxId, name) VALUES (?, ?, ?, ?)',
      [req.params.buildingId, floor, taxId, name]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 刪除客戶
app.delete('/api/buildings/:buildingId/customers/:taxId', async (req, res) => {
  const db = await dbPromise;
  await db.run(
    'DELETE FROM customers WHERE buildingId = ? AND taxId = ?',
    [req.params.buildingId, req.params.taxId]
  );
  res.json({ success: true });
});

// 取得郵件清單 (支援 ?date=today 或 ?status=pending)
app.get('/api/buildings/:buildingId/mails', async (req, res) => {
  const db = await dbPromise;
  let rows;
  if (req.query.status === 'pending') {
    rows = await db.all(
      'SELECT mailId, carrier, customerTaxId FROM mails WHERE buildingId = ? AND signedAt IS NULL',
      [req.params.buildingId]
    );
  } else {
    rows = await db.all(
      'SELECT mailId, carrier, customerTaxId, scannedAt, signedAt FROM mails WHERE buildingId = ?',
      [req.params.buildingId]
    );
  }
  res.json(rows);
});

// 新增郵件
app.post('/api/buildings/:buildingId/mails', async (req, res) => {
  const { mailId, carrier, customerTaxId } = req.body;
  const db = await dbPromise;
  const scannedAt = new Date().toISOString();
  try {
    await db.run(
      'INSERT INTO mails (buildingId, mailId, carrier, customerTaxId, scannedAt) VALUES (?, ?, ?, ?, ?)',
      [req.params.buildingId, mailId, carrier, customerTaxId, scannedAt]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 郵件統計 (每日 / 每月)
app.get('/api/buildings/:buildingId/mails/stats', async (req, res) => {
  const db = await dbPromise;
  let rows;
  if (req.query.range === 'daily') {
    rows = await db.all(`
      SELECT strftime('%Y/%m/%d', scannedAt) AS date, COUNT(*) AS count
      FROM mails WHERE buildingId = ?
      GROUP BY date ORDER BY date
    `, [req.params.buildingId]);
  } else if (req.query.range === 'monthly') {
    rows = await db.all(`
      SELECT strftime('%Y/%m', scannedAt) AS month, COUNT(*) AS count
      FROM mails WHERE buildingId = ?
      GROUP BY month ORDER BY month
    `, [req.params.buildingId]);
  } else {
    rows = [];
  }
  res.json(rows);
});


// 刪除郵件
app.delete('/api/buildings/:buildingId/mails/:mailId', async (req, res) => {
  const db = await dbPromise;
  await db.run(
    'DELETE FROM mails WHERE buildingId = ? AND mailId = ?',
    [req.params.buildingId, req.params.mailId]
  );
  res.json({ success: true });
});


// 郵件查詢 API (支援模糊搜尋 + 待簽收篩選)
app.get('/api/buildings/:buildingId/mails/search', async (req, res) => {
  const db = await dbPromise;
  const { buildingId } = req.params;
  const { customerTaxId, date, mailId, customerName, status } = req.query;

  let sql = `
    SELECT mails.*, customers.name AS customerName
    FROM mails
    LEFT JOIN customers ON mails.customerTaxId = customers.taxId
    WHERE mails.buildingId = ?
  `;
  let params = [buildingId];

  // 狀態篩選：待簽收
  if (status === 'pending') {
    sql += ` AND mails.signedAt IS NULL`;
  }

  // 客戶統編精確篩選
  if (customerTaxId) {
    sql += ` AND mails.customerTaxId = ?`;
    params.push(customerTaxId);
  }

  // 郵件編號模糊搜尋
  if (mailId) {
    sql += ` AND mails.mailId LIKE ?`;
    params.push(`%${mailId}%`);
  }

  // 客戶名稱或統編模糊搜尋
  if (customerName) {
    sql += ` AND (customers.name LIKE ? OR customers.taxId LIKE ?)`;
    params.push(`%${customerName}%`);
    params.push(`%${customerName}%`);
  }

  // 日期篩選 (比對掃描日期)
  if (date) {
    sql += ` AND DATE(mails.scannedAt) = DATE(?)`;
    params.push(date);
  }

  sql += ` ORDER BY mails.scannedAt DESC`;

  try {
    const rows = await db.all(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ------------------ 郵件簽收 ------------------
// 郵件簽收(單筆簽收)
app.put('/api/buildings/:buildingId/mails/:mailId/sign', async (req, res) => {
  const { signatureImage, signedAt } = req.body;
  const db = await dbPromise;
  await db.run(
    'UPDATE mails SET signedAt = ?, signatureImage = ? WHERE buildingId = ? AND mailId = ?',
    [signedAt, signatureImage, req.params.buildingId, req.params.mailId]
  );
  res.json({ success: true });
});


// ✅ 一次簽收 (新增)
app.put('/api/buildings/:buildingId/mails/bulk-sign', async (req, res) => {
  const { mailIds, signatureImage, signedAt } = req.body; // mailIds 是陣列
  if (!Array.isArray(mailIds) || mailIds.length === 0) {
    return res.status(400).json({ error: "缺少郵件編號清單" });
  }

  const db = await dbPromise;
  try {
    const stmt = await db.prepare(
      'UPDATE mails SET signedAt = ?, signatureImage = ? WHERE buildingId = ? AND mailId = ?'
    );

    for (const mailId of mailIds) {
      await stmt.run([signedAt, signatureImage, req.params.buildingId, mailId]);
    }
    await stmt.finalize();

    res.json({ success: true, signedCount: mailIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ 下載 SQLite 資料庫檔案 (郵件管理系統)
app.get('/download-mail-db', (req, res) => {
  const filePath = path.join(process.cwd(), 'post-system', 'data.db'); // 指定 post-system 資料夾
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("❌ 找不到郵件資料庫檔案");
  }
  res.download(filePath, 'mail.db', err => {
    if (err) {
      console.error("❌ 郵件資料庫下載失敗", err);
      res.status(500).send("❌ 無法下載郵件資料庫");
    }
  });
});

// 舊路由兼容，指向郵件系統
app.get('/download-db', (req, res) => {
  const filePath = path.join(process.cwd(), 'post-system', 'data.db');
  res.download(filePath, 'mail.db');
});












// ✅ 可指定檔名下載
app.get('/download-db/:filename', (req, res) => {
  const { filename } = req.params;

  // 安全限制：只允許 .db 或 .sqlite 檔案
  if (!filename.endsWith('.db') && !filename.endsWith('.sqlite')) {
    return res.status(400).json({ error: '只允許下載 .db 或 .sqlite 檔案' });
  }

  const filePath = path.resolve('./backend', filename);
  res.download(filePath, filename, (err) => {
    if (err) {
      res.status(404).json({ error: '找不到指定檔案' });
    }
  });
});




// ====== 伺服器啟動 ======
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
  console.log(`📁 UPLOADS_ROOT = ${UPLOADS_ROOT}`);
  console.log(`📁 TMP_FOLDER = ${TMP_FOLDER}`);
  console.log(`📁 ABNORMAL_UPLOADS_ROOT = ${ABNORMAL_UPLOADS_ROOT}`);
});


