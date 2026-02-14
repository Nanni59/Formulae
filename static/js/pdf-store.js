class PdfStore {
    constructor() {
        this.DB_NAME = 'formulae_pdfs';
        this.DB_VERSION = 1;
        this.STORE_NAME = 'pdfs';
        this._db = null;
    }

    _open() {
        if (this._db) return Promise.resolve(this._db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                this._db = e.target.result;
                resolve(this._db);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async addPdf(file) {
        const db = await this._open();
        const record = {
            id: 'pdf-' + Date.now(),
            name: file.name.replace(/\.pdf$/i, ''),
            size: file.size,
            dateAdded: new Date().toISOString(),
            blob: file
        };
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).put(record);
            tx.oncomplete = () => resolve(record);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllPdfs() {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const req = tx.objectStore(this.STORE_NAME).getAll();
            req.onsuccess = () => {
                const results = req.result.map(r => ({
                    id: r.id,
                    name: r.name,
                    size: r.size,
                    dateAdded: r.dateAdded
                }));
                resolve(results);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async getPdfBlob(id) {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const req = tx.objectStore(this.STORE_NAME).get(id);
            req.onsuccess = () => resolve(req.result ? req.result.blob : null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async renamePdf(id, newName) {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const store = db.transaction(this.STORE_NAME, 'readwrite').objectStore(this.STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => {
                const record = req.result;
                if (!record) return resolve(false);
                record.name = newName;
                const putReq = store.put(record);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = (e) => reject(e.target.error);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async deletePdf(id) {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getCount() {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const req = tx.objectStore(this.STORE_NAME).count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }
}

window.PdfStore = PdfStore;
