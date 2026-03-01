// init-db.js (ES module 格式)
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const buildings = [
  { id: 'L391', name: '松山金融' },
  { id: 'L336', name: '前瞻金融' },
  { id: 'N364', name: '全球民權' },
  { id: 'L217', name: '產物大樓' },
  { id: 'N307', name: '芷英大樓' },
  { id: 'N236', name: '華航大樓' },
  { id: 'L169', name: '南京科技' },
  { id: 'N113', name: '互助營造' },
  { id: 'L126', name: '摩天大樓' },
  { id: 'N274', name: '新莊農會' },
  { id: 'N393', name: '儒鴻企業' },
  { id: 'L384', name: '新板傑仕堡' },
  { id: 'L371', name: '新板金融' },
  { id: 'L137', name: '桃園金融' },
  { id: 'L215', name: '新竹大樓' },
  { id: 'L390', name: '竹科大樓' },
  { id: 'L367', name: '頭份大樓' }
];

const dbFile = './data.db';

const run = async () => {
  const db = await open({ filename: dbFile, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      name TEXT
    );
  `);

  for (const b of buildings) {
    await db.run('INSERT OR IGNORE INTO buildings (id, name) VALUES (?, ?)', [b.id, b.name]);
  }

  console.log('✅ 大樓清單已初始化完成');
  await db.close();
};

run();
