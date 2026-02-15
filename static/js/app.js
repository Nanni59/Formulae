// app.js
// UI Orchestrator
// - Fixed Modal Type reference
// - Added 'General' tab support
// - Added Unit deletion support
// - Added PDFs tab with local IndexedDB storage

class App {
    constructor() {
        this.library = new window.FormulaLibrary();
        this.renderer = new window.Renderer();
        try {
            this.pdfStore = window.PdfStore ? new window.PdfStore() : null;
        } catch (e) {
            console.error("PdfStore init failed", e);
            this.pdfStore = null;
        }

        this.state = {
            currentUnitId: 'general', // Default to General
            editingEntryId: null, // null = View Mode, ID = Edit Mode
            viewingEntryId: null, // For view modal
            isNew: false,
            visibleEntries: [] // Track currently filtered entries for navigation
        };

        // DOM Elements
        this.els = {
            sidebarList: document.getElementById('unit-list'),
            mainContent: document.getElementById('main-content'),
            searchBar: document.getElementById('search-input'),
            addEntryBtn: document.getElementById('btn-add-entry'),
            addUnitBtn: document.getElementById('btn-add-unit'),

            // Edit Modal
            modal: document.getElementById('entry-modal'),
            modalTitle: document.getElementById('modal-title-input'),
            modalRaw: document.getElementById('modal-raw-input'),
            modalPreview: document.getElementById('modal-preview-area'),
            modalSave: document.getElementById('btn-save-entry'),
            modalCancel: document.getElementById('btn-cancel-entry'),

            // View Modal
            viewModal: document.getElementById('view-modal'),
            viewModalTitle: document.getElementById('view-modal-title'),
            viewModalContent: document.getElementById('view-modal-content'),
            viewModalEditBtn: document.getElementById('btn-edit-view'),
            viewModalCloseBtn: document.getElementById('btn-close-view'),
            btnZoomIn: document.getElementById('btn-zoom-in'),
            btnZoomOut: document.getElementById('btn-zoom-out'),

            exportBtn: document.getElementById('btn-export'),
            importInput: document.getElementById('file-import'),

            // PDF elements
            pdfUploadInput: document.getElementById('pdf-upload-input'),
            pdfViewerModal: document.getElementById('pdf-viewer-modal'),
            pdfViewerTitle: document.getElementById('pdf-viewer-title'),
            pdfViewerIframe: document.getElementById('pdf-viewer-iframe'),
            btnClosePdfViewer: document.getElementById('btn-close-pdf-viewer'),

            // Fullscreen
            btnFullscreen: document.getElementById('btn-fullscreen')
        };

        this.currentZoom = 1;

        this.init();
    }

    init() {
        this.renderSidebar();
        this.renderMainContent();
        this.attachListeners();
    }

