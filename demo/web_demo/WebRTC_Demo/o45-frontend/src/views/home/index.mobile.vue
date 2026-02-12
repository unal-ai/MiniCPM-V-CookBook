<template>
    <div class="home-page" :class="{ 'loading-mode': isLoadingMode }">
        <!-- <div v-if="isDev" class="device-banner mobile-banner">📱 手机端页面</div> -->
        <NetworkSpeedMobile
            class="network-speed-container"
            :is-testing="isTesting"
            :speed-mbps="speedMbps"
            :theme="activeTab === 'video' && isCalling ? 'dark' : 'light'"
        />
        <div class="model-type" v-if="!isCalling">{{ modelType === 'simplex' ? t('simplexMode') : t('duplexMode') }}</div>
        <div class="hd-type" v-if="isCalling && hdMode">
            {{ t('hdModeLabel') }}
        </div>
        <header class="mobile-header">
            <div class="logo">
                <SvgIcon name="logo-o4.5" class="logo-icon" />
            </div>
            <!-- 通话中（仅语音）：显示菜单按钮；视频通话右上角留给切换摄像头按钮 -->
            <div v-if="isCalling && activeTab !== 'video'" class="menu-btn" @click="showMenu = !showMenu">
                <SvgIcon name="more" class="menu-icon" />
            </div>
            <!-- 未通话：显示语言切换（通话中不显示，避免与视频页右上角控件冲突） -->
            <div v-else-if="!isCalling" style="display: flex; align-items: center; gap: 8px">
                <!-- <div class="change-language" @click="showModelTypeDialog = true">
                    <SvgIcon name="model-type-change" class="language-icon" />
                </div> -->
                <div class="change-language" v-if="language === 'zh'" @click="handleChangeLanguage('en')">
                    <SvgIcon name="mobile-english" class="language-icon" />
                </div>
                <div class="change-language" v-else @click="handleChangeLanguage('zh')">
                    <SvgIcon name="mobile-chinese" class="language-icon" />
                </div>
                <div class="change-language" @click="showSettingsDialog = true">
                    <SvgIcon name="mobile-setting" class="language-icon" />
                </div>
            </div>
        </header>

        <!-- 通话中：隐藏模式切换 -->
        <!-- <div v-if="!isCalling" class="mode-switch">
            <div class="type-btn" :class="{ active: modelType === 'simplex' }" @click="changeModelType('simplex')">
                {{ t('simplexMode') }}
            </div>
            <div class="type-btn" :class="{ active: modelType === 'duplex' }" @click="changeModelType('duplex')">
                {{ t('duplexMode') }}
            </div>
        </div> -->

        <!-- 菜单弹窗 -->
        <transition name="menu-fade">
            <div v-if="showMenu && isCalling && activeTab !== 'video'" class="menu-overlay" @click="showMenu = false">
                <div class="menu-popup" @click.stop>
                    <div class="menu-item" v-if="language === 'zh'" @click="handleChangeLanguage('en')">
                        <SvgIcon name="mobile-english" class="language-icon" />
                        <span class="language-text">English</span>
                    </div>
                    <div class="menu-item" v-else @click="handleChangeLanguage('zh')">
                        <SvgIcon name="mobile-chinese" class="language-icon" />
                        <span class="language-text">中文</span>
                    </div>
                    <div class="menu-divider"></div>
                    <div class="menu-item model-type-item">
                        <SvgIcon name="mobile-model-type" class="model-type-icon" />
                        {{ modelType === 'simplex' ? t('simplexMode') : t('duplexMode') }}
                    </div>
                    <div class="menu-divider"></div>
                    <div class="menu-item model-type-item">
                        <SvgIcon name="model-type-change" class="model-type-icon" />
                        <span class="model-type-text">{{ t('modeSwitch') }}</span>
                    </div>
                    <div class="menu-item model-type-item">
                        <SvgIcon name="mobile-setting" class="model-type-icon" />
                        <span class="model-type-text">{{ t('settings') }}</span>
                    </div>
                </div>
            </div>
        </transition>

        <div class="content-area">
            <VoiceCallRTCMobile
                ref="voiceRef"
                v-if="activeTab === 'voice'"
                v-model:isCalling="isCalling"
                v-model:loading="loading"
                :model-type="modelType"
                @handleLogin="handleLogin"
                @updateSessionId="handleUpdateSessionId"
            />
            <VideoCallRTCMobile
                ref="videoRef"
                v-else
                v-model:isCalling="isCalling"
                v-model:loading="loading"
                :model-type="modelType"
                @handleLogin="handleLogin"
                @updateSessionId="handleUpdateSessionId"
            />
        </div>

        <!-- 参数设置按钮（仅内部版本且未通话时显示） -->
        <div v-if="isInternal && !isCalling" class="params-settings-btn" @click="handleOpenParams">
            <SvgIcon name="info" class="settings-icon" />
            <span>{{ t('paramSettings') }}</span>
        </div>

        <!-- Session ID Display -->
        <!-- <div class="session-id-display" v-if="sessionId" @click="copySessionId">
            <span class="session-label">Session ID:</span>
            <span class="session-value">{{ sessionId }}</span>
        </div> -->

        <!-- 通话中：隐藏底部切换按钮 -->
        <div v-if="!isCalling" class="bottom-tabs">
            <div class="tab-group">
                <el-tooltip :content="t('menuTabVoice')" placement="top" :disabled="true">
                    <div
                        class="tab-btn"
                        :class="{ active: activeTab === 'voice' }"
                        @click="handleClickTab('voice', 0)"
                    >
                        <SvgIcon name="mobile-voice-icon" class="tab-icon" />
                        <span class="tab-text">{{ language === 'zh' ? '语音通话' : 'Voice Call' }}</span>
                    </div>
                </el-tooltip>
                <el-tooltip :content="t('menuTabVideo')" placement="top" :disabled="true">
                    <div
                        class="tab-btn"
                        :class="{ active: activeTab === 'video' }"
                        @click="handleClickTab('video', 1)"
                    >
                        <SvgIcon name="mobile-video-icon" class="tab-icon" />
                        <span class="tab-text">{{ language === 'zh' ? '视频通话' : 'Video Call' }}</span>
                    </div>
                </el-tooltip>
            </div>
        </div>

        <Login v-if="showLogin" v-model:showLogin="showLogin" @loginSuccess="handleLoginSuccess" />
        <DraggableClock v-if="isInternal" />
        <!-- <LikeDislike :show="isCalling" /> -->
        <!-- Mode Selector -->
        <!-- <ModeSelector
            v-if="showModeSelector"
            v-model="showModeSelector"
            @modeSelected="handleModeSelected"
            :isPc="false"
        /> -->

        <!-- Model Type Dialog (单工/双工切换弹窗) -->
        <transition name="slide-up">
            <div v-if="showModelTypeDialog" class="model-type-overlay" @click="showModelTypeDialog = false">
                <div class="model-type-dialog" @click.stop>
                    <!-- 拖动条 -->
                    <div class="dialog-handle"></div>

                    <!-- 标题 -->
                    <div class="dialog-header">
                        <div class="main-title">{{ t('modeSwitch') }}</div>
                        <div class="sub-title">{{ t('modeSelectTitle') }}</div>
                    </div>

                    <!-- 模式卡片 -->
                    <div class="model-type-cards">
                        <div
                            class="model-type-card"
                            :class="{ active: selectedOption === 'streaming' }"
                            @click="selectedOption = 'streaming'"
                        >
                            <div class="card-icon">
                                <SvgIcon name="type-stream" class="icon" />
                            </div>
                            <div class="card-content">
                                <div class="card-title">{{ t('modeStreamingTitle') }}</div>
                                <div class="card-desc">{{ t('modeStreamingDesc') }}</div>
                            </div>
                        </div>

                        <!-- <div
                            class="model-type-card"
                            :class="{ active: selectedOption === 'multimodal' }"
                            @click="selectedOption = 'multimodal'"
                        >
                            <div class="card-icon">
                                <SvgIcon name="type-image" class="icon" />
                            </div>
                            <div class="card-content">
                                <div class="card-title">{{ t('modeMultimodalTitle') }}</div>
                                <div class="card-desc">{{ t('modeMultimodalDesc') }}</div>
                            </div>
                        </div> -->
                    </div>

                    <!-- 确定按钮 -->
                    <div class="dialog-actions">
                        <el-button type="primary" class="confirm-btn" @click="handleConfirmModelType"> 确定 </el-button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Params Settings Dialog (参数设置弹窗) -->
        <transition name="slide-up">
            <div v-if="paramsVisible" class="model-type-overlay" @click="paramsVisible = false">
                <div class="params-dialog" @click.stop>
                    <!-- 拖动条 -->
                    <div class="dialog-handle"></div>

                    <!-- 标题 -->
                    <div class="dialog-header">
                        <div class="main-title">{{ t('paramSettings') }}</div>
                    </div>

                    <!-- 参数内容 -->
                    <div class="params-content">
                        <div class="config-item">
                            <div class="config-label">Audio Prompt</div>
                            <el-input
                                type="textarea"
                                v-model="audioPrompt"
                                :rows="2"
                                size="small"
                                class="params-textarea"
                            />
                        </div>
                        <div class="config-item">
                            <div class="config-label">Task Prompt</div>
                            <el-input
                                type="textarea"
                                v-model="taskPrompt"
                                :rows="2"
                                size="small"
                                class="params-textarea"
                            />
                        </div>
                        <div class="config-row">
                            <div class="config-item">
                                <div class="config-label">Timbre</div>
                                <el-input type="number" v-model="timbre" size="small" class="params-input" />
                            </div>
                            <div class="config-item">
                                <div class="config-label">Model Id</div>
                                <el-input type="number" v-model="modelId" size="small" class="params-input" />
                            </div>
                        </div>
                        <div class="config-item">
                            <div class="config-label">Model Config</div>
                            <el-input
                                type="textarea"
                                v-model="modelConfig"
                                size="small"
                                :rows="2"
                                placeholder="Please input json string"
                                class="params-textarea"
                            />
                        </div>
                    </div>

                    <!-- 按钮 -->
                    <div class="dialog-actions params-actions">
                        <el-button class="action-btn-half params-reset-btn" @click="resetFormConfig"> 重置 </el-button>
                        <el-button type="primary" class="action-btn-half params-save-btn" @click="saveFormConfig">
                            保存
                        </el-button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Settings Dialog (设置弹窗) -->
        <transition name="slide-up">
            <div v-if="showSettingsDialog" class="model-type-overlay" @click="showSettingsDialog = false">
                <div class="params-dialog" @click.stop>
                    <!-- 拖动条 -->
                    <div class="dialog-handle"></div>

                    <!-- 标题 -->
                    <div class="dialog-header">
                        <div class="main-title">{{ t('configTitle') }}</div>
                    </div>

                    <!-- 设置内容 -->
                    <div class="params-content">
                        <!-- 推理服务设置（仅内部版显示） -->
                        <div class="config-item voice-config-item" v-if="isInternal">
                            <div class="config-label">{{ t('inferenceSettings') }}</div>
                            <el-select
                                v-model="selectedServiceType"
                                placeholder="请选择"
                                class="voice-select"
                                popper-class="voice-select-popper"
                                style="width: 160px"
                            >
                                <el-option label="o45-cpp" value="o45-cpp" />
                                <el-option label="o45-python" value="o45-python" />
                            </el-select>
                        </div>

                        <!-- 高刷 -->
                        <!-- <div class="config-item" v-if="activeTab === 'video'">
                            <div class="setting-label">高刷</div>
                            <el-switch
                                v-model="highRefresh"
                                class="settings-switch"
                                :disabled="activeTab === 'voice'"
                            />
                        </div> -->

                        <!-- 通话语言 -->
                        <div class="config-item voice-config-item" v-if="activeTab === 'voice'">
                            <div class="config-label">{{ t('callLanguageLabel') }}</div>
                            <el-select
                                v-model="callLanguage"
                                placeholder="请选择"
                                class="voice-select"
                                popper-class="voice-select-popper"
                                style="width: 160px"
                            >
                                <el-option label="English" value="en" />
                                <el-option label="中文" value="zh" />
                            </el-select>
                        </div>

                        <!-- 高清模式 -->
                        <div class="config-item" v-if="activeTab === 'video'">
                            <div class="setting-label">{{ t('hdModeLabel') }}</div>
                            <el-switch v-model="hdMode" class="settings-switch" :disabled="activeTab === 'voice'" />
                        </div>

                        <!-- 语音选项 -->
                        <div class="config-item voice-config-item" v-if="false && activeTab === 'voice'">
                            <div class="config-label">语音选项</div>
                            <el-select
                                v-model="voiceOption"
                                placeholder="请选择"
                                class="voice-select"
                                popper-class="voice-select-popper"
                                style="width: 160px"
                            >
                                <el-option
                                    v-for="option in VOICE_OPTIONS"
                                    :key="option.value"
                                    :label="option.label[language]"
                                    :value="option.value"
                                />
                            </el-select>
                        </div>

                        <!-- 音色克隆（仅当选择自定义时显示） -->
                        <div
                            class="config-item voice-clone-item"
                            v-if="fasle && activeTab === 'voice' && voiceOption === 10086"
                        >
                            <div class="config-label">音色克隆</div>
                            <el-button class="upload-voice-btn" size="small" @click="handleUploadVoice">
                                <SvgIcon name="upload" class="upload-icon" />
                                {{ voiceCloneFile ? '重新上传' : '上传文件' }}
                            </el-button>
                            <input
                                ref="voiceFileInput"
                                type="file"
                                accept=".mp3,.wav,.m4a"
                                style="display: none"
                                @change="handleVoiceFileChange"
                            />
                        </div>

                        <!-- 已上传的音频文件显示 -->
                        <div
                            class="config-item voice-file-display"
                            v-if="false && ctiveTab === 'voice' && voiceOption === 10086 && voiceCloneFile"
                        >
                            <div class="voice-file-info">
                                <div class="file-icon-container">
                                    <SvgIcon name="music" class="file-icon" />
                                </div>
                                <span class="file-name">{{ voiceCloneFile.name }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 确定按钮 -->
                    <div class="dialog-actions">
                        <el-button type="primary" class="confirm-btn" @click="handleConfirmSettings"> 确定 </el-button>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<script setup>
    import { ref, onMounted, watch } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { useRoute, useRouter } from 'vue-router';
    import { isInternalVersion } from '@/utils/version';

    import VoiceCallRTCMobile from './components/Voice_new_rtc.mobile.vue';
    import VideoCallRTCMobile from './components/Video_new_rtc.mobile.vue';
    import ModeSelector from '@/components/ModeSelector/index.vue';
    import { NetworkSpeedMobile } from '@/components/NetworkSpeed';
    import { VOICE_OPTIONS } from '@/config/voiceOptions';
    import { useNetworkSpeed } from '@/hooks/useNetworkSpeed';
    // import LikeDislike from '@/components/LikeDislike/index.vue';

    const route = useRoute();
    const router = useRouter();

    // 网络测速功能
    const { speedMbps, isTesting, startTesting, stopTesting } = useNetworkSpeed({
        fileUrl: '/static/test.bin',
        fileSizeBytes: 500 * 1024, // 500 KB
        interval: 10000 // 每 10 秒检测一次
    });

    const typeObj = { 0: 'voice', 1: 'video' };
    // Read current C++ inference mode from build-time env (set by oneclick.sh)
    const cppMode = import.meta.env.VITE_CPP_MODE || 'duplex';
    const defaultType = cppMode === 'simplex' ? 'voice' : (typeObj[route.query.type] || 'video');
    // const defaultType = 'video';

    const { t, locale } = useI18n();
    const activeTab = ref(defaultType);
    // 默认语言设置为英文
    const language = ref(localStorage.getItem('language') || 'en');

    const showLogin = ref(false);
    const showModeSelector = ref(false);
    const isLoadingMode = ref(false);
    const needLogin = ref(false);
    const isCalling = ref(false);
    const sessionId = ref('');
    const voiceRef = ref();
    const videoRef = ref();

    const loading = ref(false);

    const modelType = ref(localStorage.getItem('modelType') || cppMode); // 单双工模式 'simplex' or 'duplex'
    const showMenu = ref(false);
    const showModelTypeDialog = ref(false);
    const selectedOption = ref('streaming');
    const paramsVisible = ref(false);

    // 设置弹窗相关
    const showSettingsDialog = ref(false);
    const highRefresh = ref(false);
    const hdMode = ref(false);
    const voiceOption = ref(1);
    const selectedServiceType = ref('');

    // 音色克隆相关
    const voiceFileInput = ref(null);
    const voiceCloneFile = ref(null);
    const voiceCloneBase64 = ref('');
    const voiceCloneFormat = ref('');

    // 通话语言选择
    const callLanguage = ref('en');

    // 支持URL参数动态切换版本 (例如: ?version=official 或 ?version=internal)
    const isInternal = isInternalVersion();
    const highRefreshCacheKey = 'highRefresh';
    // const isDev = import.meta.env.DEV; // 开发环境标识（如需显示页面角标可启用）

    // 参数设置相关
    const defaultConfig = '{"temperature":0.7,"topP":0.8,"topK":60,"lengthPenalty":0,"repeatPenalty":1.05}';
    const defaultAudioPrompt =
        'Please use the above voice to talk with the user. Please be lively and natural, do not sound like a robot.';
    const defaultTaskPrompt = 'You are a helpful AI assistant developed by ModelBest.';
    const defaultTimbre = 1;
    const defaultModelId = 8;
    const modelConfig = ref('');
    const audioPrompt = ref(defaultAudioPrompt);
    const taskPrompt = ref(defaultTaskPrompt);
    const timbre = ref(defaultTimbre);
    const modelId = ref(defaultModelId);

    // 检查是否需要显示模式选择弹窗
    // const hasSelected = localStorage.getItem('hasSelectedMode');
    // if (!hasSelected || hasSelected !== 'true') {
    //     isLoadingMode.value = true;
    //     showModeSelector.value = true;
    // }

    onMounted(() => {
        localStorage.setItem('language', language.value);
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (!userInfo.token) needLogin.value = true;

        // 初始化音色克隆数据
        window.voiceCloneData = null;

        const cachedHighRefresh = localStorage.getItem(highRefreshCacheKey);
        if (cachedHighRefresh === null) {
            localStorage.setItem(highRefreshCacheKey, 'false');
        }

        // 初始化设置弹窗数据
        const savedHighRefresh = localStorage.getItem('highRefresh');
        const savedHdMode = localStorage.getItem('hdMode');
        const savedVoiceOption = localStorage.getItem('voiceOption');
        const savedServiceType = localStorage.getItem('inferenceServiceType');

        if (savedHighRefresh !== null) {
            highRefresh.value = savedHighRefresh === 'true';
        } else {
            highRefresh.value = false;
            localStorage.setItem('highRefresh', 'false');
        }
        if (savedHdMode !== null) {
            hdMode.value = savedHdMode === 'true';
        } else {
            hdMode.value = false;
            localStorage.setItem('hdMode', 'false');
        }
        if (savedVoiceOption !== null) {
            voiceOption.value = Number(savedVoiceOption);
        } else {
            voiceOption.value = 1;
            localStorage.setItem('voiceOption', '1');
        }
        if (savedServiceType) {
            selectedServiceType.value = savedServiceType;
        }

        // 初始化通话语言（默认英文）
        const savedCallLanguage = localStorage.getItem('callLanguage');
        if (savedCallLanguage !== null) {
            callLanguage.value = savedCallLanguage;
        } else {
            callLanguage.value = 'en';
            localStorage.setItem('callLanguage', 'en');
        }

        // 初始化参数设置（仅内部版本）
        if (isInternal) {
            let config = localStorage.getItem('modelInfo') || '';
            if (config.length > 0) {
                modelConfig.value = config;
            } else {
                modelConfig.value = defaultConfig;
                localStorage.setItem('modelInfo', defaultConfig);
            }

            const {
                audioPrompt: audioPrompt1 = defaultAudioPrompt,
                taskPrompt: taskPrompt1 = defaultTaskPrompt,
                timbre: timbre1 = defaultTimbre,
                modelId: modelId1 = defaultModelId
            } = JSON.parse(localStorage.getItem('prompt') || '{}');

            audioPrompt.value = audioPrompt1;
            taskPrompt.value = taskPrompt1;
            timbre.value = timbre1;
            modelId.value = modelId1;

            localStorage.setItem(
                'prompt',
                JSON.stringify({
                    audioPrompt: audioPrompt1,
                    taskPrompt: taskPrompt1,
                    timbre: timbre1,
                    modelId: modelId1
                })
            );
        }
    });

    // 视频模式会占用右上角（切换摄像头按钮），因此自动关闭并隐藏"三点菜单"
    watch(
        () => [activeTab.value, isCalling.value],
        ([tab, calling]) => {
            if (!calling || tab === 'video') {
                showMenu.value = false;
            }
        }
    );

    // 监听通话状态控制测速
    watch(
        isCalling,
        val => {
            if (val) {
                stopTesting(); // 通话时关闭测速
            } else {
                startTesting(); // 不通话时开启测速
            }
        },
        { immediate: true }
    );

    const handleChangeLanguage = val => {
        language.value = val;
        locale.value = val;
        localStorage.setItem('language', val);
    };

    const handleClickTab = async (val, index) => {
        if (activeTab.value === val) return;
        if (!isCalling.value) {
            changeTab(val, index);
            return;
        }
        if (activeTab.value === 'voice') await voiceRef.value.stopRecording();
        else await videoRef.value.stopRecording();
        changeTab(val, index);
    };

    const changeTab = (val, index) => {
        activeTab.value = val;
        const others = { ...route.query };
        delete others.type;
        router.push({ path: '/', query: { type: index, ...others } });
        loading.value = true;
        setTimeout(() => {
            loading.value = false;
        }, 500);
    };

    const handleLoginSuccess = () => {
        needLogin.value = false;
    };
    const handleLogin = () => {
        showLogin.value = true;
        needLogin.value = true;
    };
    const changeModelType = val => {
        if (isCalling.value) return;
        if (modelType.value === val) return;
        modelType.value = val;

        ElMessage.success(t('modeSwitchSuccess'));
        localStorage.setItem('modelType', val);
    };
    const handleModeSelected = mode => {
        // 确保 localStorage 已正确保存
        const hasSelected = localStorage.getItem('hasSelectedMode');
        if (hasSelected !== 'true') {
            localStorage.setItem('hasSelectedMode', 'true');
            localStorage.setItem('selectedMode', mode);
        }

        // 移除加载遮罩
        isLoadingMode.value = false;
    };

    const handleShowModelTypeDialog = () => {
        showMenu.value = false;
        selectedOption.value = 'streaming'; // 初始化选择
        showModelTypeDialog.value = true;
    };

    const handleConfirmModelType = () => {
        showModelTypeDialog.value = false;

        if (selectedOption.value === 'streaming') {
            // 流式交互模式 - 关闭弹窗即可
            return;
        }

        if (selectedOption.value === 'multimodal') {
            // 图文交互 - 跳转到外部链接
            setTimeout(() => {
                window.location.href = 'https://minicpm-v.openbmb.cn/';
            }, 300);
        }
    };

    // 打开参数设置弹窗
    const handleOpenParams = () => {
        if (isCalling.value) return;
        paramsVisible.value = true;
    };

    // 保存参数配置
    const saveFormConfig = () => {
        // 防止重复点击：先检查弹窗状态
        if (!paramsVisible.value) return;

        // 立即关闭弹窗，防止动画期间再次点击
        paramsVisible.value = false;

        localStorage.setItem('modelInfo', modelConfig.value);
        localStorage.setItem(
            'prompt',
            JSON.stringify({
                audioPrompt: audioPrompt.value,
                taskPrompt: taskPrompt.value,
                timbre: timbre.value,
                modelId: modelId.value
            })
        );
        ElMessage.success('配置保存成功！');
    };

    // 重置参数配置
    const resetFormConfig = () => {
        // 防止重复点击：先检查弹窗状态
        if (!paramsVisible.value) return;

        modelConfig.value = defaultConfig;
        audioPrompt.value = defaultAudioPrompt;
        taskPrompt.value = defaultTaskPrompt;
        timbre.value = defaultTimbre;
        modelId.value = defaultModelId;
        localStorage.setItem('modelInfo', defaultConfig);
        localStorage.setItem(
            'prompt',
            JSON.stringify({
                audioPrompt: defaultAudioPrompt,
                taskPrompt: defaultTaskPrompt,
                timbre: defaultTimbre,
                modelId: defaultModelId
            })
        );
        ElMessage.success('配置重置成功！');
    };

    // 更新 sessionId
    const handleUpdateSessionId = newSessionId => {
        sessionId.value = newSessionId;
        console.log('📝 Session ID 已更新:', newSessionId);
    };

    // 复制 Session ID 到剪贴板
    const copySessionId = async () => {
        if (!sessionId.value) return;

        try {
            // 优先使用现代 Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(sessionId.value);
            } else {
                // 降级方案：使用 textarea 方式
                const textarea = document.createElement('textarea');
                textarea.value = sessionId.value;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            ElMessage.success('Session ID 已复制到剪贴板');
        } catch (error) {
            console.error('复制失败:', error);
            ElMessage.error('复制失败，请手动复制');
        }
    };

    // 触发文件选择
    const handleUploadVoice = () => {
        voiceFileInput.value?.click();
    };

    // 获取音频时长
    const getAudioDuration = file => {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            const url = URL.createObjectURL(file);
            audio.src = url;
            audio.addEventListener('loadedmetadata', () => {
                URL.revokeObjectURL(url);
                resolve(audio.duration);
            });
            audio.addEventListener('error', () => {
                URL.revokeObjectURL(url);
                reject(new Error('无法读取音频文件'));
            });
        });
    };

    // 处理文件选择
    const handleVoiceFileChange = async event => {
        const file = event.target.files?.[0];
        if (!file) return;

        // 验证文件格式
        const fileExt = file.name.split('.').pop().toLowerCase();
        if (!['mp3', 'wav', 'm4a'].includes(fileExt)) {
            ElMessage.error('只支持 .mp3、.wav 或 .m4a 格式的音频文件');
            event.target.value = '';
            return;
        }

        // 验证文件大小（1MB = 1024 * 1024 bytes）
        if (file.size > 1024 * 1024) {
            ElMessage.error('文件大小不能超过 1MB');
            event.target.value = '';
            return;
        }

        try {
            // 验证音频时长
            const duration = await getAudioDuration(file);
            if (duration < 5) {
                ElMessage.error('音频时长不能少于 5 秒');
                event.target.value = '';
                return;
            }
            if (duration > 15) {
                ElMessage.error('音频时长不能超过 15 秒');
                event.target.value = '';
                return;
            }

            // 读取文件为 base64
            const reader = new FileReader();
            reader.onload = e => {
                const base64 = e.target.result.split(',')[1]; // 去掉 data:audio/xxx;base64, 前缀
                voiceCloneFile.value = file;
                voiceCloneBase64.value = base64;
                voiceCloneFormat.value = fileExt;
                // 将音色克隆数据存储到全局，供 login 时使用
                window.voiceCloneData = {
                    audioFormat: fileExt,
                    base64Str: base64
                };
                ElMessage.success('音频文件选择成功');
            };
            reader.onerror = () => {
                ElMessage.error('文件读取失败');
                event.target.value = '';
            };
            reader.readAsDataURL(file);
        } catch (error) {
            ElMessage.error(error.message || '音频文件处理失败');
            event.target.value = '';
        }
    };

    // 确认设置
    const handleConfirmSettings = () => {
        if (!showSettingsDialog.value) return;

        showSettingsDialog.value = false;

        // 保存设置到 localStorage
        localStorage.setItem('highRefresh', highRefresh.value.toString());
        localStorage.setItem('hdMode', hdMode.value.toString());
        localStorage.setItem('voiceOption', String(voiceOption.value));
        localStorage.setItem('callLanguage', callLanguage.value);
        if (selectedServiceType.value) {
            localStorage.setItem('inferenceServiceType', selectedServiceType.value);
        }

        // 如果切换语音选项且不是自定义，清空音色克隆文件
        if (voiceOption.value !== 10086) {
            voiceCloneFile.value = null;
            voiceCloneBase64.value = '';
            voiceCloneFormat.value = '';
            // 清空全局数据
            window.voiceCloneData = null;
        }

        ElMessage.success(t('settingsSaveSuccess'));
    };
