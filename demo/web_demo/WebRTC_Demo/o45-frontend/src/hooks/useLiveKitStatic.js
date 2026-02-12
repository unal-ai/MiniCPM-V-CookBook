import {
    Room,
    RoomEvent,
    createLocalAudioTrack,
    createLocalVideoTrack,
    LocalAudioTrack,
    LocalVideoTrack,
    DataPacket_Kind,
    VideoPresets,
    ScreenSharePresets,
    BackupCodecPolicy,
    LogLevel,
    setLogLevel,
    ParticipantEvent
} from 'livekit-client';
import { formatTimestamp } from '@/utils';
import { reactive } from 'vue';

// 设置日志级别为 debug
setLogLevel(LogLevel.debug);

/**
 * 全局 reactive 状态
 * - room: LiveKit Room 实例
 * - connected: 是否已连接
 * - error: 如果 joinRoom 报错，会写在这里
 * - localTracks: Array<LocalTrack>，包含音频轨和（可选）视频轨
 * - remoteTracks: { [participantSid]: Track[] }，包含远端所有轨道
 * - localAudioActive: boolean，本地是否在说话
 * - remoteAudioActive: { [participantSid]: boolean }，远端谁在说话
 * - videoFacing: 'user' | 'environment'
 * - audioEnabled: 本地麦克风是否开启
 * - videoEnabled: 本地摄像头是否开启
 * - messages: Array<{ from, payload }>，收发的 DataChannel 文本消息
 */
const state = reactive({
    room: null,
    connected: false,
    error: null,
    localTracks: [],
    remoteTracks: {},
    // 新增：本地是否在说话
    localAudioActive: false,
    // 新增：每个远端参与者的说话状态
    remoteAudioActive: {},
    videoFacing: 'user',
    audioEnabled: true,
    videoEnabled: true,
    messages: [],
    chatMessages: [],
    messageIndex: -1, // 用于标记消息序号
    status: '',
    generateEnd: false, // 用于标记生成结束状态
    firstInit: true, // 标记是否是首次收到初始化信号
    // 新增：按轮记录音频关键时间点（与 useLiveKit 对齐）
    audioRounds: [],
    pendingRoundIndex: -1
});

let timer = null;

// 静默超时：调整到1.5秒，平衡精确性和可靠性
const SILENCE_TIMEOUT_MS = 1500;
// 安全延迟：调整到300ms
const EXTRA_SAFETY_DELAY_MS = 300;
const silenceTimers = new Map();

let onCleanup = null;
export function registerCleanupStatic(fn) {
    onCleanup = fn;
}

// 新增：静态音频和视频数据配置
const STATIC_MEDIA_CONFIG = {
    // 默认音频文件路径 - 使用项目中已有的音频文件
    audioFilePath: '/audio/voices/hello.WAV',
    // 默认图片文件路径 - 使用项目中已有的图片
    imageFilePath: '/staticImages/scene-04.jpg',
    // 音频循环播放间隔（毫秒）- 现在主要用于备用音频
    audioLoopInterval: 3000,
    // 视频帧率
    videoFrameRate: 15,
    // 是否启用音频循环（设为false则只播放一次）
    enableAudioLoop: true,
    // 最大循环次数（0表示无限循环）
    maxLoopCount: 0
};

// 全局变量用于控制音频播放状态
let audioController = null;

