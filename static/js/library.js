// library.js
// Handles Data persistence and Schema management

class FormulaLibrary {
    constructor() {
        this.STORAGE_KEY = 'tex_formula_library_v1';
        this.data = this.loadData();
    }

    // Load from LocalStorage or return default Key
    loadData() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error("Failed to parse storage", e);
                return this.getDefaultSchema();
            }
        }
        return this.getDefaultSchema();
    }

    saveData() {
        this.data.lastUpdated = new Date().toISOString();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    getDefaultSchema() {
        return {
            version: "1.0",
            lastUpdated: new Date().toISOString(),
            units: [
                {
                    id: "u-default",
                    name: "General",
                    entries: []
                }
            ]
        };
    }

    // CRUD Operations

    getUnits() {
        return this.data.units;
    }

    getUnit(unitId) {
        return this.data.units.find(u => u.id === unitId);
    }

    createUnit(name) {
        const newUnit = {
            id: 'u-' + Date.now(),
            name: name,
            entries: []
        };
        this.data.units.push(newUnit);
        this.saveData();
        return newUnit;
    }

    deleteUnit(unitId) {
        this.data.units = this.data.units.filter(u => u.id !== unitId);
        this.saveData();
    }

    addEntry(unitId, title, rawLatex, isTikZ = false, tags = []) {
        const unit = this.getUnit(unitId);
        if (!unit) return null;

        const newEntry = {
            id: 'f-' + Date.now(),
            title: title || 'Untitled',
            raw: rawLatex,
            isTikZ: isTikZ,
            tags: tags,
            createdAt: new Date().toISOString()
        };

        unit.entries.push(newEntry);
        this.saveData();
        return newEntry;
    }

    updateEntry(unitId, entryId, updates) {
        const unit = this.getUnit(unitId);
        if (!unit) return false;

        const entryIndex = unit.entries.findIndex(e => e.id === entryId);
        if (entryIndex === -1) return false;

        unit.entries[entryIndex] = { ...unit.entries[entryIndex], ...updates };
        this.saveData();
        return true;
    }

    deleteEntry(unitId, entryId) {
        const unit = this.getUnit(unitId);
        if (!unit) return false;

        unit.entries = unit.entries.filter(e => e.id !== entryId);
        this.saveData();
        return true;
    }

    // Export/Import
    exportToJSON() {
        return JSON.stringify(this.data, null, 2);
    }

    importFromJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            // Basic validation could go here
            if (!parsed.units) throw new Error("Invalid Format");
            this.data = parsed;
            this.saveData();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

window.FormulaLibrary = FormulaLibrary;
