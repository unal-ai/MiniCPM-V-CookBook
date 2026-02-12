<template>
    <div class="home-page" :class="{ 'loading-mode': isLoadingMode }">
        <div class="model-type">{{ modelType === 'simplex' ? t('simplexMode') : t('duplexMode') }}</div>
        <!-- Header -->
        <div class="home-page-header">
            <div class="home-page-header-logo">
                <!-- <div class="test-text">国内</div> -->
                <SvgIcon name="logo-o4.5" class="logo-icon" />
            </div>
            <div class="home-page-header-switch">
                <div class="select-model" v-if="activeTab === 'scene'">
                    <el-select
                        ref="selectRef"
                        popper-class="select-model-popper"
                        v-model="version"
                        @change="handleChangeModel"
                        size="small"
                        :suffix-icon="SelectIcon"
                        :disabled="isCalling"
                        :popper-options="{
                            placement: 'bottom-end',
                            modifiers: [
                                {
                                    name: 'flip',
                                    options: {
                                        fallbackPlacements: ['top-end']
                                    }
                                },
                                {
                                    name: 'offset',
                                    options: {
                                        offset: [0, 8]
                                    }
                                }
                            ]
                        }"
                    >
                        <el-option value="MiniCPM-o2.6">
                            <span>MiniCPM-o2.6</span>
                        </el-option>
                        <el-option value="MiniCPM-V4.0">
                            <span>MiniCPM-V4.0</span>
                        </el-option>
                    </el-select>
                </div>
                <div class="select-type">
                    <div
                        :class="`${modelType === 'simplex' && 'active-type'} ${isCalling && 'disabled-select'}`"
                        @click="changeModelType('simplex')"
                    >
                        {{ t('simplexMode') }}
                    </div>
                    <div
                        :class="`${modelType === 'duplex' && 'active-type'} ${isCalling && 'disabled-select'}`"
                        @click="changeModelType('duplex')"
                    >
                        {{ t('duplexMode') }}
                    </div>
                </div>
                <div
                    v-if="isInternal"
                    class="restart-model"
                    :class="isCalling && 'disabled'"
                    @click="handleRestartModel"
                >
                    {{ t('restartModel') }}
                </div>
                <el-popover v-if="isInternal" :visible="visible" placement="top" :width="300">
                    <div>
                        <div
                            class="config-item"
                            style="
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                margin-bottom: 12px;
                            "
                        >
                            <div class="config-item-label">vad抢跑的检测时长</div>
                            <div class="config-item-content">
                                <el-input-number v-model="durVadTime" size="small" :min="0" :max="1" :step="0.01" />
                            </div>
                        </div>
                        <div
                            class="config-item"
                            style="
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                margin-bottom: 12px;
                            "
                        >
                            <div class="config-item-label">vad抢跑的检测阈值</div>
                            <div class="config-item-content">
                                <el-input-number
                                    v-model="durVadThreshold"
                                    size="small"
                                    :min="0"
                                    :max="1"
                                    :step="0.01"
                                />
                            </div>
                        </div>
                        <div
                            class="config-item"
                            style="
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                margin-bottom: 12px;
                            "
                        >
                            <div class="config-item-label">是否开启vad抢跑</div>
                            <div class="config-item-content">
                                <el-switch v-model="vadRace" inline-prompt active-text="是" inactive-text="否" />
                            </div>
                        </div>
                        <div
                            class="config-item"
                            style="
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                margin-bottom: 12px;
                            "
                        >
                            <div class="config-item-label">是否存储用户数据</div>
                            <div class="config-item-content">
                                <el-switch v-model="saveData" inline-prompt active-text="是" inactive-text="否" />
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right; margin: 0">
                        <el-button size="small" text @click="visible = false">取消</el-button>
                        <el-button size="small" text @click="handleSaveConfig">保存</el-button>
                    </div>
                    <template #reference>
                        <div class="restart-model" :class="isCalling && 'disabled'" @click="visible = true">
                            {{ t('modelConfigTitle') }}
                        </div>
                    </template>
                </el-popover>
                <!-- 模式切换弹窗 -->
                <el-popover v-model:visible="modeSwitchVisible" trigger="manual" placement="bottom-end" :width="410">
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

                                <div
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
                                </div>
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
                        <!-- <div class="mode-switch-btn" @click="handleOpenModeSwitch">
                            <SvgIcon name="model-type-change" class="mode-icon" />
                            <span class="mode-text">{{ t('modeSwitch') }}</span>
                        </div> -->
                    </template>
                </el-popover>
                <!-- 推理服务设置弹窗 -->
                <el-popover
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
                            <!-- 标题 -->
                            <div class="mode-dialog-title">推理服务设置</div>

                            <!-- 选项卡片 -->
                            <div class="mode-cards">
                                <el-input v-model="serviceName" placeholder="请输入完整推理服务地址" />
                                <!-- <div
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
                                </div> -->
                            </div>

                            <!-- 按钮 -->
                            <div class="mode-action-button">
                                <el-button
                                    type="primary"
                                    @click.stop="handleSaveInferenceSetting"
                                    class="mode-start-btn"
                                >
                                    保存设置
                                </el-button>
                            </div>
                        </div>
                    </div>
                    <template #reference>
                        <!-- <div class="inference-setting-btn" @click="handleOpenInferenceSetting">
                            <SvgIcon name="scene-icon" class="setting-icon" />
                            <span class="setting-text">推理设置</span>
                        </div> -->
                    </template>
                </el-popover>
                <div class="change-language" v-if="language === 'zh'" @click="handleChangeLanguage('en')">
                    <SvgIcon name="english" class="language-icon" />
                    <span class="language-text">English</span>
                </div>
                <div class="change-language" v-else @click="handleChangeLanguage('zh')">
                    <SvgIcon name="chinese" class="language-icon" />
                    <span class="language-text">中文</span>
                </div>
                <!-- <div class="login-btn" v-if="needLogin" @click="showLogin = true">
                    {{ language === 'zh' ? '登录' : 'Log-in' }}
                </div>
                <div class="user-info" v-else>
                    <el-popover
                        popper-class="logout-popper"
                        placement="bottom-end"
                        :popper-options="{
                            placement: 'bottom-end',
                            modifiers: [
                                {
                                    name: 'flip',
                                    options: {
                                        fallbackPlacements: ['top-end']
                                    }
                                },
                                {
                                    name: 'offset',
                                    options: {
                                        offset: [0, 8]
                                    }
                                }
                            ]
                        }"
                    >
                        <template #reference>
                            <SvgIcon name="user-icon" class="user-icon" />
                        </template>
                        <template #default>
                            <div class="feedback" @click="handleFeedback">
                                <SvgIcon name="feedback-icon" class="feedback-icon" />
                                <span>{{ t('feedback') }}</span>
                            </div>
                            <div class="logout-btn" @click="handleLogout">
                                <SvgIcon name="logout-icon" class="logout-icon" />
                                <span>{{ t('logout') }}</span>
                            </div>
                        </template>
                    </el-popover>
                </div> -->
            </div>
        </div>

        <!-- Content -->
        <div class="home-page-content">
            <!-- Collapsible Sidebar -->
            <div :class="`home-page-content-nav ${isCollapsed ? 'collapsed-nav' : ''}`">
                <el-tooltip :content="t('menuTabVoice')" placement="right" :disabled="true">
                    <div
                        :class="`home-page-content-nav-item ${activeTab === 'voice' ? 'active-tab' : ''}`"
                        @click="handleClickTab('voice', 0)"
                    >
                        <SvgIcon name="voice-icon" class="nav-icon" />
                        <span class="nav-label">{{ t('menuTabVoice') }}</span>
                    </div>
                </el-tooltip>
                <el-tooltip :content="t('menuTabVideo')" placement="right" :disabled="true">
                    <div
                        :class="`home-page-content-nav-item ${activeTab === 'video' ? 'active-tab' : ''}`"
                        @click="handleClickTab('video', 1)"
                    >
                        <SvgIcon name="video-icon" class="nav-icon" />
                        <span class="nav-label">{{ t('menuTabVideo') }}</span>
                    </div>
                </el-tooltip>
                <!-- <div
                    :class="`home-page-content-nav-item ${activeTab === 'scene' ? 'active-tab' : ''}`"
                    @click="handleClickTab('scene', 2)"
                >
                    <SvgIcon name="scene-icon" class="nav-icon" />
                    <span class="nav-label">{{ t('menuTabScene') }}</span>
                </div> -->
                <!-- <div
                    v-if="isInternal"
                    :class="`home-page-content-nav-item ${activeTab === 'staticVoice' ? 'active-tab' : ''}`"
                    @click="handleClickTab('staticVoice', 3)"
                >
                    <SvgIcon name="voice-icon" class="nav-icon" />
                    <span class="nav-label">{{ t('menuTabTest') }}</span>
                </div> -->
                <!-- 配置表单区域（仅内部版显示） -->
                <div class="home-page-content-form" v-if="isInternal">
                    <div class="form-item">
                        <div class="form-label">Audio Prompt</div>
                        <el-input type="textarea" v-model="audioPrompt" :rows="2" size="small" />
                    </div>
                    <div class="form-item">
                        <div class="form-label">Task Prompt</div>
                        <el-input type="textarea" v-model="taskPrompt" :rows="2" size="small" />
                    </div>
                    <div class="form-row">
                        <div class="form-item">
                            <div class="form-label">Timbre</div>
                            <el-input type="number" v-model="timbre" size="small" />
                        </div>
                        <div class="form-item">
                            <div class="form-label">Model Id</div>
                            <el-input type="number" v-model="modelId" size="small" />
                        </div>
                    </div>
                    <div class="form-item">
                        <div class="form-label">Model Config</div>
                        <el-input
                            type="textarea"
                            v-model="modelConfig"
                            size="small"
                            :rows="2"
                            placeholder="Please input json string"
                        />
                    </div>
                    <div class="form-actions">
                        <span class="btn-save" @click="saveFormConfig">保存</span>
                        <span class="btn-reset" @click="resetFormConfig">重置</span>
                    </div>
                </div>
            </div>

            <!-- Main Body -->
            <div class="home-page-content-body">
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
                />
                <div class="collapse-btn">
                    <SvgIcon
                        v-if="!isCollapsed"
                        name="collapse-left"
                        class="collapse-icon"
                        @click="isCollapsed = !isCollapsed"
                    />
                    <SvgIcon v-else name="collapse-right" class="collapse-icon" @click="isCollapsed = !isCollapsed" />
                </div>
            </div>
        </div>

        <!-- Feedback Modal -->
        <Feedback v-if="showFeedback" v-model="showFeedback" @feedbackSuccess="handleFeedbackClose" />
        <!-- Login Modal -->
        <Login v-if="showLogin" v-model:showLogin="showLogin" @loginSuccess="handleLoginSuccess" />
        <DraggableClock v-if="isInternal" />
        <!-- Like/Dislike Component -->
        <LikeDislike :show="isCalling" />
        <!-- Mode Selector -->
        <ModeSelector v-if="showModeSelector" v-model="showModeSelector" @modeSelected="handleModeSelected" />

        <!-- 网络测速 - Web端左下角 -->
        <NetworkSpeedWeb :is-testing="isTesting" :speed-mbps="speedMbps" />

        <!-- Session ID Display -->
        <!-- <div class="session-id-display" v-if="sessionId" @click="copySessionId">
            <span class="session-label">Session ID:</span>
            <span class="session-value">{{ sessionId }}</span>
        </div> -->

        <!-- 配置面板 -->
        <div class="config-panel-web" v-if="!isCalling">
            <div class="config-panel-title">{{ t('configTitle') }}</div>

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

            <!-- 高刷（仅视频模式显示） -->
            <!-- <div v-if="activeTab === 'video'" class="config-panel-item">
                <div class="config-item-label">
                    <span>高刷</span>
                    <el-tooltip
                        popper-class="info-tooltip"
                        content="开启后可获得更流畅的画面"
                        placement="bottom"
                        effect="light"
                        :show-arrow="false"
                    >
                        <SvgIcon name="info" class="info-icon-small" />
                    </el-tooltip>
                </div>
                <el-switch v-model="highRefresh" class="config-switch" />
            </div> -->

            <!-- 高清模式（仅视频模式显示） -->
            <div v-if="activeTab === 'video'" class="config-panel-item">
                <div class="config-item-label">
                    <span>{{ t('hdModeLabel') }}</span>
                    <el-tooltip
                        popper-class="info-tooltip"
                        :content="t('hdModeTips')"
                        placement="bottom"
                        effect="light"
                        :show-arrow="false"
                    >
                        <SvgIcon name="info" class="info-icon-small" />
                    </el-tooltip>
                </div>
                <el-switch v-model="hdMode" class="config-switch" />
            </div>

            <!-- 语音选项 -->
            <div v-if="false && activeTab === 'voice'" class="config-panel-item">
                <div class="config-item-label">
                    <span>语音选项</span>
                    <el-tooltip
                        popper-class="info-tooltip"
                        content="选择不同的语音音色"
                        placement="bottom"
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
            <div
                v-if="false && activeTab === 'voice' && voiceOption === 10086"
                class="config-panel-item voice-clone-item"
            >
                <div class="config-item-label">
                    <span>音色克隆</span>
                    <el-tooltip
                        popper-class="info-tooltip"
                        content="上传音频文件进行音色克隆"
                        placement="bottom"
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
                v-if="false && activeTab === 'voice' && voiceOption === 10086 && voiceCloneFile"
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
    </div>
