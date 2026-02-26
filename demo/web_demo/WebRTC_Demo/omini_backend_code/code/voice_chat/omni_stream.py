import asyncio
from collections import deque
from datetime import datetime
import os
import uuid
import numpy as np
from scipy.signal import resample_poly
from services.inference_service_manager import InferenceService, get_service_manager
from voice_chat.entity.token import LoginRequest
from voice_chat.entity.session import SharedSessionState
from voice_chat.vad import vad_utils
import time

from enhanced_logging_config import get_enhanced_logger, set_request_trace
from voice_chat.model_call import MiniCpmModel
from common.enums.model_type import ModelType
from concurrent.futures import ThreadPoolExecutor
from config.settings import get_voice_chat_settings

# 获取日志器
logger = get_enhanced_logger('voice_chat')

# VAD 检测专用线程池（独立于全局线程池，避免被其他长时间任务阻塞）
# 增加worker数量以支持更多并发用户（每个用户并发VAD检测）
_vad_thread_pool = ThreadPoolExecutor(max_workers=10, thread_name_prefix="VAD")


class OmniStream:
    def __init__(self, inference_service: InferenceService, request: LoginRequest, 
    audio_input_queue: asyncio.Queue,
    audio_output_queue: asyncio.Queue,
    text_output_queue: asyncio.Queue,
    stop_event:asyncio.Event,
    model_cpm:MiniCpmModel,
    shared_state: SharedSessionState):
        self.audio_input_queue = audio_input_queue
        self.audio_output_queue = audio_output_queue
        self.text_output_queue = text_output_queue
        self.inference_service = inference_service
        self.model_cpm = model_cpm
        self.stop_event = stop_event
        self.active_tasks = set()
        self.session_id = request.sessionId
        self.user_id = request.userId
        self.session_type = request.sessionType
        # vad
        self.vad_options = vad_utils.VadOptions()
        self.vad_stream_started = False
        self.vad_time = time.time()
        self.dur_vad_time = request.durVadTime
        self.dur_vad_threshold = request.durVadThreshold
        self.vad_race = request.vadRace
        # 准备抢跑的标识，第二次小于0.1才返回可以抢跑
        self.vad_race_prepare = False
        self.vad_race_flag = asyncio.Event()
        self.vad_race_audio_queue = asyncio.Queue()
        self.vad_race_text_queue = asyncio.Queue()
        self.vad_race_task = None  # 跟踪当前抢跑任务
        self.generate_task = None  # 跟踪当前常规生成任务，避免重复触发

        # 双工延迟时间 延缓双工的卡顿
        self.duplex_delay_time_flag = False

        # 音频配置
        self.WEBRTC_SAMPLE_RATE = 48000
        self.WEBRTC_CHUNK_SIZE = self.WEBRTC_SAMPLE_RATE//10
        self.BUFFER_SIZE = self.WEBRTC_SAMPLE_RATE
        
        # 协程间共享的会话状态
        self.shared_state = shared_state
        
        # 从配置文件中读取语音打断相关配置
        voice_chat_config = get_voice_chat_settings()
        self.enable_voice_interruption = voice_chat_config.enable_voice_interruption
        self.voice_interruption_threshold = voice_chat_config.voice_interruption_threshold
        # 最短有效语音尾包阈值，避免几十毫秒噪音触发空轮次 generate
        self.min_valid_tail_ms = 220
        # DUPLEX 语音结束判定的静音保持时间（毫秒）。
        # 默认取 1500ms(1.5秒)，允许用户在说话时自然停顿。原来过小(220/600)会把一句话切碎成多轮。
        request_hold_ms = getattr(request, "duplexSilenceHoldMs", None)
        try:
            hold_ms = float(request_hold_ms) if request_hold_ms is not None else 1500.0
        except (TypeError, ValueError):
            hold_ms = 1500.0
        self.duplex_silence_hold_ms = max(50.0, min(5000.0, hold_ms))
        self.duplex_silence_hold_sec = self.duplex_silence_hold_ms / 1000.0
        # 生成触发后丢弃更早采集到的音频帧，避免旧输入在下一轮“迟到复读”
        self.discard_audio_before_ts = 0.0
        # 双工空输出重试：首轮无音频时在同一轮补一次 generate，降低“首轮无声”概率
        self.duplex_empty_generate_retry = max(0, int(os.environ.get("DUPLEX_EMPTY_GENERATE_RETRY", "1")))
        retry_delay_ms = int(os.environ.get("DUPLEX_EMPTY_GENERATE_RETRY_DELAY_MS", "160"))
        self.duplex_empty_generate_retry_delay_sec = max(0.0, retry_delay_ms / 1000.0)

    async def _collect_audio_data(self) -> np.ndarray:
        """
        收集音频输入队列中的所有可用数据
        
        Returns:
            combined_audio_data: np.ndarray
        """
        collected_data = []
        # 使用 get_nowait() 避免阻塞，循环收集所有可用数据
        while True:
            try:
                audio_data = self.audio_input_queue.get_nowait()
                if audio_data is None:
                    break
                # 处理带时间戳的音频数据
                if isinstance(audio_data, tuple) and len(audio_data) == 3:
                    audio_array, timestamp, _ = audio_data
                    if timestamp is not None and timestamp <= self.discard_audio_before_ts:
                        continue
                    collected_data.append(audio_array)
                    
            except asyncio.QueueEmpty:
                # 队列为空，正常退出循环
                break
            except Exception as e:
                logger.error(f"收集音频数据错误: {str(e)}")
                break
        
        return collected_data

    async def _process_audio_batch(self, audio_data_buffer, buffer_duration, target_duration):
        """
        预填音频批次数据
        
        Returns:
            tuple: (updated_audio_data_buffer, updated_buffer_duration)
        """
        # 计算需要保留的数据量
        logger.info(f"process_audio_batch buffer_duration: {buffer_duration}, target_duration: {target_duration}")
        remaining_duration = buffer_duration - target_duration
        remaining_samples = int((remaining_duration / 1000) * self.WEBRTC_SAMPLE_RATE)

        # 合并所有缓冲的音频数据
        full_audio_data = np.concatenate(audio_data_buffer)
        prefill_audio = None
        updated_audio_data_buffer = audio_data_buffer
        updated_buffer_duration = buffer_duration

        try:
            # 分割数据，保留超过1000ms的部分
            if remaining_samples > 0:
                # 发送前1000ms的数据
                prefill_audio = full_audio_data[:-remaining_samples]
                # 保留剩余数据
                updated_audio_data_buffer = [full_audio_data[-remaining_samples:]]
                updated_buffer_duration = remaining_duration
            else:
                # 如果刚好是1000ms，发送全部数据
                prefill_audio = full_audio_data
                updated_audio_data_buffer = []
                updated_buffer_duration = 0

            if prefill_audio is None or len(prefill_audio) == 0:
                logger.info("预填数据为空，保留当前缓冲")
                return audio_data_buffer, buffer_duration

            prefill_ok = await self.model_prefill(prefill_audio)
            if not prefill_ok:
                logger.warning("模型预填失败，本次保留缓冲数据等待重试")
                return audio_data_buffer, buffer_duration

            return updated_audio_data_buffer, updated_buffer_duration
        finally:
            # 清理内存
            del full_audio_data

    async def _handle_model_generate(self) -> None:
        """
        处理未检测到语音活动的情况(SIMPLEX模式)
        """
        if self.model_cpm.model_generating_flag.is_set():
            logger.info("模型正在输出,忽略generate")
            return
        if self.model_cpm.model_type == ModelType.SIMPLEX and not self.model_cpm.play_end_event.is_set():
            logger.info("模型和前端正在输出,忽略generate")
            return
        if self.model_cpm.model_type == ModelType.SIMPLEX:
            await self.text_output_queue.put("<state><vad_end>")
            await self.text_output_queue.put(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')} - <state><vad_end>")
            self.vad_stream_started = False
        generate_start_time = time.time()
        has_audio_output = False
        has_text_output = False
        current_round_id = None
        max_attempts = 1
        if self.model_cpm.model_type == ModelType.DUPLEX:
            max_attempts += self.duplex_empty_generate_retry

        try:
            for attempt in range(max_attempts):
                if attempt > 0:
                    logger.warning(
                        f"DUPLEX本轮无音频输出，执行同轮重试 attempt={attempt + 1}/{max_attempts}"
                    )
                    await asyncio.sleep(self.duplex_empty_generate_retry_delay_sec)

                emit_round_state = (attempt == 0)
                generator = self.model_cpm.streaming_generate(
                    session_id=self.session_id,
                    emit_round_state=emit_round_state,
                    reuse_round_id=current_round_id
                )
                # 每次生成后进行续命服务锁定
                service_manager = await get_service_manager()
                await service_manager.renew_service_lock(self.inference_service.locked_by, self.inference_service.service_id)

                attempt_has_audio = False
                attempt_has_text = False
                async for chunk in generator:
                    logger.info(f"收到流式数据: {chunk}")
                    
                    # 检查是否是结束标志
                    if chunk.get('type') == 'done':
                        break
                    
                    # 解析流式数据中的音频内容
                    chunk_data = chunk.get('chunk_data')
                    if chunk_data:
                        # 获取音频数据和采样率
                        wav_data = chunk_data.get('wav')
                        tts_sample_rate = chunk_data.get('sample_rate', 24000)

                        audio_data = None
                        if wav_data is not None:
                            # 重采样到 WebRTC 采样率
                            resampled_data = resample_poly(
                                wav_data,
                                self.WEBRTC_SAMPLE_RATE,
                                tts_sample_rate,
                                padtype='line'
                            )
                            
                            # wav_data 已经是 int16 格式，重采样后需要 clip 到有效范围
                            audio_data = np.clip(resampled_data, -32768, 32767).astype(np.int16)
                            # 将音频数据放入队列
                            if self.model_cpm.model_type == ModelType.DUPLEX and not self.duplex_delay_time_flag:
                                self.duplex_delay_time_flag = True
                                await asyncio.sleep(max(0, 1 - (time.time() - generate_start_time)))
                            await self.audio_output_queue.put(audio_data)
                            if len(audio_data) > 0:
                                has_audio_output = True
                                attempt_has_audio = True
                        # 处理文本内容
                        text_content = chunk_data.get('text')
                        if text_content:
                            attempt_has_text = True
                            has_text_output = True
                            await self.text_output_queue.put(text_content)

                if current_round_id is None:
                    current_round_id = self.model_cpm.active_round_id
                if attempt_has_audio:
                    break
                if self.model_cpm.model_type != ModelType.DUPLEX:
                    break
                if attempt + 1 >= max_attempts:
                    break
                if attempt_has_text:
                    logger.warning("DUPLEX本次仅收到文本无音频，继续重试一次")
        except Exception as e:
            logger.error(f"模型生成错误: {str(e)}")
        finally:
            round_id = current_round_id or self.model_cpm.active_round_id
            if round_id is None:
                round_id = await self.shared_state.get_round()
            await self.text_output_queue.put(f"<state><generate_end:{round_id}>")
            if not has_audio_output:
                if has_text_output:
                    logger.warning(f"round={round_id} 生成结束但无音频，仅有文本输出")
                await self.text_output_queue.put(f"<state><generate_no_audio:{round_id}>")

    def _schedule_model_generate(self, reason: str = ""):
        """
        统一调度生成任务，避免 DUPLEX 模式下重复 create_task 导致 generate_start/end 风暴。
        """
        if self.stop_event.is_set():
            return None

        if self.generate_task is not None and not self.generate_task.done():
            logger.info(f"生成任务已存在，忽略本次触发: {reason}")
            return None

        if self.model_cpm.model_generating_flag.is_set():
            logger.info(f"模型正在生成，忽略本次触发: {reason}")
            return None

        task = asyncio.create_task(self._handle_model_generate())
        self.generate_task = task

        def _on_done(done_task: asyncio.Task):
            try:
                if done_task.cancelled():
                    logger.warning("生成任务被取消")
                else:
                    exc = done_task.exception()
                    if exc:
                        logger.error(f"生成任务异常结束: {exc}")
            except Exception as e:
                logger.error(f"生成任务回调异常: {e}")
            finally:
                if self.generate_task is done_task:
                    self.generate_task = None
                if self.vad_race_task is done_task:
                    self.vad_race_task = None

        task.add_done_callback(_on_done)
        logger.info(f"创建生成任务: {reason}")
        return task

    def _clear_audio_queues(self) -> None:
        """
        清理音频队列和缓冲区
        """
        # 清空音频输入队列
        while not self.audio_input_queue.empty():
            try:
                self.audio_input_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
    
    async def _async_stream_detail(self, audio_buffer):
        """
        异步版本的流式处理主循环
        """
        # 设置日志追踪上下文，用于关联同一会话的所有日志
        set_request_trace(
            request_id=self.session_id[:8] if self.session_id else None,
            session_id=self.session_id
        )
        logger.info(f"OmniStream 开始处理，session_id: {self.session_id}, user_id: {self.user_id}")
        
        # 任务管理集合
        # 使用实例变量来管理任务，确保回调函数能正确访问
        audio_data_buffer = []
        buffer_duration = 0
        target_duration = 1000  # 目标缓冲区时长（毫秒）
        # 标记本轮是否至少有一次有效 prefill，用于避免“空轮次”误触发 generate
        simplex_prefilled_this_turn = False
        # 标记本轮是否检测到过有效语音，避免静音/噪音尾包触发空轮次生成
        simplex_detected_voice_this_turn = False
        # DUPLEX 同步门控：仅当本轮检测到有效语音后，才允许触发 generate
        duplex_detected_voice_this_turn = False
        while not self.stop_event.is_set():
            try:
                start_time = time.time()
                
                # 1. 收集音频数据
                collected_data = await self._collect_audio_data()
                if collected_data:
                    # 2. 处理音频缓冲区
                    combined_data = np.concatenate(collected_data)
                    audio_buffer.extend(combined_data)
                    if len(audio_buffer) >= self.BUFFER_SIZE:
                        if self.model_cpm.model_type == ModelType.SIMPLEX:
                            # SIMPLEX模式：需要VAD检测
                            # 使用专用 VAD 线程池执行检测，避免被其他长时间任务阻塞
                            loop = asyncio.get_event_loop()
                            full_vad_result, tail_vad_result, dur_vad_full = await loop.run_in_executor(
                                _vad_thread_pool, self.vad_dual_detection, audio_buffer)
                            model_is_playing = not self.model_cpm.play_end_event.is_set()

                            # 模型播放阶段仅用于打断检测，避免把回声/噪音累计成下一轮输入。
                            if model_is_playing:
                                if (
                                    self.enable_voice_interruption
                                    and full_vad_result
                                    and dur_vad_full > self.voice_interruption_threshold
                                ):
                                    asyncio.create_task(
                                        self.model_cpm.streaming_break(
                                            session_id=self.session_id,
                                            text="说话打断"
                                        )
                                    )
                                audio_buffer.clear()
                                buffer_duration = 0
                                audio_data_buffer = []
                                simplex_prefilled_this_turn = False
                                simplex_detected_voice_this_turn = False
                                continue

                            if full_vad_result:
                                if dur_vad_full >= self.dur_vad_time:
                                    simplex_detected_voice_this_turn = True
                                # 计算当前数据块的时长（毫秒）
                                chunk_duration = (len(combined_data) / self.WEBRTC_SAMPLE_RATE) * 1000
                                buffer_duration += chunk_duration
                                audio_data_buffer.append(combined_data)

                                # 当缓冲区达到目标时长时，处理数据
                                if buffer_duration >= target_duration:
                                    audio_data_buffer, buffer_duration = await self._process_audio_batch(audio_data_buffer, buffer_duration, target_duration)
                                    simplex_prefilled_this_turn = True
                                if self.vad_race:
                                    # 抢跑模式
                                    if not tail_vad_result:
                                        if not self.vad_race_flag.is_set() and self.vad_race_task is None:
                                            # 执行vad抢跑的逻辑
                                            self.vad_race_flag.set()
                                            task = self._schedule_model_generate("VAD抢跑触发")
                                            if task is not None:
                                                self.vad_race_task = task
                                        else:
                                            logger.info("抢跑任务已存在，跳过创建新任务")
                                    else:
                                        if self.vad_race_flag.is_set():
                                            # 抢跑失败,停止抢跑
                                            self.vad_race_flag.clear()
                                            self.vad_race_task = None
                                            asyncio.create_task(self.stop_vad_race_encode())
                            else:
                                # 无语音活动，生成响应
                                if self.vad_race_flag.is_set():
                                    logger.info(f"抢跑成功,释放queue的数据")
                                    # 抢跑成功释放queue的数据
                                    while self.vad_race_task is not None:
                                        try:
                                            audio_data = self.vad_race_audio_queue.get_nowait()
                                            if audio_data:
                                                await self.audio_input_queue.put(audio_data)
                                        except asyncio.QueueEmpty:
                                            break
                                        try:
                                            text_data = self.vad_race_text_queue.get_nowait()
                                            if text_data:
                                                await self.text_output_queue.put(text_data)
                                        except asyncio.QueueEmpty:
                                            break
                                    self.vad_race_flag.clear()
                                else:
                                    has_tail_audio = buffer_duration > self.min_valid_tail_ms and len(audio_data_buffer) > 0
                                    if has_tail_audio and not simplex_detected_voice_this_turn and not simplex_prefilled_this_turn:
                                        logger.info(
                                            f"SIMPLEX尾包存在但本轮未检测到有效语音，忽略触发: buffer_duration={buffer_duration:.1f}ms"
                                        )
                                        has_tail_audio = False
                                    if not has_tail_audio and buffer_duration > 0:
                                        logger.info(
                                            f"SIMPLEX尾包过短，忽略触发: buffer_duration={buffer_duration:.1f}ms, min={self.min_valid_tail_ms}ms"
                                        )
                                    # 判断剩下的audio_data_buffer是否大于0.1s,如果大于0.1s,则补最后一片音频后触发生成
                                    if has_tail_audio:
                                        # 发送尾巴音频数据
                                        existing_audio = np.concatenate(audio_data_buffer)
                                        await self.model_prefill(existing_audio, last_chunk=True)
                                    # 只有本轮确实收到过有效语音时，才触发 generate，避免空轮次。
                                    if simplex_prefilled_this_turn or (has_tail_audio and simplex_detected_voice_this_turn):
                                        self._schedule_model_generate("SIMPLEX无语音触发生成")
                                    else:
                                        logger.info("SIMPLEX无有效语音缓存，跳过生成触发")
                                # 单工输出之后清理之前的缓冲区数据
                                audio_buffer.clear()
                                buffer_duration = 0
                                audio_data_buffer = []
                                simplex_prefilled_this_turn = False
                                simplex_detected_voice_this_turn = False
                                self._clear_audio_queues()
                        elif self.model_cpm.model_type == ModelType.DUPLEX:
                            # DUPLEX 模式也做 VAD 门控，避免静音期间按 1s 节拍反复触发 generate
                            # 导致“每次只播约1秒、下一轮续播残句”的问题。
                            loop = asyncio.get_event_loop()
                            full_vad_result, _, dur_vad_full = await loop.run_in_executor(
                                _vad_thread_pool, self.vad_dual_detection, audio_buffer
                            )
                            duplex_speech_active = full_vad_result

                            if duplex_speech_active:
                                if dur_vad_full >= self.dur_vad_time:
                                    duplex_detected_voice_this_turn = True
                                # 检测到有效语音：持续 prefill，不立即触发生成
                                chunk_duration = (len(combined_data) / self.WEBRTC_SAMPLE_RATE) * 1000
                                buffer_duration += chunk_duration
                                audio_data_buffer.append(combined_data)

                                # 当缓冲区达到目标时长时，仅做 prefill
                                if buffer_duration >= target_duration:
                                    audio_data_buffer, buffer_duration = await self._process_audio_batch(
                                        audio_data_buffer, buffer_duration, target_duration
                                    )
                            else:
                                # 语音结束：只要本轮已经确认存在有效语音，就必须触发一次生成。
                                # 否则会出现“刚好在分片边界停下，尾包很短而被忽略”的漏回复问题。
                                has_voice_buffer = buffer_duration > self.min_valid_tail_ms and len(audio_data_buffer) > 0
                                if not duplex_detected_voice_this_turn:
                                    if buffer_duration > 0:
                                        logger.info(
                                            "DUPLEX尾包仅包含静音保持段，未检测到有效语音，跳过生成触发"
                                        )
                                else:
                                    existing_audio = (
                                        np.concatenate(audio_data_buffer)
                                        if len(audio_data_buffer) > 0
                                        else np.array([], dtype=np.int16)
                                    )
                                    prefill_ok = True
                                    if len(existing_audio) > 0:
                                        if not has_voice_buffer:
                                            logger.info(
                                                "DUPLEX尾包过短但本轮已检测到有效语音，仍执行末尾预填并触发生成: "
                                                f"buffer_duration={buffer_duration:.1f}ms, min={self.min_valid_tail_ms}ms"
                                            )
                                        prefill_ok = await self.model_prefill(existing_audio, last_chunk=True)
                                    else:
                                        logger.info("DUPLEX无尾包但本轮已检测到有效语音，直接触发生成")

                                    if prefill_ok:
                                        self.discard_audio_before_ts = time.time()
                                        self._schedule_model_generate("DUPLEX检测到语音结束触发生成")
                                    else:
                                        logger.warning("DUPLEX尾包预填失败，跳过本次生成触发")

                                # 清空本轮输入缓存，防止静音继续触发旧数据
                                audio_buffer.clear()
                                buffer_duration = 0
                                audio_data_buffer = []
                                duplex_detected_voice_this_turn = False
                else:
                    # 没有音频数据时，短暂休眠
                    logger.debug("未收集到音频数据，继续等待...")
                    await asyncio.sleep(0.1)

                # 4. 控制循环频率（使用异步 sleep，不阻塞事件循环）
                elapsed = time.time() - start_time
                sleep_time = max(0, 0.1 - elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

            except Exception as e:
                logger.error(f"音频处理错误: {str(e)}")
                continue
        await self.model_cpm.streaming_stop(session_id=self.session_id)
        logger.info(f"omniStream结束")


    async def model_prefill(self, audio_data: np.ndarray, last_chunk: bool = False):
        """
        模型预填
        """
        try:
            if audio_data is None or len(audio_data) == 0:
                logger.info("收到空音频，跳过模型预填")
                return False
            start = time.time()
            await self.model_cpm.model_prefill(
                self.session_id,
                audio_data=audio_data,
                last_chunk=last_chunk
            )
            logger.info(
                f"模型预填完成: last_chunk={last_chunk}, samples={len(audio_data)}, elapsed={(time.time() - start) * 1000:.1f}ms"
            )
            return True
        except Exception as e:
            logger.error(f"调用 model_prefill 失败: {e}")
            return False



    def vad(self, audio_buffer: deque):
        """
        音频vad检测
        """
        start_time = time.time()
        
        # 数据转换阶段
        buffer_array = np.array(list(audio_buffer))
        buffer_bytes = buffer_array.tobytes()
        # VAD 处理阶段（最耗时）
        dur_vad, _, _ = vad_utils.run_vad(
            buffer_bytes, self.WEBRTC_SAMPLE_RATE, self.vad_options)
        
        # 总耗时
        total_time = time.time() - start_time
        # 性能监控日志
        # 性能警告
        if total_time > 0.1:  # 超过100ms
            logger.info(f"VAD处理耗时过长: {total_time*1000:.2f}ms")
        
        if dur_vad >= 0.2:
            self.vad_time = time.time()
            
        if dur_vad > 0.4:
            self.vad_stream_started = True
        elif dur_vad < 0.2:
            if self.vad_stream_started:
                if (time.time() - self.vad_time >= self.duplex_silence_hold_sec):
                    self.vad_stream_started = False
                    return False
        return True

    def vad_dual_detection(self, audio_buffer):
        """
        双重VAD检测方法
        1. 对1秒音频进行完整VAD检测
        2. 对最后0.2秒音频进行额外VAD检测
        
        Args:
            audio_buffer: 1秒音频缓冲区
            
        Returns:
            tuple: (full_vad_result, tail_vad_result)
                - full_vad_result: 1秒音频的VAD检测结果 (bool)
                - tail_vad_result: 最后0.2秒音频的VAD检测结果 (bool)
        """
        # 在线程池中执行时，contextvars 不会自动传播，需要手动设置追踪上下文
        set_request_trace(
            request_id=self.session_id[:8] if self.session_id else None,
            session_id=self.session_id
        )
        start_time = time.time()
        
        # 数据转换阶段
        buffer_array = np.array(list(audio_buffer))
        buffer_bytes = buffer_array.tobytes()
        
        # 1. 完整1秒音频的VAD检测
        dur_vad_full, _, _ = vad_utils.run_vad(
            buffer_bytes, self.WEBRTC_SAMPLE_RATE, self.vad_options)
        
        # 2. 提取最后0.秒音频
        # 计算最后0.秒对应的样本数
        tail_samples = int(self.dur_vad_time * self.WEBRTC_SAMPLE_RATE)  # 0.2秒 * 48000Hz = 9600个样本
        tail_audio = buffer_array[-tail_samples:]  # 取最后9600个样本
        # 再补充剩下的空白音频
        silence_samples = int((1- self.dur_vad_time) * self.WEBRTC_SAMPLE_RATE)  # 0.8秒 * 48000Hz = 38400个样本
        silence_audio = np.zeros(silence_samples, dtype=np.int16)  # 静音数据
        tail_audio = np.concatenate([tail_audio, silence_audio])
        tail_bytes = tail_audio.tobytes()
        
        # 3. 最后0.2秒音频的VAD检测
        dur_vad_tail, _, _ = vad_utils.run_vad(
            tail_bytes, self.WEBRTC_SAMPLE_RATE, self.vad_options)
        
        # 总耗时
        total_time = time.time() - start_time
        
        # 性能监控
        if total_time > 0.1:  # 超过200ms
            logger.info(f"双重VAD处理耗时过长: {total_time*1000:.2f}ms")
        
        # 4. 判断逻辑
        # 完整1秒音频的VAD检测结果（默认无语音，避免静音被误判为可生成输入）
        full_vad_result = self.vad_stream_started
        if dur_vad_full >= self.dur_vad_threshold:
            self.vad_time = time.time()

        if dur_vad_full > self.dur_vad_time:
            self.vad_stream_started = True
            full_vad_result = True
        elif self.vad_stream_started and dur_vad_full < self.dur_vad_threshold:
            # 进入静音段后，满足最小时长才认定语音结束，避免句中短停顿误切轮
            if (time.time() - self.vad_time) >= self.duplex_silence_hold_sec:
                self.vad_stream_started = False
                full_vad_result = False
            else:
                full_vad_result = True
        logger.info(f"dur_vad_full: {dur_vad_full}, dur_vad_tail: {dur_vad_tail}")
        # 最后0.2秒音频的VAD检测结果
        tail_vad_result = True
        if self.vad_stream_started:
            #这里连续两次小于0.1才返回可以抢跑,减小误判几率
            if dur_vad_tail < self.dur_vad_threshold:
                if self.vad_race_prepare:
                    tail_vad_result = False
                    self.vad_race_prepare = False
                else:
                    self.vad_race_prepare = True
        else:
            self.vad_race_prepare = False
        
        return full_vad_result, tail_vad_result, dur_vad_full
    

    async def vad_race_decode(self):
        """
        抢跑模型预解码
        """
        try:
            logger.info(f"抢跑模型预解码启动")
            await self.text_output_queue.put(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')} - <state><vad_end>")
            # if self.vad_race_flag.is_set():
            #     logger.info(f"抢跑模型预解码已启动,忽略本次抢跑")
            #     return
            generator = self.model_cpm.streaming_generate(session_id=self.session_id)
            async for chunk in generator:
                logger.info(f"抢跑收到流式数据: {chunk}")
                if not self.vad_race_flag.is_set():
                    logger.info(f"抢跑失败,丢失抢跑数据")
                    break
                # 解析流式数据中的文本内容
                text_content = chunk['content']
                if text_content:
                    # 将文本内容放入队列
                    await self.text_output_queue.put(text_content)
                
                if chunk.get('type') == 'done':
                    break
        except Exception as e:
            logger.error(f"模型生成错误: {str(e)}")
        finally:
            self.vad_race_task = None  # 清理任务引用
            logger.info(f"抢跑模型预解码结束")

    async def stop_vad_race_encode(self):
        """
        停止抢跑模型预解码
        """ 
        logger.info(f"抢跑失败,停止模型预解码")
        # todo 通知模型侧抢跑失败
        # 清空抢跑队列中的数据
        while not self.vad_race_audio_queue.empty():
            try:
                self.vad_race_audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        while not self.vad_race_text_queue.empty():
            try:
                self.vad_race_text_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    def process_audio_chunk(self, audio_data, input_rate, output_rate, chunk_size):
        try:
            resampled_data = resample_poly(
                audio_data, output_rate, input_rate, padtype='line')
            resampled_data = np.clip(
                resampled_data, -32768, 32767).astype(np.int16)
            total_chunks = len(resampled_data) // chunk_size
            chunks = []
            for i in range(total_chunks):
                start_idx = i * chunk_size
                end_idx = start_idx + chunk_size
                chunk = resampled_data[start_idx:end_idx]
                chunks.append(chunk)
            return chunks
        except Exception as e:
            print(f"音频处理错误: {str(e)}")
            return []
