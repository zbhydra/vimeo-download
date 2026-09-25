/* eslint-disable no-restricted-globals */
/**
 * streaming-libav-worker.js
 *
 * Dedicated Web Worker that powers the "no-split (streaming download) BETA"
 * pipeline. It wraps libav.js (h264-aac-mp3 variant) and performs:
 *
 *   1. Parallel segment fetching with retries + abort + (optional) AES-128
 *      decrypt + PNG-wrapper strip.
 *   2. Segment-level demuxing (into raw AVPackets).
 *   3. Cross-segment PTS/DTS correction (zero-point alignment on the first
 *      segment + continuous append for subsequent ones).
 *   4. Packet-level remuxing into a single OPFS file using
 *      `FileSystemSyncAccessHandle` for zero-copy I/O.
 *
 * The worker is intentionally framework-free: it is delivered as-is via
 * `public/js/` so webpack never touches it, and libav.js's ES-module glue
 * is loaded via native `import()` at runtime. This avoids any double
 * compilation of the WASM loader.
 *
 * Message protocol
 * ================
 * Inbound (offscreen -> worker):
 *   { type: 'init' }
 *   { type: 'download', reqId, payload }
 *     payload = {
 *       kind: 'video+audio' | 'video_only' | 'audio_only',
 *       video?: { segments: Segment[] },
 *       audio?: { segments: Segment[] },
 *       headers?: Record<string,string>,
 *       outputFilename: string,           // name under OPFS root (or subdir)
 *       opfsSubdir?: string,              // optional OPFS subdirectory
 *       container: 'mp4' | 'mkv' | 'mp3', // output muxer
 *       clip?:    { startSec: number, endSec: number },
 *       concurrency?: number,             // max parallel segment fetches
 *       cache?:   'default' | 'reload',
 *     }
 *     Segment = {
 *       url: string,
 *       durationSec?: number,
 *       byteRange?: { offset: number, length: number },
 *       initUrl?: string,                 // per-segment init override
 *       initByteRange?: { offset: number, length: number },
 *       encryption?: { method: 'AES-128', keyUrl: string, iv: Uint8Array },
 *     }
 *
 *   { type: 'abort', reqId }
 *   { type: 'dispose' }
 *
 * Outbound (worker -> offscreen):
 *   { type: 'ready' }
 *   { type: 'progress', reqId, fetchedBytes, segmentsFetched, segmentsTotal,
 *                       encodedDurationSec }
 *   { type: 'diag', reqId, level: 'info'|'warn'|'error', msg, ctx? }
 *   { type: 'done',  reqId, filename, sizeBytes, badSegmentCount,
 *                    totalSegmentCount }
 *   { type: 'error', reqId, code, message, recoverable }
 */

// ============================================================================
// Constants
// ============================================================================

const LIBAV_ENTRY = './lib/libav/libav-6.5.7.1-h264-aac-mp3.wasm.mjs';
const LIBAV_VERSION = '6.5.7.1';
const LIBAV_VARIANT = 'h264-aac-mp3';

const DEFAULT_CONCURRENCY = 4;
const MAX_FETCH_ATTEMPTS = 5;
const FETCH_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 500;

// Gives up if >35% of segments are individually broken. Aligns with the
// competitor's observed tolerance and leaves room for the occasional stale
// CDN edge.
const MAX_BAD_SEGMENT_RATIO = 0.35;

// A/V timestamp gap threshold (≈250ms) above which we treat the first
// segment's audio/video as having a real start offset that must be zeroed.
const AV_GAP_NANOS = 250_000_000n;
const ONE_SECOND_NANOS = 1_000_000_000n;

// libav.js WASM module does NOT expose FFmpeg enum constants as properties on
// the instance. We define all referenced constants ourselves.
const AVMEDIA_TYPE_VIDEO = 0;
const AVMEDIA_TYPE_AUDIO = 1;
const AVERROR_EOF = -0x20464F45; // FFERRTAG('E','O','F',' ') = -(('E')|('O'<<8)|('F'<<16)|(' '<<24))
const AV_LOG_ERROR = 16;
const AV_SAMPLE_FMT_FLTP = 8;  // float, planar

// ============================================================================
// Diagnostics
// ============================================================================

const DIAG = 'streaming-libav-worker';
function postDiag(reqId, level, msg, ctx) {
    self.postMessage({ type: 'diag', reqId, level, msg, ctx });
    const line = `[${DIAG}] ${reqId ?? '-'} ${msg}`;
    if (level === 'error') console.error(line, ctx ?? '');
    else if (level === 'warn') console.warn(line, ctx ?? '');
    else console.log(line, ctx ?? '');
}

// ============================================================================
// Libav loader
// ============================================================================

/**
 * Lazy loader for libav.js. Returns a cached instance on subsequent calls.
 * We use `noworker: true` because we're already running inside a Worker —
 * spawning another layer of worker defeats the purpose and also breaks
 * OPFS sync-access-handle usage (which must live on this worker).
 */
let libavPromise = null;
function loadLibav() {
    if (libavPromise) return libavPromise;

    libavPromise = (async () => {
        const entryUrl = new URL(LIBAV_ENTRY, self.location.href).href;
        const entryDir = entryUrl.replace(/\/[^/]*$/, '');
        // libav.js glue resolves the .wasm binary via locateFile(prefix + basename).
        // In a dedicated Worker, prefix defaults to dirname(worker URL) === .../js/, which
        // is wrong (binary lives under .../js/lib/libav/). Explicit wasmurl avoids 404 on
        // chrome-extension://.../js/libav-*.wasm.wasm.
        const wasmFileUrl = `${entryDir}/libav-${LIBAV_VERSION}-${LIBAV_VARIANT}.wasm.wasm`;

        postDiag(null, 'info', `loading libav.js ${LIBAV_VERSION} variant=${LIBAV_VARIANT}`);

        const mod = await import(entryUrl);
        const libavGlobal = mod.default ?? mod.LibAV ?? mod;
        const factory = libavGlobal.LibAV ?? libavGlobal;

        const libav = await factory({
            noworker: true,
            variant: LIBAV_VARIANT,
            base: entryDir,
            wasmurl: wasmFileUrl,
        });

        try { await libav.av_log_set_level(AV_LOG_ERROR); } catch (_) { /* noop */ }

        postDiag(null, 'info', 'libav.js ready');
        return libav;
    })().catch((err) => {
        libavPromise = null;
        throw err;
    });

    return libavPromise;
}

