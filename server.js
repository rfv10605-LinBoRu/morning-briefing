// server.js（請以此檔案覆蓋或替換你現有內容）
// ====== 套件載入 ======
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsExtra from 'fs-extra';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import cors from 'cors';
import { fileURLToPath } from 'url';       // 把 import.meta.url 轉成檔案路徑
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url); // 模擬出目前檔案的完整路徑
const __dirname = dirname(__filename);             // 再從路徑取得目前資料夾



// ====== 基本設定 ======
const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_ROOT = path.join(__dirname, 'uploads');  // 勤前教育資料夾
const TMP_FOLDER = path.join(UPLOADS_ROOT, 'tmp');    // 共用暫存資料夾
const ABNORMAL_UPLOADS_ROOT = path.join(__dirname, 'uploads-abnormal');  // 大樓異常報告資料夾
console.log('UPLOADS_ROOT =', UPLOADS_ROOT);
try {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  console.log('UPLOADS_ROOT =', UPLOADS_ROOT);
} catch (err) {
  console.error('無法建立 UPLOADS_ROOT:', UPLOADS_ROOT, err);
  process.exit(1);
}

// ✅ 印出路徑確認
console.log('🗂️ 勤前教育資料夾 =', UPLOADS_ROOT);
console.log('🗂️ 暫存資料夾 =', TMP_FOLDER);
console.log('🗂️ 異常事件資料夾 =', ABNORMAL_UPLOADS_ROOT);



// ====== Middleware ======
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_ROOT));
app.use('/uploads-abnormal', express.static(ABNORMAL_UPLOADS_ROOT));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));
app.use(express.static(path.join(__dirname)));

// ✅ 確保根目錄與 tmp 子目錄存在  ✅ 建立資料夾
await fsExtra.ensureDir(UPLOADS_ROOT);
await fsExtra.ensureDir(TMP_FOLDER);
await fsExtra.ensureDir(ABNORMAL_UPLOADS_ROOT);
await fsExtra.ensureDir(path.join(UPLOADS_ROOT, 'tmp'));

// ====== multer 設定（暫存） ======
const upload = multer({ dest: TMP_FOLDER });