// 创建静态音频轨道
async function createStaticAudioTrack() {
    try {
        // 加载静态音频文件
        const audioContext = new AudioContext();
        const response = await fetch(STATIC_MEDIA_CONFIG.audioFilePath);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // 创建音频源和目标
        const destination = audioContext.createMediaStreamDestination();

        // 创建一个增益节点用于本地播放控制
        const localGainNode = audioContext.createGain();
        localGainNode.gain.setValueAtTime(0.8, audioContext.currentTime); // 设置本地播放音量为80%

        // 创建音频控制器
        audioController = {
            audioContext,
            audioBuffer,
            destination,
            localGainNode,
            currentSource: null,
            isPlaying: false,
            loopCount: 0,
            listenTimer: null,
            hasStartedOnce: false, // 标记是否已经开始过
            enableLocalPlayback: true, // 控制是否本地播放

            // 开始播放音频
            startAudio() {
                if (this.isPlaying) return;

                this.isPlaying = true;
                this.playAudio();
                console.log(`🎵 开始发送固定音频到后端，时长: ${this.audioBuffer.duration.toFixed(2)}秒`);
            },

            // 停止播放音频
            stopAudio() {
                if (!this.isPlaying) return;

                this.isPlaying = false;
                if (this.currentSource) {
                    this.currentSource.stop();
                    this.currentSource = null;
                }
                // 重置循环计数，下次播放从头开始
                this.loopCount = 0;
                console.log('⏸️ 停止发送固定音频到后端，下次将重新从头播放');
            },

            // 循环播放音频
            playAudio() {
                if (!this.isPlaying) return;

                const source = this.audioContext.createBufferSource();
                source.buffer = this.audioBuffer;

                // 连接到LiveKit传输目标
                source.connect(this.destination);

                // 同时连接到本地扬声器（用于录屏）
                if (this.enableLocalPlayback) {
                    source.connect(this.localGainNode);
                    this.localGainNode.connect(this.audioContext.destination);
                    console.log('🔊 固定音频同时发送给后端和本地播放');
                } else {
                    console.log('🔊 固定音频仅发送给后端');
                }

                this.currentSource = source;

                // 当音频播放结束时的处理
                source.onended = () => {
                    this.loopCount++;
                    console.log(`🔄 固定音频播放结束，循环次数: ${this.loopCount}`);

                    // 只有在listening状态且允许循环时才继续播放
                    if (
                        this.isPlaying &&
                        STATIC_MEDIA_CONFIG.enableAudioLoop &&
                        (STATIC_MEDIA_CONFIG.maxLoopCount === 0 || this.loopCount < STATIC_MEDIA_CONFIG.maxLoopCount)
                    ) {
                        console.log('🔄 在listening状态下继续循环播放固定音频...');
                        this.playAudio();
                    } else if (!this.isPlaying) {
                        console.log('⏸️ 音频播放被停止（状态变化）');
                    } else {
                        console.log('⏸️ 固定音频循环已达到上限');
                    }
                };

                source.start();
            },

            // 监听状态变化
            onStatusChange(status) {
                console.log(`📊 状态变化: ${status}`);

                // 清除之前的定时器
                if (this.listenTimer) {
                    clearTimeout(this.listenTimer);
                    this.listenTimer = null;
                }

                if (status === 'listening') {
                    // 检查是否是第一次进入listening状态
                    if (!this.hasStartedOnce) {
                        console.log('👂 首次进入listening状态，立即从头播放固定音频');
                        this.hasStartedOnce = true;
                        this.startAudio();
                    } else {
                        console.log('👂 再次进入listening状态，3秒后从头重新播放固定音频...');
                        this.listenTimer = setTimeout(() => {
                            console.log('⏰ listening状态3秒已到，从头重新播放固定音频');
                            this.startAudio();
                        }, 3000);
                    }
                } else {
                    // 任何非listening状态都停止播放
                    if (status === 'talking') {
                        console.log('🗣️ 进入talking状态，停止播放固定音频');
                    } else if (status === 'thinking') {
                        console.log('🤔 进入thinking状态，停止播放固定音频');
                    } else {
                        console.log(`❌ 进入${status}状态，停止播放固定音频`);
                    }
                    this.stopAudio();
                }
            },

            // 控制本地播放
            setLocalPlayback(enabled) {
                this.enableLocalPlayback = enabled;
                if (!enabled && this.localGainNode) {
                    // 如果禁用本地播放，断开与扬声器的连接
                    try {
                        this.localGainNode.disconnect(this.audioContext.destination);
                    } catch (e) {
                        // 忽略断开连接的错误
                    }
                }
                console.log(`🔊 本地播放状态: ${enabled ? '启用' : '禁用'}`);
            },

            // 设置本地播放音量
            setLocalVolume(volume) {
                if (this.localGainNode) {
                    this.localGainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                    console.log(`🔊 本地播放音量设置为: ${volume}`);
                }
            }
        };

        // 不立即开始播放，等待状态控制
        console.log('🎯 固定音频轨道已创建，等待状态控制播放');

        // 从 MediaStream 创建 LocalAudioTrack
        const mediaStream = destination.stream;
        const audioTrack = mediaStream.getAudioTracks()[0];

        // 创建 LiveKit LocalAudioTrack
        return new LocalAudioTrack(audioTrack, undefined, false);
    } catch (error) {
        console.error('创建静态音频轨道失败:', error);
        // 如果加载静态音频失败，创建备用测试音频控制器
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        // 创建备用音频控制器
        audioController = {
            audioContext,
            destination,
            currentOscillator: null,
            isPlaying: false,
            testLoopCount: 0,
            listenTimer: null,
            hasStartedOnce: false, // 标记是否已经开始过
            enableLocalPlayback: true, // 控制是否本地播放

            // 开始播放测试音频
            startAudio() {
                if (this.isPlaying) return;

                this.isPlaying = true;
                this.playTestTone();
                console.log('🎵 开始发送备用测试音频到后端');
            },

            // 停止播放测试音频
            stopAudio() {
                if (!this.isPlaying) return;

                this.isPlaying = false;
                if (this.currentOscillator) {
                    this.currentOscillator.stop();
                    this.currentOscillator = null;
                }
                // 重置循环计数，下次播放从头开始
                this.testLoopCount = 0;
                console.log('⏸️ 停止发送备用测试音频到后端，下次将重新从头播放');
            },

            // 播放测试音调
            playTestTone() {
                if (!this.isPlaying) return;

                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();

                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);

                oscillator.connect(gainNode);
                gainNode.connect(this.destination);

                // 同时连接到本地扬声器（用于录屏）
                if (this.enableLocalPlayback) {
                    gainNode.connect(this.audioContext.destination);
                    console.log('🔊 备用测试音频同时发送给后端和本地播放');
                } else {
                    console.log('🔊 备用测试音频仅发送给后端');
                }

                this.currentOscillator = oscillator;

                // 播放2秒后停止
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 2);

                oscillator.onended = () => {
                    this.testLoopCount++;
                    console.log(`🔄 备用测试音频播放结束，循环次数: ${this.testLoopCount}`);

                    // 检查是否需要继续循环
                    if (
                        this.isPlaying &&
                        STATIC_MEDIA_CONFIG.enableAudioLoop &&
                        (STATIC_MEDIA_CONFIG.maxLoopCount === 0 ||
                            this.testLoopCount < STATIC_MEDIA_CONFIG.maxLoopCount)
                    ) {
                        setTimeout(() => this.playTestTone(), 100);
                    }
                };
            },

            // 监听状态变化
            onStatusChange(status) {
                console.log(`📊 备用音频状态变化: ${status}`);

                if (this.listenTimer) {
                    clearTimeout(this.listenTimer);
                    this.listenTimer = null;
                }

                if (status === 'listening') {
                    // 检查是否是第一次进入listening状态
                    if (!this.hasStartedOnce) {
                        console.log('👂 首次进入listening状态，立即从头播放备用音频');
                        this.hasStartedOnce = true;
                        this.startAudio();
                    } else {
                        console.log('👂 再次进入listening状态，3秒后从头重新播放备用音频...');
                        this.listenTimer = setTimeout(() => {
                            console.log('⏰ listening状态3秒已到，从头重新播放备用音频');
                            this.startAudio();
                        }, 3000);
                    }
                } else {
                    // 任何非listening状态都停止播放
                    console.log(`❌ 进入${status}状态，停止播放备用音频`);
                    this.stopAudio();
                }
            },

            // 控制本地播放（备用音频版本）
            setLocalPlayback(enabled) {
                this.enableLocalPlayback = enabled;
                console.log(`🔊 备用音频本地播放状态: ${enabled ? '启用' : '禁用'}`);
            }
        };

        console.log('⚠️ 使用备用测试音频控制器（440Hz正弦波）');

        const mediaStream = destination.stream;
        const audioTrack = mediaStream.getAudioTracks()[0];
        return new LocalAudioTrack(audioTrack, undefined, false);
    }
}

