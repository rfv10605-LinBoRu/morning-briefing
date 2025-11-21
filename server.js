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

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));



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
        grid-template-columns: 200px 200px 200px; /* ✅ 每欄固定 160px */
        gap: 16px; /* ✅ 格子間距 */
        justify-content: center;
        margin-top: 20px;
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
        .grid {
          grid-template-columns: repeat(1, 1fr); /* ✅ 手機一欄 */
        }
        .square-btn a {
          font-size: 14px;
          padding: 10px;
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
      <div class="square-btn"><a href="/stats">📊<br>統計報表</a></div>
      <div class="square-btn"><a href="/public/abnormal.html">📋<br>建立異常報告</a></div>
      <div class="square-btn"><a href="/public/abnormal-query.html">📑<br>查詢異常報告</a></div>
      <div class="square-btn"><a href="">📊<br>統計異常報告(建置中)</a></div>
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
app.post('/upload-image', upload.array('files', 10), (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) return res.status(400).send('請選擇圖片');

  const building = req.body.building || '未指定大樓';
  const note = req.body.note || '未指定備註';
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const folderName = `${building}-${date}`;
  const folderPath = path.join(UPLOADS_ROOT, folderName);

  if (!folderPath.startsWith(UPLOADS_ROOT + path.sep)) {
    return res.status(403).send('invalid folder');
  }

  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const savedFiles = [];

  files.forEach(file => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const savedFilename = `${timestamp}-${note}${ext}`;
    const newPath = path.join(folderPath, savedFilename);

    fs.renameSync(file.path, newPath); // ✅ 同步搬移，簡化流程
    savedFiles.push(`${folderName}/${savedFilename}`);
  });

  res.send({
    message: `✅ 上傳成功，共 ${savedFiles.length} 張`,
    files: savedFiles
  });
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

  let holidayListRaw = ['2025-10-06', '114/10/10'];
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
  '頭份大樓': 'L367'
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


app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});





// ====== 伺服器啟動 ======
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
  console.log(`📁 UPLOADS_ROOT = ${UPLOADS_ROOT}`);
  console.log(`📁 TMP_FOLDER = ${TMP_FOLDER}`);
  console.log(`📁 ABNORMAL_UPLOADS_ROOT = ${ABNORMAL_UPLOADS_ROOT}`);
});


