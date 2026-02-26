<template>
    <div class="remote-audio" v-for="(tracks, sid) in state.remoteTracks" :key="sid">
        <audio :ref="setRemoteAudioRef(sid)" autoplay></audio>
    </div>
    <div class="video-page" v-loading="loading" element-loading-background="rgba(255, 255, 255, 1)">
        <!-- <div class="video-clarity">
            <el-switch v-model="isHighRefresh" size="small" :disabled="isCalling" class="high-refresh-switch" />
            <span
                @click="!isCalling && (isHighRefresh = !isHighRefresh)"
                :style="{ cursor: isCalling ? 'not-allowed' : 'pointer' }"
                >高刷</span
            >
            <el-tooltip
                popper-class="info-tooltip"
                content="开启后可获得更流畅的画面，但可能回增加耗电"
                placement="bottom-end"
                effect="light"
                :show-arrow="false"
                :popper-options="{
                    modifiers: [
                        {
                            name: 'offset',
                            options: {
                                offset: [18, 18]
                            }
                        }
                    ]
                }"
            >
                <SvgIcon name="info" class="info-icon" />
            </el-tooltip>
        </div> -->
        <div class="video-page-container">
            <video v-show="isCalling" ref="videoRef" autoplay playsinline muted />
            <canvas ref="canvasRef" canvas-id="canvasId" style="display: none" />
            <div
                class="switch-camera-icon"
                :class="{ switching: switchingCamera }"
                v-if="isMobile() && isCalling && !loading"
                @click="handleSwitchCamera"
            >
                <el-icon v-if="switchingCamera" class="is-loading">
                    <Loading />
                </el-icon>
                <SvgIcon v-else name="switch-camera" class="icon" />
            </div>
        </div>
        <div class="video-page-btn">
            <div class="interrupt-btn" v-if="isCalling && state.status === 'talking'" @click="interruptChat">
                <!-- <div class="interrupt-btn" @click="interruptChat"> -->
                <SvgIcon name="interrupt" class="interrupt-icon" />
                <span>{{ t('audioInterruptionBtn') }}</span>
            </div>
            <div class="btn-end-box" v-if="callLoading">
                <div class="box-left"></div>
                <div class="box-middle">
                    <!-- <div> -->
                    <VoiceGifCopy
                        :status="state.status"
                        :animationGroup="modelType === 'simplex' ? 1 : 5"
                        :width="60"
                        :height="60"
                        :isVideoMode="true"
                        :isPc="true"
                        :mode="modelType"
                    />
                    <!-- </div> -->
                </div>
                <div class="box-right"></div>
            </div>
            <div class="btn-start-box" v-else-if="!isCalling && !callLoading">
                <SvgIcon name="start" class="start-icon" @click="initRecording" />
                <div class="footer-tips">{{ t('videoCallBtn') }}</div>
            </div>

            <div class="btn-end-box" v-else>
                <div class="box-left">
                    <div>
                        <SvgIcon name="close-icon" class="close-icon" @click="stopRecording" />
                    </div>
                    <div>
                        <SvgIcon name="close-icon" class="close-icon" />
                    </div>
                </div>
                <div class="box-middle">
                    <div>
                        <VoiceGifCopy
                            :status="state.status"
                            :animationGroup="modelType === 'simplex' ? 1 : 5"
                            :width="60"
                            :height="60"
                            :isVideoMode="true"
                            :isPc="true"
                            :mode="modelType"
                        />
                    </div>
                </div>
                <div class="box-right">
                    <div>
                        <SvgIcon name="text" class="text-icon" @click="showText = true" />
                    </div>
                    <div class="microphone-btn" @click="toggleMic">
                        <SvgIcon v-if="state.audioEnabled" name="microphone-on" class="microphone-on-icon" />
                        <SvgIcon v-else name="microphone-off" class="microphone-off-icon" />
                    </div>
                </div>
            </div>
        </div>
    </div>
    <DraggableDialog v-if="showText" :message="state.chatMessages" @close="showText = false" />
    <LiveKitDebugPanel
        :state="state"
        :is-calling="isCalling"
        :call-loading="callLoading"
        :remote-audio-refs="remoteAudioRefs"
        context="video-pc"
    />