    attachListeners() {
        // Search
        if (this.els.searchBar) {
            this.els.searchBar.addEventListener('input', (e) => {
                this.renderMainContent(e.target.value);
            });
        }

        // Fullscreen Toggle (Sidebar)
        if (this.els.btnFullscreen) {
            this.els.btnFullscreen.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // Add Entry / Upload PDF
        if (this.els.addEntryBtn) {
            this.els.addEntryBtn.addEventListener('click', () => {
                if (this.state.currentUnitId === 'pdfs') {
                    this.els.pdfUploadInput.click();
                    return;
                }
                if (this.state.currentUnitId === 'general') {
                    alert("Please select a specific Unit to add an entry.");
                    return;
                }
                this.openModal(null); // New Entry
            });
        }

        // PDF Upload
        if (this.els.pdfUploadInput) {
            this.els.pdfUploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    await this.pdfStore.addPdf(file);
                    this.els.pdfUploadInput.value = '';
                    this.renderSidebar();
                    this.renderMainContent();
                } catch (err) {
                    console.error('Failed to upload PDF:', err);
                    alert('Failed to upload PDF. Storage may be full.');
                }
            });
        }

        // PDF Viewer Modal Close
        if (this.els.btnClosePdfViewer) {
            this.els.btnClosePdfViewer.addEventListener('click', () => {
                if (this.currentPdfBlobUrl) {
                    URL.revokeObjectURL(this.currentPdfBlobUrl);
                    this.currentPdfBlobUrl = null;
                }
                this.els.pdfViewerIframe.src = '';
                this.els.pdfViewerModal.classList.remove('visible');
            });
        }

        // Add Unit
        if (this.els.addUnitBtn) {
            this.els.addUnitBtn.addEventListener('click', () => {
                const name = prompt("Enter name for new Unit:");
                if (name && name.trim()) {
                    const newUnit = this.library.createUnit(name.trim());
                    this.state.currentUnitId = newUnit.id;
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });
        }

        // Edit Modal Controls
        if (this.els.modalCancel) {
            this.els.modalCancel.addEventListener('click', () => this.closeModal());
        }
        if (this.els.modalSave) {
            this.els.modalSave.addEventListener('click', () => this.saveEntry());
        }

        // Live Preview in Edit Modal
        if (this.els.modalRaw) {
            this.els.modalRaw.addEventListener('input', (e) => {
                this.renderer.render(e.target.value, this.els.modalPreview);
            });
        }

        // View Modal Controls
        if (this.els.viewModalCloseBtn) {
            this.els.viewModalCloseBtn.addEventListener('click', () => {
                this.els.viewModal.classList.remove('visible');
            });
        }

        if (this.els.btnZoomIn) {
            this.els.btnZoomIn.addEventListener('click', () => this.handleZoom(0.25));
        }
        if (this.els.btnZoomOut) {
            this.els.btnZoomOut.addEventListener('click', () => this.handleZoom(-0.25));
        }

        if (this.els.viewModalEditBtn) {
            this.els.viewModalEditBtn.addEventListener('click', () => {
                this.els.viewModal.classList.remove('visible');
                let entry = null;
                if (this.state.currentUnitId === 'general') {
                    const all = this.library.getAllEntries();
                    entry = all.find(e => e.id === this.state.viewingEntryId);
                    const units = this.library.getUnits();
                    const ownerUnit = units.find(u => u.entries.some(e => e.id === this.state.viewingEntryId));
                    if (ownerUnit) {
                        this.state.currentUnitId = ownerUnit.id;
                        this.renderSidebar();
                    }
                } else {
                    const unit = this.library.getUnit(this.state.currentUnitId);
                    entry = unit.entries.find(e => e.id === this.state.viewingEntryId);
                }

                if (entry) this.openModal(entry);
            });
        }

        // Sidebar selection
        if (this.els.sidebarList) {
            this.els.sidebarList.addEventListener('click', (e) => {
                // Check if delete button was clicked
                if (e.target.closest('.delete-unit-btn')) {
                    e.stopPropagation();
                    const unitId = e.target.closest('li').dataset.id;
                    if (confirm('Delete this Unit and all its formulas?')) {
                        this.library.deleteUnit(unitId);
                        if (this.state.currentUnitId === unitId) {
                            this.state.currentUnitId = 'general';
                        }
                        this.renderSidebar();
                        this.renderMainContent();
                    }
                }

                // Rename
                if (e.target.closest('.rename-unit-btn')) {
                    e.stopPropagation();
                    const li = e.target.closest('li');
                    const unitId = li.dataset.id;
                    const unit = this.library.getUnit(unitId);

                    const newName = prompt("Rename Unit:", unit.name);
                    if (newName && newName.trim() && newName.trim() !== unit.name) {
                        this.library.renameUnit(unitId, newName.trim());
                        this.renderSidebar();
                        if (this.state.currentUnitId === unitId) {
                            this.renderMainContent(); // Update header if active
                        }
                    }
                    return;
                }

                const li = e.target.closest('li');
                if (li) {
                    this.state.currentUnitId = li.dataset.id;
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });
        }

        // Export/Import
        if (this.els.exportBtn) {
            this.els.exportBtn.addEventListener('click', () => {
                const json = this.library.exportToJSON();
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "formula_library_backup.json";
                a.click();
            });
        }

        if (this.els.importInput) {
            this.els.importInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    if (this.library.importFromJSON(evt.target.result)) {
                        alert("Library imported successfully!");
                        window.location.reload();
                    } else {
                        alert("Import failed.");
                    }
                };
                reader.readAsText(file);
            });
        }

        // Global keyboard navigation
        window.addEventListener('keydown', (e) => {
            if (this.els.viewModal.classList.contains('visible')) {
                if (e.key === 'ArrowRight') {
                    this.navigateEntry(1);
                } else if (e.key === 'ArrowLeft') {
                    this.navigateEntry(-1);
                }
            }
        });

        this.attachDragAndDrop();
    }

    attachDragAndDrop() {
        // Sidebar Drag and Drop (Unit Reordering)
        let draggedUnitId = null;

        if (this.els.sidebarList) {
            this.els.sidebarList.addEventListener('dragstart', (e) => {
                const li = e.target.closest('li');
                if (!li || li.dataset.id === 'general' || li.dataset.id === 'pdfs') {
                    e.preventDefault();
                    return;
                }
                draggedUnitId = li.dataset.id;
                e.dataTransfer.effectAllowed = 'move';
                li.classList.add('dragging');
            });

            this.els.sidebarList.addEventListener('dragend', (e) => {
                const li = e.target.closest('li');
                if (li) li.classList.remove('dragging');
                document.querySelectorAll('.unit-list li').forEach(el => el.classList.remove('drag-over'));
            });

            this.els.sidebarList.addEventListener('dragover', (e) => {
                e.preventDefault();
                const li = e.target.closest('li');
                if (!li || li.dataset.id === 'general' || li.dataset.id === 'pdfs' || li.dataset.id === draggedUnitId) return;
                li.classList.add('drag-over');
            });

            this.els.sidebarList.addEventListener('dragleave', (e) => {
                const li = e.target.closest('li');
                if (li) li.classList.remove('drag-over');
            });

            this.els.sidebarList.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetLi = e.target.closest('li');
                if (!targetLi || targetLi.dataset.id === 'general' || targetLi.dataset.id === 'pdfs') return;

                const targetUnitId = targetLi.dataset.id;
                if (draggedUnitId && draggedUnitId !== targetUnitId) {
                    const units = this.library.getUnits();
                    const fromIndex = units.findIndex(u => u.id === draggedUnitId);
                    const toIndex = units.findIndex(u => u.id === targetUnitId);

                    if (fromIndex !== -1 && toIndex !== -1) {
                        this.library.reorderUnits(fromIndex, toIndex);
                        this.renderSidebar();
                    }
                }
            });
        }

        // Main Content Drag and Drop (Card Reordering)
        let draggedCardId = null;

        if (this.els.mainContent) {
            this.els.mainContent.addEventListener('dragstart', (e) => {
                // Disable reordering in General view
                if (this.state.currentUnitId === 'general') {
                    e.preventDefault();
                    return;
                }
                const card = e.target.closest('.entry-card');
                if (!card) return;

                draggedCardId = card.dataset.id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedCardId);
                setTimeout(() => card.classList.add('dragging'), 0);
            });

            this.els.mainContent.addEventListener('dragend', (e) => {
                const card = e.target.closest('.entry-card');
                if (card) card.classList.remove('dragging');
                document.querySelectorAll('.entry-card').forEach(c => c.classList.remove('drag-over'));
            });

            this.els.mainContent.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (this.state.currentUnitId === 'general') return;
                const card = e.target.closest('.entry-card');
                if (!card || card.dataset.id === draggedCardId) return;
                card.classList.add('drag-over');
            });

            this.els.mainContent.addEventListener('dragleave', (e) => {
                const card = e.target.closest('.entry-card');
                if (card) card.classList.remove('drag-over');
            });

            this.els.mainContent.addEventListener('drop', (e) => {
                e.preventDefault();
                if (this.state.currentUnitId === 'general') return;

                const targetCard = e.target.closest('.entry-card');
                if (!targetCard || !draggedCardId) return;

                const targetId = targetCard.dataset.id;
                if (draggedCardId !== targetId) {
                    const unit = this.library.getUnit(this.state.currentUnitId);
                    const fromIndex = unit.entries.findIndex(e => e.id === draggedCardId);
                    const toIndex = unit.entries.findIndex(e => e.id === targetId);

                    if (fromIndex !== -1 && toIndex !== -1) {
                        this.library.reorderEntries(this.state.currentUnitId, fromIndex, toIndex);
                        this.renderMainContent();
                    }
                }
            });
        }
    }

    async renderSidebar() {
        const units = this.library.getUnits();
        const totalEntries = units.reduce((sum, u) => sum + u.entries.length, 0);
        let pdfCount = 0;

        if (this.pdfStore) {
            try { pdfCount = await this.pdfStore.getCount(); } catch (e) { /* ignore */ }
        }

        let html = `
            <li class="${this.state.currentUnitId === 'general' ? 'active' : ''}" data-id="general">
                <span>General</span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${totalEntries}</span>
                </div>
            </li>
        `;

        if (this.pdfStore) {
            html += `
            <li class="${this.state.currentUnitId === 'pdfs' ? 'active' : ''}" data-id="pdfs">
                <span style="color:#c80a0a; font-weight:600;">PDFs</span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${pdfCount}</span>
                </div>
            </li>`;
        }

        html += `<div style="border-top:1px solid #ddd; margin: 10px 0;"></div>`;

        html += units.map(u => `
            <li class="${u.id === this.state.currentUnitId ? 'active' : ''}" data-id="${u.id}" draggable="true">
                <span>${u.name}</span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${u.entries.length}</span>
                    <div class="unit-actions">
                         <button class="rename-unit-btn" title="Rename Unit">&#9998;</button>
                         <button class="delete-unit-btn" title="Delete Unit">&times;</button>
                    </div>
                </div>
            </li>
        `).join('');

        this.els.sidebarList.innerHTML = html;
        this.setupSidebarDragDrop();
    }

    setupSidebarDragDrop() {
        // Clear old listeners if any (simple implementation assumes re-render safe)
        // Actually, delegation in attachListeners is better, but here we can just ensure
        // attributes are set. The listeners will be attached once in init/attachListeners.
    }

    renderMainContent(filterText = '') {
        if (this.state.currentUnitId === 'pdfs') {
            if (!this.pdfStore) {
                this.state.currentUnitId = 'general';
                this.renderMainContent(filterText);
                return;
            }
            this.els.addEntryBtn.style.display = 'inline-block';
            this.els.addEntryBtn.innerText = 'Upload PDF';
            this.renderPdfContent(filterText);
            return;
        }

        this.els.addEntryBtn.innerText = 'New Entry';
        let entries = [];
        if (this.state.currentUnitId === 'general') {
            entries = this.library.getAllEntries();
            this.els.addEntryBtn.style.display = 'none';
        } else {
            const unit = this.library.getUnit(this.state.currentUnitId);
            if (!unit) {
                this.state.currentUnitId = 'general';
                this.renderMainContent(filterText);
                return;
            }
            entries = unit.entries;
            this.els.addEntryBtn.style.display = 'inline-block';
        }

        if (filterText) {
            const lower = filterText.toLowerCase();
            entries = entries.filter(e => e.title.toLowerCase().includes(lower));
        }

        this.state.visibleEntries = entries; // Save for navigation

        this.els.mainContent.innerHTML = '';
        if (entries.length === 0) {
            this.els.mainContent.innerHTML = '<div class="empty-state">No formulas found.</div>';
            return;
        }

        entries.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'entry-card';
            card.draggable = this.state.currentUnitId !== 'general';
            card.dataset.id = entry.id;

            const header = document.createElement('div');
            header.className = 'card-header';
            header.innerHTML = `<h3>${entry.title}</h3>`;

            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const copyBtn = document.createElement('button');
            copyBtn.innerText = 'Copy LaTeX';
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(entry.raw);
                copyBtn.innerText = 'Copied!';
                setTimeout(() => copyBtn.innerText = 'Copy LaTeX', 1000);
            };

            const moveBtn = document.createElement('button');
            moveBtn.innerText = 'Move';
            moveBtn.onclick = (e) => {
                e.stopPropagation();
                this.showMoveMenu(moveBtn, entry);
            };

            const delBtn = document.createElement('button');
            delBtn.innerText = 'Delete';
            delBtn.className = 'btn-danger';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete this entry?')) {
                    this.library.deleteEntry(this.state.currentUnitId, entry.id);
                    this.renderMainContent();
                    this.renderSidebar();
                }
            };

            if (this.state.currentUnitId !== 'general') actions.append(delBtn);
            if (this.library.getUnits().length > 1) actions.append(moveBtn); // Only show move if multiple units exist
            actions.prepend(copyBtn);
            header.append(actions);

            const preview = document.createElement('div');
            preview.className = 'card-preview';

            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') this.openViewModal(entry);
            });

            card.append(header, preview);
            this.els.mainContent.append(card);

            // Render and then auto-scale preview
            this.renderer.render(entry.raw, preview).then(() => {
                const wrapper = preview.querySelector('.scale-wrapper');
                if (wrapper) {
                    this.renderer.scaleContent(preview, wrapper, null, { isPreview: true });
                }
            });
        });
    }

    openViewModal(entry) {
        this.state.viewingEntryId = entry.id;
        this.els.viewModalTitle.innerText = entry.title;
        this.els.viewModal.classList.add('visible');

        this.renderer.render(entry.raw, this.els.viewModalContent).then(() => {
            const wrapper = this.els.viewModalContent.querySelector('.scale-wrapper');
            if (wrapper) {
                const performScale = () => {
                    const result = this.renderer.scaleContent(this.els.viewModalContent, wrapper, null, {
                        padding: 80 // More padding for detailed view
                    });
                    this.currentZoom = result.scale;
                    this.minZoomLimit = result.fitWidthScale;
                };

                // Use RAF to ensure DOM is painted and dimensions are available
                requestAnimationFrame(() => {
                    performScale();
                    // Backup: Run again shortly after to catch any font-loading layout shifts
                    setTimeout(performScale, 50);
                });
            }
        });

        if (!this._hasResizeListener) {
            window.addEventListener('resize', () => {
                if (this.els.viewModal.classList.contains('visible')) {
                    const wrapper = this.els.viewModalContent.querySelector('.scale-wrapper');
                    if (wrapper) {
                        const result = this.renderer.scaleContent(this.els.viewModalContent, wrapper, this.currentZoom);
                        this.currentZoom = result.scale;
                    }
                }
            });
            this._hasResizeListener = true;
        }
    }

    navigateEntry(offset) {
        if (!this.state.visibleEntries.length) return;
        let currentIndex = this.state.visibleEntries.findIndex(e => e.id === this.state.viewingEntryId);
        if (currentIndex === -1) currentIndex = 0;

        let nextIndex = (currentIndex + offset + this.state.visibleEntries.length) % this.state.visibleEntries.length;
        const nextEntry = this.state.visibleEntries[nextIndex];
        if (nextEntry) {
            this.openViewModal(nextEntry);
        }
    }

    handleZoom(delta) {
        if (!this.els.viewModal.classList.contains('visible')) return;
        const wrapper = this.els.viewModalContent.querySelector('.scale-wrapper');
        if (!wrapper) return;

        const targetZoom = this.currentZoom + delta;
        const result = this.renderer.scaleContent(this.els.viewModalContent, wrapper, targetZoom, {
            minScale: this.minZoomLimit || 0.1
        });
        this.currentZoom = result.scale;
    }

    openModal(entry) {
        this.els.modal.classList.add('visible');
        if (entry) {
            this.state.editingEntryId = entry.id; this.state.isNew = false;
            this.els.modalTitle.value = entry.title; this.els.modalRaw.value = entry.raw;
            this.renderer.render(entry.raw, this.els.modalPreview);
        } else {
            this.state.editingEntryId = null; this.state.isNew = true;
            this.els.modalTitle.value = ''; this.els.modalRaw.value = '';
            this.els.modalPreview.innerHTML = 'Preview...';
        }
    }

    closeModal() { this.els.modal.classList.remove('visible'); }

    showMoveMenu(btn, entry) {
        // Remove existing menu if any
        const existing = document.querySelector('.move-menu');
        if (existing) existing.remove();

        const units = this.library.getUnits().filter(u => u.id !== this.state.currentUnitId);
        if (units.length === 0) {
            alert("No other units to move to.");
            return;
        }

        const menu = document.createElement('div');
        menu.className = 'move-menu';
        menu.style.position = 'absolute';
        menu.style.zIndex = '1000';

        // Position logic
        const rect = btn.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;

        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

        units.forEach(u => {
            const li = document.createElement('li');
            li.style.padding = '8px 12px';
            li.style.cursor = 'pointer';
            li.style.borderBottom = '1px solid #eee';
            li.style.fontSize = '0.9rem';
            li.innerText = u.name;
            li.onmouseover = () => li.style.background = '#f5f7fa';
            li.onmouseout = () => li.style.background = 'transparent';

            li.onclick = (e) => {
                e.stopPropagation();
                if (this.library.moveEntryToUnit(entry.id, this.state.currentUnitId, u.id)) {
                    this.renderMainContent();
                    this.renderSidebar();
                }
                menu.remove();
            };
            list.append(li);
        });

        menu.append(list);
        document.body.append(menu);

        // Click outside to close
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== btn) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    saveEntry() {
        const title = this.els.modalTitle.value;
        const raw = this.els.modalRaw.value;
        if (!title || !raw) return;
        if (this.state.isNew) this.library.addEntry(this.state.currentUnitId, title, raw, false);
        else this.library.updateEntry(this.state.currentUnitId, this.state.editingEntryId, { title, raw, isTikZ: false });
        this.closeModal(); this.renderMainContent(); this.renderSidebar();
    }

    async renderPdfContent(filterText = '') {
        this.els.mainContent.innerHTML = '';
        let pdfs = [];
        try {
            pdfs = await this.pdfStore.getAllPdfs();
        } catch (e) {
            this.els.mainContent.innerHTML = '<div class="empty-state">Failed to load PDFs.</div>';
            return;
        }

        if (filterText) {
            const lower = filterText.toLowerCase();
            pdfs = pdfs.filter(p => p.name.toLowerCase().includes(lower));
        }

        if (pdfs.length === 0) {
            this.els.mainContent.innerHTML = '<div class="empty-state">No PDFs uploaded yet. Click "Upload PDF" to add one.</div>';
            return;
        }

        pdfs.forEach(pdf => {
            const card = document.createElement('div');
            card.className = 'pdf-card';
            card.dataset.id = pdf.id;

            const sizeMB = (pdf.size / (1024 * 1024)).toFixed(1);
            const dateStr = new Date(pdf.dateAdded).toLocaleDateString();

            card.innerHTML = `
                <div class="pdf-card-icon">
                    <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve" style="height: 60px; width: auto;" fill="#000000">
                    <g id="SVGRepo_bgCarrier" stroke-width="0"/>
                    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"/>
                    <g id="SVGRepo_iconCarrier"> <path style="fill:#B3404A;" d="M437.456,512H21.212c-8.166,0-14.786-6.621-14.786-14.786V256.915c0-8.165,6.62-14.786,14.786-14.786 s14.786,6.621,14.786,14.786v225.512h386.671v-32.939c0-8.165,6.62-14.786,14.786-14.786s14.786,6.621,14.786,14.786v47.725 C452.242,505.379,445.622,512,437.456,512z"/> <g> <polygon style="fill:#ffffff;" points="21.212,177.092 21.212,172.3 176.068,14.786 176.068,177.092 "/> <rect x="196.524" y="219.426" style="fill:#ffffff;" width="294.274" height="163.712"/> </g> <g> <path style="fill:#B3404A;" d="M490.791,204.634h-38.549V14.786c0-8.165-6.62-14.786-14.786-14.786H176.068 c-0.067,0-0.132,0.009-0.198,0.01c-0.359,0.004-0.717,0.022-1.075,0.053c-0.12,0.01-0.241,0.021-0.361,0.034 c-0.41,0.046-0.816,0.105-1.22,0.185c-0.031,0.006-0.061,0.009-0.092,0.015c-0.432,0.089-0.858,0.2-1.28,0.325 c-0.111,0.033-0.22,0.071-0.33,0.106c-0.322,0.105-0.642,0.22-0.958,0.347c-0.108,0.044-0.217,0.086-0.324,0.132 c-0.807,0.346-1.585,0.766-2.326,1.257c-0.102,0.067-0.2,0.139-0.3,0.207c-0.274,0.191-0.541,0.392-0.803,0.603 c-0.099,0.08-0.198,0.157-0.294,0.24c-0.339,0.287-0.67,0.586-0.985,0.906L10.668,161.935c-0.346,0.352-0.671,0.719-0.977,1.1 c-0.182,0.226-0.342,0.463-0.509,0.696c-0.112,0.157-0.234,0.309-0.34,0.47c-0.194,0.294-0.364,0.599-0.534,0.903 c-0.062,0.112-0.133,0.219-0.192,0.333c-0.166,0.315-0.308,0.639-0.449,0.963c-0.05,0.114-0.108,0.225-0.155,0.34 c-0.126,0.312-0.231,0.628-0.336,0.946c-0.04,0.139-0.099,0.274-0.14,0.413c-0.087,0.294-0.152,0.591-0.22,0.889 c-0.04,0.172-0.087,0.34-0.121,0.515c-0.053,0.274-0.084,0.55-0.121,0.825c-0.027,0.201-0.062,0.399-0.081,0.6 c-0.025,0.268-0.03,0.535-0.04,0.801c-0.007,0.191-0.028,0.38-0.028,0.571v4.792c0,8.165,6.62,14.786,14.786,14.786h154.855 c8.166,0,14.786-6.621,14.786-14.786V29.572h231.816v175.062H196.518c-8.166,0-14.786,6.621-14.786,14.786v163.705 c0,8.165,6.62,14.786,14.786,14.786h294.272c8.166,0,14.786-6.621,14.786-14.786V219.421 C505.577,211.256,498.957,204.634,490.791,204.634z M51.772,162.308l47.938-48.76l61.571-62.63v111.39L51.772,162.308 L51.772,162.308z M476.005,368.339h-264.7V234.207h264.7V368.339z"/> <path style="fill:#B3404A;" d="M246.08,260.736c0-3.2,2.925-6.015,7.375-6.015h26.322c16.785,0,30.008,7.934,30.008,29.433v0.64 c0,21.499-13.733,29.689-31.28,29.689h-12.589v27.641c0,4.096-4.959,6.142-9.919,6.142s-9.919-2.048-9.919-6.142L246.08,260.736 L246.08,260.736z M265.916,272.124v27.002h12.589c7.121,0,11.444-4.096,11.444-12.797v-1.406c0-8.703-4.323-12.797-11.444-12.797 h-12.589V272.124z"/> <path style="fill:#B3404A;" d="M349.586,254.721c17.548,0,31.282,8.19,31.282,30.202v33.145c0,22.011-13.733,30.201-31.282,30.201 h-22.507c-5.214,0-8.647-2.815-8.647-6.014v-81.518c0-3.2,3.433-6.015,8.647-6.015h22.507V254.721z M338.269,272.124v58.739h11.317 c7.121,0,11.444-4.096,11.444-12.796v-33.145c0-8.703-4.323-12.797-11.444-12.797h-11.317V272.124z"/> <path style="fill:#B3404A;" d="M393.458,260.863c0-4.096,4.323-6.142,8.647-6.142h44.125c4.196,0,5.977,4.479,5.977,8.574 c0,4.735-2.162,8.83-5.977,8.83h-32.935v21.628h19.201c3.815,0,5.977,3.711,5.977,7.806c0,3.456-1.78,7.55-5.977,7.55h-19.201 v33.016c0,4.096-4.959,6.142-9.919,6.142c-4.959,0-9.919-2.048-9.919-6.142V260.863z"/> </g> </g>
                    </svg>
                </div>
                <div class="pdf-card-info">
                    <h3 title="${pdf.name}">${pdf.name}</h3>
                    <p>${sizeMB} MB · ${dateStr}</p>
                </div>
                <div class="pdf-card-actions">
                    <button class="pdf-view-btn">View</button>
                    <button class="pdf-rename-btn">Rename</button>
                    <button class="pdf-delete-btn btn-danger">Delete</button>
                </div>
            `;

            card.querySelector('.pdf-view-btn').onclick = (e) => {
                e.stopPropagation();
                this.openPdfViewer(pdf.id, pdf.name);
            };

            card.querySelector('.pdf-rename-btn').onclick = async (e) => {
                e.stopPropagation();
                const newName = prompt('Rename PDF:', pdf.name);
                if (newName && newName.trim() && newName.trim() !== pdf.name) {
                    await this.pdfStore.renamePdf(pdf.id, newName.trim());
                    this.renderMainContent();
                    this.renderSidebar();
                }
            };

            card.querySelector('.pdf-delete-btn').onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${pdf.name}"?`)) {
                    await this.pdfStore.deletePdf(pdf.id);
                    this.renderMainContent();
                    this.renderSidebar();
                }
            };

            card.addEventListener('click', () => {
                this.openPdfViewer(pdf.id, pdf.name);
            });

            this.els.mainContent.append(card);
        });
    }

    async openPdfViewer(id, name) {
        let blob;
        try {
            blob = await this.pdfStore.getPdfBlob(id);
        } catch (err) {
            console.error('Failed to load PDF:', err);
            alert('Failed to load PDF. It may have been removed or corrupted.');
            return;
        }
        if (!blob) {
            alert('PDF not found.');
            return;
        }
        if (this.currentPdfBlobUrl) {
            URL.revokeObjectURL(this.currentPdfBlobUrl);
        }
        this.currentPdfBlobUrl = URL.createObjectURL(blob);
        this.els.pdfViewerTitle.innerText = name;
        this.els.pdfViewerIframe.src = this.currentPdfBlobUrl;
        this.els.pdfViewerModal.classList.add('visible');
    }

    toggleSidebar() {
        const container = document.querySelector('.glass-container');
        container.classList.toggle('sidebar-collapsed');
        const isCollapsed = container.classList.contains('sidebar-collapsed');
        if (this.els.btnFullscreen) {
            this.els.btnFullscreen.innerHTML = isCollapsed ? '&#9776;' : '&times;';
            this.els.btnFullscreen.title = isCollapsed ? 'Show Sidebar' : 'Hide Sidebar';
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
