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

    getAllEntries() {
        // Collects entries from all units into one flat array
        return this.data.units.flatMap(u => u.entries);
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

    renameUnit(unitId, newName) {
        const unit = this.getUnit(unitId);
        if (unit) {
            unit.name = newName;
            this.saveData();
            return true;
        }
        return false;
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

    reorderUnits(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.data.units.length || toIndex < 0 || toIndex >= this.data.units.length) return false;
        const [movedUnit] = this.data.units.splice(fromIndex, 1);
        this.data.units.splice(toIndex, 0, movedUnit);
        this.saveData();
        return true;
    }

    reorderEntries(unitId, fromIndex, toIndex) {
        const unit = this.getUnit(unitId);
        if (!unit) return false;
        if (fromIndex < 0 || fromIndex >= unit.entries.length || toIndex < 0 || toIndex >= unit.entries.length) return false;

        const [movedEntry] = unit.entries.splice(fromIndex, 1);
        unit.entries.splice(toIndex, 0, movedEntry);
        this.saveData();
        return true;
    }

    moveEntryToUnit(entryId, sourceUnitId, targetUnitId) {
        const sourceUnit = this.getUnit(sourceUnitId);
        const targetUnit = this.getUnit(targetUnitId);

        if (!sourceUnit || !targetUnit) return false;

        const entryIndex = sourceUnit.entries.findIndex(e => e.id === entryId);
        if (entryIndex === -1) return false;

        const [entry] = sourceUnit.entries.splice(entryIndex, 1);
        targetUnit.entries.push(entry);
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
