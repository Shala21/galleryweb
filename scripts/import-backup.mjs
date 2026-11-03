/**
 * Converte il backup JSON esportato dal vecchio pannello PHP (admin/backup_export.php)
 * nei file di contenuto di questo progetto (content/settings.json e content/sections/*.json).
 *
 * Uso: node scripts/import-backup.mjs percorso/backup.json [--replace]
 * Le immagini non sono nel backup: copia i file della vecchia cartella uploads/ in site/uploads/.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECTIONS_DIR = path.join(ROOT, 'content', 'sections');
const UPLOADS_DIR = path.join(ROOT, 'site', 'uploads');

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const backupPath = args.find((a) => !a.startsWith('--'));

if (!backupPath) {
    console.error('Uso: node scripts/import-backup.mjs percorso/backup.json [--replace]');
    process.exit(1);
}

const slugify = (text) => String(text ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const isActive = (row) => row.deleted_at === null || row.deleted_at === undefined || row.deleted_at === '';
const flag = (value) => value === 1 || value === '1' || value === true;
const num = (value, fallback) => (value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? fallback : Number(value));
const bySort = (a, b) => num(a.sort_order, 0) - num(b.sort_order, 0) || num(a.id, 0) - num(b.id, 0);
const uploadRef = (filename) => (filename ? `/uploads/${String(filename).split(/[\\/]/).pop()}` : '');

const backup = JSON.parse((await readFile(backupPath, 'utf8')).replace(/^\uFEFF/, ''));

const existing = existsSync(SECTIONS_DIR) ? (await readdir(SECTIONS_DIR)).filter((f) => f.endsWith('.json')) : [];
if (existing.length && !replace) {
    console.error(`content/sections contiene già ${existing.length} file (anche il contenuto di esempio). Rilancia con --replace per sostituirli.`);
    process.exit(1);
}
if (replace) {
    await rm(SECTIONS_DIR, { recursive: true, force: true });
}
await mkdir(SECTIONS_DIR, { recursive: true });

const settings = { ...(backup.settings || {}) };
delete settings.smtp_password;
for (const key of Object.keys(settings)) {
    if (key.startsWith('smtp_')) delete settings[key];
}
await writeFile(path.join(ROOT, 'content', 'settings.json'), JSON.stringify(settings, null, 2) + '\n', 'utf8');

const headers = new Map((backup.section_headers || []).filter((r) => r.section_id != null).map((r) => [Number(r.section_id), r]));
const imagesByBlock = new Map();
for (const img of [...(backup.images || [])].sort(bySort)) {
    const list = imagesByBlock.get(Number(img.block_id)) || [];
    list.push(img);
    imagesByBlock.set(Number(img.block_id), list);
}

const usedSlugs = new Set();
const referencedImages = new Set();
const track = (filename) => { if (filename) referencedImages.add(String(filename).split(/[\\/]/).pop()); };
let sectionCount = 0;

for (const section of backup.sections || []) {
    if (!isActive(section)) continue;

    let slug = slugify(section.slug) || slugify(section.title) || `sezione-${section.id}`;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${slugify(section.slug) || 'sezione'}-${n}`;
    usedSlugs.add(slug);

    const header = headers.get(Number(section.id));
    track(header?.image);

    const blocks = (backup.blocks || [])
        .filter((b) => Number(b.section_id) === Number(section.id) && isActive(b))
        .sort(bySort)
        .map((b) => {
            const images = (imagesByBlock.get(Number(b.id)) || []).map((img) => {
                track(img.filename);
                return { image: uploadRef(img.filename), caption: img.caption || '', alt: img.alt_text || '' };
            });
            switch (b.block_type) {
                case 'text': return { type: 'text', content: b.content_text || '' };
                case 'gallery': return { type: 'gallery', images };
                case 'image': return { type: 'image', image: images[0]?.image || '', caption: images[0]?.caption || '', alt: images[0]?.alt || '' };
                case 'quote': return { type: 'quote', text: b.content_text || '', author: b.content_meta || '' };
                case 'video': return { type: 'video', url: b.content_meta || '', caption: b.content_text || '' };
                case 'separator': return { type: 'separator' };
                default: return null;
            }
        })
        .filter(Boolean);

    const data = {
        title: section.title || slug,
        menu_label: section.menu_label || section.title || slug,
        published: flag(section.is_published),
        show_in_menu: flag(section.show_in_menu),
        is_home: flag(section.is_home),
        menu_order: num(section.menu_order, 0),
        excerpt: section.excerpt || '',
        seo_description: section.seo_description || '',
        hero: {
            image: uploadRef(header?.image),
            title: header?.title || '',
            subtitle: header?.subtitle || '',
            text_position: header?.text_position || 'center',
            overlay_opacity: num(header?.overlay_opacity, 45),
            height_variant: header?.height_variant || 'medium',
        },
        blocks,
    };
    await writeFile(path.join(SECTIONS_DIR, `${slug}.json`), JSON.stringify(data, null, 2) + '\n', 'utf8');
    sectionCount++;
}

const missing = [...referencedImages].filter((name) => !existsSync(path.join(UPLOADS_DIR, name)));
console.log(`Importate ${sectionCount} sezioni e le impostazioni del sito.`);
if (missing.length) {
    console.log(`Immagini ancora da copiare in site/uploads/ (${missing.length} su ${referencedImages.size}):`);
    missing.forEach((name) => console.log(`  - ${name}`));
} else {
    console.log(`Tutte le ${referencedImages.size} immagini referenziate sono presenti in site/uploads/.`);
}
