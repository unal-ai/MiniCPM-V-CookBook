<template>
    <div class="home-page-tablet" :class="{ 'loading-mode': isLoadingMode }">
        <!-- ==================== 设备标识横幅 ==================== -->
        <div v-if="isDev" class="device-banner tablet-banner">📱 平板端页面</div>

        <!-- ==================== 顶部导航栏 ==================== -->
        <div class="tablet-header">
            <!-- 左侧：网站图标 -->
            <div class="header-logo">
                <SvgIcon name="logo-o4.5" class="logo-icon" />
            </div>

            <!-- 中间：实时语音通话/视频通话导航 -->
            <div class="header-nav">
                <div class="toolbar-nav">
                    <el-tooltip :content="t('menuTabVoice')" placement="bottom" :disabled="true">
                        <div
                            :class="['nav-item', { active: activeTab === 'voice' }]"
                            @click="handleClickTab('voice', 0)"
                        >
                            {{ t('menuTabVoice') }}
                        </div>
                    </el-tooltip>
                    <el-tooltip :content="t('menuTabVideo')" placement="bottom" :disabled="true">
                        <div
                            :class="['nav-item', { active: activeTab === 'video' }]"
                            @click="handleClickTab('video', 1)"
                        >
                            {{ t('menuTabVideo') }}
                        </div>
                    </el-tooltip>
                </div>
            </div>

            <!-- 右侧：模式切换 + 语言切换 -->
            <div class="header-actions">
                <!-- 模式切换按钮 -->
                <el-popover v-model:visible="modeSwitchVisible" placement="bottom-end" :width="410">
                    <div class="config-popover-wrapper mode-switch-wrapper">
                        <div class="config-popover-header">
                            <div class="close-btn">
                                <SvgIcon name="ipad-close" class="icon-close" @click.stop="modeSwitchVisible = false" />
                            </div>
                        </div>
                        <div class="config-popover-content mode-switch-content">
                            <!-- 标题 -->
                            <div class="mode-dialog-title">{{ t('modeSelectTitle') }}</div>

                            <!-- 选项卡片 -->
                            <div class="mode-cards">
                                <div
                                    class="mode-card"
                                    :class="{ active: selectedSwitchMode === 'streaming' }"
                                    @click="selectedSwitchMode = 'streaming'"
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
                                    class="mode-card"
                                    :class="{ active: selectedSwitchMode === 'multimodal' }"
                                    @click="selectedSwitchMode = 'multimodal'"
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

                            <!-- 按钮 -->
                            <div class="mode-action-button">
                                <el-button
                                    type="primary"
                                    :disabled="!selectedSwitchMode"
                                    @click.stop="handleModeSwitch"
                                    class="mode-start-btn"
                                >
                                    {{ t('modeStartBtn') }}
                                </el-button>
                            </div>
                        </div>
                    </div>
                    <template #reference>
                        <!-- <div class="change-language mode-switch-btn" @click="handleOpenModeSwitch">
                            <SvgIcon name="model-type-change" class="mode-icon" />
                            <span class="language-text">{{ t('modeSwitch') }}</span>
                        </div> -->
                    </template>
                </el-popover>

                <!-- 推理服务设置弹窗 -->
                <el-popover
                    v-if="isInternal"
                    v-model:visible="inferenceSettingVisible"
                    trigger="manual"
                    placement="bottom-end"
                    :width="410"
                >
                    <div class="config-popover-wrapper mode-switch-wrapper">
                        <div class="config-popover-header">
                            <div class="close-btn">
                                <SvgIcon
                                    name="ipad-close"
                                    class="icon-close"
                                    @click.stop="inferenceSettingVisible = false"
                                />
                            </div>
                        </div>
                        <div class="config-popover-content mode-switch-content">
                            <div class="mode-dialog-title">推理服务设置</div>

                            <div class="mode-cards">
                                <div
                                    class="mode-card"
                                    :class="{ active: selectedServiceType === 'o45-cpp' }"
                                    @click="selectedServiceType = 'o45-cpp'"
                                >
                                    <div class="card-content" style="width: 100%">
                                        <div class="card-title">o45-cpp</div>
                                        <div class="card-desc">C++ 实现的推理服务</div>
                                    </div>
                                </div>

                                <div
                                    class="mode-card"
                                    :class="{ active: selectedServiceType === 'o45-python' }"
                                    @click="selectedServiceType = 'o45-python'"
                                >
                                    <div class="card-content" style="width: 100%">
                                        <div class="card-title">o45-python</div>
                                        <div class="card-desc">Python 实现的推理服务</div>
                                    </div>
                                </div>
                            </div>

                            <div class="mode-action-button">
                                <el-button
                                    type="primary"
                                    :disabled="!selectedServiceType"
                                    @click.stop="handleSaveInferenceSetting"
                                    class="mode-start-btn"
                                >
                                    保存设置
                                </el-button>
                            </div>
                        </div>
                    </div>
                    <template #reference>
                        <div class="change-language mode-switch-btn" @click="handleOpenInferenceSetting">
                            <SvgIcon name="scene-icon" class="mode-icon" />
                            <span class="language-text">推理设置</span>
                        </div>
                    </template>
                </el-popover>

                <!-- 语言切换 -->
                <div class="change-language" v-if="language === 'zh'" @click="handleChangeLanguage('en')">
                    <SvgIcon name="english" class="language-icon" />
                    <span class="language-text">English</span>
                </div>
                <div class="change-language" v-else @click="handleChangeLanguage('zh')">
                    <SvgIcon name="chinese" class="language-icon" />
                    <span class="language-text">中文</span>
                </div>
            </div>
        </div>

        <!-- ==================== 中间工具栏 ==================== -->
        <div class="tablet-toolbar" v-if="isInternal">
            <!-- 左侧：单双工模式切换 -->
            <!-- <div class="toolbar-left">
                <div class="toolbar-mode-switch">
                    <div class="select-type">
                        <div
                            :class="['type-btn', { active: modelType === 'simplex', disabled: isCalling }]"
                            @click="changeModelType('simplex')"
                        >
                            {{ t('simplexMode') }}
                        </div>
                        <div
                            :class="['type-btn', { active: modelType === 'duplex', disabled: isCalling }]"
                            @click="changeModelType('duplex')"
                        >
                            {{ t('duplexMode') }}
                        </div>
                    </div>
                </div>
            </div> -->

            <!-- 右侧：三个按钮 -->
            <div class="toolbar-right" v-if="isInternal">
                <!-- <div class="high-refresh-toggle" :class="{ disabled: isCalling }" v-if="activeTab === 'video'">
                    <el-switch v-model="isHighRefresh" size="small" :disabled="isCalling" class="high-refresh-switch" />
                    <span
                        @click="!isCalling && (isHighRefresh = !isHighRefresh)"
                        :style="{ cursor: isCalling ? 'not-allowed' : 'pointer' }"
                    >
                        高刷
                    </span>
                    <el-tooltip
                        popper-class="info-tooltip"
                        content="开启后可获得更流畅的画面，但可能会增加耗电"
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
                <div class="action-btn" :class="{ disabled: isCalling }" @click="handleRestartModel">
                    {{ t('restartModel') }}
                </div>

                <!-- 模型设置弹窗 -->
                <el-popover v-model:visible="modelConfigVisible" placement="bottom-end" :width="402">
                    <div class="config-popover-wrapper model-config-wrapper">
                        <div class="config-popover-header">
                            <div class="close-btn">
                                <SvgIcon
                                    name="ipad-close"
                                    class="icon-close"
                                    @click.stop="modelConfigVisible = false"
                                />
                            </div>
                        </div>
                        <div class="config-popover-content model-config-content">
                            <div class="config-item config-item-row">
                                <div class="config-label">vad抢跑的检测时长</div>
                                <el-input-number v-model="durVadTime" size="small" :min="0" :max="1" :step="0.01" />
                            </div>
                            <div class="config-item config-item-row">
                                <div class="config-label">vad抢跑的检测阈值</div>
                                <el-input-number
                                    v-model="durVadThreshold"
                                    size="small"
                                    :min="0"
                                    :max="1"
                                    :step="0.01"
                                />
                            </div>
                            <div class="config-item config-item-row">
                                <div class="config-label">是否开启vad抢跑</div>
                                <el-switch
                                    v-model="vadRace"
                                    inline-prompt
                                    active-text="是"
                                    inactive-text="否"
                                    active-color="#52c41a"
                                />
                            </div>
                            <div class="config-item config-item-row">
                                <div class="config-label">是否存储用户数据</div>
                                <el-switch
                                    v-model="saveData"
                                    inline-prompt
                                    active-text="是"
                                    inactive-text="否"
                                    active-color="#52c41a"
                                />
                            </div>
                        </div>
                        <div class="config-actions model-config-actions">
                            <el-button
                                class="model-config-save-btn"
                                size="small"
                                type="primary"
                                @click.stop="handleSaveConfig"
                            >
                                保存
                            </el-button>
                        </div>
                    </div>
                    <template #reference>
                        <div class="action-btn" :class="{ disabled: isCalling }" @click="handleOpenModelConfig">
                            {{ t('modelConfigTitle') }}
                        </div>
                    </template>
                </el-popover>

                <!-- 参数设置弹窗 -->
                <el-popover v-model:visible="paramsVisible" placement="bottom-end" :width="402">
                    <div class="config-popover-wrapper">
                        <div class="config-popover-header">
                            <div class="close-btn">
                                <SvgIcon name="ipad-close" class="icon-close" @click.stop="paramsVisible = false" />
                            </div>
                        </div>
                        <div class="config-popover-content params-content">
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
                        <div class="config-actions params-actions">
                            <el-button
                                class="action-btn-half params-reset-btn"
                                size="small"
                                @click.stop="resetFormConfig"
                            >
                                重置
                            </el-button>
                            <el-button
                                class="action-btn-half params-save-btn"
                                size="small"
                                type="primary"
                                @click.stop="saveFormConfig"
                            >
                                保存
                            </el-button>
                        </div>
                    </div>
                    <template #reference>
                        <div class="action-btn" :class="{ disabled: isCalling }" @click="handleOpenParams">
                            {{ t('paramSettings') }}
                        </div>
                    </template>
                </el-popover>
            </div>
        </div>

        <!-- ==================== 底部内容区 ==================== -->
        <div class="tablet-content">
            <!-- 左侧配置面板 -->
            <NetworkSpeedTablet
                class="network-speed-container"
                :is-testing="isTesting"
                :speed-mbps="speedMbps"
                :theme="activeTab === 'video' && isCalling ? 'dark' : 'light'"
            />
            <div class="model-type" v-if="!isCalling">
                {{ modelType === 'simplex' ? t('simplexMode') : t('duplexMode') }}
            </div>
            <div class="hd-type" v-if="isCalling && hdMode">
                {{ t('hdModeLabel') }}
            </div>

            <!-- 右侧配置面板 -->
            <div class="config-panel" v-if="!isCalling">
                <div class="config-panel-title">{{ t('configTitle') }}</div>

                <!-- 高刷（仅视频模式显示） -->
                <!-- <div v-if="activeTab === 'video'" class="config-panel-item">
                    <div class="config-item-label">
                        <span>高刷</span>
                        <el-tooltip
                            popper-class="info-tooltip"
                            content="开启后可获得更流畅的画面"
                            placement="right"
                            effect="light"
                            :show-arrow="false"
                        >
                            <SvgIcon name="info" class="info-icon-small" />
                        </el-tooltip>
                    </div>
                    <el-switch v-model="highRefresh" class="config-switch" />
                </div> -->

                <!-- 通话语言（仅视频模式显示） -->
                <div v-if="activeTab === 'voice'" class="config-panel-item">
                    <div class="config-item-label">
                        <span>{{ t('callLanguageLabel') }}</span>
                    </div>
                    <el-select
                        v-model="callLanguage"
                        placeholder="请选择"
                        class="voice-select-inline"
                        popper-class="voice-select-popper"
                        :show-arrow="false"
                        :popper-options="{
                            modifiers: [
                                {
                                    name: 'offset',
                                    options: {
                                        offset: [0, 4]
                                    }
                                }
                            ]
                        }"
                    >
                        <el-option label="English" value="en" />
                        <el-option label="中文" value="zh" />
                    </el-select>
                </div>

                <!-- 高清模式（仅视频模式显示） -->
                <div v-if="activeTab === 'video'" class="config-panel-item">
                    <div class="config-item-label">
                        <span>{{ t('hdModeLabel') }}</span>
                        <el-tooltip
                            popper-class="info-tooltip"
                            :content="t('hdModeTips')"
                            placement="right"
                            effect="light"
                            :show-arrow="false"
                        >
                            <SvgIcon name="info" class="info-icon-small" />
                        </el-tooltip>
                    </div>
                    <el-switch v-model="hdMode" class="config-switch" />
                </div>

                <!-- 语音选项 -->
                <div v-if="false && activeTab === 'voice'" class="config-panel-item voice-item">
                    <div class="config-item-label">
                        <span>语音选项</span>
                        <el-tooltip
                            popper-class="info-tooltip"
                            content="选择不同的语音音色"
                            placement="right"
                            effect="light"
                            :show-arrow="false"
                        >
                            <SvgIcon name="info" class="info-icon-small" />
                        </el-tooltip>
                    </div>
                    <el-select
                        ref="voiceSelectRef"
                        v-model="voiceOption"
                        placeholder="请选择"
                        class="voice-select-inline"
                        popper-class="voice-select-popper"
                        :show-arrow="false"
                        :popper-options="{
                            modifiers: [
                                {
                                    name: 'offset',
                                    options: {
                                        offset: [0, 4]
                                    }
                                }
                            ]
                        }"
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
                <div v-if="false && voiceOption === 10086" class="config-panel-item voice-clone-item">
                    <div class="config-item-label">
                        <span>音色克隆</span>
                        <el-tooltip
                            popper-class="info-tooltip"
                            content="上传音频文件进行音色克隆"
                            placement="right"
                            effect="light"
                            :show-arrow="false"
                        >
                            <SvgIcon name="info" class="info-icon-small" />
                        </el-tooltip>
                    </div>
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
                    v-if="false && voiceOption === 10086 && voiceCloneFile"
                    class="config-panel-item voice-file-display"
                >
                    <div class="voice-file-info">
                        <div class="file-icon-container">
                            <SvgIcon name="music" class="file-icon" />
                        </div>
                        <span class="file-name">{{ voiceCloneFile.name }}</span>
                    </div>
                </div>
            </div>

            <!-- 右侧通话区域 -->
            <div class="call-area">
                <VoiceCallRTC
                    ref="voiceRef"
                    v-if="activeTab === 'voice'"
                    v-model:isCalling="isCalling"
                    v-model:loading="loading"
                    :model-type="modelType"
                    @handleLogin="handleLogin"
                    @updateSessionId="handleUpdateSessionId"
                />
                <VideoCallRTC
                    ref="videoRef"
                    v-else-if="activeTab === 'video'"
                    v-model:isCalling="isCalling"
                    v-model:loading="loading"
                    :model-type="modelType"
                    @handleLogin="handleLogin"
                    @updateSessionId="handleUpdateSessionId"
                />
                <!-- <SceneExperience
                    ref="sceneRef"
                    v-else-if="activeTab === 'scene'"
                    v-model:isCalling="isCalling"
                    v-model:loading="loading"
                    @handleLogin="handleLogin"
                /> -->
                <TestStaticVoice
                    ref="staticRef"
                    v-else-if="activeTab === 'staticVoice'"
                    v-model:isCalling="isCalling"
                    v-model:loading="loading"
                    @handleLogin="handleLogin"
                    @updateSessionId="handleUpdateSessionId"
                />
            </div>
        </div>

        <!-- Session ID Display -->
        <!-- <div class="session-id-display" v-if="sessionId" @click="copySessionId">
            <span class="session-label">Session ID:</span>
            <span class="session-value">{{ sessionId }}</span>
        </div> -->

        <!-- Feedback Modal -->
        <FeedbackTablet v-if="showFeedback" v-model="showFeedback" @feedbackSuccess="handleFeedbackClose" />
        <!-- Login Modal -->
        <Login v-if="showLogin" v-model:showLogin="showLogin" @loginSuccess="handleLoginSuccess" />
        <DraggableClock v-if="isInternal" />
        <!-- Like/Dislike Component -->
        <LikeDislikeTablet :show="isCalling" />
        <!-- Mode Selector -->
        <!-- <ModeSelector
            v-if="showModeSelector"
            v-model="showModeSelector"
            @modeSelected="handleModeSelected"
            :isPc="false"
        /> -->
    </div>
