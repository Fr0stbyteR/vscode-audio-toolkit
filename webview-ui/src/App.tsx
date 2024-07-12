import { vscode } from "./utilities/vscode";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { useEffect, useState } from "react";
import "./App.css";


function handleHowdyClick() {
    vscode.postMessage({
        type: "hello",
        text: "Hey there partner! 🤠",
    });
}

function App() {
    const [fileSize, setFileSize] = useState<null | number>(null);
    useEffect(() => {
        window.addEventListener("message", (e) => {
            const { type, body, requestId } = e.data;
            switch (type) {
                case "init":
                    {
                        const data: Uint8Array = body.value;
                        setFileSize(data.length);
                    }
                case "update":
                    {
                        return;
                    }
                case "getFileData":
                    {
                        return;
                    }
            }
        });
        vscode.postMessage({ type: "ready" });
    }, []);
    return (
        <main>
            <h1>Hello World!</h1>
            <VSCodeButton onClick={handleHowdyClick}>Howdy!</VSCodeButton>
            {fileSize ? <span>File Size1: {fileSize}</span> : null}
        </main>
    );
}

export default App;