</template>
<script setup>
    import { Loading } from '@element-plus/icons-vue';
    import { sendMessage, stopMessage, uploadConfig, getRtcToken, logoutRtc } from '@/apis';
    import { encodeWAV } from '@/hooks/useVoice';
    import { getNewUserId, setNewUserId } from '@/hooks/useRandomId';
    import { fetchEventSource } from '@microsoft/fetch-event-source';
    import { MicVAD } from '@ricky0123/vad-web';
    import { videoIdeasList, voiceConfigList, showIdeasList } from '@/enums';
    import { saveSessionId } from '@/utils/sessionStorage';
    import { isMobile, maxCount, getChunkLength, formatTimestamp, getErrorLogs, setErrorLogs } from '@/utils';
    import { mergeBase64ToBlob } from './merge';
    import { mergeBase64AudioSegments } from './mergeAudio';
    import { useI18n } from 'vue-i18n';

    import { useRoute } from 'vue-router';
    const route = useRoute();
    // import AutoPlayAudioStream from '@/hooks/usePlay';
    import AutoPlayAudioStream from '@/views/test/bestPlayVoice';
    import VoiceGifCopy from '@/components/VoiceGifCopy/index.vue';
    import LiveKitDebugPanel from '@/components/LiveKitDebugPanel.vue';

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

    const {
        state,
        joinRoom,
        sendText,
        sendAndLeave,
        switchCamera,
        toggleMic,
        toggleCam,
        markAudioActualPlay,
        getVideoResolution,
        checkMirrorStatus,
        checkCurrentCamera, // 新增：检查当前摄像头
        compareFieldOfView, // 新增：视野对比测试
        debugVideoState, // 新增：视频状态诊断
        clearCameraCache // 新增：清除摄像头缓存
    } = useLiveKit();

    // 🔧 调试：暴露到全局，方便控制台调用（已完成调试，暂时注释）
    // if (typeof window !== 'undefined') {
    //     window.$livekit = {
    //         state,
    //         checkCurrentCamera,
    //         compareFieldOfView,
    //         debugVideoState,
    //         getVideoResolution,
    //         checkMirrorStatus,
    //         clearCameraCache,
    //         switchCamera
    //     };
    //     console.log('💡 调试工具已就绪');
    // }

    import useAudioStream from '@/audio-core/useAudioStream';
    let streamPlayer = null;

    const { t, locale } = useI18n();
    import WebSocketService from '@/utils/websocket';

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
            default: 'duplex'
        }
    });
    const videoRef = ref();
    const videoStream = ref(null);
    const interval = ref();
    const canvasRef = ref();
    const videoImage = ref([]);
    const videoLoaded = ref(false);
    const taskQueue = ref([]);
    const running = ref(false);
    const outputData = ref([]);
    const isFirstReturn = ref(true);
    const audioPlayQueue = ref([]);
    const base64List = ref([]);
    const playing = ref(false);
    const timbre = ref([1]);
    const isReturnError = ref(false);

    const textQueue = ref('');
    const textAnimationInterval = ref();

    const analyser = ref();
    const dataArray = ref();
    const animationFrameId = ref();
    const skipDisabled = ref(true);
    const stop = ref(false);
    const isFrontCamera = ref(true);
    const switchingCamera = ref(false); // 切换摄像头中
    // const loading = ref(false);

    const isEnd = ref(false); // sse接口关闭，认为模型已完成本次返回

    const isFirstPiece = ref(true);
    const allVoice = ref([]);
    const callDisabled = ref(true);

    const feedbackStatus = ref('');
    const curResponseId = ref('');
    const delayTimestamp = ref(0); // 当前发送片延时
    const delayCount = ref(0); // 当前剩余多少ms未发送到接口

    const modelVersion = ref('');

    const audioPlayer = ref(null);

    const isTextModel = ref(false);
    const query = ref('');
    const sendLoading = ref(false);

    const callLoading = ref(false);

    let mediaStream;
    let audioRecorder;
    // let audioStream;
    let intervalId;
    let audioContext;
    let audioChunks = [];
    // let count = 0;
    let audioDOM;

    const emits = defineEmits(['handleLogin', 'updateSessionId']);

    const highRefreshCacheKey = 'highRefresh';
    const isHighRefresh = ref(false);

    watch(isHighRefresh, value => {
        localStorage.setItem(highRefreshCacheKey, value ? 'true' : 'false');
    });

    const token = ref('');
    const userId = ref('');
    const showText = ref(false);

    // 远端每个用户的 <audio> 引用集合
    const remoteAudioRefs = {};

    // 预创建的音频元素池 - 减少动态创建延迟
    const audioElementPool = [];
    const POOL_SIZE = 3; // 预创建3个音频元素

    // 全局AudioContext预热
    let globalAudioContext = null;

    // 性能监测
    const performanceMetrics = {
        firstAudioAttachTime: null,
        firstAudioPlayTime: null,
        audioContextResumeTime: null,
        poolInitTime: null
    };

    // 🔧 新增：Video 元素健康监控定时器
    let videoElementHealthTimer = null;
    let videoElementRecoveryAttempts = 0;
    const MAX_VIDEO_ELEMENT_RECOVERY = 3;

    // 监听本地视频轨道，挂载到 video 元素 - 移除 nextTick 以减少延迟
    watch(
        () => state.localTracks,
        tracks => {
            // 🚀 优化：移除 await nextTick()，立即 attach
            const el = videoRef.value;
            if (el && mode.value === 'video') {
                const vt = tracks.find(t => t.kind === 'video');
                if (vt) {
                    vt.attach(el);
                    // 🔧 启动 video 元素健康监控
                    startVideoElementHealthMonitoring();
                }
            }
        },
        { deep: true }
    );

    /**
     * 🔧 启动 video 元素渲染健康监控
     * 定期检查 video 元素是否正常渲染，如果失效则尝试恢复
     */
    function startVideoElementHealthMonitoring() {
        // 避免重复启动
        if (videoElementHealthTimer) {
            return;
        }

        console.log('🏥 启动 video 元素健康监控，每 10 秒检查一次');
        videoElementRecoveryAttempts = 0;

        videoElementHealthTimer = setInterval(() => {
            checkVideoElementHealth();
        }, 10000); // 每 10 秒检查一次
    }

    /**
     * 🔧 停止 video 元素健康监控
     */
    function stopVideoElementHealthMonitoring() {
        if (videoElementHealthTimer) {
            clearInterval(videoElementHealthTimer);
            videoElementHealthTimer = null;
            videoElementRecoveryAttempts = 0;
            console.log('🏥 video 元素健康监控已停止');
        }
    }

    /**
     * 🔧 检查 video 元素渲染健康状态
     */
    function checkVideoElementHealth() {
        try {
            // 只在通话中检查
            if (!isCalling.value || !videoRef.value) {
                return;
            }

            const video = videoRef.value;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            const readyState = video.readyState;
            const paused = video.paused;

            // 检查 1: video 元素是否有内容
            if (videoWidth === 0 || videoHeight === 0) {
                console.warn('⚠️ Video 元素未渲染内容:', { videoWidth, videoHeight, readyState });

                // 尝试恢复
                if (videoElementRecoveryAttempts < MAX_VIDEO_ELEMENT_RECOVERY) {
                    videoElementRecoveryAttempts++;
                    console.log(
                        `🔄 尝试恢复 video 元素渲染 (第 ${videoElementRecoveryAttempts}/${MAX_VIDEO_ELEMENT_RECOVERY} 次)`
                    );
                    recoverVideoElement();
                } else {
                    console.error('❌ Video 元素恢复失败，已达到最大尝试次数');
                    ElMessage({
                        type: 'warning',
                        message: '视频显示异常，请尝试重新开始通话',
                        duration: 3000
                    });
                }
                return;
            }

            // 检查 2: video 是否暂停（应该一直播放）
            if (paused && readyState >= 2) {
                console.warn('⚠️ Video 元素已暂停，尝试恢复播放');
                video.play().catch(err => {
                    console.error('❌ 恢复播放失败:', err);
                });
            }

            // 检查 3: readyState 是否正常
            if (readyState < 2) {
                console.warn('⚠️ Video 元素 readyState 异常:', readyState);
            }

            // 如果一切正常，重置恢复计数器
            if (videoWidth > 0 && videoHeight > 0 && videoElementRecoveryAttempts > 0) {
                console.log('✅ Video 元素已恢复正常，重置恢复计数器');
                videoElementRecoveryAttempts = 0;
            }
        } catch (error) {
            console.error('❌ Video 元素健康检查出错:', error);
        }
    }

    /**
     * 🔧 恢复 video 元素渲染
     */
    function recoverVideoElement() {
        try {
            console.log('🔄 开始恢复 video 元素...');

            const video = videoRef.value;
            if (!video) {
                console.error('❌ Video 元素不存在');
                return;
            }

            // 获取当前视频轨道
            const videoTrack = state.localTracks.find(t => t.kind === 'video');
            if (!videoTrack || !videoTrack.mediaStreamTrack) {
                console.error('❌ 未找到视频轨道');
                return;
            }

            // 方法 1: 重新 attach 视频轨道
            console.log('🔄 方法 1: 重新 attach 视频轨道');
            videoTrack.detach(video);
            setTimeout(() => {
                videoTrack.attach(video);
                // 确保播放
                video.play().catch(err => console.warn('播放失败:', err));
                console.log('✅ 视频轨道已重新 attach');
            }, 100);

            // 方法 2: 如果方法 1 失败，尝试重新设置 srcObject
            setTimeout(() => {
                const currentWidth = video.videoWidth;
                const currentHeight = video.videoHeight;

                if (currentWidth === 0 || currentHeight === 0) {
                    console.log('🔄 方法 2: 重新设置 srcObject');
                    const mediaTrack = videoTrack.mediaStreamTrack;
                    if (mediaTrack && mediaTrack.readyState === 'live') {
                        video.srcObject = new MediaStream([mediaTrack]);
                        video.play().catch(err => console.warn('播放失败:', err));
                        console.log('✅ srcObject 已重新设置');
                    } else {
                        console.error('❌ MediaStreamTrack 状态异常:', mediaTrack?.readyState);
                    }
                }
            }, 1000);

            // 方法 3: 最后的尝试 - 强制刷新 DOM
            setTimeout(() => {
                const currentWidth = video.videoWidth;
                const currentHeight = video.videoHeight;

                if (currentWidth === 0 || currentHeight === 0) {
                    console.log('🔄 方法 3: 强制刷新 video 元素');
                    // 触发 DOM 重绘
                    video.style.display = 'none';
                    setTimeout(() => {
                        video.style.display = 'block';
                        video.play().catch(err => console.warn('播放失败:', err));
                        console.log('✅ Video 元素已强制刷新');
                    }, 50);
                }
            }, 2000);
        } catch (error) {
            console.error('❌ 恢复 video 元素失败:', error);
        }
    }

    /**
     * 简化的音频轨道attach函数 - 专注于速度
     */
    function attachAudioTrackImmediate(track, audioElement, sid) {
        const startTime = performance.now();

        try {
            // 立即attach，不做额外检查
            track.attach(audioElement);

            // 记录性能指标
            if (!performanceMetrics.firstAudioAttachTime) {
                performanceMetrics.firstAudioAttachTime = performance.now();
            }

            console.log(`🔊 音频轨道attach: ${(performance.now() - startTime).toFixed(2)}ms`, { sid });
        } catch (error) {
            console.error('音频轨道attach失败:', error, { sid });
        }
    }

    /**
     * 2. 监听远端轨道 - 移除Vue延迟，优先使用LiveKit事件
     */
    watch(
        () => state.remoteTracks,
        remMap => {
            // 移除 nextTick 以减少延迟
            for (const sid in remMap) {
                const tracks = remMap[sid];
                const audioTrack = tracks.find(t => t.kind === 'audio');
                if (audioTrack && remoteAudioRefs[sid]) {
                    const attachStart = performance.now();
                    console.log('远端音频轨道变化 (Vue watch):', { sid, trackId: audioTrack.sid });

                    // 立即 attach，不做额外处理
                    audioTrack.attach(remoteAudioRefs[sid]);

                    console.log(`🔊 Vue watch attach 耗时: ${(performance.now() - attachStart).toFixed(2)}ms`);
                }
                // 如果后续想同时处理远端视频，可在这里作类似 attach
            }
        },
        { deep: true }
    );

    /**
     * 预创建音频元素池 - 减少动态创建延迟
     */
    function initializeAudioElementPool() {
        const poolStart = performance.now();

        for (let i = 0; i < POOL_SIZE; i++) {
            const audio = document.createElement('audio');

            // 设置优化属性
            audio.autoplay = true;
            audio.playsInline = true;
            audio.preload = 'none';
            audio.muted = false;
            audio.style.display = 'none';

            // 添加到DOM但隐藏，避免后续attach时的DOM操作延迟
            document.body.appendChild(audio);

            audioElementPool.push(audio);
        }

        performanceMetrics.poolInitTime = performance.now() - poolStart;
        console.log(`🎵 音频元素池初始化完成: ${performanceMetrics.poolInitTime.toFixed(2)}ms, 池大小: ${POOL_SIZE}`);
    }

    /**
     * 从池中获取音频元素
     */
    function getAudioElementFromPool() {
        if (audioElementPool.length > 0) {
            const audio = audioElementPool.pop();
            audio.style.display = 'block'; // 显示元素
            return audio;
        }

        // 池用完了，动态创建
        console.warn('🎵 音频元素池已用完，动态创建新元素');
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.preload = 'none';
        audio.muted = false;
        document.body.appendChild(audio);
        return audio;
    }

    /**
     * 初始化AudioContext以避免首次播放延迟
     */
    function initializeAudioContext() {
        try {
            if (!globalAudioContext) {
                globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                performanceMetrics.audioContextResumeTime = performance.now();

                console.log('🎧 AudioContext初始化完成:', globalAudioContext.state);
            }
        } catch (error) {
            console.error('AudioContext初始化失败:', error);
        }
    }

    /**
     * 优化的远端 <audio> ref 回调 - 使用音频元素池版本
     */
    function setRemoteAudioRef(sid) {
        return el => {
            if (!el) {
                // 如果Vue模板中的audio元素为空，从池中获取一个
                const pooledAudio = getAudioElementFromPool();
                if (pooledAudio) {
                    el = pooledAudio;
                    // 需要手动添加到模板的位置
                    const container = document.querySelector('.remote-audio');
                    if (container) {
                        container.appendChild(pooledAudio);
                    }
                } else {
                    return;
                }
            }

            const refStart = performance.now();

            // 确保优化属性已设置（池中的元素已预设置）
            if (!el.autoplay) {
                el.autoplay = true;
                el.playsInline = true;
                el.preload = 'none';
                el.muted = false;
            }

            // 标记为 LiveKit 附加音频，便于精准 DOM 检查
            el.setAttribute('data-livekit-audio', sid);

            // 添加性能监测事件（避免重复绑定）
            if (!el.hasAttribute('data-perf-bound')) {
                el.setAttribute('data-perf-bound', 'true');

                el.onloadstart = () => {
                    console.log(`🎵 音频开始加载: ${sid}, ${performance.now()}`);
                };

                el.oncanplay = () => {
                    console.log(`🎵 音频可播放: ${sid}, ${performance.now()}`);
                };

                el.onplay = () => {
                    const playTime = performance.now();
                    if (!performanceMetrics.firstAudioPlayTime) {
                        performanceMetrics.firstAudioPlayTime = playTime;
                        console.log(`🎵 首次音频播放: ${sid}, 时间: ${playTime}`);
                    } else {
                        console.log(`🎵 音频播放: ${sid}, 时间: ${playTime}`);
                    }
                    // 记录到全局轮次结构中（与音频页一致）
                    try {
                        const { audioRounds, pendingRoundIndex } = state;
                        if (pendingRoundIndex >= 0 && audioRounds[pendingRoundIndex]) {
                            const round = audioRounds[pendingRoundIndex];
                            if (!round.firstPlayAt) {
                                round.firstPlayAt = playTime;
                                round.firstPlayWallClock = Date.now();
                                round.firstPlayWallClockFmt = formatTimestamp(round.firstPlayWallClock);
                                if (!round.participantSid) round.participantSid = sid;
                                const deltas = { ...round.deltas };
                                if (round.firstPacketAt) deltas.packetToPlay = round.firstPlayAt - round.firstPacketAt;
                                if (round.generateStartAt)
                                    deltas.fromGenerateStartToPlay = round.firstPlayAt - round.generateStartAt;
                                if (round.audioStartSignalAt)
                                    deltas.fromAudioSignalToPlay = round.firstPlayAt - round.audioStartSignalAt;
                                round.deltas = deltas;
                                console.log('⏱️ 首次播放时间记录(视频页):', { round: round.round, ...round });
                            }
                        }
                    } catch (e) {
                        console.warn('记录首次播放时间失败(视频页):', e);
                    }
                };

                el.onerror = err => {
                    console.error(`🎵 音频播放错误: ${sid}`, err);
                };
            }

            remoteAudioRefs[sid] = el;

            console.log(`🎵 Audio ref 设置耗时: ${(performance.now() - refStart).toFixed(2)}ms`);

            // 如果远端音轨已存在，就立即 attach
            const tracks = state.remoteTracks[sid] || [];
            const at = tracks.find(t => t.kind === 'audio');
            if (at) {
                console.log(`🚀 立即 attach 已存在的轨道: ${sid}`);
                attachAudioTrackImmediate(at, el, sid);
            }
        };
    }

    // 调试日志：监听状态变化
    watch(
        [() => isCalling.value, () => callLoading.value, () => state.localAudioActive, () => state.remoteAudioActive],
        ([isCalling, callLoading, localAudioActive, remoteAudioActive]) => {
            console.log(
                '🔍 [Video] 状态调试:',
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
        }
    );

    // 清理函数：接受一个 SID 数组（或空表示全部）
    registerCleanup((sids = []) => {
        const list = sids.length ? sids : Object.keys(remoteAudioRefs);
        list.forEach(sid => {
            const el = remoteAudioRefs[sid];
            if (el?.parentNode) el.parentNode.removeChild(el);
            delete remoteAudioRefs[sid];
        });
    });

    const vadStartTime = ref();
    const isSkip = ref(false);
    // 音频播放相关
    // onMounted(async () => {
    //     streamPlayer = new useAudioStream();
    //     await streamPlayer.init({
    //         onStart: () => {
    //             console.log('✅ 播放开始', formatTimestamp(Date.now()));
    //             playing.value = true;
    //             isSkip.value = false;
    //         },
    //         onEnd: async () => {
    //             console.log('✅ 播放结束');
    //             if (
    //                 outputData.value[outputData.value.length - 1]?.type === 'BOT' &&
    //                 outputData.value[outputData.value.length - 1].audio === '' &&
    //                 allVoice.value.length > 0
    //             ) {
    //                 outputData.value[outputData.value.length - 1].audio =
    //                     textQueue.value !== t('answerUnsafe') ? await mergeBase64AudioSegments(allVoice.value) : '';
    //                 outputData.value[outputData.value.length - 1].text = textQueue.value;
    //                 textQueue.value = '';
    //             }
    //             skipDisabled.value = true;
    //             playing.value = false;
    //             if (!isSkip.value) {
    //                 taskQueue.value = [];
    //                 buildConnect();
    //             }
    //         },
    //         onStop: param => {
    //             console.log('✅ 播放停止', param);
    //             if (param === 'stop') {
    //                 console.log('do nothing');
    //             } else if (param === 'skip') {
    //                 console.log('skip');
    //                 isSkip.value = true;
    //             } else if (param === 'unsafe') {
    //                 console.log('unsafe');
    //                 const str = t('answerUnsafe');
    //                 outputData.value[outputData.value.length - 1].text = str;
    //             }
    //         }
    //     });
    // });

    // AudioContext预热和初始化
    onMounted(() => {
        const cachedHighRefresh = localStorage.getItem(highRefreshCacheKey);
        if (cachedHighRefresh !== null) {
            isHighRefresh.value = cachedHighRefresh === 'true';
        } else {
            localStorage.setItem(highRefreshCacheKey, 'false');
        }

        // 延迟初始化以避免阻塞页面加载
        nextTick(() => {
            initializeAudioContext();
            initializeAudioElementPool(); // 预创建音频元素池
            setupLiveKitEventHandlers();
        });

        // 开发环境：暴露测试函数到全局
        if (import.meta.env.DEV) {
            // 测试无机器人超时（支持强制模式）
            window.__testNoRobotTimeout = (force = false) => {
                console.log('🧪 Video组件：手动触发无机器人超时测试', { force });
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
        // 🔧 清理 video 元素健康监控
        stopVideoElementHealthMonitoring();

        // 页面销毁前也清理一次
        triggerCleanup();
        // clearInterval(sendTimer); // 定时器已注释
        if (globalAudioContext) {
            globalAudioContext.close().catch(() => {});
        }
    });
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
                console.log(`🚀 LiveKit原生事件触发 attach: ${sid}`);

                // 立即 attach，无任何延迟
                track.attach(audioElement);

                // 添加详细的音频事件监听器
                const playingListener = () => {
                    const playingTime = performance.now();
                    console.log(`%c▶️ [Audio Playing 事件]`, 'color: #00ff00; font-weight: bold; font-size: 14px', {
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
                    console.log(`%c🎵 [Audio CanPlay 事件]`, 'color: #ffcc00; font-weight: bold; font-size: 13px', {
                        参与者SID: sid,
                        触发时间: performance.now().toFixed(2) + 'ms',
                        readyState: audioElement.readyState
                    });
                };

                const loadedmetadataListener = () => {
                    console.log(
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
                audioElement.addEventListener('canplay', canplayListener, { once: true });
                audioElement.addEventListener('loadedmetadata', loadedmetadataListener, { once: true });

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

                console.log(`🚀 LiveKit attach 耗时: ${(performance.now() - liveKitAttachStart).toFixed(2)}ms`);
            } else if (track.kind === 'audio') {
                console.warn(`⚠️ 音频元素尚未就绪: ${sid}`);
            }
        });

        console.log('🎯 LiveKit事件处理器已设置 (激进模式)');
    }

    /**
     * 打印详细的性能报告 - 视频通话版本
     */
    function printPerformanceReport() {
        const report = {
            audioContextResumeTime: performanceMetrics.audioContextResumeTime,
            firstAudioAttachTime: performanceMetrics.firstAudioAttachTime,
            firstAudioPlayTime: performanceMetrics.firstAudioPlayTime,
            poolInitTime: performanceMetrics.poolInitTime,
            totalResponseTime: performanceMetrics.firstAudioPlayTime - performanceMetrics.audioContextResumeTime,

            // 新增的详细指标
            attachToPlayDelay: performanceMetrics.firstAudioPlayTime - performanceMetrics.firstAudioAttachTime,
            contextToAttachDelay: performanceMetrics.firstAudioAttachTime - performanceMetrics.audioContextResumeTime,

            // 优化效果指标
            poolEfficiency: audioElementPool.length > 0 ? 'Pool Available' : 'Pool Exhausted',
            currentPlayoutDelay: '10ms (Optimized)',
            currentMaxPacketTime: '3ms (Optimized)',
            optimizationStatus: 'Video Call + Audio Pool + Low Latency Config'
        };

        console.log('📈 WebRTC视频通话音频性能详细报告 (优化版):', report);

        // 详细分析
        console.log('🔍 延迟分析:');
        console.log(`  - AudioContext 初始化到 Attach: ${report.contextToAttachDelay?.toFixed(2) || 'N/A'}ms`);
        console.log(`  - Attach 到播放: ${report.attachToPlayDelay?.toFixed(2) || 'N/A'}ms`);
        console.log(`  - 音频元素池初始化: ${report.poolInitTime?.toFixed(2) || 'N/A'}ms`);
        console.log(`  - 总响应时间: ${report.totalResponseTime?.toFixed(2) || 'N/A'}ms`);

        // 优化状态
        console.log('🚀 优化状态:');
        console.log(`  - 音频元素池: ${report.poolEfficiency}`);
        console.log(`  - PlayoutDelay: ${report.currentPlayoutDelay}`);
        console.log(`  - MaxPacketTime: ${report.currentMaxPacketTime}`);
        console.log(`  - 优化方案: ${report.optimizationStatus}`);

        // 性能评估 - 更严格的标准
        if (report.totalResponseTime) {
            if (report.totalResponseTime < 150) {
                console.log('🎯 性能极佳！响应时间 < 150ms (优化目标达成)');
            } else if (report.totalResponseTime < 300) {
                console.log('✅ 性能优秀！响应时间 < 300ms');
            } else if (report.totalResponseTime < 500) {
                console.log('⚠️ 性能良好，响应时间 < 500ms');
            } else {
                console.log('❌ 性能需要进一步优化！响应时间 > 500ms');

                // 提供优化建议
                if (report.contextToAttachDelay > 200) {
                    console.log('⚠️ 建议: LiveKit 连接或轨道订阅过慢，检查网络质量');
                }
                if (report.attachToPlayDelay > 150) {
                    console.log('⚠️ 建议: 浏览器音频处理过慢，可能需要更激进的 playoutDelay 设置');
                }
                if (report.poolEfficiency === 'Pool Exhausted') {
                    console.log('⚠️ 建议: 增加音频元素池大小');
                }
            }
        }

        return report;
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

    const mode = ref('video'); // 'video' or 'audio'
    const count = ref(0);
    let sendTimer = null;

    // 优化的切换摄像头方法 - 立即 attach，不等待 watch
    const handleSwitchCamera = async () => {
        if (switchingCamera.value || !isCalling.value) {
            return; // 防止重复点击或未在通话中点击
        }

        try {
            switchingCamera.value = true;
            const startTime = performance.now();
            console.log('⏳ 开始切换摄像头...');

            // 调用 useLiveKit 的 switchCamera 方法
            await switchCamera();

            // 🚀 优化：立即手动 attach 新轨道到 video 元素，不等待 Vue watch
            const attachStartTime = performance.now();
            const el = videoRef.value;
            if (el && mode.value === 'video') {
                const newVt = state.localTracks.find(t => t.kind === 'video');
                if (newVt) {
                    newVt.attach(el);
                    console.log(`🎥 手动 attach 耗时: ${(performance.now() - attachStartTime).toFixed(0)}ms`);
                }
            }

            console.log(`✅ 摄像头切换完成，总耗时: ${(performance.now() - startTime).toFixed(0)}ms`);
        } catch (error) {
            console.error('❌ 切换摄像头失败:', error);
            ElMessage({
                type: 'error',
                message: t('switchCameraFailedRetry'),
                duration: 2000
            });
        } finally {
            // 确保状态被重置
            setTimeout(() => {
                switchingCamera.value = false;
            }, 300);
        }
    };

    const initRecording = async () => {
        console.log('initRecording');
        // const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        // if (!userInfo || !userInfo.token) {
        //     emits('handleLogin');
        //     return;
        // }
        callLoading.value = true;
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
            const { code, data } = await getRtcToken('omni');
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
                callLoading.value = false;
                return;
            }
        } else {
            token.value = route.query.token;
        }
        const config = { userAgent: navigator.userAgent, joinTime: Date.now() };

        // 🔧 准备初始化配置，直接传入 joinRoom 避免时序竞争
        const initConfig = {
            interface: 'init',
            type: 'video',
            model: localStorage.getItem('model') || 'MiniCPM-o2.6',
            highRefresh: isHighRefresh.value
        };
        localStorage.setItem('initStatus', '');
        console.log('💾 准备初始化配置，传入 joinRoom...');

        await joinRoom(resolveLivekitUrl(), token.value, mode.value, config, initConfig);
        if (state.error) {
            ElMessage({
                type: 'error',
                message: t('callErrMsg'),
                duration: 3000,
                customClass: 'system-error'
            });
            callLoading.value = false;
            return;
        }
        isCalling.value = true;
        callLoading.value = false;

        // 定时重发逻辑 - 已注释，由后端模型初始化信号触发
        // sendTimer = setInterval(() => {
        //     if (count.value < 10) {
        //         count.value++;
        //         if (localStorage.getItem('initStatus') === 'done' || state.modelInitialized) {
        //             clearInterval(sendTimer);
        //             return;
        //         }
        //         // 如果模型已初始化，发送配置；否则继续等待
        //         if (state.modelInitialized) {
        //             sendText(JSON.stringify(obj));
        //             console.log('定时发送第' + count.value + '次' + `, 时间: ${+new Date()}`);
        //         }
        //     } else {
        //         clearInterval(sendTimer);
        //     }
        // }, 30 * 1000);
        return;
    };
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
    });
    const BATCH_SIZE = 1; // 每次更新1个字符
    const drawText = async () => {
        if (textQueue.value.length > 0) {
            outputData.value[outputData.value.length - 1].text += textQueue.value.slice(0, BATCH_SIZE);
            textQueue.value = textQueue.value.slice(BATCH_SIZE);
        } else {
            cancelAnimationFrame(textAnimationInterval.value);
        }
        if (textAnimationInterval.value) {
            cancelAnimationFrame(textAnimationInterval.value);
        }
        textAnimationInterval.value = requestAnimationFrame(drawText);
    };
    const getStopValue = () => {
        return stop.value;
    };
    const getPlayingValue = () => {
        return playing.value;
    };
    const getStopStatus = () => {
        return localStorage.getItem('canStopByVoice') === 'true';
    };
    // const saveAudioChunk = (buffer, timestamp) => {
    //     return new Promise((resolve, reject) => {
    //         if (!getStopStatus() && getPlayingValue()) {
    //             resolve();
    //             return;
    //         }
    //         const wavBlob = encodeWAV(buffer, audioContext.sampleRate);
    //         let reader = new FileReader();
    //         reader.readAsDataURL(wavBlob);

    //         reader.onloadend = async function () {
    //             let base64data = reader.result.split(',')[1];
    //             const imgBase64 = videoImage.value[videoImage.value.length - 1]?.src;
    //             if (!(base64data && imgBase64)) {
    //                 resolve();
    //                 return;
    //             }
    //             const strBase64 = imgBase64.split(',')[1];
    //             count++;
    //             if (isTextModel.value) {
    //                 const imgBase64 = videoImage.value[videoImage.value.length - 1]?.src;
    //                 const strBase64 = imgBase64.split(',')[1];
    //                 // count++;
    //                 let obj = {
    //                     messages: [
    //                         {
    //                             role: 'user',
    //                             content: [
    //                                 {
    //                                     type: 'image_data',
    //                                     image_data: {
    //                                         data: count === maxCount ? strBase64 : '',
    //                                         type: 2
    //                                     }
    //                                 }
    //                             ]
    //                         }
    //                     ]
    //                 };
    //                 if (count === maxCount) {
    //                     count = 0;
    //                 }
    //                 if (sendLoading.value && query.value) {
    //                     obj.messages[0].content.push({
    //                         type: 'text',
    //                         text: query.value
    //                     });
    //                     // debugger;
    //                     query.value = '';
    //                     sendLoading.value = false;
    //                     ElMessage.success('发送成功');
    //                 }
    //                 console.log('发送文本: ', obj.messages[obj.messages.length - 1].content, maxCount, count);
    //                 await sendMessage(obj);
    //                 resolve();
    //                 return;
    //             }
    //             let obj = {
    //                 messages: [
    //                     {
    //                         role: 'user',
    //                         content: [
    //                             {
    //                                 type: 'input_audio',
    //                                 input_audio: {
    //                                     data: base64data,
    //                                     format: 'wav',
    //                                     timestamp: String(timestamp)
    //                                 }
    //                             }
    //                         ]
    //                     }
    //                 ]
    //             };
    //             obj.messages[0].content.unshift({
    //                 type: 'image_data',
    //                 image_data: {
    //                     data: count === maxCount ? strBase64 : '',
    //                     type: 2
    //                 }
    //             });
    //             if (count === maxCount) {
    //                 count = 0;
    //             }
    //             socket.send(JSON.stringify(obj));
    //             socket.on('message', data => {
    //                 console.log('message: ', data);
    //                 delayTimestamp.value = +new Date() - timestamp;
    //                 delayCount.value = taskQueue.value.length;
    //                 resolve();
    //             });
    //             socket.on('error', err => {
    //                 console.log('error: ', err);
    //                 reject();
    //             });
    //             // 将Base64音频数据发送到后端
    //             // try {
    //             //     await sendMessage(obj);
    //             //     delayTimestamp.value = +new Date() - timestamp;
    //             //     delayCount.value = taskQueue.value.length;
    //             // } catch (err) {}
    //             // resolve();
    //         };
    //     });
    // };
    const mergeBuffers = (buffers, length) => {
        const result = new Float32Array(length);
        let offset = 0;
        for (let buffer of buffers) {
            result.set(buffer, offset);
            offset += buffer.length;
        }
        return result;
    };
    const stopRecording = async () => {
        // 🚀 优化：立即隐藏 video 和更新状态，避免黑屏
        isCalling.value = false;
        showText.value = false;
        if (videoRef.value) {
            videoRef.value.srcObject = null;
        }

        // 🔧 停止 video 元素健康监控
        stopVideoElementHealthMonitoring();

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
        console.log('videoRef: ', videoRef.value);
    };
    const interruptChat = async () => {
        const obj = {
            interface: 'break'
        };
        sendText(JSON.stringify(obj), false);
    };
    const errorMsg = ref('');
    watch(
        locale,
        newLocale => {
            if (newLocale === 'zh') {
                errorMsg.value = '模型开小差了';
            } else {
                errorMsg.value = 'Model error!';
            }
        },
        { immediate: true }
    );
    // 建立连接
    const buildConnect = () => {
        const obj = {
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'none' }]
                }
            ],
            stream: true
        };
        isEnd.value = false;
        ctrl.abort();
        ctrl = new AbortController();
        const url = `/api/v1/completions${window.location.search}`;

        fetchEventSource(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                service: 'minicpmo-server',
                uid: getNewUserId()
            },
            body: JSON.stringify(obj),
            signal: ctrl.signal,
            openWhenHidden: true,
            async onopen(response) {
                isFirstPiece.value = true;
                isFirstReturn.value = true;
                allVoice.value = [];
                base64List.value = [];
                textQueue.value = '';
                console.log('onopen', response);
                if (response.status !== 200) {
                    ElMessage({
                        type: 'error',
                        message: 'At limit. Please try again soon.',
                        duration: 3000,
                        customClass: 'system-error'
                    });
                    isReturnError.value = true;
                } else {
                    isReturnError.value = false;
                    // drawText();
                }
            },
            async onmessage(msg) {
                const data = JSON.parse(msg.data);
                if (data.error) {
                    ElMessage({
                        type: 'error',
                        message: errorMsg,
                        duration: 3000,
                        customClass: 'system-error'
                    });
                    const logs = getErrorLogs();
                    logs.push({
                        time: formatTimestamp(Date.now()),
                        message: '接口异常' + data.error,
                        data
                    });
                    setErrorLogs(logs);
                    buildConnect();
                    return;
                }
                if (data.choices[0]?.text.includes('assistant')) {
                    console.error('首token返回时间: ', formatTimestamp(Date.now()));
                }
                if (data.response_id) {
                    curResponseId.value = data.response_id;
                }
                if (data.choices[0]?.text) {
                    let tempText = data.choices[0].text.replace('<end>', '');
                    const str = t('answerUnsafe');
                    if (tempText.includes('<audit_end>')) {
                        textQueue.value = str;
                        outputData.value[outputData.value.length - 1].text = '';
                        // allVoice.value = [];
                        streamPlayer.stop('unsafe');
                        return;
                        // audioStream.stop();
                    }
                    console.error('text: ', tempText);
                    textQueue.value += tempText;
                    console.warn('text return time -------------------------------', formatTimestamp(Date.now()));
                }
                // 首次返回的是前端发给后端的音频片段，需要单独处理
                if (isFirstReturn.value) {
                    console.log('第一次');
                    // playing.value = true;
                    isFirstReturn.value = false;
                    // 如果后端返回的音频为空，需要重连
                    if (!data.choices[0].audio) {
                        const logs = getErrorLogs();
                        logs.push({
                            time: formatTimestamp(Date.now()),
                            message: '首次返回aduio为空',
                            data
                        });
                        setErrorLogs(logs);
                        buildConnect();
                        return;
                    }
                    outputData.value.push({
                        type: 'USER',
                        audio: `data:audio/wav;base64,${data.choices[0].audio}`
                    });
                    outputData.value.push({
                        type: 'BOT',
                        text: '',
                        audio: ''
                    });
                    return;
                }
                if (data.choices[0].text.includes('<end>')) {
                    // isEnd.value = true;
                    console.log('收到结束标记了:', formatTimestamp(Date.now()));
                }
                if (data.choices[0]?.audio) {
                    console.warn('audio return time -------------------------------', formatTimestamp(Date.now()));
                    if (!getStopValue() && isCalling.value) {
                        skipDisabled.value = false;
                        base64List.value.push(`data:audio/wav;base64,${data.choices[0].audio}`);
                        // addAudioQueue(() => truePlay(data.choices[0].audio));
                        // audioPlayer.value.addAudio(`data:audio/wav;base64,${data.choices[0].audio}`);
                        allVoice.value.push(data.choices[0].audio);
                        await streamPlayer.push(data.choices[0].audio);
                    }
                } else if (!data.choices[0]?.text.includes('<end>')) {
                    // 发生异常了，直接重连
                    const logs = getErrorLogs();
                    logs.push({
                        time: formatTimestamp(Date.now()),
                        message: '返回audio为空',
                        data
                    });
                    setErrorLogs(logs);
                    buildConnect();
                }
            },
            onclose() {
                console.log('onclose', formatTimestamp(Date.now()));
                console.log('allVoice: ', allVoice.value);
                // audioPlayer.value.manualEndCallback();
                // audioStream.markEnd();
                streamPlayer.markEnd();
                isEnd.value = true;
                // if (
                //     outputData.value[outputData.value.length - 1]?.type === 'BOT' &&
                //     outputData.value[outputData.value.length - 1].audio === '' &&
                //     allVoice.value.length > 0
                // ) {
                //     outputData.value[outputData.value.length - 1].audio = mergeBase64ToBlob(allVoice.value);
                //     outputData.value[outputData.value.length - 1].text = textQueue.value;
                //     textQueue.value = '';
                // }
                // sse关闭后，如果所有音频列表为空，说明模型出错了，此次连接没有返回音频，则直接重连
                vadStartTime.value = +new Date();
                if (allVoice.value.length === 0) {
                    let startIndex = taskQueue.value.findIndex(item => item.time >= vadStartTime.value - 1000);
                    if (startIndex !== -1) {
                        taskQueue.value = taskQueue.value.slice(startIndex);
                    }
                    buildConnect();
                }
            },
            onerror(err) {
                console.log('onerror', err);
                ctrl.abort();
                ctrl = new AbortController();
                // throw err;
                return false;
            }
        });
    };
    // 每次call先上传当前用户配置
    const uploadUserConfig = async () => {
        if (!localStorage.getItem('configData')) {
            return new Promise(resolve => resolve());
        }
        const {
            videoQuality,
            useAudioPrompt,
            voiceClonePrompt,
            assistantPrompt,
            vadThreshold,
            audioFormat,
            base64Str
        } = JSON.parse(localStorage.getItem('configData'));
        const obj = {
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: base64Str,
                                format: audioFormat
                            }
                        },
                        {
                            type: 'options',
                            options: {
                                hd_video: videoQuality,
                                use_audio_prompt: useAudioPrompt,
                                vad_threshold: vadThreshold,
                                voice_clone_prompt: voiceClonePrompt,
                                assistant_prompt: assistantPrompt
                            }
                        }
                    ]
                }
            ]
        };
        const { code, message, data } = await uploadConfig(obj);
        modelVersion.value = data?.choices?.content || '';
        return new Promise((resolve, reject) => {
            if (code !== 0) {
                ElMessage({
                    type: 'error',
                    message: message,
                    duration: 3000,
                    customClass: 'system-error'
                });
                reject();
            } else {
                resolve();
            }
        });
    };
    defineExpose({
        stopRecording,
        printPerformanceReport,
        performanceMetrics,
        getVideoResolution,
        checkMirrorStatus
    });
