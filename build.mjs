/**
 * Generatore del sito statico: legge content/settings.json e content/sections/*.json
 * e scrive le pagine HTML in dist/, insieme ai file statici della cartella site/.
 * I link sono relativi, quindi il sito funziona su qualsiasi indirizzo (anche github.io/nome-repo/).
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sanitizeHtml from 'sanitize-html';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(ROOT, 'content');
const SITE_DIR = path.join(ROOT, 'site');
const DIST_DIR = path.join(ROOT, 'dist');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const h = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const NON_TEXT_TAGS = ['script', 'style', 'textarea', 'option', 'iframe', 'object', 'embed', 'svg', 'math', 'template'];

function sanitize(html, allowedTags) {
    return sanitizeHtml(String(html ?? ''), {
        allowedTags,
        allowedAttributes: { a: ['href', 'title'] },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowProtocolRelative: false,
        nonTextTags: NON_TEXT_TAGS,
        transformTags: {
            a: (tagName, attribs) => ({
                tagName,
                attribs: attribs.href ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
            }),
        },
    });
}

const BLOCK_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'span'];
const INLINE_TAGS = ['strong', 'em', 'b', 'i', 'a', 'br'];

// Testo semplice (senza tag di blocco): righe vuote = nuovo paragrafo, a capo singolo = <br>
function renderTextBlock(stored) {
    const html = sanitize(stored, BLOCK_TAGS);
    if (html === '' || /<(p|ul|ol|h[2-4]|blockquote)[\s>]/i.test(html)) {
        return html;
    }
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .trim()
        .split(/(?:\r?\n){2,}/)
        .map((paragraph) => `<p>${paragraph.trim().replace(/\r?\n/g, '<br>')}</p>`)
        .join('');
}

const renderInlineText = (stored) => sanitize(stored, INLINE_TAGS);

function videoEmbedUrl(url) {
    const value = String(url ?? '').trim();
    let m = value.match(/^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{6,})/i)
        || value.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{6,})/i);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    m = value.match(/^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i);
    return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}

function safeHttpUrl(url) {
    try {
        const parsed = new URL(String(url ?? '').trim());
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
        return '';
    }
}

const safeHexColor = (color, fallback = '#c9a24b') =>
    /^#[0-9a-fA-F]{6}$/.test(String(color ?? '').trim()) ? String(color).trim() : fallback;

const isEmail = (value) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(value ?? '').trim());

// I file caricati stanno tutti in site/uploads: del valore salvato conta solo il nome del file
function imageUrl(root, value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return safeHttpUrl(raw) || null;
    const name = raw.split(/[\\/]/).pop();
    if (!name) return null;
    return `${root}uploads/${encodeURIComponent(name).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

const truthy = (value, fallback = false) => (value === undefined || value === null || value === '' ? fallback : value === true || value === 1 || value === '1' || value === 'true');

async function readJson(file, fallback) {
    try {
        return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
    } catch (error) {
        if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
        throw new Error(`Impossibile leggere ${path.relative(ROOT, file)}: ${error.message}`);
    }
}

async function loadSections() {
    let files = [];
    try {
        files = (await readdir(path.join(CONTENT_DIR, 'sections'))).filter((f) => f.endsWith('.json'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    const sections = [];
    for (const file of files) {
        const slug = file.slice(0, -'.json'.length);
        if (!SLUG_RE.test(slug)) {
            throw new Error(`Nome file non valido: content/sections/${file}. Usa solo minuscole, numeri e trattini (es. "il-mio-shooting.json").`);
        }
        const data = await readJson(path.join(CONTENT_DIR, 'sections', file));
        sections.push({
            slug,
            title: data.title || slug,
            menuLabel: data.menu_label || data.title || slug,
            excerpt: data.excerpt || '',
            seoDescription: data.seo_description || '',
            isHome: truthy(data.is_home),
            isPublished: truthy(data.published, true),
            showInMenu: truthy(data.show_in_menu, true),
            menuOrder: Number(data.menu_order) || 0,
            hero: data.hero || {},
            blocks: Array.isArray(data.blocks) ? data.blocks : [],
        });
    }
    return sections
        .filter((s) => s.isPublished)
        .sort((a, b) => a.menuOrder - b.menuOrder || a.title.localeCompare(b.title, 'it'));
}

function renderBlock(block, root) {
    switch (block?.type) {
        case 'text':
            return `<div class="block block--text">\n${renderTextBlock(block.content)}\n</div>`;

        case 'gallery': {
            const items = (Array.isArray(block.images) ? block.images : [])
                .map((img) => ({ ...img, src: imageUrl(root, img?.image) }))
                .filter((img) => img.src);
            if (!items.length) return '';
            const links = items.map((img) => `<a class="gallery-grid__item" href="${h(img.src)}" data-caption="${h(img.caption)}">
<img src="${h(img.src)}" alt="${h(img.alt || img.caption)}" loading="lazy">
</a>`).join('\n');
            return `<div class="block block--gallery" data-gallery>\n<div class="gallery-grid">\n${links}\n</div>\n</div>`;
        }

        case 'image': {
            const src = imageUrl(root, block.image);
            if (!src) return '';
            const caption = block.caption ? `\n<figcaption>${h(block.caption)}</figcaption>` : '';
            return `<figure class="block block--image" data-gallery>
<a href="${h(src)}" data-caption="${h(block.caption)}">
<img src="${h(src)}" alt="${h(block.alt || block.caption)}" loading="lazy">
</a>${caption}
</figure>`;
        }

        case 'quote': {
            const cite = block.author ? `\n<cite>&mdash; ${h(block.author)}</cite>` : '';
            return `<blockquote class="block block--quote">\n<p>&laquo;${renderInlineText(block.text)}&raquo;</p>${cite}\n</blockquote>`;
        }

        case 'video': {
            const embed = videoEmbedUrl(block.url);
            if (!embed) return '';
            const caption = block.caption ? `\n<p class="video-caption">${renderInlineText(block.caption)}</p>` : '';
            return `<div class="block block--video">
<div class="video-embed">
<iframe src="${h(embed)}" title="Video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>
</div>${caption}
</div>`;
        }

        case 'separator':
            return '<hr class="block block--separator">';

        default:
            return '';
    }
}

function renderHero(section, root) {
    const hero = section.hero || {};
    const image = imageUrl(root, hero.image);
    const position = ['left', 'center', 'right'].includes(hero.text_position) ? hero.text_position : 'center';
    const height = ['full', 'large', 'medium', 'small'].includes(hero.height_variant) ? hero.height_variant : 'medium';
    const overlayRaw = Number(hero.overlay_opacity);
    const overlay = Number.isFinite(overlayRaw) ? Math.min(100, Math.max(0, Math.round(overlayRaw))) : 45;
    const title = hero.title || section.title;
    const subtitle = hero.subtitle || section.excerpt;
    const style = image ? ` style="background-image:url('${h(image)}');"` : '';
    return `<section class="hero hero--text-${position} hero--${height}"${style}>
<div class="hero__overlay" style="opacity: ${overlay}%;"></div>
<div class="hero__content">
${title ? `<h1 class="hero__title">${h(title)}</h1>` : ''}
${subtitle ? `<p class="hero__subtitle">${h(subtitle)}</p>` : ''}
</div>
</section>`;
}

function renderLayout({ settings, menu, currentSlug, root, title, description, body }) {
    const siteTitle = settings.site_title || 'Portfolio';
    const tagline = settings.site_tagline || '';
    const accent = safeHexColor(settings.accent_color);
    const footerText = settings.footer_text || '';
    const instagram = safeHttpUrl(settings.social_instagram);
    const facebook = safeHttpUrl(settings.social_facebook);
    const email = isEmail(settings.contact_email) ? String(settings.contact_email).trim() : '';

    const navItems = [`<li><a href="${root}" class="${currentSlug === '' ? 'is-active' : ''}">Home</a></li>`]
        .concat(menu.map((item) => `<li><a href="${root}${h(item.slug)}/" class="${currentSlug === item.slug ? 'is-active' : ''}">${h(item.menuLabel)}</a></li>`))
        .join('\n');

    const social = [
        instagram && `<a href="${h(instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>`,
        facebook && `<a href="${h(facebook)}" target="_blank" rel="noopener noreferrer">Facebook</a>`,
        email && `<a href="mailto:${h(email)}">Contatti</a>`,
    ].filter(Boolean).join('');

    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0a0a0a">
<title>${h(title)} &middot; ${h(siteTitle)}</title>
${description ? `<meta name="description" content="${h(description)}">` : ''}
<link rel="stylesheet" href="${root}assets/css/style.css">
<style>:root{--c-accent:${h(accent)};}</style>
<link rel="manifest" href="${root}manifest.json">
<link rel="icon" href="${root}assets/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}assets/icons/icon.svg">
</head>
<body>
<a class="skip-link" href="#main-content">Salta al contenuto</a>

<header class="site-header" id="siteHeader">
<div class="site-header__inner">
<a class="site-header__brand" href="${root}">
${h(siteTitle)}
${tagline ? `<span class="site-header__tagline">${h(tagline)}</span>` : ''}
</a>

<button class="site-header__toggle" id="menuToggle" aria-label="Apri il menu" aria-expanded="false">
<span></span><span></span><span></span>
</button>

<nav class="site-nav" id="siteNav">
<ul>
${navItems}
</ul>
</nav>
</div>
</header>

${body}

<footer class="site-footer">
<div class="container site-footer__inner">
<p>${h(footerText)}</p>
${social ? `<div class="site-footer__social">${social}</div>` : ''}
</div>
</footer>

<div class="lightbox" id="lightbox">
<button class="lightbox__close" id="lightboxClose" aria-label="Chiudi">&times;</button>
<button class="lightbox__prev" id="lightboxPrev" aria-label="Precedente">&#8249;</button>
<img class="lightbox__img" id="lightboxImg" src="" alt="">
<button class="lightbox__next" id="lightboxNext" aria-label="Successivo">&#8250;</button>
<p class="lightbox__caption" id="lightboxCaption"></p>
</div>

<script src="${root}assets/js/main.js"></script>
<script>
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('${root}sw.js');
    });
}
</script>
</body>
</html>
`;
}

async function writePage(relativeFile, html) {
    const target = path.join(DIST_DIR, relativeFile);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, html, 'utf8');
}

async function build() {
    const settings = await readJson(path.join(CONTENT_DIR, 'settings.json'), {});
    const sections = await loadSections();
    const menu = sections.filter((s) => s.showInMenu && !s.isHome);
    const home = sections.find((s) => s.isHome) || sections[0] || null;

    await rm(DIST_DIR, { recursive: true, force: true });
    await mkdir(DIST_DIR, { recursive: true });
    await cp(SITE_DIR, DIST_DIR, { recursive: true });

    const renderSection = (section, root, currentSlug) => {
        const blocks = section.blocks.map((block) => renderBlock(block, root)).filter(Boolean).join('\n');
        const body = `${renderHero(section, root)}

<main class="section-content" id="main-content">
<div class="container">
${blocks || '<p class="empty-notice">Questa sezione non ha ancora contenuti pubblicati.</p>'}
</div>
</main>`;
        return renderLayout({
            settings, menu, currentSlug, root,
            title: section.title,
            description: section.seoDescription || section.excerpt,
            body,
        });
    };

    if (home) {
        await writePage('index.html', renderSection(home, './', ''));
    }
    for (const section of sections) {
        await writePage(`${section.slug}/index.html`, renderSection(section, '../', section.slug));
    }

    // 404.html viene servita a qualsiasi indirizzo inesistente: servono percorsi assoluti (SITE_BASE, es. "/nome-repo/")
    const siteBase = (process.env.SITE_BASE || '/').replace(/\/*$/, '/');
    const notFoundBody = `<main class="not-found" id="main-content"><h1>404</h1><p>La pagina che cerchi non esiste o non è pubblicata.</p>
<p><a href="${h(siteBase)}">Torna alla home</a></p></main>`;
    await writePage('404.html', renderLayout({
        settings, menu, currentSlug: null, root: siteBase, title: 'Pagina non trovata', description: '', body: notFoundBody,
    }));

    console.log(`Sito generato in dist/: ${sections.length} sezioni pubblicate${home ? `, home: ${home.slug}` : ', nessuna home'}.`);
}

build().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
