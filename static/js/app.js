/* Formulae — app UI (Liquid Glass design, ported from .app-check/inspiration/mockup-glass.html).
   Data stays where it always was, so existing libraries keep working:
     tex_formula_library_v1 (FormulaLibrary) · pdf_links · desmos_graphs · expandedCourses ·
     formulae_gemini_key · formulae_gemini_model · formulae_theme (localStorage) · PDF bytes in IndexedDB (PdfStore). */
(() => {
'use strict';

/* ---------------- Shared helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const icon = (id, cls = 'i sm') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const escHTML = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtBytes = b => { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB'], i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 3); return (b / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i]; };
const dateShort = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { console.error(e); } },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  list(k) { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } },
};
const safeUrl = u => { try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null; } catch (_) { return null; } };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'web'; } };
const desmosId = url => (String(url).match(/desmos\.com\/calculator\/([a-zA-Z0-9]+)/) || [])[1] || null;
const desmosUrl = g => `https://www.desmos.com/calculator/${encodeURIComponent(g.graphId || '')}`;
// Formulas may carry their own delimiters ($$…$$ from AI tables); bare LaTeX is set as display math
const texOf = raw => /^\s*(\\\[|\$\$|\\\(|\$)/.test(raw || '') ? raw.trim() : `\\[${raw || ''}\\]`;

const SWATCHES = FormulaLibrary.COURSE_COLORS;
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------------- Data: library (courses → units → entries) ----------------
   courses/units alias lib.data's arrays (FormulaLibrary.normalize has already repaired them);
   the UI edits them in place and calls save(). Re-run bind() whenever lib.data is replaced. */
const lib = new FormulaLibrary();
const pdfStore = new PdfStore();
let courses = [], units = [];
const bind = () => { courses = lib.data.courses; units = lib.data.units; };
bind();
const save = () => lib.saveData();
const unitById = id => units.find(u => u.id === id);
const courseById = id => courses.find(c => c.id === id);
const courseOf = u => u.courseId ? courseById(u.courseId) : null;
const unitColor = u => courseOf(u)?.color || '#8e8e93';
const withUnit = u => e => ({ ...e, unit: u });
const allEntries = () => units.flatMap(u => u.entries.map(withUnit(u)));
const unitsOf = cid => units.filter(u => u.courseId === cid);
const entryCount = () => units.reduce((n, u) => n + u.entries.length, 0);
const findEntry = id => { for (const u of units) { const e = u.entries.find(x => x.id === id); if (e) return { u, e }; } return {}; };

/* ---------------- Data: files (uploaded PDFs, links, Desmos graphs) ---------------- */
let uploads = [], links = [], graphs = [], pdfs = [];
const uploadItem = r => ({ id: r.id, name: r.name, size: r.size, dateAdded: r.dateAdded, kind: 'file', sub: `${fmtBytes(r.size)} · Uploaded ${dateShort(r.dateAdded)}` });
const linkItem = l => ({ id: l.id || uid('link-'), name: l.name || 'Untitled', url: l.url, dateAdded: l.dateAdded, kind: 'link', sub: 'Link · ' + hostOf(l.url) });
function graphItem(g) {
  const graphId = (/^[a-zA-Z0-9]+$/.test(g.graphId || '') && g.graphId) || desmosId(g.url || '');
  return { id: g.id || uid('g'), name: g.title || 'Untitled graph', url: g.url, graphId, dateAdded: g.dateAdded, kind: 'graph',
    sub: graphId ? 'desmos.com/calculator/' + graphId : 'No Desmos graph link' };
}
function loadLocalFiles() {
  links = store.list('pdf_links').map(linkItem);
  graphs = store.list('desmos_graphs').map(graphItem);
}
const saveLinks = () => store.set('pdf_links', JSON.stringify(links.map(({ id, name, url, dateAdded }) => ({ id, name, url, dateAdded }))));
const saveGraphs = () => store.set('desmos_graphs', JSON.stringify(graphs.map(g => ({ id: g.id, title: g.name, url: g.url, graphId: g.graphId, dateAdded: g.dateAdded }))));
async function loadUploads() {
  try { uploads = (await pdfStore.getAllPdfs()).map(uploadItem); } catch (e) { console.error('Could not read PDFs', e); uploads = []; }
}
function mergePdfs() { pdfs = [...uploads, ...links].sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0)); }
loadLocalFiles(); mergePdfs();

/* The address a file opens at: links as they are (http/https only), uploads as a blob URL the caller revokes */
async function fileUrl(p) {
  if (p.kind === 'link') return safeUrl(p.url);
  const blob = await pdfStore.getPdfBlob(p.id);
  return blob ? URL.createObjectURL(blob) : null;
}
async function renameFile(item, name) {
  if (!name || name === item.name) return;
  item.name = name;
  try {
    if (item.kind === 'file') await pdfStore.renamePdf(item.id, name);
    else if (item.kind === 'link') saveLinks();
    else saveGraphs();
  } catch (e) { console.error(e); toast('Couldn’t rename it', false); }
  refresh();
}
async function removeFile(item) {
  try {
    if (item.kind === 'file') { await pdfStore.deletePdf(item.id); uploads = uploads.filter(x => x !== item); }
    else if (item.kind === 'link') { links = links.filter(x => x !== item); saveLinks(); }
    else { graphs = graphs.filter(x => x !== item); saveGraphs(); }
  } catch (e) { console.error(e); toast('Couldn’t delete it', false); return; }
  mergePdfs(); refresh();
}

/* ---------------- View state ---------------- */
function readExpanded() { try { const v = JSON.parse(store.get('expandedCourses') || '[]'); return new Set(Array.isArray(v) ? v : []); } catch (_) { return new Set(); } }
// nav counts navigations (go, opening a view): async work started earlier checks it so it can't override where the user went
const state = { view: 'general', expanded: readExpanded(), filter: '', visible: [], viewIdx: 0, zoom: 1, nav: 0, stale: false };
let searchT;   // pending debounced search
const saveExpanded = () => store.set('expandedCourses', JSON.stringify([...state.expanded]));
let split = [];   // panes of the split view (see the Split view block)

/* Full-size views over the content area; the list underneath is data-view="grid" */
const view = () => $('#main').dataset.view;
const viewing = () => view() === 'formula';
const graphing = () => view() === 'graph';
const pdfing = () => view() === 'pdf';
const splitting = () => view() === 'split';
/* Back to the list: redraw it if data changed while a view covered it, refit cards if the window was resized */
function showGrid() {
  $('#main').dataset.view = 'grid';
  if (state.stale) { state.stale = false; const top = $('#scroll').scrollTop; renderMain(); $('#scroll').scrollTop = top; }
  else if (fitPending) { fitPending = false; fitAll(document); }
}
const closeAllViews = () => { closeViewer(false); closeGraph(false); closePdf(false); closeSplit(false); };

/* ---------------- Sidebar ---------------- */
function sbRow({ id, label, count, ico, tone = '', more = false, kind = '' }) {
  const li = document.createElement('li');
  li.className = 'sb-row' + (state.view === id ? ' active' : '') + (more ? ' has-more' : '');
  li.dataset.id = id;
  li.innerHTML = `<span class="sb-ico ${tone}">${icon(ico)}</span><span class="label"></span><span class="count num">${count}</span>` +
    (more ? `<button class="icon-btn more" aria-label="Options">${icon('i-more')}</button>` : '');
  li.querySelector('.label').textContent = label;
  if (kind === 'course') { li.querySelector('.sb-ico').style.color = courseById(id).color; li._menu = () => courseMenu(courseById(id)); }
  if (kind === 'unit') li._menu = () => unitMenu(unitById(id));
  return li;
}
function renderSidebar() {
  const nav = $('#sb-nav'); nav.innerHTML = '';
  const g1 = document.createElement('div'); g1.className = 'sb-group';
  g1.innerHTML = `<h2 class="sb-head">Library</h2>`;
  const l1 = document.createElement('ul'); l1.className = 'sb-list';
  l1.append(
    sbRow({ id: 'general', label: 'All Formulas', count: entryCount(), ico: 'i-sigma' }),
    sbRow({ id: 'pdfs', label: 'PDFs', count: pdfs.length, ico: 'i-acrobat', tone: 'red' }),
    sbRow({ id: 'desmos', label: 'Desmos Graphs', count: graphs.length, ico: 'i-desmos' }),
  );
  g1.append(l1); nav.append(g1);

  if (courses.length) {
    const g2 = document.createElement('div'); g2.className = 'sb-group';
    g2.innerHTML = `<h2 class="sb-head">Courses</h2>`;
    const l2 = document.createElement('ul'); l2.className = 'sb-list';
    courses.forEach(c => {
      const cu = unitsOf(c.id);
      const row = sbRow({ id: c.id, label: c.name, count: cu.reduce((s, u) => s + u.entries.length, 0), ico: 'i-folder', more: true, kind: 'course' });
      const open = state.expanded.has(c.id);
      const d = document.createElement('button');
      d.className = 'disclose'; d.setAttribute('aria-expanded', open); d.setAttribute('aria-label', (open ? 'Collapse ' : 'Expand ') + c.name);
      d.innerHTML = icon('i-chev-d');
      d.onclick = e => { e.stopPropagation(); open ? state.expanded.delete(c.id) : state.expanded.add(c.id); saveExpanded(); renderSidebar(); };
      row.prepend(d);
      l2.append(row);
      const nest = document.createElement('ul'); nest.className = 'sb-nested'; nest.hidden = !open;
      cu.forEach(u => nest.append(sbRow({ id: u.id, label: u.name, count: u.entries.length, ico: 'i-stack', tone: 'gray', more: true, kind: 'unit' })));
      l2.append(nest);
    });
    g2.append(l2); nav.append(g2);
  }

  const loose = units.filter(u => !u.courseId);
  if (loose.length) {
    const g3 = document.createElement('div'); g3.className = 'sb-group';
    g3.innerHTML = `<h2 class="sb-head">Units</h2>`;
    const l3 = document.createElement('ul'); l3.className = 'sb-list';
    loose.forEach(u => l3.append(sbRow({ id: u.id, label: u.name, count: u.entries.length, ico: 'i-stack', tone: 'gray', more: true, kind: 'unit' })));
    g3.append(l3); nav.append(g3);
  }
}
$('#sb-nav').addEventListener('click', e => {
  const more = e.target.closest('.more');
  const row = e.target.closest('.sb-row');
  if (!row) return;
  if (more) { e.stopPropagation(); if (row._menu) openMenu(more, ...row._menu()); return; }
  go(row.dataset.id);
  if (matchMedia('(max-width: 900px)').matches) $('#app').classList.remove('sb-open');
});

/* ---------------- Main views ---------------- */
function go(id) { clearTimeout(searchT); state.nav++; state.stale = false; closeAllViews(); state.view = id; state.filter = ''; $('#search').value = ''; renderSidebar(); renderMain(); $('#scroll').scrollTop = 0; }

