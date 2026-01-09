// app.js
// UI Orchestrator
// - Fixed Modal Type reference
// - Added 'General' tab support
// - Added Unit deletion support

class App {
    constructor() {
        this.library = new window.FormulaLibrary();
        this.renderer = new window.Renderer();

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
            importInput: document.getElementById('file-import')
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

        // Add Entry
        if (this.els.addEntryBtn) {
            this.els.addEntryBtn.addEventListener('click', () => {
                if (this.state.currentUnitId === 'general') {
                    alert("Please select a specific Unit to add an entry.");
                    return;
                }
                this.openModal(null); // New Entry
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

        this.els.sidebarList.addEventListener('dragstart', (e) => {
            const li = e.target.closest('li');
            if (!li || li.dataset.id === 'general') {
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
            if (!li || li.dataset.id === 'general' || li.dataset.id === draggedUnitId) return;
            li.classList.add('drag-over');
        });

        this.els.sidebarList.addEventListener('dragleave', (e) => {
            const li = e.target.closest('li');
            if (li) li.classList.remove('drag-over');
        });

        this.els.sidebarList.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetLi = e.target.closest('li');
            if (!targetLi || targetLi.dataset.id === 'general') return;

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

        // Main Content Drag and Drop (Card Reordering)
        let draggedCardId = null;

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

    renderSidebar() {
        const units = this.library.getUnits();
        const totalEntries = units.reduce((sum, u) => sum + u.entries.length, 0);

        let html = `
            <li class="${this.state.currentUnitId === 'general' ? 'active' : ''}" data-id="general">
                General <span style="float:right;opacity:0.5">${totalEntries}</span>
            </li>
            <div style="border-top:1px solid #ddd; margin: 10px 0;"></div>
        `;

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
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