</template>

<script setup>
    import { ref, onMounted, watch } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { useRoute, useRouter } from 'vue-router';
    import { restartModel } from '@/apis';
    import { Close } from '@element-plus/icons-vue';
    import { isInternalVersion } from '@/utils/version';

    import VoiceCallRTC from './components/Voice_new_rtc.tablet.vue';
    import VideoCallRTC from './components/Video_new_rtc.tablet.vue';
    // import SceneExperience from './components/SceneExperience.vue';
    import TestStaticVoice from './components/TestStaticVoice.vue';
    import ModeSelector from '@/components/ModeSelector/index.vue';
    import { NetworkSpeedTablet } from '@/components/NetworkSpeed';
    import { VOICE_OPTIONS } from '@/config/voiceOptions';
    import { useNetworkSpeed } from '@/hooks/useNetworkSpeed';
    // LikeDislikeTablet 和 FeedbackTablet 组件会被自动导入，无需手动导入

    const route = useRoute();
    const router = useRouter();

    // 网络测速功能
    const { speedMbps, isTesting, startTesting, stopTesting } = useNetworkSpeed({
        fileUrl: '/static/test.bin',
        fileSizeBytes: 500 * 1024, // 500 KB
        interval: 10000 // 每 10 秒检测一次
    });

    console.log('📱 平板端首页已加载', route);
    const typeObj = { 0: 'voice', 1: 'video', 3: 'staticVoice' };
    // Read current C++ inference mode from build-time env (set by oneclick.sh)
    const cppMode = import.meta.env.VITE_CPP_MODE || 'duplex';
    const defaultType = cppMode === 'simplex' ? 'voice' : (typeObj[route.query.type] || 'video');
    // const defaultType = 'video';

    const { t, locale } = useI18n();
    const activeTab = ref(defaultType);
    // 默认语言设置为英文
    const language = ref(localStorage.getItem('language') || 'en');

    const showFeedback = ref(false);
    const showModeSelector = ref(false);
    const isLoadingMode = ref(false);

    const showLogin = ref(false);
    const needLogin = ref(false);
    const isCalling = ref(false);
    const sessionId = ref('');
    const voiceRef = ref();
    const videoRef = ref();
    const sceneRef = ref();
    const staticRef = ref();

    const version = ref('MiniCPM-o2.6');

    const loading = ref(false);

    const modelType = ref(localStorage.getItem('modelType') || cppMode); // 单双工模式 'simplex' or 'duplex'
    const highRefreshCacheKey = 'highRefresh';
    const isHighRefresh = ref(false);

    const modelConfigVisible = ref(false);
    const paramsVisible = ref(false);
    const modeSwitchVisible = ref(false);
    const selectedSwitchMode = ref('streaming');

    // 推理服务设置相关
    const inferenceSettingVisible = ref(false);
    const selectedServiceType = ref('');

    // 配置面板相关
    const highRefresh = ref(false);
    const hdMode = ref(false);
    const voiceOption = ref(1);
    const voiceSelectRef = ref(null);

    // 音色克隆相关
    const voiceFileInput = ref(null);
    const voiceCloneFile = ref(null);
    const voiceCloneBase64 = ref('');
    const voiceCloneFormat = ref('');

    // 通话语言选择
    const callLanguage = ref('en');

    const durVadTime = ref();
    const durVadThreshold = ref();
    const vadRace = ref(false);
    const saveData = ref(true);

    // 支持URL参数动态切换版本 (例如: ?version=official 或 ?version=internal)
    const isInternal = isInternalVersion();
    const isDev = import.meta.env.DEV; // 开发环境标识

    // 检查是否需要显示模式选择弹窗
    const hasSelected = localStorage.getItem('hasSelectedMode');
    // if (!hasSelected || hasSelected !== 'true') {
    //     isLoadingMode.value = true;
    //     showModeSelector.value = true;
    // }

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

    onMounted(() => {
        localStorage.setItem('model', version.value);
        localStorage.setItem('language', language.value);
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (!userInfo.token) needLogin.value = true;

        // 初始化音色克隆数据
        window.voiceCloneData = null;

        const cachedHighRefresh = localStorage.getItem(highRefreshCacheKey);
        if (cachedHighRefresh !== null) {
            isHighRefresh.value = cachedHighRefresh === 'true';
        } else {
            localStorage.setItem(highRefreshCacheKey, 'false');
        }

        const savedDurVadTime = localStorage.getItem('durVadTime');
        if (savedDurVadTime !== null && savedDurVadTime !== '') {
            durVadTime.value = Number(savedDurVadTime);
        }
        const savedDurVadThreshold = localStorage.getItem('durVadThreshold');
        if (savedDurVadThreshold !== null && savedDurVadThreshold !== '') {
            durVadThreshold.value = Number(savedDurVadThreshold);
        }
        // 强制更新 vadRace 为新的默认值 false（忽略旧的 localStorage 值）
        localStorage.setItem('vadRace', 'false');
        vadRace.value = false;
        const savedSaveData = localStorage.getItem('saveData');
        if (savedSaveData !== null) {
            saveData.value = JSON.parse(savedSaveData);
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

    watch(isHighRefresh, value => {
        localStorage.setItem(highRefreshCacheKey, value ? 'true' : 'false');
    });

    // 监听配置面板的设置变化并自动保存
    watch(highRefresh, value => {
        localStorage.setItem('highRefresh', value.toString());
    });

    watch(hdMode, value => {
        localStorage.setItem('hdMode', value.toString());
    });

    watch(voiceOption, value => {
        localStorage.setItem('voiceOption', String(value));
        // 切换语音选项时，如果不是自定义，清空音色克隆文件
        if (value !== 10086) {
            voiceCloneFile.value = null;
            voiceCloneBase64.value = '';
            voiceCloneFormat.value = '';
            // 清空全局数据
            window.voiceCloneData = null;
        }
    });

    watch(callLanguage, value => {
        localStorage.setItem('callLanguage', value);
    });

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

    const handleChangeLanguage = val => {
        language.value = val;
        locale.value = val;
        localStorage.setItem('language', val);
    };

    // 打开推理服务设置弹窗
    const handleOpenInferenceSetting = () => {
        // 加载已保存的设置
        const savedServiceType = localStorage.getItem('inferenceServiceType');
        if (savedServiceType) {
            selectedServiceType.value = savedServiceType;
        }
        inferenceSettingVisible.value = true;
    };

    // 保存推理服务设置
    const handleSaveInferenceSetting = () => {
        if (!selectedServiceType.value) return;

        localStorage.setItem('inferenceServiceType', selectedServiceType.value);
        inferenceSettingVisible.value = false;
        ElMessage.success('保存成功！设置将在下次连接时生效');
    };

    const handleRestartModel = async () => {
        if (isCalling.value) return;
        const { code } = await restartModel();
        if (code !== 0) {
            ElMessage({
                type: 'error',
                message: '重启失败',
                duration: 3000,
                customClass: 'system-error'
            });
            return;
        }
        ElMessage({
            type: 'success',
            message: '重启成功',
            duration: 3000
        });
    };

    const handleClickTab = async (val, index) => {
        if (activeTab.value === val) return;
        if (!isCalling.value) {
            changeTab(val, index);
            return;
        }
        if (activeTab.value === 'voice') await voiceRef.value.stopRecording();
        else if (activeTab.value === 'video') await videoRef.value.stopRecording();
        else await sceneRef.value.stopRecording();
        changeTab(val, index);
    };

    const changeTab = (val, index) => {
        activeTab.value = val;
        const { type, ...others } = route.query;
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
    const handleFeedbackClose = () => {
        showFeedback.value = true;
    };
    const changeModelType = val => {
        if (isCalling.value) return;
        if (modelType.value === val) return;
        modelType.value = val;

        ElMessage.success(t('modeSwitchSuccess'));
        localStorage.setItem('modelType', val);
    };

    // 打开模型设置弹窗
    const handleOpenModelConfig = () => {
        if (isCalling.value) return;
        paramsVisible.value = false; // 关闭参数设置弹窗
        modelConfigVisible.value = true;
    };

    // 打开参数设置弹窗
    const handleOpenParams = () => {
        if (isCalling.value) return;
        modelConfigVisible.value = false; // 关闭模型设置弹窗
        paramsVisible.value = true;
    };

    const handleSaveConfig = () => {
        // 防止重复点击：先检查弹窗状态
        if (!modelConfigVisible.value) return;

        // 立即关闭弹窗，防止动画期间再次点击
        modelConfigVisible.value = false;

        localStorage.setItem('durVadTime', durVadTime.value);
        localStorage.setItem('durVadThreshold', durVadThreshold.value);
        localStorage.setItem('vadRace', vadRace.value);
        localStorage.setItem('saveData', saveData.value);
        ElMessage.success('配置保存成功');
    };

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

    const handleModeSelected = mode => {
        // console.log('📱 [Tablet] handleModeSelected 被调用, mode:', mode);
        // console.log(
        //     '📱 [Tablet] 当前状态 - isLoadingMode:',
        //     isLoadingMode.value,
        //     'showModeSelector:',
        //     showModeSelector.value
        // );

        // // 确保 localStorage 已正确保存
        // const hasSelected = localStorage.getItem('hasSelectedMode');
        // if (hasSelected !== 'true') {
        //     localStorage.setItem('hasSelectedMode', 'true');
        //     localStorage.setItem('selectedMode', mode);
        // }

        // 移除加载遮罩
        isLoadingMode.value = false;
    };

    // 打开模式切换弹窗
    const handleOpenModeSwitch = () => {
        modeSwitchVisible.value = true;
        selectedSwitchMode.value = 'streaming'; // 默认选中流式交互模式
    };

    // 处理模式切换
    const handleModeSwitch = () => {
        // 防止重复点击：先检查弹窗状态
        if (!modeSwitchVisible.value) return;
        if (!selectedSwitchMode.value) return;

        // 立即关闭弹窗，防止动画期间再次点击
        modeSwitchVisible.value = false;

        // 保存用户选择
        localStorage.setItem('selectedMode', selectedSwitchMode.value);

        // 根据选择跳转
        if (selectedSwitchMode.value === 'multimodal') {
            // 跳转到外部链接
            window.location.href = 'https://minicpm-v.openbmb.cn/';
        }
        // 如果是 streaming，不需要跳转，已经在当前页面
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
</script>

<style lang="less" scoped>
    /* ==================== 设备标识横幅样式 ==================== */
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

        &.tablet-banner {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
    }

    /* ==================== 平板端上中下布局 ==================== */
    .home-page-tablet {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%; /* 继承父容器实际高度 */
        background: #f6f8ff;
        overflow: visible; /* 改为 visible 避免字幕 box-shadow 被截断 */
        margin: 0;
        padding: 0;

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

        /* ==================== 顶部导航栏 ==================== */
        .tablet-header {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            // height: 64px;
            // min-height: 64px;
            // max-height: 64px;
            padding: 20px 30px 10px;
            background: transparent;
            box-shadow: none;
            flex-shrink: 0;

            .header-logo {
                .logo-icon {
                    width: 167px;
                    height: 30px;
                }
                // display: flex;
                // align-items: center;
                // gap: 12px;
                // position: relative;
                // flex-shrink: 0;
                // justify-self: start;

                // .logo-icon {
                //     width: 160px;
                //     height: 36px;
                // }

                // .logo-text {
                //     position: absolute;
                //     top: -6px;
                //     right: -30px;
                //     padding: 3px 10px;
                //     border-radius: 10px;
                //     font-size: 8px;
                //     // font-weight: 500;
                //     white-space: nowrap;
                //     // box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);

                //     &.internal {
                //         background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                //         color: #ffffff;
                //         border: 1px solid rgba(255, 255, 255, 0.2);
                //     }

                //     &.external {
                //         background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                //         color: #ffffff;
                //         border: 1px solid rgba(255, 255, 255, 0.2);
                //     }
                // }
            }

            .header-nav {
                justify-self: center;

                .toolbar-nav {
                    display: flex;
                    justify-content: center;
                    border-radius: 100px;
                    height: 44px;
                    padding: 5px 4px;
                    width: fit-content; /* 宽度由子元素撑开 */
                    background: #ffffff;
                    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.04);
                    backdrop-filter: blur(20px);

                    .nav-item {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 8px 18px;
                        border-radius: 100px;
                        cursor: pointer;
                        user-select: none;
                        text-align: center;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        font-size: 15px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                        color: #595f6d;
                        background: transparent;
                        border: none;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        -webkit-tap-highlight-color: transparent;

                        &.active {
                            color: #1e71ff;
                            font-weight: 590;
                            background: #e3eaff;
                        }

                        &:active {
                            transform: scale(0.98);
                        }

                        &.disabled-tab {
                            opacity: 0.4;
                            cursor: not-allowed;
                            &.active {
                                background: transparent;
                                color: #595f6d;
                                font-weight: 400;
                            }
                            &:active {
                                transform: none;
                            }
                        }
                    }
                }
            }

            .header-actions {
                flex-shrink: 0;
                justify-self: end;
                display: flex;
                gap: 12px;
                align-items: center;

                .change-language {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    height: 44px;
                    padding: 8px 16px;
                    border-radius: 90px;
                    background: #ffffff;
                    // border: 1px solid #e2e8f0;
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    -webkit-tap-highlight-color: transparent;

                    .language-icon {
                        width: 18px;
                        height: 18px;
                        color: #4a5568;
                        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }

                    .language-text {
                        font-size: 14px;
                        color: #4a5568;
                        font-weight: 400;
                        transition: color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }

                    &:active {
                        transform: translateY(0);
                        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
                    }
                }
            }
        }

        /* ==================== 中间工具栏 ==================== */
        .tablet-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 56px;
            min-height: 56px;
            max-height: 56px;
            padding: 6px 30px;
            flex-shrink: 0;

            .toolbar-left {
                .toolbar-mode-switch {
                    .select-type {
                        display: flex;
                        height: 36px;
                        padding: 4px;
                        background: rgba(118, 118, 128, 0.12);
                        border-radius: 22px;
                        position: relative;

                        .type-btn {
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
                            transition:
                                color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                                font-weight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                            -webkit-tap-highlight-color: transparent;

                            &.active {
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
                }
            }

            .toolbar-right {
                display: flex;
                gap: 18px;

                .high-refresh-toggle {
                    padding: 8px 16px;
                    border-radius: 90px;
                    height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    color: #595f6d;
                    background: #ffffff;
                    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.04);
                    user-select: none;
                    -webkit-tap-highlight-color: transparent;

                    &.disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    > span {
                        margin: 0 2px 0 4px;
                        color: #595f6d;
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 500;
                        line-height: normal;
                    }

                    .info-icon {
                        width: 16px;
                        height: 16px;
                    }
                }

                .action-btn {
                    padding: 8px 16px;
                    border-radius: 90px;
                    height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    // font-family: 'PingFang SC';
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                    cursor: pointer;
                    user-select: none;
                    color: #595f6d;
                    background: #fff;
                    border: none;
                    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.04);
                    transition:
                        background 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                        transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    -webkit-tap-highlight-color: transparent;

                    &:active:not(.disabled) {
                        transform: scale(0.97) translateY(0);
                        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
                    }

                    &.disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                }
            }
        }

        /* ==================== 底部内容区 ==================== */
        .tablet-content {
            flex: 1; /* 自动填充剩余空间 */
            min-height: 0; /* 关键：允许 flex 子元素收缩 */
            background: transparent;
            overflow: visible; /* 改为 visible 避免字幕 box-shadow 被截断 */
            position: relative;
            display: flex;
            flex-direction: column;
            padding: 0 10px 20px 10px;
            box-sizing: border-box;

            .network-speed-container {
                position: fixed;
                top: 96px;
                left: 30px;
                z-index: 999;
                animation: fadeIn 0.3s ease;
            }

            .model-type {
                position: fixed;
                top: 96px;
                left: 86px;
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
                top: 96px;
                left: 86px;
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

            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .config-panel {
                position: fixed;
                top: 96px; /* 在工具栏下方 */
                right: 30px;
                width: 300px;
                background: #ffffff;
                border-radius: 16px;
                padding: 16px 20px;
                box-sizing: border-box;
                z-index: 10;

                .config-panel-title {
                    color: #171717;
                    font-size: 14px;
                    font-weight: 600;
                    line-height: 20px;
                    margin-bottom: 4px;
                }

                .config-panel-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    // margin-bottom: 24px;

                    &:last-child {
                        margin-bottom: 0;
                    }

                    .config-item-label {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        color: #595f6d;
                        font-size: 14px;
                        font-weight: 400;
                        line-height: 20px;

                        .info-icon-small {
                            width: 16px;
                            height: 16px;
                            color: #999999;
                            cursor: pointer;
                        }
                    }

                    .config-switch {
                        --el-switch-on-color: #34c759;
                        --el-switch-off-color: rgba(28, 28, 28, 0.2);
                    }

                    .voice-select-inline {
                        width: 150px;
                        :deep(.el-input__wrapper) {
                            background-color: #f6f6f6;
                            border-radius: 8px;
                            box-shadow: none !important;
                            border: none;
                            padding: 0 12px;
                            height: 32px;
                        }

                        :deep(.el-input__inner) {
                            font-size: 14px;
                            color: #333333;
                        }
                    }

                    &.voice-item {
                        flex-direction: row;
                        align-items: center;

                        // .voice-select-inline {
                        //     width: 130px;
                        // }
                    }

                    &.voice-clone-item {
                        flex-direction: row;
                        align-items: center;
                        margin-top: 8px;

                        .upload-voice-btn {
                            width: 150px;
                            height: 36px;
                            border: 1px solid #dcdcdc;
                            border-radius: 12px;
                            background: #ffffff;
                            color: #595f6d;
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            justify-content: center;

                            .upload-icon {
                                width: 20px;
                                height: 20px;
                                margin-right: 8px;
                            }

                            // &:hover {
                            //     border-color: #1e71ff;
                            //     color: #1e71ff;
                            // }
                        }
                    }

                    &.voice-file-display {
                        margin-top: 8px;
                        flex-direction: column;
                        align-items: flex-start;

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
                }
            }

            .call-area {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
            }
        }
    }

    /* ==================== 弹窗内容样式 ==================== */
    .config-popover-wrapper {
        .config-popover-header {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            height: 44px;
            padding: 4px 10px;
            border-bottom: 1px solid rgba(89, 95, 109, 0.2);

            .close-btn {
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                -webkit-tap-highlight-color: transparent;
                .icon-close {
                    width: 18px;
                    height: 18px;
                }
            }
        }

        .config-popover-content {
            padding: 20px;

            .config-item {
                margin-bottom: 20px;

                &:last-child {
                    margin-bottom: 0;
                }

                .config-label {
                    margin-bottom: 10px;
                    color: #595f6d;
                    // font-family: 'PingFang SC';
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 500;
                    line-height: normal;
                }
            }

            .config-row {
                display: flex;
                gap: 12px;
                margin-bottom: 20px;

                .config-item {
                    flex: 1;
                    margin-bottom: 0;
                }
            }

            .config-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 0;
            }
        }

        .config-actions.params-actions {
            display: flex;
            gap: 20px;
            padding: 0 20px 20px;

            .action-btn-half {
                flex: 1;
                height: 48px;
                border-radius: 24px;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 500;
                line-height: normal;
                border: none;
            }

            .params-reset-btn {
                background: #f6f6f6;
                color: #595f6d;

                &:active {
                    background: #e0e0e0;
                }
            }

            .params-save-btn {
                background: #1e71ff;
                color: #ffffff;

                &:active {
                    background: #0d52cc;
                }
            }
        }
    }

    /* ==================== 模型设置弹窗特定样式 ==================== */
    .model-config-wrapper {
        .model-config-content {
            .config-item-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 44px;
                margin-bottom: 0;

                .config-label {
                    margin-bottom: 0;
                    flex-shrink: 0;
                }
            }
        }

        .model-config-actions {
            padding: 0 20px 20px;

            .model-config-save-btn {
                width: 100%;
                height: 48px;
                border-radius: 24px;
                background: #1e71ff;
                color: #fff;
                text-align: center;
                // font-family: 'PingFang SC';
                font-size: 14px;
                font-style: normal;
                font-weight: 500;
                line-height: 22px;
                letter-spacing: -0.01px;
                border: none;

                &:active {
                    background: #0d52cc;
                }
            }
        }
    }

    /* ==================== 模式切换弹窗特定样式 ==================== */
    .mode-switch-wrapper {
        .mode-switch-content {
            padding: 20px;
            // background: #f6f8ff;

            .mode-dialog-logo {
                margin: 0 auto 24px;
                text-align: center;

                .mode-logo-icon {
                    width: 200px;
                    height: auto;
                    color: #4461f2;
                }
            }

            .mode-dialog-title {
                color: #333333;
                font-size: 16px;
                font-weight: 400;
                margin-bottom: 16px;
                text-align: left;
            }

            .mode-cards {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 20px;
            }

            .mode-card {
                width: 100%;
                height: 74px;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px;
                background: #ffffff;
                border: 1px solid rgba(0, 0, 0, 0.1);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-sizing: border-box;
                -webkit-tap-highlight-color: transparent;

                &.active {
                    border-color: #1e71ff;
                }

                .card-icon {
                    flex-shrink: 0;
                    width: 42px;
                    height: 42px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0px 0px 6px 0px rgba(0, 0, 0, 0.1);

                    .icon {
                        width: 24px;
                        height: 24px;
                    }
                }

                .card-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 0;

                    .card-title {
                        color: #333333;
                        font-size: 16px;
                        font-weight: 500;
                        line-height: 20px;
                    }

                    .card-desc {
                        color: #666666;
                        font-size: 14px;
                        font-weight: 400;
                        line-height: 18px;
                    }
                }
            }

            .mode-action-button {
                width: 100%;

                .mode-start-btn {
                    width: 100%;
                    height: 48px;
                    border-radius: 24px;
                    background: #1e71ff;
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 500;
                    line-height: normal;
                    border: none;
                    box-shadow: none;
                    transition: all 0.3s ease;

                    &:active:not(.is-disabled) {
                        background: #0c53cc;
                    }

                    &.is-disabled {
                        background: #e0e4ee;
                        color: #999;
                        cursor: not-allowed;
                    }
                }
            }
        }

        /* Session ID Display */
        .session-id-display {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(10px);
            color: #ffffff;
            padding: 10px 18px;
            border-radius: 20px;
            font-size: 12px;
            font-family: 'Courier New', monospace;
            z-index: 150;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;
            max-width: calc(100vw - 60px);

            &:active {
                background: rgba(0, 0, 0, 0.9);
                transform: translateX(-50%) translateY(0);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }

            .session-label {
                font-weight: 600;
                opacity: 0.8;
            }

            .session-value {
                font-weight: 500;
                letter-spacing: 0.5px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 300px;
            }
        }
    }
</style>

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

    /* 全局弹窗样式 */
    .el-popover.el-popper {
        padding: 0 !important;
        border-radius: 12px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 10px 100px 0 rgba(0, 0, 0, 0.3);
        background-color: #ffffff;
    }

    /* 参数设置弹窗的 textarea 样式 */
    .params-content {
        .params-textarea {
            .el-textarea__inner {
                height: 60px !important;
                min-height: 60px !important;
                max-height: 60px !important;
                background-color: #f6f6f6;
                border-radius: 8px;
                border: none;
                box-shadow: none !important;
                resize: none;
            }
        }

        .params-input {
            .el-input__wrapper {
                height: 48px !important;
                background-color: #f6f6f6;
                border-radius: 8px;
                box-shadow: none !important;
                border: none;
            }
        }
    }

    /* 参数设置按钮样式覆盖 */
    .params-actions {
        /* 去掉按钮之间的默认间距 */
        .el-button + .el-button {
            margin-left: 0 !important;
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

    /* 模型设置按钮样式覆盖 */
    .model-config-actions {
        .model-config-save-btn {
            background: #1e71ff !important;
            color: #fff !important;
            border: none !important;

            &:active {
                background: #0d52cc !important;
            }
        }
    }

    /* 模型设置弹窗 Switch 组件绿色样式 */
    .model-config-wrapper {
        --el-switch-on-color: #52c41a !important;

        .el-switch.is-checked {
            .el-switch__core {
                background-color: #52c41a !important;
                border-color: #52c41a !important;
            }
        }
    }

    /* 模型设置弹窗输入控件样式 */
    .model-config-content {
        .config-item-row {
            .el-input-number {
                width: auto;
            }
        }
    }

    /* 点踩反馈 Popover 样式 */
    .dislike-popover-content {
        .dislike-input {
            .el-textarea {
                .el-textarea__inner {
                    height: 96px !important;
                    min-height: 96px !important;
                    max-height: 96px !important;
                    background-color: #f6f6f6;
                    border-radius: 8px;
                    border: none;
                    box-shadow: none !important;
                    resize: none;
                }
            }
        }
    }
    .voice-select-inline {
        .el-select__wrapper {
            // width: 130px;
            height: 36px;
            border-radius: 12px;
            border: 1px solid #dcdcdc;
            box-shadow: none;
            padding: 8px;
        }
    }
    .voice-select-popper.el-popper {
        width: 150px !important;
        border-radius: 8px;
        padding: 4px;
        border: none;
        box-shadow: 0 3px 9px 0 rgba(0, 0, 0, 0.08);

        .el-select-dropdown__list {
            padding: 0;
        }

        .el-select-dropdown__item {
            border-radius: 6px;
            padding: 0 8px;
            height: 32px;
            line-height: 32px;
            font-size: 14px;
            width: 142px;

            color: #595f6d;

            &.is-selected {
                color: #595f6d;
                font-size: 14px;
                font-style: normal;
                font-weight: 500;
                background-color: rgba(0, 0, 0, 0.05);
            }

            // &:hover {
            //     color: #595f6d;
            //     background-color: rgba(0, 0, 0, 0.05);
            // }

            // &.is-selected:hover {
            //     color: #595f6d;
            //     background-color: rgba(0, 0, 0, 0.05);
            // }
        }

        .el-popper__arrow {
            display: none;
        }
    }
    .config-switch.el-switch {
        --el-switch-on-color: #34c759;
        --el-switch-off-color: rgba(28, 28, 28, 0.2);
        --el-switch-border-color: transparent !important;
        .el-switch__core {
            border: 1px solid transparent;
        }
    }
</style>
