const DATABASE_NAME = "audio-toolkit-browser-workspace";
const STORE_NAME = "handles";
const ROOT_DIRECTORY_KEY = "root-directory";
// Keep the v2 store for existing browser databases; deferring the review UI
// must not make saved local records inaccessible or delete them.
const ANNOTATION_STORE = "annotation-documents";

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 2);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
            if (!request.result.objectStoreNames.contains(ANNOTATION_STORE)) request.result.createObjectStore(ANNOTATION_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveRootDirectory(handle: FileSystemDirectoryHandle) {
    const database = await openDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put(handle, ROOT_DIRECTORY_KEY);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } finally {
        database.close();
    }
}

export async function loadRootDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
    const database = await openDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(ROOT_DIRECTORY_KEY);
            request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
            request.onerror = () => reject(request.error);
        });
    } finally {
        database.close();
    }
}
