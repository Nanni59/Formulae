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
            currentUnitId: 'general',
            editingEntryId: null,
            viewingEntryId: null,
            isNew: false,
            visibleEntries: [],
            splitEntries: [],
            selectedEntryIds: new Set(),
            selectionMode: false
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
            modalType: document.getElementById('modal-type-input'),
            modalContainerLatex: document.getElementById('input-container-latex'),
            modalContainerDesmos: document.getElementById('input-container-desmos'),
            modalDesmos: document.getElementById('modal-desmos-input'),
            modalRaw: document.getElementById('modal-raw-input'),
            modalPreview: document.getElementById('modal-preview-area'),
            modalSave: document.getElementById('btn-save-entry'),
            modalCancel: document.getElementById('btn-cancel-entry'),

            // View Modal
            viewModal: document.getElementById('view-modal'),
            viewModalTitle: document.getElementById('view-modal-title'),
            viewModalContent: document.getElementById('view-modal-content'),
            btnLinkView: document.getElementById('btn-link-view'), // New
            viewModalEditBtn: document.getElementById('btn-edit-view'),
            viewModalCloseBtn: document.getElementById('btn-close-view'),
            btnZoomIn: document.getElementById('btn-zoom-in'),
            btnZoomOut: document.getElementById('btn-zoom-out'),

            exportBtn: document.getElementById('btn-export'),
            importInput: document.getElementById('file-import'),

            // Selection & Context
            contextMenu: document.getElementById('context-menu'),
            selectionBar: document.getElementById('selection-bar'),
            selectionCount: document.getElementById('selection-count'),
            btnBulkSplit: document.getElementById('btn-bulk-split'),
            btnBulkDelete: document.getElementById('btn-bulk-delete'),
            btnBulkCancel: document.getElementById('btn-bulk-cancel')
        };

        this.currentZoom = 1;

        this.init();
    }

    init() {
        console.log('🚀 App initializing...');
        this.renderSidebar();
        this.renderMainContent();
        this.attachListeners();
        this.initContextMenu();
        this.initSelectionBar();
        console.log('✅ App initialized successfully');
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
                if (this.els.modalType.value === 'latex') {
                    this.renderer.render(e.target.value, this.els.modalPreview, 'latex');
                }
            });
        }

        if (this.els.modalDesmos) {
            this.els.modalDesmos.addEventListener('input', (e) => {
                if (this.els.modalType.value === 'desmos') {
                    this.renderer.render(e.target.value, this.els.modalPreview, 'desmos');
                }
            });
        }

        if (this.els.modalType) {
            console.log('✅ Type selector found, attaching change listener');
            this.els.modalType.addEventListener('change', (e) => {
                const type = e.target.value;
                console.log('🔄 Type changed to:', type);
                if (type === 'latex') {
                    this.els.modalContainerLatex.classList.remove('hidden');
                    this.els.modalContainerDesmos.classList.add('hidden');
                    console.log('📝 Showing LaTeX input');
                    this.renderer.render(this.els.modalRaw.value, this.els.modalPreview, 'latex');
                } else {
                    this.els.modalContainerLatex.classList.add('hidden');
                    this.els.modalContainerDesmos.classList.remove('hidden');
                    console.log('📊 Showing Desmos input');
                    this.renderer.render(this.els.modalDesmos.value, this.els.modalPreview, 'desmos');
                }
            });
        } else {
            console.error('❌ Type selector not found!');
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
            const unit = this.library.getUnit(this.state.currentUnitId);
            const sourceEntry = unit.entries.find(e => e.id === draggedCardId);
            const targetEntry = unit.entries.find(e => e.id === targetId);

            if (!sourceEntry || !targetEntry) return;

            // Combine in Split View if Shift is held
            if (e.shiftKey && draggedCardId !== targetId) {
                this.openSplitView([targetEntry, sourceEntry]);
                return;
            }

            if (draggedCardId !== targetId) {
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

            // Context Menu Listener
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                // Select just this card for context actions
                if (!this.state.selectionMode) {
                    this.handleContextAction('select', entry.id); // Or trigger menu display
                    // We want to show the graphical menu
                    this.showContextMenu(e, entry.id);
                } else {
                    // In selection mode, toggle selection
                    this.toggleSelection(entry.id);
                }
            });

            if (this.state.currentUnitId !== 'general') actions.append(delBtn);
            if (this.library.getUnits().length > 1) actions.append(moveBtn);
            if (entry.type !== 'desmos') actions.prepend(copyBtn); // Hide Copy LaTeX for Desmos
            header.append(actions);

            const preview = document.createElement('div');
            preview.className = 'card-preview';

            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    if (this.state.selectionMode) {
                        this.toggleSelection(entry.id);
                    } else {
                        this.openViewModal(entry);
                    }
                }
            });

            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.openContextMenu(e, entry.id);
            });

            if (this.state.selectedEntryIds.has(entry.id)) {
                card.classList.add('selected');
            }

            card.append(header, preview);
            this.els.mainContent.append(card);

            // Render and then auto-scale preview
            this.renderer.render(entry.raw, preview, entry.type, entry.desmosId).then(() => {
                if (entry.type === 'desmos') return;
                const wrapper = preview.querySelector('.scale-wrapper');
                if (wrapper) {
                    this.renderer.scaleContent(preview, wrapper, null, { isPreview: true });
                }
            });
        });
    }

    openViewModal(entry, ignoreLinks = false) {
        if (!entry) return;

        this.els.viewModalContent.innerHTML = '';
        this.state.viewingEntryId = entry.id;

        // Handle Group/Composite Entry
        if (entry.type === 'group' && entry.children) {
            this.state.splitEntries = [entry]; // We are viewing this single group entry
            this.renderSplitView();
            return;
        }

        // Check for Legacy Links (Backward Compatibility)
        // ... (We can remove legacy link check if we want, but keeping it safe)
        if (!ignoreLinks && entry.linkedWith) {
            const unit = this.library.getUnit(this.state.currentUnitId);
            let linkedEntry = null;
            if (unit) {
                linkedEntry = unit.entries.find(e => e.id === entry.linkedWith);
            } else if (this.state.currentUnitId === 'general') {
                linkedEntry = this.library.getAllEntries().find(e => e.id === entry.linkedWith);
            }

            if (linkedEntry) {
                this.openSplitView([entry, linkedEntry]);
                return;
            }
        }

        // Normal Single Entry View
        this.state.viewingEntryId = entry.id;
        this.els.viewModalTitle.innerText = entry.title;
        this.els.viewModal.classList.add('visible');

        if (this.els.btnLinkView) this.els.btnLinkView.style.display = 'none';

        this.renderer.render(entry.raw, this.els.viewModalContent, entry.type, entry.desmosId).then(() => {
            if (entry.type === 'desmos') return;
            const wrapper = this.els.viewModalContent.querySelector('.scale-wrapper');
            if (wrapper) {
                const performScale = () => {
                    const result = this.renderer.scaleContent(this.els.viewModalContent, wrapper, null, {
                        padding: 80
                    });
                    this.currentZoom = result.scale;
                };
                requestAnimationFrame(() => { performScale(); setTimeout(performScale, 50); });
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
        const wrappers = this.els.viewModalContent.querySelectorAll('.scale-wrapper');
        if (wrappers.length === 0) return;

        const targetZoom = this.currentZoom + delta;
        let lastResult = { scale: targetZoom }; // Default

        wrappers.forEach(wrapper => {
            lastResult = this.renderer.scaleContent(wrapper.parentElement, wrapper, targetZoom, {
                minScale: this.minZoomLimit || 0.1
            });
        });
        this.currentZoom = lastResult.scale;
    }

    openModal(entry) {
        this.els.modal.classList.add('visible');

        let type = 'latex';
        let raw = '';
        let desmosId = '';
        let title = '';

        if (entry) {
            this.state.editingEntryId = entry.id;
            this.state.isNew = false;
            title = entry.title;
            type = entry.type || 'latex';
            raw = entry.raw || '';
            desmosId = entry.desmosId || '';
        } else {
            this.state.editingEntryId = null;
            this.state.isNew = true;
        }

        this.els.modalTitle.value = title;
        this.els.modalType.value = type;
        this.els.modalRaw.value = raw;
        if (this.els.modalDesmos) this.els.modalDesmos.value = desmosId;

        // Force correct initial visibility
        if (type === 'desmos') {
            this.els.modalContainerLatex.classList.add('hidden');
            this.els.modalContainerDesmos.classList.remove('hidden');
        } else {
            this.els.modalContainerLatex.classList.remove('hidden');
            this.els.modalContainerDesmos.classList.add('hidden');
        }

        this.renderer.render(type === 'latex' ? raw : desmosId, this.els.modalPreview, type, desmosId);
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
        const type = this.els.modalType.value;
        const raw = this.els.modalRaw.value;
        const desmosId = this.els.modalDesmos.value;

        let contentValid = false;
        if (type === 'latex' && raw) contentValid = true;
        if (type === 'desmos' && desmosId) contentValid = true;

        if (!title || !contentValid) return;

        const entryData = {
            title,
            type,
            raw: type === 'latex' ? raw : '',
            desmosId: type === 'desmos' ? desmosId : null,
        };

        if (this.state.isNew) this.library.addEntry(this.state.currentUnitId, title, entryData.raw, entryData.desmosId, false);
        else this.library.updateEntry(this.state.currentUnitId, this.state.editingEntryId, { ...entryData, isTikZ: false });

        // Ensure type strictness in Library if needed, but updateEntry with object covers it.
        // We need to ensure the stored type is correct. updateEntry handles it if we pass it? 
        // library.js updateEntry merges props. So we must explicitly pass type.
        this.library.updateEntry(this.state.currentUnitId, this.state.editingEntryId, { type });

        this.closeModal(); this.renderMainContent(); this.renderSidebar();
    }

    openSplitView(entries) {
        // Sort: Desmos first (if present), then others
        entries.sort((a, b) => {
            if (a.type === 'desmos' && b.type !== 'desmos') return -1;
            if (a.type !== 'desmos' && b.type === 'desmos') return 1;
            return 0;
        });

        this.state.splitEntries = [...entries];
        this.renderSplitView();
    }

    renderSplitView() {
        const entries = this.state.splitEntries;
        renderSplitView() {
            let entries = this.state.splitEntries;

            // Unpack Group for Display Purposes
            // If we are viewing a single group, we want to render its children as panes
            const viewingGroup = entries.length === 1 && entries[0].type === 'group';
            if (viewingGroup) {
                entries = entries[0].children;
            }

            if (entries.length === 0) {
                this.els.viewModal.classList.remove('visible');
                return;
            }

            // If we really just have one normal entry (and not viewing a group), switch to normal view
            if (entries.length === 1 && !viewingGroup) {
                this.openViewModal(entries[0]);
                return;
            }

            this.state.viewingEntryId = entries[0].id;
            this.els.viewModalTitle.innerText = "Split View";
            this.els.viewModal.classList.add('visible');

            if (this.els.btnLinkView) {
                this.els.btnLinkView.style.display = 'inline-block';

                // Check if we are viewing a group
                const isGroup = entries.length === 1 && entries[0].type === 'group';

                this.els.btnLinkView.innerText = isGroup ? '❌ Unlink' : '🔗 Link Cards';
                this.els.btnLinkView.title = isGroup ? "Unmerge Cards" : "Merge into Composite Card";
                this.els.btnLinkView.onclick = () => this.toggleConjoined();
            }

            this.els.viewModalContent.innerHTML = '';
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'row'; // Horizontal Split
            container.style.height = '100%';
            container.style.width = '100%';
            this.els.viewModalContent.appendChild(container);

            entries.forEach((entry, index) => {
                const paneItem = document.createElement('div');
                paneItem.className = 'split-pane-item';
                // Add border-right to all but last
                if (index < entries.length - 1) {
                    paneItem.style.borderRight = '2px solid #eee';
                    paneItem.style.borderBottom = 'none';
                }

                // Header
                const header = document.createElement('div');
                header.className = 'split-pane-header';
                header.innerHTML = `<span>${entry.title}</span>`;

                const btnRemove = document.createElement('button');
                btnRemove.className = 'btn-remove-pane';
                btnRemove.innerHTML = '&times;';
                btnRemove.title = "Remove from Split View";
                btnRemove.onclick = (e) => {
                    e.stopPropagation();
                    this.removeSplitEntry(entry.id);
                };
                header.appendChild(btnRemove);
                paneItem.appendChild(header);

                // Content
                const contentPane = document.createElement('div');
                contentPane.className = 'split-pane-content';
                paneItem.appendChild(contentPane);
                container.appendChild(paneItem);

                // Render logic
                this.renderer.render(entry.raw, contentPane, entry.type, entry.desmosId).then(() => {
                    if (entry.type === 'desmos') {
                        const dContainer = contentPane.querySelector('div');
                        if (dContainer) dContainer.style.height = '100%';
                        return;
                    }
                    const wrapper = contentPane.querySelector('.scale-wrapper');
                    if (wrapper) {
                        // Add slight padding compensation for header
                        const performScale = () => {
                            this.renderer.scaleContent(contentPane, wrapper, null, { padding: 40 });
                        };
                        requestAnimationFrame(() => { performScale(); setTimeout(performScale, 50); });
                    }
                });
            });
        }

        removeSplitEntry(entryId) {
            this.state.splitEntries = this.state.splitEntries.filter(e => e.id !== entryId);
            this.renderSplitView();
        }

        // --- Context Menu & Selection Logic ---

        initContextMenu() {
            if (!this.els.contextMenu) return;

            // Hide on global click
            document.addEventListener('click', () => {
                this.els.contextMenu.style.display = 'none';
            });

            // Menu Actions
            this.els.contextMenu.querySelectorAll('li').forEach(item => {
                item.addEventListener('click', (e) => {
                    const action = e.target.dataset.action;
                    const targetId = this.state.contextEntryId;
                    this.handleContextAction(action, targetId);
                });
            });
        }

        initSelectionBar() {
            if (!this.els.selectionBar) return;

            this.els.btnBulkCancel.onclick = () => this.clearSelection();

            this.els.btnBulkDelete.onclick = () => {
                if (confirm(`Delete ${this.state.selectedEntryIds.size} cards?`)) {
                    this.deleteMultipleEntries();
                }
            };

            this.els.btnBulkSplit.onclick = () => {
                // Only allow 2 items for split view
                if (this.state.selectedEntryIds.size !== 2) {
                    alert("Please select exactly 2 cards for Split View.");
                    return;
                }
                const ids = Array.from(this.state.selectedEntryIds);
                const unit = this.library.getUnit(this.state.currentUnitId) ||
                    (this.state.currentUnitId === 'general' ? { entries: this.library.getAllEntries() } : null);

                if (!unit) return;

                const ent1 = unit.entries.find(e => e.id === ids[0]);
                const ent2 = unit.entries.find(e => e.id === ids[1]);

                if (ent1 && ent2) {
                    this.openSplitView([ent1, ent2]);
                    this.clearSelection();
                }
            };
        }

        openContextMenu(e, entryId) {
            this.state.contextEntryId = entryId;
            const menu = this.els.contextMenu;
            menu.style.display = 'block';
            menu.style.left = `${e.pageX}px`;
            menu.style.top = `${e.pageY}px`;
        }

        handleContextAction(action, id) {
            if (action === 'select') {
                this.toggleSelection(id);
            } else if (action === 'delete') {
                if (confirm("Delete this entry?")) {
                    this.library.deleteEntry(this.state.currentUnitId, id);
                    this.renderMainContent();
                }
            }
        }

        toggleSelection(id) {
            const set = this.state.selectedEntryIds;
            if (set.has(id)) set.delete(id);
            else set.add(id);

            this.state.selectionMode = set.size > 0;
            this.updateSelectionUI();
            this.renderMainContent(); // Re-render to show selection state (checkbox/border)
        }

        clearSelection() {
            this.state.selectedEntryIds.clear();
            this.state.selectionMode = false;
            this.updateSelectionUI();
            this.renderMainContent();
        }

        updateSelectionUI() {
            const count = this.state.selectedEntryIds.size;
            this.els.selectionCount.innerText = `${count} Selected`;

            if (count > 0) {
                this.els.selectionBar.classList.add('visible');
                // Check button state (Split View valid only for 2)
                this.els.btnBulkSplit.disabled = (count !== 2);
                this.els.btnBulkSplit.style.opacity = (count !== 2) ? 0.5 : 1;
            } else {
                this.els.selectionBar.classList.remove('visible');
            }
        }

        deleteMultipleEntries() {
            const unitId = this.state.currentUnitId;
            this.state.selectedEntryIds.forEach(id => {
                this.library.deleteEntry(unitId, id);
            });
            this.clearSelection();
        }

        toggleConjoined() {
            const entries = this.state.splitEntries;
            // Case 1: We are in Split View of 2 separate entries -> Merge them
            if (entries.length === 2 && entries[0].type !== 'group' && entries[1].type !== 'group') {
                const uId = this.state.currentUnitId;
                // Create Composite Entry
                const compositeTitle = `${entries[0].title} & ${entries[1].title}`;

                // We need full data of both
                const newEntry = {
                    title: compositeTitle,
                    type: 'group',
                    children: [entries[0], entries[1]]
                };

                // Add to library
                this.library.addEntry(uId, newEntry.title, null, null, false);

                // Get the ID of the new entry (it's the last one added)
                const units = this.library.getUnits();
                const unit = this.state.currentUnitId === 'general' ? units[0] : units.find(u => u.id === uId);
                const addedEntry = unit.entries[unit.entries.length - 1];

                // Update the added entry to fully match our structure (library.addEntry is simple)
                this.library.updateEntry(unit.id, addedEntry.id, {
                    type: 'group',
                    children: [entries[0], entries[1]],
                    raw: '',
                    desmosId: ''
                });

                // Delete original individual entries
                // Find their units first (if in general view)
                const findUnitId = (id) => {
                    if (this.state.currentUnitId !== 'general') return this.state.currentUnitId;
                    return this.library.getUnits().find(u => u.entries.find(e => e.id === id))?.id;
                };

                if (entries[0].id) this.library.deleteEntry(findUnitId(entries[0].id), entries[0].id);
                if (entries[1].id) this.library.deleteEntry(findUnitId(entries[1].id), entries[1].id);

                // Close modal and refresh to show new single card
                this.closeModal();
                this.renderMainContent();
                this.renderSidebar();

                // Re-open in view modal as the new composite entry
                setTimeout(() => this.openViewModal(addedEntry), 100);
                return;
            }

            // Case 2: We are viewing a Composite/Group Entry -> Unmerge (Split) them
            if (entries.length === 1 && entries[0].type === 'group') {
                const groupEntry = entries[0];
                const children = groupEntry.children;
                const uId = this.state.currentUnitId; // Restore to current unit for simplicity

                // Restore Child 1
                this.library.addEntry(uId, children[0].title, children[0].raw, children[0].desmosId, false);
                const unit = this.library.getUnit(uId);
                const child1 = unit.entries[unit.entries.length - 1];
                this.library.updateEntry(uId, child1.id, { type: children[0].type }); // Ensure type is correct

                // Restore Child 2
                this.library.addEntry(uId, children[1].title, children[1].raw, children[1].desmosId, false);
                const child2 = unit.entries[unit.entries.length - 1];
                this.library.updateEntry(uId, child2.id, { type: children[1].type });

                // Delete Group Entry
                this.library.deleteEntry(uId, groupEntry.id);

                this.closeModal();
                this.renderMainContent();
                this.renderSidebar();
            }
        }
    }


window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
