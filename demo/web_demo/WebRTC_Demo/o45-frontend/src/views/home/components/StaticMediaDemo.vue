<template>
    <div class="static-media-demo">
        <div class="demo-header">
            <h2>静态媒体传输演示</h2>
            <p>此演示使用预设的音频和图片文件进行LiveKit传输，而非实际的用户输入</p>
        </div>

        <div class="demo-content">
            <div class="config-panel">
                <h3>静态媒体配置</h3>
                <div class="config-item">
                    <label>音频文件:</label>
                    <input v-model="audioFilePath" placeholder="音频文件路径" />
                </div>
                <div class="config-item">
                    <label>图片文件:</label>
                    <input v-model="imageFilePath" placeholder="图片文件路径" />
                </div>
                <div class="config-item">
                    <label>音频循环间隔:</label>
                    <input v-model.number="audioLoopInterval" type="number" /> ms
                </div>
                <div class="config-item">
                    <label>视频帧率:</label>
                    <input v-model.number="videoFrameRate" type="number" /> fps
                </div>
                <button @click="updateConfig" :disabled="connected">更新配置</button>
            </div>

            <div class="demo-controls">
                <button @click="startDemo" :disabled="connected || loading">
                    {{ loading ? '连接中...' : '开始静态媒体传输' }}
                </button>
                <button @click="stopDemo" :disabled="!connected">停止传输</button>
            </div>

            <div class="demo-status" v-if="connected">
                <h3>传输状态</h3>
                <div class="status-item">
                    <span class="label">连接状态:</span>
                    <span class="value" :class="connected ? 'connected' : 'disconnected'">
                        {{ connected ? '已连接' : '未连接' }}
                    </span>
                </div>
                <div class="status-item">
                    <span class="label">当前状态:</span>
                    <span class="value">{{ state.status || '无状态' }}</span>
                </div>
                <div class="status-item">
                    <span class="label">音频轨道:</span>
                    <span class="value">{{ state.audioEnabled ? '已启用' : '已禁用' }}</span>
                </div>
                <div class="status-item">
                    <span class="label">视频轨道:</span>
                    <span class="value">{{ state.videoEnabled ? '已启用' : '已禁用' }}</span>
                </div>
            </div>
        </div>

        <!-- 远端音频元素 -->
        <div class="remote-audio" v-for="(tracks, sid) in state.remoteTracks" :key="sid">
            <audio :ref="setRemoteAudioRef(sid)" autoplay></audio>
        </div>
    </div>
</template>