</script>
<style lang="less">
    .high-refresh-switch {
        --el-switch-on-color: #373ed8;
        --el-switch-off-color: rgba(28, 28, 28, 0.2);
        --el-switch-border-color: transparent;
    }
    .info-tooltip.el-popper.is-light {
        padding: 20px;
        border-radius: 13px;
        color: #333;
        font-family: 'PingFang SC';
        font-size: 14px;
        font-style: normal;
        font-weight: 400;
        line-height: normal;
        box-shadow: 0 0 32px 0 rgba(0, 0, 0, 0.2);
        width: 300px;
    }
</style>
<style lang="less" scoped>
    .video-page {
        flex: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.6);
        overflow: hidden;
        position: relative;
        .video-clarity {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 116px;
            height: 44px;
            background: #ffffff;
            box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.03);
            border-radius: 90px;
            padding: 8px 16px;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999;
            cursor: pointer;
            > span {
                margin: 0 2px 0 4px;
                color: #595f6d;
                font-family: 'PingFang SC';
                font-size: 15px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
            }
            .info-icon {
                width: 16px;
                height: 16px;
            }
        }
        &-container {
            flex: 1;
            position: relative;
            overflow: hidden;
            min-height: 0; // 防止flex子元素撑开容器
            video {
                width: 100%;
                height: 100%;
                max-height: 100%;
                object-fit: cover;
                display: block;
                position: absolute;
                top: 0;
                left: 0;

                /* 镜像功能已禁用 */
                /* &.mirrored {
                    transform: scaleX(-1);
                    transform-origin: center;
                } */
            }
            .switch-camera-icon {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 48px;
                height: 48px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 999;
                cursor: pointer;
                transition: all 0.3s ease;

                &:hover:not(.switching) {
                    background: rgba(0, 0, 0, 0.6);
                    transform: scale(1.05);
                }

                &:active:not(.switching) {
                    transform: scale(0.95);
                }

                &.switching {
                    cursor: not-allowed;
                    opacity: 0.7;
                }

                .icon {
                    width: 24px;
                    height: 24px;
                    color: #ffffff;
                }

                .el-icon {
                    font-size: 24px;
                    color: #ffffff;
                }

                .is-loading {
                    animation: rotating 1s linear infinite;
                }
            }

            @keyframes rotating {
                from {
                    transform: rotate(0deg);
                }
                to {
                    transform: rotate(360deg);
                }
            }
        }
        &-btn {
            position: absolute;
            bottom: 32px;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
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
            .btn-start-box {
                margin: 0 auto;
                .start-icon {
                    width: 72px;
                    height: 72px;
                    display: block;
                }
                .footer-tips {
                    position: absolute;
                    bottom: -16px;
                    left: 50%;
                    transform: translateX(-50%);
                    text-wrap: nowrap;
                    color: #6893fb;
                    // font-family: Roboto;
                    font-size: 12px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: 1;
                }
            }

            .btn-end-box {
                padding: 0 120px;
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: relative;
                .box-left {
                    display: flex;
                    gap: 48px;
                    > div {
                        width: 60px;
                        height: 60px;
                        border-radius: 50%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        background: rgba(0, 0, 0, 0.3);
                        .close-icon {
                            width: 30px;
                            height: 30px;
                        }
                    }
                    div:nth-child(2) {
                        opacity: 0;
                    }
                }
                .box-middle {
                    display: flex;
                    gap: 48px;
                    > div {
                        width: 60px;
                        height: 60px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    :deep(.voice-gif-copy) {
                        width: 60px;
                        height: 60px;
                    }
                }

                .box-right {
                    flex-shrink: 0;
                    display: flex;
                    gap: 48px;
                    > div {
                        width: 60px;
                        height: 60px;
                        border-radius: 50%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        background: rgba(0, 0, 0, 0.3);
                        .microphone-on-icon,
                        .microphone-off-icon,
                        .text-icon {
                            width: 30px;
                            height: 30px;
                            color: #ffffff;
                        }
                        .microphone-off-icon {
                            color: #eb5757;
                        }
                    }
                }
            }
        }
    }
</style>