// 创建静态视频轨道
async function createStaticVideoTrack() {
    try {
        // 创建 canvas 用于绘制静态图片
        const canvas = document.createElement('canvas');
        canvas.width = VideoPresets.h720.resolution.width;
        canvas.height = VideoPresets.h720.resolution.height;
        const ctx = canvas.getContext('2d');

        // 加载静态图片
        const img = new Image();
        img.crossOrigin = 'anonymous';

        return new Promise((resolve, reject) => {
            img.onload = () => {
                // 绘制图片到 canvas
                const drawFrame = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // 添加时间戳显示图片在"播放"
                    ctx.fillStyle = 'white';
                    ctx.font = '20px Arial';
                    ctx.fillText(new Date().toLocaleTimeString(), 10, 30);

                    // 按帧率重复绘制
                    setTimeout(drawFrame, 1000 / STATIC_MEDIA_CONFIG.videoFrameRate);
                };

                drawFrame();

                // 从 canvas 创建视频流
                const mediaStream = canvas.captureStream(STATIC_MEDIA_CONFIG.videoFrameRate);
                const videoTrack = mediaStream.getVideoTracks()[0];
                // 创建 LiveKit LocalVideoTrack
                resolve(new LocalVideoTrack(videoTrack, undefined, false));
            };

            img.onerror = () => {
                console.error('加载静态图片失败，创建纯色视频轨道');
                // 如果加载图片失败，创建纯色背景
                const drawColorFrame = () => {
                    ctx.fillStyle = '#4A90E2';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    ctx.fillStyle = 'white';
                    ctx.font = '30px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('静态视频测试', canvas.width / 2, canvas.height / 2);
                    ctx.fillText(new Date().toLocaleTimeString(), canvas.width / 2, canvas.height / 2 + 40);

                    setTimeout(drawColorFrame, 1000 / STATIC_MEDIA_CONFIG.videoFrameRate);
                };

                drawColorFrame();

                const mediaStream = canvas.captureStream(STATIC_MEDIA_CONFIG.videoFrameRate);
                const videoTrack = mediaStream.getVideoTracks()[0];
                // 创建 LiveKit LocalVideoTrack
                resolve(new LocalVideoTrack(videoTrack, undefined, false));
            };

            img.src = STATIC_MEDIA_CONFIG.imageFilePath;
        });
    } catch (error) {
        console.error('创建静态视频轨道失败:', error);
        throw error;
    }
}

