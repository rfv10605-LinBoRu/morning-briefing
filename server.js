const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = 3000;
const cors = require('cors');
const router = express.Router();

// 首頁
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(cors());

// ✅ 圖片牆預覽頁面
app.get('/gallery', (req, res) => {
  const uploadsPath = path.join(__dirname, 'uploads');
  const building = req.query.building;
  const date = req.query.date;

  if (!date) return res.status(400).send('請提供日期');
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
        .preview-img {
          width: 150px;
          height: auto;
          margin: 10px;
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .preview-img.zoom {
          transform: scale(3);
          z-index: 999;
          position: relative;
        }
        input[type="date"] {
          margin-bottom: 20px;
          padding: 5px;
        }
        .img-block {
          display: inline-block;
          text-align: center;
          margin: 10px;
        }
        button {
          margin-top: 5px;
          padding: 5px 10px;
          background-color: #e74c3c;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background-color: #c0392b;
        }
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
          window.location.href = '/gallery?date=' + date;
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

// ✅ 解析表單欄位
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ 圖片上傳
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('請選擇圖片');

  const building = req.body.building || '未指定大樓';
  const note = req.body.note || '未指定備註';
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const folderName = `${building}-${date}`;
  const folderPath = path.join(__dirname, 'uploads', folderName);

  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const timestamp = Date.now();
  const ext = path.extname(req.file.originalname);
  const savedFilename = `${timestamp}-${note}${ext}`;
  const newPath = path.join(folderPath, savedFilename);

  fs.rename(req.file.path, newPath, (err) => {
    if (err) {
      console.error('移動檔案失敗:', err);
      return res.status(500).send('圖片儲存失敗');
    }
    res.send({ message: '上傳成功', filename: `${folderName}/${savedFilename}` });
  });
});

// ✅ 刪除圖片
app.post('/delete-image', express.json(), (req, res) => {
  try {
    const { folder, filename } = req.body;
    if (!folder || !filename) {
      return res.status(400).send({ success: false, message: '缺少 folder 或 filename' });
    }

    // uploads 根目錄（調整成你專案實際路徑）
    const UPLOADS_ROOT = path.resolve(__dirname, 'uploads');

    // 在路由內宣告 imagePath（確保作用域內可用）
    const imagePath = path.resolve(UPLOADS_ROOT, folder, filename);

    // 防止路徑穿越（確保 imagePath 在 UPLOADS_ROOT 之下）
    if (!imagePath.startsWith(UPLOADS_ROOT + path.sep) && imagePath !== UPLOADS_ROOT) {
      return res.status(403).send({ success: false, message: '無效路徑' });
    }

    if (!fs.existsSync(imagePath)) {
      return res.status(404).send({ success: false, message: '圖片不存在' });
    }

    // 刪除檔案
    fs.unlinkSync(imagePath);

    // 檢查資料夾是否為空並刪除空資料夾
    const folderPath = path.dirname(imagePath);
    const remaining = fs.readdirSync(folderPath).filter(n => n !== '.' && n !== '..');
    if (remaining.length === 0) {
      try { fs.rmdirSync(folderPath); }
      catch (err) { console.error('刪除資料夾失敗', err); }
      return res.send({ success: true, message: '圖片已刪除，資料夾為空已刪除' });
    }

    return res.send({ success: true, message: '圖片已刪除' });
  } catch (err) {
    console.error('刪除圖片錯誤', err);
    return res.status(500).send({ success: false, message: '伺服器錯誤' });
  }
});



// ✅ 每日上傳統計
app.get('/stats', (req, res) => {
  const uploadsPath = path.join(__dirname, 'uploads');
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

app.listen(PORT, () => {
  console.log(`伺服器啟動於 http://localhost:${PORT}`);
});