function header(title, sub) {
  const h = document.createElement('header'); h.className = 'large-title';
  const h1 = document.createElement('h1'); h1.className = 'h1'; h1.id = 'large-title'; h1.textContent = title;
  const p = document.createElement('p'); p.className = 'p2 muted'; p.textContent = sub;
  h.append(h1, p);
  $('#tb-title').textContent = title;
  return h;
}

function mathEl(raw) { const f = document.createElement('div'); f.className = 'fit'; f.textContent = texOf(raw); return f; }

/* One card component for formulas, units, courses and files (FlowTracker's flowchart card) */
function card({ cls = '', title, meta, next, color, ico, count, countLabel, onOpen, menu }) {
  const el = document.createElement('article'); el.className = 'card ' + cls;
  if (color) el.style.setProperty('--c', color);
  el.innerHTML = (ico ? `<div class="card-top"><span class="card-ico" aria-hidden="true">${icon(ico, 'i')}</span>` +
      (count != null ? `<span class="left-count" role="img"><strong></strong></span>` : '') + `</div>` : '') +
    `<h2><button type="button" class="card-link"></button></h2>` + (meta ? `<p class="meta"></p>` : '') + (next ? `<p class="next"></p>` : '');
  el.querySelector('.card-link').textContent = title;
  if (meta) el.querySelector('.meta').textContent = meta;
  if (next) el.querySelector('.next').innerHTML = next;
  if (count != null) { el.querySelector('.left-count strong').textContent = count; el.querySelector('.left-count').setAttribute('aria-label', countLabel); }
  el.addEventListener('click', onOpen);
  el._menu = menu;
  return el;
}
const latest = list => list.length ? `Latest: <b>${escHTML(list[list.length - 1].title)}</b>` : 'No formulas yet';

function fileCard({ item, ico, color, onOpen }) {
  const openIt = () => onOpen(el);
  const el = card({ cls: 'file', title: item.name, meta: item.sub, ico, color, onOpen: openIt, menu: () => fileMenu(item, openIt) });
  el.dataset.gid = item.id; el._item = item;
  const a = document.createElement('div'); a.className = 'actions';
  a.innerHTML = `<button class="icon-btn" aria-label="More" title="More">${icon('i-more')}</button>`;
  a.firstChild.onclick = ev => { ev.stopPropagation(); openMenu(ev.currentTarget, ...el._menu()); };
  el.append(a); return el;
}
const pdfIcon = p => p.kind === 'link' ? 'i-link' : 'i-acrobat';
const pdfCard = p => fileCard({ item: p, ico: pdfIcon(p),
  color: p.kind === 'link' ? '#0a84ff' : 'var(--acrobat)', onOpen: el => openPdf(p, el) });
const graphCard = g => fileCard({ item: g, ico: 'i-desmos', onOpen: el => openGraph(g, el) });
const fileGrid = (list, make) => { const d = document.createElement('div'); d.className = 'cards file-grid'; list.forEach(x => d.append(make(x))); return d; };

function unitCard(u) {
  const c = courseOf(u);
  return card({ cls: 'unit', title: u.name, meta: c ? c.name : 'No course', next: latest(u.entries), color: unitColor(u),
    ico: 'i-stack', count: u.entries.length, countLabel: plural(u.entries.length, 'formula'), onOpen: () => go(u.id), menu: () => unitMenu(u) });
}

/* Copy to the clipboard; the button shows a check for a moment (and a toast says so, when given) */
function copyText(text, b, label, cls, said) {
  navigator.clipboard?.writeText(text).catch(() => {});
  b.classList.add('done'); b.innerHTML = icon('i-check', cls); b.title = 'Copied';
  setTimeout(() => { b.classList.remove('done'); b.innerHTML = icon('i-copy', cls); b.title = label; }, 1200);
  if (said) toast(said);
}

function tile(entry, showUnit) {
  const t = card({ cls: 'formula', title: entry.title, meta: showUnit ? entry.unit.name : '', onOpen: ev => openViewer(entry, ev.currentTarget), menu: () => formulaMenu(entry) });
  t.dataset.id = entry.id;
  const m = document.createElement('div'); m.className = 'math'; m.append(mathEl(entry.raw));
  t.prepend(m);
  const a = document.createElement('div'); a.className = 'actions';
  a.innerHTML = `<button class="icon-btn" data-copy aria-label="Copy LaTeX" title="Copy LaTeX">${icon('i-copy')}</button>
                 <button class="icon-btn" data-more aria-label="More" title="More">${icon('i-more')}</button>`;
  a.querySelector('[data-copy]').onclick = ev => { ev.stopPropagation(); copyText(entry.raw, ev.currentTarget, 'Copy LaTeX', 'i sm'); };
  a.querySelector('[data-more]').onclick = ev => { ev.stopPropagation(); openMenu(ev.currentTarget, ...t._menu()); };
  t.append(a);
  return t;
}

function section(title, content) {
  const s = document.createElement('section'); s.className = 'section';
  if (title) { const h = document.createElement('div'); h.className = 'section-head'; h.innerHTML = `<h2 class="h3"></h2>`; h.querySelector('h2').textContent = title; s.append(h); }
  s.append(content); return s;
}

function setPrimary(label, show = true, secondary = '') {
  const p = $('#tb-primary'); p.style.display = show ? '' : 'none'; p.querySelector('.lbl').textContent = label;
  $('#tb-secondary').innerHTML = secondary;
}

function renderMain() {
  const page = $('#page'); page.innerHTML = '';
  const v = state.view; const q = state.filter.trim().toLowerCase();
  state.visible = [];

  if (q) {
    const has = (...t) => t.join(' ').toLowerCase().includes(q);
    const hits = allEntries().filter(e => has(e.title, e.unit.name));
    const pdfHits = pdfs.filter(f => has(f.name, f.sub));
    const graphHits = graphs.filter(g => has(g.name, g.sub));
    const n = hits.length + pdfHits.length + graphHits.length;
    page.append(header('Search', `${plural(n, 'result')} for “${state.filter.trim()}”`));
    setPrimary('New Formula', false);
    if (!n) page.append(emptyState('No matches', 'Try a different formula, file or graph name.'));
    if (hits.length) { const g = document.createElement('div'); g.className = 'grid'; hits.forEach(e => g.append(tile(e, true))); page.append(section('Formulas', g)); state.visible = hits; }
    if (pdfHits.length) page.append(section('PDFs', fileGrid(pdfHits, pdfCard)));
    if (graphHits.length) page.append(section('Desmos Graphs', fileGrid(graphHits, graphCard)));
    return typeset(page);
  }

  if (v === 'general') {
    const all = allEntries();
    page.append(header('Library', `${plural(courses.length, 'course')} · ${plural(units.length, 'unit')} · ${plural(all.length, 'formula')}`));
    setPrimary('New Unit');
    if (courses.length) {
      const cg = document.createElement('div'); cg.className = 'cards';
      courses.forEach(c => {
        const cu = unitsOf(c.id);
        const ce = cu.flatMap(u => u.entries);
        cg.append(card({ cls: 'course', title: c.name, meta: plural(cu.length, 'unit'), next: latest(ce), color: c.color,
          ico: 'i-sigma', count: ce.length, countLabel: plural(ce.length, 'formula'), onOpen: () => go(c.id), menu: () => courseMenu(c) }));
      });
      page.append(section('Courses', cg));
    }
    const loose = units.filter(u => !u.courseId);
    if (loose.length) {
      const grp = document.createElement('div'); grp.className = 'cards';
      loose.forEach(u => grp.append(unitCard(u)));
      page.append(section(courses.length ? 'Units without a course' : 'Units', grp));
    }
    if (!courses.length && !loose.length) page.append(emptyState('Your library is empty', 'Create a unit to start collecting formulas, or a course to group units together.'));
    return typeset(page);
  }

  const course = courseById(v);
  if (course) {
    const cu = unitsOf(v);
    const entries = cu.flatMap(u => u.entries.map(withUnit(u)));
    page.append(header(course.name,`${plural(cu.length, 'unit')} · ${plural(entries.length, 'formula')}`));
    setPrimary('New Unit');
    if (cu.length) { const grp = document.createElement('div'); grp.className = 'cards'; cu.forEach(u => grp.append(unitCard(u))); page.append(section('Units', grp)); }
    else page.append(emptyState('No units yet', 'Add a unit to this course to start collecting its formulas.'));
    if (entries.length) { const g = document.createElement('div'); g.className = 'grid'; entries.forEach(e => g.append(tile(e, true))); page.append(section('Formulas', g)); }
    state.visible = entries;
    return typeset(page);
  }

  if (v === 'pdfs') {
    page.append(header('PDFs', `${plural(pdfs.length, 'document')} · stored in this browser`));
    setPrimary('Upload PDF', true, `<button class="btn btn-secondary lg" id="btn-add-link">${icon('i-link')}Add Link</button>`);
    page.append(pdfs.length ? fileGrid(pdfs, pdfCard) : emptyState('No PDFs yet', 'Upload a PDF, or add a link to one. They open right here in Formulae.'));
    return;
  }

  if (v === 'desmos') {
    page.append(header('Desmos Graphs', plural(graphs.length, 'saved graph')));
    setPrimary('Add Graph');
    page.append(graphs.length ? fileGrid(graphs, graphCard) : emptyState('No graphs yet', 'Paste a share link from Desmos to keep the graph beside your formulas.'));
    return;
  }

  // Unit view
  const u = unitById(v);
  if (!u) { state.view = 'general'; return renderMain(); }
  const c = courseOf(u);
  const entries = u.entries.map(withUnit(u));
  page.append(header(u.name, c ? `${c.name} · ${plural(entries.length, 'formula')}` : plural(entries.length, 'formula')));
  setPrimary('New Formula');
  if (!entries.length) { page.append(emptyState('No formulas yet', 'Write one in LaTeX, or generate a table from your notes, files or a lecture video.', true)); return; }
  const g = document.createElement('div'); g.className = 'grid'; entries.forEach(e => g.append(tile(e, false))); page.append(g);
  state.visible = entries;
  typeset(page);
}

function emptyState(title, text, actions) {
  const d = document.createElement('div'); d.className = 'empty';
  d.innerHTML = `<h2 class="h3"></h2><p class="p2 muted"></p>` +
    (actions ? `<div class="btns"><button class="btn btn-secondary lg" data-ai>${icon('i-sparkle')}Generate with AI</button><button class="btn btn-primary lg" data-new>${icon('i-plus')}New Formula</button></div>` : '');
  d.querySelector('h2').textContent = title; d.querySelector('p').textContent = text;
  d.querySelector('[data-new]')?.addEventListener('click', () => openEditor());
  d.querySelector('[data-ai]')?.addEventListener('click', () => { openEditor(); setTimeout(openAiSheet, 120); });
  return d;
}

