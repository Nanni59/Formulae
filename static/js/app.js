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
            visibleEntries: [], // Track currently filtered entries for navigation
            expandedCourses: new Set(JSON.parse(localStorage.getItem('expandedCourses')) || [])
        };

        // DOM Elements
        this.els = {
            sidebarList: document.getElementById('unit-list'),
            mainContent: document.getElementById('main-content'),
            searchBar: document.getElementById('search-input'),
            addEntryBtn: document.getElementById('btn-add-entry'),
            addUnitBtn: document.getElementById('btn-add-unit'),
            addCourseBtn: document.getElementById('btn-add-course'),

            // Edit Modal
            modal: document.getElementById('entry-modal'),
            modalTitle: document.getElementById('modal-title-input'),
            modalRaw: document.getElementById('modal-raw-input'),
            modalPreview: document.getElementById('modal-preview-area'),
            modalSave: document.getElementById('btn-save-entry'),
            modalCancel: document.getElementById('btn-cancel-entry'),

            // AI Generate Modal
            aiBtn: document.getElementById('btn-ai-generate'),
            aiModal: document.getElementById('ai-modal'),
            btnCloseAi: document.getElementById('btn-close-ai'),
            aiKeyInput: document.getElementById('ai-key-input'),
            aiKeyInputRow: document.getElementById('ai-key-input-row'),
            aiKeySavedRow: document.getElementById('ai-key-saved-row'),
            btnSaveKey: document.getElementById('btn-save-key'),
            btnClearKey: document.getElementById('btn-clear-key'),
            aiModelSelect: document.getElementById('ai-model-select'),
            aiYoutubeInput: document.getElementById('ai-youtube-input'),
            aiNotesInput: document.getElementById('ai-notes-input'),
            aiDropzone: document.getElementById('ai-dropzone'),
            aiFileInput: document.getElementById('ai-file-input'),
            aiFileList: document.getElementById('ai-file-list'),
            aiError: document.getElementById('ai-error'),
            btnAiRun: document.getElementById('btn-ai-run'),
            aiRunSpinner: document.getElementById('ai-run-spinner'),
            aiRunLabel: document.getElementById('ai-run-label'),

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

    _escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    showCustomModal(options) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('customModalOverlay');
            const dialog = overlay ? overlay.querySelector('.link-modal') : null;
            const titleEl = document.getElementById('customModalTitle');
            const msgEl = document.getElementById('customModalMessage');
            const inputTxt = document.getElementById('customModalInputText');
            const inputSel = document.getElementById('customModalInputSelect');
            const btnCancel = document.getElementById('customModalCancel');
            const btnSave = document.getElementById('customModalSave');

            if (!overlay || !dialog) {
                console.error("Custom Modal HTML not found.");
                resolve(null);
                return;
            }

            const previousFocus = document.activeElement;

            titleEl.textContent = options.title || 'Prompt';
            msgEl.textContent = options.message || '';
            
            // The native select is hidden by the themed-dropdown overlay (_ftDD);
            // toggle the overlay's visibility, not the select's.
            const setSelVisible = (visible) => {
                if (inputSel._ftDD) {
                    inputSel._ftDD.style.display = visible ? 'block' : 'none';
                    if (visible) inputSel._ftDD.classList.remove('open');
                } else {
                    inputSel.style.display = visible ? 'block' : 'none';
                }
            };

            inputTxt.style.display = 'none';
            setSelVisible(false);

            let firstFocusable = btnCancel;

            if (options.type === 'text') {
                inputTxt.style.display = 'block';
                inputTxt.value = options.initialValue || '';
                firstFocusable = inputTxt;
            } else if (options.type === 'select') {
                inputSel.innerHTML = '';
                (options.selectOptions || []).forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.textContent = opt.label;
                    inputSel.appendChild(o);
                });
                setSelVisible(true);
                firstFocusable = inputSel._ftDD ? inputSel._ftDD.querySelector('.ft-dd-head') : inputSel;
            }

            const getFocusableElements = () => {
                return Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                    .filter(el => el.style.display !== 'none' && !el.disabled
                        && !el.classList.contains('ft-dd-opt')
                        && !(el.closest('.ft-dd') && el.closest('.ft-dd').style.display === 'none'));
            };

            const handleTrap = (e) => {
                if (e.key === 'Tab') {
                    const focusable = getFocusableElements();
                    if (focusable.length === 0) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];

                    if (e.shiftKey && document.activeElement === first) {
                        last.focus();
                        e.preventDefault();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        first.focus();
                        e.preventDefault();
                    }
                }
            };

            const handleCancel = () => {
                cleanup();
                resolve(options.type === 'confirm' ? false : null);
            };

            const handleSave = () => {
                cleanup();
                if (options.type === 'confirm') resolve(true);
                else if (options.type === 'text') resolve(inputTxt.value);
                else if (options.type === 'select') resolve(inputSel.value);
                else resolve(null);
            };

            const handleKeydown = (e) => {
                if (e.key === 'Enter' && options.type !== 'confirm') {
                    e.preventDefault();
                    handleSave();
                } else if (e.key === 'Escape') {
                    handleCancel();
                } else {
                    handleTrap(e);
                }
            };

            const cleanup = () => {
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                btnCancel.removeEventListener('click', handleCancel);
                btnSave.removeEventListener('click', handleSave);
                dialog.removeEventListener('keydown', handleKeydown);
                if (previousFocus) {
                    previousFocus.focus();
                }
            };

            btnCancel.addEventListener('click', handleCancel);
            btnSave.addEventListener('click', handleSave);
            dialog.addEventListener('keydown', handleKeydown);

            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            setTimeout(() => firstFocusable.focus(), 50);
        });
    }

    toggleCourse(courseId) {
        if (this.state.expandedCourses.has(courseId)) {
            this.state.expandedCourses.delete(courseId);
        } else {
            this.state.expandedCourses.add(courseId);
        }
        localStorage.setItem('expandedCourses', JSON.stringify(Array.from(this.state.expandedCourses)));
        this.renderSidebar();
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
                if (this.state.currentUnitId === 'desmos') {
                    this.addDesmosGraph();
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

        // PDF/Desmos Viewer Modal Close
        if (this.els.btnClosePdfViewer) {
            this.els.btnClosePdfViewer.addEventListener('click', () => {
                if (this.currentPdfBlobUrl) {
                    URL.revokeObjectURL(this.currentPdfBlobUrl);
                    this.currentPdfBlobUrl = null;
                }
                // Replace iframe to avoid beforeunload dialogs from embedded pages (e.g. Desmos)
                const parent = this.els.pdfViewerIframe.parentNode;
                const newIframe = document.createElement('iframe');
                newIframe.id = 'pdf-viewer-iframe';
                newIframe.style.cssText = 'width:100%; height:100%; border:none;';
                parent.replaceChild(newIframe, this.els.pdfViewerIframe);
                this.els.pdfViewerIframe = newIframe;
                this.els.pdfViewerModal.classList.remove('visible');
                // Clear viewer navigation state
                this.viewerItems = null;
                this.viewerIndex = -1;
                this.viewerType = null;
            });
        }

        // Arrow key navigation in viewer modal
        document.addEventListener('keydown', (e) => {
            if (!this.els.pdfViewerModal.classList.contains('visible')) return;
            if (!this.viewerItems || this.viewerItems.length <= 1) return;

            let newIndex = this.viewerIndex;
            if (e.key === 'ArrowRight') {
                newIndex = (this.viewerIndex + 1) % this.viewerItems.length;
            } else if (e.key === 'ArrowLeft') {
                newIndex = (this.viewerIndex - 1 + this.viewerItems.length) % this.viewerItems.length;
            } else {
                return;
            }

            e.preventDefault();
            this.viewerIndex = newIndex;
            const item = this.viewerItems[newIndex];

            if (this.viewerType === 'desmos') {
                this.els.pdfViewerTitle.innerText = item.title;
                this.els.pdfViewerIframe.src = `https://www.desmos.com/calculator/${item.graphId}`;
            } else {
                // PDF (linked or uploaded)
                if (item.type === 'linked') {
                    this.els.pdfViewerTitle.innerText = item.name;
                    this.els.pdfViewerIframe.src = item.url;
                } else {
                    this.openPdfViewer(item.id, item.name);
                }
            }
        });

        // Add Unit
        if (this.els.addUnitBtn) {
            this.els.addUnitBtn.addEventListener('click', async () => {
                const name = await this.showCustomModal({
                    title: "New Unit",
                    message: "Enter name for new Unit:",
                    type: "text"
                });
                if (name && name.trim()) {
                    const newUnit = this.library.createUnit(name.trim());
                    this.state.currentUnitId = newUnit.id;
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });
        }

        // Add Course
        if (this.els.addCourseBtn) {
            this.els.addCourseBtn.addEventListener('click', async () => {
                const name = await this.showCustomModal({
                    title: "New Course",
                    message: "Enter name for new Course:",
                    type: "text"
                });
                if (name && name.trim()) {
                    const newCourse = this.library.createCourse(name.trim());
                    this.state.currentUnitId = newCourse.id;
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
                // Resolve the entry and its owning unit regardless of the current view.
                // 'general' and course ('c-') views aren't real units, so getUnit()
                // returns undefined there — always look the entry up by its owner unit.
                const units = this.library.getUnits();
                const ownerUnit = units.find(u => u.entries.some(e => e.id === this.state.viewingEntryId));
                if (!ownerUnit) return;
                const entry = ownerUnit.entries.find(e => e.id === this.state.viewingEntryId);
                if (this.state.currentUnitId !== ownerUnit.id) {
                    this.state.currentUnitId = ownerUnit.id;
                    this.renderSidebar();
                }
                if (entry) this.openModal(entry);
            });
        }

        // Sidebar selection
        if (this.els.sidebarList) {
            this.els.sidebarList.addEventListener('click', async (e) => {
                // Course Toggle Collapse/Expand
                if (e.target.closest('.course-toggle')) {
                    e.stopPropagation();
                    const courseId = e.target.closest('.course-toggle').dataset.courseId;
                    this.toggleCourse(courseId);
                    return;
                }

                // Check if delete button was clicked
                if (e.target.closest('.delete-unit-btn')) {
                    e.stopPropagation();
                    const unitId = e.target.closest('li').dataset.id;
                    const isConfirmed = await this.showCustomModal({
                        title: "Confirm Deletion",
                        message: "Delete this Unit and all its formulas?",
                        type: "confirm"
                    });
                    if (isConfirmed) {
                        this.library.deleteUnit(unitId);
                        if (this.state.currentUnitId === unitId) {
                            this.state.currentUnitId = 'general';
                        }
                        this.renderSidebar();
                        this.renderMainContent();
                    }
                    return;
                }

                // Course Delete
                if (e.target.closest('.delete-course-btn')) {
                    e.stopPropagation();
                    const courseId = e.target.closest('li').dataset.id;
                    const isConfirmed = await this.showCustomModal({
                        title: "Delete Course",
                        message: "Delete this Course? Units will be unassigned.",
                        type: "confirm"
                    });
                    if (isConfirmed) {
                        this.library.deleteCourse(courseId);
                        if (this.state.currentUnitId === courseId) {
                            this.state.currentUnitId = 'general';
                        }
                        this.renderSidebar();
                        this.renderMainContent();
                    }
                    return;
                }

                // Course Rename
                if (e.target.closest('.rename-course-btn')) {
                    e.stopPropagation();
                    const li = e.target.closest('li');
                    const courseId = li.dataset.id;
                    const course = this.library.getCourse(courseId);
                    
                    const newName = await this.showCustomModal({
                        title: "Rename Course",
                        message: "Enter new name:",
                        initialValue: course.name,
                        type: "text"
                    });
                    if (newName && newName.trim() && newName.trim() !== course.name) {
                        this.library.renameCourse(courseId, newName.trim());
                        this.renderSidebar();
                        if (this.state.currentUnitId === courseId) {
                            this.renderMainContent();
                        }
                    }
                    return;
                }

                // Move Unit
                if (e.target.closest('.move-unit-btn')) {
                    e.stopPropagation();
                    const unitId = e.target.closest('li').dataset.id;
                    const courses = this.library.getCourses();
                    
                    if (courses.length === 0) {
                        alert('Create a course first before assigning units.');
                        return;
                    }
                    
                    const sortedCourses = [...courses].sort((a, b) => a.name.localeCompare(b.name));
                    
                    let selectOptions = [];
                    sortedCourses.forEach((c) => {
                        selectOptions.push({ label: c.name, value: c.id });
                    });
                    
                    const choice = await this.showCustomModal({
                        title: "Move to Course",
                        message: "Select a course to assign to:",
                        type: "select",
                        selectOptions: selectOptions
                    });
                    
                    if (choice !== null) {
                        this.library.assignUnitToCourse(unitId, choice);
                        this.renderSidebar();
                        this.renderMainContent();
                    }
                    return;
                }

                // Unit Rename
                if (e.target.closest('.rename-unit-btn')) {
                    e.stopPropagation();
                    const li = e.target.closest('li');
                    const unitId = li.dataset.id;
                    const unit = this.library.getUnit(unitId);

                    const newName = await this.showCustomModal({
                        title: "Rename Unit",
                        message: "Enter new name:",
                        initialValue: unit.name,
                        type: "text"
                    });
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
            // Don't steal arrow keys while the AI modal is open or focus is in a field
            if (this.els.aiModal && this.els.aiModal.classList.contains('visible')) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
            if (this.els.viewModal.classList.contains('visible')) {
                if (e.key === 'ArrowRight') {
                    this.navigateEntry(1);
                } else if (e.key === 'ArrowLeft') {
                    this.navigateEntry(-1);
                }
            }
        });

        this.attachAiListeners();
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
        const pdfLinkCount = this.getPdfLinks().length;

        if (this.pdfStore) {
            try { pdfCount = await this.pdfStore.getCount(); } catch (e) { /* ignore */ }
        }
        pdfCount += pdfLinkCount;

        let html = `
            <li class="${this.state.currentUnitId === 'general' ? 'active' : ''}" data-id="general">
                <span>General</span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${totalEntries}</span>
                </div>
            </li>
        `;

        const desmosCount = this.getDesmosGraphs().length;
        html += `
        <li class="${this.state.currentUnitId === 'desmos' ? 'active' : ''}" data-id="desmos">
            <span style="color:#187A3D; font-weight:600;">Desmos</span>
            <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                <span class="unit-count">${desmosCount}</span>
            </div>
        </li>`;

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

        const courses = this.library.getCourses();
        const unassignedUnits = units.filter(u => !u.courseId);

        if (courses.length > 0) {
            html += `<div style="padding: 10px 10px 5px; font-size: 0.8em; color: #888; text-transform: uppercase; font-weight: 600;">Courses</div>`;
        }

        courses.forEach(c => {
            const courseUnits = units.filter(u => u.courseId === c.id);
            const courseEntriesCount = courseUnits.reduce((sum, u) => sum + u.entries.length, 0);

            const isExpanded = this.state.expandedCourses.has(c.id);
            const expandIcon = isExpanded 
                ? `<svg class="arrow-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>` 
                : `<svg class="arrow-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: rotate(-90deg);"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

            html += `
            <li class="${c.id === this.state.currentUnitId ? 'active' : ''}" data-id="${c.id}">
                <span style="font-weight: 600; display:flex; align-items:center;">
                    <span class="course-toggle" data-course-id="${c.id}">
                        <span class="course-icon">
                            <svg class="folder-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                            ${expandIcon}
                        </span>
                    </span><span class="course-title-text">${this._escapeHtml(c.name)}</span>
                </span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${courseEntriesCount}</span>
                    <div class="unit-actions">
                         <button class="rename-course-btn" title="Rename Course">&#9998;</button>
                         <button class="delete-course-btn" title="Delete Course">&times;</button>
                    </div>
                </div>
            </li>`;

            if (isExpanded && courseUnits.length > 0) {
                html += `<ul class="nested-unit-list" style="display:block;">`;
                html += courseUnits.map(u => this._generateUnitHTML(u)).join('');
                html += `</ul>`;
            }
        });

        if (unassignedUnits.length > 0) {
            if (courses.length > 0) {
                html += `<div style="padding: 10px 10px 5px; font-size: 0.8em; color: #888; text-transform: uppercase; font-weight: 600;">Units</div>`;
            }
            html += unassignedUnits.map(u => this._generateUnitHTML(u)).join('');
        }

        this.els.sidebarList.innerHTML = html;
        this.setupSidebarDragDrop();
    }

    _generateUnitHTML(u) {
        return `
            <li class="${u.id === this.state.currentUnitId ? 'active' : ''}" data-id="${u.id}" draggable="true">
                <span>${this._escapeHtml(u.name)}</span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${u.entries.length}</span>
                    <div class="unit-actions">
                         <button class="move-unit-btn" title="Move to Course" style="padding-top:2px;">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                         </button>
                         <button class="rename-unit-btn" title="Rename Unit">&#9998;</button>
                         <button class="delete-unit-btn" title="Delete Unit">&times;</button>
                    </div>
                </div>
            </li>
        `;
    }

    setupSidebarDragDrop() {
        // Clear old listeners if any (simple implementation assumes re-render safe)
        // Actually, delegation in attachListeners is better, but here we can just ensure
        // attributes are set. The listeners will be attached once in init/attachListeners.
    }

    renderMainContent(filterText = '') {
        if (this.state.currentUnitId === 'desmos') {
            this.els.addEntryBtn.style.display = 'inline-block';
            this.els.addEntryBtn.innerText = 'Add Graph';
            this.els.addEntryBtn.className = 'btn-primary btn-outlined-green';
            const linkBtn = document.getElementById('pdf-add-link-btn');
            if (linkBtn) linkBtn.remove();
            this.renderDesmosContent(filterText);
            return;
        }

        if (this.state.currentUnitId === 'pdfs') {
            if (!this.pdfStore) {
                this.state.currentUnitId = 'general';
                this.renderMainContent(filterText);
                return;
            }
            this.els.addEntryBtn.style.display = 'inline-block';
            this.els.addEntryBtn.innerText = 'Upload PDF';
            this.els.addEntryBtn.className = 'btn-primary btn-outlined-red';

            // Inject "Add Link" button next to "Upload PDF" if not already present
            let addLinkBtn = document.getElementById('pdf-add-link-btn');
            if (!addLinkBtn) {
                addLinkBtn = document.createElement('button');
                addLinkBtn.id = 'pdf-add-link-btn';
                addLinkBtn.className = 'btn-primary btn-outlined-red pdf-add-link-btn';
                addLinkBtn.innerText = 'Add Link';
                addLinkBtn.addEventListener('click', () => this.addPdfLink());
                this.els.addEntryBtn.parentNode.insertBefore(addLinkBtn, this.els.addEntryBtn.nextSibling);
            }

            this.renderPdfContent(filterText);
            return;
        }

        // Remove "Add Link" button when not on PDFs tab
        const existingLinkBtn = document.getElementById('pdf-add-link-btn');
        if (existingLinkBtn) existingLinkBtn.remove();

        this.els.addEntryBtn.style.display = 'inline-block';
        this.els.addEntryBtn.innerText = 'New Entry';
        this.els.addEntryBtn.className = 'btn-primary';
        
        let entries = [];
        
        if (this.state.currentUnitId === 'general') {
            this.els.addEntryBtn.style.display = 'none';
            this.els.mainContent.innerHTML = '';
            
            if (filterText) {
                entries = this.library.getAllEntries();
            } else {
                const courses = this.library.getCourses();
                const units = this.library.getUnits();
                const unassignedUnits = units.filter(u => !u.courseId);
                
                if (courses.length === 0 && unassignedUnits.length === 0) {
                    this.els.mainContent.innerHTML = '<div class="empty-state">No courses or units found. Add a unit in the sidebar.</div>';
                    return;
                }
                
                // Render Course Cards
                courses.forEach(c => {
                    const card = document.createElement('div');
                    card.className = 'course-card';
                    card.dataset.id = c.id;
                    
                    const courseUnits = units.filter(u => u.courseId === c.id);
                    const courseEntriesCount = courseUnits.reduce((sum, u) => sum + u.entries.length, 0);
                    
                    card.innerHTML = `
                        <div class="course-card-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                        </div>
                        <div class="desmos-card-info">
                            <h3></h3>
                            <p style="font-size: 0.8em; color: #666; margin: 0;"></p>
                        </div>
                    `;
                    card.querySelector('h3').textContent = c.name;
                    card.querySelector('p').textContent = `${courseUnits.length} Units \u00b7 ${courseEntriesCount} Formulas`;
                    card.addEventListener('click', () => {
                        this.state.currentUnitId = c.id;
                        this.renderSidebar();
                        this.renderMainContent();
                    });
                    this.els.mainContent.append(card);
                });
                
                // Render Unassigned Unit Cards
                unassignedUnits.forEach(u => {
                    const card = document.createElement('div');
                    card.className = 'course-card';
                    card.dataset.id = u.id;
                    
                    card.innerHTML = `
                        <div class="course-card-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        <div class="desmos-card-info">
                            <h3></h3>
                        <p style="font-size: 0.8em; color: #666; margin: 0;"></p>
                        </div>
                    `;
                    card.querySelector('h3').textContent = u.name;
                    card.querySelector('p').textContent = `Unit \u00b7 ${u.entries.length} Formulas`;
                    card.addEventListener('click', () => {
                        this.state.currentUnitId = u.id;
                        this.renderSidebar();
                        this.renderMainContent();
                    });
                    this.els.mainContent.append(card);
                });
                
                return;
            }
            
        } else if (this.state.currentUnitId.startsWith('c-')) {
            // Course Tab View
            this.els.addEntryBtn.style.display = 'none';
            entries = this.library.getEntriesForCourse(this.state.currentUnitId);
            
        } else {
            // Regular Unit View
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
        
        if (!filterText && this.state.currentUnitId.startsWith('c-')) {
            const courseUnits = this.library.getUnits().filter(u => u.courseId === this.state.currentUnitId);
            if (courseUnits.length > 0) {
                const header = document.createElement('h3');
                header.style.cssText = "grid-column: 1 / -1; width: 100%; margin-bottom: 0.5rem; margin-top: 0; color: #666; font-weight: 600; font-size: 1rem; text-transform: uppercase;";
                header.innerText = "Units";
                this.els.mainContent.append(header);
                
                courseUnits.forEach(u => {
                    const card = document.createElement('div');
                    card.className = 'course-card';
                    card.dataset.id = u.id;
                    card.innerHTML = `
                        <div class="course-card-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        <div class="desmos-card-info">
                            <h3></h3>
                            <p style="font-size: 0.8em; color: #666; margin: 0;"></p>
                        </div>
                    `;
                    card.querySelector('h3').textContent = u.name;
                    card.querySelector('p').textContent = `Unit \u00b7 ${u.entries.length} Formulas`;
                    card.addEventListener('click', () => {
                        this.state.currentUnitId = u.id;
                        this.renderSidebar();
                        this.renderMainContent();
                    });
                    this.els.mainContent.append(card);
                });

                if (entries.length > 0) {
                    const formHeader = document.createElement('h3');
                    formHeader.style.cssText = "grid-column: 1 / -1; width: 100%; margin-bottom: 0.5rem; margin-top: 1rem; color: #666; font-weight: 600; font-size: 1rem; text-transform: uppercase;";
                    formHeader.innerText = "Formulas";
                    this.els.mainContent.append(formHeader);
                }
            }
        }

        if (entries.length === 0) {
            if (!this.els.mainContent.innerHTML) {
                this.els.mainContent.innerHTML = '<div class="empty-state">No formulas found.</div>';
            }
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

    // ===== AI Generation (Bring-Your-Own-Key) =====

    _getGeminiKey() {
        return localStorage.getItem('formulae_gemini_key') || '';
    }

    _setGeminiKey(key) {
        localStorage.setItem('formulae_gemini_key', key);
    }

    _clearGeminiKey() {
        localStorage.removeItem('formulae_gemini_key');
    }

    _getGeminiModel() {
        return localStorage.getItem('formulae_gemini_model') || 'gemini-2.5-flash';
    }

    _setGeminiModel(model) {
        localStorage.setItem('formulae_gemini_model', model);
    }

    _refreshKeyUI() {
        const hasKey = !!this._getGeminiKey();
        this.els.aiKeyInputRow.style.display = hasKey ? 'none' : 'flex';
        this.els.aiKeySavedRow.style.display = hasKey ? 'flex' : 'none';
    }

    _renderAiFileList() {
        const files = this._aiFiles || [];
        this.els.aiFileList.innerHTML = files.map((f, i) => `
            <div class="ai-file-chip">
                <span class="ai-file-name" title="${this._escapeHtml(f.name)}">${this._escapeHtml(f.name)}</span>
                <button class="ai-file-remove" data-index="${i}" title="Remove">&times;</button>
            </div>
        `).join('');
    }

    _isTextFile(f) {
        return f.type.startsWith('text/') || /\.(md|markdown|txt)$/i.test(f.name);
    }

    _isPdfFile(f) {
        return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    }

    _isWordFile(f) {
        return /\.(docx?|rtf)$/i.test(f.name) ||
            f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            f.type === 'application/msword';
    }

    _isValidYoutubeUrl(url) {
        return /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?|playlist\?|shorts\/|live\/)|youtu\.be\/)\S+$/i.test(url.trim());
    }

    _addAiFiles(fileList) {
        if (!this._aiFiles) this._aiFiles = [];
        for (const f of fileList) {
            if (this._isWordFile(f)) {
                this._showAiError(`Word files like "${f.name}" aren't supported. Export it to PDF, or paste the text into Notes.`);
                continue;
            }
            const isPdf = this._isPdfFile(f);
            const isText = this._isTextFile(f);
            if (!isPdf && !isText) {
                this._showAiError(`"${f.name}" is not a supported type. Use PDF, Markdown, or text files.`);
                continue;
            }
            // ~20MB inline cap per file (Gemini inline-data limit)
            if (f.size > 20 * 1024 * 1024) {
                this._showAiError(`"${f.name}" is larger than 20 MB and can't be sent inline.`);
                continue;
            }
            this._aiFiles.push(f);
        }
        this._renderAiFileList();
    }

    _showAiError(msg) {
        this.els.aiError.textContent = msg;
        this.els.aiError.style.display = 'block';
    }

    _clearAiError() {
        this.els.aiError.textContent = '';
        this.els.aiError.style.display = 'none';
    }

    _setAiLoading(loading) {
        this.els.btnAiRun.disabled = loading;
        this.els.aiRunSpinner.style.display = loading ? 'inline-block' : 'none';
        this.els.aiRunLabel.textContent = loading ? 'Generating…' : 'Generate Table';
    }

    openAiModal() {
        this._aiFiles = [];
        this.els.aiYoutubeInput.value = '';
        this.els.aiNotesInput.value = '';
        this.els.aiFileInput.value = '';
        this._renderAiFileList();
        this._clearAiError();
        this._setAiLoading(false);
        this._refreshKeyUI();
        this.els.aiModelSelect.value = this._getGeminiModel();
        this.els.aiModal.classList.add('visible');
    }

    attachAiListeners() {
        if (!this.els.aiModal) return;

        this.els.aiBtn.addEventListener('click', () => this.openAiModal());
        this.els.btnCloseAi.addEventListener('click', () => this.els.aiModal.classList.remove('visible'));
        this.els.aiModal.addEventListener('click', (e) => {
            if (e.target === this.els.aiModal) this.els.aiModal.classList.remove('visible');
        });

        // Key management
        this.els.btnSaveKey.addEventListener('click', () => {
            const key = this.els.aiKeyInput.value.trim();
            if (!key) { this._showAiError('Please paste an API key first.'); return; }
            this._setGeminiKey(key);
            this.els.aiKeyInput.value = '';
            this._clearAiError();
            this._refreshKeyUI();
        });
        this.els.btnClearKey.addEventListener('click', () => {
            this._clearGeminiKey();
            this._refreshKeyUI();
        });

        // Model selection
        this.els.aiModelSelect.addEventListener('change', () => {
            this._setGeminiModel(this.els.aiModelSelect.value);
        });

        // File pickers
        this.els.aiDropzone.addEventListener('click', () => this.els.aiFileInput.click());
        this.els.aiFileInput.addEventListener('change', (e) => this._addAiFiles(e.target.files));
        this.els.aiDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.els.aiDropzone.classList.add('drag-over');
        });
        this.els.aiDropzone.addEventListener('dragleave', () => {
            this.els.aiDropzone.classList.remove('drag-over');
        });
        this.els.aiDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.els.aiDropzone.classList.remove('drag-over');
            if (e.dataTransfer.files) this._addAiFiles(e.dataTransfer.files);
        });
        this.els.aiFileList.addEventListener('click', (e) => {
            const btn = e.target.closest('.ai-file-remove');
            if (!btn) return;
            this._aiFiles.splice(parseInt(btn.dataset.index, 10), 1);
            this._renderAiFileList();
        });

        // Generate
        this.els.btnAiRun.addEventListener('click', () => this.runAiGeneration());
    }

    _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]); // strip data-URL prefix
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _fileToText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    // Ask the Flask backend for a YouTube video's caption text.
    // Returns { ok, transcript } on success, or { ok:false, backendMissing|error }.
    // backendMissing=true means there's no transcription server (e.g. static build),
    // so the caller can fall back to native Gemini video ingestion.
    async _fetchTranscript(url) {
        let res;
        try {
            res = await fetch('/api/transcript?url=' + encodeURIComponent(url));
        } catch (e) {
            return { ok: false, backendMissing: true };
        }
        const ctype = res.headers.get('content-type') || '';
        if (!ctype.includes('application/json')) {
            // Not our JSON endpoint (served statically / route absent)
            return { ok: false, backendMissing: true };
        }
        let data;
        try { data = await res.json(); } catch (e) { return { ok: false, backendMissing: true }; }
        if (res.ok && data.transcript) {
            return { ok: true, transcript: data.transcript };
        }
        // Library not installed on the server → treat as "no backend" and fall back
        if (res.status === 500 && /not installed/i.test(data.error || '')) {
            return { ok: false, backendMissing: true };
        }
        return { ok: false, backendMissing: false, error: data.error || ('HTTP ' + res.status) };
    }

    async runAiGeneration() {
        this._clearAiError();

        const key = this._getGeminiKey();
        if (!key) { this._showAiError('Please save your Gemini API key first.'); return; }

        // Parse + validate YouTube links (one per line)
        const youtubeLinks = this.els.aiYoutubeInput.value
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);
        const badLink = youtubeLinks.find(l => !this._isValidYoutubeUrl(l));
        if (badLink) {
            this._showAiError(`"${badLink}" doesn't look like a YouTube link. Use one valid URL per line.`);
            return;
        }

        const notes = this.els.aiNotesInput.value.trim();
        const files = this._aiFiles || [];

        if (youtubeLinks.length === 0 && !notes && files.length === 0) {
            this._showAiError('Add a YouTube link, some notes, or attach at least one file.');
            return;
        }

        this._setAiLoading(true);
        try {
            const result = await this.generateTableFromAI({ youtubeLinks, notes, files, key });
            const latex = result.latex;

            if (!latex || !latex.trim()) {
                throw new Error('The AI did not return a table. Try adding more detail or a different source.');
            }

            // If the editor already has content, confirm before overwriting it
            if (this.els.modalRaw.value.trim()) {
                const ok = await this.showCustomModal({
                    title: 'Replace current LaTeX?',
                    message: 'The editor already has content. Replace it with the AI-generated table?',
                    type: 'confirm'
                });
                if (!ok) { this._setAiLoading(false); return; }
            }

            // Populate the Edit Entry editor and refresh its live preview
            this.els.modalRaw.value = latex;
            this.renderer.render(latex, this.els.modalPreview);

            // Suggest a title only if the user hasn't set one
            if (!this.els.modalTitle.value.trim() && result.title) {
                this.els.modalTitle.value = result.title;
            }

            this.els.aiModal.classList.remove('visible');
        } catch (err) {
            this._showAiError(err.message || 'Something went wrong while generating.');
        } finally {
            this._setAiLoading(false);
        }
    }

    async generateTableFromAI({ youtubeLinks, notes, files, key }) {
        const MODEL = this._getGeminiModel();
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

        // Split text-like files (folded into the prompt) from PDFs (sent inline as base64)
        const textFiles = [];
        const binaryFiles = [];
        for (const f of files) {
            if (this._isTextFile(f)) textFiles.push(f);
            else binaryFiles.push(f);
        }

        let dataSection = '';
        if (notes) dataSection += 'Notes / context:\n' + notes + '\n\n';
        for (const tf of textFiles) {
            const content = await this._fileToText(tf);
            dataSection += `--- File: ${tf.name} ---\n${content}\n\n`;
        }

        // For each YouTube link, pull the real caption text from our backend
        // transcription service and fold it into the prompt — far more reliable than
        // having Gemini watch the video. If the service is unavailable (e.g. the static
        // build with no server), fall back to letting Gemini ingest the URL natively.
        const videoFileParts = [];
        for (const link of youtubeLinks) {
            const r = await this._fetchTranscript(link);
            if (r.ok) {
                dataSection += `--- YouTube transcript (${link}) ---\n${r.transcript}\n\n`;
            } else if (r.backendMissing) {
                videoFileParts.push({ fileData: { fileUri: link } });
            } else {
                throw new Error(`Couldn't get a transcript for ${link}: ${r.error}`);
            }
        }
        const hasVideos = youtubeLinks.length > 0;

        // NOTE: We ask for PLAIN TEXT (not JSON). LaTeX is backslash-heavy, and
        // wrapping it in a JSON string makes models mis-escape "\\" row breaks
        // (producing "Misplaced \hline" render errors). Plain text avoids that layer.
        // Backslashes below are doubled so the resulting JS string holds single-backslash LaTeX.
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

        const parts = [{ text: promptText }];
        // Only present when the transcription backend was unavailable (fallback).
        for (const part of videoFileParts) {
            parts.push(part);
        }
        for (const f of binaryFiles) {
            const data = await this._fileToBase64(f);
            parts.push({ inlineData: { mimeType: f.type || 'application/pdf', data } });
        }

        const body = {
            contents: [{ parts }]
        };

        let res;
        try {
            res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (e) {
            throw new Error('Network error contacting Google. Check your internet connection.');
        }

        if (!res.ok) {
            // Surface Google's actual error message — it's far more specific than the HTTP code
            let detail = '';
            try {
                const errJson = await res.json();
                detail = errJson?.error?.message || '';
            } catch (e) { /* body wasn't JSON */ }

            if (res.status === 403) {
                throw new Error('API key rejected or lacking permission (HTTP 403). ' + (detail || 'Check the key and that the "Generative Language API" is enabled for its project.'));
            }
            if (res.status === 400) {
                // 400 is usually a malformed request or unsupported content, not the key
                throw new Error('Request rejected (HTTP 400). ' + (detail || 'The input may be unsupported. If you just pasted a key, double-check it.'));
            }
            if (res.status === 404) {
                throw new Error('Model not found (HTTP 404). ' + (detail || 'The model name may be unavailable for this key.'));
            }
            if (res.status === 429) {
                throw new Error('Quota/rate limit (HTTP 429). ' + (detail || 'Free tier has per-minute and per-day limits — wait ~60s.'));
            }
            throw new Error(`Gemini request failed (HTTP ${res.status}). ${detail}`);
        }

        const json = await res.json();
        const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) throw new Error('The AI returned an empty response. Try again.');

        // Plain-text response: strip any stray code fences, pull out the TITLE line,
        // then isolate the $$...$$ (or \[...\]) table block.
        let textOut = raw.replace(/```(?:latex|text|tex)?/gi, '').trim();

        let title = '';
        const titleMatch = textOut.match(/^\s*TITLE:\s*(.+)$/im);
        if (titleMatch) {
            title = titleMatch[1].trim();
            textOut = textOut.replace(titleMatch[0], '').trim();
        }

        let latex = '';
        const dollarBlock = textOut.match(/\$\$[\s\S]*?\$\$/);
        const bracketBlock = textOut.match(/\\\[[\s\S]*?\\\]/);
        if (dollarBlock) latex = dollarBlock[0];
        else if (bracketBlock) latex = bracketBlock[0];
        else latex = textOut.trim();

        latex = this._repairTableLatex(latex.trim());

        // Ensure the LaTeX carries display-math delimiters so it renders as a block
        if (latex && !/^\s*(\$\$|\\\[|\\\(|\$)/.test(latex)) {
            latex = `$$\n${latex}\n$$`;
        }

        return { title, latex };
    }

    // Some models emit a single backslash before \hline instead of the required
    // row terminator "\\". That triggers MathJax "Misplaced \hline". Repair it.
    _repairTableLatex(latex) {
        if (!latex) return latex;
        return latex.replace(/(?<!\\)\\(\s*)\\hline/g, '\\\\$1\\hline');
    }

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
        let pdfs;
        try {
            pdfs = await this.pdfStore.getAllPdfs();
        } catch (e) {
            this.els.mainContent.innerHTML = '<div class="empty-state">Failed to load PDFs.</div>';
            return;
        }

        // Merge linked PDFs
        let linkedPdfs = this.getPdfLinks();
        let allPdfs = [
            ...pdfs.map(p => ({ ...p, type: 'uploaded' })),
            ...linkedPdfs.map(l => ({ ...l, type: 'linked', size: 0 }))
        ];

        // Sort by date (newest first)
        allPdfs.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

        if (filterText) {
            const lower = filterText.toLowerCase();
            allPdfs = allPdfs.filter(p => p.name.toLowerCase().includes(lower));
        }

        if (allPdfs.length === 0) {
            this.els.mainContent.innerHTML = '<div class="empty-state">No PDFs yet. Click "Upload PDF" or "Add Link" to add one.</div>';
            return;
        }

        // Store for arrow key navigation
        this._lastPdfList = allPdfs;

        allPdfs.forEach(pdf => {
            const card = document.createElement('div');
            card.className = 'pdf-card';
            card.dataset.id = pdf.id;
            const isLinked = pdf.type === 'linked';

            const dateStr = new Date(pdf.dateAdded).toLocaleDateString();
            const metaText = isLinked ? dateStr : `${(pdf.size / (1024 * 1024)).toFixed(1)} MB · ${dateStr}`;

            card.innerHTML = `
                <div class="pdf-card-icon">
                    <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve" style="height: 60px; width: auto;" fill="#000000">
                    <g id="SVGRepo_bgCarrier" stroke-width="0"/>
                    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"/>
                    <g id="SVGRepo_iconCarrier"> <path style="fill:#B3404A;" d="M437.456,512H21.212c-8.166,0-14.786-6.621-14.786-14.786V256.915c0-8.165,6.62-14.786,14.786-14.786 s14.786,6.621,14.786,14.786v225.512h386.671v-32.939c0-8.165,6.62-14.786,14.786-14.786s14.786,6.621,14.786,14.786v47.725 C452.242,505.379,445.622,512,437.456,512z"/> <g> <polygon style="fill:#ffffff;" points="21.212,177.092 21.212,172.3 176.068,14.786 176.068,177.092 "/> <rect x="196.524" y="219.426" style="fill:#ffffff;" width="294.274" height="163.712"/> </g> <g> <path style="fill:#B3404A;" d="M490.791,204.634h-38.549V14.786c0-8.165-6.62-14.786-14.786-14.786H176.068 c-0.067,0-0.132,0.009-0.198,0.01c-0.359,0.004-0.717,0.022-1.075,0.053c-0.12,0.01-0.241,0.021-0.361,0.034 c-0.41,0.046-0.816,0.105-1.22,0.185c-0.031,0.006-0.061,0.009-0.092,0.015c-0.432,0.089-0.858,0.2-1.28,0.325 c-0.111,0.033-0.22,0.071-0.33,0.106c-0.322,0.105-0.642,0.22-0.958,0.347c-0.108,0.044-0.217,0.086-0.324,0.132 c-0.807,0.346-1.585,0.766-2.326,1.257c-0.102,0.067-0.2,0.139-0.3,0.207c-0.274,0.191-0.541,0.392-0.803,0.603 c-0.099,0.08-0.198,0.157-0.294,0.24c-0.339,0.287-0.67,0.586-0.985,0.906L10.668,161.935c-0.346,0.352-0.671,0.719-0.977,1.1 c-0.182,0.226-0.342,0.463-0.509,0.696c-0.112,0.157-0.234,0.309-0.34,0.47c-0.194,0.294-0.364,0.599-0.534,0.903 c-0.062,0.112-0.133,0.219-0.192,0.333c-0.166,0.315-0.308,0.639-0.449,0.963c-0.05,0.114-0.108,0.225-0.155,0.34 c-0.126,0.312-0.231,0.628-0.336,0.946c-0.04,0.139-0.099,0.274-0.14,0.413c-0.087,0.294-0.152,0.591-0.22,0.889 c-0.04,0.172-0.087,0.34-0.121,0.515c-0.053,0.274-0.084,0.55-0.121,0.825c-0.027,0.201-0.062,0.399-0.081,0.6 c-0.025,0.268-0.03,0.535-0.04,0.801c-0.007,0.191-0.028,0.38-0.028,0.571v4.792c0,8.165,6.62,14.786,14.786,14.786h154.855 c8.166,0,14.786-6.621,14.786-14.786V29.572h231.816v175.062H196.518c-8.166,0-14.786,6.621-14.786,14.786v163.705 c0,8.165,6.62,14.786,14.786,14.786h294.272c8.166,0,14.786-6.621,14.786-14.786V219.421 C505.577,211.256,498.957,204.634,490.791,204.634z M51.772,162.308l47.938-48.76l61.571-62.63v111.39L51.772,162.308 L51.772,162.308z M476.005,368.339h-264.7V234.207h264.7V368.339z"/> <path style="fill:#B3404A;" d="M246.08,260.736c0-3.2,2.925-6.015,7.375-6.015h26.322c16.785,0,30.008,7.934,30.008,29.433v0.64 c0,21.499-13.733,29.689-31.28,29.689h-12.589v27.641c0,4.096-4.959,6.142-9.919,6.142s-9.919-2.048-9.919-6.142L246.08,260.736 L246.08,260.736z M265.916,272.124v27.002h12.589c7.121,0,11.444-4.096,11.444-12.797v-1.406c0-8.703-4.323-12.797-11.444-12.797 h-12.589V272.124z"/> <path style="fill:#B3404A;" d="M349.586,254.721c17.548,0,31.282,8.19,31.282,30.202v33.145c0,22.011-13.733,30.201-31.282,30.201 h-22.507c-5.214,0-8.647-2.815-8.647-6.014v-81.518c0-3.2,3.433-6.015,8.647-6.015h22.507V254.721z M338.269,272.124v58.739h11.317 c7.121,0,11.444-4.096,11.444-12.796v-33.145c0-8.703-4.323-12.797-11.444-12.797h-11.317V272.124z"/> <path style="fill:#B3404A;" d="M393.458,260.863c0-4.096,4.323-6.142,8.647-6.142h44.125c4.196,0,5.977,4.479,5.977,8.574 c0,4.735-2.162,8.83-5.977,8.83h-32.935v21.628h19.201c3.815,0,5.977,3.711,5.977,7.806c0,3.456-1.78,7.55-5.977,7.55h-19.201 v33.016c0,4.096-4.959,6.142-9.919,6.142c-4.959,0-9.919-2.048-9.919-6.142V260.863z"/> </g> </g>
                    </svg>
                </div>
                <div class="pdf-card-info">
                    <h3></h3>
                    <p>${metaText}</p>
                </div>
                <div class="pdf-card-actions">
                    <button class="pdf-view-btn">View</button>
                    <button class="pdf-rename-btn">Rename</button>
                    <button class="pdf-delete-btn btn-danger">Delete</button>
                </div>
            `;

            // Set title safely via textContent (XSS prevention)
            const titleEl = card.querySelector('.pdf-card-info h3');
            titleEl.textContent = pdf.name;
            titleEl.setAttribute('title', pdf.name);

            card.querySelector('.pdf-view-btn').onclick = (e) => {
                e.stopPropagation();
                if (isLinked) {
                    this.openPdfViewer(pdf.id, pdf.name, pdf.url);
                } else {
                    this.openPdfViewer(pdf.id, pdf.name);
                }
            };

            card.querySelector('.pdf-rename-btn').onclick = async (e) => {
                e.stopPropagation();
                const newName = await this.showCustomModal({
                    title: "Rename PDF",
                    message: "Enter new name:",
                    initialValue: pdf.name,
                    type: "text"
                });
                if (newName && newName.trim() && newName.trim() !== pdf.name) {
                    if (isLinked) {
                        const links = this.getPdfLinks();
                        const link = links.find(l => l.id === pdf.id);
                        if (link) {
                            link.name = newName.trim();
                            this.savePdfLinks(links);
                        }
                    } else {
                        await this.pdfStore.renamePdf(pdf.id, newName.trim());
                    }
                    this.renderMainContent();
                    this.renderSidebar();
                }
            };

            card.querySelector('.pdf-delete-btn').onclick = async (e) => {
                e.stopPropagation();
                const isConfirmed = await this.showCustomModal({
                    title: "Confirm Deletion",
                    message: `Delete "${pdf.name}"?`,
                    type: "confirm"
                });
                if (isConfirmed) {
                    if (isLinked) {
                        const links = this.getPdfLinks().filter(l => l.id !== pdf.id);
                        this.savePdfLinks(links);
                    } else {
                        await this.pdfStore.deletePdf(pdf.id);
                    }
                    this.renderMainContent();
                    this.renderSidebar();
                }
            };

            card.addEventListener('click', () => {
                if (isLinked) {
                    this.openPdfViewer(pdf.id, pdf.name, pdf.url);
                } else {
                    this.openPdfViewer(pdf.id, pdf.name);
                }
            });

            this.els.mainContent.append(card);
        });
    }

    async openPdfViewer(id, name, url) {
        // Track items for arrow key navigation (only set if not already navigating)
        if (!this.viewerItems || this.viewerType !== 'pdf') {
            this.viewerType = 'pdf';
            this.viewerItems = this._lastPdfList || [];
            this.viewerIndex = this.viewerItems.findIndex(p => p.id === id);
        }

        // If a URL is provided (linked PDF), validate and load it directly in the iframe
        if (url) {
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                    alert('Invalid URL: only https and http links are allowed.');
                    return;
                }
            } catch (e) {
                alert('Invalid URL format.');
                return;
            }
            this.els.pdfViewerTitle.innerText = name;
            this.els.pdfViewerIframe.src = url;
            this.els.pdfViewerModal.classList.add('visible');
            return;
        }

        // Otherwise, load from IndexedDB blob
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

    // --- PDF Link Helpers ---

    getPdfLinks() {
        try {
            return JSON.parse(localStorage.getItem('pdf_links') || '[]');
        } catch (e) {
            return [];
        }
    }

    savePdfLinks(links) {
        localStorage.setItem('pdf_links', JSON.stringify(links));
    }

    async addPdfLink() {
        const url = await this.showCustomModal({
            title: "Add PDF Link",
            message: "Paste a PDF link:",
            type: "text"
        });
        if (!url || !url.trim()) return;

        const title = await this.showCustomModal({
            title: "Add PDF Link",
            message: "Enter a title for this PDF:",
            initialValue: "Untitled PDF",
            type: "text"
        });
        if (!title || !title.trim()) return;

        const links = this.getPdfLinks();
        links.push({
            id: 'link-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name: title.trim(),
            url: url.trim(),
            dateAdded: new Date().toISOString()
        });
        this.savePdfLinks(links);
        this.renderSidebar();
        this.renderMainContent();
    }

    toggleSidebar() {
        const container = document.querySelector('.glass-container');
        container.classList.toggle('sidebar-collapsed');

        const sidebar = container.querySelector('.sidebar');
        if (container.classList.contains('sidebar-collapsed')) {
            sidebar.style.visibility = 'hidden';
        } else {
            setTimeout(() => sidebar.style.visibility = 'visible', 200);
        }
        const isCollapsed = container.classList.contains('sidebar-collapsed');
        if (this.els.btnFullscreen) {
            this.els.btnFullscreen.innerHTML = isCollapsed ? '&#9776;' : '&times;';
            this.els.btnFullscreen.title = isCollapsed ? 'Show Sidebar' : 'Hide Sidebar';
        }
    }

    // --- Desmos Integration (Card-Based + iframe Viewer) ---

    getDesmosGraphs() {
        try {
            return JSON.parse(localStorage.getItem('desmos_graphs') || '[]');
        } catch (e) {
            return [];
        }
    }

    saveDesmosGraphs(graphs) {
        localStorage.setItem('desmos_graphs', JSON.stringify(graphs));
    }

    extractDesmosGraphId(url) {
        const match = url.match(/desmos\.com\/calculator\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    async addDesmosGraph() {
        const url = await this.showCustomModal({
            title: "Add Desmos Graph",
            message: "Paste a Desmos graph URL:",
            type: "text"
        });
        if (!url || !url.trim()) return;

        const graphId = this.extractDesmosGraphId(url.trim());
        if (!graphId) {
            alert('Invalid Desmos URL. Expected format: desmos.com/calculator/abc123');
            return;
        }

        const title = await this.showCustomModal({
            title: "Add Desmos Graph",
            message: "Enter a title for this graph:",
            initialValue: "Untitled Graph",
            type: "text"
        });
        if (!title || !title.trim()) return;

        const graphs = this.getDesmosGraphs();
        graphs.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            title: title.trim(),
            url: url.trim(),
            graphId: graphId,
            dateAdded: new Date().toISOString()
        });
        this.saveDesmosGraphs(graphs);
        this.renderSidebar();
        this.renderMainContent();
    }

    renderDesmosContent(filterText = '') {
        this.els.mainContent.innerHTML = '';
        let graphs = this.getDesmosGraphs();

        if (filterText) {
            const lower = filterText.toLowerCase();
            graphs = graphs.filter(g => g.title.toLowerCase().includes(lower));
        }

        if (graphs.length === 0) {
            this.els.mainContent.innerHTML = '<div class="empty-state">No graphs saved yet. Click "Add Graph" to save one.</div>';
            return;
        }

        graphs.forEach(graph => {
            const card = document.createElement('div');
            card.className = 'desmos-card';
            card.dataset.id = graph.id;

            const dateStr = new Date(graph.dateAdded).toLocaleDateString();

            card.innerHTML = `
                <div class="desmos-card-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#187A3D" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="height:50px; width:auto;">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="3" y1="12" x2="21" y2="12" opacity="0.3"/>
                        <line x1="12" y1="3" x2="12" y2="21" opacity="0.3"/>
                        <path d="M4 18 Q8 6, 12 12 T20 6" stroke-width="2"/>
                    </svg>
                </div>
                <div class="desmos-card-info">
                    <h3></h3>
                    <p>${dateStr}</p>
                </div>
                <div class="desmos-card-actions">
                    <button class="desmos-view-btn">View</button>
                    <button class="desmos-rename-btn">Rename</button>
                    <button class="desmos-delete-btn btn-danger">Delete</button>
                </div>
            `;

            const titleEl = card.querySelector('.desmos-card-info h3');
            titleEl.textContent = graph.title;
            titleEl.setAttribute('title', graph.title);

            card.querySelector('.desmos-view-btn').onclick = (e) => {
                e.stopPropagation();
                this.openDesmosViewer(graph);
            };

            card.querySelector('.desmos-rename-btn').onclick = async (e) => {
                e.stopPropagation();
                const newName = await this.showCustomModal({
                    title: "Rename Graph",
                    message: "Enter new name:",
                    initialValue: graph.title,
                    type: "text"
                });
                if (newName && newName.trim() && newName.trim() !== graph.title) {
                    const graphs = this.getDesmosGraphs();
                    const g = graphs.find(x => x.id === graph.id);
                    if (g) {
                        g.title = newName.trim();
                        this.saveDesmosGraphs(graphs);
                        this.renderMainContent();
                    }
                }
            };

            card.querySelector('.desmos-delete-btn').onclick = async (e) => {
                e.stopPropagation();
                const isConfirmed = await this.showCustomModal({
                    title: "Confirm Deletion",
                    message: `Delete "${graph.title}"?`,
                    type: "confirm"
                });
                if (isConfirmed) {
                    const graphs = this.getDesmosGraphs().filter(x => x.id !== graph.id);
                    this.saveDesmosGraphs(graphs);
                    this.renderMainContent();
                    this.renderSidebar();
                }
            };

            card.addEventListener('click', () => {
                this.openDesmosViewer(graph);
            });

            this.els.mainContent.append(card);
        });
    }

    openDesmosViewer(graph) {
        // Track items for arrow key navigation
        this.viewerType = 'desmos';
        this.viewerItems = this.getDesmosGraphs();
        this.viewerIndex = this.viewerItems.findIndex(g => g.id === graph.id);

        this.els.pdfViewerTitle.innerText = graph.title;
        this.els.pdfViewerIframe.src = `https://www.desmos.com/calculator/${graph.graphId}`;
        this.els.pdfViewerModal.classList.add('visible');
    }
}

