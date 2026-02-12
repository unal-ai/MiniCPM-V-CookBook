<template>
    <div class="remote-audio" v-for="(tracks, sid) in state.remoteTracks" :key="sid">
        <audio :ref="setRemoteAudioRef(sid)" autoplay playsinline preload="auto" :muted="false"></audio>
    </div>
    <div class="voice-page" v-loading="loading" element-loading-background="rgba(255, 255, 255, 1)">
        <div class="voice-page-content">
            <div class="gif-container" v-if="isCalling || state.status === 'connecting'">
                <VoiceGifCopy
                    :status="state.status"
                    :animationGroup="modelType === 'simplex' ? 1 : 5"
                    :mode="modelType"
                />
            </div>
        </div>
        <div class="voice-page-footer">
            <!-- <el-button @click="openSelector">打开语音选择器</el-button>
            <VoiceSelectorDialog ref="selectorDialog" @confirm="handleVoice" /> -->
            <div class="footer-btn">
                <section v-if="!isCalling" @click="handleStartClick">
                    <SvgIcon
                        name="start"
                        :class="`start-icon ${!state.connected || callLoading ? 'start-icon-disabled' : ''}`"
                    />
                </section>
                <section v-if="isCalling && state.status && state.status !== 'connecting'">
                    <div class="text-btn">
                        <SvgIcon name="text" class="text-icon" @click="showText = true" />
                    </div>
                    <SvgIcon name="end" class="end-icon" @click="stopRecording" />
                    <div class="microphone-btn" @click="toggleMic">
                        <SvgIcon v-if="state.audioEnabled" name="microphone-on" class="microphone-on-icon" />
                        <SvgIcon v-else name="microphone-off" class="microphone-off-icon" />
                    </div>
                </section>
                <div class="interrupt-btn" v-if="isCalling && state.status === 'talking'" @click="interruptChat">
                    <SvgIcon name="interrupt" class="interrupt-icon" />
                    <span>{{ t('audioInterruptionBtn') }}</span>
                </div>
            </div>
            <div :class="`footer-tips ${isCalling ? 'hidden-tips' : ''}`">
                {{ callLoading ? t('connecting') : t('startBtnText') }}
            </div>
        </div>
    </div>
    <div class="debug-panel-toggle" @click="debugPanelVisible = !debugPanelVisible">
        {{ debugPanelVisible ? '隐藏诊断' : '显示诊断' }}
    </div>
    <div v-if="debugPanelVisible" class="debug-panel" :class="{ collapsed: debugPanelCollapsed }">
        <div class="debug-panel-header">
            <div class="debug-panel-title">实时诊断</div>
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
                <div>远端说话: {{ Object.values(state.remoteAudioActive).some(Boolean) ? 'yes' : 'no' }}</div>
                <div>轮次ID: {{ state.currentGenerateRoundId ?? 'N/A' }}</div>
                <div>play_end: {{ state.playEndSent ? 'sent' : 'idle' }}</div>
                <div>no-audio剩余: {{ pendingNoAudioMs }}ms</div>
                <div>消息缓存: {{ state.messages.length }}</div>
                <div>聊天缓存: {{ state.chatMessages.length }}</div>
                <div>音频轮次: {{ state.audioRounds.length }}</div>
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
                <div v-for="item in latestSignalMessages" :key="item.timestamp + item.direction + item.payloadLength" class="debug-signal-row">
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
    <DraggableDialog v-if="showText" :message="state.chatMessages" @close="showText = false" />