/* ---------------- MathJax: typeset + fit (previews fit both ways, capped at 1×) ---------------- */
async function typeset(root) {
  if (!window.MathJax?.startup?.promise) { setTimeout(() => typeset(root), 150); return; }
  await MathJax.startup.promise;
  MathJax.typesetClear?.([root]);
  try { await MathJax.typesetPromise([root]); } catch (e) { console.error('MathJax', e); }
  fitAll(root);
}
function fitAll(root) {
  // Reset, then measure every card, then write: one layout pass instead of one per card
  const fits = [...root.querySelectorAll('.fit')];
  fits.forEach(f => { f.style.transform = 'none'; });
  const scales = fits.map(f => {
    const box = f.parentElement, cs = getComputedStyle(box);
    const w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return f.scrollWidth && f.scrollHeight ? Math.min(1, w / f.scrollWidth, h / f.scrollHeight) : null;
  });
  fits.forEach((f, i) => { if (scales[i] != null) f.style.transform = `scale(${scales[i]})`; });
}
let rz, fitPending = false;   // cards are refitted on resize, or when the list comes back if it was covered by a view
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (view() === 'grid') fitAll(document); else fitPending = true; }, 120); });

/* ---------------- Large title → toolbar title, scroll edge ---------------- */
$('#scroll').addEventListener('scroll', () => {
  const st = $('#scroll').scrollTop;
  $('#toolbar').classList.toggle('edge', st > 4);
  $('#toolbar').classList.toggle('show-title', st > 64);
}, { passive: true });

/* ---------------- Sheets ---------------- */
let sheetStack = [];
function openSheet(sel) {
  const s = $(sel); sheetStack.push(s);
  $('#scrim').classList.add('open'); $('#app').classList.add('pushed');
  if (sheetStack.length > 1) sheetStack[sheetStack.length - 2].style.filter = 'brightness(0.92)';
  s.classList.add('open'); s.style.zIndex = 50 + sheetStack.length;
  setTimeout(() => (s.querySelector('.ed-title, .ft-body input:not([type=password]):not([hidden]), .ft-body textarea') || s.querySelector('button'))?.focus({ preventScroll: true }), 60);
}
function closeTop() {
  const s = sheetStack.pop(); if (!s) return;
  s.classList.remove('open');
  const under = sheetStack[sheetStack.length - 1]; if (under) under.style.filter = '';
  if (!sheetStack.length) { $('#scrim').classList.remove('open'); $('#app').classList.remove('pushed'); }
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeTop));
$('#scrim').addEventListener('click', closeTop);

/* Formula editor */
let pv, edUnit = null, edEntry = null;
function openEditor(entry) {
  const unit = entry?.unit || unitById(state.view) || units[0];
  if (!unit) { openUnitSheet(); return; }
  edUnit = unit; edEntry = entry ? unit.entries.find(x => x.id === entry.id) : null;   // always the real entry in its owning unit
  $('#ed-heading').textContent = entry ? 'Edit Formula' : 'New Formula';
  $('#ed-unit').textContent = unit.name;
  $('#ed-title').value = entry?.title || '';
  $('#ed-code').value = entry?.raw || '';
  preview(); syncEdSave();
  openSheet('#sheet-editor');
  setTimeout(() => $(entry ? '#ed-code' : '#ed-title').focus(), 60);
}
// Save is ready once there is LaTeX to save; an empty title becomes "Untitled formula"
const syncEdSave = () => { $('#ed-save').disabled = !$('#ed-code').value.trim(); };
$('#ed-save').addEventListener('click', () => {
  const raw = $('#ed-code').value.trim(); if (!raw) return;
  const title = $('#ed-title').value.trim() || 'Untitled formula';
  if (edEntry) Object.assign(edEntry, { title, raw });
  else edUnit.entries.push({ id: uid('f-'), title, raw, isTikZ: false, tags: [], createdAt: new Date().toISOString() });
  save();
  closeTop();
  if (viewing()) {   // editing from the formula view: refresh the open formula in place
    const v = state.visible[state.viewIdx]; if (v && edEntry && v.id === edEntry.id) Object.assign(v, { title, raw });
    drawViewer();
  } else if (!edEntry && state.view !== edUnit.id && !state.filter) go(edUnit.id);
  refresh();
  toast(edEntry ? 'Formula saved' : `Added to ${edUnit.name}`);
});
function preview() {
  const box = $('#ed-preview'); const raw = $('#ed-code').value.trim();
  box.innerHTML = '';
  if (!raw) { box.innerHTML = '<span class="p2 muted">Your typeset formula appears here.</span>'; return; }
  const d = document.createElement('div'); d.className = 'ed-math'; d.textContent = texOf(raw); box.append(d);
  typeset(box).then(() => fitWidth(d));
}
$('#ed-code').addEventListener('input', () => { syncEdSave(); clearTimeout(pv); pv = setTimeout(preview, 250); });
$('#btn-open-ai').addEventListener('click', () => openAiSheet());
$('#tb-primary').addEventListener('click', () => {
  const v = state.view;
  if (state.filter) return;
  if (v === 'pdfs') openPdfSheet();
  else if (v === 'desmos') openFormSheet('#sheet-graph');
  else if (v === 'general' || courseById(v)) openUnitSheet();
  else openEditor();
});
$('#tb-secondary').addEventListener('click', e => { if (e.target.closest('#btn-add-link')) openFormSheet('#sheet-link'); });

/* ---------------- Full-size views: formula, graph, PDF ----------------
   Opening uses the Edit sheet's motion: the view materialises from 92% scale, 4% low and 12px blurred to sharp
   (transform 560ms on the iOS sheet spring, fade 260ms, blur 380ms); closing runs it back. Reduced motion: a 200ms fade. */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function viewMotion(view, dir) {
  const main = $('#main');
  if (document.hidden || !view.animate) return Promise.resolve();
  view.getAnimations().forEach(a => a.cancel());
  const spring = getComputedStyle(document.documentElement).getPropertyValue('--ease-spring').trim() || 'ease';
  const shut = { opacity: 0, transform: 'translateY(4%) scale(0.92)', filter: 'blur(12px)' };
  const shown = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
  const [a, b] = dir === 'in' ? [shut, shown] : [shown, shut];
  const track = (prop, ms, ease) => view.animate([{ [prop]: a[prop] }, { [prop]: b[prop] }], { duration: ms, easing: ease, fill: 'both' });
  const anims = reduceMotion.matches ? [track('opacity', 200, 'ease')]
    : [track('transform', 560, spring), track('opacity', 260, 'ease'), track('filter', 380, 'ease')];
  main.classList.add('vt-anim');   // keep the list painted underneath while the view comes and goes
  const end = dir === 'in' ? Promise.all(anims.map(x => x.finished)) : anims[anims.length > 1 ? 1 : 0].finished;
  return end.catch(() => {}).then(() => { anims.forEach(x => x.cancel()); main.classList.remove('vt-anim'); });
}
/* open: switch to the view, then materialise it.  close: dematerialise, then switch back to the list */
function morph(fromEl, toEl, update) {
  if (fromEl?.classList?.contains('fv')) return viewMotion(fromEl, 'out').then(update);
  update(); const to = toEl();
  return to ? viewMotion(to, 'in') : Promise.resolve();
}
const backLabel = () => 'Back to ' + ($('#large-title')?.textContent || 'Library');
function openViewer(entry, fromCard) {
  state.nav++;
  state.viewIdx = Math.max(0, state.visible.findIndex(e => e.id === entry.id));
  if (!state.visible.length) state.visible = [entry];
  state.zoom = 1; closeMenu();
  // Typeset first, laid out but invisible, so the motion lands on the finished formula
  $('#fv').classList.add('prep');
  Promise.resolve(drawViewer()).then(() => {
    $('#fv').classList.remove('prep');
    return morph(fromCard, () => $('#fv'), () => { $('#main').dataset.view = 'formula'; });
  }).then(() => $('#fv-back').focus({ preventScroll: true }));
}
function closeViewer(animate = true) {
  if (!viewing()) return;
  const id = state.visible[state.viewIdx]?.id;
  const cardOf = () => id && document.querySelector(`.card.formula[data-id="${CSS.escape(id)}"]`);
  const done = showGrid;
  if (!animate) return done();
  cardOf()?.scrollIntoView({ block: 'nearest' });
  morph($('#fv'), cardOf, done).then(() => cardOf()?.querySelector('.card-link').focus({ preventScroll: true }));
}
function drawViewer() {
  const e = state.visible[state.viewIdx]; if (!e) return;
  const c = e.unit.courseId ? courseById(e.unit.courseId) : null;
  $('#vw-heading').textContent = e.title;
  $('#vw-sub').textContent = c ? `${e.unit.name} · ${c.name}` : e.unit.name;
  $('#fv-back').title = $('#fv-back').ariaLabel = backLabel();
  $('#vw-pos').textContent = `${state.viewIdx + 1} of ${state.visible.length}`;
  $('#vw-prev').disabled = $('#vw-next').disabled = state.visible.length < 2;
  const m = $('#vw-math'); m.textContent = texOf(e.raw);
  m.style.transform = `scale(${state.zoom})`; $('#zm-val').textContent = Math.round(state.zoom * 100) + '%';
  return typeset(m.parentElement).then(fitViewer);
}
/* Fit to width: a formula wider than the view is set at a smaller font size (nothing scrolls sideways);
   the zoom buttons then scale from that fitted size */
function fitViewer() { fitWidth($('#vw-math')); }
function fitWidth(m) {
  const b = m?.parentElement; if (!b || !m.isConnected) return;
  m.style.fontSize = '';
  const cs = getComputedStyle(b);
  const avail = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const w = m.offsetWidth;
  if (w > avail && avail > 0) m.style.fontSize = (parseFloat(getComputedStyle(m).fontSize) * avail / w).toFixed(2) + 'px';
}
addEventListener('resize', () => { if (viewing()) fitViewer(); fitWidth($('#ed-preview .ed-math')); });
const step = d => { const n = state.visible.length; if (n < 2) return; state.viewIdx = (state.viewIdx + d + n) % n; drawViewer(); };
$('#vw-prev').onclick = () => step(-1); $('#vw-next').onclick = () => step(1);
$('#fv-back').onclick = () => closeViewer();
const zoom = f => { state.zoom = Math.min(3, Math.max(0.5, +(state.zoom * f).toFixed(2))); $('#vw-math').style.transform = `scale(${state.zoom})`; $('#zm-val').textContent = Math.round(state.zoom * 100) + '%'; };
$('#zm-in').onclick = () => zoom(1.25); $('#zm-out').onclick = () => zoom(0.8);
$('#vw-edit').onclick = () => openEditor(state.visible[state.viewIdx]);
$('#vw-clear').onclick = () => confirmDeleteFormula(state.visible[state.viewIdx]);
$('#vw-copy').onclick = ev => copyText(state.visible[state.viewIdx].raw, ev.currentTarget, 'Copy LaTeX', 'i', 'LaTeX copied');
/* Rename in place, like a flowchart title: Enter commits, Escape reverts */
function renameInPlace(h, current, commit) {
  h.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); h.blur(); }
    if (e.key === 'Escape') { e.stopPropagation(); h.textContent = current() || ''; h.blur(); }
  });
  h.addEventListener('blur', () => {
    const t = h.textContent.trim(), cur = current();
    if (!t) { h.textContent = cur || ''; return; }
    if (t !== cur) commit(t);
  });
}
renameInPlace($('#vw-heading'), () => state.visible[state.viewIdx]?.title, t => {
  const cur = state.visible[state.viewIdx]; const { e } = findEntry(cur.id);
  cur.title = t; if (e) { e.title = t; save(); refresh(); }
});

