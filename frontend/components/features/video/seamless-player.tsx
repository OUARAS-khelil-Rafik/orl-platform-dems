'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipForward,
  SkipBack,
} from 'lucide-react';

type Part = {
  secureUrl: string;
  duration?: number;
};

type ProgressPayload = {
  currentTime: number;
  duration: number;
  completed: boolean;
};

type SeamlessPlayerProps = {
  url: string;
  parts?: Part[];
  totalDuration?: number;
  initialTime?: number;
  onProgress?: (payload: ProgressPayload) => void;
};

export default function SeamlessPlayer({
  url,
  parts,
  totalDuration,
  initialTime = 0,
  onProgress,
}: SeamlessPlayerProps) {
  const sources: Array<{ secureUrl: string; duration: number }> = useMemo(() => {
    const normalizedParts = Array.isArray(parts)
      ? parts
          .map((part) => ({
            secureUrl: String(part?.secureUrl || '').trim(),
            duration: Math.max(0, Number(part?.duration || 0)),
          }))
          .filter((part) => part.secureUrl)
      : [];

    if (normalizedParts.length > 0) {
      return normalizedParts;
    }

    return [
      {
        secureUrl: String(url || '').trim(),
        duration: Math.max(0, Number(totalDuration || 0)),
      },
    ].filter((part) => part.secureUrl);
  }, [parts, totalDuration, url]);

  const offsets = useMemo(() => {
    const arr: number[] = [0];
    for (let i = 0; i < sources.length; i += 1) {
      arr.push(arr[i] + sources[i].duration);
    }
    return arr;
  }, [sources]);

  const fallbackTotalDuration = Math.max(0, Number(totalDuration || 0));
  const computedTotalDuration = useMemo(() => {
    const sum = offsets[offsets.length - 1] || 0;
    return Math.max(sum, fallbackTotalDuration, 1);
  }, [offsets, fallbackTotalDuration]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const initialSeekPendingRef = useRef(Math.max(0, initialTime));

  const [partIndex, setPartIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [seeking, setSeeking] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const partForTime = useCallback(
    (t: number) => {
      for (let i = sources.length - 1; i >= 0; i -= 1) {
        if (t >= offsets[i]) {
          return i;
        }
      }
      return 0;
    },
    [offsets, sources.length],
  );

  const emitProgress = useCallback(
    (nextCurrentTime: number, total: number) => {
      const normalizedTotal = Math.max(total, 1);
      onProgress?.({
        currentTime: nextCurrentTime,
        duration: normalizedTotal,
        completed: normalizedTotal > 0 && nextCurrentTime / normalizedTotal >= 0.98,
      });
    },
    [onProgress],
  );

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    hideControlsTimer.current = setTimeout(() => {
      if (playing) {
        setShowControls(false);
      }
    }, 3000);
  }, [playing]);

  useEffect(() => {
    initialSeekPendingRef.current = Math.max(0, initialTime);
  }, [initialTime]);

  useEffect(() => {
    const nextIdx = partIndex + 1;
    if (nextIdx < sources.length && nextVideoRef.current) {
      nextVideoRef.current.src = sources[nextIdx].secureUrl;
      nextVideoRef.current.load();
    }
  }, [partIndex, sources]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || sources.length === 0) {
      return;
    }

    const src = sources[partIndex].secureUrl;
    if (vid.src !== src) {
      vid.src = src;
      vid.load();
    }
  }, [partIndex, sources]);

  useEffect(() => {
    if (sources.length === 0) {
      return;
    }

    const initial = clamp(initialSeekPendingRef.current, 0, computedTotalDuration);
    const targetPart = partForTime(initial);

    setPartIndex(targetPart);
    setCurrentTime(initial);
    emitProgress(initial, computedTotalDuration);
  }, [computedTotalDuration, emitProgress, partForTime, sources.length]);

  const seekToUnifiedTime = useCallback(
    (targetTime: number) => {
      const target = clamp(targetTime, 0, computedTotalDuration);
      const targetPart = partForTime(target);
      const localTime = Math.max(0, target - offsets[targetPart]);

      setSeeking(true);

      const finalizeSeek = () => {
        const vid = videoRef.current;
        if (!vid) {
          setSeeking(false);
          return;
        }

        vid.currentTime = localTime;
        if (playing) {
          vid.play().catch(() => undefined);
        }

        setCurrentTime(target);
        emitProgress(target, computedTotalDuration);
        setSeeking(false);
      };

      if (targetPart !== partIndex) {
        setPartIndex(targetPart);
        requestAnimationFrame(finalizeSeek);
      } else {
        finalizeSeek();
      }

      resetHideTimer();
    },
    [computedTotalDuration, emitProgress, offsets, partForTime, partIndex, playing, resetHideTimer],
  );

  const handleTimeUpdate = useCallback(() => {
    if (seeking || transitioning) {
      return;
    }

    const vid = videoRef.current;
    if (!vid) {
      return;
    }

    const unified = offsets[partIndex] + vid.currentTime;
    setCurrentTime(unified);
    emitProgress(unified, computedTotalDuration);

    if (vid.buffered.length > 0) {
      const bufEnd = vid.buffered.end(vid.buffered.length - 1);
      setBuffered(offsets[partIndex] + bufEnd);
    }
  }, [computedTotalDuration, emitProgress, offsets, partIndex, seeking, transitioning]);

  const handleEnded = useCallback(() => {
    if (partIndex < sources.length - 1) {
      setTransitioning(true);
      const nextIdx = partIndex + 1;
      setPartIndex(nextIdx);

      requestAnimationFrame(() => {
        const vid = videoRef.current;
        if (vid) {
          vid.currentTime = 0;
          vid.play().catch(() => undefined);
        }
        setTransitioning(false);
      });
      return;
    }

    setPlaying(false);
    setCurrentTime(computedTotalDuration);
    emitProgress(computedTotalDuration, computedTotalDuration);
  }, [computedTotalDuration, emitProgress, partIndex, sources.length]);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) {
      return;
    }

    if (playing) {
      vid.pause();
      setPlaying(false);
    } else {
      vid.play().catch(() => undefined);
      setPlaying(true);
    }

    resetHideTimer();
  }, [playing, resetHideTimer]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar) {
        return;
      }

      const rect = bar.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const targetTime = ratio * computedTotalDuration;
      seekToUnifiedTime(targetTime);
    },
    [computedTotalDuration, seekToUnifiedTime],
  );

  const skip = useCallback(
    (delta: number) => {
      seekToUnifiedTime(currentTime + delta);
    },
    [currentTime, seekToUnifiedTime],
  );

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);

    const vid = videoRef.current;
    if (vid) {
      vid.volume = v;
    }

    if (v > 0) {
      setMuted(false);
    }
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) {
      return;
    }

    setMuted((m) => {
      vid.muted = !m;
      return !m;
    });
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => undefined);
      return;
    }

    document.exitFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip, togglePlay]);

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, []);

  const progressPct = computedTotalDuration > 0 ? (currentTime / computedTotalDuration) * 100 : 0;
  const bufferedPct = computedTotalDuration > 0 ? (buffered / computedTotalDuration) * 100 : 0;

  if (sources.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-black w-full aspect-video group select-none"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        playsInline
        onClick={togglePlay}
      />

      <video ref={nextVideoRef} className="hidden" preload="auto" muted />

      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20"
          type="button"
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="w-8 h-8 text-black ml-1" />
          </div>
        </button>
      )}

      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-3 transition-opacity duration-300 ${
          showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          ref={progressRef}
          className="relative h-1 hover:h-2 transition-all cursor-pointer mb-3 group/bar"
          onClick={handleSeek}
        >
          <div className="absolute inset-0 bg-white/30 rounded-full" />
          <div
            className="absolute inset-y-0 left-0 bg-white/50 rounded-full"
            style={{ width: `${bufferedPct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-white text-sm">
          <div className="flex items-center space-x-3">
            <button onClick={togglePlay} className="hover:scale-110 transition-transform" type="button">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            <button onClick={() => skip(-10)} className="hover:scale-110 transition-transform" type="button">
              <SkipBack className="w-4 h-4" />
            </button>

            <button onClick={() => skip(10)} className="hover:scale-110 transition-transform" type="button">
              <SkipForward className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-1">
              <button onClick={toggleMute} className="hover:scale-110 transition-transform" type="button">
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-blue-500 cursor-pointer"
              />
            </div>

            <span className="tabular-nums">
              {formatTime(currentTime)} / {formatTime(computedTotalDuration)}
            </span>
          </div>

          <button onClick={toggleFullscreen} className="hover:scale-110 transition-transform" type="button">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
