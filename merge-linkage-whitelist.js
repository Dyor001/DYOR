const fs = require('fs');
const p = '/root/binance-fund-viewer/linkage-whitelist.json';
const raw = fs.readFileSync('/tmp/linkage-emails.json', 'utf8').replace(/^\uFEFF/, '');
const add = JSON.parse(raw);
let data = { emails: [] };
try { data = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch (error) {}
const merged = [...new Set([...(data.emails || []), ...add].map(x => String(x).toLowerCase().trim()).filter(Boolean))];
fs.writeFileSync(p, JSON.stringify({ emails: merged, updatedAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ added: add.length, total: merged.length }, null, 2));