/* ---------------- Alert, menu, toast ---------------- */
let alertOk = null;
function showAlert(title, text, onOk, label = 'Delete', ico = 'i-trash-ft') {
  closeMenu(); $('#al-h').textContent = title; $('#al-p').textContent = text; $('#al-ok').textContent = label; alertOk = onOk;
  $('#alert .alert-icon').innerHTML = icon(ico, 'i');
  $('#alert-scrim').classList.add('open'); $('#alert').classList.add('open');
  setTimeout(() => $('#alert [data-alert-close]').focus(), 50);
}
const hideAlert = () => { $('#alert').classList.remove('open'); $('#alert-scrim').classList.remove('open'); };
document.querySelectorAll('[data-alert-close]').forEach(b => b.onclick = hideAlert);
$('#al-ok').onclick = () => { hideAlert(); alertOk?.(); };
$('#alert-scrim').onclick = hideAlert;

function openMenu(anchor, items, head) {
  const m = $('#menu'); m.innerHTML = '';
  if (head) { const h = document.createElement('div'); h.className = 'menu-h'; h.textContent = head; m.append(h); }
  items.forEach(it => {
    if (it === '-') { m.append(document.createElement('hr')); return; }
    if (typeof it === 'string') { const h = document.createElement('div'); h.className = 'menu-h'; h.textContent = it; m.append(h); return; }
    const [label, cls, fn, ico, checked] = it; const b = document.createElement('button');
    b.setAttribute('role', checked === undefined ? 'menuitem' : 'menuitemradio'); if (cls) b.className = cls;
    if (ico) b.insertAdjacentHTML('beforeend', icon(ico));
    const l = document.createElement('span'); l.className = 'mi-l'; l.textContent = label; b.append(l);
    if (checked !== undefined) { b.setAttribute('aria-checked', checked); if (checked) b.insertAdjacentHTML('beforeend', `<span class="mi-check">${icon('i-check')}</span>`); }
    b.onclick = e => { e.stopPropagation(); closeMenu(); fn?.(); }; m.append(b);
  });
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y - 4 };
  m.classList.add('open');
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, r.bottom + 4 + h > innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
  m.querySelector('button')?.focus({ preventScroll: true });
}
function closeMenu() { $('#menu').classList.remove('open'); }
document.addEventListener('click', e => { if (!e.target.closest('#menu')) closeMenu(); });

let toastTimer;
function toast(text, ok = true) {
  const t = $('#toast'); t.querySelector('span').textContent = text; t.classList.toggle('bad', !ok); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ok ? 2200 : 3600);
}

