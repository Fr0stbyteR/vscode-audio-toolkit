declare module "verovio/wasm" {
    export default function createVerovioModule(): Promise<unknown>;
}

declare module "verovio/esm" {
    import { toolkit } from "verovio";
    export class VerovioToolkit extends toolkit {
        constructor(module: unknown);
        destroy(): void;
    }
}
