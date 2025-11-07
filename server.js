// server.js（請以此檔案覆蓋或替換你現有內容）
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const archiver = require('archiver');


// 以環境變數為主，Railway 上請設定 UPLOADS_ROOT=/data/uploads（或你設定的 mount path）
const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_ROOT || path.join(__dirname, 'uploads'));

// 啟動時建立必要目錄（uploads root 與 tmp）
try {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_ROOT, 'tmp'), { recursive: true });
  console.log('UPLOADS_ROOT =', UPLOADS_ROOT);
} catch (err) {
  console.error('無法建立 UPLOADS_ROOT:', UPLOADS_ROOT, err);
  process.exit(1);
}

// multer 暫存設定，暫存在永久磁碟下的 tmp（避免寫到 container ephemeral）
const upload = multer({ dest: path.join(UPLOADS_ROOT, 'tmp') });

const cors = require('cors');

// 首頁
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(cors());

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
          <a id="backLink" class="back-btn" href="/">← 回到台北南區勤前照片上傳系統</a>
          <a id="statsBtn" class="back-btn" style="background:#28a745; margin-left:8px;" href="/stats">台北南區勤前上傳統計</a>
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
            <button class="action-btn download-btn">下載</button>
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

// 解析表單欄位
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 靜態資源：根目錄與永久 uploads
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_ROOT));
app.use(express.static(path.join(__dirname, 'public')));

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

