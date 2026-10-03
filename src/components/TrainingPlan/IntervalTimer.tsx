import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Timer, Bell } from 'lucide-react';

interface Props {
  defaultSeconds?: number;
  initialLabel?: string;
}

export function IntervalTimer({ defaultSeconds = 30, initialLabel = 'Pause' }: Props) {
  const [targetSeconds, setTargetSeconds] = useState(defaultSeconds);
  const [timeLeft, setTimeLeft] = useState(defaultSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [elapsedTime, setElapsedTime] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setTargetSeconds(defaultSeconds);
    setTimeLeft(defaultSeconds);
    setIsRunning(false);
  }, [defaultSeconds]);

  const playBeep = (freq = 880, type: OscillatorType = 'sine', duration = 0.15) => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio not permitted or not supported
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRunning) {
      interval = setInterval(() => {
        if (mode === 'countdown') {
          setTimeLeft(prev => {
            if (prev <= 1) {
              // Beep on finish!
              playBeep(1200, 'triangle', 0.4);
              setTimeout(() => playBeep(1600, 'triangle', 0.5), 150);
              setIsRunning(false);
              return 0;
            }
            if (prev <= 4 && prev > 1) {
              // 3, 2, 1 warning beeps
              playBeep(660, 'sine', 0.08);
            }
            return prev - 1;
          });
        } else {
          setElapsedTime(prev => prev + 1);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, mode, soundEnabled]);

  const toggleRun = () => {
    if (!isRunning && timeLeft === 0 && mode === 'countdown') {
      setTimeLeft(targetSeconds);
    }
    setIsRunning(!isRunning);
  };

  const reset = () => {
    setIsRunning(false);
    setTimeLeft(targetSeconds);
    setElapsedTime(0);
  };

  const selectPreset = (secs: number) => {
    setTargetSeconds(secs);
    setTimeLeft(secs);
    setIsRunning(false);
    setMode('countdown');
  };

  const formatDisplay = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-800">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-300">
          <Timer size={16} className="text-blue-400" />
          <span>Beckenrand-Timer ({initialLabel})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title={soundEnabled ? 'Ton ausschalten' : 'Ton einschalten'}
          >
            {soundEnabled ? <Volume2 size={16} className="text-blue-400" /> : <VolumeX size={16} />}
          </button>

          <div className="flex bg-slate-800 p-0.5 rounded-lg text-[11px] font-semibold">
            <button
              onClick={() => { setMode('countdown'); setIsRunning(false); }}
              className={`px-2 py-1 rounded-md transition-colors ${mode === 'countdown' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
            >
              Countdown
            </button>
            <button
              onClick={() => { setMode('stopwatch'); setIsRunning(false); }}
              className={`px-2 py-1 rounded-md transition-colors ${mode === 'stopwatch' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
            >
              Stoppuhr
            </button>
          </div>
        </div>
      </div>

      {/* Main Big Time Display */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-4xl sm:text-5xl font-black tracking-tight ${
            mode === 'countdown' && timeLeft <= 3 && isRunning ? 'text-amber-400 animate-pulse' : 'text-white'
          }`}>
            {formatDisplay(mode === 'countdown' ? timeLeft : elapsedTime)}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            {mode === 'countdown' ? (timeLeft === 0 ? 'Abgang!' : 'Pause') : 'Laufzeit'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="p-3 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            title="Zurücksetzen"
          >
            <RotateCcw size={18} />
          </button>
          <button
            onClick={toggleRun}
            className={`flex items-center gap-1.5 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-md ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isRunning ? <Pause size={18} /> : <Play size={18} />}
            <span>{isRunning ? 'Pause' : 'Start'}</span>
          </button>
        </div>
      </div>

      {/* Quick Interval Presets */}
      {mode === 'countdown' && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Intervall:</span>
          {[15, 20, 30, 45, 60, 70, 90, 100].map(s => (
            <button
              key={s}
              onClick={() => selectPreset(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                targetSeconds === s
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