// ============================================================================
// OPFS sync writer registry
// ============================================================================

/**
 * Maps an in-libav virtual file (from `mkwriterdev`) to an OPFS
 * `FileSystemSyncAccessHandle`. Libav invokes `onwrite(name, offset, chunk)`
 * for every byte it muxes out; we forward each write directly to OPFS.
 *
 * Using the *sync* handle is crucial: the worker is the only environment
 * where this API is exposed, and its write-at-offset semantics match
 * libav's AVIO model 1:1 without any JS-side buffering.
 */
class OpfsSyncWriterRegistry {
    constructor(subdir) {
        this.map = new Map();
        this.subdir = typeof subdir === 'string' && subdir.length > 0 ? subdir : null;
    }

    async _resolveDir() {
        const root = await navigator.storage.getDirectory();
        if (!this.subdir) return root;
        return await root.getDirectoryHandle(this.subdir, { create: true });
    }

    async open(name) {
        const dir = await this._resolveDir();
        const fileHandle = await dir.getFileHandle(name, { create: true });
        const sync = await fileHandle.createSyncAccessHandle();
        sync.truncate(0);
        this.map.set(name, { sync, size: 0 });
    }

    onwrite(name, offset, chunk) {
        const entry = this.map.get(name);
        if (!entry) return;
        entry.sync.write(chunk, { at: offset });
        const end = offset + chunk.length;
        if (end > entry.size) entry.size = end;
    }

    async close(name) {
        const entry = this.map.get(name);
        if (!entry) return 0;
        entry.sync.flush();
        entry.sync.close();
        this.map.delete(name);
        return entry.size;
    }

    async remove(name) {
        try {
            const dir = await this._resolveDir();
            await dir.removeEntry(name);
        } catch (_) { /* noop */ }
    }
}

// ============================================================================
// Fetch helpers
// ============================================================================

function sleepAbortable(ms, signal) {
    return new Promise((resolve) => {
        let timer;
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            resolve({ aborted: true });
        };
        if (signal.aborted) { resolve({ aborted: true }); return; }
        signal.addEventListener('abort', onAbort);
        timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve({ aborted: false });
        }, ms);
    });
}

/**
 * fetchWithRetry — fetches a URL, optionally applying a Range header and
 * custom headers, with exponential back-off. Aborts propagate through
 * `signal`. Returns the full Uint8Array body on success.
 */
async function fetchSegmentBytes(url, { headers, byteRange, cache, signal }) {
    let lastErr = null;

    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
        if (signal.aborted) throw new Error('aborted');

        const reqHeaders = new Headers(headers || {});
        if (byteRange) {
            reqHeaders.set('Range', `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`);
        }

        const perAttemptAbort = new AbortController();
        const onOuterAbort = () => perAttemptAbort.abort();
        signal.addEventListener('abort', onOuterAbort);
        const timer = setTimeout(() => perAttemptAbort.abort('timeout'), FETCH_TIMEOUT_MS);

        try {
            const resp = await fetch(url, {
                headers: reqHeaders,
                cache: cache || 'default',
                signal: perAttemptAbort.signal,
            });
            if (resp.status === 404 || resp.status === 416) {
                const err = new Error(`http ${resp.status}`);
                err.status = resp.status;
                err.nonRetryable = true;
                throw err;
            }
            if (!resp.ok) {
                const err = new Error(`http ${resp.status}`);
                err.status = resp.status;
                throw err;
            }
            const buf = await resp.arrayBuffer();
            return new Uint8Array(buf);
        } catch (err) {
            lastErr = err;
            if (err?.nonRetryable || signal.aborted) throw err;
        } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', onOuterAbort);
        }

        const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
        const slept = await sleepAbortable(backoff, signal);
        if (slept.aborted) throw new Error('aborted');
    }

    throw lastErr || new Error('fetch failed');
}

// ============================================================================
// PNG wrapper stripping
// ============================================================================

const PNG_HEADER = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const PNG_IEND   = [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];

/**
 * Some CDNs (and scrapers' mirrors thereof) wrap video segments inside a
 * minimal PNG envelope — starting with the 8-byte PNG signature and
 * terminated by the 8-byte IEND chunk. If present, we strip everything
 * up to and including IEND and operate on the trailing payload. Returns
 * the unwrapped Uint8Array, or the input unchanged if no PNG envelope is
 * detected.
 */
function stripPngEnvelope(bytes) {
    if (bytes.length < PNG_HEADER.length + PNG_IEND.length) return bytes;
    for (let i = 0; i < PNG_HEADER.length; i++) {
        if (bytes[i] !== PNG_HEADER[i]) return bytes;
    }
    const firstByte = PNG_IEND[0];
    for (let i = PNG_HEADER.length; i + PNG_IEND.length <= bytes.length; i++) {
        if (bytes[i] !== firstByte) continue;
        let matched = true;
        for (let j = 1; j < PNG_IEND.length; j++) {
            if (bytes[i + j] !== PNG_IEND[j]) { matched = false; break; }
        }
        if (matched) return bytes.subarray(i + PNG_IEND.length);
    }
    return bytes;
}

// ============================================================================
// AES-128 decryption
// ============================================================================

/**
 * AES-128-CBC decrypt an HLS media segment. Per RFC 8216, if the IV is not
 * explicitly provided on the EXT-X-KEY tag, the segment's media-sequence
 * number (as a 128-bit big-endian int) is used instead; the caller is
 * expected to have already materialised that into `iv` when building the
 * Segment descriptor.
 */
async function aes128Decrypt(data, keyBytes, iv) {
    if (keyBytes.length !== 16) throw new Error('AES-128 key must be 16 bytes');
    if (iv.length !== 16) throw new Error('AES-128 IV must be 16 bytes');
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, data);
    return new Uint8Array(decrypted);
}

// ============================================================================
// Simple concurrency-limited semaphore
// ============================================================================

class Semaphore {
    constructor(max) {
        this.max = Math.max(1, max | 0);
        this.inflight = 0;
        this.waiters = [];
    }
    async acquire() {
        if (this.inflight < this.max) { this.inflight++; return; }
        await new Promise((resolve) => this.waiters.push(resolve));
        this.inflight++;
    }
    release() {
        this.inflight = Math.max(0, this.inflight - 1);
        const next = this.waiters.shift();
        if (next) { this.inflight--; next(); }
    }
    async run(fn) {
        await this.acquire();
        try { return await fn(); } finally { this.release(); }
    }
}

