import { forwardRef, FunctionComponent, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { LocalAudioEntry } from "./types";
import { loadRootDirectory, saveRootDirectory } from "./PersistentStorage";
import { useLocale } from "../i18n/LocaleContext";
import CollapsiblePanel from "../components/CollapsiblePanel";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

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
    queryPermission(options?: { mode: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission(options?: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

interface Props {
    activeId?: string;
    onOpen(entry: LocalAudioEntry): void;
}

export interface FileExplorerHandle { openFolder(): void; }

async function listDirectory(handle: FileSystemDirectoryHandle, parentPath: string): Promise<BrowserNode[]> {
    const nodes: BrowserNode[] = [];
    for await (const [name, child] of (handle as IterableDirectoryHandle).entries()) {
        if (name === ".audio_toolkit") continue;
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

const TreeNode: FunctionComponent<{ node: BrowserNode; rootHandle?: FileSystemDirectoryHandle; activeId?: string; onOpen(entry: LocalAudioEntry): void }> = ({ node, rootHandle, activeId, onOpen }) => {
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
            rootHandle,
            getFile: () => node.file ? Promise.resolve(node.file) : (node.handle as FileSystemFileHandle).getFile()
        });
    };
    return <li>
        <button className={`tree-row ${node.kind} ${activeId === node.id ? "active" : ""}`} onClick={() => void open()} title={node.path}>
            <span className={`tree-chevron codicon ${node.kind === "directory" ? `codicon-chevron-${expanded ? "down" : "right"}` : ""}`} />
            <span className={`tree-icon codicon ${node.kind === "directory" ? `codicon-folder${expanded ? "-opened" : ""}` : "codicon-file-media"}`} />
            <span className="tree-name">{node.name}</span>
        </button>
        {expanded && children && <ul>{children.map(child => <TreeNode key={child.id} node={child} rootHandle={rootHandle} activeId={activeId} onOpen={onOpen} />)}</ul>}
    </li>;
};

const FileExplorer = forwardRef<FileExplorerHandle, Props>(({ activeId, onOpen }, ref) => {
    const { t } = useLocale();
    const supportsDirectoryPicker = typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
    const [rootName, setRootName] = useState("");
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
        }).catch(reason => active && setError(`${t("Could not restore the previous folder:")} ${String(reason)}`)).finally(() => active && setRestoring(false));
        return () => { active = false; };
    }, [openHandle, supportsDirectoryPicker, t]);

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
            if (permission !== "granted") throw new Error(t("Folder permission was not granted."));
            await openHandle(savedHandle);
        } catch (reason) {
            if ((reason as DOMException).name !== "AbortError") setError(String(reason));
        }
    };

    useImperativeHandle(ref, () => ({ openFolder: () => void chooseFolder() }));

    return <CollapsiblePanel id="files" title="LOCAL LIBRARY" icon="folder" className="file-explorer" actions={<VSCodeButton appearance="icon" onClick={() => void chooseFolder()} title={t("Open a local folder")} aria-label={t("Open a local folder")}><span className="codicon codicon-folder-opened" aria-hidden="true" /></VSCodeButton>}>
        {rootName && <div className="file-root-name" title={rootName}>{rootName}</div>}
        <input
            ref={fallbackRef}
            className="hidden-input"
            type="file"
            multiple
            accept="audio/*,.aif,.aiff"
            {...({ webkitdirectory: "" } as object)}
            onChange={event => {
                const files = Array.from(event.currentTarget.files ?? []);
                setRootName(files[0]?.webkitRelativePath.split("/")[0] || "Selected files");
                setNodes(filesToNodes(files));
            }}
        />
        {error && <p className="error-text">{error}</p>}
        {nodes.length ? <ul className="file-tree">{nodes.map(node => <TreeNode key={node.id} node={node} rootHandle={supportsDirectoryPicker ? savedHandle : undefined} activeId={activeId} onOpen={onOpen} />)}</ul> : <div className="empty-tree">
            {restoring ? <small role="status">{t("Restoring the previous folder…")}</small> : savedHandle ? <>
                <button className="button-with-icon" onClick={() => void reconnectFolder()}><span className="codicon codicon-folder-opened" aria-hidden="true" />{t("Reconnect")} {savedHandle.name}</button>
                <button className="secondary button-with-icon" onClick={() => void chooseFolder()}><span className="codicon codicon-folder-opened" aria-hidden="true" />{t("Choose another folder")}</button>
            </> : null}
        </div>}
    </CollapsiblePanel>;
});

FileExplorer.displayName = "FileExplorer";

export default FileExplorer;