// 首頁
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 圖片牆預覽頁面
app.get('/gallery', (req, res) => {
  const building = req.query.building;
  const date = req.query.date;

  if (!date) return res.status(400).send('請提供日期');

  const uploadsPath = UPLOADS_ROOT;
  if (!fs.existsSync(uploadsPath)) return res.send('目前尚無上傳圖片');

  const folderPrefix = building ? `${building}-${date}` : date;
  const folders = fs.readdirSync(uploadsPath).filter(folder => folder.includes(folderPrefix));

  let html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <title>勤前照片上傳預覽</title>
      <style>
        body {
          font-family: sans-serif;
          padding: 20px;
          margin: 0;
          background-color: #f9f9f9;
        }

        h2, h3 {
          color: #333;
          margin-top: 20px;
        }

        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
        }

        .back-btn {
          display: inline-block;
          padding: 8px 12px;
           background: #007bff;
          color: #fff;
          border-radius: 6px;
          text-decoration: none;
          cursor: pointer;
        }

        input[type="date"] {
         margin-bottom: 20px;
          padding: 6px;
          font-size: 16px;
        }

        .folder-block {
          background-color: #fff;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 20px;
        }

        .folder-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }

        .img-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 10px;
        }

        .img-block {
          width: 150px;
          text-align: center;
        }

        .preview-img {
          width: 100%;
          height: auto;
          border-radius: 6px;
          border: 1px solid #ccc;
          cursor: pointer;
          transition: transform 0.2s ease;
        }

        .preview-img.zoom {
         transform: scale(3);
         z-index: 999;
         position: relative;
         box-shadow: 0 0 12px rgba(0,0,0,0.3);
         background: #fff;
         position: fixed;
         top: 50%;
         left: 50%;
         transform: translate(-50%, -50%) scale(3);
         max-width: 90vw;
         max-height: 90vh;
        }

        .action-btn {
         margin-top: 6px;
          padding: 6px 10px;
          font-size: 14px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .download-btn {
          background-color: #2ecc71;
          color: white;
        }

        .delete-btn {
          background-color: #e74c3c;
          color: white;
        }

        .download-folder-btn {
          background-color: #3498db;
          color: white;
          padding: 8px 12px;
          margin-top: 10px;
        }

        @media (max-width: 600px) {
          .img-block {
            width: 45%;
          }

          .action-btn {
            font-size: 12px;
            padding: 5px 8px;
          }

          .download-folder-btn {
            width: 100%;
          }
        }
      </style>

    </head>
    <body>
      <div class="controls">
      </div>
        <div>
          <a id="backLink" class="back-btn" href="/">回到主畫面</a>
          <a id="statsBtn" class="back-btn" style="background:#28a745; margin-left:8px;" href="/stats">勤前上傳統計</a>
        </div>

      <h2>勤前照片上傳預覽</h2>
      <label for="date">選擇日期：</label>
      <input type="date" id="date" value="${date}" onchange="filterByDate()">
  `;

  if (folders.length === 0) {
    html += `<p>尚未上傳 ${date} 的圖片</p>`;
  } else {
    folders.forEach(folder => {
      const folderPath = path.join(uploadsPath, folder);
      const files = fs.readdirSync(folderPath).filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));

      html += `
      <div class="folder-block">
        <div class="folder-header">
          <h3>${folder}</h3>
          <button class="download-folder-btn" onclick="downloadFolder('${folder}')">📦 下載整組 ${folder}</button>
        </div>
        <div class="img-grid">
    `;

      files.forEach(file => {
        const imgUrl = encodeURI(`/uploads/${folder}/${file}`);
        html += `
        <div class="img-block">
          <img src="${imgUrl}" class="preview-img">
          <br>
          <a href="${imgUrl}" download="${folder}-${file}">
          </a>
          <button class="action-btn delete-btn" onclick="deleteImage('${folder}', '${file}')">刪除</button>
        </div>
      `;
      });

      html += `</div></div>`;
    });
  }

  html += `
      <script>
        // 回上一頁按鈕：優先 history.back()，若無則用帶參數的首頁連結
        document.getElementById('backHistory').addEventListener('click', () => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            // fallback to homepage
            window.location.href = buildReturnUrl();
          }
        });

        // 將 date/building 帶回首頁（若有）
        function buildReturnUrl() {
          const params = new URLSearchParams(location.search);
          const date = params.get('date');
          const building = params.get('building');
          const url = new URL('/', location.origin);
          if (date) url.searchParams.set('date', date);
          if (building) url.searchParams.set('building', building);
          return url.toString();
        }

        // 同步設定回到首頁的連結（讓直接點擊也帶參數）
        (function setBackLink() {
          const backLink = document.getElementById('backLink');
          backLink.href = buildReturnUrl();
        })();

        document.addEventListener("DOMContentLoaded", function () {
          const backBtn = document.getElementById('backHistory');
          if (backBtn) {
            backBtn.addEventListener('click', () => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                window.location.href = buildReturnUrl();
              }
            });
          }

        const images = document.querySelectorAll(".preview-img");
        images.forEach(img => {
            img.addEventListener("click", () => {
              img.classList.toggle("zoom");
            });
          });
        });

        function filterByDate() {
          const date = document.getElementById('date').value;
          const params = new URLSearchParams(location.search);
          const building = params.get('building') || '';
          let url = '/gallery?date=' + date;
          if (building) url += '&building=' + encodeURIComponent(building);
          window.location.href = url;
        }

        function deleteImage(folder, filename) {
          const pwd = prompt('請輸入刪除密碼');
          if (pwd !== '2301') {                    <!-- ✅ 密碼變更 -->
            alert('❌ 密碼錯誤，無法刪除');
          return;
          }

          if (!confirm(\`確定要刪除 \${filename} 嗎？\`)) return;

          fetch('/delete-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder, filename })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              alert('✅ 刪除成功');
              location.reload();
            } else {
              alert('❌ 刪除失敗：' + data.message);
            }
          })
          .catch(err => {
            alert('❌ 發生錯誤');
            console.error(err);
          });
        }

        function downloadFolder(folder) {
          const link = document.createElement('a');
          link.href = '/download-folder?folder=' + encodeURIComponent(folder);
          link.download = folder + '.zip';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

      </script>
    </body>
    </html>
  `;

  res.send(html);
});

// 圖片上傳
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('請選擇圖片');

  const building = req.body.building || '未指定大樓';
  const note = req.body.note || '未指定備註';
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const folderName = `${building}-${date}`;
  const folderPath = path.join(UPLOADS_ROOT, folderName);

  if (!folderPath.startsWith(UPLOADS_ROOT + path.sep) && folderPath !== UPLOADS_ROOT) {
    return res.status(403).send('invalid folder');
  }

  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const timestamp = Date.now();
  const ext = path.extname(req.file.originalname);
  const savedFilename = `${timestamp}-${note}${ext}`;
  const newPath = path.join(folderPath, savedFilename);

  // 將 multer 暫存檔搬到目標資料夾
  fs.rename(req.file.path, newPath, (err) => {
    if (err) {
      console.error('移動檔案失敗:', err);
      return res.status(500).send('圖片儲存失敗');
    }
    res.send({ message: '上傳成功', filename: `${folderName}/${savedFilename}` });
  });
});