/**
 * Mutex — serialises calls to a non-reentrant resource. We use it to guard
 * libav's muxer context: `ff_write_multi` is not safe to invoke
 * concurrently from two JS tasks, so all writes from the video and audio
 * branches must funnel through this.
 */
class Mutex {
    constructor() { this.tail = Promise.resolve(); }
    run(fn) {
        const next = this.tail.then(fn, fn);
        this.tail = next.catch(() => {});
        return next;
    }
}

// ============================================================================
// PTS/DTS handling
// ============================================================================

/**
 * Libav.js exposes 64-bit integers as {lo, hi} pairs. We combine them into
 * BigInt for correct arithmetic across segment boundaries, then split back
 * before writing into packets.
 */
function u64(lo, hi) {
    return (BigInt(hi | 0) << 32n) | (BigInt(lo >>> 0));
}
function i64Split(bi) {
    return { lo: Number(bi & 0xFFFFFFFFn), hi: Number(bi >> 32n) };
}

/**
 * Scale a packet's pts+time_base to nanoseconds. Used only for cross-stream
 * gap detection on the very first segment; we never write this back to
 * libav.
 */
function ptsToNanos(pkt) {
    if (!pkt.time_base_num || !pkt.time_base_den) return 0n;
    const pts = u64(pkt.pts, pkt.ptshi || 0);
    return pts * BigInt(pkt.time_base_num) * ONE_SECOND_NANOS / BigInt(pkt.time_base_den);
}

/**
 * Does the very first segment require PTS zero-alignment? This is true if:
 *   - there is both audio and video (so a mismatch can be audible)
 *   - OR the first packet's PTS is not already zero.
 * When the A/V gap is larger than ~250ms we force a recompute from packet
 * durations — this makes the resulting file start cleanly at 0.
 */
function firstSegmentNeedsZeroAlign(demuxed) {
    if (!demuxed) return false;
    const video = demuxed.video;
    const audio = demuxed.audio;
    const vPkt = video?.packets?.[0];
    const aPkt = audio?.packets?.[0];

    // Single-stream case: align if PTS != 0.
    if (!vPkt || !aPkt) {
        const first = vPkt ?? aPkt;
        if (!first) return false;
        return u64(first.pts, first.ptshi || 0) !== 0n;
    }

    // Two-stream case: align if there's a meaningful A/V gap.
    const vNanos = ptsToNanos(vPkt);
    const aNanos = ptsToNanos(aPkt);
    const diff = vNanos - aNanos;
    const abs = diff < 0n ? -diff : diff;
    return abs > AV_GAP_NANOS;
}

/**
 * Rewrites the entire packet list so that PTS/DTS start at 0 and advance
 * purely by accumulated packet durations. Returns a checkpoint used by the
 * continuous-append pass.
 */
function zeroAlignPackets(packets) {
    if (!packets || packets.length === 0) {
        return { lastDts: 0n, lastPts: 0n, lastDuration: 0n, forceRecomputeTimings: false };
    }
    const p0 = packets[0];
    let accDts = 0n;
    let accPts = 0n;
    p0.dts = 0; p0.dtshi = 0;
    p0.pts = 0; p0.ptshi = 0;
    let dur = u64(p0.duration, p0.durationhi || 0);

    for (let i = 1; i < packets.length; i++) {
        const pkt = packets[i];
        const nextDts = accDts + dur;
        const nextPts = accPts + dur;
        accDts = nextDts;
        accPts = nextPts;
        dur = u64(pkt.duration, pkt.durationhi || 0);
        const { lo: dLo, hi: dHi } = i64Split(nextDts);
        const { lo: pLo, hi: pHi } = i64Split(nextPts);
        pkt.dts = dLo; pkt.dtshi = dHi;
        pkt.pts = pLo; pkt.ptshi = pHi;
    }

    // Matches 万能视频下载器 le(): subsequent segments must not take the
    // "natural continuation" shortcut until we have stitched at least once.
    return {
        lastDts: accDts,
        lastPts: accPts,
        lastDuration: dur,
        forceRecomputeTimings: true,
    };
}

/** Produces a checkpoint from a packet list without rewriting them. */
function checkpointFromPackets(packets) {
    const last = packets[packets.length - 1];
    return {
        lastDts: u64(last.dts, last.dtshi || 0),
        lastPts: u64(last.pts, last.ptshi || 0),
        lastDuration: u64(last.duration, last.durationhi || 0),
        forceRecomputeTimings: false,
    };
}

/**
 * Duration for the step *after* packet `index` (used to reach packet index+1).
 * Uses packet duration when set; otherwise decode-order DTS delta (original
 * timestamps, before we rewrite them).
 */
function inferStepAfterPacket(packets, index, origDtsAtIndex) {
    const pkt = packets[index];
    let d = u64(pkt.duration, pkt.durationhi || 0);
    if (d !== 0n) return d;
    if (index + 1 < packets.length) {
        const dts1 = u64(packets[index + 1].dts, packets[index + 1].dtshi || 0);
        const gap = dts1 - origDtsAtIndex;
        if (gap > 0n) return gap;
    }
    return 1n;
}

/**
 * Applies continuous PTS/DTS to a subsequent segment's packets. Mirrors
 * 万能视频下载器 `ue()` / `Q()` behaviour: keep natural timestamps when the
 * demuxer already continues past the checkpoint, or when last_duration is 0
 * and the first packet already continues (see `!force && n>r && l>a || i==0n`).
 * When last_duration is 0 but the new segment resets (discontinuity), we stitch
 * using inferred steps instead of duplicating DTS (which breaks video after ~1–2
 * segments while audio often still plays).
 */
function continuousAppendPackets(packets, checkpoint) {
    if (!packets || packets.length === 0) return checkpoint;

    let { lastDts, lastPts, lastDuration, forceRecomputeTimings } = checkpoint;
    if (forceRecomputeTimings === undefined) forceRecomputeTimings = false;
    if (lastDuration === undefined) lastDuration = 0n;

    const first = packets[0];
    const firstDts = u64(first.dts, first.dtshi || 0);
    const firstPts = u64(first.pts, first.ptshi || 0);

    const naturalContinuation = firstDts > lastDts && firstPts > lastPts;

    // Same early-exit as ue(): natural timeline, or unknown last_duration but
    // timestamps already continue. Do NOT take this path when last_duration==0
    // and the segment reset (discontinuity) — stitch below instead.
    if (naturalContinuation && (!forceRecomputeTimings || lastDuration === 0n)) {
        return checkpointFromPackets(packets);
    }

    let dur = lastDuration;
    if (dur === 0n) {
        dur = inferStepAfterPacket(packets, 0, u64(packets[0].dts, packets[0].dtshi || 0));
    }

    for (let i = 0; i < packets.length; i++) {
        const pkt = packets[i];
        const origDts = u64(pkt.dts, pkt.dtshi || 0);
        const nextDts = lastDts + dur;
        const nextPts = lastPts + dur;
        lastDts = nextDts;
        lastPts = nextPts;
        const { lo: dLo, hi: dHi } = i64Split(nextDts);
        const { lo: pLo, hi: pHi } = i64Split(nextPts);
        pkt.dts = dLo; pkt.dtshi = dHi;
        pkt.pts = pLo; pkt.ptshi = pHi;

        dur = inferStepAfterPacket(packets, i, origDts);
    }

    return {
        lastDts,
        lastPts,
        lastDuration: dur,
        forceRecomputeTimings,
    };
}