export function useLiveKitStatic() {
    // 轮次与时间点记录
    function ensureRoundForParticipant(participantSid) {
        const last = state.audioRounds[state.audioRounds.length - 1];
        if (!last || (last && last.firstPlayAt)) {
            state.audioRounds.push({
                round: state.audioRounds.length,
                participantSid,
                generateStartAt: undefined,
                audioStartSignalAt: undefined,
                firstPacketAt: undefined,
                firstPlayAt: undefined,
                deltas: {}
            });
        }
        state.pendingRoundIndex = state.audioRounds.length - 1;
        return state.pendingRoundIndex;
    }

    function markFirstPacket(participant) {
        try {
            const idx = ensureRoundForParticipant(participant.sid);
            const round = state.audioRounds[idx];
            if (!round.firstPacketAt) {
                round.firstPacketAt = performance.now();
                round.firstPacketWallClock = Date.now();
                round.firstPacketWallClockFmt = formatTimestamp(round.firstPacketWallClock);
                const deltas = {};
                if (round.generateStartAt) deltas.fromGenerateStart = round.firstPacketAt - round.generateStartAt;
                if (round.audioStartSignalAt)
                    deltas.fromAudioStartSignal = round.firstPacketAt - round.audioStartSignalAt;
                round.deltas = { ...round.deltas, ...deltas };
                console.log('⏱️ 首包音频到达(静态媒体):', {
                    round: round.round,
                    participantSid: round.participantSid,
                    firstPacketAt: round.firstPacketAt,
                    firstPacketWallClock: round.firstPacketWallClock,
                    firstPacketWallClockFmt: round.firstPacketWallClockFmt,
                    deltas
                });
            }
            // 若本轮尚未记录首次播放时间，则用首包时间兜底
            if (!round.firstPlayAt) {
                round.firstPlayAt = round.firstPacketAt || performance.now();
                round.firstPlayWallClock = Date.now();
                round.firstPlayWallClockFmt = formatTimestamp(round.firstPlayWallClock);
                const deltasPlay = { ...round.deltas };
                if (round.firstPacketAt) deltasPlay.packetToPlay = round.firstPlayAt - round.firstPacketAt;
                if (round.generateStartAt)
                    deltasPlay.fromGenerateStartToPlay = round.firstPlayAt - round.generateStartAt;
                if (round.audioStartSignalAt)
                    deltasPlay.fromAudioSignalToPlay = round.firstPlayAt - round.audioStartSignalAt;
                round.deltas = deltasPlay;
                console.log('🎧 首次播放时间(静态媒体兜底)记录:', {
                    round: round.round,
                    participantSid: round.participantSid,
                    firstPlayAt: round.firstPlayAt,
                    firstPlayWallClock: round.firstPlayWallClock,
                    firstPlayWallClockFmt: round.firstPlayWallClockFmt,
                    deltas: round.deltas
                });
            }
        } catch (e) {
            console.warn('记录首包时间失败(静态媒体):', e);
        }
    }
    function handleSpeakingChanged(participant, speaking) {
        const sid = participant.sid;

        // 清除旧定时器
        if (silenceTimers.has(sid)) {
            clearTimeout(silenceTimers.get(sid));
            silenceTimers.delete(sid);
        }

        if (speaking) {
            // 标记该参与者正在说话
            state.remoteAudioActive[sid] = true;

            // 记录首包时间（静态媒体模式也记录）
            markFirstPacket(participant);

            console.log(`🔍 说话状态检查:`, {
                participant: participant.identity,
                speaking,
                currentStatus: state.status,
                generateEnd: state.generateEnd,
                remoteAudioActive: state.remoteAudioActive
            });

            // 简化切换逻辑：只有在thinking状态检测到实际音频播放时才切换到talking
            if (state.status === 'thinking') {
                state.status = 'talking';
                console.log(`▶️ 远端 ${participant.identity} 开始播放音频，从thinking切换到talking`);
            } else if (state.status === 'talking') {
                console.log(`▶️ 远端 ${participant.identity} 继续播放音频，保持talking状态`);
            } else {
                console.log(`⏸️ 检测到音频播放但不切换状态，当前状态: ${state.status}`);
            }
        } else {
            // 音频停止说话，启动优化的检查流程
            console.log(`🔇 ${participant.identity} 停止说话，开始精确检查...`);

            const tid = setTimeout(() => {
                silenceTimers.delete(sid);
                state.remoteAudioActive[sid] = false;

                // 基础条件检查
                const remoteStillSpeaking = Object.entries(state.remoteAudioActive).some(
                    ([id, active]) => id !== state.room?.localParticipant.sid && active
                );

                console.log(`🔇 ${participant.identity} 静默检查:`, {
                    remoteStillSpeaking,
                    generateEnd: state.generateEnd,
                    currentStatus: state.status
                });

                // 如果基础条件满足，进行快速精确检查
                if (!remoteStillSpeaking && state.generateEnd && state.status === 'talking') {
                    console.log(`⏱️ 启动快速精确检查 (${EXTRA_SAFETY_DELAY_MS}ms)...`);

                    setTimeout(() => {
                        const finalRemoteCheck = Object.entries(state.remoteAudioActive).some(
                            ([id, active]) => id !== state.room?.localParticipant.sid && active
                        );

                        console.log(`🔇 ${participant.identity} 精确检查:`, {
                            finalRemoteCheck,
                            generateEnd: state.generateEnd,
                            currentStatus: state.status
                        });

                        // 优先使用remoteAudioActive状态，DOM检查作为辅助
                        if (!finalRemoteCheck && state.generateEnd && state.status === 'talking') {
                            // 进行DOM检查，但设置更短的超时
                            const audioElementsPlaying = checkAudioElementsStatus();

                            if (!audioElementsPlaying) {
                                // 立即切换
                                state.status = 'listening';
                                sendText('<state><play_end>');
                                console.log(`🛑 精确检查通过，立即切换到 listening`, formatTimestamp(Date.now()));
                            } else {
                                // DOM检查显示还在播放，给予更长的额外时间
                                console.log(`🔄 DOM检查显示仍在播放，给予300ms额外时间...`);
                                setTimeout(() => {
                                    if (
                                        !Object.values(state.remoteAudioActive).some(v => v) &&
                                        state.generateEnd &&
                                        state.status === 'talking'
                                    ) {
                                        // 再次进行DOM检查
                                        const finalAudioCheck = checkAudioElementsStatus();
                                        if (!finalAudioCheck) {
                                            state.status = 'listening';
                                            sendText('<state><play_end>');
                                            console.log(`🛑 额外检查后切换到 listening`);
                                        } else {
                                            console.log(`🔄 最终DOM检查仍显示音频播放，再等200ms...`);
                                            setTimeout(() => {
                                                if (
                                                    !Object.values(state.remoteAudioActive).some(v => v) &&
                                                    state.generateEnd &&
                                                    state.status === 'talking'
                                                ) {
                                                    state.status = 'listening';
                                                    sendText('<state><play_end>');
                                                    console.log(`🛑 强制切换到 listening`);
                                                }
                                            }, 200);
                                        }
                                    }
                                }, 300);
                            }
                        } else {
                            console.log(`⏸️ 精确检查未通过:`, {
                                noRemoteSpeaking: !finalRemoteCheck,
                                hasGenerateEnd: state.generateEnd,
                                isTalking: state.status === 'talking'
                            });
                        }
                    }, EXTRA_SAFETY_DELAY_MS);
                } else {
                    console.log(`⏸️ 基础检查未通过，条件不满足`);
                }
            }, SILENCE_TIMEOUT_MS);
            silenceTimers.set(sid, tid);
        }
    }

    // 增强：更准确的DOM音频检查
    function checkAudioElementsStatus() {
        try {
            const audioElements = document.querySelectorAll('audio');
            let hasPlayingAudio = false;

            console.log(`🎵 检查 ${audioElements.length} 个音频元素状态...`);

            audioElements.forEach((audio, index) => {
                // 更严格的播放状态检查
                const isActuallyPlaying =
                    !audio.paused && !audio.ended && audio.currentTime > 0 && audio.readyState >= 2;

                // 额外检查：是否接近结束
                const isNearEnd = audio.duration && audio.currentTime && audio.duration - audio.currentTime < 0.1;

                console.log(`🎵 音频元素 ${index}:`, {
                    paused: audio.paused,
                    ended: audio.ended,
                    currentTime: audio.currentTime.toFixed(2),
                    duration: audio.duration?.toFixed(2),
                    readyState: audio.readyState,
                    isActuallyPlaying,
                    isNearEnd
                });

                // 如果正在播放且不接近结束，才认为有音频
                if (isActuallyPlaying && !isNearEnd) {
                    hasPlayingAudio = true;
                }
            });

            console.log(`🎵 DOM检查结果: ${hasPlayingAudio ? '有音频播放' : '无音频播放'}`);
            return hasPlayingAudio;
        } catch (error) {
            console.error('检查音频状态出错:', error);
            return false;
        }
    }

    function subscribeParticipant(p) {
        // 初始化状态
        state.remoteAudioActive[p.sid] = false;
        p.on(ParticipantEvent.IsSpeakingChanged, speaking => {
            handleSpeakingChanged(p, speaking);
        });
    }
    /**
     * 加入房间（先 connect 再拿轨道）- 修改为使用静态媒体数据
     * @param {string} url LiveKit 服务器 URL
     * @param {string} token 由后端生成的房间访问 token
     * @param {'audio'|'video'} mode 选择"仅音频"或"音视频"
     * @param {Object} config 业务配置，会通过 metadata 发送给后端
     */
    async function joinRoom(url, token, mode = 'audio', config = {}, enableAV = true) {
        // 清理上次残留
        if (onCleanup) onCleanup();
        state.error = null;
        state.messages = [];
        state.chatMessages = [];
        state.messageIndex = -1;
        // state.status = '';
        state.status = 'connecting';
        state.remoteTracks = {};
        // 清空远端说话状态
        state.remoteAudioActive = {};
        state.localTracks = [];
        // 清空本地说话状态
        state.localAudioActive = false;
        state.connected = false;
        timer = null;
        state.generateEnd = false;
        state.firstInit = true;

        silenceTimers.forEach(clearTimeout);
        silenceTimers.clear();

        // 创建与 demo 相同的默认配置
        const roomOptions = {
            // 自适应流：根据视频元素大小自动调整质量
            adaptiveStream: true,

            // 动态联播：无订阅者时暂停视频层
            dynacast: true,

            // 发布默认配置
            publishDefaults: {
                // 联播：同时发送多个分辨率的视频流
                simulcast: true,

                // 视频联播层配置
                videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h216],

                // 视频编解码器
                videoCodec: 'vp8',

                // 音频配置
                dtx: true, // 音频间断传输
                red: true, // 音频冗余编码
                forceStereo: false,

                // 屏幕共享配置
                screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,

                // SVC 可扩展性模式
                scalabilityMode: 'L3T3_KEY',

                // 备份编解码器策略
                backupCodecPolicy: undefined
            },

            // 视频捕获默认配置
            videoCaptureDefaults: {
                resolution: VideoPresets.h720.resolution // 1280x720
            },

            // 端到端加密配置（默认禁用）
            e2ee: undefined
        };

        // 连接选项
        const connectOptions = {
            autoSubscribe: true // 自动订阅其他参与者的流
        };

        // 创建房间实例
        const room = new Room(roomOptions);
        state.room = room;

        // 原生设置抖动缓冲：增加200ms playout 延迟
        const PLAY_DELAY_MS = 200;

        // 打印连接配置
        console.log('=== LiveKit 连接配置（静态媒体模式）===');
        console.log('Room Options:', JSON.stringify(roomOptions, null, 2));
        console.log('Connect Options:', JSON.stringify(connectOptions, null, 2));
        console.log('URL:', url);
        console.log('Mode:', mode);
        console.log('Config:', config);
        console.log('Static Media Config:', STATIC_MEDIA_CONFIG);

        // 监听远端轨道发布/取消发布
        room.on(RoomEvent.TrackSubscribed, (track, _, participant) => {
            const sid = participant.sid;
            if (!state.remoteTracks[sid]) {
                state.remoteTracks[sid] = [];
                // 初始化该参与者的说话状态
                // state.remoteAudioActive[sid] = false;
                subscribeParticipant(participant);
            }
            state.remoteTracks[sid].push(track);
            // 对 AudioTrack 调用 playoutDelay
            if (track.kind === 'audio' && typeof track.setPlayoutDelay === 'function') {
                track.setPlayoutDelay(PLAY_DELAY_MS);
            }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, _, participant) => {
            const sid = participant.sid;
            if (state.remoteTracks[sid]) {
                state.remoteTracks[sid] = state.remoteTracks[sid].filter(t => t !== track);
                if (!state.remoteTracks[sid].length) {
                    delete state.remoteTracks[sid];
                    delete state.remoteAudioActive[sid];
                }
            }
            // if (track.kind === 'audio') {
            //     // 删除说话状态
            //     delete state.remoteAudioActive[sid];
            // }
            // 通知组件清理对应 <audio>
            if (onCleanup) onCleanup([sid]);
        });
        room.on(RoomEvent.ParticipantDisconnected, participant => {
            const sid = participant.sid;
            delete state.remoteTracks[sid];
            delete state.remoteAudioActive[sid];
            if (onCleanup) onCleanup([sid]);
        });

        // 监听 DataChannel 消息
        room.on('dataReceived', (payload, _, participant) => {
            state.messages.push({
                from: participant.identity || participant.sid,
                payload
            });
        });

        room.on(RoomEvent.ChatMessage, handleChatMessage);
        room.registerTextStreamHandler('lk.chat', async (reader, participant) => {
            const info = reader.info;
            if (info.size) {
                handleChatMessage(
                    {
                        id: info.id,
                        timestamp: info.timestamp,
                        message: await reader.readAll()
                    },
                    room.getParticipantByIdentity(participant?.identity)
                );
            } else {
                handleChatMessage(
                    {
                        id: info.id,
                        timestamp: info.timestamp,
                        message: await reader.readAll()
                    },
                    room.getParticipantByIdentity(participant?.identity)
                );

                console.log('text stream finished');
            }
            console.log('final info including close extensions', reader.info);
        });
        function handleChatMessage(msg, participant) {
            console.log('chatmessages: ', JSON.parse(JSON.stringify(state.chatMessages)), state.messageIndex);
            console.log('%c返回聊天数据：' + msg.message, 'color: red; font-size: 30px');

            if (msg.message === '<state><session_init>' && state.firstInit) {
                // 模型完成初始化
                state.status = 'listening';
                state.generateEnd = false; // 重置生成结束状态
                console.log('🔄 收到 session_init，状态切换为 listening');
                state.firstInit = false;
                localStorage.setItem('initStatus', 'done');
            } else if (msg.message === '<state><vad_end>') {
                state.status = 'thinking';
                console.log('🤔 收到 vad_end，状态切换为 thinking');
            } else if (msg.message === '<state><generate_start>') {
                // 不在这里切换到 talking，等待 audio_start
                state.messageIndex++;
                state.chatMessages.push({
                    type: 'robot',
                    text: ''
                });
                state.generateEnd = false; // 重置生成结束状态
                console.log('📝 收到 generate_start，开始生成回答');
                // 新开一轮，记录生成开始时间
                state.audioRounds.push({
                    round: state.audioRounds.length,
                    participantSid: undefined,
                    generateStartAt: performance.now(),
                    audioStartSignalAt: undefined,
                    firstPacketAt: undefined,
                    firstPlayAt: undefined,
                    deltas: {}
                });
                state.pendingRoundIndex = state.audioRounds.length - 1;
            } else if (msg.message === '<state><audio_start>') {
                // 收到音频开始信号，仅记录，完全依赖实际音频播放检测来切换状态
                console.log('🔊 收到 audio_start，等待实际音频播放检测来切换状态...');
                if (state.pendingRoundIndex >= 0) {
                    const round = state.audioRounds[state.pendingRoundIndex];
                    if (!round.audioStartSignalAt) round.audioStartSignalAt = performance.now();
                }
            } else if (msg.message === '<state><generate_end>') {
                // 单轮对话结束，标记生成结束
                state.generateEnd = true;
                console.log('✅ 收到 generate_end，标记生成结束');

                // 立即检查当前音频状态
                const someoneTalking = Object.values(state.remoteAudioActive).some(v => v);
                console.log(`🔍 generate_end立即检查:`, {
                    someoneTalking,
                    currentStatus: state.status,
                    remoteAudioActive: state.remoteAudioActive
                });

                if (!someoneTalking && state.status === 'talking') {
                    // 没有人在说话且当前是talking状态，快速切换
                    console.log(`⏱️ generate_end触发快速检查...`);

                    setTimeout(() => {
                        const stillNoSpeaking = !Object.values(state.remoteAudioActive).some(v => v);

                        if (stillNoSpeaking && state.generateEnd && state.status === 'talking') {
                            // 快速DOM检查
                            const audioElementsPlaying = checkAudioElementsStatus();

                            if (!audioElementsPlaying) {
                                // 立即切换
                                state.status = 'listening';
                                sendText('<state><play_end>');
                                console.log(
                                    '🔄 generate_end快速检查通过，立即切换到 listening',
                                    formatTimestamp(Date.now())
                                );
                            } else {
                                // 给300ms额外时间
                                console.log(`🔄 generate_end DOM检查显示仍在播放，给予300ms额外时间...`);
                                setTimeout(() => {
                                    if (
                                        !Object.values(state.remoteAudioActive).some(v => v) &&
                                        state.generateEnd &&
                                        state.status === 'talking'
                                    ) {
                                        const finalAudioCheck = checkAudioElementsStatus();
                                        if (!finalAudioCheck) {
                                            state.status = 'listening';
                                            sendText('<state><play_end>');
                                            console.log('🔄 generate_end额外检查后切换到 listening');
                                        } else {
                                            setTimeout(() => {
                                                if (
                                                    !Object.values(state.remoteAudioActive).some(v => v) &&
                                                    state.generateEnd &&
                                                    state.status === 'talking'
                                                ) {
                                                    state.status = 'listening';
                                                    sendText('<state><play_end>');
                                                    console.log('🔄 generate_end强制切换到 listening');
                                                }
                                            }, 200);
                                        }
                                    }
                                }, 300);
                            }
                        } else {
                            console.log('🔊 generate_end检查发现状态变化，取消切换');
                        }
                    }, EXTRA_SAFETY_DELAY_MS);
                } else {
                    console.log('🔊 generate_end时音频仍在播放或状态非talking，等待音频结束');
                }
            } else if (msg.message === '<state><audit_stop>') {
                // 命中安审规则
                state.chatMessages[state.messageIndex].text = '换一个问题聊吧～';
                state.status = 'forbidden';
                console.log('🚫 收到 audit_stop，状态切换为 forbidden');
            } else if (!msg.message.includes('<state>') && !msg.message.includes('您发送的消息是') && msg.message) {
                // 普通聊天消息
                let str = msg.message;
                if (msg.message.includes('<time>') && msg.message.includes('</time>')) {
                    str = msg.message.split('</time>')[1];
                }
                state.chatMessages[state.messageIndex].text += str;
            }
        }

        try {
            const metadataStr = JSON.stringify({ mode, ...config });
            console.log('【LiveKit joinRoom】连接参数（静态媒体模式）', metadataStr);
            // 第一步：只 connect，不申请摄像头/麦克风权限
            await room.connect(url, token, {
                ...connectOptions,
                metadata: metadataStr
            });

            // 打印连接成功信息
            console.log('=== 连接成功状态（静态媒体模式）===');
            console.log('房间名称:', room.name);
            console.log('连接状态:', room.state);
            console.log('本地参与者ID:', room.localParticipant.identity);
            console.log('本地参与者SID:', room.localParticipant.sid);
            console.log('远程参与者数量:', room.remoteParticipants.size);

            // 第二步：连接成功后创建静态媒体轨道
            const tracks = [];

            if (enableAV) {
                console.log('🎵 开始创建静态音频轨道...');
                // 创建静态音频轨道
                const staticAudioTrack = await createStaticAudioTrack();
                tracks.push(staticAudioTrack);
                state.audioEnabled = true;
                console.log('✅ 静态音频轨道创建成功');

                // 如果是 video 模式，则再创建静态视频轨道
                if (mode === 'video') {
                    console.log('🎥 开始创建静态视频轨道...');
                    const staticVideoTrack = await createStaticVideoTrack();
                    tracks.push(staticVideoTrack);
                    state.videoEnabled = true;
                    console.log('✅ 静态视频轨道创建成功');
                }
            } else {
                state.audioEnabled = false;
                state.videoEnabled = false;
            }

            // 逐个发布静态轨道
            for (const t of tracks) {
                await room.localParticipant.publishTrack(t);
            }

            state.localTracks = tracks;
            state.connected = true;

            // 打印发布成功信息
            console.log('=== 静态轨道发布成功 ===');
            console.log('本地轨道数量:', tracks.length);
            console.log('静态音频轨道:', tracks.find(t => t.kind === 'audio') ? '已发布' : '未发布');
            console.log('静态视频轨道:', tracks.find(t => t.kind === 'video') ? '已发布' : '未发布');

            // 对已有远端参与者订阅说话事件
            room.remoteParticipants.forEach(subscribeParticipant);
            room.on(RoomEvent.ParticipantConnected, subscribeParticipant);
        } catch (err) {
            console.error('【LiveKit joinRoom 错误】（静态媒体模式）', err);
            state.error = err;
            state.room = null;
            state.connected = false;
        }
    }

    function sendText(text, flag = false) {
        if (!state.room || !state.connected) return;

        // 检查是否是打断指令
        if (typeof text === 'object' && text.interface === 'break') {
            console.log('🚫 收到打断指令，立即切换到 listening 状态');
            console.log('当前状态:', state.status);
            console.log('远端轨道数量:', Object.keys(state.remoteTracks).length);
            console.log('远端说话状态:', state.remoteAudioActive);

            // 先执行前端的打断操作
            handleInterfaceBreak();

            // 然后发送给后端，让后端感知到并停止算法生成
            state.room.localParticipant.sendText(JSON.stringify(text), { topic: 'lk.chat' });
            return;
        }

        if (flag) {
            state.messageIndex++;
            state.chatMessages.push({ type: 'user', text: JSON.parse(text).text });
        }
        console.log('text: ', text);
        state.room.localParticipant.sendText(text, { topic: 'lk.chat' });
    }

    function sendAndLeave(text) {
        state.messageIndex = -1;
        state.chatMessages = [];

        state.generateEnd = false; // 重置生成结束状态
        // 1. 发送消息
        state.room.localParticipant.sendText(text, { topic: 'lk.chat' });

        // 2. 立即停止远端音频播放
        for (const sid in state.remoteTracks) {
            for (const track of state.remoteTracks[sid]) {
                try {
                    track.detach(); // 从 DOM 分离
                    track.stop(); // 停止播放
                } catch (err) {
                    console.error(`停止远端轨道失败: ${err}`);
                }
            }
        }

        // 3. 停止静态媒体轨道
        for (const track of state.localTracks) {
            try {
                track.detach(); // 从 DOM 分离
                track.stop(); // 停止静态媒体播放
            } catch (err) {
                console.error(`停止静态媒体轨道失败: ${err}`);
            }
        }

        // 4. 设置延迟退出
        setTimeout(() => {
            leaveRoom();
        }, 300);
    }

    function handleInterfaceBreak() {
        console.log('🔄 开始处理打断操作...');

        // 立即切换状态为 listening
        state.status = 'listening';
        state.generateEnd = true;

        // 清空所有远端说话状态
        state.remoteAudioActive = {};

        // 停止远端所有音轨播放
        for (const sid in state.remoteTracks) {
            for (const track of state.remoteTracks[sid]) {
                try {
                    // 从 DOM 分离并获取所有绑定的音频元素
                    const elements = track.detach();
                    if (elements && elements.length > 0) {
                        elements.forEach(el => {
                            if (el.tagName === 'AUDIO') {
                                el.pause(); // 暂停播放
                                el.srcObject = null; // 清除音源
                                el.currentTime = 0; // 重置播放位置
                                el.remove(); // 从 DOM 中移除
                            }
                        });
                    }
                    track.stop(); // 停止轨道
                } catch (err) {
                    console.error(`🔇 停止远端轨道失败: ${err}`);
                }
            }
        }

        // 清空远端轨道引用
        state.remoteTracks = {};

        // 清理组件层的音频元素
        if (onCleanup) {
            onCleanup(Object.keys(state.remoteAudioActive));
        }

        // 清除所有静默定时器
        silenceTimers.forEach(clearTimeout);
        silenceTimers.clear();

        console.log('✅ 打断操作完成，状态已切换为 listening，远端音频已清空');
    }

    /**
     * 发送 DataChannel 数据（消息）
     * @param {any} data 可以是对象或字符串，内部会 JSON.stringify
     * @param {boolean} reliable 是否采用可靠模式
     */
    function sendData(data, reliable = true) {
        if (!state.room) return;
        const payload = new TextEncoder().encode(JSON.stringify(data));
        state.room.localParticipant.publishData(payload, reliable ? DataPacket_Kind.RELIABLE : DataPacket_Kind.LOSSY);
    }

    /**
     * 切换摄像头（前置 ↔ 后置）- 在静态模式下不支持
     */
    async function switchCamera() {
        console.log('⚠️ 静态媒体模式下不支持切换摄像头');
        return;
    }

    /**
     * 切换麦克风 静音/取消静音 - 在静态模式下只改变状态，不影响实际静态音频
     */
    async function toggleMic() {
        state.audioEnabled = !state.audioEnabled;
        console.log(`🎤 麦克风状态切换为: ${state.audioEnabled ? '开启' : '关闭'}（静态模式下仅为状态显示）`);
    }

    /**
     * 切换摄像头 开启/关闭 - 在静态模式下只改变状态，不影响实际静态视频
     */
    function toggleCam() {
        state.videoEnabled = !state.videoEnabled;
        console.log(`📹 摄像头状态切换为: ${state.videoEnabled ? '开启' : '关闭'}（静态模式下仅为状态显示）`);
    }

    /**
     * 离开房间并释放资源
     */
    async function leaveRoom() {
        if (!state.room) return;
        // 1. 停止并 detach 静态媒体轨道
        state.localTracks.forEach(t => {
            try {
                t.detach();
                t.stop();
            } catch {}
        });

        // 2. 清理远端 <audio> 元素（只 detach track，不 stop())
        Object.values(state.remoteTracks)
            .flat()
            .forEach(t => {
                try {
                    t.detach();
                } catch {}
            });
        if (onCleanup) onCleanup();

        // 3. 卸载所有事件，断开连接
        try {
            state.room.removeAllListeners();
            state.room.disconnect();
        } catch {}
        state.localTracks = [];
        state.localAudioActive = false;
        state.connected = false;
        state.videoFacing = 'user';
        // clear remote tracks
        state.remoteTracks = {};
        state.remoteAudioActive = {};
        state.messages = [];
        state.room = null;
        // 清理组件层 <audio> 元素
        if (onCleanup) onCleanup(Object.keys(state.remoteAudioActive));

        // 清理音频控制器
        if (audioController) {
            if (audioController.stopAudio) {
                audioController.stopAudio();
            }
            if (audioController.listenTimer) {
                clearTimeout(audioController.listenTimer);
            }
            audioController = null;
            console.log('🧹 音频控制器已清理');
        }

        state.status = '';
    }

    // 暴露音频控制函数
    function notifyStatusChange(status) {
        if (audioController) {
            audioController.onStatusChange(status);
        }
    }

    // 控制固定音频的本地播放
    function setFixedAudioLocalPlayback(enabled) {
        if (audioController && audioController.setLocalPlayback) {
            audioController.setLocalPlayback(enabled);
        }
    }

    // 设置固定音频的本地播放音量
    function setFixedAudioLocalVolume(volume) {
        if (audioController && audioController.setLocalVolume) {
            audioController.setLocalVolume(volume);
        }
    }

    return {
        state,
        joinRoom,
        sendData,
        switchCamera,
        toggleMic,
        toggleCam,
        leaveRoom,
        sendText,
        sendAndLeave,
        // 新增：静态媒体配置
        STATIC_MEDIA_CONFIG,
        // 新增：状态变化通知
        notifyStatusChange,
        // 新增：固定音频本地播放控制
        setFixedAudioLocalPlayback,
        setFixedAudioLocalVolume
    };
}
