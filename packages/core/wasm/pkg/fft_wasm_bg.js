/**
 * FFT processor for browser-based audio visualization.
 *
 * Ported from backend-examples/rust/src/main.rs.
 * Takes time-domain audio samples and returns frequency magnitude spectrum
 * as u8 values (0-255) suitable for visualization.
 */
export class FftProcessor {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FftProcessorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_fftprocessor_free(ptr, 0);
    }
    /**
     * Get the required input buffer size (fft_size).
     * @returns {number}
     */
    input_size() {
        const ret = wasm.fftprocessor_input_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Create a new FFT processor.
     *
     * - `fft_size`: FFT window size (e.g., 1024 or 2048)
     * - `bins`: Number of output frequency bands (e.g., 80)
     * - `start_freq`: Lowest frequency in Hz (e.g., 100.0)
     * - `end_freq`: Highest frequency in Hz (e.g., 18000.0)
     * - `sample_rate`: Audio sample rate in Hz (e.g., 48000.0)
     * @param {number} fft_size
     * @param {number} bins
     * @param {number} start_freq
     * @param {number} end_freq
     * @param {number} sample_rate
     */
    constructor(fft_size, bins, start_freq, end_freq, sample_rate) {
        const ret = wasm.fftprocessor_new(fft_size, bins, start_freq, end_freq, sample_rate);
        this.__wbg_ptr = ret >>> 0;
        FftProcessorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get the number of output bins.
     * @returns {number}
     */
    output_bins() {
        const ret = wasm.fftprocessor_output_bins(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Process time-domain audio samples and return frequency magnitudes as 0-255 bytes.
     *
     * Input: f32 samples (length must be >= fft_size, only first fft_size samples are used).
     * Output: Vec<u8> of length `bins`, each value 0-255 representing magnitude.
     * @param {Float32Array} samples
     * @returns {Uint8Array}
     */
    process(samples) {
        const ptr0 = passArrayF32ToWasm0(samples, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fftprocessor_process(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}
if (Symbol.dispose) FftProcessor.prototype[Symbol.dispose] = FftProcessor.prototype.free;
export function __wbg___wbindgen_throw_bd5a70920abf0236(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
const FftProcessorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_fftprocessor_free(ptr >>> 0, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