// ============================================================================
// Segment fetching + demuxing
// ============================================================================

const initBytesCache = new Map(); // initKey -> Uint8Array
const aesKeyCache = new Map();    // keyUrl -> Uint8Array

function initCacheKey(init) {
    if (!init?.initUrl) return null;
    if (init.initByteRange) {
        return `${init.initUrl}#${init.initByteRange.offset}-${init.initByteRange.length}`;
    }
    return init.initUrl;
}

async function fetchInitBytes(seg, fetchCtx) {
    const key = initCacheKey(seg);
    if (!key) return null;
    if (initBytesCache.has(key)) return initBytesCache.get(key);

    let bytes = await fetchSegmentBytes(seg.initUrl, {
        ...fetchCtx,
        byteRange: seg.initByteRange,
    });
    bytes = stripPngEnvelope(bytes);

    // Inits can in theory also be encrypted under the same key. We do NOT
    // decrypt inits here because HLS AES-128 only applies to media
    // segments per RFC 8216 §4.4.2.4; inits are in the clear.
    initBytesCache.set(key, bytes);
    return bytes;
}

async function fetchAesKey(keyUrl, fetchCtx) {
    if (aesKeyCache.has(keyUrl)) return aesKeyCache.get(keyUrl);
    const bytes = await fetchSegmentBytes(keyUrl, fetchCtx);
    aesKeyCache.set(keyUrl, bytes);
    return bytes;
}

/**
 * Fetch + PNG-strip + decrypt + prepend init for a single segment. Returns
 * a Uint8Array ready to be fed to libav's demuxer.
 */
async function materialiseSegment(seg, fetchCtx) {
    let body = await fetchSegmentBytes(seg.url, {
        ...fetchCtx,
        byteRange: seg.byteRange,
    });
    body = stripPngEnvelope(body);

    if (seg.encryption && seg.encryption.method === 'AES-128') {
        const key = await fetchAesKey(seg.encryption.keyUrl, fetchCtx);
        body = await aes128Decrypt(body, key, seg.encryption.iv);
    }

    const init = await fetchInitBytes(seg, fetchCtx);
    if (!init) return body;

    const combined = new Uint8Array(init.length + body.length);
    combined.set(init, 0);
    combined.set(body, init.length);
    return combined;
}

/**
 * Demux a single segment's bytes into video/audio packet lists. Returns:
 *   { av:{video:{stream,packets}|null, audio:{stream,packets}|null},
 *     pkt, fmtCtx, tmpName }
 * Caller MUST invoke `cleanupDemuxed(libav, result)` once they're done.
 */
async function demuxSegmentBytes(libav, bytes, {
    wantVideo,
    wantAudio,
    /** Output muxer stream index for audio packets (when remuxing split A/V M3U8, audio is always 0). */
    muxAudioStreamIndex,
    /** Output muxer stream index for video packets (1 when audio+video mux, else 0). */
    muxVideoStreamIndex,
}) {
    const tmpName = `seg_${crypto.randomUUID().replace(/-/g, '')}.tmp`;

    // Diagnostic: log first 16 bytes to identify container format
    const header = bytes.length >= 16 ? Array.from(bytes.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ') : '(too short)';
    const headerAscii = bytes.length >= 16 ? String.fromCharCode(...bytes.subarray(0, 16)).replace(/[^\x20-\x7E]/g, '.') : '';
    console.log(`[streaming-libav-worker] demux input: ${bytes.length} bytes, header=[${header}] ascii=[${headerAscii}], wantVideo=${wantVideo}, wantAudio=${wantAudio}`);

    await libav.writeFile(tmpName, bytes);

    let fmtCtx, streams, pkt;
    try {
        [fmtCtx, streams] = await libav.ff_init_demuxer_file(tmpName);

        console.log(`[streaming-libav-worker] demuxed streams: ${streams.length}`, streams.map(s => ({ index: s.index, codec_type: s.codec_type, codec_id: s.codec_id })));

        const videoStream = streams.find((s) => s.codec_type === AVMEDIA_TYPE_VIDEO);
        const audioStream = streams.find((s) => s.codec_type === AVMEDIA_TYPE_AUDIO);

        if (wantVideo && !videoStream) throw badSegment('no video stream');
        if (wantAudio && !audioStream) throw badSegment('no audio stream');

        pkt = await libav.av_packet_alloc();
        const [readCode, packetsByIndex] = await libav.ff_read_frame_multi(fmtCtx, pkt);
        if (readCode !== AVERROR_EOF && readCode !== -541478725) throw badSegment(`ff_read_frame_multi code=${readCode}`);

        const audioPackets = audioStream ? (packetsByIndex[audioStream.index] || []) : [];
        const videoPackets = videoStream ? (packetsByIndex[videoStream.index] || []) : [];

        // Canonicalise stream_index to match ff_init_muxer stream order. When video and audio
        // come from separate HLS renditions, each demux sees only one stream — `twoStreams`
        // is false and naive remapping would put video at 0 even though muxer has audio=0, video=1.
        const twoStreams = Boolean(audioStream && videoStream);
        for (const p of audioPackets) {
            p.stream_index = muxAudioStreamIndex !== undefined ? muxAudioStreamIndex : 0;
        }
        for (const p of videoPackets) {
            if (muxVideoStreamIndex !== undefined) {
                p.stream_index = muxVideoStreamIndex;
            } else {
                p.stream_index = twoStreams ? 1 : 0;
            }
        }

        return {
            av: {
                video: videoStream ? { stream: videoStream, packets: videoPackets } : null,
                audio: audioStream ? { stream: audioStream, packets: audioPackets } : null,
            },
            pkt,
            fmtCtx,
            tmpName,
        };
    } catch (err) {
        if (pkt) { try { await libav.av_packet_free_js(pkt); } catch (_) { /* noop */ } }
        if (fmtCtx) { try { await libav.avformat_close_input_js(fmtCtx); } catch (_) { /* noop */ } }
        try { await libav.unlink(tmpName); } catch (_) { /* noop */ }
        throw err;
    }
}

async function cleanupDemuxed(libav, result) {
    if (!result) return;
    try { await libav.av_packet_free_js(result.pkt); } catch (_) { /* noop */ }
    try { await libav.avformat_close_input_js(result.fmtCtx); } catch (_) { /* noop */ }
    try { await libav.unlink(result.tmpName); } catch (_) { /* noop */ }
}

function badSegment(message) {
    const err = new Error(message || 'bad segment');
    err.code = 'bad_segment';
    return err;
}

function requireDemuxBranch(result, branch, label) {
    const stream = branch === BRANCH.VIDEO ? result?.av?.video : result?.av?.audio;
    const branchName = branch === BRANCH.VIDEO ? 'video' : 'audio';
    if (!stream?.stream || !Array.isArray(stream.packets)) {
        throw badSegment(`${label || 'segment'} missing ${branchName} stream`);
    }
    return stream;
}

// ============================================================================
// Request registry & abort plumbing
// ============================================================================

const activeRequests = new Map(); // reqId -> { abortController, aborted, startedAt }

function registerRequest(reqId) {
    const abortController = new AbortController();
    const rec = {
        abortController,
        aborted: false,
        startedAt: Date.now(),
    };
    activeRequests.set(reqId, rec);
    return rec;
}

function dropRequest(reqId) {
    activeRequests.delete(reqId);
}

// ============================================================================
// Progress reporting
// ============================================================================

class ProgressEmitter {
    constructor(reqId, totalSegments) {
        this.reqId = reqId;
        this.totalSegments = totalSegments || 0;
        this.fetchedBytes = 0;
        this.segmentsFetched = 0;
        this.encodedDurationSec = 0;
        this.timer = null;
    }
    addBytes(n) { this.fetchedBytes += n; this.scheduleFlush(); }
    addSegment(durationSec) {
        this.segmentsFetched++;
        if (Number.isFinite(durationSec)) this.encodedDurationSec += durationSec;
        this.scheduleFlush();
    }
    scheduleFlush() {
        if (this.timer) return;
        this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 250);
    }
    flush() {
        self.postMessage({
            type: 'progress',
            reqId: this.reqId,
            fetchedBytes: this.fetchedBytes,
            segmentsFetched: this.segmentsFetched,
            segmentsTotal: this.totalSegments,
            encodedDurationSec: this.encodedDurationSec,
        });
    }
    done() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.flush();
    }
}

