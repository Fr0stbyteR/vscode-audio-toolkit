import { ReactNode, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";

export function PanelHeading({ title, icon, open, onToggle, actions }: { title: string; icon?: string; open: boolean; onToggle(): void; actions?: ReactNode }) {
    const { t } = useLocale();
    return <header className="workspace-panel-heading"><button type="button" className="workspace-panel-toggle" aria-expanded={open} onClick={onToggle}>
        <span aria-hidden="true" className={`codicon codicon-chevron-${open ? "down" : "right"}`} />
        {icon ? <span aria-hidden="true" className={`codicon codicon-${icon}`} /> : null}<strong>{t(title)}</strong>
    </button>{actions}</header>;
}

export default function CollapsiblePanel({ id, title, icon, children, actions, className = "" }: { id: string; title: string; icon?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
    const [open, setOpen] = useState(() => localStorage.getItem(`audioToolkit.panel.${id}`) !== "false");
    const toggle = () => setOpen(value => { localStorage.setItem(`audioToolkit.panel.${id}`, String(!value)); return !value; });
    return <section className={`workspace-panel ${className}${open ? "" : " collapsed"}`}>
        <PanelHeading title={title} icon={icon} open={open} onToggle={toggle} actions={actions} />
        <div className="workspace-panel-body" hidden={!open}>{children}</div>
    </section>;
}
