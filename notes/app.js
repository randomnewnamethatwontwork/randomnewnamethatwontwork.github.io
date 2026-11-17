
/* =========================================================
   DAILY LOG
   Main application logic
   ========================================================= */

(() => {

    "use strict";


    // -----------------------------------------------------
    // CONFIGURATION
    // -----------------------------------------------------

    const AUTOSAVE_DELAY = 400;
    const EARLIER_DAYS = 30;

    const $ = id => document.getElementById(id);


    // -----------------------------------------------------
    // APPLICATION STATE
    // -----------------------------------------------------

    const state = {

        selectedDate: null,

        entries: [],

        hideBlankDays: false,

        searchQuery: "",

        searchResults: [],

        searchMode: false,

        saveTimer: null,

        pendingSave: false,

        saveInProgress: false,

        dirty: false,

        saveError: false,

        originalNote: "",

        editorNote: "",

        timelineStart: null,

        loading: false,

        initialized: false,

        navigationLock: false

    };


    // -----------------------------------------------------
    // DOM ELEMENTS
    // -----------------------------------------------------

    const elements = {

        searchInput: $("searchInput"),
        clearSearchButton: $("clearSearchButton"),

        timeline: $("timeline"),
        hideBlankDays: $("hideBlankDays"),

        previousDateButton: $("previousDateButton"),
        nextDateButton: $("nextDateButton"),
        todayButton: $("todayButton"),
        dateJump: $("dateJump"),

        loadEarlierButton: $("loadEarlierButton"),
        searchStatus: $("searchStatus"),

        editorPanel: $("editorPanel"),
        editorTitle: $("editorTitle"),
        editorSubtitle: $("editorSubtitle"),

        entryText: $("entryText"),
        characterCount: $("characterCount"),

        saveStatus: $("saveStatus"),
        saveStatusText: $("saveStatusText"),

        deleteEntryButton: $("deleteEntryButton"),
        deleteConfirmation: $("deleteConfirmation"),
        confirmDeleteButton: $("confirmDeleteButton"),
        cancelDeleteButton: $("cancelDeleteButton"),

        exportButton: $("exportButton"),
        importButton: $("importButton"),
        importFile: $("importFile")

    };


    // -----------------------------------------------------
    // DATE UTILITIES
    // -----------------------------------------------------

    function localDateString(date = new Date()) {

        const year = date.getFullYear();

        const month = String(
            date.getMonth() + 1
        ).padStart(2, "0");

        const day = String(
            date.getDate()
        ).padStart(2, "0");

        return `${year}-${month}-${day}`;

    }


    function parseLocalDate(dateString) {

        const [year, month, day] = dateString
            .split("-")
            .map(Number);

        return new Date(year, month - 1, day);

    }


    function addDays(dateString, amount) {

        const date = parseLocalDate(dateString);

        date.setDate(date.getDate() + amount);

        return localDateString(date);

    }


    function formatDate(dateString, options = {}) {

        const date = parseLocalDate(dateString);

        return date.toLocaleDateString(
            undefined,
            {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                ...options
            }
        );

    }



    function formatShortDate(dateString) {

        const date = parseLocalDate(dateString);

        return date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short"
        }) + ", " + date.toLocaleDateString("en-GB", {
            weekday: "short"
        });

    }



    function today() {

        return localDateString();

    }


    // -----------------------------------------------------
    // ENTRY LOOKUP
    // -----------------------------------------------------

    function findEntry(date) {

        return state.entries.find(
            entry => entry.date === date
        ) || null;

    }


    // -----------------------------------------------------
    // SAVE STATUS
    // -----------------------------------------------------

    function setSaveStatus(status, message) {

        elements.saveStatus.className =
            `save-status ${status}`;

        elements.saveStatusText.textContent = message;

    }


    // -----------------------------------------------------
    // CHARACTER COUNTER
    // -----------------------------------------------------

    function updateCharacterCount() {

        const count = elements.entryText.value.length;

        elements.characterCount.textContent =
            `${count.toLocaleString()} character${count === 1 ? "" : "s"}`;

    }


    // -----------------------------------------------------
    // EDITOR REFRESH
    // -----------------------------------------------------

    function updateEditor() {

        if (!state.selectedDate) {
            return;
        }

        const entry = findEntry(state.selectedDate);

        state.originalNote = entry ? entry.note : "";

        state.editorNote = state.originalNote;

        state.dirty = false;
        state.pendingSave = false;
        state.saveError = false;

        elements.editorTitle.textContent =
            formatDate(state.selectedDate);

        elements.editorSubtitle.textContent = entry
            ? `Last modified: ${new Date(entry.modified).toLocaleString()}`
            : "No entry for this day yet.";

        elements.entryText.value = state.originalNote;

        elements.entryText.disabled = false;

        elements.deleteEntryButton.disabled = !entry;

        elements.deleteConfirmation.hidden = true;

        elements.dateJump.value = state.selectedDate;

        updateCharacterCount();

        setSaveStatus("saved", "Saved");

    }


    // -----------------------------------------------------
    // REFRESH DATABASE ENTRIES
    // -----------------------------------------------------

    async function refreshEntries() {

        state.entries = await DailyLogDB.getAllEntries();

        state.entries.sort((a, b) =>
            b.date.localeCompare(a.date)
        );

    }


    // -----------------------------------------------------
    // TIMELINE START DATE
    // -----------------------------------------------------

    function calculateTimelineStart() {

        const currentDate = today();

        if (state.entries.length === 0) {

            return currentDate;

        }

        const earliestDate = state.entries.reduce(
            (earliest, entry) =>
                entry.date < earliest ? entry.date : earliest,
            currentDate
        );

        return earliestDate;

    }


    // -----------------------------------------------------
    // CREATE TIMELINE ITEM
    // -----------------------------------------------------

    function createTimelineItem(date, entry, searchWords = []) {

        const item = document.createElement("div");

        item.className = "timeline-item";

        item.dataset.date = date;

        item.tabIndex = 0;

        item.setAttribute("role", "button");

        item.setAttribute(
            "aria-label",
            `${formatDate(date)}${entry ? ", has an entry" : ", no entry"}`
        );


        if (date === state.selectedDate) {

            item.classList.add("selected");

            item.setAttribute("aria-current", "date");

        }


        // DATE HEADER

        const dateHeader = document.createElement("div");

        dateHeader.className = "timeline-date";

        const dateText = document.createElement("strong");

        dateText.textContent = formatShortDate(date);

        dateHeader.appendChild(dateText);


        if (date === today()) {

            const todayLabel = document.createElement("span");

            todayLabel.className = "today-label";

            todayLabel.textContent = "Today";

            dateHeader.appendChild(todayLabel);

        }

        item.appendChild(dateHeader);


        // ENTRY CONTENT

        const note = document.createElement("div");

        note.className = "timeline-note";


        if (entry) {

            appendHighlightedText(
                note,
                entry.note,
                searchWords
            );

        } else {

            note.classList.add("no-entry");

            note.textContent = "No entry";

        }

        item.appendChild(note);


        // CLICK AND KEYBOARD NAVIGATION

        item.addEventListener("click", () => {

            selectDate(date);

        });

        item.addEventListener("keydown", event => {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();

                selectDate(date);

            }

        });


        return item;

    }


    // -----------------------------------------------------
    // SAFE SEARCH HIGHLIGHTING
    // -----------------------------------------------------

    function appendHighlightedText(container, text, words) {

        if (!words.length) {

            container.textContent = text;

            return;

        }

        const escapedWords = words.map(word =>
            word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        );

        const expression = new RegExp(
            `(${escapedWords.join("|")})`,
            "gi"
        );

        const fragments = text.split(expression);

        for (const fragment of fragments) {

            if (!fragment) {
                continue;
            }

            const matches = words.some(word =>
                fragment.toLocaleLowerCase() ===
                word.toLocaleLowerCase()
            );

            if (matches) {

                const mark = document.createElement("mark");

                mark.textContent = fragment;

                container.appendChild(mark);

            } else {

                container.appendChild(
                    document.createTextNode(fragment)
                );

            }

        }

    }


    // -----------------------------------------------------
    // RENDER NORMAL TIMELINE
    // -----------------------------------------------------

    function renderTimeline() {

        state.searchMode = false;

        elements.timeline.replaceChildren();

        elements.searchStatus.textContent = "";

        const currentDate = today();

        const startDate = state.timelineStart ||
            calculateTimelineStart();

        let displayed = 0;

        let date = currentDate;


        while (date >= startDate) {

            const entry = findEntry(date);

            if (!state.hideBlankDays || entry) {

                elements.timeline.appendChild(
                    createTimelineItem(date, entry)
                );

                displayed++;

            }

            date = addDays(date, -1);

        }


        if (displayed === 0) {

            showEmptyMessage(
                "No entries yet",
                "Your daily notes will appear here."
            );

        }

        elements.loadEarlierButton.hidden = false;

    }


    // -----------------------------------------------------
    // EMPTY MESSAGE
    // -----------------------------------------------------

    function showEmptyMessage(title, message) {

        const wrapper = document.createElement("div");

        wrapper.className = "empty-message";

        const heading = document.createElement("strong");

        heading.textContent = title;

        const description = document.createElement("span");

        description.textContent = message;

        wrapper.appendChild(heading);

        wrapper.appendChild(description);

        elements.timeline.appendChild(wrapper);

    }


    // -----------------------------------------------------
    // SEARCH
    // -----------------------------------------------------

    function performSearch() {

        const query = elements.searchInput.value.trim();

        state.searchQuery = query;

        if (!query) {

            state.searchMode = false;

            renderTimeline();

            return;

        }


        state.searchMode = true;

        const words = query
            .toLocaleLowerCase()
            .split(/\s+/)
            .filter(Boolean);


        // Every search word must occur somewhere in the note.

        state.searchResults = state.entries.filter(entry => {

            const note = entry.note.toLocaleLowerCase();

            return words.every(word =>
                note.includes(word)
            );

        });


        renderSearchResults(words);

    }


    // -----------------------------------------------------
    // RENDER SEARCH RESULTS
    // -----------------------------------------------------

    function renderSearchResults(words) {

        elements.timeline.replaceChildren();

        elements.searchStatus.textContent =
            `${state.searchResults.length} matching entr${state.searchResults.length === 1 ? "y" : "ies"}`;


        elements.loadEarlierButton.hidden = true;


        if (state.searchResults.length === 0) {

            showEmptyMessage(
                "No matching notes",
                "Try different search words."
            );

            return;

        }


        for (const entry of state.searchResults) {

            elements.timeline.appendChild(
                createTimelineItem(
                    entry.date,
                    entry,
                    words
                )
            );

        }

    }


    // -----------------------------------------------------
    // SELECT DATE
    // -----------------------------------------------------

    async function selectDate(date) {

        if (!DailyLogDB.validateDate(date)) {
            return;
        }

        if (state.navigationLock) {
            return;
        }

        if (date === state.selectedDate) {
            return;
        }


        state.navigationLock = true;

        try {

            // Finish pending edits before switching dates.

            if (state.dirty || state.saveInProgress) {

                const saved = await flushPendingSave();

                if (!saved) {

                    return;

                }

            }


            state.selectedDate = date;

            updateEditor();

            if (state.searchMode) {

                renderSearchResults(
                    state.searchQuery
                        .toLocaleLowerCase()
                        .split(/\s+/)
                        .filter(Boolean)
                );

            } else {

                renderTimeline();

            }

            elements.editorPanel.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });

        } catch (error) {

            console.error("Date selection failed:", error);

        } finally {

            state.navigationLock = false;

        }

    }


    // -----------------------------------------------------
    // SCHEDULE AUTOSAVE
    // -----------------------------------------------------

    function scheduleSave() {

        if (!state.selectedDate) {
            return;
        }

        state.editorNote = elements.entryText.value;

        state.dirty =
            state.editorNote !== state.originalNote;

        state.pendingSave = state.dirty;


        if (!state.dirty) {

            clearTimeout(state.saveTimer);

            state.pendingSave = false;

            setSaveStatus("saved", "Saved");

            return;

        }


        clearTimeout(state.saveTimer);

        setSaveStatus("typing", "Typing...");

        state.saveTimer = setTimeout(() => {

            saveCurrentEntry();

        }, AUTOSAVE_DELAY);

    }


    // -----------------------------------------------------
    // SAVE CURRENT ENTRY
    // -----------------------------------------------------

    async function saveCurrentEntry() {

        clearTimeout(state.saveTimer);

        state.saveTimer = null;


        if (!state.selectedDate || !state.dirty) {

            state.pendingSave = false;

            return true;

        }


        if (state.saveInProgress) {

            return state.saveInProgressPromise;

        }


        const date = state.selectedDate;

        const note = state.editorNote;

        state.pendingSave = true;

        state.saveInProgress = true;

        setSaveStatus("saving", "Saving...");


        const savePromise = (async () => {

            try {

                const result = await DailyLogDB.saveEntry(
                    date,
                    note
                );


                await refreshEntries();


                // Only clear dirty state if the editor
                // still contains the version just saved.

                if (
                    state.selectedDate === date &&
                    elements.entryText.value === note
                ) {

                    state.originalNote = note;

                    state.dirty = false;

                    state.pendingSave = false;

                    state.saveError = false;

                    elements.deleteEntryButton.disabled =
                        result.entry === null;

                    setSaveStatus("saved", "Saved");

                    if (result.entry) {

                        elements.editorSubtitle.textContent =
                            `Last modified: ${new Date(result.entry.modified).toLocaleString()}`;

                    } else {

                        elements.editorSubtitle.textContent =
                            "No entry for this day yet.";

                    }

                    updateCharacterCount();

                }


                if (state.searchMode) {

                    performSearch();

                } else {

                    renderTimeline();

                }


                return true;

            } catch (error) {

                console.error("Autosave failed:", error);

                state.saveError = true;

                state.pendingSave = true;

                setSaveStatus("error", "Save failed");

                return false;

            } finally {

                state.saveInProgress = false;

                state.saveInProgressPromise = null;

                if (state.dirty && state.editorNote !== note) {

                    state.pendingSave = true;

                    clearTimeout(state.saveTimer);

                    state.saveTimer = setTimeout(() => {

                        saveCurrentEntry();

                    }, AUTOSAVE_DELAY);

                }

            }

        })();


        state.saveInProgressPromise = savePromise;

        return savePromise;

    }


    // -----------------------------------------------------
    // FLUSH PENDING SAVE
    // -----------------------------------------------------

    async function flushPendingSave() {

        clearTimeout(state.saveTimer);

        state.saveTimer = null;

        if (state.saveInProgress) {

            const result = await state.saveInProgressPromise;

            if (!result) {
                return false;
            }

        }


        if (state.dirty) {

            return await saveCurrentEntry();

        }

        return true;

    }


    // -----------------------------------------------------
    // EDITOR INPUT EVENT
    // -----------------------------------------------------

    elements.entryText.addEventListener("input", () => {

        updateCharacterCount();

        scheduleSave();

    });


    // -----------------------------------------------------
    // DATE NAVIGATION
    // -----------------------------------------------------

    elements.previousDateButton.addEventListener("click", () => {

        const baseDate = state.selectedDate || today();

        selectDate(addDays(baseDate, -1));

    });


    elements.nextDateButton.addEventListener("click", () => {

        const baseDate = state.selectedDate || today();

        selectDate(addDays(baseDate, 1));

    });


    elements.todayButton.addEventListener("click", () => {

        selectDate(today());

    });


    elements.dateJump.addEventListener("change", event => {

        if (event.target.value) {

            selectDate(event.target.value);

        }

    });


    // -----------------------------------------------------
    // HIDE BLANK DAYS
    // -----------------------------------------------------

    elements.hideBlankDays.addEventListener("change", event => {

        state.hideBlankDays = event.target.checked;

        renderTimeline();

    });


    // -----------------------------------------------------
    // LOAD EARLIER DATES
    // -----------------------------------------------------

    elements.loadEarlierButton.addEventListener("click", () => {

        const currentStart =
            state.timelineStart || calculateTimelineStart();

        state.timelineStart = addDays(
            currentStart,
            -EARLIER_DAYS
        );

        renderTimeline();

    });


    // -----------------------------------------------------
    // SEARCH EVENTS
    // -----------------------------------------------------

    elements.searchInput.addEventListener("input", () => {

        performSearch();

    });


    elements.clearSearchButton.addEventListener("click", () => {

        elements.searchInput.value = "";

        performSearch();

        elements.searchInput.focus();

    });


    // -----------------------------------------------------
    // DELETE ENTRY
    // -----------------------------------------------------

    elements.deleteEntryButton.addEventListener("click", () => {

        if (elements.deleteEntryButton.disabled) {
            return;
        }

        elements.deleteConfirmation.hidden = false;

    });


    elements.cancelDeleteButton.addEventListener("click", () => {

        elements.deleteConfirmation.hidden = true;

    });


    elements.confirmDeleteButton.addEventListener(
        "click",
        async () => {

            if (!state.selectedDate) {
                return;
            }

            const date = state.selectedDate;

            try {

                // Ensure pending changes are saved first.

                const saved = await flushPendingSave();

                if (!saved) {

                    alert(
                        "The pending changes could not be saved. " +
                        "Please try again before deleting."
                    );

                    return;

                }


                await DailyLogDB.deleteEntry(date);

                await refreshEntries();


                state.originalNote = "";

                state.editorNote = "";

                state.dirty = false;

                state.pendingSave = false;

                state.saveError = false;


                updateEditor();

                renderTimeline();

                elements.deleteConfirmation.hidden = true;

            } catch (error) {

                console.error("Delete failed:", error);

                alert(
                    "Unable to delete the entry. Please try again."
                );

            }

        }
    );


    // -----------------------------------------------------
    // JSON EXPORT
    // -----------------------------------------------------

    elements.exportButton.addEventListener(
        "click",
        async () => {

            try {

                // Ensure the latest edit is included.

                const saved = await flushPendingSave();

                if (!saved) {

                    alert(
                        "Please resolve the pending save before exporting."
                    );

                    return;

                }


                const backup =
                    await DailyLogDB.exportEntries();

                const json = JSON.stringify(
                    backup,
                    null,
                    2
                );


                const blob = new Blob(
                    [json],
                    {
                        type: "application/json"
                    }
                );

                const url = URL.createObjectURL(blob);

                const link = document.createElement("a");

                link.href = url;

                link.download =
                    `daily-log-${today()}.json`;

                document.body.appendChild(link);

                link.click();

                link.remove();

                URL.revokeObjectURL(url);


            } catch (error) {

                console.error("Export failed:", error);

                alert(
                    "Unable to export your entries. Please try again."
                );

            }

        }
    );


    // -----------------------------------------------------
    // JSON IMPORT BUTTON
    // -----------------------------------------------------

    elements.importButton.addEventListener("click", () => {

        elements.importFile.click();

    });


    // -----------------------------------------------------
    // JSON IMPORT PROCESSING
    // -----------------------------------------------------

    elements.importFile.addEventListener(
        "change",
        async event => {

            const file = event.target.files[0];

            if (!file) {
                return;
            }


            try {

                const saved = await flushPendingSave();

                if (!saved) {

                    alert(
                        "Please resolve the pending save before importing."
                    );

                    return;

                }


                const fileText = await file.text();

                const data = JSON.parse(fileText);


                // Check overall format before importing.

                if (
                    !data ||
                    typeof data !== "object" ||
                    data.format !== "daily-log" ||
                    data.version !== 1 ||
                    !Array.isArray(data.entries)
                ) {

                    throw new Error(
                        "This is not a recognised Daily Log backup."
                    );

                }


                const confirmation = confirm(

                    `Import ${data.entries.length} records?\n\n` +

                    "Existing local entries will not be overwritten."

                );


                if (!confirmation) {
                    return;
                }


                const result =
                    await DailyLogDB.importEntries(data);


                await refreshEntries();


                // Refresh the current editor if its date
                // was newly imported.

                updateEditor();


                if (state.searchMode) {

                    performSearch();

                } else {

                    state.timelineStart =
                        calculateTimelineStart();

                    renderTimeline();

                }


                alert(

                    "Import completed.\n\n" +

                    `Added: ${result.added}\n` +

                    `Skipped: ${result.skipped}\n` +

                    `Invalid: ${result.invalid}\n\n` +

                    "Existing entries were preserved."

                );


            } catch (error) {

                console.error("Import failed:", error);

                alert(
                    `Import failed:\n\n${error.message}`
                );

            } finally {

                // Allow the same file to be selected again.

                elements.importFile.value = "";

            }

        }
    );


    // -----------------------------------------------------
    // PREVENT ACCIDENTAL PAGE CLOSURE
    // -----------------------------------------------------

    window.addEventListener("beforeunload", event => {

        if (
            state.dirty ||
            state.pendingSave ||
            state.saveInProgress
        ) {

            event.preventDefault();

            event.returnValue = "";

        }

    });


    // -----------------------------------------------------
    // SERVICE WORKER REGISTRATION
    // -----------------------------------------------------

    async function registerServiceWorker() {

        if (!("serviceWorker" in navigator)) {
            return;
        }

        try {

            await navigator.serviceWorker.register("sw.js");

            console.log("Daily Log service worker registered.");

        } catch (error) {

            console.warn(
                "Service worker registration failed:",
                error
            );

        }

    }


    // -----------------------------------------------------
    // APPLICATION INITIALISATION
    // -----------------------------------------------------

    async function initializeApplication() {

        if (state.initialized) {
            return;
        }

        state.loading = true;

        try {

            setSaveStatus("saving", "Loading...");


            // Open database.

            await DailyLogDB.init();


            // Retrieve stored entries.

            await refreshEntries();


            // Establish initial timeline.

            state.timelineStart =
                calculateTimelineStart();


            // Select today initially.

            state.selectedDate = today();


            // Populate editor.

            updateEditor();


            // Render timeline.

            renderTimeline();


            // Set initial date picker.

            elements.dateJump.value = today();


            // Register offline support.

            await registerServiceWorker();


            state.initialized = true;

            console.log("Daily Log initialized successfully.");

        } catch (error) {

            console.error(
                "Daily Log initialization failed:",
                error
            );

            elements.timeline.replaceChildren();

            showEmptyMessage(
                "Application error",
                "Unable to load your local database. Check browser support and permissions."
            );

            setSaveStatus("error", "Initialization failed");

        } finally {

            state.loading = false;

        }

    }


    // -----------------------------------------------------
    // START APPLICATION
    // -----------------------------------------------------

    initializeApplication();

})();