/* ===== Custom themed dropdown =====
   Keeps the native <select> as the hidden source of truth and renders a
   styled .ft-dd overlay beside it. Existing code that reads select.value
   keeps working unchanged. */
function closeAllDropdowns(except) {
    document.querySelectorAll('.ft-dd.open').forEach(d => {
        if (d !== except) d.classList.remove('open');
    });
}

function initThemedSelects() {
    document.addEventListener('click', () => closeAllDropdowns(null));
    document.querySelectorAll('#ai-model-select, #customModalInputSelect').forEach(enhanceSelect);
}

function enhanceSelect(sel) {
    if (!sel || sel.dataset.ftThemed) return;
    sel.dataset.ftThemed = '1';
    sel.style.display = 'none';   // native select stays as source of truth, hidden

    const chev = '<span class="ft-dd-chev"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>';

    const dd = document.createElement('div');
    dd.className = 'ft-dd';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'ft-dd-head';
    head.innerHTML = '<span class="ft-dd-val"></span>' + chev;
    const list = document.createElement('div');
    list.className = 'ft-dd-list';
    dd.appendChild(head);
    dd.appendChild(list);
    sel.parentNode.insertBefore(dd, sel.nextSibling);
    sel._ftDD = dd;   // back-reference for toggling visibility in modals

    const valEl = head.querySelector('.ft-dd-val');
    const sync = () => {
        const opt = sel.options[sel.selectedIndex];
        valEl.textContent = opt ? opt.textContent : '';
        list.querySelectorAll('.ft-dd-opt').forEach(b =>
            b.classList.toggle('on', b.dataset.val === sel.value && !b.classList.contains('disabled')));
    };
    const rebuild = () => {
        list.innerHTML = '';
        Array.from(sel.options).forEach(opt => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ft-dd-opt' + (opt.disabled ? ' disabled' : '');
            b.dataset.val = opt.value;
            b.textContent = opt.textContent;
            if (!opt.disabled) {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sel.value = opt.value;
                    dd.classList.remove('open');
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
            list.appendChild(b);
        });
        sync();
    };
    head.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = dd.classList.contains('open');
        closeAllDropdowns(dd);
        dd.classList.toggle('open', !open);
    });

    // Mirror programmatic changes: option-list edits + direct value/selectedIndex set.
    new MutationObserver(rebuild).observe(sel, { childList: true });
    sel.addEventListener('change', sync);
    const proto = HTMLSelectElement.prototype;
    ['value', 'selectedIndex'].forEach(prop => {
        const desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (!desc) return;
        Object.defineProperty(sel, prop, {
            configurable: true,
            get() { return desc.get.call(sel); },
            set(v) { desc.set.call(sel, v); sync(); }
        });
    });

    rebuild();
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    initThemedSelects();
});
