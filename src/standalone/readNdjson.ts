/** Streaming UTF-8 may split anywhere, including inside a Chinese character. */
export async function readNdjson(response: Response, receive: (event: any) => void) {
    if (!response.body) throw new Error("Streaming response has no body");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            if (pending.length > 8 * 1024 * 1024) throw new Error("Streaming record exceeds size limit");
            let newline: number;
            while ((newline = pending.indexOf("\n")) >= 0) {
                const line = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
                if (line) receive(JSON.parse(line));
            }
            if (done) break;
        }
        if (pending.trim()) receive(JSON.parse(pending));
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
