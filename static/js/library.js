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
                const parsed = JSON.parse(stored);
                // Migration: add courses if not present
                if (!parsed.courses) {
                    parsed.courses = [];
                }
                // Migration: add courseId to units if not present
                if (!parsed.units || !Array.isArray(parsed.units)) {
                    parsed.units = [];
                } else {
                    parsed.units.forEach(u => {
                        if (u.courseId === undefined) u.courseId = null;
                    });
                }
                return parsed;
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
            version: "1.1",
            lastUpdated: new Date().toISOString(),
            courses: [],
            units: [
                {
                    id: "u-default",
                    name: "General",
                    courseId: null,
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

    createUnit(name, courseId = null) {
        const newUnit = {
            id: 'u-' + Date.now(),
            name: name,
            courseId: courseId,
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

    // --- Course Operations ---

    getCourses() {
        return this.data.courses || [];
    }

    getCourse(courseId) {
        return this.getCourses().find(c => c.id === courseId);
    }

    createCourse(name) {
        if (!this.data.courses) this.data.courses = [];
        const newCourse = {
            id: 'c-' + Date.now(),
            name: name
        };
        this.data.courses.push(newCourse);
        this.saveData();
        return newCourse;
    }

    renameCourse(courseId, newName) {
        const course = this.getCourse(courseId);
        if (course) {
            course.name = newName;
            this.saveData();
            return true;
        }
        return false;
    }

    deleteCourse(courseId) {
        if (!this.data.courses) return;
        this.data.courses = this.data.courses.filter(c => c.id !== courseId);
        // Unassign all units that were in this course to prevent data loss
        this.data.units.forEach(u => {
            if (u.courseId === courseId) {
                u.courseId = null;
            }
        });
        this.saveData();
    }

    assignUnitToCourse(unitId, courseId) {
        const unit = this.getUnit(unitId);
        if (unit) {
            unit.courseId = courseId; // Set to null to unassign
            this.saveData();
            return true;
        }
        return false;
    }

    getEntriesForCourse(courseId) {
        // Find all units belonging to this course
        const unitsInCourse = this.data.units.filter(u => u.courseId === courseId);
        // Flatten their entries into one array
        return unitsInCourse.flatMap(u => u.entries);
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
