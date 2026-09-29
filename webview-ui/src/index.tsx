import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LocaleProvider } from "./i18n/LocaleContext";

const $root = document.getElementById("root")!;
const root = ReactDOM.createRoot($root);

root.render(
    <React.StrictMode>
        <LocaleProvider><App /></LocaleProvider>
    </React.StrictMode>
);
