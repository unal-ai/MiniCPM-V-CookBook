<template>
    <div class="debug-panel-toggle" :style="toggleStyle" @click="debugPanelVisible = !debugPanelVisible">
        {{ debugPanelVisible ? '隐藏诊断' : '显示诊断' }}
    </div>
    <div v-if="debugPanelVisible" class="debug-panel" :class="{ collapsed: debugPanelCollapsed }" :style="panelStyle">
        <div class="debug-panel-header">
            <div class="debug-panel-title">{{ title }}</div>
            <div class="debug-panel-actions">
                <button type="button" class="debug-action-btn" @click="copyDebugSnapshot">复制快照</button>
                <button type="button" class="debug-action-btn" @click="clearDebugEvents">清空事件</button>
                <button type="button" class="debug-action-btn" @click="debugPanelCollapsed = !debugPanelCollapsed">
                    {{ debugPanelCollapsed ? '展开' : '收起' }}
                </button>
            </div>
        </div>
        <div v-show="!debugPanelCollapsed" class="debug-panel-body">
            <div class="debug-wave-card">
                <canvas ref="debugWaveCanvas" class="debug-wave-canvas"></canvas>
                <div class="debug-wave-meta">
                    <span>本地: {{ Math.round(localWaveLevel * 100) }}%</span>
                    <span>远端: {{ Math.round(remoteWaveLevel * 100) }}%</span>
                </div>
            </div>
            <div class="debug-grid">
                <div>连接: {{ state.connected ? 'connected' : 'disconnected' }}</div>
                <div>状态: {{ state.status || 'empty' }}</div>
                <div>通话中: {{ isCalling ? 'yes' : 'no' }}</div>
                <div>加载中: {{ callLoading ? 'yes' : 'no' }}</div>
                <div>本地说话: {{ state.localAudioActive ? 'yes' : 'no' }}</div>
                <div>远端说话: {{ Object.values(state.remoteAudioActive || {}).some(Boolean) ? 'yes' : 'no' }}</div>
                <div>轮次ID: {{ state.currentGenerateRoundId ?? 'N/A' }}</div>
                <div>play_end: {{ state.playEndSent ? 'sent' : 'idle' }}</div>
                <div>no-audio剩余: {{ pendingNoAudioMs }}ms</div>
                <div>消息缓存: {{ state.messages?.length || 0 }}</div>
                <div>聊天缓存: {{ state.chatMessages?.length || 0 }}</div>
                <div>音频轮次: {{ state.audioRounds?.length || 0 }}</div>
            </div>
            <div class="debug-block">
                <div class="debug-block-title">问题定位摘要</div>
                <div v-if="roundDiagnostics.length === 0" class="debug-empty">暂无轮次诊断数据</div>
                <div v-else class="debug-summary-row">
                    <span>最近轮次 R{{ roundDiagnostics[0].roundId ?? 'N/A' }}</span>
                    <span>说话尝试 {{ roundDiagnostics[0].localAttemptsBeforeGenerate }}</span>
                    <span>vad_end {{ roundDiagnostics[0].vadEndsBeforeGenerate }}</span>
                    <span>播音估计 {{ formatMsValue(roundDiagnostics[0].remoteSpeechTotalMs) }}</span>
                    <span>play_end@{{ formatSecValue(roundDiagnostics[0].playEndMaxCurrentTimeSec) }}</span>
                    <span>短回复嫌疑 {{ roundDiagnostics[0].shortReplySuspected ? 'yes' : 'no' }}</span>
                </div>
                <div v-if="roundDiagnostics.length > 0" class="debug-empty">
                    {{ roundDiagnostics[0].hints.length ? roundDiagnostics[0].hints.join('；') : '暂无明显异常提示' }}
                </div>
            </div>
            <div class="debug-block">
                <div class="debug-block-title">轮次时序（最近{{ roundDiagnostics.length }}轮）</div>
                <div v-if="roundDiagnostics.length === 0" class="debug-empty">暂无</div>
                <div
                    v-for="item in roundDiagnostics"
                    :key="`diag-${item.roundId}-${item.generateStartAt || item.roundStartAt || 0}`"
                    class="debug-round-row"
                >
                    <span class="round-id">R{{ item.roundId ?? 'N/A' }}</span>
                    <span>尝试{{ item.localAttemptsBeforeGenerate }} / vad_end{{ item.vadEndsBeforeGenerate }}</span>
                    <span>gen→audio {{ formatMsValue(item.msGenerateToAudioStart) }}</span>
                    <span>gen→tts {{ formatMsValue(item.msGenerateToTtsFirstPcm) }}</span>
                    <span>gen→end {{ formatMsValue(item.msGenerateToGenerateEnd) }}</span>
                    <span>gen→1stPkt {{ formatMsValue(item.deltaGenToFirstPacket) }}</span>
                    <span>gen→1stPlay {{ formatMsValue(item.deltaGenToFirstPlay) }}</span>
                    <span>gen→actual {{ formatMsValue(item.deltaGenToActualPlay) }}</span>
                    <span>远端说话 {{ formatMsValue(item.remoteSpeechTotalMs) }} / {{ item.remoteSpeechSegments }}段</span>
                    <span>play_end@{{ formatSecValue(item.playEndMaxCurrentTimeSec) }}</span>
                    <span>短回复嫌疑 {{ item.shortReplySuspected ? 'yes' : 'no' }}</span>
                    <span class="hints">{{ item.hints.length ? item.hints.join('；') : '—' }}</span>
                </div>
            </div>
            <div class="debug-block">
                <div class="debug-block-title">本地说话片段（最近{{ recentLocalSpeechSegments.length }}段）</div>
                <div v-if="recentLocalSpeechSegments.length === 0" class="debug-empty">暂无</div>
                <div v-for="segment in recentLocalSpeechSegments" :key="segment.id" class="debug-local-segment-row">
                    <span>{{ segment.time }}</span>
                    <span>时长 {{ formatMsValue(segment.durationMs) }}</span>
                    <span>状态 {{ segment.statusAtEnd || 'empty' }}</span>
                    <span>轮次 {{ segment.roundIdAtEnd ?? 'N/A' }}</span>
                    <span>间隔 {{ formatMsValue(segment.gapToOlderMs) }}</span>
                </div>
            </div>
            <div class="debug-block">
                <div class="debug-block-title">play_end探针（最近{{ recentPlayEndProbeEvents.length }}次）</div>
                <div v-if="recentPlayEndProbeEvents.length === 0" class="debug-empty">暂无</div>
                <div v-for="probe in recentPlayEndProbeEvents" :key="probe.id" class="debug-play-end-row">
                    <span>{{ probe.time }}</span>
                    <span>R{{ probe.roundId ?? 'N/A' }}</span>
                    <span>audio.t={{ formatSecValue(probe.maxCurrentTimeSec) }}</span>
                    <span>上游状态 {{ probe.lastInboundStateName || 'N/A' }}</span>
                    <span>Δ{{ formatMsValue(probe.lastInboundStateDeltaMs) }}</span>
                    <span>{{ probe.reason || 'N/A' }}</span>
                </div>
            </div>
            <div class="debug-block">
                <div class="debug-block-title">播放状态</div>
                <div v-if="remoteAudioStatusList.length === 0" class="debug-empty">暂无远端音频元素</div>
                <div v-for="audio in remoteAudioStatusList" :key="audio.sid" class="debug-audio-row">
                    <span>{{ audio.sid }}</span>
                    <span>{{ audio.playing ? 'playing' : 'idle' }}</span>
                    <span>t={{ audio.currentTime }}s</span>
                    <span>rdy={{ audio.readyState }}</span>
                    <span>net={{ audio.networkState }}</span>
                </div>
            </div>
            <div class="debug-block">
                <div class="debug-block-title">最近信令</div>
                <div v-if="latestSignalMessages.length === 0" class="debug-empty">暂无</div>
                <div
                    v-for="item in latestSignalMessages"
                    :key="item.timestamp + item.direction + item.payloadLength"
                    class="debug-signal-row"
                >
                    <span class="dir">{{ item.direction }}</span>
                    <span class="name">{{ item.stateName || 'text' }}</span>
                    <span class="payload">{{ item.payloadPreview }}</span>
                </div>
            </div>
            <div class="debug-block">
                <div class="debug-block-title">最近事件</div>
                <div v-if="debugEvents.length === 0" class="debug-empty">暂无</div>
                <div v-for="event in debugEvents" :key="event.id" class="debug-event-row">
                    <span>{{ event.time }}</span>
                    <span>{{ event.type }}</span>
                    <span>{{ event.detail }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ElMessage } from 'element-plus';
    import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';

    const props = defineProps({
        state: {
            type: Object,
            required: true
        },
        remoteAudioRefs: {
            type: Object,
            required: true
        },
        isCalling: {
            type: Boolean,
            default: false
        },
        callLoading: {
            type: Boolean,
            default: false
        },
        title: {
            type: String,
            default: '实时诊断'
        },
        context: {
            type: String,
            default: 'livekit'
        },
        top: {
            type: String,
            default: '84px'
        },
        right: {
            type: String,
            default: '24px'
        }
    });

    const state = props.state;
    const isCalling = toRef(props, 'isCalling');
    const callLoading = toRef(props, 'callLoading');

    const debugPanelVisible = ref(true);
    const debugPanelCollapsed = ref(false);
    const debugWaveCanvas = ref(null);
    const localWaveLevel = ref(0);
    const remoteWaveLevel = ref(0);
    const debugEvents = ref([]);
    const debugNow = ref(performance.now());

    const DEBUG_EVENT_LIMIT = 60;
    const DEBUG_SIGNAL_LIMIT = 12;
    const DEBUG_ROUND_LIMIT = 8;
    const DEBUG_SEGMENT_LIMIT = 80;
    const SHORT_REPLY_MAX_MS = 1300;
    const SHORT_REPLY_MAX_CURRENT_TIME_SEC = 1.35;

    let debugTickTimer = null;
    let debugWaveRafId = 0;
    let globalAudioContext = null;
    let localWaveSource = null;
    let localWaveAnalyser = null;
    let localWaveBuffer = null;
    let localWaveTrackId = '';
    let remoteWaveSource = null;
    let remoteWaveAnalyser = null;
    let remoteWaveBuffer = null;
    let remoteWaveTrackId = '';
    let localSpeakingSegment = null;
    let remoteSpeakingSegment = null;

    const localSpeechSegments = ref([]);
    const remoteSpeechSegments = ref([]);
    const playEndProbeEvents = ref([]);

    const toggleStyle = computed(() => ({
        top: props.top,
        right: props.right
    }));

    const panelStyle = computed(() => ({
        top: `calc(${props.top} + 38px)`,
        right: props.right
    }));

    const pendingNoAudioMs = computed(() => {
        if (!state.pendingNoAudioDueAt) return 0;
        return Math.max(0, Math.round(state.pendingNoAudioDueAt - debugNow.value));
    });

    const remoteAudioStatusList = computed(() => {
        debugNow.value;
        return Object.keys(state.remoteTracks || {}).map(sid => {
            const element = props.remoteAudioRefs[sid];
            return {
                sid,
                playing: element ? !element.paused && !element.ended : false,
                currentTime: element ? element.currentTime.toFixed(2) : '0.00',
                readyState: element ? element.readyState : -1,
                networkState: element ? element.networkState : -1
            };
        });
    });

    const latestSignalMessages = computed(() => {
        const list = Array.isArray(state.messages) ? state.messages : [];
        return list.slice(-DEBUG_SIGNAL_LIMIT).reverse().map(item => ({
            ...item,
            payloadPreview:
                typeof item.payload === 'string' && item.payload.length > 60
                    ? item.payload.slice(0, 60) + '...'
                    : item.payload || ''
        }));
    });

    const remoteSpeakingActive = computed(() => Object.values(state.remoteAudioActive || {}).some(Boolean));

    function appendLimited(listRef, value, limit = DEBUG_SEGMENT_LIMIT) {
        listRef.value.unshift(value);
        if (listRef.value.length > limit) {
            listRef.value.splice(limit);
        }
    }

    function formatMsValue(ms) {
        return typeof ms === 'number' && Number.isFinite(ms) ? `${Math.round(ms)}ms` : 'N/A';
    }

    function formatSecValue(sec) {
        return typeof sec === 'number' && Number.isFinite(sec) ? `${sec.toFixed(2)}s` : 'N/A';
    }

    function getLatestStateSignal(direction = 'in') {
        const list = Array.isArray(state.messages) ? state.messages : [];
        for (let i = list.length - 1; i >= 0; i--) {
            const message = list[i];
            if (message?.direction === direction && message?.stateName) {
                return message;
            }
        }
        return null;
    }

    const recentLocalSpeechSegments = computed(() => {
        return localSpeechSegments.value.slice(0, 8).map((segment, index) => {
            const olderSegment = localSpeechSegments.value[index + 1];
            const gapToOlderMs =
                olderSegment && typeof olderSegment.endAt === 'number' && typeof segment.startAt === 'number'
                    ? Math.max(0, segment.startAt - olderSegment.endAt)
                    : null;
            return {
                ...segment,
                time: new Date(segment.startAt).toLocaleTimeString(),
                gapToOlderMs
            };
        });
    });

    const recentPlayEndProbeEvents = computed(() => {
        return playEndProbeEvents.value.slice(0, 6).map(item => ({
            ...item,
            time: new Date(item.timestamp).toLocaleTimeString()
        }));
    });

    const roundDiagnostics = computed(() => {
        const signalEvents = (Array.isArray(state.messages) ? state.messages : [])
            .filter(item => item?.stateName && typeof item.timestamp === 'number')
            .map(item => ({
                direction: item.direction || 'in',
                name: item.stateName,
                roundId: Number.isInteger(item.stateRoundId) ? item.stateRoundId : null,
                timestamp: item.timestamp
            }));

        const rounds = new Map();
        const ensureRound = roundId => {
            if (!rounds.has(roundId)) {
                rounds.set(roundId, {
                    roundId,
                    roundStartAt: null,
                    generateStartAt: null,
                    audioStartAt: null,
                    ttsFirstPcmAt: null,
                    generateEndAt: null,
                    generateNoAudioAt: null,
                    playEndOutAt: null,
                    playEndAckAt: null,
                    playEndProbeAt: null,
                    playEndProbe: null,
                    deltaGenToFirstPacket: null,
                    deltaGenToFirstPlay: null,
                    deltaGenToActualPlay: null,
                    localAttemptsBeforeGenerate: 0,
                    vadEndsBeforeGenerate: 0,
                    msGenerateToAudioStart: null,
                    msGenerateToTtsFirstPcm: null,
                    msGenerateToGenerateEnd: null,
                    remoteSpeechTotalMs: 0,
                    remoteSpeechSegments: 0,
                    playEndMaxCurrentTimeSec: null,
                    shortReplySuspected: false,
                    hints: []
                });
            }
            return rounds.get(roundId);
        };

        signalEvents.forEach(event => {
            if (!Number.isInteger(event.roundId)) return;
            const row = ensureRound(event.roundId);
            if (event.direction === 'in') {
                if (event.name === 'round_start' && !row.roundStartAt) row.roundStartAt = event.timestamp;
                if (event.name === 'generate_start' && !row.generateStartAt) row.generateStartAt = event.timestamp;
                if (event.name === 'audio_start' && !row.audioStartAt) row.audioStartAt = event.timestamp;
                if (event.name === 'tts_first_pcm' && !row.ttsFirstPcmAt) row.ttsFirstPcmAt = event.timestamp;
                if (event.name === 'generate_end') row.generateEndAt = event.timestamp;
                if (event.name === 'generate_no_audio') row.generateNoAudioAt = event.timestamp;
                if (event.name === 'play_end_success') row.playEndAckAt = event.timestamp;
            } else if (event.direction === 'out' && event.name === 'play_end') {
                row.playEndOutAt = event.timestamp;
            }
        });

        (Array.isArray(state.audioRounds) ? state.audioRounds : []).forEach(round => {
            if (!Number.isInteger(round?.roundId)) return;
            const row = ensureRound(round.roundId);
            if (typeof round.deltas?.fromGenerateStart === 'number') {
                row.deltaGenToFirstPacket = round.deltas.fromGenerateStart;
            }
            if (typeof round.deltas?.fromGenerateStartToPlay === 'number') {
                row.deltaGenToFirstPlay = round.deltas.fromGenerateStartToPlay;
            }
            if (typeof round.deltas?.fromGenerateStartToActualPlay === 'number') {
                row.deltaGenToActualPlay = round.deltas.fromGenerateStartToActualPlay;
            }
        });

        playEndProbeEvents.value.forEach(probe => {
            if (!Number.isInteger(probe?.roundId)) return;
            const row = ensureRound(probe.roundId);
            if (!row.playEndProbeAt || probe.timestamp >= row.playEndProbeAt) {
                row.playEndProbeAt = probe.timestamp;
                row.playEndProbe = probe;
            }
        });

        const rows = Array.from(rounds.values());
        const vadEndSignals = signalEvents
            .filter(event => event.direction === 'in' && event.name === 'vad_end')
            .map(event => event.timestamp)
            .sort((a, b) => a - b);

        const roundStartTimeline = rows
            .map(row => ({
                roundId: row.roundId,
                startAt: row.generateStartAt || row.roundStartAt || null
            }))
            .filter(item => typeof item.startAt === 'number')
            .sort((a, b) => a.startAt - b.startAt);

        rows.forEach(row => {
            const anchorStart = row.generateStartAt || row.roundStartAt || null;
            let previousRoundStart = 0;
            if (typeof anchorStart === 'number') {
                for (const item of roundStartTimeline) {
                    if (item.startAt < anchorStart) {
                        previousRoundStart = item.startAt;
                        continue;
                    }
                    break;
                }
                row.localAttemptsBeforeGenerate = localSpeechSegments.value.filter(
                    segment =>
                        typeof segment.endAt === 'number' &&
                        segment.endAt > previousRoundStart &&
                        segment.endAt <= anchorStart
                ).length;
                row.vadEndsBeforeGenerate = vadEndSignals.filter(
                    timestamp => timestamp > previousRoundStart && timestamp <= anchorStart
                ).length;
            }

            row.msGenerateToAudioStart =
                typeof row.generateStartAt === 'number' && typeof row.audioStartAt === 'number'
                    ? row.audioStartAt - row.generateStartAt
                    : null;
            row.msGenerateToTtsFirstPcm =
                typeof row.generateStartAt === 'number' && typeof row.ttsFirstPcmAt === 'number'
                    ? row.ttsFirstPcmAt - row.generateStartAt
                    : null;
            row.msGenerateToGenerateEnd =
                typeof row.generateStartAt === 'number' && typeof row.generateEndAt === 'number'
                    ? row.generateEndAt - row.generateStartAt
                    : null;

            let rangeStart = row.generateStartAt || row.roundStartAt || null;
            if (typeof rangeStart !== 'number') {
                rangeStart = row.audioStartAt || row.generateEndAt || null;
            }
            const rangeEndCandidates = [row.playEndAckAt, row.playEndOutAt, row.playEndProbeAt].filter(
                value => typeof value === 'number'
            );
            const rangeEnd =
                rangeEndCandidates.length > 0
                    ? Math.max(...rangeEndCandidates)
                    : typeof row.generateEndAt === 'number'
                      ? row.generateEndAt + 4000
                      : null;

            let remoteSpeechTotalMs = 0;
            let remoteSpeechSegmentsCount = 0;
            if (typeof rangeStart === 'number' && typeof rangeEnd === 'number' && rangeEnd >= rangeStart) {
                remoteSpeechSegments.value.forEach(segment => {
                    const segmentStart = segment.startAt;
                    const segmentEnd = segment.endAt || Date.now();
                    if (typeof segmentStart !== 'number' || typeof segmentEnd !== 'number') return;
                    const overlapMs = Math.max(0, Math.min(rangeEnd, segmentEnd) - Math.max(rangeStart, segmentStart));
                    if (overlapMs > 0) {
                        remoteSpeechTotalMs += overlapMs;
                        remoteSpeechSegmentsCount += 1;
                    }
                });
            }
            row.remoteSpeechTotalMs = Math.round(remoteSpeechTotalMs);
            row.remoteSpeechSegments = remoteSpeechSegmentsCount;
            row.playEndMaxCurrentTimeSec =
                typeof row.playEndProbe?.maxCurrentTimeSec === 'number' ? row.playEndProbe.maxCurrentTimeSec : null;
            row.shortReplySuspected =
                (typeof row.playEndMaxCurrentTimeSec === 'number' &&
                    row.playEndMaxCurrentTimeSec > 0 &&
                    row.playEndMaxCurrentTimeSec <= SHORT_REPLY_MAX_CURRENT_TIME_SEC) ||
                (row.remoteSpeechTotalMs > 0 && row.remoteSpeechTotalMs <= SHORT_REPLY_MAX_MS);

            const hints = [];
            if (row.localAttemptsBeforeGenerate >= 2) {
                hints.push(`本地说话 ${row.localAttemptsBeforeGenerate} 次后才触发生成`);
            }
            if (row.localAttemptsBeforeGenerate > 0 && row.vadEndsBeforeGenerate === 0) {
                hints.push('本地说话后未观测到 vad_end');
            }
            if (row.generateNoAudioAt) {
                hints.push('收到 generate_no_audio');
            }
            if (row.shortReplySuspected) {
                hints.push('疑似短回复或提前 play_end');
            }
            row.hints = hints;
        });

        return rows
            .sort((left, right) => {
                const leftAnchor = left.generateStartAt || left.roundStartAt || 0;
                const rightAnchor = right.generateStartAt || right.roundStartAt || 0;
                if (leftAnchor !== rightAnchor) return rightAnchor - leftAnchor;
                return (right.roundId || 0) - (left.roundId || 0);
            })
            .slice(0, DEBUG_ROUND_LIMIT);
    });

    function safeStringify(value) {
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(value);
        }
    }

    function pushDebugEvent(type, detail) {
        const detailText = safeStringify(detail);
        debugEvents.value.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            time: new Date().toLocaleTimeString(),
            type,
            detail: detailText.length > 140 ? detailText.slice(0, 140) + '...' : detailText
        });
        if (debugEvents.value.length > DEBUG_EVENT_LIMIT) {
            debugEvents.value.splice(DEBUG_EVENT_LIMIT);
        }
    }

    function getWaveRmsLevel(buffer) {
        if (!buffer || buffer.length === 0) return 0;
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            const normalized = (buffer[i] - 128) / 128;
            sum += normalized * normalized;
        }
        return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
    }

    function ensureDebugAudioContext() {
        if (!globalAudioContext) {
            globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (globalAudioContext.state === 'suspended') {
            globalAudioContext.resume().catch(() => {});
        }
        return globalAudioContext;
    }

    function teardownLocalWaveAnalyser() {
        if (localWaveSource) {
            localWaveSource.disconnect();
            localWaveSource = null;
        }
        if (localWaveAnalyser) {
            localWaveAnalyser.disconnect();
            localWaveAnalyser = null;
        }
        localWaveBuffer = null;
        localWaveTrackId = '';
    }

    function teardownRemoteWaveAnalyser() {
        if (remoteWaveSource) {
            remoteWaveSource.disconnect();
            remoteWaveSource = null;
        }
        if (remoteWaveAnalyser) {
            remoteWaveAnalyser.disconnect();
            remoteWaveAnalyser = null;
        }
        remoteWaveBuffer = null;
        remoteWaveTrackId = '';
    }

    function setupLocalWaveAnalyser() {
        const localTrack = (state.localTracks || []).find(track => track.kind === 'audio' && track.mediaStreamTrack);
        const trackId = localTrack?.mediaStreamTrack?.id || '';
        if (!trackId) {
            teardownLocalWaveAnalyser();
            localWaveLevel.value = state.localAudioActive ? 0.3 : 0;
            return;
        }
        if (trackId === localWaveTrackId && localWaveAnalyser) return;

        teardownLocalWaveAnalyser();
        try {
            const context = ensureDebugAudioContext();
            const stream = new MediaStream([localTrack.mediaStreamTrack]);
            localWaveSource = context.createMediaStreamSource(stream);
            localWaveAnalyser = context.createAnalyser();
            localWaveAnalyser.fftSize = 512;
            localWaveBuffer = new Uint8Array(localWaveAnalyser.frequencyBinCount);
            localWaveSource.connect(localWaveAnalyser);
            localWaveTrackId = trackId;
            pushDebugEvent('local-wave', `track=${trackId}`);
        } catch (error) {
            pushDebugEvent('local-wave-error', error?.message || error);
        }
    }

    function setupRemoteWaveAnalyser() {
        let remoteTrack = null;
        for (const sid of Object.keys(state.remoteTracks || {})) {
            const track = (state.remoteTracks[sid] || []).find(item => item.kind === 'audio' && item.mediaStreamTrack);
            if (track) {
                remoteTrack = track;
                break;
            }
        }

        const trackId = remoteTrack?.mediaStreamTrack?.id || '';
        if (!trackId) {
            teardownRemoteWaveAnalyser();
            remoteWaveLevel.value = Object.values(state.remoteAudioActive || {}).some(Boolean) ? 0.3 : 0;
            return;
        }
        if (trackId === remoteWaveTrackId && remoteWaveAnalyser) return;

        teardownRemoteWaveAnalyser();
        try {
            const context = ensureDebugAudioContext();
            const stream = new MediaStream([remoteTrack.mediaStreamTrack]);
            remoteWaveSource = context.createMediaStreamSource(stream);
            remoteWaveAnalyser = context.createAnalyser();
            remoteWaveAnalyser.fftSize = 512;
            remoteWaveBuffer = new Uint8Array(remoteWaveAnalyser.frequencyBinCount);
            remoteWaveSource.connect(remoteWaveAnalyser);
            remoteWaveTrackId = trackId;
            pushDebugEvent('remote-wave', `track=${trackId}`);
        } catch (error) {
            pushDebugEvent('remote-wave-error', error?.message || error);
        }
    }

    function drawWavePath(ctx, buffer, baseline, color, fallbackLevel = 0) {
        const width = ctx.canvas.width / (window.devicePixelRatio || 1);
        const maxHeight = 22;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;

        if (!buffer || buffer.length === 0) {
            for (let x = 0; x < width; x++) {
                const y = baseline + Math.sin((x / 24) * Math.PI + performance.now() / 130) * fallbackLevel * maxHeight;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            return;
        }

        for (let x = 0; x < width; x++) {
            const idx = Math.min(buffer.length - 1, Math.floor((x / width) * buffer.length));
            const v = (buffer[idx] - 128) / 128;
            const y = baseline + v * maxHeight;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    function renderDebugWave() {
        const canvas = debugWaveCanvas.value;
        if (!canvas) {
            debugWaveRafId = requestAnimationFrame(renderDebugWave);
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 360;
        const height = canvas.clientHeight || 120;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
            canvas.width = width * dpr;
            canvas.height = height * dpr;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            debugWaveRafId = requestAnimationFrame(renderDebugWave);
            return;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        const topLine = 34;
        const bottomLine = 86;
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, topLine);
        ctx.lineTo(width, topLine);
        ctx.moveTo(0, bottomLine);
        ctx.lineTo(width, bottomLine);
        ctx.stroke();

        if (localWaveAnalyser && localWaveBuffer) {
            localWaveAnalyser.getByteTimeDomainData(localWaveBuffer);
            localWaveLevel.value = getWaveRmsLevel(localWaveBuffer);
        } else {
            localWaveLevel.value = state.localAudioActive ? 0.4 : Math.max(0, localWaveLevel.value * 0.9);
        }

        if (remoteWaveAnalyser && remoteWaveBuffer) {
            remoteWaveAnalyser.getByteTimeDomainData(remoteWaveBuffer);
            remoteWaveLevel.value = getWaveRmsLevel(remoteWaveBuffer);
        } else {
            remoteWaveLevel.value = Object.values(state.remoteAudioActive || {}).some(Boolean)
                ? 0.4
                : Math.max(0, remoteWaveLevel.value * 0.9);
        }

        drawWavePath(ctx, localWaveBuffer, topLine, '#22d3ee', localWaveLevel.value);
        drawWavePath(ctx, remoteWaveBuffer, bottomLine, '#f97316', remoteWaveLevel.value);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText('local', 8, 15);
        ctx.fillText('remote', 8, 66);

        debugWaveRafId = requestAnimationFrame(renderDebugWave);
    }

    function getLocalTrackKey() {
        return (state.localTracks || [])
            .map(track => `${track.kind}:${track.mediaStreamTrack?.id || track.sid || ''}`)
            .join('|');
    }

    function getRemoteTrackKey() {
        return Object.keys(state.remoteTracks || {})
            .sort()
            .map(sid =>
                (state.remoteTracks[sid] || [])
                    .map(track => `${sid}:${track.kind}:${track.mediaStreamTrack?.id || track.sid || ''}`)
                    .join('|')
            )
            .join('##');
    }

    function copyDebugSnapshot() {
        const snapshot = {
            timestamp: new Date().toISOString(),
            context: props.context,
            state: {
                connected: state.connected,
                status: state.status,
                isCalling: isCalling.value,
                callLoading: callLoading.value,
                localAudioActive: state.localAudioActive,
                remoteAudioActive: state.remoteAudioActive,
                currentGenerateRoundId: state.currentGenerateRoundId,
                playEndSent: state.playEndSent,
                playEndRoundId: state.playEndRoundId,
                pendingNoAudioMs: pendingNoAudioMs.value
            },
            cache: {
                signalMessages: state.messages?.length || 0,
                chatMessages: state.chatMessages?.length || 0,
                audioRounds: state.audioRounds?.length || 0
            },
            audioElements: remoteAudioStatusList.value,
            diagnostics: {
                roundDiagnostics: roundDiagnostics.value,
                recentLocalSpeechSegments: recentLocalSpeechSegments.value,
                recentPlayEndProbeEvents: recentPlayEndProbeEvents.value,
                playEndHistory: state.debugPlayEndHistory || []
            },
            recentSignals: latestSignalMessages.value,
            recentEvents: debugEvents.value.slice(0, 20)
        };

        const text = JSON.stringify(snapshot, null, 2);
        if (!navigator.clipboard?.writeText) {
            ElMessage({
                type: 'warning',
                message: '当前浏览器不支持剪贴板 API',
                duration: 2200
            });
            return;
        }

        navigator.clipboard
            .writeText(text)
            .then(() => {
                ElMessage({
                    type: 'success',
                    message: '诊断快照已复制',
                    duration: 1800
                });
            })
            .catch(() => {
                ElMessage({
                    type: 'warning',
                    message: '复制失败，请检查浏览器剪贴板权限',
                    duration: 2200
                });
            });
    }

    function clearDebugEvents() {
        debugEvents.value = [];
        localSpeechSegments.value = [];
        remoteSpeechSegments.value = [];
        playEndProbeEvents.value = [];
        localSpeakingSegment = null;
        remoteSpeakingSegment = null;
    }

    function startDebugRuntime() {
        if (!debugTickTimer) {
            debugTickTimer = setInterval(() => {
                debugNow.value = performance.now();
            }, 250);
        }
        if (!debugWaveRafId) {
            debugWaveRafId = requestAnimationFrame(renderDebugWave);
        }
    }

    function stopDebugRuntime() {
        if (debugTickTimer) {
            clearInterval(debugTickTimer);
            debugTickTimer = null;
        }
        if (debugWaveRafId) {
            cancelAnimationFrame(debugWaveRafId);
            debugWaveRafId = 0;
        }
        teardownLocalWaveAnalyser();
        teardownRemoteWaveAnalyser();
        if (globalAudioContext) {
            globalAudioContext.close().catch(() => {});
            globalAudioContext = null;
        }
    }

    watch(
        () => state.status,
        (next, prev) => {
            pushDebugEvent('status', `${prev || 'empty'} -> ${next || 'empty'}`);
        },
        { immediate: true }
    );

    watch(
        () => state.connected,
        connected => {
            pushDebugEvent('connection', connected ? 'connected' : 'disconnected');
            if (!connected) {
                const now = Date.now();
                if (localSpeakingSegment) {
                    appendLimited(localSpeechSegments, {
                        ...localSpeakingSegment,
                        endAt: now,
                        durationMs: Math.max(0, now - localSpeakingSegment.startAt),
                        statusAtEnd: state.status || 'empty',
                        roundIdAtEnd: state.currentGenerateRoundId ?? null,
                        forcedEnd: true
                    });
                    localSpeakingSegment = null;
                }
                if (remoteSpeakingSegment) {
                    appendLimited(remoteSpeechSegments, {
                        ...remoteSpeakingSegment,
                        endAt: now,
                        durationMs: Math.max(0, now - remoteSpeakingSegment.startAt),
                        statusAtEnd: state.status || 'empty',
                        roundIdAtEnd: state.currentGenerateRoundId ?? null,
                        forcedEnd: true
                    });
                    remoteSpeakingSegment = null;
                }
            }
        },
        { immediate: true }
    );

    watch(
        () => state.localAudioActive,
        active => {
            const now = Date.now();
            if (active) {
                if (!localSpeakingSegment) {
                    localSpeakingSegment = {
                        id: `local-${now}-${Math.random().toString(36).slice(2, 7)}`,
                        startAt: now,
                        statusAtStart: state.status || 'empty',
                        roundIdAtStart: state.currentGenerateRoundId ?? null
                    };
                }
            } else if (localSpeakingSegment) {
                appendLimited(localSpeechSegments, {
                    ...localSpeakingSegment,
                    endAt: now,
                    durationMs: Math.max(0, now - localSpeakingSegment.startAt),
                    statusAtEnd: state.status || 'empty',
                    roundIdAtEnd: state.currentGenerateRoundId ?? null
                });
                localSpeakingSegment = null;
            }
            pushDebugEvent('local-audio', active ? 'active' : 'idle');
        }
    );

    watch(
        () => JSON.stringify(state.remoteAudioActive || {}),
        payload => {
            pushDebugEvent('remote-audio', payload);
        }
    );

    watch(remoteSpeakingActive, active => {
        const now = Date.now();
        if (active) {
            if (!remoteSpeakingSegment) {
                remoteSpeakingSegment = {
                    id: `remote-${now}-${Math.random().toString(36).slice(2, 7)}`,
                    startAt: now,
                    statusAtStart: state.status || 'empty',
                    roundIdAtStart: state.currentGenerateRoundId ?? null
                };
            }
        } else if (remoteSpeakingSegment) {
            appendLimited(remoteSpeechSegments, {
                ...remoteSpeakingSegment,
                endAt: now,
                durationMs: Math.max(0, now - remoteSpeakingSegment.startAt),
                statusAtEnd: state.status || 'empty',
                roundIdAtEnd: state.currentGenerateRoundId ?? null
            });
            remoteSpeakingSegment = null;
        }
    });

    watch(
        () => state.currentGenerateRoundId,
        roundId => {
            if (roundId !== null && roundId !== undefined) {
                pushDebugEvent('round', `current=${roundId}`);
            }
        }
    );

    watch(
        () => state.playEndSent,
        flag => {
            if (flag) {
                const now = Date.now();
                const audioElements = Object.keys(props.remoteAudioRefs || {}).map(sid => {
                    const element = props.remoteAudioRefs[sid];
                    return {
                        sid,
                        currentTimeSec:
                            element && Number.isFinite(element.currentTime) ? Number(element.currentTime.toFixed(3)) : 0
                    };
                });
                const maxCurrentTimeSec =
                    audioElements.length > 0
                        ? Math.max(...audioElements.map(item => item.currentTimeSec || 0))
                        : 0;
                const lastInboundState = getLatestStateSignal('in');
                appendLimited(
                    playEndProbeEvents,
                    {
                        id: `play-end-${now}-${Math.random().toString(36).slice(2, 7)}`,
                        timestamp: now,
                        roundId: state.playEndRoundId ?? state.currentGenerateRoundId ?? null,
                        reason: state.debugLastPlayEnd?.reason || '',
                        maxCurrentTimeSec,
                        audioElements,
                        lastInboundStateName: lastInboundState?.stateName || '',
                        lastInboundStateDeltaMs:
                            lastInboundState && typeof lastInboundState.timestamp === 'number'
                                ? Math.max(0, now - lastInboundState.timestamp)
                                : null
                    },
                    20
                );
            }
            pushDebugEvent('play_end', flag ? 'sent' : 'reset');
        }
    );

    watch(
        () => (state.messages || []).length,
        (next, prev) => {
            if (next <= prev) return;
            const last = state.messages[next - 1];
            if (!last) return;
            pushDebugEvent('signal', `${last.direction}/${last.stateName || 'text'}`);
        }
    );

    watch(getLocalTrackKey, () => {
        setupLocalWaveAnalyser();
    }, { immediate: true });

    watch(getRemoteTrackKey, () => {
        setupRemoteWaveAnalyser();
    }, { immediate: true });

    onMounted(() => {
        startDebugRuntime();
    });

    onBeforeUnmount(() => {
        stopDebugRuntime();
    });
</script>

<style lang="less" scoped>
    .debug-panel-toggle {
        position: fixed;
        z-index: 999;
        height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(77, 106, 169, 0.4);
        background: rgba(255, 255, 255, 0.9);
        color: #1e3a8a;
        font-size: 12px;
        line-height: 30px;
        cursor: pointer;
        user-select: none;
        backdrop-filter: blur(6px);
    }

    .debug-panel {
        position: fixed;
        z-index: 998;
        width: min(460px, calc(100vw - 32px));
        max-height: calc(100vh - 170px);
        border-radius: 12px;
        border: 1px solid rgba(203, 213, 225, 0.7);
        background: rgba(15, 23, 42, 0.94);
        color: #e2e8f0;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.25);
        overflow: hidden;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
    }

    .debug-panel.collapsed {
        max-height: 42px;
    }

    .debug-panel-header {
        height: 42px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(15, 23, 42, 0.98);
    }

    .debug-panel-title {
        font-size: 12px;
        color: #93c5fd;
        letter-spacing: 0.2px;
    }

    .debug-panel-actions {
        display: flex;
        gap: 6px;
    }

    .debug-action-btn {
        height: 24px;
        padding: 0 8px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        background: rgba(30, 41, 59, 0.9);
        color: #e2e8f0;
        font-size: 11px;
        cursor: pointer;
    }

    .debug-panel-body {
        padding: 10px;
        overflow: auto;
        max-height: calc(100vh - 220px);
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .debug-wave-card {
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 10px;
        padding: 8px;
        background: rgba(15, 23, 42, 0.9);
    }

    .debug-wave-canvas {
        width: 100%;
        height: 118px;
        border-radius: 8px;
        display: block;
        background: #0f172a;
    }

    .debug-wave-meta {
        margin-top: 6px;
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #cbd5e1;
    }

    .debug-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 8px;
        font-size: 11px;
        line-height: 1.4;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 10px;
        padding: 8px;
        background: rgba(30, 41, 59, 0.38);
    }

    .debug-block {
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 10px;
        padding: 8px;
        background: rgba(30, 41, 59, 0.38);
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .debug-block-title {
        font-size: 11px;
        color: #93c5fd;
    }

    .debug-empty {
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.4;
    }

    .debug-audio-row,
    .debug-signal-row,
    .debug-event-row {
        display: grid;
        gap: 6px;
        align-items: center;
        font-size: 11px;
        line-height: 1.3;
    }

    .debug-audio-row {
        grid-template-columns: 1.2fr 0.8fr 0.9fr 0.7fr 0.7fr;
    }

    .debug-signal-row {
        grid-template-columns: 0.6fr 0.9fr 2.5fr;
    }

    .debug-event-row {
        grid-template-columns: 0.9fr 0.9fr 2.2fr;
    }

    .debug-summary-row,
    .debug-round-row,
    .debug-local-segment-row,
    .debug-play-end-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        align-items: center;
        font-size: 11px;
        line-height: 1.35;
        border-top: 1px dashed rgba(148, 163, 184, 0.24);
        padding-top: 4px;
    }

    .debug-round-row .round-id {
        color: #fbbf24;
    }

    .debug-round-row .hints {
        width: 100%;
        color: #fda4af;
    }

    .debug-signal-row .dir {
        color: #fbbf24;
    }

    .debug-signal-row .name {
        color: #22d3ee;
    }

    .debug-signal-row .payload {
        color: #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    @media (max-width: 900px) {
        .debug-panel-toggle {
            font-size: 11px;
            height: 28px;
            line-height: 28px;
            padding: 0 10px;
        }

        .debug-panel {
            width: min(92vw, 420px);
            max-height: calc(100vh - 160px);
        }
    }
</style>