// 刪除圖片
app.post('/delete-image', (req, res) => {
  try {
    const { folder, filename } = req.body;
    if (!folder || !filename) {
      return res.status(400).send({ success: false, message: '缺少 folder 或 filename' });
    }

    const imagePath = path.resolve(UPLOADS_ROOT, folder, filename);
    if (!imagePath.startsWith(UPLOADS_ROOT + path.sep) && imagePath !== UPLOADS_ROOT) {
      return res.status(403).send({ success: false, message: '無效路徑' });
    }

    if (!fs.existsSync(imagePath)) {
      return res.status(404).send({ success: false, message: '圖片不存在' });
    }

    fs.unlinkSync(imagePath);

    // 檢查資料夾是否為空並刪除空資料夾
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

// 每日上傳統計（僅上班日，逐日進度表在上方、摘要在下方，含下載按鈕）
app.get('/stats', (req, res) => {
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

  const dateList = [];
  const workdayList = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    dateList.push(dateStr);
    const dateObj = new Date(`${year}-${monthStr}-${dayStr}`);
    const dow = dateObj.getDay();
    if (dow >= 1 && dow <= 5) workdayList.push(dateStr);
  }

  let holidayListRaw = [
    '2025-10-06', '114/10/10'
  ];
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

  let html = `
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${year}年${month}月 上傳統計（僅上班日）</title>
    <style>
      body { font-family: sans-serif; padding:20px; margin:0; background:#f7f8fa; color:#222; }
      .header { display:flex; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
      .back-btn { display:inline-block; padding:8px 12px; background:#007bff; color:#fff; border-radius:6px; text-decoration:none; cursor:pointer; }
      .download-btn { display:inline-block; padding:8px 12px; background:#28a745; color:#fff; border-radius:6px; text-decoration:none; cursor:pointer; }
      h2 { margin:8px 0 12px 0; }
      .summary { background:#fff; border:1px solid #e6e6e6; padding:12px; border-radius:8px; margin-top:12px; }
      .summary-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:10px; }
      .card { background:#fff; border:1px solid #eaeaea; padding:10px; border-radius:8px; }
      input[type="month"] { padding:6px; }

      .table-wrap { background:#fff; border:1px solid #e6e6e6; border-radius:8px; padding:8px; max-height:66vh; overflow:auto; }
      table { border-collapse:collapse; width:100%; min-width:700px; }
      th, td { border:1px solid #ddd; padding:6px 10px; text-align:center; white-space:nowrap; background:#fff; }
      th { background:#f3f6fb; position:sticky; top:0; z-index:5; font-weight:600; }
      td:first-child, th:first-child { position:sticky; left:0; background:#f9fafb; z-index:6; text-align:left; padding-left:12px; }
      td.ok { color:#0a8a3c; font-weight:700; cursor:pointer; }
      td.miss { color:#e03e2d; font-weight:700; cursor:pointer; }
    </style>
  </head>
  <body>
    <div class="header">
      <a id="backLink" class="back-btn" href="/">回到主畫面</a>
      <div>
        <label for="month">選擇月份：</label>
        <input type="month" id="month" value="${selectedMonth}" onchange="changeMonth()">
      </div>
      <a id="downloadExcelBtn" class="download-btn" href="/stats/download?month=${selectedMonth}">下載 Excel</a>
    </div>

    <h2>${year}年${month}月 台北南區勤前上傳統計（僅上班日）</h2>

    <!-- 逐日進度表（上方） -->
    <div class="table-wrap">
      <table>
        <tr><th>大樓別</th>`;

  filteredWorkdayList.forEach(date => { html += `<th>${date}</th>`; });
  html += `</tr>`;

  buildings.forEach(building => {
    html += `<tr><td>${building}</td>`;
    filteredWorkdayList.forEach(date => {
      const folderPath = path.join(uploadsPath, `${building}-${date}`);
      const exists = fs.existsSync(folderPath);
      html += `<td class="${exists ? 'ok' : 'miss'}" onclick="viewGallery('${building}','${date}')">${exists ? '✅' : '⛔'}</td>`;
    });
    html += `</tr>`;
  });

  html += `
      </table>
    </div>

    <!-- 摘要（下方） -->
    <div class="summary">
      <div>本月共 <strong>${buildings.length}</strong> 棟大樓，實際上班日 <strong>${filteredWorkdayList.length}</strong> 天（排除週末${holidayList.length ? '與指定假日' : ''}）。</div>
      <div style="margin-top:8px;" class="summary-grid">`;

  buildings.forEach(b => {
    const uploaded = buildingStats[b];
    const denom = filteredWorkdayList.length || 1;
    const rate = ((uploaded / denom) * 100).toFixed(1);
    const warn = denom > 0 && rate < 80 ? ' ⚠️' : '';
    html += `<div class="card"><strong>${b}</strong><div style="margin-top:6px;">${uploaded}/${filteredWorkdayList.length} 天</div><div style="color:#666;margin-top:6px;">上傳率：${rate}%${warn}</div></div>`;
  });

  html += `
      </div>
      <div style="margin-top:10px;color:#666;">已排除假日： ${holidayList.length ? holidayList.join(', ') : '無'}</div>
    </div>

    <script>
      function changeMonth() {
        const m = document.getElementById('month').value;
        document.getElementById('downloadExcelBtn').href = '/stats/download?month=' + m;
        window.location.href = '/stats?month=' + m;
      }
      function viewGallery(building, date) {
        window.open('/gallery?building=' + encodeURIComponent(building) + '&date=' + date, '_blank');
      }
    </script>
  </body>
  </html>
  `;

  res.send(html);
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

app.get('/download-folder', (req, res) => {
  const folder = req.query.folder;
  if (!folder) return res.status(400).send('缺少 folder 參數');

  const folderPath = path.join(UPLOADS_ROOT, folder);
  if (!fs.existsSync(folderPath)) return res.status(404).send('資料夾不存在');

  const encodedFilename = encodeURIComponent(folder + '.zip');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.directory(folderPath, false);
  archive.pipe(res);
  archive.finalize();
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
      if (subtype && meta.subtype !== subtype) continue;
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

//變更事件狀態
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

//✅ PATCH 修改事件內容
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

//✅ POST 上傳圖片（分類欄位改用多欄位 Multer）
app.post('/api/abnormal-events/:id/files', upload.fields([
  { name: 'initial', maxCount: 1 },
  { name: 'processing', maxCount: 1 },
  { name: 'resolved', maxCount: 1 },
  { name: 'other', maxCount: 1 }
]), async (req, res) => {
  const id = req.params.id;
  const category = req.body.category || 'general';
  const file = req.files?.[category]?.[0]; // ✅ 根據分類取出對應檔案
  if (!file) {
    console.error('❌ Multer 未收到檔案，可能欄位名稱錯誤或未選擇檔案');
    console.log('📦 req.files keys:', Object.keys(req.files || {}));
    console.log('📦 req.body.category:', category);
    return res.status(400).json({ error: '未收到檔案' });
  }


  if (!file) return res.status(400).json({ error: '未收到檔案' });

  try {
    console.log('📥 上傳中:', {
      id,
      category,
      field: category,
      file: file.originalname,
      path: file.path
    });

    const folders = await fsExtra.readdir(ABNORMAL_UPLOADS_ROOT);
    for (const folder of folders) {
      const metaPath = path.join(ABNORMAL_UPLOADS_ROOT, folder, 'meta.json');
      const meta = await fsExtra.readJson(metaPath);
      console.log('📁 資料夾:', folder);
      console.log('🆔 meta.id:', meta?.id);
      console.log('🔍 前端送入 id:', id);
      if (meta?.id === id) {
        const safeName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        const targetPath = path.join(ABNORMAL_UPLOADS_ROOT, folder, safeName);
        await fsExtra.move(file.path, targetPath);

        meta.files = meta.files || [];
        meta.files.push({
          filename: safeName,
          url: `/uploads-abnormal/${folder}/${safeName}`,
          mimetype: file.mimetype,
          category
        });

        await fsExtra.writeJson(metaPath, meta, { spaces: 2 });
        return res.json({ ok: true });
      }
    }

    res.status(404).json({ error: '事件不存在' });
  } catch (err) {
    console.error('❌ 上傳失敗:', err);
    res.status(500).json({ error: 'server error' });
  }
});


//✅ DELETE 刪除圖片
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

// ====== 伺服器啟動 ======
app.listen(PORT, () => {
  console.log(`✅ 伺服器啟動於 http://localhost:${PORT} ; UPLOADS_ROOT=${UPLOADS_ROOT}`);
});