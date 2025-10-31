const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = 3000;

// 首頁
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ 顯示所有已上傳圖片
app.get('/gallery', (req, res) => {
  const uploadsPath = path.join(__dirname, 'uploads');
  const selectedDate = req.query.date; // 從前端傳來的 ?date=yyyy-mm-dd

  if (!fs.existsSync(uploadsPath)) {
    return res.send('目前尚無上傳圖片');
  }

  const folders = fs.readdirSync(uploadsPath);
  const filteredFolders = selectedDate
    ? folders.filter(name => name.endsWith(selectedDate))
    : folders;

  let html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <title>圖片預覽</title>
      <style>
        body {
          font-family: sans-serif;
          padding: 20px;
        }
        h2, h3 {
          color: #333;
        }
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
      </style>
    </head>
    <body>
      <h2>勤前照片上傳預覽</h2>
      <label for="date">選擇日期：</label>
      <input type="date" id="date" value="${selectedDate || ''}" onchange="filterByDate()">
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
      </script>
  `;

  if (filteredFolders.length === 0) {
    html += `<p>尚未上傳 ${selectedDate || '指定日期'} 的圖片</p>`;
  } else {
    filteredFolders.forEach(folder => {
      const folderPath = path.join(uploadsPath, folder);
      const files = fs.readdirSync(folderPath);
      html += `<h3>${folder}</h3>`;
      files.forEach(file => {
        const imgUrl = `/uploads/${folder}/${file}`;
        html += `<img src="${imgUrl}" class="preview-img">`;
      });
    });
  }

  html += `</body></html>`;
  res.send(html);
});


// ✅ 解析表單欄位（包含 building）
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // 提供 index.html
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ 暫存圖片，稍後移動到指定資料夾
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'temp'); // 所有圖片先存到 temp 資料夾
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}-${file.originalname}`);
  }
});


// ✅ 單張圖片上傳（四個按鈕都呼叫這個）
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('請選擇圖片');
  }

  const building = req.body.building || '未指定大樓';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`; // ✅ 正確的台灣時間
  const folderName = `${building}-${date}`;
  const folderPath = path.join(__dirname, 'uploads', folderName);

  console.log('收到上傳請求');

  // 建立資料夾（如果尚未存在）
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // 移動圖片到指定資料夾
  const oldPath = req.file.path;
  const newPath = path.join(folderPath, req.file.filename);

  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error('移動檔案失敗:', err);
      return res.status(500).send('圖片儲存失敗');
    }
    res.send(`圖片已儲存至 ${folderName}`);
  });
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
  const selectedMonth = req.query.month || now.toISOString().slice(0, 7); // 格式 yyyy-MM
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


