/** Server locale minimale per vedere l'anteprima di dist/ (http://localhost:8080/). */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

createServer(async (req, res) => {
    let file = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    try {
        if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
        const body = await readFile(path.join(DIST, '404.html')).catch(() => 'Not found');
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
    }
}).listen(PORT, () => console.log(`Anteprima su http://localhost:${PORT}/`));
