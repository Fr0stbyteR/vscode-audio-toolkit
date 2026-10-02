import { ReactNode } from "react";
import "./ModuleEmptyState.scss";
export default function ModuleEmptyState({ message, children }: { message?: ReactNode; children: ReactNode }) {
    return <div className="module-empty-state"><div className="module-empty-content">
        {message && <div className="module-empty-message">{message}</div>}
        <div className="module-empty-actions" onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>{children}</div>
    </div></div>;
}
