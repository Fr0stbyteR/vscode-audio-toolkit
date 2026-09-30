import React from "react";
import ReactDOM from "react-dom/client";
import StandaloneApp from "./StandaloneApp";
import { LocaleProvider } from "../i18n/LocaleContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode><LocaleProvider><StandaloneApp /></LocaleProvider></React.StrictMode>
);