</template>
<script setup>
    import { sendMessage, stopMessage, uploadConfig, getRtcToken, logoutRtc } from '@/apis';
    import { encodeWAV } from '@/hooks/useVoice';
    import { getNewUserId, setNewUserId } from '@/hooks/useRandomId';
    import { fetchEventSource } from '@microsoft/fetch-event-source';
    import { MicVAD } from '@ricky0123/vad-web';
    import { voiceConfigList, voiceIdeasList, showIdeasList } from '@/enums';
    import { saveSessionId } from '@/utils/sessionStorage';
    import { getChunkLength, formatTimestamp, getErrorLogs, setErrorLogs } from '@/utils';
    import { mergeBase64ToBlob } from './merge';
    import { mergeBase64AudioSegments } from './mergeAudio';
    import WebSocketService from '@/utils/websocket';
    import { useI18n } from 'vue-i18n';
    import { useRoute } from 'vue-router';
    const route = useRoute();
    // import AutoPlayAudioStream from '@/hooks/usePlay';
    import AutoPlayAudioStream from '@/views/test/bestPlayVoice';
    import VoiceGifCopy from '@/components/VoiceGifCopy/index.vue';

    // import AudioPlayer from './audioPlayer/useAudioStream';
    // const audioStream = AudioPlayer();

    import {
        useLiveKit,
        registerCleanup,
        registerTrackSubscribed,
        triggerCleanup,
        triggerNoRobotTimeout,
        getNoRobotTimerStatus
    } from '@/hooks/useLiveKit';
    import { resolveLivekitUrl } from '@/utils/rtcUrl';

    const { state, joinRoom, sendText, sendAndLeave, switchCamera, toggleMic, toggleCam, markAudioActualPlay } =
        useLiveKit();

    // 全局AudioContext预热
    let globalAudioContext = null;

    import useAudioStream from '@/audio-core/useAudioStream';
    let streamPlayer = null;

    const { t, locale } = useI18n();

    let ctrl = new AbortController();
    let socket = null;
    const audioData = ref({
        base64Str: '',
        type: 'mp3'
    }); // 自定义音色base64
    const isCalling = defineModel('isCalling');
    const loading = defineModel('loading');
    defineProps({
        modelType: {
            type: String,
            default: 'simplex'
        }
    });
    const taskQueue = ref([]);
    const running = ref(false);
    const outputData = ref([]);
    const textQueue = ref('');
    const textAnimationInterval = ref();

    const isFirstReturn = ref(true); // 首次返回的音频是前端发给后端的音频片段，需要单独处理

    const audioPlayQueue = ref([]);
    const base64List = ref([]);
    const playing = ref(false);
    const skipDisabled = ref(true);
    const stopFlag = ref(false);
    const timbre = ref([1]);
    const isReturnError = ref(false);
    const allVoice = ref([]);
    const callDisabled = ref(true);
    const isMicrophoneOn = ref(true); // 麦克风开关状态

    const feedbackStatus = ref('');
    const curResponseId = ref('');
    const delayTimestamp = ref(0); // 当前发送片延时
    const delayCount = ref(0); // 当前剩余多少ms未发送到接口

    const callLoading = ref(false);

    const modelVersion = ref('');

    const token = ref('');
    const userId = ref('');

    const showText = ref(false);

    const audioPlayer = ref(null);

    let audioDOM;

    const isEnd = ref(false); // sse接口关闭，认为模型已完成本次返回

    const emits = defineEmits(['handleLogin', 'updateSessionId']);

    // 远端每个用户的 <audio> 引用集合
    const remoteAudioRefs = {};
    const attachedAudioTrackBySid = new Map();
    const AUDIO_ATTACH_DEBUG = import.meta.env.DEV && localStorage.getItem('LK_AUDIO_ATTACH_DEBUG') === '1';

    function logAudioAttachDebug(...args) {
        if (AUDIO_ATTACH_DEBUG) {
            console.log(...args);
        }
    }

    // 性能监测
    const performanceMetrics = {
        firstAudioAttachTime: null,
        firstAudioPlayTime: null,
        audioContextResumeTime: null
    };

    const debugPanelVisible = ref(true);
    const debugPanelCollapsed = ref(false);
    const debugWaveCanvas = ref(null);
    const localWaveLevel = ref(0);
    const remoteWaveLevel = ref(0);
    const debugEvents = ref([]);
    const debugNow = ref(performance.now());

    const DEBUG_EVENT_LIMIT = 60;
    const DEBUG_SIGNAL_LIMIT = 12;

    let debugTickTimer = null;
    let debugWaveRafId = 0;
    let localWaveSource = null;
    let localWaveAnalyser = null;
    let localWaveBuffer = null;
    let localWaveTrackId = '';
    let remoteWaveSource = null;
    let remoteWaveAnalyser = null;
    let remoteWaveBuffer = null;
    let remoteWaveTrackId = '';

    const pendingNoAudioMs = computed(() => {
        if (!state.pendingNoAudioDueAt) return 0;
        return Math.max(0, Math.round(state.pendingNoAudioDueAt - debugNow.value));
    });

    const remoteAudioStatusList = computed(() => {
        debugNow.value;
        return Object.keys(state.remoteTracks || {}).map(sid => {
            const element = remoteAudioRefs[sid];
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
        const localTrack = state.localTracks.find(track => track.kind === 'audio' && track.mediaStreamTrack);
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
            remoteWaveLevel.value = Object.values(state.remoteAudioActive).some(Boolean) ? 0.3 : 0;
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
            remoteWaveLevel.value = Object.values(state.remoteAudioActive).some(Boolean)
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
        return state.localTracks
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
                signalMessages: state.messages.length,
                chatMessages: state.chatMessages.length,
                audioRounds: state.audioRounds.length
            },
            audioElements: remoteAudioStatusList.value,
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

        navigator.clipboard.writeText(text).then(() => {
            ElMessage({
                type: 'success',
                message: '诊断快照已复制',
                duration: 1800
            });
        }).catch(() => {
            ElMessage({
                type: 'warning',
                message: '复制失败，请检查浏览器剪贴板权限',
                duration: 2200
            });
        });
    }

    function clearDebugEvents() {
        debugEvents.value = [];
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
    }

    /**
     * 简化的音频轨道attach函数 - 专注于速度
     */
    function attachAudioTrackImmediate(track, audioElement, sid, source = 'unknown') {
        const startTime = performance.now();
        if (!track || !audioElement) return false;

        const trackSid = track?.sid || track?.mediaStreamTrack?.id || 'unknown-track';
        const attachKey = `${sid}:${trackSid}`;

        // 幂等保护：相同 sid + 相同 track 已经挂到同一个 audio 元素时，不重复 attach
        if (audioElement.dataset.lkAttachKey === attachKey) {
            return false;
        }

        if (attachedAudioTrackBySid.get(sid) === trackSid && remoteAudioRefs[sid] === audioElement) {
            audioElement.dataset.lkAttachKey = attachKey;
            return false;
        }

        try {
            track.attach(audioElement);
            audioElement.dataset.lkAttachKey = attachKey;
            attachedAudioTrackBySid.set(sid, trackSid);

            // 记录性能指标
            if (!performanceMetrics.firstAudioAttachTime) {
                performanceMetrics.firstAudioAttachTime = performance.now();
            }

            logAudioAttachDebug(`🔊 音频轨道attach: ${(performance.now() - startTime).toFixed(2)}ms`, {
                sid,
                source,
                trackSid
            });
            return true;
        } catch (error) {
            console.error('音频轨道attach失败:', error, { sid });
            return false;
        }
    }

    /**
     * 优化的远端 <audio> ref 回调 - 激进低延迟版本
     */
    function setRemoteAudioRef(sid) {
        return el => {
            if (!el) return;
            if (remoteAudioRefs[sid] === el) return;

            const refStart = performance.now();

            // 设置优化属性
            el.autoplay = true;
            el.playsInline = true;
            el.preload = 'none'; // 不预加载，减少初始化延迟
            el.muted = false;
            // 标记为 LiveKit 附加音频，便于精准 DOM 检查
            el.setAttribute('data-livekit-audio', sid);

            // 添加性能监测事件
            el.onloadstart = () => {
                logAudioAttachDebug(`🎵 音频开始加载: ${sid}, ${performance.now()}`);
            };

            el.oncanplay = () => {
                logAudioAttachDebug(`🎵 音频可播放: ${sid}, ${performance.now()}`);
            };

            el.onplay = () => {
                const playTime = performance.now();
                if (!performanceMetrics.firstAudioPlayTime) {
                    performanceMetrics.firstAudioPlayTime = playTime;
                    logAudioAttachDebug(`🎵 首次音频播放: ${sid}, 时间: ${playTime}`);
                } else {
                    logAudioAttachDebug(`🎵 音频播放: ${sid}, 时间: ${playTime}`);
                }
                // 记录到全局轮次结构中
                try {
                    const { audioRounds, pendingRoundIndex } = state;
                    if (pendingRoundIndex >= 0 && audioRounds[pendingRoundIndex]) {
                        const round = audioRounds[pendingRoundIndex];
                        if (!round.firstPlayAt) {
                            round.firstPlayAt = playTime;
                            round.firstPlayWallClock = Date.now();
                            round.firstPlayWallClockFmt = formatTimestamp(round.firstPlayWallClock);
                            // 回填 participantSid
                            if (!round.participantSid) round.participantSid = sid;
                            const deltas = { ...round.deltas };
                            if (round.firstPacketAt) deltas.packetToPlay = round.firstPlayAt - round.firstPacketAt;
                            if (round.generateStartAt)
                                deltas.fromGenerateStartToPlay = round.firstPlayAt - round.generateStartAt;
                            if (round.audioStartSignalAt)
                                deltas.fromAudioSignalToPlay = round.firstPlayAt - round.audioStartSignalAt;
                            round.deltas = deltas;
                            logAudioAttachDebug('⏱️ 首次播放时间记录:', { round: round.round, ...round });
                        }
                    }
                } catch (e) {
                    if (AUDIO_ATTACH_DEBUG) {
                        console.warn('记录首次播放时间失败:', e);
                    }
                }
            };

            el.onerror = err => {
                console.error(`🎵 音频播放错误: ${sid}`, err);
            };

            const prevElement = remoteAudioRefs[sid];
            if (prevElement && prevElement !== el && prevElement.dataset?.lkAttachKey) {
                delete prevElement.dataset.lkAttachKey;
            }
            remoteAudioRefs[sid] = el;

            logAudioAttachDebug(`🎵 Audio ref 设置耗时: ${(performance.now() - refStart).toFixed(2)}ms`);

            // 如果远端音轨已存在，就立即 attach
            const tracks = state.remoteTracks[sid] || [];
            const at = tracks.find(t => t.kind === 'audio');
            if (at) {
                logAudioAttachDebug(`🚀 立即 attach 已存在的轨道: ${sid}`);
                attachAudioTrackImmediate(at, el, sid, 'setRemoteAudioRef');
            }
        };
    }
    // 调试日志：监听状态变化
    watch(
        [() => isCalling.value, () => callLoading.value, () => state.localAudioActive, () => state.remoteAudioActive],
        ([isCalling, callLoading, localAudioActive, remoteAudioActive]) => {
            console.log(
                '🔍 [Voice] 状态调试:',
                'isCalling:',
                isCalling,
                'callLoading:',
                callLoading,
                'localAudioActive:',
                localAudioActive,
                'remoteAudioActive:',
                Object.values(remoteAudioActive),
                'state.status:',
                state.status
            );
        },
        { immediate: true }
    );
    watch(
        () => state.chatMessages,
        msgs => {
            console.log('hhh:', msgs);
        },
        { deep: true }
    );

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
        },
        { immediate: true }
    );

    watch(
        () => state.localAudioActive,
        active => {
            pushDebugEvent('local-audio', active ? 'active' : 'idle');
        }
    );

    watch(
        () => JSON.stringify(state.remoteAudioActive || {}),
        payload => {
            pushDebugEvent('remote-audio', payload);
        }
    );

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
            pushDebugEvent('play_end', flag ? 'sent' : 'reset');
        }
    );

    watch(
        () => state.messages.length,
        (next, prev) => {
            if (next <= prev) return;
            const last = state.messages[next - 1];
            if (!last) return;
            pushDebugEvent('signal', `${last.direction}/${last.stateName || 'text'}`);
        }
    );

    watch(
        getLocalTrackKey,
        () => {
            setupLocalWaveAnalyser();
        },
        { immediate: true }
    );

    watch(
        getRemoteTrackKey,
        () => {
            setupRemoteWaveAnalyser();
        },
        { immediate: true }
    );

    // 清理函数：接受一个 SID 数组（或空表示全部）
    registerCleanup((sids = []) => {
        const list = sids.length ? sids : Object.keys(remoteAudioRefs);
        list.forEach(sid => {
            const el = remoteAudioRefs[sid];
            if (el?.dataset?.lkAttachKey) {
                delete el.dataset.lkAttachKey;
            }
            if (el?.parentNode) el.parentNode.removeChild(el);
            delete remoteAudioRefs[sid];
            attachedAudioTrackBySid.delete(sid);
        });
    });

    const vadStartTime = ref();
    const isSkip = ref(false);
    const mode = ref('audio'); // 'video' or 'audio'
    const count = ref(0);
    let sendTimer = null;

    const handleStartClick = () => {
        if (callLoading.value || isCalling.value) {
            return;
        }
        initRecording();
    };

    const initRecording = async () => {
        const startTime = performance.now();
        console.log(`🚀 开始初始化录音连接: ${startTime}`);

        // const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        // if (!userInfo || !userInfo.token) {
        //     emits('handleLogin');
        //     return;
        // }
        callLoading.value = true;

        try {
            if (!route.query.token) {
                const rtcTokenStorage = localStorage.getItem('rtcToken');
                const userIdStorage = localStorage.getItem('userId');
                if (rtcTokenStorage && userIdStorage) {
                    await logoutRtc({
                        token: rtcTokenStorage,
                        userId: userIdStorage
                    });
                    localStorage.removeItem('rtcToken');
                    localStorage.removeItem('userId');
                }
                const { code, data } = await getRtcToken('audio');
                console.log('获取到的token:', data, code);
                if (code === 0 && data.token) {
                    token.value = data.token;
                    userId.value = data.userId;
                    localStorage.setItem('rtcToken', data.token);
                    localStorage.setItem('userId', data.userId);

                    // 保存session_id到localStorage
                    if (data.sessionId) {
                        saveSessionId(data.sessionId);
                        localStorage.setItem('sessionId', data.sessionId);
                        emits('updateSessionId', data.sessionId);
                    }
                } else {
                    ElMessage({
                        type: 'error',
                        message: t('tokenErrMsg'),
                        duration: 3000,
                        customClass: 'system-error'
                    });
                    return;
                }
            } else {
                token.value = route.query.token;
            }

            const config = { userAgent: navigator.userAgent, joinTime: Date.now() };

            // 🔧 准备初始化配置，直接传入 joinRoom 避免时序竞争
            const initConfig = {
                interface: 'init',
                type: 'audio',
                model: localStorage.getItem('model') || 'MiniCPM-o2.6'
            };
            localStorage.setItem('initStatus', '');
            console.log('💾 准备初始化配置，传入 joinRoom...');

            const joinStartTime = performance.now();
            await joinRoom(resolveLivekitUrl(), token.value, mode.value, config, initConfig);
            const joinEndTime = performance.now();

            console.log(`🎯 joinRoom耗时: ${(joinEndTime - joinStartTime).toFixed(2)}ms`);

            if (state.error) {
                ElMessage({
                    type: 'error',
                    message: t('callErrMsg'),
                    duration: 3000,
                    customClass: 'system-error'
                });
                return;
            }

            isCalling.value = true;

            // 记录总初始化时间
            const totalInitTime = performance.now() - startTime;
            console.log(`✅ 初始化完成，总耗时: ${totalInitTime.toFixed(2)}ms`);
        } catch (error) {
            console.error('❌ 初始化录音连接失败:', error);
            ElMessage({
                type: 'error',
                message: t('callErrMsg'),
                duration: 3000,
                customClass: 'system-error'
            });
        } finally {
            callLoading.value = false;
        }
    };
    let audioContext;
    const analyser = ref();
    const dataArray = ref();
    let mediaRecorder;
    let audioChunks = [];
    const animationFrameId = ref();

    const isFirstPiece = ref(true);
    let mediaStream;

    // AudioContext预热和初始化 - 简化版本
    onMounted(() => {
        // 延迟初始化以避免阻塞页面加载
        nextTick(() => {
            initializeAudioContext();
            setupLiveKitEventHandlers();
            startDebugRuntime();
            // 移除预加载，因为可能造成延迟
            // preloadAudioResources();
        });

        // 开发环境：暴露测试函数到全局
        if (import.meta.env.DEV) {
            // 测试无机器人超时（支持强制模式）
            window.__testNoRobotTimeout = (force = false) => {
                console.log('🧪 Voice组件：手动触发无机器人超时测试', { force });
                const triggered = triggerNoRobotTimeout(force);
                console.log('🧪 触发结果:', triggered);
                if (triggered) {
                    console.log('🧪 执行挂断流程...');
                    // 如果成功触发，执行挂断流程
                    setTimeout(() => {
                        stopRecording();
                    }, 100); // 给 alert 一点时间
                } else {
                    console.warn('🧪 未触发超时，请检查是否已开始通话');
                    console.warn('🧪 或尝试强制模式: window.__testNoRobotTimeout(true)');
                }
                return triggered;
            };

            // 查看定时器状态
            window.__checkTimerStatus = () => {
                return getNoRobotTimerStatus();
            };

            // 完整的测试信息
            window.__debugInfo = () => {
                const info = {
                    isCalling: isCalling.value,
                    callLoading: callLoading.value,
                    livekitConnected: state.connected,
                    livekitStatus: state.status,
                    remoteParticipants: Object.keys(state.remoteTracks).length,
                    timerStatus: getNoRobotTimerStatus()
                };
                console.table(info);
                return info;
            };

            console.log('🧪 测试函数已暴露:');
            console.log('  - window.__testNoRobotTimeout(force?) : 触发超时测试');
            console.log('  - window.__checkTimerStatus() : 查看定时器状态');
            console.log('  - window.__debugInfo() : 查看完整调试信息');
        }
    });

    onBeforeUnmount(() => {
        // 页面销毁前也清理一次
        triggerCleanup();
        stopDebugRuntime();
        if (globalAudioContext) {
            globalAudioContext.close().catch(() => {});
        }
    });

    /**
     * 初始化AudioContext以避免首次播放延迟 - 简化版本
     */
    function initializeAudioContext() {
        try {
            if (!globalAudioContext) {
                globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                performanceMetrics.audioContextResumeTime = performance.now();

                console.log('🎧 AudioContext初始化完成:', globalAudioContext.state);

                // 不立即恢复，等到需要时再恢复
                // if (globalAudioContext.state === 'suspended') {
                //     globalAudioContext.resume();
                // }
            }
        } catch (error) {
            console.error('AudioContext初始化失败:', error);
        }
    }

    /**
     * 预加载音频资源
     */
    function preloadAudioResources() {
        try {
            // 创建一个静音的音频轨道来预热解码器
            const silentAudio = document.createElement('audio');
            silentAudio.preload = 'auto';
            silentAudio.muted = true;
            silentAudio.autoplay = true;
            silentAudio.style.display = 'none';

            // 创建一个很短的静音音频数据URL
            const silentDataUrl =
                'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmHgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
            silentAudio.src = silentDataUrl;

            document.body.appendChild(silentAudio);

            // 短时间后移除
            setTimeout(() => {
                if (silentAudio.parentNode) {
                    silentAudio.parentNode.removeChild(silentAudio);
                }
            }, 1000);

            console.log('🎧 音频资源预热完成');
        } catch (error) {
            console.warn('音频资源预热失败:', error);
        }
    }

    /**
     * 设置LiveKit事件处理器 - 激进低延迟版本
     */
    function setupLiveKitEventHandlers() {
        // 注册轨道订阅回调 - 优先级最高
        registerTrackSubscribed((track, participant) => {
            const sid = participant.sid;
            const audioElement = remoteAudioRefs[sid];

            if (track.kind === 'audio' && audioElement) {
                const liveKitAttachStart = performance.now();
                const didAttach = attachAudioTrackImmediate(track, audioElement, sid, 'registerTrackSubscribed');
                if (!didAttach) {
                    return;
                }

                // 添加详细的音频事件监听器
                const playingListener = () => {
                    const playingTime = performance.now();
                    logAudioAttachDebug(`%c▶️ [Audio Playing 事件]`, 'color: #00ff00; font-weight: bold; font-size: 14px', {
                        参与者SID: sid,
                        触发时间: playingTime.toFixed(2) + 'ms',
                        音频元素状态: {
                            paused: audioElement.paused,
                            currentTime: audioElement.currentTime.toFixed(3) + 's',
                            duration: audioElement.duration ? audioElement.duration.toFixed(3) + 's' : 'N/A',
                            readyState: audioElement.readyState,
                            networkState: audioElement.networkState
                        },
                        Track信息: {
                            trackSid: track.sid,
                            enabled: track.mediaStreamTrack?.enabled,
                            muted: track.mediaStreamTrack?.muted,
                            readyState: track.mediaStreamTrack?.readyState
                        }
                    });
                    // 记录到 audioRounds
                    markAudioActualPlay(sid);
                };

                const canplayListener = () => {
                    logAudioAttachDebug(`%c🎵 [Audio CanPlay 事件]`, 'color: #ffcc00; font-weight: bold; font-size: 13px', {
                        参与者SID: sid,
                        触发时间: performance.now().toFixed(2) + 'ms',
                        readyState: audioElement.readyState
                    });
                };

                const loadedmetadataListener = () => {
                    logAudioAttachDebug(
                        `%c📊 [Audio LoadedMetadata 事件]`,
                        'color: #66ccff; font-weight: bold; font-size: 13px',
                        {
                            参与者SID: sid,
                            触发时间: performance.now().toFixed(2) + 'ms',
                            duration: audioElement.duration ? audioElement.duration.toFixed(3) + 's' : 'N/A'
                        }
                    );
                };

                // 绑定事件监听器
                audioElement.addEventListener('playing', playingListener, { once: true });
                if (AUDIO_ATTACH_DEBUG) {
                    audioElement.addEventListener('canplay', canplayListener, { once: true });
                    audioElement.addEventListener('loadedmetadata', loadedmetadataListener, { once: true });
                }

                // 手动触发播放以确保立即开始
                const playPromise = audioElement.play();
                if (playPromise) {
                    playPromise.catch(err => {
                        console.warn('自动播放被阻止:', err);
                        // 尝试静音播放
                        audioElement.muted = true;
                        audioElement.play().catch(() => {});
                    });
                }

                logAudioAttachDebug(`🚀 LiveKit attach 耗时: ${(performance.now() - liveKitAttachStart).toFixed(2)}ms`);
            } else if (track.kind === 'audio') {
                if (AUDIO_ATTACH_DEBUG) {
                    console.warn(`⚠️ 音频元素尚未就绪: ${sid}`);
                }
            }
        });

        logAudioAttachDebug('🎯 LiveKit事件处理器已设置 (激进模式)');
    }

    /**
     * 打印详细的性能报告 - 针对700ms问题
     */
    function printPerformanceReport() {
        const report = {
            audioContextResumeTime: performanceMetrics.audioContextResumeTime,
            firstAudioAttachTime: performanceMetrics.firstAudioAttachTime,
            firstAudioPlayTime: performanceMetrics.firstAudioPlayTime,
            totalResponseTime: performanceMetrics.firstAudioPlayTime - performanceMetrics.audioContextResumeTime,

            // 新增的详细指标
            attachToPlayDelay: performanceMetrics.firstAudioPlayTime - performanceMetrics.firstAudioAttachTime,
            contextToAttachDelay: performanceMetrics.firstAudioAttachTime - performanceMetrics.audioContextResumeTime
        };

        console.log('📈 WebRTC音频性能详细报告:', report);

        // 详细分析
        console.log('🔍 延迟分析:');
        console.log(`  - AudioContext 初始化到 Attach: ${report.contextToAttachDelay?.toFixed(2) || 'N/A'}ms`);
        console.log(`  - Attach 到播放: ${report.attachToPlayDelay?.toFixed(2) || 'N/A'}ms`);
        console.log(`  - 总响应时间: ${report.totalResponseTime?.toFixed(2) || 'N/A'}ms`);

        // 性能评估
        if (report.totalResponseTime) {
            if (report.totalResponseTime < 200) {
                console.log('✅ 性能极佳！响应时间 < 200ms');
            } else if (report.totalResponseTime < 500) {
                console.log('✅ 性能优秀！响应时间 < 500ms');
            } else if (report.totalResponseTime < 1000) {
                console.log('⚠️ 性能一般，响应时间 < 1s');
            } else {
                console.log('❌ 性能需要优化！响应时间 > 1s');

                // 提供优化建议
                if (report.contextToAttachDelay > 300) {
                    console.log('⚠️ 建议: LiveKit 连接或轨道订阅过慢');
                }
                if (report.attachToPlayDelay > 200) {
                    console.log('⚠️ 建议: 浏览器音频处理过慢，检查 playoutDelay 设置');
                }
            }
        }

        return report;
    }

    /**
     * 实时延迟监测工具
     */
    function startLatencyMonitoring() {
        // 监测后端音频开始信号
        const originalHandleChatMessage = state.room?.handleChatMessage;
        if (originalHandleChatMessage) {
            state.room.handleChatMessage = function (msg, participant) {
                if (msg.message === '<state><audio_start>') {
                    performanceMetrics.backendAudioStartTime = performance.now();
                    console.log(`📡 后端音频开始信号: ${performanceMetrics.backendAudioStartTime}`);
                }
                return originalHandleChatMessage.call(this, msg, participant);
            };
        }

        console.log('🔍 延迟监测已启动');
    }

    // 在首次音频播放后立即打印性能报告
    watch(
        () => performanceMetrics.firstAudioPlayTime,
        playTime => {
            if (playTime) {
                // 立即打印报告，不等待5秒
                setTimeout(() => {
                    printPerformanceReport();
                }, 100);
            }
        }
    );
    const stopRecording = async () => {
        // 🚀 优化：立即更新状态，避免 UI 延迟
        isCalling.value = false;
        showText.value = false;

        // 然后再执行清理和登出操作
        const obj = {
            interface: 'stop'
        };
        sendAndLeave(JSON.stringify(obj));
        triggerCleanup();

        // 异步登出不阻塞UI更新
        await logoutRtc({
            token: token.value,
            userId: userId.value
        });
        localStorage.removeItem('rtcToken');
        localStorage.removeItem('userId');
    };
    const interruptChat = async () => {
        const obj = {
            interface: 'break'
        };
        sendText(JSON.stringify(obj), false);
    };
    const toggleMicrophone = () => {
        isMicrophoneOn.value = !isMicrophoneOn.value;
    };
    const errorMsg = ref('');
    let connectingTimeout;

    // 监听连接状态，自动重置UI状态（修复超时挂断后按钮消失问题）
    watch(
        () => state.connected,
        newConnected => {
            if (!newConnected && isCalling.value) {
                console.log('🔄 检测到连接断开，自动重置UI状态');
                isCalling.value = false;
                callLoading.value = false;
            }
        }
    );

    watch(
        () => state.status,
        async newStatus => {
            console.log('status变化:', newStatus);
            if (newStatus === 'connecting') {
                connectingTimeout = setTimeout(() => {
                    ElMessage({
                        type: 'error',
                        message: t('callErrMsg'),
                        duration: 3000,
                        customClass: 'system-error'
                    });
                    callLoading.value = false;
                }, 90 * 1000);
            } else if (newStatus === 'init_failed') {
                // 模型初始化失败
                clearTimeout(connectingTimeout);
                ElMessage({
                    type: 'error',
                    message: t('modelInitFailedMsg'),
                    duration: 3000,
                    customClass: 'system-error'
                });
                // 自动挂断
                setTimeout(() => {
                    if (isCalling.value) {
                        stopRecording();
                    }
                }, 500);
            } else if (newStatus === 'robot_exit') {
                // 机器人退出
                clearTimeout(connectingTimeout);
                ElMessage({
                    type: 'warning',
                    message: t('peerLeftCall'),
                    duration: 3000,
                    customClass: 'system-error'
                });
                // 自动挂断
                setTimeout(() => {
                    if (isCalling.value) {
                        stopRecording();
                    }
                }, 500);
            } else if (newStatus !== null) {
                clearTimeout(connectingTimeout);
            }
        }
    );
    onUnmounted(() => {
        clearTimeout(connectingTimeout);
        // clearInterval(sendTimer); // 定时器已注释
    });
    defineExpose({
        stopRecording,
        printPerformanceReport,
        performanceMetrics,
        startLatencyMonitoring
    });
    const selectorDialog = ref();

    function openSelector() {
        selectorDialog.value.open();
    }

    function handleVoice(voice) {
        console.log('你选择了声音：', voice);
    }
