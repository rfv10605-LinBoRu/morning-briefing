// server.js（請以此檔案覆蓋或替換你現有內容）
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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
        body { font-family: sans-serif; padding: 20px; }
        h2, h3 { color: #333; }
        .preview-img { width: 150px; height: auto; margin: 10px; cursor: pointer; transition: transform 0.2s ease; }
        .preview-img.zoom { transform: scale(3); z-index: 999; position: relative; }
        input[type="date"] { margin-bottom: 20px; padding: 5px; }
        .img-block { display: inline-block; text-align: center; margin: 10px; }
        button { margin-top: 5px; padding: 5px 10px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background-color: #c0392b; }
      </style>
    </head>
    <body>
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
      html += `<h3>${folder}</h3>`;
      files.forEach(file => {
        const imgUrl = encodeURI(`/uploads/${folder}/${file}`);
        html += `
          <div class="img-block">
            <img src="${imgUrl}" class="preview-img">
            <br>
            <button onclick="deleteImage('${folder}', '${file}')">刪除</button>
          </div>
        `;
      });
    });
  }

  html += `
      <script>
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

// 每日上傳統計
app.get('/stats', (req, res) => {
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
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dateList.push(dateStr);
  }

  let html = `
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${year}年${month}月 上傳統計</title>
    <style>
      body { font-family: sans-serif; padding: 20px; }
      table { display: block; overflow-x: auto; white-space: nowrap; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 5px 10px; text-align: center; white-space: nowrap; }
      th { background-color: #f0f0f0; }
      td.ok { color: green; font-weight: bold; }
      td.miss { color: red; font-weight: bold; }
      input[type="month"] { margin-bottom: 20px; padding: 5px; }
    </style>
  </head>
  <body>
    <h2>${year}年${month}月 台北南區勤前上傳統計</h2>
    <label for="month">選擇月份：</label>
    <input type="month" id="month" value="${selectedMonth}" onchange="changeMonth()">
    <script>
      function changeMonth() {
        const m = document.getElementById('month').value;
        window.location.href = '/stats?month=' + m;
      }
    </script>
    <table>
      <tr><th>大樓別</th>`;

  dateList.forEach(date => {
    html += `<th>${date}</th>`;
  });
  html += `</tr>`;

  buildings.forEach(building => {
    html += `<tr><td>${building}</td>`;
    dateList.forEach(date => {
      const folderName = `${building}-${date}`;
      const folderPath = path.join(uploadsPath, folderName);
      const exists = fs.existsSync(folderPath);
      html += `<td class="${exists ? 'ok' : 'miss'}">${exists ? '✅' : '❌'}</td>`;
    });
    html += `</tr>`;
  });

  html += `</table></body></html>`;
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

app.listen(PORT, () => {
  console.log(`伺服器啟動於 http://localhost:${PORT} ; UPLOADS_ROOT=${UPLOADS_ROOT}`);
});