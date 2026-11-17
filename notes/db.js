
/* =========================================================
   DAILY LOG
   IndexedDB database module
   ========================================================= */

const DailyLogDB = (() => {

    "use strict";

    // -----------------------------------------------------
    // DATABASE CONFIGURATION
    // -----------------------------------------------------

    const DB_NAME = "daily-log-local";
    const DB_VERSION = 1;
    const STORE_NAME = "entries";

    let database = null;


    // -----------------------------------------------------
    // DATE HELPERS
    // -----------------------------------------------------

    function validateDate(date) {

        if (typeof date !== "string") {
            return false;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return false;
        }

        const parts = date.split("-").map(Number);

        const year = parts[0];
        const month = parts[1];
        const day = parts[2];

        const parsed = new Date(
            Date.UTC(year, month - 1, day)
        );

        return (
            parsed.getUTCFullYear() === year &&
            parsed.getUTCMonth() === month - 1 &&
            parsed.getUTCDate() === day
        );
    }


    function dateToId(date) {

        return date.replace(/-/g, "");

    }


    // -----------------------------------------------------
    // ENTRY VALIDATION
    // -----------------------------------------------------

    function validateEntry(entry) {

        if (
            !entry ||
            typeof entry !== "object" ||
            Array.isArray(entry)
        ) {
            return false;
        }

        if (!validateDate(entry.date)) {
            return false;
        }

        if (entry.id !== dateToId(entry.date)) {
            return false;
        }

        if (typeof entry.note !== "string") {
            return false;
        }

        if (
            !Number.isSafeInteger(entry.created) ||
            !Number.isSafeInteger(entry.modified)
        ) {
            return false;
        }

        if (
            entry.created <= 0 ||
            entry.modified < entry.created
        ) {
            return false;
        }

        if (
            !Array.isArray(entry.history) ||
            entry.history.length === 0
        ) {
            return false;
        }

        if (
            !entry.history.every(timestamp =>
                Number.isSafeInteger(timestamp) &&
                timestamp > 0
            )
        ) {
            return false;
        }

        if (
            entry.history[0] !== entry.created ||
            entry.history[entry.history.length - 1] !== entry.modified
        ) {
            return false;
        }

        for (let i = 1; i < entry.history.length; i++) {

            if (entry.history[i] < entry.history[i - 1]) {
                return false;
            }

        }

        return true;

    }


    // -----------------------------------------------------
    // DATABASE INITIALISATION
    // -----------------------------------------------------

    function init() {

        return new Promise((resolve, reject) => {

            if (!("indexedDB" in window)) {

                reject(
                    new Error(
                        "IndexedDB is not supported by this browser."
                    )
                );

                return;

            }

            if (database) {

                resolve(database);
                return;

            }

            const request = indexedDB.open(
                DB_NAME,
                DB_VERSION
            );


            request.onupgradeneeded = event => {

                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {

                    db.createObjectStore(STORE_NAME, {
                        keyPath: "id"
                    });

                }

            };


            request.onsuccess = event => {

                database = event.target.result;

                database.onversionchange = () => {

                    database.close();
                    database = null;

                };

                resolve(database);

            };


            request.onerror = () => {

                reject(
                    request.error ||
                    new Error("Unable to open the database.")
                );

            };


            request.onblocked = () => {

                console.warn(
                    "Database upgrade blocked by another open tab."
                );

            };

        });

    }


    // -----------------------------------------------------
    // INTERNAL DATABASE CHECK
    // -----------------------------------------------------

    function getDatabase() {

        if (!database) {

            throw new Error(
                "Database has not been initialised. Call init() first."
            );

        }

        return database;

    }


    // -----------------------------------------------------
    // GET ENTRY BY DATE
    // -----------------------------------------------------

    function getEntry(date) {

        return new Promise((resolve, reject) => {

            if (!validateDate(date)) {

                reject(new Error("Invalid date."));
                return;

            }

            const db = getDatabase();

            const transaction = db.transaction(
                STORE_NAME,
                "readonly"
            );

            const store = transaction.objectStore(STORE_NAME);

            const request = store.get(dateToId(date));

            request.onsuccess = () => {

                resolve(request.result || null);

            };

            request.onerror = () => {

                reject(request.error);

            };

        });

    }


    // -----------------------------------------------------
    // GET ALL ENTRIES
    // -----------------------------------------------------

    function getAllEntries() {

        return new Promise((resolve, reject) => {

            const db = getDatabase();

            const transaction = db.transaction(
                STORE_NAME,
                "readonly"
            );

            const store = transaction.objectStore(STORE_NAME);

            const request = store.getAll();

            request.onsuccess = () => {

                const entries = request.result || [];

                entries.sort((a, b) => {

                    return b.date.localeCompare(a.date);

                });

                resolve(entries);

            };

            request.onerror = () => {

                reject(request.error);

            };

        });

    }


    // -----------------------------------------------------
    // SAVE OR UPDATE ENTRY
    // -----------------------------------------------------

    function saveEntry(date, note) {

        return new Promise((resolve, reject) => {

            if (!validateDate(date)) {

                reject(new Error("Invalid entry date."));
                return;

            }

            if (typeof note !== "string") {

                reject(new Error("Note must be plain text."));
                return;

            }

            const db = getDatabase();

            const id = dateToId(date);

            const transaction = db.transaction(
                STORE_NAME,
                "readwrite"
            );

            const store = transaction.objectStore(STORE_NAME);

            const request = store.get(id);

            let result = null;


            request.onsuccess = () => {

                const existing = request.result;

                // -----------------------------------------
                // EXISTING ENTRY
                // -----------------------------------------

                if (existing) {

                    // No actual change: preserve timestamps.

                    if (existing.note === note) {

                        result = {
                            status: "unchanged",
                            entry: existing
                        };

                        return;

                    }

                    const timestamp = Math.max(
                        Date.now(),
                        existing.modified
                    );

                    const updatedEntry = {

                        id: existing.id,

                        date: existing.date,

                        note: note,

                        created: existing.created,

                        modified: timestamp,

                        history: [
                            ...existing.history,
                            timestamp
                        ]

                    };

                    store.put(updatedEntry);

                    result = {
                        status: "updated",
                        entry: updatedEntry
                    };

                    return;

                }


                // -----------------------------------------
                // NEW ENTRY
                // -----------------------------------------

                // Do not create an empty record when a user
                // opens a date but never writes anything.

                if (note.length === 0) {

                    result = {
                        status: "empty",
                        entry: null
                    };

                    return;

                }

                const timestamp = Date.now();

                const newEntry = {

                    id: id,

                    date: date,

                    note: note,

                    created: timestamp,

                    modified: timestamp,

                    history: [
                        timestamp
                    ]

                };

                store.add(newEntry);

                result = {
                    status: "created",
                    entry: newEntry
                };

            };


            request.onerror = () => {

                transaction.abort();

            };


            transaction.oncomplete = () => {

                resolve(result);

            };


            transaction.onerror = () => {

                reject(
                    transaction.error ||
                    new Error("Unable to save entry.")
                );

            };


            transaction.onabort = () => {

                reject(
                    transaction.error ||
                    new Error("Entry save was cancelled.")
                );

            };

        });

    }


    // -----------------------------------------------------
    // DELETE ENTRY
    // -----------------------------------------------------

    function deleteEntry(date) {

        return new Promise((resolve, reject) => {

            if (!validateDate(date)) {

                reject(new Error("Invalid date."));
                return;

            }

            const db = getDatabase();

            const transaction = db.transaction(
                STORE_NAME,
                "readwrite"
            );

            const store = transaction.objectStore(STORE_NAME);

            const request = store.delete(dateToId(date));

            request.onsuccess = () => {

                // Actual transaction completion is awaited below.

            };

            transaction.oncomplete = () => {

                resolve(true);

            };

            transaction.onerror = () => {

                reject(
                    transaction.error ||
                    new Error("Unable to delete entry.")
                );

            };

            transaction.onabort = () => {

                reject(
                    transaction.error ||
                    new Error("Entry deletion was cancelled.")
                );

            };

        });

    }


    // -----------------------------------------------------
    // EXPORT DATA
    // -----------------------------------------------------

    async function exportEntries() {

        const entries = await getAllEntries();

        return {

            format: "daily-log",

            version: 1,

            exportedAt: Date.now(),

            entries: entries

        };

    }


    // -----------------------------------------------------
    // VALIDATE IMPORT FILE
    // -----------------------------------------------------

    function validateImportData(data) {

        if (!data || typeof data !== "object") {

            throw new Error("Invalid import file.");

        }

        if (Array.isArray(data)) {

            return data;

        }

        if (
            data.format !== "daily-log" ||
            data.version !== 1 ||
            !Array.isArray(data.entries)
        ) {

            throw new Error(
                "Unrecognised Daily Log backup format."
            );

        }

        return data.entries;

    }


    // -----------------------------------------------------
    // IMPORT ENTRIES
    // -----------------------------------------------------

    async function importEntries(data) {

        const entries = validateImportData(data);

        const validEntries = [];
        let invalid = 0;

        // Validate individual records before opening
        // the write transaction.

        for (const entry of entries) {

            if (validateEntry(entry)) {

                validEntries.push(entry);

            } else {

                invalid++;

            }

        }


        const db = getDatabase();

        return new Promise((resolve, reject) => {

            const transaction = db.transaction(
                STORE_NAME,
                "readwrite"
            );

            const store = transaction.objectStore(STORE_NAME);

            let added = 0;
            let skipped = invalid;

            let index = 0;


            // Add records sequentially inside one transaction.
            // Existing dates are never overwritten.

            function processNext() {

                if (index >= validEntries.length) {
                    return;
                }

                const entry = validEntries[index++];

                const request = store.get(entry.id);

                request.onsuccess = () => {

                    if (request.result) {

                        skipped++;

                    } else {

                        store.add(entry);
                        added++;

                    }

                    processNext();

                };

                request.onerror = () => {

                    transaction.abort();

                };

            }


            transaction.oncomplete = () => {

                resolve({

                    added: added,

                    skipped: skipped,

                    invalid: invalid,

                    total: entries.length

                });

            };


            transaction.onerror = () => {

                reject(
                    transaction.error ||
                    new Error("Import failed.")
                );

            };


            transaction.onabort = () => {

                reject(
                    transaction.error ||
                    new Error("Import was cancelled.")
                );

            };


            processNext();

        });

    }


    // -----------------------------------------------------
    // PUBLIC DATABASE API
    // -----------------------------------------------------

    return {

        init,

        getEntry,

        getAllEntries,

        saveEntry,

        deleteEntry,

        exportEntries,

        importEntries,

        validateDate,

        validateEntry

    };

})();