// ============================================================================
// Muxer construction
// ============================================================================

const CONTAINER_TO_FORMAT_NAME = {
    mp4: 'mp4',
    mkv: 'matroska',
    mp3: 'mp3',
};

/**
 * @param {boolean} [codecparsMode=true]  Pass false when triples contain
 *   AVCodecContext pointers (e.g. the audio transcode path) instead of
 *   AVCodecParameters. Mirrors the reference extension's use of
 *   `codecpars: false` for the libmp3lame encoder context.
 */
async function openOutputMuxer(libav, writer, outputFilename, container, codecparTriples, codecparsMode = true) {
    console.log(`[streaming-libav-worker] openOutputMuxer: file=${outputFilename} container=${container} codecpars=${codecparsMode} streams=${codecparTriples.length}`);

    try { await writer.open(outputFilename); }
    catch (e) { throw new Error(`writer.open failed: ${e?.message || JSON.stringify(e)}`); }

    libav.onwrite = writer.onwrite.bind(writer);
    // NOTE: do NOT call mkwriterdev here — ff_init_muxer with device:true
    // calls FS.mkdev internally; calling mkwriterdev first creates the device
    // file twice on the same path, causing ErrnoError errno:20 (ENOTDIR).

    let muxCtx, pbCtx;
    try {
        [muxCtx, , pbCtx] = await libav.ff_init_muxer(
            {
                filename: outputFilename,
                open: true,
                codecpars: codecparsMode,
                device: true,
                format_name: CONTAINER_TO_FORMAT_NAME[container] || container,
            },
            codecparTriples,
        );
    } catch (e) { throw new Error(`ff_init_muxer failed: ${e?.message || JSON.stringify(e)}`); }

    // `avoid_negative_ts=make_zero` is the single most useful knob for
    // preventing players from giving up on leading negative DTS produced
    // by PTS rewriting at segment boundaries.
    try { await libav.av_opt_set(muxCtx, 'avoid_negative_ts', 'make_zero', 0); }
    catch (e) { console.warn(`[streaming-libav-worker] av_opt_set failed (non-fatal):`, e); }

    let headerRc;
    try { headerRc = await libav.avformat_write_header(muxCtx, 0); }
    catch (e) { throw new Error(`avformat_write_header threw: ${e?.message || JSON.stringify(e)}`); }

    if (headerRc < 0) {
        let msg;
        try { msg = await libav.strerror(headerRc); } catch (_) { msg = `rc=${headerRc}`; }
        throw new Error(`avformat_write_header: ${msg}`);
    }
    console.log(`[streaming-libav-worker] muxer opened OK, muxCtx=${muxCtx}`);
    return { muxCtx, pbCtx };
}

async function finaliseMuxer(libav, muxCtx, pbCtx, writer, outputFilename) {
    const trailerRc = await libav.av_write_trailer(muxCtx);
    if (trailerRc !== 0) {
        const msg = await libav.strerror(trailerRc);
        throw new Error(`av_write_trailer: ${msg}`);
    }
    await libav.ff_free_muxer(muxCtx, pbCtx);
    const size = await writer.close(outputFilename);
    try { await libav.unlink(outputFilename); } catch (_) { /* noop */ }
    return size;
}

// ============================================================================
// Clip filtering (by PTS window, in output time-base of 1s=ONE_SECOND_NANOS)
// ============================================================================

function filterPacketsByWindow(packets, startNanos, endNanos) {
    const kept = [];
    for (const p of packets) {
        if (!p.time_base_num || !p.time_base_den) { kept.push(p); continue; }
        const pts = u64(p.pts, p.ptshi || 0);
        const ns = pts * BigInt(p.time_base_num) * ONE_SECOND_NANOS / BigInt(p.time_base_den);
        if (ns < startNanos) continue;
        if (endNanos !== null && ns > endNanos) continue;
        kept.push(p);
    }
    return kept;
}

