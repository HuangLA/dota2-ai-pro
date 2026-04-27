/**
 * Timeline 时间轴组件
 * 用于控制录像回放：播放/暂停、拖动进度、调整速度
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { PauseCircle, PlayCircle, SkipBack, SkipForward, Square } from 'lucide-react';

interface PauseSegment {
  startSourceTime: number;
  endSourceTime: number;
}

export interface TimelineProps {
  /** 当前时间（秒） */
  currentTime: number;
  /** 最小时间（秒），通常是游戏数据开始时间 */
  minTime: number;
  /** 最大时间（秒），通常是比赛结束时间 */
  maxTime: number;
  /** 时间变化回调 */
  onTimeChange: (time: number) => void;
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 时间显示格式化 */
  formatTime?: (seconds: number) => string;
  /** 是否显示中间时间（当前/总时长） */
  showTimeDisplay?: boolean;
  /** 暂停区间（source/replay time） */
  pauseSegments?: PauseSegment[];
  /** 指定时间是否处于暂停中 */
  isPausedAtTime?: (time: number) => boolean;
}

/** 播放速度选项 */
const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

function shouldIgnoreHotkeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    tagName === 'BUTTON'
  );
}

/** 格式化时间为 MM:SS 格式 */
function formatTime(seconds: number): string {
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const mins = Math.floor(absSeconds / 60);
  const secs = Math.floor(absSeconds % 60);
  const sign = isNegative ? '-' : '';
  return `${sign}${mins}:${secs.toString().padStart(2, '0')}`;
}

