import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import { LocalAudioEntry } from "./types";
import { loadRootDirectory, saveRootDirectory } from "./PersistentStorage";

const AUDIO_EXTENSIONS = /\.(aac|aif|aiff|flac|m4a|mp3|ogg|opus|wav|webm)$/i;

interface BrowserNode {
    id: string;
    name: string;
    path: string;
    kind: "file" | "directory";
    handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
    file?: File;
}

interface DirectoryPickerWindow extends Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
}

interface PermissionedDirectoryHandle extends FileSystemDirectoryHandle {
    queryPermission(options?: { mode: "read" }): Promise<PermissionState>;
    requestPermission(options?: { mode: "read" }): Promise<PermissionState>;
}

interface Props {
    activeId?: string;
    onOpen(entry: LocalAudioEntry): void;
}

async function listDirectory(handle: FileSystemDirectoryHandle, parentPath: string): Promise<BrowserNode[]> {
    const nodes: BrowserNode[] = [];
    for await (const [name, child] of (handle as IterableDirectoryHandle).entries()) {
        if (child.kind === "file" && !AUDIO_EXTENSIONS.test(name)) continue;
        const path = parentPath ? `${parentPath}/${name}` : name;
        nodes.push({ id: path, name, path, kind: child.kind, handle: child });
    }
    return nodes.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1);
}

function filesToNodes(files: File[]): BrowserNode[] {
    return files.filter(file => AUDIO_EXTENSIONS.test(file.name)).map(file => {
        const path = file.webkitRelativePath || file.name;
        return { id: path, name: file.name, path, kind: "file" as const, file };
    }).sort((a, b) => a.path.localeCompare(b.path));
}

const TreeNode: FunctionComponent<{ node: BrowserNode; activeId?: string; onOpen(entry: LocalAudioEntry): void }> = ({ node, activeId, onOpen }) => {
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<BrowserNode[] | null>(null);
    const open = async () => {
        if (node.kind === "directory") {
            if (!children) setChildren(await listDirectory(node.handle as FileSystemDirectoryHandle, node.path));
            setExpanded(value => !value);
            return;
        }
        onOpen({
            id: node.id,
            name: node.name,
            path: node.path,
            getFile: () => node.file ? Promise.resolve(node.file) : (node.handle as FileSystemFileHandle).getFile()
        });
    };
    return <li>
        <button className={`tree-row ${node.kind} ${activeId === node.id ? "active" : ""}`} onClick={() => void open()} title={node.path}>
            <span className={`tree-chevron codicon ${node.kind === "directory" ? `codicon-chevron-${expanded ? "down" : "right"}` : ""}`} />
            <span className={`tree-icon codicon ${node.kind === "directory" ? `codicon-folder${expanded ? "-opened" : ""}` : "codicon-file-media"}`} />
            <span className="tree-name">{node.name}</span>
        </button>
        {expanded && children && <ul>{children.map(child => <TreeNode key={child.id} node={child} activeId={activeId} onOpen={onOpen} />)}</ul>}
    </li>;
};

const FileExplorer: FunctionComponent<Props> = ({ activeId, onOpen }) => {
    const supportsDirectoryPicker = typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
    const [rootName, setRootName] = useState("No folder open");
    const [nodes, setNodes] = useState<BrowserNode[]>([]);
    const [error, setError] = useState("");
    const [savedHandle, setSavedHandle] = useState<FileSystemDirectoryHandle>();
    const [restoring, setRestoring] = useState(supportsDirectoryPicker);
    const fallbackRef = useRef<HTMLInputElement>(null);

    const openHandle = useCallback(async (handle: FileSystemDirectoryHandle) => {
        setRootName(handle.name);
        setNodes(await listDirectory(handle, ""));
        setSavedHandle(handle);
    }, []);

    useEffect(() => {
        if (!supportsDirectoryPicker) return;
        let active = true;
        loadRootDirectory().then(async handle => {
            if (!active || !handle) return;
            setSavedHandle(handle);
            setRootName(handle.name);
            const permission = await (handle as PermissionedDirectoryHandle).queryPermission({ mode: "read" });
            if (active && permission === "granted") await openHandle(handle);
        }).catch(reason => active && setError(`无法恢复上次的文件夹：${String(reason)}`)).finally(() => active && setRestoring(false));
        return () => { active = false; };
    }, [openHandle, supportsDirectoryPicker]);

    const chooseFolder = async () => {
        setError("");
        if (!supportsDirectoryPicker) {
            fallbackRef.current?.click();
            return;
        }
        try {
            const handle = await (window as DirectoryPickerWindow).showDirectoryPicker!();
            await saveRootDirectory(handle);
            await openHandle(handle);
        } catch (reason) {
            if ((reason as DOMException).name !== "AbortError") setError(String(reason));
        }
    };

    const reconnectFolder = async () => {
        if (!savedHandle) return;
        setError("");
        try {
            const permission = await (savedHandle as PermissionedDirectoryHandle).requestPermission({ mode: "read" });
            if (permission !== "granted") throw new Error("Folder permission was not granted.");
            await openHandle(savedHandle);
        } catch (reason) {
            if ((reason as DOMException).name !== "AbortError") setError(String(reason));
        }
    };

    return <aside className="file-explorer">
        <div className="panel-heading">
            <div><span className="eyebrow">LOCAL LIBRARY</span><strong>{rootName}</strong></div>
            <button className="icon-button" onClick={() => void chooseFolder()} title="Open a local folder">+</button>
        </div>
        <input
            ref={fallbackRef}
            className="hidden-input"
            type="file"
            multiple
            accept="audio/*"
            {...({ webkitdirectory: "" } as object)}
            onChange={event => {
                const files = Array.from(event.currentTarget.files ?? []);
                setRootName(files[0]?.webkitRelativePath.split("/")[0] || "Selected files");
                setNodes(filesToNodes(files));
            }}
        />
        {!supportsDirectoryPicker && <p className="browser-note">当前浏览器使用目录上传兼容模式。Chrome / Edge 可提供按需读取。</p>}
        {error && <p className="error-text">{error}</p>}
        {nodes.length ? <ul className="file-tree">{nodes.map(node => <TreeNode key={node.id} node={node} activeId={activeId} onOpen={onOpen} />)}</ul> : <div className="empty-tree">
            <span>Drop into your sound library</span>
            {restoring ? <small>Restoring the previous folder…</small> : savedHandle ? <button onClick={() => void reconnectFolder()}>Reconnect {savedHandle.name}</button> : <button onClick={() => void chooseFolder()}>Open local folder</button>}
            {savedHandle ? <button className="secondary" onClick={() => void chooseFolder()}>Choose another folder</button> : null}
            <small>Files remain local until you request an analysis.</small>
        </div>}
    </aside>;
};

export default FileExplorer;
