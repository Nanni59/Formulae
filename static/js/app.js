// app.js
// UI Orchestrator
// TikZ functionality removed

class App {
    constructor() {
        this.library = new window.FormulaLibrary();
        this.renderer = new window.Renderer();

        this.state = {
            currentUnitId: this.library.getUnits()[0]?.id,
            editingEntryId: null, // null = View Mode, ID = Edit Mode
            viewingEntryId: null, // For view modal
            isNew: false
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
            // modalType removed

            // View Modal
            viewModal: document.getElementById('view-modal'),
            viewModalTitle: document.getElementById('view-modal-title'),
            viewModalContent: document.getElementById('view-modal-content'),
            viewModalEditBtn: document.getElementById('btn-edit-view'),
            viewModalCloseBtn: document.getElementById('btn-close-view'),

            exportBtn: document.getElementById('btn-export'),
            importInput: document.getElementById('file-import')
        };

        this.init();
    }

    init() {
        this.renderSidebar();
        this.renderMainContent();
        this.attachListeners();
    }

    attachListeners() {
        // Search
        this.els.searchBar.addEventListener('input', (e) => {
            this.renderMainContent(e.target.value);
        });

        // Add Entry
        this.els.addEntryBtn.addEventListener('click', () => {
            this.openModal(null); // New Entry
        });

        // Add Unit
        this.els.addUnitBtn.addEventListener('click', () => {
            const name = prompt("Enter name for new Unit:");
            if (name && name.trim()) {
                const newUnit = this.library.createUnit(name.trim());
                this.state.currentUnitId = newUnit.id;
                this.renderSidebar();
                this.renderMainContent();
            }
        });

        // Edit Modal Controls
        this.els.modalCancel.addEventListener('click', () => this.closeModal());
        this.els.modalSave.addEventListener('click', () => this.saveEntry());

        // Live Preview in Edit Modal (Simplified for LaTeX only)
        this.els.modalRaw.addEventListener('input', (e) => {
            this.renderer.render(e.target.value, this.els.modalPreview);
        });

        // View Modal Controls
        this.els.viewModalCloseBtn.addEventListener('click', () => {
            this.els.viewModal.classList.remove('visible');
        });

        this.els.viewModalEditBtn.addEventListener('click', () => {
            this.els.viewModal.classList.remove('visible');
            // Find entry
            const unit = this.library.getUnit(this.state.currentUnitId);
            const entry = unit.entries.find(e => e.id === this.state.viewingEntryId);
            if (entry) this.openModal(entry);
        });

        // Sidebar selection
        this.els.sidebarList.addEventListener('click', (e) => {
            const unitId = e.target.closest('li')?.dataset.id;
            if (unitId) {
                this.state.currentUnitId = unitId;
                this.renderSidebar();
                this.renderMainContent();
            }
        });

        // Export/Import
        this.els.exportBtn.addEventListener('click', () => {
            const json = this.library.exportToJSON();
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "formula_library_backup.json";
            a.click();
        });

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

    renderSidebar() {
        const units = this.library.getUnits();
        this.els.sidebarList.innerHTML = units.map(u => `
            <li class="${u.id === this.state.currentUnitId ? 'active' : ''}" data-id="${u.id}">
                ${u.name} <span style="float:right;opacity:0.5">${u.entries.length}</span>
            </li>
        `).join('');
    }

    renderMainContent(filterText = '') {
        const unit = this.library.getUnit(this.state.currentUnitId);
        if (!unit) {
            this.els.mainContent.innerHTML = '<div class="empty-state">Select a Unit</div>';
            return;
        }

        let entries = unit.entries;
        if (filterText) {
            const lower = filterText.toLowerCase();
            entries = entries.filter(e => e.title.toLowerCase().includes(lower) || e.tags.some(t => t.includes(lower)));
        }

        this.els.mainContent.innerHTML = '';

        if (entries.length === 0) {
            this.els.mainContent.innerHTML = '<div class="empty-state">No formulas found. Add one!</div>';
            return;
        }

        entries.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'entry-card';

            // Header
            const header = document.createElement('div');
            header.className = 'card-header';
            header.innerHTML = `<h3>${entry.title}</h3>`; // Removed isTikZ check

            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const copyBtn = document.createElement('button');
            copyBtn.innerText = 'Copy TeX';
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(entry.raw);
                copyBtn.innerText = 'Copied!';
                setTimeout(() => copyBtn.innerText = 'Copy TeX', 1000);
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

            actions.append(copyBtn, delBtn); // Edit removed from direct card action, moved to click
            header.append(actions);

            // Preview Area
            const preview = document.createElement('div');
            preview.className = 'card-preview';
            this.renderer.render(entry.raw, preview); // Pass only 2 args

            // Whole card click opens View Modal
            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    this.openViewModal(entry);
                }
            });

            card.append(header, preview);
            this.els.mainContent.append(card);
        });
    }

    openViewModal(entry) {
        this.state.viewingEntryId = entry.id;
        this.els.viewModalTitle.innerText = entry.title;
        this.els.viewModal.classList.add('visible');
        // Render in large view
        this.renderer.render(entry.raw, this.els.viewModalContent);
    }

    openModal(entry) { // entry is null for new
        this.els.modal.classList.add('visible');
        if (entry) {
            this.state.editingEntryId = entry.id;
            this.state.isNew = false;
            this.els.modalTitle.value = entry.title;
            this.els.modalRaw.value = entry.raw;
            this.renderer.render(entry.raw, this.els.modalPreview);
        } else {
            this.state.editingEntryId = null;
            this.state.isNew = true;
            this.els.modalTitle.value = '';
            this.els.modalRaw.value = '';
            this.els.modalPreview.innerHTML = 'Preview...';
        }
    }

    closeModal() {
        this.els.modal.classList.remove('visible');
    }

    saveEntry() {
        const title = this.els.modalTitle.value;
        const raw = this.els.modalRaw.value;

        if (!title || !raw) {
            alert("Please fill in title and content");
            return;
        }

        if (this.state.isNew) {
            this.library.addEntry(this.state.currentUnitId, title, raw, false); // isTikZ = false
        } else {
            this.library.updateEntry(this.state.currentUnitId, this.state.editingEntryId, {
                title, raw, isTikZ: false
            });
        }

        this.closeModal();
        this.renderMainContent();
        this.renderSidebar();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