export function Timeline({
  currentTime,
  minTime,
  maxTime,
  onTimeChange,
  isLoading = false,
  disabled = false,
  formatTime: formatTimeProp,
  showTimeDisplay = true,
  pauseSegments = [],
  isPausedAtTime,
}: TimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const formatLabel = formatTimeProp ?? formatTime;
  
  // 内部时间状态，用于平滑播放
  const [internalTime, setInternalTime] = useState(currentTime);
  const [hoverPreview, setHoverPreview] = useState<{ time: number; x: number } | null>(null);
  
   const progressRef = useRef<HTMLDivElement>(null);
   const animationRef = useRef<number | null>(null);
   const lastUpdateRef = useRef<number>(0);
   
   // 用于在动画循环中同步最新时间（解决 skip 按钮在播放时无效的问题）
   const internalTimeRef = useRef(currentTime);
  
   // 同步外部时间到内部（仅当不在播放且不在拖动时）
   useEffect(() => {
     if (!isPlaying && !isDragging) {
       setInternalTime(currentTime);
       internalTimeRef.current = currentTime;
     }
   }, [currentTime, isPlaying, isDragging]);

  // 计算进度百分比
  const displayTime = isPlaying || isDragging ? internalTime : currentTime;
  const progress = maxTime > minTime 
    ? ((displayTime - minTime) / (maxTime - minTime)) * 100 
    : 0;

  // 播放逻辑 - 使用内部时间状态避免依赖 currentTime
  useEffect(() => {
    if (!isPlaying || disabled) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

     lastUpdateRef.current = performance.now();
     let lastCallbackTime = 0; // 上次回调时间
     const CALLBACK_INTERVAL = 50; // 回调间隔（毫秒），约 20fps 的更新频率

     const animate = (timestamp: number) => {
       const deltaTime = (timestamp - lastUpdateRef.current) / 1000;
       lastUpdateRef.current = timestamp;

       // 从 ref 读取最新时间（skip 按钮会更新 ref），然后累加 delta
       const localTime = internalTimeRef.current + deltaTime * playbackSpeed;
       
       if (localTime >= maxTime) {
         setInternalTime(maxTime);
         internalTimeRef.current = maxTime;
         onTimeChange(maxTime);
         setIsPlaying(false);
       } else {
         setInternalTime(localTime);
         internalTimeRef.current = localTime;
         // 节流回调：每 CALLBACK_INTERVAL 毫秒回调一次，支持平滑动画
         if (timestamp - lastCallbackTime >= CALLBACK_INTERVAL) {
           onTimeChange(localTime);
           lastCallbackTime = timestamp;
         }
         animationRef.current = requestAnimationFrame(animate);
       }
     };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, disabled, maxTime]); // 移除 currentTime 和 internalTime 依赖

  const resolveTimeFromClientX = useCallback((clientX: number): { time: number; x: number } | null => {
    if (!progressRef.current || maxTime <= minTime) {
      return null;
    }
    const rect = progressRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = minTime + percentage * (maxTime - minTime);
    return { time, x };
  }, [maxTime, minTime]);

  // 处理进度条点击/拖动
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;

    const resolved = resolveTimeFromClientX(e.clientX);
    if (!resolved) {
      return;
    }

    const newTime = resolved.time;
    setInternalTime(newTime);
    internalTimeRef.current = newTime;
  }, [disabled, resolveTimeFromClientX]);

  const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const resolved = resolveTimeFromClientX(e.clientX);
    if (!resolved) {
      setHoverPreview(null);
      return;
    }
    setHoverPreview(resolved);
  }, [resolveTimeFromClientX]);

  const handleProgressMouseLeave = useCallback(() => {
    setHoverPreview(null);
  }, []);

  // 拖动处理
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    setIsDragging(true);
    // 拖动开始时暂停播放
    if (isPlaying) {
      setIsPlaying(false);
    }
    handleProgressClick(e);
  }, [disabled, isPlaying, handleProgressClick]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const resolved = resolveTimeFromClientX(e.clientX);
      if (!resolved) return;
      const newTime = resolved.time;
      setInternalTime(newTime);
      internalTimeRef.current = newTime;
      setHoverPreview(resolved);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // 拖动结束时才通知父组件
      onTimeChange(internalTimeRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onTimeChange, resolveTimeFromClientX]);

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      
      // 避免在表单控件和可编辑区域中触发
      if (shouldIgnoreHotkeys(e.target)) {
        return;
      }
      
      switch (e.key) {
         case ' ': // 空格键 - 播放/暂停
           e.preventDefault();
           if (internalTime >= maxTime) {
             setInternalTime(minTime);
             internalTimeRef.current = minTime;
             onTimeChange(minTime);
           }
           setIsPlaying(prev => !prev);
           break;
         case 'ArrowLeft': // 左箭头 - 后退 5 秒
           e.preventDefault();
           {
             const newTime = Math.max(minTime, internalTime - 5);
             setInternalTime(newTime);
             internalTimeRef.current = newTime;
             onTimeChange(newTime);
           }
           break;
         case 'ArrowRight': // 右箭头 - 前进 5 秒
           e.preventDefault();
           {
             const newTime = Math.min(maxTime, internalTime + 5);
             setInternalTime(newTime);
             internalTimeRef.current = newTime;
             onTimeChange(newTime);
           }
           break;
        case 'ArrowUp': // 上箭头 - 加速
          e.preventDefault();
          setPlaybackSpeed(prev => {
            const idx = SPEED_OPTIONS.indexOf(prev);
            return idx < SPEED_OPTIONS.length - 1 ? SPEED_OPTIONS[idx + 1] : prev;
          });
          break;
        case 'ArrowDown': // 下箭头 - 减速
          e.preventDefault();
          setPlaybackSpeed(prev => {
            const idx = SPEED_OPTIONS.indexOf(prev);
            return idx > 0 ? SPEED_OPTIONS[idx - 1] : prev;
          });
          break;
         case 'Home': // Home 键 - 跳到开始
           e.preventDefault();
           setInternalTime(minTime);
           internalTimeRef.current = minTime;
           onTimeChange(minTime);
           break;
         case 'End': // End 键 - 跳到结束
           e.preventDefault();
           setInternalTime(maxTime);
           internalTimeRef.current = maxTime;
           onTimeChange(maxTime);
           break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, internalTime, minTime, maxTime, onTimeChange]);

   // 播放/暂停按钮
   const togglePlay = () => {
     if (disabled) return;
     
     // 如果已经到达结尾，重新开始
     if (internalTime >= maxTime) {
       setInternalTime(minTime);
       internalTimeRef.current = minTime;
       onTimeChange(minTime);
     }
     setIsPlaying(prev => !prev);
   };

   // 停止播放
   const stop = () => {
     setIsPlaying(false);
     setInternalTime(minTime);
     internalTimeRef.current = minTime;
     onTimeChange(minTime);
   };

   // 跳转按钮
   const skipBackward = () => {
     if (disabled) return;
     const newTime = Math.max(minTime, internalTime - 10);
     setInternalTime(newTime);
     internalTimeRef.current = newTime;
     onTimeChange(newTime);
   };

  const skipForward = () => {
     if (disabled) return;
     const newTime = Math.min(maxTime, internalTime + 10);
     setInternalTime(newTime);
     internalTimeRef.current = newTime;
    onTimeChange(newTime);
  };

  const normalizedPauseSegments = pauseSegments
    .filter((segment) => segment.endSourceTime > segment.startSourceTime)
    .map((segment) => {
      const clampedStart = Math.max(minTime, Math.min(maxTime, segment.startSourceTime));
      const clampedEnd = Math.max(minTime, Math.min(maxTime, segment.endSourceTime));
      return {
        start: clampedStart,
        end: clampedEnd,
      };
    })
    .filter((segment) => segment.end > segment.start);

  const hoverPreviewLabel = hoverPreview ? formatLabel(hoverPreview.time) : '';
  const hoverIsPaused = hoverPreview
    ? (isPausedAtTime
      ? isPausedAtTime(hoverPreview.time)
      : normalizedPauseSegments.some(
        (segment) => hoverPreview.time >= segment.start && hoverPreview.time < segment.end
      ))
    : false;


  return (
    <div className="replay-timeline">
      <div className="replay-timeline-inline">
        <div className="replay-timeline-control-cluster">
          <button
            onClick={stop}
            disabled={disabled}
            className="replay-timeline-icon-button"
            title="停止 (Home)"
            aria-label="停止"
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
          </button>

          <button
            onClick={skipBackward}
            disabled={disabled}
            className="replay-timeline-icon-button"
            title="后退 10 秒"
            aria-label="后退 10 秒"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={togglePlay}
            disabled={disabled}
            className="replay-timeline-play-button"
            title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <PauseCircle className="h-5 w-5" />
            ) : (
              <PlayCircle className="h-5 w-5" />
            )}
          </button>

          <button
            onClick={skipForward}
            disabled={disabled}
            className="replay-timeline-icon-button"
            title="前进 10 秒"
            aria-label="前进 10 秒"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        {showTimeDisplay && (
          <div className="replay-timeline-time">
            <span>{formatLabel(displayTime)}</span>
            <span>/</span>
            <span>{formatLabel(maxTime)}</span>
          </div>
        )}

        <div
          ref={progressRef}
          className={`replay-timeline-track ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          {normalizedPauseSegments.map((segment, index) => {
            const startPercent = ((segment.start - minTime) / (maxTime - minTime)) * 100;
            const widthPercent = ((segment.end - segment.start) / (maxTime - minTime)) * 100;
            return (
              <div
                key={`${segment.start}-${segment.end}-${index}`}
                className="absolute top-0 h-full bg-amber-500/45"
                style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
              />
            );
          })}

          <div
            className="absolute left-0 top-0 h-full rounded-full bg-dota-primary"
            style={{ width: `${progress}%` }}
          />

          {hoverPreview && (
            <div
              className="replay-timeline-tooltip"
              style={{ left: `${Math.max(20, Math.min(hoverPreview.x, (progressRef.current?.clientWidth ?? 0) - 20))}px` }}
            >
              <div className="font-mono tabular-nums whitespace-nowrap">{hoverPreviewLabel}</div>
              <div className={`whitespace-nowrap ${hoverIsPaused ? 'text-amber-300' : 'text-slate-300'}`}>
                {hoverIsPaused ? '暂停中' : '进行中'}
              </div>
            </div>
          )}

          <div
            className={`replay-timeline-thumb ${
              isDragging ? 'scale-125' : 'hover:scale-110'
            }`}
            style={{ left: `${progress}%` }}
          />

          {isLoading && (
            <div className="absolute inset-0 animate-pulse rounded-full bg-blue-500/30" />
          )}
        </div>

        <div className="replay-speed-segment" aria-label="播放速度">
          {SPEED_OPTIONS.map(speed => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              disabled={disabled}
              className={`replay-speed-button ${
                playbackSpeed === speed
                  ? 'replay-speed-button-active'
                  : ''
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {normalizedPauseSegments.length > 0 && (
        <span className="sr-only">橙色区段表示暂停区间</span>
      )}
    </div>
  );
}

export default Timeline;