// ============================================================================
// Main pipelines
// ============================================================================

const BRANCH = { VIDEO: 'video', AUDIO: 'audio' };

/**
 * downloadVideoAndAudio — the core path for two-source (separate video +
 * audio) HLS downloads. Assumes the caller has already resolved the
 * segment lists (parsing m3u8 happens in the offscreen layer where the
 * existing helpers live).
 */
async function downloadVideoAndAudio({ libav, writer, payload, rec, progress }) {
    const { video, audio, headers, outputFilename, container, concurrency, cache, clip } = payload;
    const videoSegs = video?.segments || [];
    const audioSegs = audio?.segments || [];
    if (videoSegs.length === 0) throw new Error('no video segments');
    const haveAudio = audioSegs.length > 0;
    // Must match codecparTriples order in openOutputMuxer: audio first (0), then video (1).
    const muxWant = haveAudio
        ? { muxAudioStreamIndex: 0, muxVideoStreamIndex: 1 }
        : { muxVideoStreamIndex: 0 };

    const fetchCtx = { headers, cache, signal: rec.abortController.signal };
    const sem = new Semaphore(concurrency || DEFAULT_CONCURRENCY);
    const muxerMutex = new Mutex(); // serialises ff_write_multi across branches

    const totalVideoSegs = videoSegs.length;
    const totalAudioSegs = audioSegs.length;
    const totalSegs = totalVideoSegs + totalAudioSegs;

    // --- probe: demux first segment(s) for codecpars + initial align ---

    const firstVideoDemuxed = await demuxSingle(libav, videoSegs.shift(), fetchCtx, progress, {
        wantVideo: true,
        wantAudio: false,
        ...muxWant,
    });
    const firstVideoAv = requireDemuxBranch(firstVideoDemuxed, BRANCH.VIDEO, 'first video segment');

    let firstAudioDemuxed = null;
    let firstAudioAv = null;
    if (haveAudio) {
        firstAudioDemuxed = await demuxSingle(libav, audioSegs.shift(), fetchCtx, progress, {
            wantVideo: false,
            wantAudio: true,
            ...muxWant,
        });
        firstAudioAv = requireDemuxBranch(firstAudioDemuxed, BRANCH.AUDIO, 'first audio segment');
    }

    // Synthesise a combined "first result" for zero-alignment purposes.
    const combinedFirst = {
        av: {
            video: firstVideoAv,
            audio: firstAudioAv,
        },
    };
    // When clip is active, offscreen.js passes absolute HLS start/end seconds
    // as clip.startSec/endSec. filterPacketsByWindow compares against those
    // absolute nanosecond values, so packets must keep their natural timestamps.
    // Zero-alignment (which resets the first packet to PTS=0) would make the
    // absolute filter discard everything — only apply it for full downloads.
    const needZero = !clip && firstSegmentNeedsZeroAlign(combinedFirst.av);
    postDiag(progress.reqId, 'info',
        `first-segment PTS alignment: ${needZero ? 'zero-align' : 'keep natural'} clip=${Boolean(clip)}`);

    let vCheckpoint = needZero
        ? zeroAlignPackets(firstVideoAv.packets)
        : checkpointFromPackets(firstVideoAv.packets);
    let aCheckpoint = firstAudioAv
        ? (needZero ? zeroAlignPackets(firstAudioAv.packets)
                    : checkpointFromPackets(firstAudioAv.packets))
        : null;

    // --- open muxer using probed codecpars ---

    const codecparTriples = [];
    if (firstAudioAv) {
        const s = firstAudioAv.stream;
        codecparTriples.push([s.codecpar, s.time_base_num, s.time_base_den]);
    }
    codecparTriples.push([firstVideoAv.stream.codecpar, firstVideoAv.stream.time_base_num, firstVideoAv.stream.time_base_den]);
    const { muxCtx, pbCtx } = await openOutputMuxer(libav, writer, outputFilename, container, codecparTriples);

    // Clip window in nanoseconds (output is scaled by each packet's own
    // time_base so we translate on the fly).
    const clipStart = clip ? BigInt(Math.max(0, Math.floor(clip.startSec * 1e9))) : 0n;
    const clipEnd   = clip ? BigInt(Math.floor(clip.endSec * 1e9)) : null;

    // Write first segment's packets. Mutex is technically superfluous
    // here (we haven't started the tails yet) but keeping it uniform
    // avoids forgetting it later.
    {
        const pkts = clip
            ? filterPacketsByWindow(firstVideoAv.packets, clipStart, clipEnd)
            : firstVideoAv.packets;
        if (pkts.length) await muxerMutex.run(() => libav.ff_write_multi(muxCtx, firstVideoDemuxed.pkt, pkts));
    }
    if (firstAudioAv) {
        const pkts = clip
            ? filterPacketsByWindow(firstAudioAv.packets, clipStart, clipEnd)
            : firstAudioAv.packets;
        if (pkts.length) await muxerMutex.run(() => libav.ff_write_multi(muxCtx, firstAudioDemuxed.pkt, pkts));
    }
    await cleanupDemuxed(libav, firstVideoDemuxed);
    if (firstAudioDemuxed) await cleanupDemuxed(libav, firstAudioDemuxed);

    // --- pipelined fetch + demux for the remaining segments ---

    const badCounter = { count: 0 };

    async function processTail(list, branch) {
        // Walk strictly in order. Parallel fetches kick off via semaphore
        // but we await them in sequence so PTS checkpoints stay consistent.
        const pending = list.map((seg) => ({
            seg,
            promise: sem.run(() => demuxSingle(libav, seg, fetchCtx, progress, {
                wantVideo: branch === BRANCH.VIDEO,
                wantAudio: branch === BRANCH.AUDIO,
                ...muxWant,
            }).catch((err) => err)),
        }));

        for (let i = 0; i < pending.length; i++) {
            if (rec.aborted) throw new Error('aborted');
            const { seg, promise } = pending[i];
            const result = await promise;
            if (result instanceof Error) {
                if (result.code === 'bad_segment') {
                    badCounter.count++;
                    const ratio = badCounter.count / totalSegs;
                    postDiag(progress.reqId, 'warn',
                        `bad ${branch} segment: ${result.message}; ratio=${ratio.toFixed(3)}`,
                        { url: seg.url });
                    if (ratio > MAX_BAD_SEGMENT_RATIO) {
                        throw new Error(`too many bad segments (>${Math.round(MAX_BAD_SEGMENT_RATIO * 100)}%)`);
                    }
                    continue;
                }
                throw result;
            }

            if (branch === BRANCH.VIDEO && result.av.video) {
                vCheckpoint = continuousAppendPackets(result.av.video.packets, vCheckpoint);
                const pkts = clip
                    ? filterPacketsByWindow(result.av.video.packets, clipStart, clipEnd)
                    : result.av.video.packets;
                if (pkts.length) await muxerMutex.run(() => libav.ff_write_multi(muxCtx, result.pkt, pkts));
            } else if (branch === BRANCH.AUDIO && result.av.audio) {
                aCheckpoint = continuousAppendPackets(result.av.audio.packets, aCheckpoint);
                const pkts = clip
                    ? filterPacketsByWindow(result.av.audio.packets, clipStart, clipEnd)
                    : result.av.audio.packets;
                if (pkts.length) await muxerMutex.run(() => libav.ff_write_multi(muxCtx, result.pkt, pkts));
            }
            await cleanupDemuxed(libav, result);
        }
    }

    // Run both tails concurrently. Each tail is internally sequential but
    // the two branches interleave naturally via the shared semaphore.
    await Promise.all([
        processTail(videoSegs, BRANCH.VIDEO),
        haveAudio ? processTail(audioSegs, BRANCH.AUDIO) : Promise.resolve(),
    ]);

    const size = await finaliseMuxer(libav, muxCtx, pbCtx, writer, outputFilename);

    progress.done();
    return {
        filename: outputFilename,
        sizeBytes: size,
        badSegmentCount: badCounter.count,
        totalSegmentCount: totalSegs,
    };
}