</script>
<style lang="less" scoped>
    .debug-panel-toggle {
        position: fixed;
        top: 84px;
        right: 24px;
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
        top: 122px;
        right: 24px;
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

    .voice-page {
        flex: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 32px 0 14px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 20px;
        &-content {
            flex: 1;
            display: flex;
            align-items: flex-end;
            padding-bottom: 140px;
            justify-content: center;
            .gif-container {
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                position: relative;
            }
        }
        &-footer {
            // cursor: pointer;
            position: absolute;
            bottom: 14px;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-direction: column;
            .footer-btn {
                width: 100%;
                // margin-bottom: 6px;
                padding-bottom: 1.5px;
                section {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 72px;
                    .text-btn,
                    .microphone-btn {
                        width: 60px;
                        height: 60px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        border-radius: 50%;
                        background: #f3f6ff;
                    }
                    .text-icon,
                    .microphone-on-icon {
                        width: 30px;
                        height: 30px;
                        color: #365a98;
                    }
                    .microphone-off-icon {
                        width: 30px;
                        height: 30px;
                        color: #eb5757;
                    }
                }

                .start-icon,
                .end-icon {
                    width: 72px;
                    height: 72px;
                }
                .start-icon-disabled {
                    opacity: 0.45;
                    filter: grayscale(1);
                }
                .text-icon,
                .microphone-icon {
                    width: 30px;
                    height: 30px;
                }
                .interrupt-btn {
                    position: absolute;
                    left: 50%;
                    top: 0;
                    transform: translate(-50%, calc(-100% - 20px));
                    display: inline-flex;
                    justify-content: center;
                    align-items: center;
                    padding: 8px 16px;
                    gap: 4px;
                    border-radius: 12px;
                    background: #fff;
                    box-shadow: 0 0 15px 0 rgba(0, 0, 0, 0.05);
                    cursor: pointer;
                    .interrupt-icon {
                        width: 16px;
                        height: 16px;
                    }
                    span {
                        color: #6893fb;
                        // font-family: Roboto;
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                    }
                }
            }
            .footer-tips {
                text-align: center;
                color: #6893fb;
                // font-family: Roboto;
                font-size: 12px;
                font-style: normal;
                font-weight: 400;
                line-height: normal;
                user-select: none;
            }
            .hidden-tips {
                opacity: 0;
            }
        }
        &-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1px 0 8px;
            box-shadow: 0 0.5px 0 0 rgba(224, 224, 224, 0.5);
            margin-bottom: 8px;
            .header-left {
                display: flex;
                align-items: center;
                .voice-container {
                    margin-left: 16px;
                    display: flex;
                    .voice-icon {
                        width: 144px;
                        height: 34px;
                    }
                }
            }
        }
        &-output {
            flex: 1;
            height: 0;
            padding: 0 16px 8px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 0.5px 0 0 rgba(224, 224, 224, 0.5);
            .output-content {
                flex: 1;
                overflow: auto;
            }
            .skip-box {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                margin-top: 16px;
            }
        }
        &-btn {
            text-align: center;
            padding: 8px 0;
            .el-button {
                width: 284px;
                height: 46px;
                border-radius: 8px;
            }
            .el-button.el-button--success {
                background: #647fff;
                border-color: #647fff;
                &:hover {
                    opacity: 0.8;
                }
                span {
                    color: #fff;
                    // font-family: PingFang SC;
                    font-size: 16px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                }
            }
            .el-button.el-button--success.is-disabled {
                background: #f3f3f3;
                border-color: #f3f3f3;
                span {
                    color: #d1d1d1;
                }
            }
            .el-button.el-button--danger {
                border-color: #dc3545;
                background-color: #dc3545;
                color: #ffffff;
                // font-family: PingFang SC;
                font-size: 16px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
                .phone-icon {
                    margin-right: 10px;
                }
                .btn-text {
                    margin-right: 10px;
                }
                .btn-desc {
                    margin-right: 16px;
                }
                .time {
                    display: flex;
                    align-items: center;
                    .time-minute,
                    .time-second {
                        width: 26px;
                        height: 26px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        border-radius: 3.848px;
                        background: rgba(47, 47, 47, 0.5);
                    }
                    .time-colon {
                        margin: 0 3px;
                    }
                }
            }
        }
    }
</style>