/* ---------------- Import / Export (JSON of the formula library) ---------------- */
$('#btn-export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lib.exportToJSON()], { type: 'application/json' }));
  a.download = 'formula_library_backup.json'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${plural(allEntries().length, 'formula')}`);
};
$('#btn-import').onclick = () => $('#file-import').click();
$('#file-import').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  f.text().then(txt => showAlert('Replace your library?',
    `“${f.name}” replaces every course, unit and formula in this browser. PDFs and graphs are kept.`, () => {
      if (!lib.importFromJSON(txt)) { toast('That file isn’t a Formulae library', false); return; }
      bind(); go('general'); toast(`Imported ${plural(allEntries().length, 'formula')}`);
    }, 'Replace', 'i-download'));
};

/* ---------------- Library actions: FlowTracker's sheets and menus ---------------- */
// The list under an open formula view isn't redrawn (closing it looks up its card); it is redrawn on close instead
function refresh() { renderSidebar(); if (!viewing()) renderMain(); else state.stale = true; }
function syncSubmit(sh) { const n = sh.querySelector('[data-name]'); const b = sh.querySelector('[data-submit]'); if (n) b.disabled = !n.value.trim(); }
document.querySelectorAll('.sheet.small [data-name]').forEach(i => {
  const sh = i.closest('.sheet');
  i.addEventListener('input', () => syncSubmit(sh));
  i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = sh.querySelector('[data-submit]'); if (!b.disabled) b.click(); } });
});
const chip = (id, name, color, on, none) => `<button type="button" role="radio" class="${none ? 'none' : ''}" aria-checked="${on}" data-id="${escHTML(id)}" style="--c:${color || 'transparent'}"><span class="dot"></span>${escHTML(name)}</button>`;
const courseChips = sel => courses.map(c => chip(c.id, c.name, c.color, c.id === sel)).join('') + chip('', 'No Course', null, !sel, true);
const picked = el => el.querySelector('[aria-checked="true"]')?.dataset.id || null;
document.addEventListener('click', e => {
  const b = e.target.closest('.chips button, .swatch'); if (!b) return;
  b.parentElement.querySelectorAll('[role="radio"]').forEach(x => x.setAttribute('aria-checked', x === b));
  if (b.classList.contains('swatch')) { coursePick = b.dataset.sw; $('#sheet-course .preview-row').style.setProperty('--c', coursePick); }
});
/* A submitter returns false to keep its sheet open (e.g. an address that isn't valid) */
const submitters = {};
document.querySelectorAll('.sheet.small [data-submit]').forEach(b => b.addEventListener('click', () => {
  const sh = b.closest('.sheet'); const v = sh.querySelector('[data-name]')?.value.trim();
  if (submitters[sh.id]?.(v, sh) !== false) closeTop();
}));

// New / Edit Course (name, colour, live sidebar preview)
let courseEdit = null, coursePick = SWATCHES[0];
function openCourseSheet(c) {
  const sh = $('#sheet-course');
  courseEdit = c ? c.id : null;
  coursePick = c ? c.color : SWATCHES[courses.length % SWATCHES.length];
  sh.querySelector('h2').textContent = c ? 'Edit Course' : 'New Course';
  sh.querySelector('[data-submit]').textContent = c ? 'Save' : 'Create';
  sh.querySelector('[data-name]').value = c ? c.name : '';
  sh.querySelector('[data-preview]').textContent = c ? c.name : 'New Course';
  sh.querySelector('[data-count]').textContent = c ? unitsOf(c.id).length : 0;
  $('#swatches').innerHTML = SWATCHES.map(col => `<button type="button" class="swatch" role="radio" aria-checked="${col === coursePick}" aria-label="Colour ${col}" data-sw="${col}" style="--sw:${col}"><svg viewBox="0 0 24 24"><path d="m7 12.4 3.4 3.4 6.6-7.6"/></svg></button>`).join('');
  sh.querySelector('.preview-row').style.setProperty('--c', coursePick);
  syncSubmit(sh); openSheet('#sheet-course');
}
$('#btn-new-course').onclick = e => { e.stopPropagation(); openCourseSheet(); };
$('#sheet-course [data-name]').addEventListener('input', e => { $('#sheet-course [data-preview]').textContent = e.target.value.trim() || (courseEdit ? courseById(courseEdit).name : 'New Course'); });
submitters['sheet-course'] = name => {
  if (courseEdit) Object.assign(courseById(courseEdit), { name, color: coursePick });
  else courses.push({ id: uid('c-'), name, color: coursePick });
  save(); refresh();
};

// New Unit (name + course chips, "No Course" last)
function openUnitSheet() {
  const sh = $('#sheet-unit'); sh.querySelector('[data-name]').value = '';
  const cur = courseById(state.view) ? state.view : unitById(state.view)?.courseId || null;
  $('#unit-chips').innerHTML = courseChips(cur);
  syncSubmit(sh); openSheet('#sheet-unit');
}
submitters['sheet-unit'] = (name, sh) => {
  const id = uid('u-'); const courseId = picked(sh);
  units.push({ id, name, courseId, entries: [] });
  if (courseId) { state.expanded.add(courseId); saveExpanded(); }
  save(); go(id);
};

// One-field sheet (FlowTracker's "name" sheet) and the chip picker (FlowTracker's "move" sheet)
let nameSave = null, moveSave = null;
function openNameSheet({ title, label = 'Name', value = '', button = 'Save', onSave }) {
  const sh = $('#sheet-name'); nameSave = onSave;
  sh.querySelector('h2').textContent = title; $('#name-label').textContent = label;
  sh.querySelector('[data-submit]').textContent = button; sh.querySelector('[data-name]').value = value;
  syncSubmit(sh); openSheet('#sheet-name');
  setTimeout(() => sh.querySelector('[data-name]').select(), 80);
}
submitters['sheet-name'] = v => nameSave?.(v);
function openMoveSheet({ title, sub, chips, onMove }) {
  $('#sheet-move h2').textContent = title; $('#move-name').textContent = sub; $('#move-chips').innerHTML = chips; moveSave = onMove;
  openSheet('#sheet-move');
}
submitters['sheet-move'] = (_, sh) => moveSave?.(picked(sh));

/* Uploader (Converta's upload box): a fan of file cards that spreads while a file is over the zone,
   a light running round the edge, and a list of chosen files marked Ready */
function makeUploader(root, { title, overTitle = 'Drop to add', desc, accept, onChange }) {
  let files = [], depth = 0;
  root.innerHTML = `<div class="up-zone" role="button" tabindex="0" aria-describedby="${root.id}-hint">
      <span class="up-stack" aria-hidden="true"><span class="up-card up-card--l"></span><span class="up-card up-card--r"></span><span class="up-card up-card--front">${icon('i-file-up', 'i')}</span></span>
      <span class="up-t">${title}</span>
      <span class="up-d" id="${root.id}-hint">${desc}</span>
      <span class="up-err" hidden>This file type isn’t supported here.</span>
      <input type="file" accept="${accept}" multiple hidden>
    </div><div class="up-list" hidden></div>`;
  const zone = root.querySelector('.up-zone'), input = root.querySelector('input'), list = root.querySelector('.up-list'), head = root.querySelector('.up-t');
  const ok = f => accept.split(',').some(t => { t = t.trim().toLowerCase(); return t.startsWith('.') ? f.name.toLowerCase().endsWith(t) : t.endsWith('/*') ? (f.type || '').startsWith(t.slice(0, -1)) : f.type === t; });
  const thumb = f => f.type.startsWith('image/') ? `<span class="up-thumb img" style="background-image:url('${f.url}')"></span>`
    : /pdf$/i.test(f.name) ? `<span class="up-thumb pdf">${icon('i-acrobat', 'i')}</span>` : `<span class="up-thumb">${icon('i-file-text', 'i')}</span>`;
  const kind = f => /pdf$/i.test(f.name) ? 'PDF' : f.type.startsWith('image/') ? 'Image' : (f.name.split('.').pop() || 'File').toUpperCase();
  function draw() {
    list.hidden = !files.length;
    list.innerHTML = files.map((f, i) => `<div class="up-row">${thumb(f)}<div class="up-meta"><div class="up-name"></div><div class="up-sub">${kind(f)} · ${fmtBytes(f.size)}</div></div><span class="up-ready">Ready</span><button type="button" class="up-x" aria-label="Remove" data-i="${i}">${icon('i-x', 'i')}</button></div>`).join('');
    list.querySelectorAll('.up-name').forEach((n, i) => n.textContent = files[i].name);
    list.querySelectorAll('.up-x').forEach(b => b.onclick = () => { const [f] = files.splice(+b.dataset.i, 1); if (f.url) URL.revokeObjectURL(f.url); draw(); });
    onChange?.(files);
  }
  function commit(fl) {
    const good = Array.from(fl).filter(ok);
    root.querySelector('.up-err').hidden = !!good.length || !fl.length;
    if (!good.length) return;
    files = files.concat(good.map(f => ({ name: f.name, size: f.size, type: f.type || '', url: (f.type || '').startsWith('image/') ? URL.createObjectURL(f) : null, file: f })));
    draw();
  }
  const setDrag = on => { zone.classList.toggle('drag', on); head.textContent = on ? overTitle : title; };
  zone.onclick = () => input.click();
  zone.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { commit(input.files); input.value = ''; };
  zone.addEventListener('dragenter', e => { e.preventDefault(); depth++; setDrag(true); });
  zone.addEventListener('dragleave', e => { e.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) setDrag(false); });
  zone.addEventListener('dragover', e => e.preventDefault());
  zone.addEventListener('drop', e => { e.preventDefault(); depth = 0; setDrag(false); commit(e.dataTransfer.files); });
  return { get files() { return files; }, reset() { files.forEach(f => f.url && URL.revokeObjectURL(f.url)); files = []; root.querySelector('.up-err').hidden = true; draw(); }, commit, setDrag };
}

// Files: Upload PDF, Add Link, Add Graph
const pdfUp = makeUploader($('#pdf-up'), {
  title: 'Click or drag your PDFs here', overTitle: 'Drop to upload', desc: 'PDF files, one or many. They stay in this browser.', accept: '.pdf,application/pdf',
  onChange: f => { $('#sheet-pdf [data-submit]').disabled = !f.length; $('#sheet-pdf [data-submit]').textContent = f.length > 1 ? `Upload ${f.length}` : 'Upload'; },
});
function openPdfSheet() { pdfUp.reset(); openSheet('#sheet-pdf'); }
submitters['sheet-pdf'] = () => {
  const chosen = pdfUp.files.map(f => f.file);
  (async () => {
    const results = await Promise.allSettled(chosen.map(f => pdfStore.addPdf(f)));
    let n = 0;
    results.forEach(r => { if (r.status === 'fulfilled') { uploads.push(uploadItem(r.value)); n++; } else console.error('PDF upload failed', r.reason); });
    pdfUp.reset(); mergePdfs(); refresh();
    if (n === chosen.length) toast(`Uploaded ${plural(n, 'PDF')}`);
    else toast(`${n} of ${chosen.length} PDFs uploaded. This browser may be out of storage.`, false);
  })();
};
function openFormSheet(sel) { const sh = $(sel); sh.querySelectorAll('input').forEach(i => i.value = ''); syncSubmit(sh); openSheet(sel); }
submitters['sheet-link'] = (name, sh) => {
  let u = sh.querySelector('[type=url]').value.trim();
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = safeUrl(u);
  if (!url || !hostOf(url).includes('.')) { toast('Enter a full web address, like https://example.com/notes.pdf', false); return false; }
  links.push(linkItem({ id: uid('link-'), name, url, dateAdded: new Date().toISOString() }));
  saveLinks(); mergePdfs(); refresh(); toast('Link added');
};
submitters['sheet-graph'] = (name, sh) => {
  const u = sh.querySelector('[type=url]').value.trim(); const graphId = desmosId(u);
  if (!graphId) { toast('That isn’t a Desmos graph link. It should look like desmos.com/calculator/abc123', false); return false; }
  graphs.push(graphItem({ id: uid('g'), title: name, url: u, graphId, dateAdded: new Date().toISOString() }));
  saveGraphs(); refresh(); toast('Graph added');
};

// Menus (FlowTracker wording: Open · Rename · Move… · Delete …)
function courseMenu(c) {
  const n = unitsOf(c.id).length;
  return [[['Edit Name & Colour', '', () => openCourseSheet(c), 'i-edit'], '-',
    ['Delete Course', 'danger', () => showAlert(`Delete “${c.name}”?`, n ? `Its ${plural(n, 'unit')} won’t be deleted; they’ll have no course.` : 'This course is empty.', () => {
      units.forEach(u => { if (u.courseId === c.id) u.courseId = null; });   // keep the units and their formulas
      courses.splice(courses.indexOf(c), 1); state.expanded.delete(c.id); saveExpanded(); save();
      if (state.view === c.id) go('general'); else refresh();
    }), 'i-trash-ft']], c.name];
}
function unitMenu(u) {
  return [[['Open', '', () => go(u.id), 'i-open'],
    ['Rename', '', () => openNameSheet({ title: 'Rename Unit', value: u.name, onSave: v => { u.name = v; save(); refresh(); } }), 'i-edit'],
    ['Move to Course…', '', () => openMoveSheet({ title: 'Move to Course', sub: `“${u.name}”`, chips: courseChips(u.courseId), onMove: id => { u.courseId = id; save(); refresh(); } }), 'i-folder-ft'], '-',
    ['Delete Unit', 'danger', () => showAlert(`Delete “${u.name}”?`, `The unit and its ${plural(u.entries.length, 'formula')} will be deleted. This can’t be undone.`, () => {
      units.splice(units.indexOf(u), 1); save();
      if (state.view === u.id) go(u.courseId || 'general'); else refresh();
    }), 'i-trash-ft']], u.name];
}
function confirmDeleteFormula(entry) {
  showAlert(`Delete “${entry.title}”?`, `It will be removed from ${entry.unit.name}. This can’t be undone.`, () => {
    const { u } = findEntry(entry.id); if (u) { u.entries = u.entries.filter(x => x.id !== entry.id); save(); }
    closeViewer(false); refresh();
  });
}
function formulaMenu(entry) {
  return [[['Open', '', () => openViewer(entry, document.querySelector(`.card.formula[data-id="${CSS.escape(entry.id)}"]`)), 'i-open'],
    ['Edit', '', () => openEditor(entry), 'i-edit'],
    ['Move to Unit…', '', () => openMoveSheet({ title: 'Move to Unit', sub: `“${entry.title}”`,
      chips: units.map(u => chip(u.id, u.name, unitColor(u), u.id === entry.unit.id)).join(''),
      onMove: id => { const { u, e } = findEntry(entry.id); const to = unitById(id); if (!u || !to || to === u) return; u.entries = u.entries.filter(x => x !== e); to.entries.push(e); save(); refresh(); toast(`Moved to ${to.name}`); } }), 'i-folder-ft'], '-',
    ['Delete Formula', 'danger', () => confirmDeleteFormula(entry), 'i-trash-ft']], entry.title];
}
function fileMenu(item, openIt) {
  return [[['Open', '', openIt, 'i-open'],
    ['Rename', '', () => openNameSheet({ title: 'Rename', value: item.name, onSave: v => renameFile(item, v) }), 'i-edit'], '-',
    ['Delete', 'danger', () => showAlert(`Delete “${item.name}”?`, 'It will be removed from this browser. This can’t be undone.', () => removeFile(item)), 'i-trash-ft']], item.name];
}
// Right-click anywhere on a card or a sidebar course/unit opens the same menu
document.addEventListener('contextmenu', e => {
  const t = e.target.closest('.card, .sb-row'); if (!t?._menu) return;
  e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, ...t._menu());
});

/* ---------------- Generate with AI (Gemini) ----------------
   The key stays in this browser (formulae_gemini_key) and goes only to Google. */
const getKey = () => store.get('formulae_gemini_key') || '';
// Same list as FlowTracker: best first; the free ones form the fallback chain.
const MODELS = [
  { h: 'Free' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', note: 'Recommended', free: true },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', note: 'Previous Flash', free: true },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', note: 'Fastest, highest daily limit', free: true },
  { id: 'gemma-4-31b-it', name: 'Gemma 4 31B', note: 'Open model', free: true },
  { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B', note: 'Open model, faster', free: true },
  { h: 'Paid' },
  { id: 'gemini-4-argon', name: 'Gemini 4 Argon', note: 'Most capable, needs billing' },
];
const modelById = id => MODELS.find(x => x.id && x.id === id);
let model = modelById(store.get('formulae_gemini_model')) ? store.get('formulae_gemini_model') : 'gemini-3.8-flash';

const showKeyEdit = (on, focus = true) => { $('#key-saved').hidden = on; $('#key-edit').hidden = !on; if (on && focus) $('#key-input').focus(); };
function drawKey(focus = false) { const k = getKey(); $('#key-mask').textContent = '••••' + k.slice(-4); showKeyEdit(!k, focus); }
$('#key-change').onclick = () => showKeyEdit(true);
$('#key-remove').onclick = () => { store.del('formulae_gemini_key'); drawKey(true); toast('API key removed'); };
$('#key-save').onclick = () => {
  const k = $('#key-input').value.trim();
  if (!k) { aiError('Paste your Gemini API key first.'); return; }
  store.set('formulae_gemini_key', k); $('#key-input').value = ''; aiError(''); drawKey();
};
$('#key-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#key-save').click(); } });

const drawModel = () => { const m = modelById(model); $('#dd-name').textContent = m.name; $('#dd-note').textContent = m.note; };
const closeDD = () => { $('#dd-pop').classList.remove('open'); $('#dd').setAttribute('aria-expanded', 'false'); };
$('#dd').onclick = e => {
  e.stopPropagation(); const pop = $('#dd-pop');
  if (pop.classList.contains('open')) return closeDD();
  pop.innerHTML = MODELS.map((x, i) => x.h
    ? `${i ? '<hr>' : ''}<div class="dd-h" role="presentation">${x.h}</div>`
    : `<button type="button" class="dd-opt" role="option" aria-selected="${x.id === model}" data-id="${x.id}">${icon('i-check')}<b>${x.name}</b><small>${x.note}</small></button>`).join('');
  pop.querySelectorAll('.dd-opt').forEach(o => o.onclick = ev => { ev.stopPropagation(); model = o.dataset.id; store.set('formulae_gemini_model', model); drawModel(); closeDD(); $('#dd').focus(); });
  const r = $('#dd').getBoundingClientRect();
  pop.style.left = r.left + 'px'; pop.style.width = r.width + 'px';
  pop.classList.add('open'); $('#dd').setAttribute('aria-expanded', 'true');
  const h = pop.offsetHeight;   // opens upward when there is no room below, like FlowTracker
  const up = r.bottom + 6 + h > innerHeight - 8; pop.classList.toggle('up', up);
  pop.style.top = (up ? r.top - 6 - h : r.bottom + 6) + 'px';
};
document.addEventListener('click', e => { if (!e.target.closest('#dd-pop')) closeDD(); });

const aiUp = makeUploader($('#ai-up'), {
  title: 'Click or drag your notes here', overTitle: 'Drop to attach', desc: 'PDF, Markdown, text or images. One file or many.',
  accept: '.pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown,image/*',
  onChange: () => aiError(''),
});
function aiError(msg) { const p = $('#ai-err'); p.textContent = msg; p.hidden = !msg; }
function setAiLoading(on) {
  $('#ai-run').disabled = on; $('#ai-run-label').textContent = on ? 'Generating…' : 'Generate';
  $('#sheet-ai').setAttribute('aria-busy', on);
}
let aiBusy = false;
function openAiSheet() {
  if (!aiBusy) { $('#ai-notes').value = ''; $('#ai-yt').value = ''; aiUp.reset(); aiError(''); setAiLoading(false); }
  drawKey(); drawModel();
  openSheet('#sheet-ai');
}
$('#ai-run').onclick = runAi;

const isTextFile = f => (f.type || '').startsWith('text/') || /\.(md|markdown|txt)$/i.test(f.name);
const isYoutube = url => /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?|playlist\?|shorts\/|live\/)|youtu\.be\/)\S+$/i.test(url.trim());
const fileToBase64 = file => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = fail; r.readAsDataURL(file); });

async function runAi() {
  aiError('');
  const key = getKey();
  if (!key) { aiError('Save your Gemini API key first.'); showKeyEdit(true); return; }
  const youtubeLinks = $('#ai-yt').value.split('\n').map(l => l.trim()).filter(Boolean);
  const bad = youtubeLinks.find(l => !isYoutube(l));
  if (bad) { aiError(`“${bad}” doesn’t look like a YouTube link. Use one link per line.`); return; }
  const notes = $('#ai-notes').value.trim();
  const files = aiUp.files.map(f => f.file);
  const big = files.find(f => f.size > 20 * 1024 * 1024);   // Gemini's inline-data limit
  if (big) { aiError(`“${big.name}” is larger than 20 MB and can’t be sent. Remove it or attach a smaller file.`); return; }
  if (!youtubeLinks.length && !notes && !files.length) { aiError('Add some notes, a YouTube link or a file.'); return; }

  aiBusy = true; setAiLoading(true);
  try {
    const r = await generateTableFromAI({ youtubeLinks, notes, files, key });
    if (!r.latex?.trim()) throw new Error('The AI didn’t return a table. Add more detail or a different source.');
    const apply = () => {
      $('#ed-code').value = r.latex;
      if (!$('#ed-title').value.trim() && r.title) $('#ed-title').value = r.title;
      preview(); syncEdSave();
      if (sheetStack[sheetStack.length - 1]?.id === 'sheet-ai') closeTop();
      toast(r.model === model ? 'Table generated. Check it, then Save.' : `Table generated with ${modelById(r.model)?.name || r.model}`);
    };
    if ($('#ed-code').value.trim()) showAlert('Replace the current LaTeX?', 'The editor already has a formula. The generated table will replace it.', apply, 'Replace', 'i-sparkle');
    else apply();
  } catch (err) {
    aiError(err.message || 'Something went wrong while generating.');
  } finally {
    aiBusy = false; setAiLoading(false);
  }
}

/* Ask the Flask backend for a YouTube video's caption text.
   { ok, transcript } on success; backendMissing = no transcription server (static hosting), so Gemini ingests the URL itself */
async function fetchTranscript(url) {
  let res;
  try { res = await fetch('/api/transcript?url=' + encodeURIComponent(url)); } catch (_) { return { ok: false, backendMissing: true }; }
  if (!(res.headers.get('content-type') || '').includes('application/json')) return { ok: false, backendMissing: true };
  let data;
  try { data = await res.json(); } catch (_) { return { ok: false, backendMissing: true }; }
  if (res.ok && data.transcript) return { ok: true, transcript: data.transcript };
  if (res.status === 500 && /not installed/i.test(data.error || '')) return { ok: false, backendMissing: true };
  return { ok: false, backendMissing: false, error: data.error || ('HTTP ' + res.status) };
}

async function generateTableFromAI({ youtubeLinks, notes, files, key }) {
  const textFiles = files.filter(isTextFile), binaryFiles = files.filter(f => !isTextFile(f));
  let dataSection = '';
  if (notes) dataSection += 'Notes / context:\n' + notes + '\n\n';
  for (const tf of textFiles) dataSection += `--- File: ${tf.name} ---\n${await tf.text()}\n\n`;

  // Real caption text from the backend is far more reliable than having Gemini watch the video;
  // with no backend (static build) Gemini ingests the URL natively. A real transcript failure stops generation.
  const videoFileParts = [];
  for (const link of youtubeLinks) {
    const r = await fetchTranscript(link);
    if (r.ok) dataSection += `--- YouTube transcript (${link}) ---\n${r.transcript}\n\n`;
    else if (r.backendMissing) videoFileParts.push({ fileData: { fileUri: link } });
    else throw new Error(`Couldn’t get a transcript for ${link}: ${r.error}`);
  }
  const hasVideos = youtubeLinks.length > 0;

  // PLAIN TEXT, not JSON: wrapping backslash-heavy LaTeX in JSON makes models mis-escape "\\" row breaks
  // ("Misplaced \hline"). Backslashes below are doubled so the string holds single-backslash LaTeX.
  const promptText = `You are an expert academic note-formatter. From the provided source material (attached YouTube video(s), notes, and/or attached files), extract the MATHEMATICAL / ACADEMIC CONTENT ONLY and condense it into a single LaTeX summary table in the EXACT style this app uses.

CONTENT RULES (very important):
- When a YouTube video is attached, base the table on what is actually taught in it: the spoken explanation (transcript/captions) and any formulas, definitions, or diagrams shown on screen.
- Focus exclusively on the subject matter: definitions, formulas, rules, theorems, concepts, and their context.
- IGNORE and NEVER mention the YouTube channel, the creator/uploader/presenter name, the video title, branding, sponsors, "like and subscribe", intros/outros, or any meta-commentary about the video itself. None of that belongs in the table.
- The TITLE must name the academic TOPIC (e.g. "Jensen's Inequality", "Dot Product", "Probability Rules") — it must NEVER be a person's name, a channel name, or a video title.

OUTPUT FORMAT — return PLAIN TEXT only (no JSON, no Markdown code fences), exactly:
TITLE: <3 to 6 word topic name>

<the LaTeX table>

LATEX STYLE RULES (follow precisely):
- One table wrapped in display-math delimiters: $$ ... $$.
- Three-column bordered array: \\begin{array}{|l|l|l|} ... \\end{array}.
- Begin with \\hline, then a bold header row using \\mathbf{...} for each of the three column titles.
- Typical columns are Topic/Concept, Formula/Rule, and Context/Notes; adapt the labels to the subject.
- Each data row: first and third cells are short prose wrapped in \\text{...}; the middle cell is the math/formula written as raw LaTeX (NOT inside \\text{}).
- CRITICAL: end EVERY row (header and data) with a DOUBLE backslash \\\\ immediately followed by \\hline. Never a single backslash before \\hline.
- Keep cells concise. Escape literal percent signs as \\%. Use only the array environment and standard math — no \\usepackage, no tabular, no color, no images.
- Produce roughly 6 to 20 rows depending on how much material is provided.

EXAMPLE of the EXACT desired output (match this structure and style closely):
TITLE: Probability Rules

$$
\\begin{array}{|l|l|l|}
\\hline
\\mathbf{Topic} & \\mathbf{Formula / Explanation} & \\mathbf{Context / Notes} \\\\ \\hline
\\text{Theoretical Probability} & P(A) = \\frac{n(A)}{n(S)} & \\text{Ratio of favorable outcomes to total outcomes} \\\\ \\hline
\\text{Complementary Events} & P(A') = 1 - P(A) & \\text{Probability of event } A \\text{ not occurring} \\\\ \\hline
\\text{Mutually Exclusive} & P(A \\cup B) = P(A) + P(B) & \\text{Events cannot happen at the same time} \\\\ \\hline
\\text{Conditional Prob.} & P(B|A) = \\frac{P(A \\cap B)}{P(A)} & \\text{Probability of } B \\text{ given that } A \\text{ occurred} \\\\ \\hline
\\end{array}
$$

${hasVideos ? 'The YouTube video transcript(s) below are the PRIMARY source — build the table from what is actually taught in them.\n\n' : ''}${dataSection.trim() ? 'Source material:\n' + dataSection : (hasVideos ? '' : 'No text was provided; build the table from the attached file(s).')}`;

  const parts = [{ text: promptText }, ...videoFileParts];
  for (const f of binaryFiles) parts.push({ inlineData: { mimeType: f.type || 'application/pdf', data: await fileToBase64(f) } });
  const body = JSON.stringify({ contents: [{ parts }] });

  // The chosen model first, then the other free models in order when one is out of quota or unavailable
  const chain = [model, ...MODELS.filter(m => m.free && m.id !== model).map(m => m.id)];
  let lastErr;
  for (const m of chain) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (_) { throw new Error('Couldn’t reach Google. Check your internet connection.'); }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch (_) {}
      const name = modelById(m)?.name || m;
      if (res.status === 403) throw new Error('Google rejected the API key (403). ' + (detail || 'Check the key, and that the Generative Language API is enabled for its project.'));
      if (res.status === 400) throw new Error('Google rejected the request (400). ' + (detail || 'The input may be unsupported. If you just pasted a key, check it.'));
      lastErr = new Error(res.status === 429 ? `${name} is out of quota (429). ${detail || 'Free models have per-minute and per-day limits; wait a minute.'}`
        : res.status === 404 ? `${name} isn’t available for this key (404). ${detail}`
        : `Gemini request failed (${res.status}). ${detail}`);
      if ([404, 429, 500, 503].includes(res.status)) continue;   // try the next free model
      throw lastErr;
    }
    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (!raw) throw new Error('The AI returned an empty response. Try again.');
    return { ...parseTable(raw), model: m };
  }
  throw lastErr || new Error('No model could generate the table.');
}

/* Strip code fences, pull out the TITLE line, isolate the $$…$$ (or \[…\]) block, repair row breaks */
function parseTable(raw) {
  let textOut = raw.replace(/```(?:latex|text|tex)?/gi, '').trim();
  let title = '';
  const titleMatch = textOut.match(/^\s*TITLE:\s*(.+)$/im);
  if (titleMatch) { title = titleMatch[1].trim(); textOut = textOut.replace(titleMatch[0], '').trim(); }
  const block = textOut.match(/\$\$[\s\S]*?\$\$/) || textOut.match(/\\\[[\s\S]*?\\\]/);
  let latex = repairTableLatex((block ? block[0] : textOut).trim());
  if (latex && !/^\s*(\$\$|\\\[|\\\(|\$)/.test(latex)) latex = `$$\n${latex}\n$$`;
  return { title, latex };
}
// Some models emit a single backslash before \hline instead of the "\\" row terminator ("Misplaced \hline")
const repairTableLatex = latex => latex ? latex.replace(/(?<!\\)\\(\s*)\\hline/g, '\\\\$1\\hline') : latex;

/* ---------------- Appearance (System / Light / Dark, remembered per browser) ---------------- */
const THEMES = { system: ['System', 'i-system'], light: ['Light', 'i-sun'], dark: ['Dark', 'i-moon'] };
let theme = store.get('formulae_theme') || 'system';
if (!THEMES[theme]) theme = 'system';
const isDark = () => theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme() {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme; else root.dataset.theme = theme;
  const b = $('#btn-appearance');
  b.innerHTML = icon(THEMES[theme][1], 'i'); b.setAttribute('aria-label', 'Appearance: ' + THEMES[theme][0]);
  // The favicon stays flat (the 3D mark is too detailed at tab size) and follows the appearance
  $('#favicon').href = `static/img/logo/formulae-flat-${isDark() ? 'dark' : 'light'}.svg`;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme === 'system') applyTheme(); });
