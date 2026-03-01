// morning-briefing/backend/db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export const db = await open({
  filename: './backend/database.sqlite',
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS building_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buildingId INTEGER,
    itemId INTEGER,
    quantity REAL
  )
`);
