/* @ts-self-types="./fft_wasm.d.ts" */

import * as wasm from "./fft_wasm_bg.wasm";
import { __wbg_set_wasm } from "./fft_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    FftProcessor
} from "./fft_wasm_bg.js";
