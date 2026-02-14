/**
 * Timeline 时间轴组件
 * 用于控制录像回放：播放/暂停、拖动进度、调整速度
 */

import { useState, useEffect, useRef, useCallback } from 'react';

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
}

/** 播放速度选项 */
const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

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
}: TimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const formatLabel = formatTimeProp ?? formatTime;
  
  // 内部时间状态，用于平滑播放
  const [internalTime, setInternalTime] = useState(currentTime);
  
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

  // 处理进度条点击/拖动
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = minTime + percentage * (maxTime - minTime);
    setInternalTime(newTime);
    internalTimeRef.current = newTime;
  }, [disabled, minTime, maxTime]);

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
      if (!progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const newTime = minTime + percentage * (maxTime - minTime);
      setInternalTime(newTime);
      internalTimeRef.current = newTime;
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
  }, [isDragging, minTime, maxTime, onTimeChange, internalTime]);

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      
      // 避免在输入框中触发
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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

  return (
    <div className="bg-dota-surface rounded-lg p-4">
      {/* 进度条 */}
      <div
        ref={progressRef}
        className={`relative h-3 bg-gray-700 rounded-full cursor-pointer mb-4 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        {/* 已播放进度 */}
        <div
          className="absolute top-0 left-0 h-full bg-dota-accent rounded-full"
          style={{ width: `${progress}%` }}
        />
        
        {/* 拖动手柄 */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transform -translate-x-1/2 ${
            isDragging ? 'scale-125' : 'hover:scale-110'
          }`}
          style={{ left: `${progress}%` }}
        />

        {/* 加载指示器 */}
        {isLoading && (
          <div className="absolute inset-0 bg-blue-500/30 rounded-full animate-pulse" />
        )}
      </div>

      {/* 控制区域 */}
      <div className="flex items-center justify-between">
        {/* 左侧：播放控制 */}
        <div className="flex items-center gap-2">
          {/* 停止按钮 */}
          <button
            onClick={stop}
            disabled={disabled}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="停止 (Home)"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <rect x="4" y="4" width="12" height="12" rx="1" />
            </svg>
          </button>

          {/* 后退 10 秒 */}
          <button
            onClick={skipBackward}
            disabled={disabled}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="后退 10 秒"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
            </svg>
          </button>

          {/* 播放/暂停按钮 */}
          <button
            onClick={togglePlay}
            disabled={disabled}
            className="p-3 bg-dota-accent hover:bg-red-600 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* 前进 10 秒 */}
          <button
            onClick={skipForward}
            disabled={disabled}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="前进 10 秒"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
            </svg>
          </button>
        </div>

        {/* 中间：时间显示 */}
        {showTimeDisplay && (
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="text-white min-w-[60px] text-right">
              {formatLabel(displayTime)}
            </span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400 min-w-[60px]">
              {formatLabel(maxTime)}
            </span>
          </div>
        )}

        {/* 右侧：速度控制 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">速度:</span>
          <div className="flex gap-1">
            {SPEED_OPTIONS.map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                disabled={disabled}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-dota-accent text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="mt-3 text-xs text-gray-500 flex gap-4 justify-center">
        <span>空格: 播放/暂停</span>
        <span>← →: ±5秒</span>
        <span>↑ ↓: 调整速度</span>
      </div>
    </div>
  );
}

export default Timeline;