</template>

<script setup>
    import { ref, onMounted, watch } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { useRoute, useRouter } from 'vue-router';
    import { restartModel } from '@/apis';
    import { isInternalVersion } from '@/utils/version';

    import VoiceCallRTC from './components/Voice_new_rtc.vue';
    import VideoCallRTC from './components/Video_new_rtc.vue';
    // import SceneExperience from './components/SceneExperience.vue';
    import TestStaticVoice from './components/TestStaticVoice.vue';
    import SelectIcon from '@/components/SelectIcon/index.vue';
    import LikeDislike from '@/components/LikeDislike/index.vue';
    import ModeSelector from '@/components/ModeSelector/index.vue';
    import { NetworkSpeedWeb } from '@/components/NetworkSpeed';
    import { VOICE_OPTIONS } from '@/config/voiceOptions';
    import { useNetworkSpeed } from '@/hooks/useNetworkSpeed';

    const route = useRoute();
    const router = useRouter();

    // 网络测速功能
    const { speedMbps, isTesting, startTesting, stopTesting } = useNetworkSpeed({
        fileUrl: '/static/test.bin',
        fileSizeBytes: 500 * 1024, // 500 KB
        interval: 10000 // 每 10 秒检测一次
    });

    console.log('💻 PC端首页已加载');
    // const typeObj = { 0: 'voice', 1: 'video', 2: 'scene' };
    const typeObj = { 0: 'voice', 1: 'video', 3: 'staticVoice' };
    // Read current C++ inference mode from build-time env (set by oneclick.sh)
    const cppMode = import.meta.env.VITE_CPP_MODE || 'duplex';
    // Default to the available tab based on deployment mode
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

    const serviceName = ref('');

    // 检查是否需要显示模式选择弹窗
    const hasSelected = localStorage.getItem('hasSelectedMode');
    console.log('hasSelected: ', hasSelected);
    // if (!hasSelected || hasSelected !== 'true') {
    //     isLoadingMode.value = true;
    //     showModeSelector.value = true;
    // }
    const isCollapsed = ref(false);
    const voiceRef = ref();
    const videoRef = ref();
    const sceneRef = ref();
    const staticRef = ref();

    const version = ref('MiniCPM-o2.6');
    const selectRef = ref(null);

    const loading = ref(false);

    // KOL版本默认双工
    const modelType = ref(localStorage.getItem('modelType') || cppMode); // 单双工模式 'simplex' or 'duplex'

    const visible = ref(false);
    const modeSwitchVisible = ref(false);
    const selectedSwitchMode = ref('streaming');

    // 推理服务设置相关
    const inferenceSettingVisible = ref(false);
    const selectedServiceType = ref('');

    const durVadTime = ref(); // vad抢跑的检测时长
    const durVadThreshold = ref(); // vad抢跑的检测阈值
    const vadRace = ref(false); // 是否开启vad抢跑
    const saveData = ref(true); // 是否存储用户数据

    // 支持URL参数动态切换版本 (例如: ?version=official 或 ?version=internal)
    const isInternal = isInternalVersion();

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

    // 配置表单相关
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

        // 初始化配置项
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

        // 初始化配置面板数据
        const savedHighRefresh = localStorage.getItem('highRefresh');
        const savedHdMode = localStorage.getItem('hdMode');
        const savedVoiceOption = localStorage.getItem('voiceOption');

        // 高刷默认为 false
        if (savedHighRefresh !== null) {
            highRefresh.value = savedHighRefresh === 'true';
        } else {
            highRefresh.value = false;
            localStorage.setItem('highRefresh', 'false');
        }

        // 高清模式默认为 false
        if (savedHdMode !== null) {
            hdMode.value = savedHdMode === 'true';
        } else {
            hdMode.value = false;
            localStorage.setItem('hdMode', 'false');
        }

        // 语音选项默认为 1（男一号）
        if (savedVoiceOption !== null) {
            voiceOption.value = Number(savedVoiceOption);
        } else {
            voiceOption.value = 1;
            localStorage.setItem('voiceOption', '1');
        }

        // 初始化通话语言（默认英文）
        const savedCallLanguage = localStorage.getItem('callLanguage');
        if (savedCallLanguage !== null) {
            callLanguage.value = savedCallLanguage;
        } else {
            callLanguage.value = 'en';
            localStorage.setItem('callLanguage', 'en');
        }

        // 初始化表单配置（仅内部版）
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
        localStorage.setItem('serviceName', serviceName.value);
        ElMessage.success('保存成功！设置将在下次连接时生效');
        if (!selectedServiceType.value) return;

        localStorage.setItem('inferenceServiceType', selectedServiceType.value);
        inferenceSettingVisible.value = false;
        ElMessage.success('保存成功！设置将在下次连接时生效');
    };

    const handleRestartModel = async () => {
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
    const handleFeedback = () => {
        showFeedback.value = true;
    };
    const handleFeedbackClose = () => {
        showFeedback.value = true;
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
    const handleLogout = () => {
        localStorage.removeItem('userInfo');
        needLogin.value = true;
        showLogin.value = false;
        ElMessage.success(t('logoutSuccess'));
    };
    const handleChangeModel = val => {
        console.log('val: ', val);
    };
    const changeModelType = val => {
        if (isCalling.value) return;
        if (modelType.value === val) return;
        modelType.value = val;

        ElMessage.success(t('modeSwitchSuccess'));
        localStorage.setItem('modelType', val);
    };
    const handleSaveConfig = () => {
        localStorage.setItem('durVadTime', durVadTime.value);
        localStorage.setItem('durVadThreshold', durVadThreshold.value);
        localStorage.setItem('vadRace', vadRace.value);
        localStorage.setItem('saveData', saveData.value);
        visible.value = false;
        ElMessage.success('配置保存成功');
    };

    // 保存表单配置
    const saveFormConfig = () => {
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

    // 重置表单配置
    const resetFormConfig = () => {
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
</script>

<style lang="less" scoped>
    .model-type {
        position: fixed;
        top: 108px;
        left: 266px;
        padding: 8px 16px;
        border-radius: 90px;
        border: 1px solid rgba(0, 0, 0, 0.05);
        background: #fff;
        color: #595f6d;
        font-family: 'PingFang SC';
        font-size: 14px;
        font-style: normal;
        font-weight: 500;
        line-height: normal;
        z-index: 999;
    }
    .home-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #f6f8ff;
        position: relative;

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

        &-header {
            height: 76px;
            padding: 20px 60px 20px 38px;
            display: flex;
            align-items: center;
            box-shadow: 0 0.5px 0 rgba(224, 224, 224, 0.5);
            &-logo {
                width: 223px;
                position: relative;
                display: flex;
                align-items: center;
                flex-shrink: 0;
                .test-text {
                    position: absolute;
                    top: 0;
                    right: 0;
                    font-size: 12px;
                    color: #1e71ff;
                }
                .logo-icon {
                    width: 223px;
                    height: 40px;
                }
            }
            &-switch {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                .select-model {
                    margin-right: 32px;
                }
                .select-type {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-right: 16px;
                    div {
                        // font-family: Roboto;
                        font-size: 12px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                        color: #595f6d;
                        box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.2);
                        padding: 6px 12px;
                        border-radius: 16px;
                        cursor: pointer;
                        user-select: none;
                        opacity: 0.6;
                        &.active-type {
                            color: #1e71ff;
                            border-color: #1e71ff;
                            box-shadow: 0 0 0 0.5px #1e71ff;

                            font-weight: 500;
                            opacity: 1;
                        }
                    }
                    .disabled-select {
                        pointer-events: none;
                        opacity: 0.3;
                        cursor: not-allowed;
                    }
                }
                .restart-model {
                    color: #ffffff;
                    background: #1e71ff;
                    padding: 6px 12px;
                    border-radius: 16px;
                    margin-right: 16px;
                    font-size: 12px;
                    cursor: pointer;
                    &.disabled {
                        pointer-events: none;
                        opacity: 0.3;
                        cursor: not-allowed;
                    }
                }
                .mode-switch-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    border-radius: 90px;
                    padding: 8px 16px;
                    cursor: pointer;
                    user-select: none;
                    background: rgba(255, 255, 255, 0.5);
                    color: #595f6d;
                    margin-right: 16px;
                    .mode-icon {
                        width: 20px;
                        height: 20px;
                        color: #595f6d;
                    }
                    .mode-text {
                        // font-family: Roboto;
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                    }
                }
                .inference-setting-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    border-radius: 90px;
                    padding: 8px 16px;
                    cursor: pointer;
                    user-select: none;
                    background: rgba(255, 255, 255, 0.5);
                    color: #595f6d;
                    margin-right: 16px;
                    .setting-icon {
                        width: 20px;
                        height: 20px;
                        color: #595f6d;
                    }
                    .setting-text {
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                    }
                    &:hover {
                        background: #e3eaff;
                        color: #1e71ff;
                        .setting-icon {
                            color: #1e71ff;
                        }
                    }
                }
                .change-language {
                    width: 102px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    border-radius: 90px;
                    padding: 8px 16px;
                    cursor: pointer;
                    user-select: none;
                    background: rgba(255, 255, 255, 0.5);
                    color: #595f6d;
                    .language-icon {
                        width: 20px;
                        height: 20px;
                        color: #595f6d;
                    }
                    .language-text {
                        // font-family: Roboto;
                        font-size: 14px;
                        font-style: normal;
                        font-weight: 400;
                        line-height: normal;
                    }
                }
                .user-speed {
                    margin-right: 32px;
                    font-size: 12px;
                    color: #595f6d;
                }
                .login-btn {
                    height: 32px;
                    border-radius: 12px;
                    padding: 8px 16px;
                    background: #647fff;
                    color: #ffffff;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    color: #fff;
                    // font-family: Roboto;
                    font-size: 14px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: normal;
                    margin-left: 32px;
                    cursor: pointer;
                }
                .user-icon {
                    width: 36px;
                    height: 36px;
                    margin-left: 32px;
                    &:focus {
                        outline: none;
                    }
                }
            }
        }
        &-content {
            flex: 1;
            display: flex;
            margin-top: 1px;
            padding: 16px 62px 68px 18px;

            /* Sidebar */
            &-nav {
                width: 232px;
                padding: 32px 16px 0 16px;
                transition: width 0.4s ease;
                overflow: hidden;
                flex-shrink: 0;
                &-item {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    align-items: center;
                    gap: 8px;
                    padding-left: 20px;
                    transition:
                        grid-template-columns 0.4s ease,
                        padding-left 0.4s ease;
                    margin-bottom: 12px;
                    height: 48px;
                    border-radius: 90px;
                    cursor: pointer;
                    user-select: none;
                    .nav-icon {
                        width: 20px;
                        height: 20px;
                        color: #595f6d;
                    }
                    .nav-label {
                        white-space: nowrap;
                        overflow: hidden;
                    }

                    &.active-tab {
                        background: #e3eaff;
                        color: #1e71ff;
                        font-weight: 500;
                        position: relative;
                        .nav-icon {
                            color: #1a71ff;
                        }
                        &::after {
                            content: '';
                            position: absolute;
                            right: -12px;
                            top: 15px;
                            width: 4px;
                            height: 18px;
                            border-radius: 6px;
                            background: #fff;
                        }
                    }
                    &:hover {
                        background: #e3eaff;
                        color: #1e71ff;
                        .nav-icon {
                            color: #1a71ff;
                        }
                    }
                    &.disabled-tab {
                        opacity: 0.4;
                        cursor: not-allowed;
                        pointer-events: auto; /* keep pointer events for tooltip */
                        &:hover {
                            background: transparent;
                            color: inherit;
                            .nav-icon {
                                color: inherit;
                            }
                        }
                        &.active-tab {
                            background: transparent;
                            color: inherit;
                            .nav-icon {
                                color: inherit;
                            }
                            &::after {
                                display: none;
                            }
                        }
                    }
                }
                &.collapsed-nav {
                    width: 116px;
                    .home-page-content-nav-item {
                        grid-template-columns: auto 0fr;
                        padding-left: 32px;
                    }

                    .home-page-content-form {
                        display: none;
                    }
                }
            }

            /* 配置表单 */
            &-form {
                margin-top: 16px;
                padding: 0 8px;

                .form-item {
                    margin-bottom: 8px;

                    .form-label {
                        margin-bottom: 4px;
                        color: #595f6d;
                        font-size: 12px;
                        font-weight: 500;
                    }
                }

                .form-row {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 8px;

                    .form-item {
                        flex: 1;
                        margin-bottom: 0;
                    }
                }

                .form-actions {
                    margin-top: 12px;
                    display: flex;
                    gap: 8px;

                    span {
                        flex: 1;
                        text-align: center;
                        cursor: pointer;
                        padding: 6px 8px;
                        border-radius: 6px;
                        font-size: 12px;
                        transition: all 0.2s;
                    }

                    .btn-save {
                        background: #1e71ff;
                        color: #ffffff;

                        &:hover {
                            background: #1560dd;
                        }
                    }

                    .btn-reset {
                        background: #f3f4f6;
                        color: #595f6d;

                        &:hover {
                            background: #e5e7eb;
                        }
                    }
                }
            }

            /* Main body */
            &-body {
                flex: 1;
                min-width: 0;
                // overflow: hidden;
                position: relative;

                .collapse-btn {
                    position: absolute;
                    bottom: 300px;
                    left: -34px;
                    cursor: pointer;
                    .collapse-icon {
                        width: 34px;
                        height: 32px;
                    }
                }
            }
        }

        .session-id-display {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(10px);
            color: #ffffff;
            padding: 8px 20px;
            border-radius: 20px;
            font-size: 12px;
            font-family: 'Courier New', monospace;
            z-index: 999;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;

            &:hover {
                background: rgba(0, 0, 0, 0.85);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                transform: translateX(-50%) translateY(-2px);
            }

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
            }

            /* 移动端优化 */
            @media (max-width: 768px) {
                bottom: 16px;
                padding: 10px 16px;
                font-size: 11px;
                max-width: 90vw;

                .session-label {
                    font-size: 10px;
                }

                .session-value {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 200px;
                }
            }

            /* iPad 和平板优化 */
            @media (min-width: 769px) and (max-width: 1024px) {
                bottom: 18px;
                padding: 10px 18px;
                font-size: 12px;
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
        }
    }

    /* ==================== 模式切换弹窗特定样式 ==================== */
    .mode-switch-wrapper {
        .mode-switch-content {
            padding: 20px;

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

                &:hover {
                    border-color: #1e71ff;
                }

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

                    &:hover:not(.is-disabled) {
                        background: #0d5fe6;
                    }

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
    }

    /* ==================== 配置面板样式 ==================== */
    .config-panel-web {
        position: fixed;
        top: 108px;
        right: 78px;
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
            margin-bottom: 8px;

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
                --el-switch-border-color: transparent;
            }

            .voice-select-inline {
                width: 150px;

                :deep(.el-select__wrapper) {
                    // background-color: #f6f6f6;
                    border-radius: 12px;
                    box-shadow: none !important;
                    border: none;
                    padding: 8px;
                    height: 36px;
                    border: 1px solid #dcdcdc;
                }

                :deep(.el-input__inner) {
                    font-size: 14px;
                    color: #333333;
                }
            }

            &.voice-clone-item {
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
                    //     background-color: #e8e8e8;
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
        // height: 92px;
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
        // width: 195px !important;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.8);
        box-shadow: 0px 0px 12px 0px rgba(0, 0, 0, 0.05);
        // box-sizing: border-box;
        // overflow: hidden;
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

    /* 全局模式切换弹窗样式 */
    .el-popover.el-popper {
        &:has(.mode-switch-wrapper) {
            padding: 0 !important;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 10px 100px 0 rgba(0, 0, 0, 0.3);
            background-color: #ffffff;

            .el-popper__arrow {
                display: none;
            }
        }
    }
    .voice-select-inline {
        .el-select__wrapper {
            height: 36px;
            border-radius: 12px;
            border: 1px solid #dcdcdc;
            box-shadow: none;
            &:hover {
                box-shadow: none;
            }
        }
    }
    .voice-select-popper.el-select__popper {
        border: none;
        box-shadow: 0 3px 9px 0 rgba(0, 0, 0, 0.08);
    }
    .voice-select-popper {
        width: 150px !important;
        border-radius: 8px;
        padding: 4px;
        .el-select-dropdown__list {
            padding: 0;
        }

        .el-select-dropdown__item {
            border-radius: 8px;
            padding: 0 8px;
            height: 32px;
            line-height: 32px;
            font-size: 14px;
            color: #595f6d;

            &.is-selected {
                color: #595f6d;
                font-size: 14px;
                font-style: normal;
                font-weight: 500;
                background-color: rgba(0, 0, 0, 0.05);
            }

            &:hover {
                color: #595f6d;
                background-color: rgba(0, 0, 0, 0.05);
            }

            &.is-selected:hover {
                color: #595f6d;
                background-color: rgba(0, 0, 0, 0.05);
            }
        }

        .el-popper__arrow {
            display: none;
        }
        li:not(:last-child) {
            margin-bottom: 4px;
        }
    }
</style>