// 每日上傳統計（僅上班日，逐日進度表在上方、摘要在下方）
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

  // 建立完整日期清單與上班日清單（週一~週五）
  const dateList = [];
  const workdayList = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    dateList.push(dateStr);

    const dateObj = new Date(`${year}-${monthStr}-${dayStr}`);
    const dow = dateObj.getDay(); // 0=Sun,6=Sat
    if (dow >= 1 && dow <= 5) workdayList.push(dateStr);
  }

  // ===== 假日清單（支援 YYYY-MM-DD 與 ROC 格式） =====
  let holidayListRaw = [
    '2025-10-06', '114/10/10'
    // 例：'2025-11-03', '114/11/01'
  ];
  if (req.query.holidays) {
    holidayListRaw = holidayListRaw.concat(
      req.query.holidays.split(',').map(s => s.trim()).filter(Boolean)
    );
  }

  function normalizeHoliday(h) {
    if (!h) return null;
    h = h.trim();
    // 西元 YYYY-MM-DD
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(h)) {
      const parts = h.split('-');
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // ROC 114/11/1、114-11-01
    const m2 = h.match(/^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m2) {
      const rocYear = parseInt(m2[1], 10);
      const mm = String(m2[2]).padStart(2, '0');
      const dd = String(m2[3]).padStart(2, '0');
      const gy = rocYear + 1911;
      return `${gy}-${mm}-${dd}`;
    }
    return null;
  }

  const holidayList = Array.from(new Set(holidayListRaw.map(normalizeHoliday).filter(Boolean)));

  // 從 workdayList 排除假日
  const filteredWorkdayList = workdayList.filter(d => !holidayList.includes(d));

  // 統計每棟大樓在上班日的上傳次數
  const buildingStats = {};
  buildings.forEach(building => {
    let count = 0;
    filteredWorkdayList.forEach(date => {
      const folderName = `${building}-${date}`;
      const folderPath = path.join(uploadsPath, folderName);
      if (fs.existsSync(folderPath)) count++;
    });
    buildingStats[building] = count;
  });

  // 產生 HTML（逐日進度表在上方，摘要在下方）
  let html = `
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${year}年${month}月 上傳統計（僅上班日）</title>
    <style>
      body { font-family: sans-serif; padding: 20px; margin:0; background:#f7f8fa; color:#222; }
      .header { display:flex; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
      .back-btn { display:inline-block; padding:8px 12px; background:#007bff; color:#fff; border-radius:6px; text-decoration:none; cursor:pointer; }
      h2 { margin:8px 0 12px 0; }
      .summary { background:#fff; border:1px solid #e6e6e6; padding:12px; border-radius:8px; margin-top:12px; }
      .summary-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; }
      .card { background:#fff; border:1px solid #eaeaea; padding:10px; border-radius:8px; }
      input[type="month"] { padding:6px; }

      .table-wrap { background:#fff; border:1px solid #e6e6e6; border-radius:8px; padding:8px; max-height:66vh; overflow:auto; }
      table { border-collapse: collapse; width:100%; min-width:700px; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: center; white-space: nowrap; background-color: #fff; }
      th { background-color: #f3f6fb; position: sticky; top: 0; z-index: 5; font-weight: 600; }
      td:first-child, th:first-child { position: sticky; left: 0; background-color: #f9fafb; z-index: 6; text-align: left; padding-left: 12px; }
      td.ok { color: #0a8a3c; font-weight: 700; cursor: pointer; }
      td.miss { color: #e03e2d; font-weight: 700; cursor: pointer; }
      tr:hover td { background-color: #fcfdfe; }
    </style>
  </head>
  <body>
    <div class="header">
      <a id="backLink" class="back-btn" href="/">← 回到台北南區勤前照片上傳系統</a>
      <div>
        <label for="month">選擇月份：</label>
        <input type="month" id="month" value="${selectedMonth}" onchange="changeMonth()">
      </div>
    </div>

    <h2>${year}年${month}月 台北南區勤前上傳統計（僅上班日）</h2>

    <!-- 逐日進度表（放在上方） -->
    <div class="table-wrap">
      <table>
        <tr>
          <th>大樓別</th>
  `;

  // 表頭：僅顯示上班日
  filteredWorkdayList.forEach(date => {
    html += `<th>${date}</th>`;
  });

  html += `</tr>`;

  // 每棟逐日狀態
  buildings.forEach(building => {
    html += `<tr><td>${building}</td>`;
    filteredWorkdayList.forEach(date => {
      const folderName = `${building}-${date}`;
      const folderPath = path.join(uploadsPath, folderName);
      const exists = fs.existsSync(folderPath);
      html += `<td class="${exists ? 'ok' : 'miss'}" onclick="viewGallery('${building}', '${date}')">${exists ? '✅' : '⛔'}</td>`;
    });
    html += `</tr>`;
  });

  html += `
      </table>
    </div>

    <!-- 統計摘要（放在下方） -->
    <div class="summary">
      <div>本月共 <strong>${buildings.length}</strong> 棟大樓，實際上班日 <strong>${filteredWorkdayList.length}</strong> 天（排除週末${holidayList.length ? '與指定假日' : ''}）。</div>
      <div style="margin-top:8px;" class="summary-grid">
  `;

  // 摘要卡片（每棟上傳率）
  buildings.forEach(b => {
    const uploaded = buildingStats[b];
    const denom = filteredWorkdayList.length || 1;
    const rate = ((uploaded / denom) * 100).toFixed(1);
    const warn = denom > 0 && rate < 80 ? ' ⚠️' : '';
    html += `<div class="card"><strong>${b}</strong><div style="margin-top:6px;">${uploaded}/${filteredWorkdayList.length} 天</div><div style="color:#666; margin-top:6px;">上傳率：${rate}%${warn}</div></div>`;
  });

  html += `
      </div>
      <div style="margin-top:10px; color:#666;">已排除假日： ${holidayList.length ? holidayList.join(', ') : '無'}</div>
    </div>

    <script>
      function changeMonth() {
        const m = document.getElementById('month').value;
        window.location.href = '/stats?month=' + m;
      }

      function viewGallery(building, date) {
        window.open('/gallery?building=' + encodeURIComponent(building) + '&date=' + date, '_blank');
      }

      document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('backHistory')?.addEventListener('click', () => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = '/';
          }
        });
      });
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


app.listen(PORT, () => {
  console.log(`伺服器啟動於 http://localhost:${PORT} ; UPLOADS_ROOT=${UPLOADS_ROOT}`);
});