<script setup>
    import { ref, reactive, watch, nextTick, onBeforeUnmount } from 'vue';
    import { useLiveKitStatic, registerCleanupStatic } from '@/hooks/useLiveKitStatic';
    import { getRtcToken, logoutRtc } from '@/apis';
    import { ElMessage } from 'element-plus';

    const { state, joinRoom, sendText, sendAndLeave, STATIC_MEDIA_CONFIG } = useLiveKitStatic();

    // 配置项
    const audioFilePath = ref(STATIC_MEDIA_CONFIG.audioFilePath);
    const imageFilePath = ref(STATIC_MEDIA_CONFIG.imageFilePath);
    const audioLoopInterval = ref(STATIC_MEDIA_CONFIG.audioLoopInterval);
    const videoFrameRate = ref(STATIC_MEDIA_CONFIG.videoFrameRate);

    // 状态
    const connected = ref(false);
    const loading = ref(false);
    const token = ref('');

    // 远端音频引用
    const remoteAudioRefs = {};

    // 监听连接状态
    watch(
        () => state.connected,
        newVal => {
            connected.value = newVal;
        }
    );

    // 监听远端轨道
    watch(
        () => state.remoteTracks,
        async remMap => {
            await nextTick();
            for (const sid in remMap) {
                const tracks = remMap[sid];
                const audioTrack = tracks.find(t => t.kind === 'audio');
                if (audioTrack && remoteAudioRefs[sid]) {
                    console.log('附加远端音频轨道:', sid);
                    audioTrack.attach(remoteAudioRefs[sid]);
                }
            }
        },
        { deep: true }
    );

    // 生成远端音频引用
    function setRemoteAudioRef(sid) {
        return el => {
            if (!el) return;
            remoteAudioRefs[sid] = el;
            const tracks = state.remoteTracks[sid] || [];
            const audioTrack = tracks.find(t => t.kind === 'audio');
            if (audioTrack) {
                audioTrack.attach(el);
            }
        };
    }

    // 更新配置
    function updateConfig() {
        STATIC_MEDIA_CONFIG.audioFilePath = audioFilePath.value;
        STATIC_MEDIA_CONFIG.imageFilePath = imageFilePath.value;
        STATIC_MEDIA_CONFIG.audioLoopInterval = audioLoopInterval.value;
        STATIC_MEDIA_CONFIG.videoFrameRate = videoFrameRate.value;

        console.log('配置已更新:', STATIC_MEDIA_CONFIG);
        ElMessage.success('配置已更新');
    }

    // 开始演示
    async function startDemo() {
        loading.value = true;

        try {
            // 获取token（这里使用模拟token，实际应用中需要从后端获取）
            const mockToken = 'your-mock-token-here';
            token.value = mockToken;

            const config = {
                userAgent: navigator.userAgent,
                joinTime: Date.now(),
                staticMediaMode: true,
                audioFile: audioFilePath.value,
                imageFile: imageFilePath.value
            };

            console.log('开始静态媒体演示...', config);

            // 🔧 准备初始化配置，直接传入 joinRoom 避免时序竞争
            const initConfig = {
                interface: 'init',
                type: 'video',
                model: 'demo-model',
                staticMediaMode: true
            };
            console.log('💾 准备初始化配置（静态媒体演示），传入 joinRoom...');

            // 使用模拟的LiveKit URL（实际应用中应该使用真实的URL）
            await joinRoom('wss://your-livekit-server', mockToken, 'video', config, initConfig);

            ElMessage.success('静态媒体传输已开始');
        } catch (error) {
            console.error('启动演示失败:', error);
            ElMessage.error('启动演示失败: ' + error.message);
        } finally {
            loading.value = false;
        }
    }

    // 停止演示
    async function stopDemo() {
        console.log('停止静态媒体演示...');

        const stopMessage = {
            interface: 'stop',
            staticMediaMode: true
        };

        sendAndLeave(JSON.stringify(stopMessage));

        // 清理资源
        registerCleanupStatic();

        if (token.value) {
            try {
                await logoutRtc({ token: token.value });
            } catch (error) {
                console.error('登出RTC失败:', error);
            }
        }

        ElMessage.success('静态媒体传输已停止');
    }

    // 清理函数
    registerCleanupStatic((sids = []) => {
        const list = sids.length ? sids : Object.keys(remoteAudioRefs);
        list.forEach(sid => {
            const el = remoteAudioRefs[sid];
            if (el?.parentNode) el.parentNode.removeChild(el);
            delete remoteAudioRefs[sid];
        });
    });

    // 组件卸载时清理
    onBeforeUnmount(() => {
        if (connected.value) {
            stopDemo();
        }
        registerCleanupStatic();
    });
</script>

<style lang="less" scoped>
    .static-media-demo {
        padding: 20px;
        max-width: 800px;
        margin: 0 auto;

        .demo-header {
            text-align: center;
            margin-bottom: 30px;

            h2 {
                color: #333;
                margin-bottom: 10px;
            }

            p {
                color: #666;
                font-size: 14px;
            }
        }

        .demo-content {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .config-panel {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;

            h3 {
                margin-bottom: 15px;
                color: #333;
            }

            .config-item {
                display: flex;
                align-items: center;
                margin-bottom: 10px;

                label {
                    min-width: 120px;
                    font-weight: 500;
                    color: #555;
                }

                input {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    margin-left: 10px;

                    &:focus {
                        outline: none;
                        border-color: #4a90e2;
                    }
                }
            }

            button {
                background: #4a90e2;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;

                &:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }

                &:hover:not(:disabled) {
                    background: #357abd;
                }
            }
        }

        .demo-controls {
            display: flex;
            gap: 10px;
            justify-content: center;

            button {
                padding: 12px 24px;
                border: none;
                border-radius: 6px;
                font-size: 16px;
                cursor: pointer;
                transition: background-color 0.3s;

                &:first-child {
                    background: #28a745;
                    color: white;

                    &:hover:not(:disabled) {
                        background: #218838;
                    }

                    &:disabled {
                        background: #ccc;
                        cursor: not-allowed;
                    }
                }

                &:last-child {
                    background: #dc3545;
                    color: white;

                    &:hover:not(:disabled) {
                        background: #c82333;
                    }

                    &:disabled {
                        background: #ccc;
                        cursor: not-allowed;
                    }
                }
            }
        }

        .demo-status {
            background: #e8f5e8;
            border-radius: 8px;
            padding: 20px;

            h3 {
                margin-bottom: 15px;
                color: #333;
            }

            .status-item {
                display: flex;
                align-items: center;
                margin-bottom: 8px;

                .label {
                    min-width: 100px;
                    font-weight: 500;
                    color: #555;
                }

                .value {
                    color: #333;

                    &.connected {
                        color: #28a745;
                        font-weight: 500;
                    }

                    &.disconnected {
                        color: #dc3545;
                        font-weight: 500;
                    }
                }
            }
        }

        .remote-audio {
            display: none; // 隐藏音频元素
        }
    }
</style>