</script>

<style lang="less" scoped>
    .device-banner {
        position: fixed;
        bottom: 20px;
        left: 20px;
        padding: 8px 16px;
        border-radius: 20px;
        z-index: 9999;
        font-size: 13px;
        font-weight: 500;
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);

        &.mobile-banner {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
    }

    .network-speed-container {
        position: fixed;
        top: 60px;
        left: 16px;
        z-index: 999;
        // animation: fadeIn 0.3s ease;
    }

    .model-type {
        position: fixed;
        top: 60px;
        left: 70px;
        padding: 0 16px;
        border-radius: 90px;
        background: #ffffff;
        color: #595f6d;
        font-family: 'PingFang SC';
        font-size: 14px;
        font-style: normal;
        font-weight: 500;
        line-height: 44px;
        z-index: 1000;
        height: 44px;
    }

    .hd-type {
        position: fixed;
        top: 60px;
        left: 70px;
        height: 44px;
        line-height: 44px;
        padding: 0 16px;
        border-radius: 100px;
        background: rgba(0, 0, 0, 0.3);
        color: #fff;
        font-family: 'PingFang SC';
        font-size: 14px;
        font-weight: 400;
        z-index: 1000;
    }

    .home-page {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;

        &.loading-mode {
            &::before {
                content: '';
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #ffffff;
                z-index: 1999;
            }
        }

        .mobile-header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px 10px;
            z-index: 100;
            background: transparent;
            .logo-icon {
                width: 142px;
                height: 26px;
            }

            .change-language {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                border-radius: 90px;
                // padding: 8px 16px;
                width: 44px;
                height: 44px;
                cursor: pointer;
                user-select: none;
                background: rgba(255, 255, 255, 0.9);
                backdrop-filter: blur(10px);
                color: #595f6d;
                // box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
                height: 44px;
                -webkit-tap-highlight-color: transparent;

                .language-icon {
                    width: 20px;
                    height: 20px;
                    color: #595f6d;
                }

                .language-text {
                    // font-family: Roboto;
                    font-size: 14px;
                    font-weight: 500;
                    line-height: normal;
                }
            }

            .menu-btn {
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                -webkit-tap-highlight-color: transparent;

                .menu-icon {
                    width: 3px;
                    height: 15px;
                    color: #595f6d;
                }

                &:active {
                    transform: scale(0.95);
                }
            }
        }

        // .mobile-speed-container {
        //     position: fixed;
        //     top: 100px;
        //     left: 50%;
        //     transform: translateX(-50%);
        //     z-index: 99;
        //     animation: fadeIn 0.3s ease;
        // }

        // @keyframes fadeIn {
        //     from {
        //         opacity: 0;
        //         transform: translateY(-10px);
        //     }
        //     to {
        //         opacity: 1;
        //         transform: translateY(0);
        //     }
        // }

        /* 菜单弹窗 */
        .menu-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 200;
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
            padding: 60px 16px;

            .menu-popup {
                background: #ffffff;
                border-radius: 8px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                overflow: hidden;
                min-width: 160px;
                animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);

                .menu-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 0 20px;
                    height: 52px;
                    cursor: pointer;
                    transition: background 0.2s;
                    -webkit-tap-highlight-color: transparent;

                    &:active {
                        background: #f5f5f5;
                    }
                    .language-icon {
                        width: 24px;
                        height: 24px;
                        color: #595f6d;
                    }
                    .model-type-icon {
                        width: 24px;
                        height: 24px;
                        color: #595f6d;
                    }
                }
                .model-type-item {
                    opacity: 0.5;
                }

                .menu-divider {
                    height: 1px;
                    background: #f0f0f0;
                    margin: 0 20px;
                }
            }
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .menu-fade-enter-active,
        .menu-fade-leave-active {
            transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .menu-fade-enter-from,
        .menu-fade-leave-to {
            opacity: 0;
        }

        .mode-switch {
            position: fixed;
            top: 66px;
            left: 16px;
            right: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 36px;
            padding: 4px;
            background: rgba(118, 118, 128, 0.12);
            backdrop-filter: blur(10px);
            border-radius: 22px;
            z-index: 100;
            gap: 6px;

            .type-btn {
                flex: 1;
                height: 100%;
                min-width: 0;
                padding: 2px 10px;
                border-radius: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 400;
                cursor: pointer;
                user-select: none;
                color: #595f6d;
                border: none;
                position: relative;
                z-index: 1;
                background: transparent;
                transition:
                    color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    font-weight 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.2s ease;
                -webkit-tap-highlight-color: transparent;

                &.active {
                    color: #1e71ff;
                    font-weight: 500;

                    &::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background: #ffffff;
                        border-radius: 18px;
                        box-shadow:
                            0 1px 3px rgba(0, 0, 0, 0.1),
                            0 1px 2px rgba(0, 0, 0, 0.06);
                        z-index: -1;
                        animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                }

                &.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
        }

        .content-area {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }

        .bottom-tabs {
            position: fixed;
            left: 50%;
            transform: translateX(-50%);
            bottom: 20px;
            bottom: calc(20px + env(safe-area-inset-bottom)); /* iPhone 安全区域支持 */
            z-index: 100;
            background: transparent;

            .tab-group {
                display: flex;
                align-items: center;
                // gap: 8px;
                height: 62px;
                padding: 4px;
                // background: rgba(118, 118, 128, 0.12);
                background: #ffffff;
                backdrop-filter: blur(10px);
                border-radius: 80px;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
                width: fit-content;

                .tab-btn {
                    flex: 0 0 auto;
                    min-width: 102px;
                    height: 100%;
                    border-radius: 80px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 0 12px;
                    gap: 1px;
                    cursor: pointer;
                    user-select: none;
                    position: relative;
                    background: transparent;
                    transition:
                        color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                        background 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                        transform 0.2s ease;
                    -webkit-tap-highlight-color: transparent;

                    .tab-icon {
                        width: 28px;
                        height: 28px;
                        color: #595f6d;
                        transition: color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }

                    .tab-text {
                        font-size: 12px;
                        font-weight: 400;
                        color: #595f6d;
                        white-space: nowrap;
                        transition: color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }

                    &.active {
                        background: #e3eaff;

                        .tab-icon,
                        .tab-text {
                            color: #1e71ff;
                        }

                        .tab-text {
                            font-weight: 500;
                        }
                    }

                    &.disabled-tab {
                        opacity: 0.4;
                        cursor: not-allowed;
                        &.active {
                            background: transparent;
                            .tab-icon,
                            .tab-text {
                                color: #595f6d;
                            }
                            .tab-text {
                                font-weight: 400;
                            }
                        }
                    }
                }
            }
        }

        /* 模式切换弹窗 */
        .model-type-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 2000;
            display: flex;
            align-items: flex-end;
            justify-content: center;
        }

        .model-type-dialog {
            width: 100%;
            background: #ffffff;
            border-radius: 20px 20px 0 0;
            padding: 20px 16px 32px;
            padding-bottom: calc(32px + env(safe-area-inset-bottom));
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
            animation: slideUpIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);

            .dialog-handle {
                width: 36px;
                height: 4px;
                background: #d0d5dd;
                border-radius: 2px;
                margin: 4px auto 24px;
            }

            .dialog-header {
                margin-bottom: 20px;
                text-align: center;

                .main-title {
                    color: #333;
                    font-size: 17px;
                    font-weight: 600;
                    line-height: 22px;
                    margin-bottom: 8px;
                }

                .sub-title {
                    color: #666666;
                    font-size: 14px;
                    font-weight: 400;
                    line-height: 20px;
                }
            }

            .model-type-cards {
                display: flex;
                flex-direction: row;
                gap: 12px;
                margin-bottom: 24px;
            }

            .model-type-card {
                flex: 1;
                height: 200px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 16px;
                padding: 20px 12px;
                background: #ffffff;
                border: 1px solid rgba(0, 0, 0, 0.1);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-sizing: border-box;
                -webkit-tap-highlight-color: transparent;

                &:active {
                    transform: scale(0.98);
                }

                &.active {
                    border-color: #1e71ff;
                    background: #f5f8ff;
                }

                .card-icon {
                    flex-shrink: 0;
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0px 0px 6px 0px rgba(0, 0, 0, 0.1);

                    .icon {
                        width: 32px;
                        height: 32px;
                    }
                }

                .card-content {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    text-align: center;
                    align-items: center;
                    width: 100%;
                    padding: 0 4px;

                    .card-title {
                        color: #333333;
                        font-size: 14px;
                        font-weight: 500;
                        line-height: 1.3;
                        white-space: nowrap;
                    }

                    .card-desc {
                        color: #666666;
                        font-size: 12px;
                        font-weight: 400;
                        line-height: 1.4;
                        word-break: break-all;
                    }
                }
            }

            .dialog-actions {
                width: 100%;

                .confirm-btn {
                    width: 100%;
                    height: 48px;
                    border-radius: 24px;
                    background: #1e71ff;
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 500;
                    border: none;
                    box-shadow: none;
                    transition: all 0.3s ease;

                    &:active {
                        background: #0c53cc;
                        transform: scale(0.98);
                    }
                }
            }
        }

        /* 从下往上弹出动画 */
        .slide-up-enter-active {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .slide-up-leave-active {
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .slide-up-enter-from {
            opacity: 0;

            .model-type-dialog {
                transform: translateY(100%);
            }
        }

        .slide-up-leave-to {
            opacity: 0;

            .model-type-dialog {
                transform: translateY(100%);
            }
        }

        .slide-up-enter-to,
        .slide-up-leave-from {
            opacity: 1;

            .model-type-dialog {
                transform: translateY(0);
            }
        }

        @keyframes slideUpIn {
            from {
                transform: translateY(100%);
            }
            to {
                transform: translateY(0);
            }
        }

        /* 参数设置弹窗 */
        .params-dialog {
            width: 100%;
            max-height: 85vh;
            background: #ffffff;
            border-radius: 38px 38px 0 0;
            // padding: 20px 16px 32px;
            padding-bottom: calc(32px + env(safe-area-inset-bottom));
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
            animation: slideUpIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow-y: auto;

            .dialog-handle {
                width: 36px;
                height: 4px;
                background: #d0d5dd;
                border-radius: 2px;
                margin: 4px auto 24px;
            }

            .dialog-header {
                margin-bottom: 20px;
                text-align: center;

                .main-title {
                    color: #333;
                    font-size: 17px;
                    font-weight: 600;
                    line-height: 22px;
                }
            }

            .params-content {
                padding: 0 16px 30px;
                .config-item {
                    width: 100%;
                    padding: 6px 0;
                    margin-bottom: 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;

                    &:last-child {
                        margin-bottom: 0;
                    }

                    .config-label {
                        margin-bottom: 8px;
                        color: #595f6d;
                        font-size: 14px;
                        font-weight: 500;
                    }

                    .setting-label {
                        color: #333333;
                        font-size: 15px;
                        font-weight: 500;
                    }

                    &:has(.settings-switch.is-disabled) {
                        .setting-label {
                            color: #999999;
                            opacity: 0.6;
                        }
                    }

                    &.voice-config-item {
                        align-items: center;

                        .config-label {
                            margin-bottom: 8px;
                        }
                    }

                    &.voice-clone-item {
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                        // margin-top: 12px;

                        .config-label {
                            margin-bottom: 0;
                            font-size: 15px;
                            font-weight: 500;
                            color: #333333;
                        }

                        .upload-voice-btn {
                            width: 160px;
                            height: 44px;
                            border: 1px solid #dcdcdc;
                            border-radius: 12px;
                            background: #ffffff;
                            color: #595f6d;
                            font-size: 15px;
                            display: flex;
                            align-items: center;
                            justify-content: center;

                            .upload-icon {
                                width: 20px;
                                height: 20px;
                                margin-right: 8px;
                            }

                            &:active {
                                border-color: #1e71ff;
                                color: #1e71ff;
                            }
                        }
                    }

                    &.voice-file-display {
                        flex-direction: column;
                        align-items: flex-start;
                        margin-top: 12px;

                        .voice-file-info {
                            display: flex;
                            align-items: center;
                            gap: 16px;
                            border: 1px solid #e9eaeb;
                            border-radius: 8px;
                            width: 100%;
                            height: 52px;
                            padding: 16px;
                            box-sizing: border-box;

                            .file-icon-container {
                                width: 20px;
                                height: 20px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                background: #e3eaff;
                                border-radius: 50%;

                                .file-icon {
                                    width: 14px;
                                    height: 14px;
                                    color: #1e71ff;
                                }
                            }

                            .file-name {
                                color: #595f6d;
                                font-size: 14px;
                                font-style: normal;
                                font-weight: 500;
                                line-height: 20px;
                                overflow: hidden;
                                text-overflow: ellipsis;
                                white-space: nowrap;
                                flex: 1;
                            }
                        }
                    }

                    .setting-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-radius: 8px;
                        transition: opacity 0.3s ease;

                        .setting-label {
                            color: #333333;
                            font-size: 15px;
                            font-weight: 500;
                        }

                        .setting-switch {
                            --el-switch-on-color: #1e71ff;
                            --el-switch-off-color: #dcdfe6;
                            --el-switch-border-color: transparent !important;
                        }

                        &.disabled {
                            opacity: 0.5;
                            cursor: not-allowed;

                            .setting-label {
                                color: #999999;
                            }
                        }
                    }

                    .settings-switch {
                        --el-switch-on-color: #34c759;
                        --el-switch-off-color: rgba(28, 28, 28, 0.2);
                        --el-switch-border-color: transparent !important;
                    }
                }

                .config-row {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 16px;

                    .config-item {
                        flex: 1;
                        margin-bottom: 0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                }

                .voice-select {
                    width: 100%;

                    :deep(.el-select__wrapper) {
                        background-color: #f6f6f6;
                        border-radius: 8px;
                        box-shadow: none !important;
                        border: none;
                        padding: 0 12px;
                        height: 44px;
                    }

                    :deep(.el-select__selected-item) {
                        font-size: 14px;
                        color: #333333;
                    }

                    :deep(.el-select__placeholder) {
                        font-size: 14px;
                        color: #999999;
                    }
                }
            }

            .params-actions {
                display: flex;
                gap: 12px;
                margin-top: 24px;

                .action-btn-half {
                    flex: 1;
                    height: 48px;
                    border-radius: 24px;
                    font-size: 15px;
                    font-weight: 500;
                    border: none;
                }

                .params-reset-btn {
                    background: #f6f6f6;
                    color: #595f6d;

                    &:active {
                        background: #e0e0e0;
                        transform: scale(0.98);
                    }
                }

                .params-save-btn {
                    background: #1e71ff;
                    color: #ffffff;

                    &:active {
                        background: #0d52cc;
                        transform: scale(0.98);
                    }
                }
            }
        }

        /* 参数设置按钮 */
        .params-settings-btn {
            position: fixed;
            top: 114px;
            left: 16px;
            z-index: 101;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            border-radius: 90px;
            background: #ffffff;
            color: #595f6d;
            user-select: none;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

            &:active {
                transform: scale(0.98);
                background: #f5f5f5;
            }

            > span {
                color: #595f6d;
                font-size: 14px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
            }

            .settings-icon {
                width: 16px;
                height: 16px;
            }
        }

        /* Session ID Display */
        .session-id-display {
            position: fixed;
            top: 50%;
            right: 16px;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(10px);
            color: #ffffff;
            padding: 8px 12px;
            border-radius: 16px;
            font-size: 10px;
            font-family: 'Courier New', monospace;
            z-index: 150;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;
            max-width: calc(100vw - 32px);

            &:active {
                background: rgba(0, 0, 0, 0.9);
                transform: translateY(-50%) scale(0.97);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }

            .session-label {
                font-weight: 600;
                opacity: 0.8;
                font-size: 9px;
                white-space: nowrap;
            }

            .session-value {
                font-weight: 500;
                letter-spacing: 0.3px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 150px;
                font-size: 9px;
            }
        }
    }
</style>
<style lang="less">
    .el-popover.el-popper.config-popover {
        padding: 18px;
        border-radius: 12px;
    }
    .switch-confirm {
        border-radius: 16px;
    }
    .logout-popper.el-popper {
        width: 200px !important;
        height: 92px;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.1);
        padding: 4px;
        .feedback,
        .logout-btn {
            height: 42px;
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 0 8px;
            cursor: pointer;
            .feedback-icon,
            .logout-icon {
                width: 20px;
                height: 20px;
            }
            span {
                color: #595f6d;
                // font-family: Roboto;
                font-size: 14px;
                font-style: normal;
                font-weight: 400;
                line-height: normal;
            }
        }
        .el-popper__arrow {
            display: none;
        }
    }
    .select-model {
        .el-select {
            width: 196px;
            height: 36px;
            .el-select__wrapper {
                height: 36px;
                padding: 4px 12px;
                border-radius: 90px;
                .el-select__selected-item {
                    color: #333;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                }
                .el-icon {
                    width: 24px;
                }
                --el-select-input-focus-border-color {
                    --ex-color-primary: #1e71ff;
                }
            }
        }
    }
    .select-model-popper.el-popper {
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.8);
        box-shadow: 0px 0px 12px 0px rgba(0, 0, 0, 0.05);
        border: none;
        ul {
            margin: 4px;
            width: 188px;
            li {
                padding: 0 8px;
                height: 44px;
                border-radius: 20px;
                display: flex;
                align-items: center;
                &.is-selected {
                    color: #1e71ff;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                }
                &.is-hovering {
                    background: #f2f5ff;
                    color: #333;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                }
                &.is-selected.is-hovering {
                    color: #1e71ff;
                    font-weight: 500;
                }
            }
        }
        .el-popper__arrow {
            display: none;
        }
    }

    /* 参数设置弹窗的输入框样式 */
    .params-dialog {
        .params-content {
            .params-textarea {
                .el-textarea__inner {
                    background-color: #f6f6f6;
                    border-radius: 8px;
                    border: none;
                    box-shadow: none !important;
                    resize: none;
                    padding: 10px 12px;
                    font-size: 14px;
                    line-height: 1.5;
                }
            }

            .params-input {
                .el-input__wrapper {
                    background-color: #f6f6f6;
                    border-radius: 8px;
                    box-shadow: none !important;
                    border: none;
                    padding: 0 12px;
                }

                .el-input__inner {
                    font-size: 14px;
                }
            }
        }

        .params-actions {
            .el-button {
                width: 100%;
            }

            .params-reset-btn {
                background: #f6f6f6 !important;
                color: #595f6d !important;
                border: none !important;

                &:active {
                    background: #e0e0e0 !important;
                }
            }

            .params-save-btn {
                background: #1e71ff !important;
                color: #ffffff !important;
                border: none !important;

                &:active {
                    background: #0d52cc !important;
                }
            }
        }
    }

    /* 语音选择框下拉菜单样式 */
    .voice-select-popper.el-popper {
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.1);
        border: none;

        .el-select-dropdown__list {
            padding: 4px;

            .el-select-dropdown__item {
                padding: 0 12px;
                height: 40px;
                border-radius: 8px;
                font-size: 14px;
                color: #333333;

                &.is-selected {
                    color: #1e71ff;
                    font-weight: 500;
                    background-color: #f5f8ff;
                }

                &.is-hovering {
                    background-color: #f6f6f6;
                }

                &.is-selected.is-hovering {
                    background-color: #f5f8ff;
                    color: #1e71ff;
                }
            }
        }

        .el-popper__arrow {
            display: none;
        }
    }

    /* 设置弹窗中的 Switch 样式 */
    .settings-switch {
        --el-switch-on-color: #34c759 !important;
        --el-switch-off-color: rgba(28, 28, 28, 0.2) !important;

        &.is-disabled {
            opacity: 0.5;
        }
    }

    /* 设置弹窗确定按钮样式 */
    .model-type-overlay {
        .params-dialog {
            .dialog-actions {
                padding: 8px 16px 0;
                .confirm-btn.el-button {
                    width: 100%;
                    height: 48px;
                    border-radius: 24px;
                    background: #1e71ff !important;
                    color: #ffffff !important;
                    font-size: 16px;
                    font-weight: 500;
                    border: none !important;

                    &:active {
                        background: #0c53cc !important;
                    }
                }
            }
        }
    }
</style>