/**
 * downloadAudioOnly — fetches and transcodes audio segments to MP3 via
 * libmp3lame. Follows the same PTS normalisation pattern but inserts a
 * decode → filter (aresample to s16p @44.1k) → encode (libmp3lame 128k)
 * chain between demux and mux.
 */
async function downloadAudioOnly({ libav, writer, payload, rec, progress }) {
    const { audio, headers, outputFilename, concurrency, cache, clip } = payload;
    const audioSegs = audio?.segments || [];
    if (audioSegs.length === 0) throw new Error('no audio segments');

    // For audio-only, offscreen.js passes clip as a RELATIVE offset within the
    // fetched segment window (trimStartOffset / trimDuration), not absolute HLS
    // time.  We zero-align the first segment so PTS starts at 0, then
    // filterPacketsByWindow trims correctly.
    const clipStart = clip ? BigInt(Math.max(0, Math.floor(clip.startSec * 1e9))) : 0n;
    const clipEnd   = clip ? BigInt(Math.floor(clip.endSec   * 1e9)) : null;

    const fetchCtx = { headers, cache, signal: rec.abortController.signal };
    const sem = new Semaphore(concurrency || DEFAULT_CONCURRENCY);

    const first = await demuxSingle(libav, audioSegs.shift(), fetchCtx, progress, {
        wantVideo: false, wantAudio: true,
    });
    if (!first.av.audio) throw new Error('first audio segment had no audio stream');

    const aStream = first.av.audio.stream;

    // Zero-align first segment so relative clip offsets work correctly.
    let aCheckpoint = zeroAlignPackets(first.av.audio.packets);

    // Apply clip window (no-op when clip is null).
    const firstClipped = clip
        ? filterPacketsByWindow(first.av.audio.packets, clipStart, clipEnd)
        : first.av.audio.packets;

    // Decoder.
    const [, decCtx, decPkt, decFrame] = await libav.ff_init_decoder(aStream.codec_id, aStream.codecpar);
    // Decode first segment (clipped) to get source sample rate / channels.
    const firstDecoded = await libav.ff_decode_multi(
        decCtx, decPkt, decFrame, firstClipped, { fin: false });

    // Filter: resample to fltp planar @ 44100 Hz (MP3's native rate).
    const [filterGraph, bufSrc, bufSink] = await libav.ff_init_filter_graph(
        'aresample=isf=s16p:osf=fltp,asetnsamples=n=1152:p=0',
        {
            sample_rate: firstDecoded[0].sample_rate,
            sample_fmt: firstDecoded[0].format,
            channel_layout: firstDecoded[0].channel_layout,
        },
        {
            sample_rate: 44100,
            sample_fmt: AV_SAMPLE_FMT_FLTP,
            channel_layout: firstDecoded[0].channel_layout,
        },
    );
    const firstFiltered = await libav.ff_filter_multi(bufSrc, bufSink, decFrame, firstDecoded, { fin: false });

    // Encoder.
    const [, encCtx, encFrame, encPkt] = await libav.ff_init_encoder('libmp3lame', {
        ctx: {
            bit_rate: 128000,
            sample_fmt: AV_SAMPLE_FMT_FLTP,
            sample_rate: 44100,
            channel_layout: firstDecoded[0].channel_layout,
            channels: firstDecoded[0].channels,
        },
        time_base: [1, 44100],
    });
    const firstEncoded = await libav.ff_encode_multi(encCtx, encFrame, encPkt, firstFiltered, false);

    // Muxer (mp3). codecparsMode=false because encCtx is AVCodecContext (not
    // AVCodecParameters); matches reference extension's `codecpars: false` path.
    const { muxCtx, pbCtx } = await openOutputMuxer(libav, writer, outputFilename, 'mp3',
        [[encCtx, 1, 44100]], false);

    if (firstEncoded.length) await libav.ff_write_multi(muxCtx, encPkt, firstEncoded);
    await cleanupDemuxed(libav, first);

    const badCounter = { count: 0 };

    const pending = audioSegs.map((seg) => ({
        seg,
        promise: sem.run(() => demuxSingle(libav, seg, fetchCtx, progress, {
            wantVideo: false, wantAudio: true,
        }).catch((err) => err)),
    }));

    for (const { seg, promise } of pending) {
        if (rec.aborted) throw new Error('aborted');
        const result = await promise;
        if (result instanceof Error) {
            if (result.code === 'bad_segment') {
                badCounter.count++;
                const ratio = badCounter.count / (audioSegs.length + 1);
                postDiag(progress.reqId, 'warn',
                    `bad audio segment: ${result.message}; ratio=${ratio.toFixed(3)}`,
                    { url: seg.url });
                if (ratio > MAX_BAD_SEGMENT_RATIO) {
                    throw new Error(`too many bad segments (>${Math.round(MAX_BAD_SEGMENT_RATIO * 100)}%)`);
                }
                continue;
            }
            throw result;
        }
        if (!result.av.audio) { await cleanupDemuxed(libav, result); continue; }

        aCheckpoint = continuousAppendPackets(result.av.audio.packets, aCheckpoint);
        const clippedPkts = clip
            ? filterPacketsByWindow(result.av.audio.packets, clipStart, clipEnd)
            : result.av.audio.packets;

        if (clippedPkts.length) {
            const decoded = await libav.ff_decode_multi(decCtx, decPkt, decFrame, clippedPkts, { fin: false });
            const filtered = await libav.ff_filter_multi(bufSrc, bufSink, decFrame, decoded, { fin: false });
            const encoded = await libav.ff_encode_multi(encCtx, encFrame, encPkt, filtered, false);
            if (encoded.length) await libav.ff_write_multi(muxCtx, encPkt, encoded);
        }
        await cleanupDemuxed(libav, result);
    }

    // Drain encoder.
    const tail = await libav.ff_encode_multi(encCtx, encFrame, encPkt, [], true);
    if (tail.length) await libav.ff_write_multi(muxCtx, encPkt, tail);

    const size = await finaliseMuxer(libav, muxCtx, pbCtx, writer, outputFilename);

    try { await libav.ff_free_decoder(decCtx, decPkt, decFrame); } catch (_) { /* noop */ }
    try { await libav.avfilter_graph_free_js(filterGraph); } catch (_) { /* noop */ }
    try { await libav.ff_free_encoder(encCtx, encFrame, encPkt); } catch (_) { /* noop */ }

    progress.done();
    return {
        filename: outputFilename,
        sizeBytes: size,
        badSegmentCount: badCounter.count,
        totalSegmentCount: audioSegs.length + 1,
    };
}

