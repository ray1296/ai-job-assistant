import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(new URL('../private/career.sqlite',import.meta.url));
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=3000;');
const result=db.prepare("DELETE FROM users WHERE email GLOB 'browser-[0-9]*@example.invalid'").run();
console.log('Removed browser test accounts:',result.changes);db.close();