$('#btn-appearance').onclick = e => {
  e.stopPropagation();
  openMenu(e.currentTarget, Object.entries(THEMES).map(([k, [label, ico]]) => [label, '', () => {
    theme = k; store.set('formulae_theme', k); applyTheme();
  }, ico, theme === k]));
};
applyTheme();

/* ---------------- Liquid glass motion (from FlowTracker ui.js) ----------------
   Glint + rim light follow the cursor; the jelly is an underdamped spring per element
   (STIFF 380 / DAMP 22): it wobbles once and stays interruptible. */
(() => {
  const STIFF = 380, DAMP = 22, KEYS = ['x', 'y', 'sx', 'sy'], jellies = new WeakMap();
  const cfg = el => el.classList.contains('btn') ? { shift: 2, stretch: .03, hover: 1.04, press: .94 }
    : el.classList.contains('glass-group') ? { shift: 1, stretch: 0, hover: 1.03, press: .96 }
    : { shift: 1, stretch: 0, hover: 1.05, press: .92 };
  const jelly = el => {
    let j = jellies.get(el);
    if (!j) { j = { el, s: { x: 0, y: 0, sx: 1, sy: 1 }, v: { x: 0, y: 0, sx: 0, sy: 0 }, t: { x: 0, y: 0, sx: 1, sy: 1 }, run: false, last: 0, pressed: false }; jellies.set(el, j); }
    return j;
  };
  const paint = j => { const { x, y, sx, sy } = j.s; j.el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`; };
  function drive(j, target) {
    Object.assign(j.t, target);
    if (reduceMotion.matches) { Object.assign(j.s, j.t); paint(j); return; }
    if (j.run) return;
    j.run = true; j.last = performance.now();
    requestAnimationFrame(function stepJ(now) {
      const dt = Math.min(.032, (now - j.last) / 1000); j.last = now;
      let live = false;
      for (const k of KEYS) {
        const a = -STIFF * (j.s[k] - j.t[k]) - DAMP * j.v[k];
        j.v[k] += a * dt; j.s[k] += j.v[k] * dt;
        if (Math.abs(j.v[k]) > 1e-3 || Math.abs(j.s[k] - j.t[k]) > 1e-4) live = true;
      }
      if (!live) { Object.assign(j.s, j.t); KEYS.forEach(k => j.v[k] = 0); }
      paint(j);
      if (live && j.el.isConnected) requestAnimationFrame(stepJ); else j.run = false;
    });
  }
  function follow(el, e) {
    const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    el.style.setProperty('--mx', px + 'px'); el.style.setProperty('--my', py + 'px');
    const c = cfg(el), j = jelly(el);
    const dx = Math.max(-1, Math.min(1, px / r.width * 2 - 1)), dy = Math.max(-1, Math.min(1, py / r.height * 2 - 1));
    const base = j.pressed ? c.press : c.hover;
    drive(j, { x: dx * c.shift, y: dy * c.shift,
      sx: base * (1 + Math.abs(dx) * c.stretch - Math.abs(dy) * c.stretch * .5),
      sy: base * (1 + Math.abs(dy) * c.stretch - Math.abs(dx) * c.stretch * .5) });
  }
  const lgOf = e => { const el = e.target.closest?.('.lg'); return el && !el.disabled ? el : null; };
  document.addEventListener('pointermove', e => { const el = lgOf(e); if (el) follow(el, e); });
  document.addEventListener('pointerout', e => {
    const el = lgOf(e);
    if (el && !el.contains(e.relatedTarget)) { const j = jelly(el); j.pressed = false; drive(j, { x: 0, y: 0, sx: 1, sy: 1 }); }
  });
  document.addEventListener('pointerdown', e => { const el = lgOf(e); if (!el) return; jelly(el).pressed = true; follow(el, e); });
  document.addEventListener('pointerup', e => {
    const el = lgOf(e); if (!el) return;
    const j = jelly(el), c = cfg(el); j.pressed = false;
    const kick = (1 - c.press) * 5;                 // release kick: one jelly wobble
    j.v.sx += kick; j.v.sy += c.stretch ? -kick : kick;
    follow(el, e);
  });
})();

/* ---------------- Sidebar toggle, search, keys ---------------- */
$('#btn-sidebar').onclick = () => {
  const app = $('#app');
  if (matchMedia('(max-width: 900px)').matches) app.classList.toggle('sb-open');
  else { app.classList.toggle('sb-collapsed'); setTimeout(() => fitAll(document), 440); }
};
$('#sb-scrim').onclick = () => $('#app').classList.remove('sb-open');
// Debounced so typing a word re-renders and re-typesets once, not per keystroke.
// If the user opened something meanwhile, the results wait under it (shown when they go back) instead of closing it.
$('#search').addEventListener('input', e => {
  clearTimeout(searchT);
  const nav = state.nav;
  searchT = setTimeout(() => {
    const q = e.target.value;
    if (q === state.filter) return;
    state.filter = q;
    if (state.nav !== nav) { if (view() === 'grid') renderMain(); else state.stale = true; return; }
    state.stale = false; closeAllViews(); renderMain();
  }, 120);
});
addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
  if (e.key === 'Escape') {
    if ($('#menu').classList.contains('open')) closeMenu();
    else if ($('#dd-pop').classList.contains('open')) closeDD();
    else if ($('#alert').classList.contains('open')) hideAlert();
    else if (sheetStack.length) closeTop();
    else ({ formula: closeViewer, graph: closeGraph, pdf: closePdf, split: closeSplit })[view()]?.();
  }
  if (viewing() && !sheetStack.length && !typing) {
    if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1);
  }
});

/* ---------------- Graph view: a saved Desmos graph, embedded full size ---------------- */
let gvItem = null;
const embed = (title, src) => { const f = document.createElement('iframe'); f.title = title; f.src = src; return f; };
const NO_GRAPH = 'This graph has no Desmos link. Delete it and add it again from Share in Desmos.';
const viewMsg = text => { const p = document.createElement('p'); p.className = 'gv-msg'; p.textContent = text; return p; };
// The graph embedded, or a message when its saved link has no graph id (never a blank calculator)
const graphEmbed = g => g.graphId ? embed(g.name, desmosUrl(g)) : viewMsg(NO_GRAPH);
function openGraph(g, fromCard) {
  state.nav++;
  gvItem = g; closeMenu();
  $('#gv-heading').textContent = g.name; $('#gv-sub').textContent = g.sub;
  $('#gv-back').title = $('#gv-back').ariaLabel = backLabel();
  $('#gv-frame').replaceChildren();
  morph(fromCard, () => $('#gv'), () => { $('#main').dataset.view = 'graph'; })
    .then(() => { $('#gv-back').focus({ preventScroll: true }); if (gvItem === g && graphing()) $('#gv-frame').replaceChildren(graphEmbed(g)); });
}
function closeGraph(animate = true) {
  if (!graphing()) return;
  const el = gvItem && document.querySelector(`.card.file[data-gid="${CSS.escape(gvItem.id)}"]`);
  const done = () => { showGrid(); $('#gv-frame').replaceChildren(); };   // drop the embed so it can't prompt on leave
  if (!animate) return done();
  el?.scrollIntoView({ block: 'nearest' });
  morph($('#gv'), () => el, done).then(() => el?.querySelector('.card-link').focus({ preventScroll: true }));
}
$('#gv-back').onclick = () => closeGraph();
$('#gv-open').onclick = () => { if (!gvItem) return; if (gvItem.graphId) open(desmosUrl(gvItem), '_blank', 'noopener'); else toast(NO_GRAPH, false); };
$('#gv-copy').onclick = ev => { if (gvItem?.graphId) copyText(desmosUrl(gvItem), ev.currentTarget, 'Copy link', 'i', 'Link copied'); else toast(NO_GRAPH, false); };
$('#gv-clear').onclick = () => showAlert(`Delete “${gvItem.name}”?`, 'It will be removed from this browser. This can’t be undone.',
  () => { const g = gvItem; closeGraph(false); removeFile(g); });
renameInPlace($('#gv-heading'), () => gvItem?.name, t => renameFile(gvItem, t));

/* ---------------- PDF view: an uploaded PDF or a link, inside the app (one iframe) ---------------- */
let pvItem = null, pvUrl = null;
const dropPvUrl = () => { if (pvUrl) URL.revokeObjectURL(pvUrl); pvUrl = null; };
async function openPdf(p, fromCard) {
  const nav = ++state.nav;
  pvItem = p; closeMenu();
  $('#pv-heading').textContent = p.name; $('#pv-sub').textContent = p.sub;
  $('#pv-back').title = $('#pv-back').ariaLabel = backLabel();
  const frame = $('#pv-frame'), msg = $('#pv-msg');
  frame.querySelector('iframe')?.remove(); dropPvUrl();
  let u = null;
  try { u = await fileUrl(p); } catch (e) { console.error(e); }
  // The user went elsewhere while the PDF was read from IndexedDB: don't cover where they are now
  if (pvItem !== p || state.nav !== nav) { if (u?.startsWith('blob:')) URL.revokeObjectURL(u); return; }
  if (u) { if (u.startsWith('blob:')) pvUrl = u; frame.append(embed(p.name, u)); msg.hidden = true; }
  else { msg.hidden = false; msg.textContent = p.kind === 'link' ? 'This link has no valid address. Add it again with a full https:// URL.' : 'This PDF couldn’t be found in this browser. It may have been removed.'; }
  morph(fromCard, () => $('#pv'), () => { $('#main').dataset.view = 'pdf'; })
    .then(() => $('#pv-back').focus({ preventScroll: true }));
}
function closePdf(animate = true) {
  if (!pdfing()) return;
  const done = () => { showGrid(); $('#pv-frame iframe')?.remove(); dropPvUrl(); };   // replace the iframe and free the blob
  if (!animate) return done();
  const el = pvItem && document.querySelector(`.card.file[data-gid="${CSS.escape(pvItem.id)}"]`);
  morph($('#pv'), () => el, done).then(() => el?.querySelector('.card-link').focus({ preventScroll: true }));
}
$('#pv-back').onclick = () => closePdf();
$('#pv-open').onclick = () => { const u = pvUrl || (pvItem?.kind === 'link' && safeUrl(pvItem.url)); if (u) open(u, '_blank', 'noopener'); };
$('#pv-clear').onclick = () => showAlert(`Delete “${pvItem.name}”?`, 'It will be removed from this browser. This can’t be undone.',
  () => { const p = pvItem; closePdf(false); removeFile(p); });
renameInPlace($('#pv-heading'), () => pvItem?.name, t => renameFile(pvItem, t));

/* ---------------- Split view ----------------
   Up to three panes side by side. A pane is { kind: 'formula' | 'graph' | 'pdf', item, f (share of the width) }.
   Panes keep their element while others are added, removed or resized, so an open PDF or graph never reloads. */
const SPLIT_MAX = 3;
const formulaById = id => { const { u, e } = findEntry(id); return e && withUnit(u)(e); };
const paneItem = p => p.kind === 'formula' ? formulaById(p.item) : p.item;
const paneIcon = p => p.kind === 'formula' ? 'i-sigma' : p.kind === 'graph' ? 'i-desmos' : pdfIcon(p.item);
const paneName = p => (p.kind === 'formula' ? paneItem(p)?.title : p.item.name) || 'Untitled';
const samePane = (a, b) => a.kind === b.kind && a.item === b.item;
const svVertical = () => getComputedStyle($('#sv-panes')).flexDirection === 'column';

/* The picker: every formula, graph and PDF, grouped like the sidebar */
function pickerItems(onPick, current) {
  const row = (label, sel, ico) => [label, '', () => onPick(sel), ico, current ? samePane(current, sel) : undefined];
  const out = [];
  const fs = allEntries();
  if (fs.length) out.push('Formulas', ...fs.map(e => row(e.title, { kind: 'formula', item: e.id }, 'i-sigma')));
  if (graphs.length) out.push('Desmos Graphs', ...graphs.map(g => row(g.name, { kind: 'graph', item: g }, 'i-desmos')));
  if (pdfs.length) out.push('PDFs', ...pdfs.map(p => row(p.name, { kind: 'pdf', item: p }, pdfIcon(p))));
  return out;
}

function makePane(sel) {
  const p = { kind: sel.kind, item: sel.item, f: 1 };
  const el = p.el = document.createElement('div'); el.className = 'sv-pane';
  el.innerHTML = `<div class="sv-head"><button class="sv-pick" aria-haspopup="menu" aria-expanded="false"></button><span class="grow"></span><span class="sv-acts"></span>
    <button class="icon-btn sv-close" title="Close pane" aria-label="Close pane">${icon('i-x', 'i')}</button></div><div class="sv-body"></div>`;
  const pick = el.querySelector('.sv-pick');
  pick.onclick = e => {
    e.stopPropagation(); pick.setAttribute('aria-expanded', 'true');
    openMenu(pick, pickerItems(s => { Object.assign(p, s); fillPane(p); }, p), 'Show in this pane');
    const off = () => { pick.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', off); };
    setTimeout(() => document.addEventListener('click', off), 0);
  };
  el.querySelector('.sv-close').onclick = () => removePane(p);
  fillPane(p);
  return p;
}
/* Fit to the pane like the formula view, but never below a readable size: a wide table scrolls inside its pane instead */
function fitPaneMath(m) { if (!m) return; fitWidth(m); if (parseFloat(m.style.fontSize) < 16) m.style.fontSize = '16px'; }
function clearPane(p) { if (p.blobUrl) URL.revokeObjectURL(p.blobUrl); p.blobUrl = null; p.token = null; }
function fillPane(p) {
  clearPane(p);
  const it = paneItem(p), body = p.el.querySelector('.sv-body'), acts = p.el.querySelector('.sv-acts');
  const pick = p.el.querySelector('.sv-pick'); pick.setAttribute('aria-expanded', 'false');
  pick.innerHTML = `${icon(paneIcon(p), 'i')}<span class="t"></span>${icon('i-chev-d', 'i chev')}`;
  pick.querySelector('.t').textContent = paneName(p);
  pick.title = p.kind === 'formula' && it ? `${it.title} — ${it.unit.name}` : paneName(p);
  acts.innerHTML = ''; body.className = 'sv-body'; body.innerHTML = '';
  if (p.kind === 'formula') {
    // Step through the library without leaving the pane
    acts.innerHTML = `<button class="icon-btn" data-d="-1" title="Previous formula" aria-label="Previous formula">${icon('i-chev-l', 'i')}</button>`
      + `<button class="icon-btn" data-d="1" title="Next formula" aria-label="Next formula">${icon('i-chev-r', 'i')}</button>`;
    acts.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
      const all = allEntries(); if (!all.length) return;
      const i = all.findIndex(e => e.id === p.item);
      p.item = all[(i + +b.dataset.d + all.length) % all.length].id; fillPane(p);
    });
    body.classList.add('math');
    const m = document.createElement('div'); m.className = 'sv-math'; m.textContent = it ? texOf(it.raw) : ''; body.append(m);
    typeset(body).then(() => fitPaneMath(m));
  } else if (p.kind === 'graph') {
    body.append(graphEmbed(p.item));
  } else {
    const d = p.item, token = p.token = {};
    fileUrl(d).catch(() => null).then(u => {
      if (p.token !== token || !body.isConnected) { if (u?.startsWith('blob:')) URL.revokeObjectURL(u); return; }
      if (!u) { const msg = document.createElement('p'); msg.className = 'gv-msg'; msg.textContent = 'This file couldn’t be found in this browser.'; body.append(msg); return; }
      if (u.startsWith('blob:')) p.blobUrl = u;
      body.append(embed(d.name, d.kind === 'link' ? u : u + '#view=FitH'));
    });
  }
}

/* Dividers carry no state, so they are rebuilt after every change; inserting them never moves a pane */
function layoutSplit() {
  const box = $('#sv-panes');
  box.querySelectorAll('.sv-div').forEach(d => d.remove());
  split.forEach((p, i) => {
    p.el.style.flexGrow = p.f;
    if (i) box.insertBefore(makeDivider(i), p.el);
  });
  $('#sv-add').disabled = split.length >= SPLIT_MAX;
  $('#sv-add').title = split.length >= SPLIT_MAX ? 'Up to three panes' : 'Add a pane';
  refitSplit();
}
function refitSplit() { split.forEach(p => { if (p.kind === 'formula') fitPaneMath(p.el.querySelector('.sv-math')); }); }
function makeDivider(i) {
  const d = document.createElement('div'); d.className = 'sv-div'; d.tabIndex = 0;
  d.setAttribute('role', 'separator'); d.setAttribute('aria-label', 'Resize panes');
  d.setAttribute('aria-orientation', svVertical() ? 'horizontal' : 'vertical');
  const a = split[i - 1], b = split[i];
  const size = r => svVertical() ? r.height : r.width;
  const MIN = () => svVertical() ? 120 : 180;
  const set = sa => {   // sa: the new size of the pane before the divider, in px
    const total = size(a.el.getBoundingClientRect()) + size(b.el.getBoundingClientRect()), sum = a.f + b.f;
    sa = Math.min(total - MIN(), Math.max(MIN(), sa));
    a.f = sum * sa / total; b.f = sum - a.f;
    a.el.style.flexGrow = a.f; b.el.style.flexGrow = b.f;
    refitSplit();
  };
  d.onpointerdown = e => {
    if (e.button) return;
    e.preventDefault(); d.setPointerCapture(e.pointerId);
    const start = svVertical() ? e.clientY : e.clientX, sa0 = size(a.el.getBoundingClientRect());
    $('#sv').classList.add('dragging'); d.classList.add('on');
    d.onpointermove = ev => set(sa0 + (svVertical() ? ev.clientY : ev.clientX) - start);
    d.onpointerup = d.onpointercancel = () => { d.onpointermove = d.onpointerup = d.onpointercancel = null; $('#sv').classList.remove('dragging'); d.classList.remove('on'); refitSplit(); };
  };
  d.ondblclick = () => { const sum = a.f + b.f; a.f = b.f = sum / 2; layoutSplit(); };   // even the two out again
  d.onkeydown = e => {
    const k = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!k) return;
    e.preventDefault(); set(size(a.el.getBoundingClientRect()) + k * 32);
  };
  return d;
}

function addPane(sel) {
  if (split.length >= SPLIT_MAX) return;
  const p = makePane(sel); split.push(p); $('#sv-panes').append(p.el); layoutSplit();
}
function removePane(p) {
  if (split.length <= 2) {   // one left: it opens on its own, full size
    const rest = split.find(x => x !== p);
    return viewMotion($('#sv'), 'out').then(() => { teardownSplit(); showGrid(); openSingle(rest); });
  }
  clearPane(p); p.el.remove(); split.splice(split.indexOf(p), 1); layoutSplit();
}
function openSingle(p) {
  const it = paneItem(p); if (!it) return;
  if (p.kind === 'formula') { if (!state.visible.some(e => e.id === it.id)) state.visible = allEntries(); openViewer(it, null); }
  else if (p.kind === 'graph') openGraph(it, null);
  else openPdf(it, null);
}
function teardownSplit() { split.forEach(clearPane); split = []; $('#sv-panes').innerHTML = ''; }

/* Enter from a full-size view: that item on the left, the picked one beside it */
function enterSplit(sels, fromView) {
  state.nav++;
  closeMenu();
  return (fromView ? viewMotion(fromView, 'out') : Promise.resolve()).then(() => {
    closeAllViews(); teardownSplit();
    $('#sv-back').title = $('#sv-back').ariaLabel = backLabel();
    $('#main').dataset.view = 'split';
    sels.forEach(s => { const p = makePane(s); split.push(p); $('#sv-panes').append(p.el); });
    layoutSplit();
    return viewMotion($('#sv'), 'in');
  }).then(() => { refitSplit(); $('#sv-back').focus({ preventScroll: true }); });
}
function closeSplit(animate = true) {
  if (!splitting()) return;
  const done = () => { teardownSplit(); showGrid(); };
  if (!animate) return done();
  viewMotion($('#sv'), 'out').then(done);
}
const besideFrom = (btnId, current, view) => $(btnId).onclick = e => {
  e.stopPropagation();
  openMenu(e.currentTarget, pickerItems(sel => enterSplit([current(), sel], $(view))), 'Open beside');
};
besideFrom('#vw-split', () => ({ kind: 'formula', item: state.visible[state.viewIdx].id }), '#fv');
besideFrom('#gv-split', () => ({ kind: 'graph', item: gvItem }), '#gv');
besideFrom('#pv-split', () => ({ kind: 'pdf', item: pvItem }), '#pv');
$('#sv-add').onclick = e => { e.stopPropagation(); if (split.length < SPLIT_MAX) openMenu(e.currentTarget, pickerItems(addPane), 'Add a pane'); };
$('#sv-back').onclick = () => closeSplit();
let svAxis = null;   // rebuild the dividers when the panes turn from side by side to stacked (phone rotated)
addEventListener('resize', () => { if (!splitting()) return; const v = svVertical(); if (v !== svAxis) { svAxis = v; layoutSplit(); } else refitSplit(); });

/* ---------------- Start ---------------- */
renderSidebar(); renderMain();
loadUploads().then(() => {   // PDF metadata comes from IndexedDB, after first paint
  mergePdfs(); renderSidebar();
  if (view() === 'grid' && (state.view === 'pdfs' || state.filter)) renderMain();
});
})();