/** Fetch → materialise → demux a single segment. Thin wrapper that also
 * updates the progress counter. */
async function demuxSingle(libav, seg, fetchCtx, progress, want) {
    console.log(`[streaming-libav-worker] demuxSingle: url=${seg.url?.substring(0, 120)} initUrl=${seg.initUrl?.substring(0, 120) ?? 'null'} byteRange=${JSON.stringify(seg.byteRange ?? null)} initByteRange=${JSON.stringify(seg.initByteRange ?? null)} encrypted=${seg.encryption?.method || 'none'}`);
    const bytes = await materialiseSegment(seg, fetchCtx);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
        throw badSegment('empty demux input');
    }
    progress.addBytes(bytes.length);
    progress.addSegment(seg.durationSec);
    const result = await demuxSegmentBytes(libav, bytes, want);
    if (want.wantVideo) {
        requireDemuxBranch(result, BRANCH.VIDEO, 'segment');
    }
    if (want.wantAudio) {
        requireDemuxBranch(result, BRANCH.AUDIO, 'segment');
    }
    return result;
}

// ============================================================================
// RPC handlers
// ============================================================================

async function handleInit() {
    try {
        await loadLibav();
        self.postMessage({ type: 'ready' });
    } catch (err) {
        self.postMessage({
            type: 'error',
            code: 'init_failed',
            message: String(err?.stack || err),
        });
    }
}

async function handleDownload(msg) {
    const { reqId, payload } = msg;
    const rec = registerRequest(reqId);
    const writer = new OpfsSyncWriterRegistry(payload?.opfsSubdir);
    const totalSegs = (payload?.video?.segments?.length || 0) + (payload?.audio?.segments?.length || 0);
    const progress = new ProgressEmitter(reqId, totalSegs);

    try {
        if (!payload || typeof payload !== 'object') throw new Error('invalid payload');
        const libav = await loadLibav();

        const kind = payload.kind || (
            payload.video && payload.audio ? 'video+audio' :
            payload.video ? 'video_only' : 'audio_only'
        );

        let result;
        if (kind === 'audio_only') {
            result = await downloadAudioOnly({ libav, writer, payload, rec, progress });
        } else {
            result = await downloadVideoAndAudio({ libav, writer, payload, rec, progress });
        }

        self.postMessage({
            type: 'done',
            reqId,
            filename: result.filename,
            sizeBytes: result.sizeBytes,
            badSegmentCount: result.badSegmentCount,
            totalSegmentCount: result.totalSegmentCount,
        });
    } catch (err) {
        // Clean up any half-written output.
        try { await writer.close(payload?.outputFilename); } catch (_) { /* noop */ }
        try { await writer.remove(payload?.outputFilename); } catch (_) { /* noop */ }

        // Serialize error robustly — libav.js can throw plain objects / numbers
        let errMessage;
        if (err instanceof Error) {
            errMessage = err.message || err.stack || String(err);
        } else if (typeof err === 'object' && err !== null) {
            try { errMessage = JSON.stringify(err); } catch (_) { errMessage = Object.keys(err).join(','); }
        } else {
            errMessage = String(err);
        }
        console.error(`[streaming-libav-worker] handleDownload error (type=${typeof err}):`, errMessage, err);

        const isAbort = rec.aborted || String(errMessage).includes('aborted');
        self.postMessage({
            type: 'error',
            reqId,
            code: isAbort ? 'aborted' : (err?.code || 'download_failed'),
            message: errMessage,
            recoverable: Boolean(err?.recoverable),
        });
    } finally {
        dropRequest(reqId);
    }
}

function handleAbort(msg) {
    const { reqId } = msg;
    const rec = activeRequests.get(reqId);
    if (!rec) return;
    rec.aborted = true;
    try { rec.abortController.abort('user_abort'); } catch (_) { /* noop */ }
    postDiag(reqId, 'info', 'abort requested');
}

function handleDispose() {
    for (const [reqId, rec] of activeRequests) {
        try { rec.abortController.abort('dispose'); } catch (_) { /* noop */ }
        postDiag(reqId, 'warn', 'worker disposed mid-flight');
    }
    activeRequests.clear();
    self.close();
}

// ============================================================================
// Message dispatch
// ============================================================================

self.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
        case 'init':     handleInit(); break;
        case 'download': handleDownload(msg); break;
        case 'abort':    handleAbort(msg); break;
        case 'dispose':  handleDispose(); break;
        default:
            postDiag(msg.reqId ?? null, 'warn', `unknown message type: ${msg.type}`);
    }
});

self.addEventListener('error', (ev) => {
    console.error('[streaming-libav-worker] uncaught error', ev.error || ev.message);
});
