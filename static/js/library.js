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
                return FormulaLibrary.normalize(JSON.parse(stored));
            } catch (e) {
                // Keep the unreadable copy before the next save replaces it with an empty library
                console.error("Failed to parse storage; kept a copy in " + this.STORAGE_KEY + "_unreadable_backup", e);
                try { localStorage.setItem(this.STORAGE_KEY + '_unreadable_backup', stored); } catch (_) { }
                return this.getDefaultSchema();
            }
        }
        return this.getDefaultSchema();
    }

    // Repair what older, imported or hand-edited libraries lack, in place, without changing the schema:
    // - drops null / non-object courses, units and entries (one bad item must not empty the whole library)
    // - gives every course and unit a string id that is unique and not a built-in view name
    // - unit.courseId (null when missing or pointing at no course), unit.entries, entry title/raw as strings
    // - a course colour (plain hex only, since it goes into style attributes)
    static normalize(data) {
        if (!data || typeof data !== 'object') throw new Error('Invalid Format');
        const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
        data.courses = Array.isArray(data.courses) ? data.courses.filter(isObj) : [];
        data.units = Array.isArray(data.units) ? data.units.filter(isObj) : [];

        const taken = new Set(FormulaLibrary.RESERVED_IDS);
        let n = 0;
        const fresh = prefix => { let id; do { id = prefix + Date.now().toString(36) + '-' + (n++); } while (taken.has(id)); return id; };
        const claim = (item, prefix) => {
            const old = item.id;
            if (typeof old !== 'string' || !old || taken.has(old)) item.id = fresh(prefix);
            taken.add(item.id);
            return old;
        };
        const courseIds = new Map();   // old id → current id, so units keep their course when a course id is replaced
        data.courses.forEach((c, i) => {
            const old = claim(c, 'c-');
            if (!courseIds.has(old)) courseIds.set(old, c.id);
            if (typeof c.name !== 'string' || !c.name.trim()) c.name = 'Untitled course';
            if (!/^#[0-9a-f]{3,8}$/i.test(c.color || '')) c.color = FormulaLibrary.COURSE_COLORS[i % FormulaLibrary.COURSE_COLORS.length];
        });
        data.units.forEach(u => {
            claim(u, 'u-');
            if (typeof u.name !== 'string' || !u.name.trim()) u.name = 'Untitled unit';
            u.courseId = courseIds.get(u.courseId) || null;
            u.entries = Array.isArray(u.entries) ? u.entries.filter(isObj) : [];
            u.entries.forEach(e => {
                if (typeof e.id !== 'string' || !e.id) e.id = fresh('f-');
                if (typeof e.title !== 'string') e.title = e.title == null ? 'Untitled formula' : String(e.title);
                if (typeof e.raw !== 'string') e.raw = e.raw == null ? '' : String(e.raw);
            });
        });
        return data;
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
            // Must look like a Formulae library; normalize then repairs any odd course, unit or entry in it
            if (!parsed || !Array.isArray(parsed.units)) throw new Error("Invalid Format");
            this.data = FormulaLibrary.normalize(parsed);
            this.saveData();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

// Course colour palette (the New Course swatches); older courses get one by position
FormulaLibrary.COURSE_COLORS = ['#8b5cf6', '#2563eb', '#ff9500', '#30b0c7', '#34c759', '#ff2d55', '#a2845e', '#8e8e93'];
// Names of the app's built-in views; no course or unit may use one as its id
FormulaLibrary.RESERVED_IDS = ['general', 'pdfs', 'desmos'];

window.FormulaLibrary = FormulaLibrary;
