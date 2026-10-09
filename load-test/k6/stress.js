import { buildOptions, setup, run } from "./lib.js";

// Stress stops at the first sustained breach so the breaking point is the last passing stage.
export const options = buildOptions("stress", { abortOnBreach: true });
export { setup };
export default run;
