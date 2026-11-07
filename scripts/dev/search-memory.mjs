// node --expose-gc scripts/dev/search-memory.mjs  (DB_FILE=/tmp/big.db) — heap cost of the search index
import '../../server/config.js';
import { getDocs } from '../../server/search.js';
const mb = (n) => Math.round(n / 1048576);
global.gc(); const before = process.memoryUsage();
const docs = getDocs();
global.gc(); const after = process.memoryUsage();
console.log(`docs ${docs.length}, heap ${mb(before.heapUsed)} -> ${mb(after.heapUsed)} MB (+${mb(after.heapUsed - before.heapUsed)}), rss ${mb(after.rss)} MB`);
