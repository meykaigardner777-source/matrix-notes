/* =========================================================
   MATRIX NOTES - AUTO-MIGRATION & CORE STORAGE MODULE
   ========================================================= */

const STORAGE_KEY = 'matrix_notes_v2';
const LEGACY_KEYS = ['matrix_notes', 'notes', 'matrix_notes_v1', 'matrixNotes'];

/**
 * Automatically inspects localStorage for older note formats/keys
 * and safely migrates them to the active storage key.
 */
function migrateLegacyNotes() {
    let currentNotes = [];
    
    // 1. Fetch current notes if any exist
    try {
        const rawCurrent = localStorage.getItem(STORAGE_KEY);
        if (rawCurrent) {
            currentNotes = JSON.parse(rawCurrent);
        }
    } catch (e) {
        console.error("Error reading current storage:", e);
    }

    let migratedCount = 0;
    const existingIds = new Set(currentNotes.map(n => n.id));

    // 2. Iterate through potential legacy storage keys
    LEGACY_KEYS.forEach(oldKey => {
        const rawLegacy = localStorage.getItem(oldKey);
        if (rawLegacy) {
            try {
                const legacyNotes = JSON.parse(rawLegacy);
                if (Array.isArray(legacyNotes)) {
                    legacyNotes.forEach(note => {
                        // Ensure note has basic structural properties
                        if (note && note.id && !existingIds.has(note.id)) {
                            // Normalize missing properties for backward compatibility
                            const normalizedNote = {
                                id: note.id,
                                title: note.title || 'Untitled Note',
                                content: note.content || note.text || '',
                                strokes: note.strokes || [], // Drawing/highlight paths
                                updatedAt: note.updatedAt || note.timestamp || Date.now()
                            };
                            
                            currentNotes.push(normalizedNote);
                            existingIds.add(note.id);
                            migratedCount++;
                        }
                    });
                }
            } catch (err) {
                console.warn(`Could not parse legacy notes from key "${oldKey}":`, err);
            }
        }
    });

    // 3. Save merged results back to active storage key
    if (migratedCount > 0 || !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentNotes));
        console.log(`Successfully migrated ${migratedCount} legacy note(s) to ${STORAGE_KEY}.`);
    }
}

// Run migration immediately on script initialization
migrateLegacyNotes();

/**
 * Load all notes from localStorage
 */
function loadNotes() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("Failed to load notes from localStorage:", e);
        return [];
    }
}

/**
 * Save all notes to localStorage
 */
function saveNotes(notesArray) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notesArray));
    } catch (e) {
        console.error("Failed to save notes to localStorage:", e);
    }
}
