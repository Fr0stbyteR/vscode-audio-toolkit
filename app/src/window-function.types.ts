import * as WindowFunction from "window-function";
export type TWindowFunction = Exclude<keyof (typeof WindowFunction), "gaussian" | "tukey">;
