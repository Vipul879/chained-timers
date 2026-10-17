import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, Plus, Trash2, Clock, Volume2, ChevronDown, ChevronUp } from 'lucide-react';

// Utility to format seconds into HH:MM:SS
const formatTime = (totalSeconds) => {
  const h = Math.floor(Math.max(0, totalSeconds) / 3600).toString().padStart(2, '0');
  const m = Math.floor((Math.max(0, totalSeconds) % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(Math.max(0, totalSeconds) % 60).toString().padStart(2, '0');
  return { h, m, s };
};

// Global audio context singleton for playing the chime
let audioCtx = null;

// Pre-load voices for some browsers to ensure they are available
let availableVoices = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const updateVoices = () => {
    availableVoices = window.speechSynthesis.getVoices();
  };
  updateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }
}

const playRingAndSpeak = (text) => {
  try {
    // Initialize AudioContext on first user interaction
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Create a pleasant "ding" sound
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A5
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3); // Drop to A4 quickly
    
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.8);

    // After the ring, use text-to-speech to read the timer name
    setTimeout(() => {
      if ('speechSynthesis' in window && text) {
        // Cancel any ongoing speech to avoid overlap
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95; // Slightly slower for clear pronunciation
        utterance.pitch = 0.4; // Force lower pitch to sound more male/deep
        utterance.volume = 1.0; 
        
        // Attempt to find a male voice based on common system names
        const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
        const maleVoice = voices.find(v => 
          v.name.toLowerCase().includes('male') || 
          v.name.toLowerCase().includes('david') || 
          v.name.toLowerCase().includes('mark') ||
          v.name.toLowerCase().includes('alex') ||
          v.name.toLowerCase().includes('guy') ||
          v.name.toLowerCase().includes('matthew') ||
          v.name.toLowerCase().includes('daniel') ||
          v.name.toLowerCase().includes('brian') ||
          v.name.toLowerCase().includes('arthur')
        );
        
        if (maleVoice) {
          utterance.voice = maleVoice;
        } else {
          // Fallback to the first available English voice
          const enVoice = voices.find(v => v.lang.startsWith('en'));
          if (enVoice) utterance.voice = enVoice;
        }

        window.speechSynthesis.speak(utterance);
      }
    }, 800); // Wait for the chime to finish before speaking

  } catch (error) {
    console.error("Audio playback failed:", error);
  }
};

export default function ChainedTimersApp() {
  // State for the configuration of sequences and their timers
  const [sequences, setSequences] = useState([
    {
      id: 'seq-1',
      name: 'Morning Routine',
      timers: [
        { id: 't-1', name: 'Make Bed', duration: 120 },
        { id: 't-2', name: 'Brush Teeth', duration: 180 },
        { id: 't-3', name: 'Read a Book', duration: 900 }
      ]
    }
  ]);

  // State for the currently running timer
  const [activeRun, setActiveRun] = useState({
    seqId: null,
    timerIndex: null,
    status: 'idle', // 'idle', 'running', 'paused'
    remaining: 0
  });

  // State to track history (which timers are done or skipped)
  // Format: { [seqId]: { [timerIndex]: 'done' | 'skipped' } }
  const [history, setHistory] = useState({});

  const activeRunRef = useRef(activeRun);
  activeRunRef.current = activeRun;

  const sequencesRef = useRef(sequences);
  sequencesRef.current = sequences;

  // The main interval that ticks down the active timer
  useEffect(() => {
    let lastTick = Date.now();
    
    const interval = setInterval(() => {
      const run = activeRunRef.current;
      
      if (run.status !== 'running') {
        lastTick = Date.now();
        return;
      }
      
      const now = Date.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;

      if (run.remaining - delta <= 0) {
        handleTimerComplete(run);
      } else {
        setActiveRun(prev => ({ ...prev, remaining: prev.remaining - delta }));
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const handleTimerComplete = (completedRun) => {
    const { seqId, timerIndex } = completedRun;
    
    // Mark current as done
    setHistory(prev => ({
      ...prev,
      [seqId]: {
        ...(prev[seqId] || {}),
        [timerIndex]: 'done'
      }
    }));

    const currentSeq = sequencesRef.current.find(s => s.id === seqId);
    const nextIndex = timerIndex + 1;

    // Check if there is a next timer in the current sequence
    if (currentSeq && nextIndex < currentSeq.timers.length) {
      const nextTimer = currentSeq.timers[nextIndex];
      // Automatically start the next timer
      setActiveRun({
        seqId,
        timerIndex: nextIndex,
        status: 'running',
        remaining: nextTimer.duration
      });
      // Play sound and announce the next timer
      playRingAndSpeak(nextTimer.name || `Timer ${nextIndex + 1}`);
    } else {
      // End of sequence
      setActiveRun({ seqId: null, timerIndex: null, status: 'idle', remaining: 0 });
      playRingAndSpeak("Sequence completed");
    }
  };

  const startTimer = (seqId, idx) => {
    const sequence = sequences.find(s => s.id === seqId);
    const timer = sequence.timers[idx];

    // If starting from the middle, mark previous timers as skipped
    const newHistoryForSeq = {};
    for (let i = 0; i < idx; i++) {
      newHistoryForSeq[i] = 'skipped';
    }
    
    setHistory(prev => ({
      ...prev,
      [seqId]: newHistoryForSeq // overwrites old history for this sequence
    }));

    setActiveRun({
      seqId,
      timerIndex: idx,
      status: 'running',
      remaining: timer.duration
    });

    playRingAndSpeak(timer.name || `Timer ${idx + 1}`);
  };

  const pauseTimer = () => {
    setActiveRun(prev => ({ ...prev, status: 'paused' }));
  };

  const resumeTimer = () => {
    setActiveRun(prev => ({ ...prev, status: 'running' }));
  };

  const stopTimer = () => {
    setActiveRun({ seqId: null, timerIndex: null, status: 'idle', remaining: 0 });
  };

  const addSequence = () => {
    const newSeq = {
      id: `seq-${Date.now()}`,
      name: `Sequence ${sequences.length + 1}`,
      timers: [{ id: `t-${Date.now()}`, name: 'New Timer', duration: 60 }]
    };
    setSequences([...sequences, newSeq]);
  };

  const deleteSequence = (seqId) => {
    if (activeRun.seqId === seqId) stopTimer();
    setSequences(sequences.filter(s => s.id !== seqId));
  };

  const updateSequenceName = (seqId, name) => {
    setSequences(sequences.map(s => s.id === seqId ? { ...s, name } : s));
  };

  const addTimer = (seqId) => {
    setSequences(sequences.map(s => {
      if (s.id === seqId) {
        return {
          ...s,
          timers: [...s.timers, { id: `t-${Date.now()}`, name: 'New Timer', duration: 60 }]
        };
      }
      return s;
    }));
  };

  const deleteTimer = (seqId, timerId) => {
    setSequences(sequences.map(s => {
      if (s.id === seqId) {
        return { ...s, timers: s.timers.filter(t => t.id !== timerId) };
      }
      return s;
    }));
  };

  const updateTimer = (seqId, timerId, field, value) => {
    setSequences(sequences.map(s => {
      if (s.id === seqId) {
        return {
          ...s,
          timers: s.timers.map(t => t.id === timerId ? { ...t, [field]: value } : t)
        };
      }
      return s;
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8 selection:bg-cyan-500/30">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Clock size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Chained Timers</h1>
              <p className="text-sm text-slate-400">Run multiple timers automatically in sequence.</p>
            </div>
          </div>
          
          <button 
            onClick={addSequence}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-cyan-900/20 active:scale-95"
          >
            <Plus size={18} />
            New Sequence
          </button>
        </header>

        {/* Sequences List */}
        <div className="space-y-8">
          {sequences.map((sequence, seqIdx) => (
            <SequenceCard
              key={sequence.id}
              sequence={sequence}
              seqIdx={seqIdx}
              activeRun={activeRun}
              history={history[sequence.id] || {}}
              onStart={startTimer}
              onPause={pauseTimer}
              onResume={resumeTimer}
              onStop={stopTimer}
              onUpdateName={(name) => updateSequenceName(sequence.id, name)}
              onAddTimer={() => addTimer(sequence.id)}
              onDeleteTimer={(tId) => deleteTimer(sequence.id, tId)}
              onUpdateTimer={(tId, field, val) => updateTimer(sequence.id, tId, field, val)}
              onDeleteSequence={() => deleteSequence(sequence.id)}
            />
          ))}
          
          {sequences.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500">
              <Clock size={48} className="mx-auto mb-4 opacity-20" />
              <p>No sequences found. Create one to get started!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SequenceCard({ 
  sequence, activeRun, history, onStart, onPause, onResume, onStop, 
  onUpdateName, onAddTimer, onDeleteTimer, onUpdateTimer, onDeleteSequence 
}) {
  const isSeqActive = activeRun.seqId === sequence.id;

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${isSeqActive ? 'bg-slate-900 border-cyan-500/50 shadow-2xl shadow-cyan-900/10' : 'bg-slate-900/50 border-slate-800'}`}>
      
      {/* Sequence Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <input
          type="text"
          value={sequence.name}
          onChange={(e) => onUpdateName(e.target.value)}
          className="bg-transparent text-xl font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 rounded px-2 py-1 -ml-2 w-full max-w-sm transition-all"
          placeholder="Sequence Name"
        />
        
        <div className="flex items-center gap-2">
           {isSeqActive && (
             <button 
               onClick={onStop}
               className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
               title="Stop Sequence"
             >
               <Square size={20} className="fill-current" />
             </button>
           )}
           <button 
             onClick={onDeleteSequence}
             className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
             title="Delete Sequence"
           >
             <Trash2 size={20} />
           </button>
        </div>
      </div>

      {/* Timers List */}
      <div className="p-5 space-y-3">
        {sequence.timers.map((timer, idx) => {
          const isTimerActive = isSeqActive && activeRun.timerIndex === idx;
          const status = isTimerActive ? activeRun.status : (history[idx] || 'idle');
          
          return (
            <TimerRow
              key={timer.id}
              timer={timer}
              status={status}
              isActive={isTimerActive}
              remaining={isTimerActive ? activeRun.remaining : timer.duration}
              onStart={() => onStart(sequence.id, idx)}
              onPause={onPause}
              onResume={onResume}
              onUpdate={(field, val) => onUpdateTimer(timer.id, field, val)}
              onDelete={() => onDeleteTimer(timer.id)}
              isDisabled={isSeqActive && !isTimerActive} // Disable editing other timers when sequence is running
            />
          );
        })}

        {/* Add Timer Button */}
        <button 
          onClick={onAddTimer}
          disabled={isSeqActive}
          className={`w-full py-3 mt-4 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 transition-all font-medium
            ${isSeqActive 
              ? 'border-slate-800 text-slate-600 cursor-not-allowed' 
              : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}
        >
          <Plus size={18} />
          Add Next Timer
        </button>
      </div>
    </div>
  );
}

function TimerRow({ timer, status, isActive, remaining, onStart, onPause, onResume, onUpdate, onDelete, isDisabled }) {
  // Determine visual style based on status
  let rowStyle = "bg-slate-800/50 border-slate-700/50";
  let statusIndicator = null;

  if (isActive) {
    rowStyle = "bg-cyan-900/20 border-cyan-500/50 shadow-lg scale-[1.01]";
  } else if (status === 'done') {
    rowStyle = "bg-slate-800/30 border-slate-800 opacity-60 grayscale-[50%]";
    statusIndicator = <span className="text-xs font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded">DONE</span>;
  } else if (status === 'skipped') {
    rowStyle = "bg-slate-800/30 border-slate-800 opacity-50";
    statusIndicator = <span className="text-xs font-bold text-slate-500 bg-slate-500/10 px-2 py-1 rounded">SKIPPED</span>;
  }

  const { h, m, s } = formatTime(remaining);
  const progressPercent = isActive ? ((timer.duration - remaining) / timer.duration) * 100 : (status === 'done' ? 100 : 0);

  // Handle time input changes
  const handleTimeChange = (type, val) => {
    const num = parseInt(val) || 0;
    const current = formatTime(timer.duration);
    let newTotal = timer.duration;

    if (type === 'h') newTotal = (num * 3600) + (parseInt(current.m) * 60) + parseInt(current.s);
    if (type === 'm') newTotal = (parseInt(current.h) * 3600) + (num * 60) + parseInt(current.s);
    if (type === 's') newTotal = (parseInt(current.h) * 3600) + (parseInt(current.m) * 60) + num;

    onUpdate('duration', newTotal);
  };

  return (
    <div className={`relative overflow-hidden flex flex-col md:flex-row items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${rowStyle}`}>
      
      {/* Background Progress Bar (Visible when active) */}
      {isActive && (
        <div 
          className="absolute left-0 top-0 bottom-0 bg-cyan-500/10 transition-all duration-100 ease-linear pointer-events-none"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      {/* Left side: Name & Status */}
      <div className="flex-1 w-full flex items-center gap-3 z-10">
        <input
          type="text"
          value={timer.name}
          onChange={(e) => onUpdate('name', e.target.value)}
          disabled={isDisabled || isActive || status === 'done' || status === 'skipped'}
          className="bg-transparent text-lg font-medium text-slate-200 placeholder-slate-600 focus:outline-none focus:border-b border-cyan-500 w-full px-1 py-0.5 disabled:opacity-100"
          placeholder="Timer Name"
        />
        {statusIndicator}
      </div>

      {/* Right side: Time Inputs & Controls */}
      <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-6 z-10">
        
        {/* Time Inputs/Display */}
        <div className="flex items-center gap-1.5 font-mono text-xl">
          {isActive || status === 'done' || status === 'skipped' ? (
            <span className={`px-2 py-1 tracking-wider ${isActive ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
              {h}:{m}:{s}
            </span>
          ) : (
            <>
              <TimeInput value={h} max={99} onChange={(v) => handleTimeChange('h', v)} disabled={isDisabled} />
              <span className="text-slate-600 mb-1">:</span>
              <TimeInput value={m} max={59} onChange={(v) => handleTimeChange('m', v)} disabled={isDisabled} />
              <span className="text-slate-600 mb-1">:</span>
              <TimeInput value={s} max={59} onChange={(v) => handleTimeChange('s', v)} disabled={isDisabled} />
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isActive ? (
            status === 'running' ? (
              <button onClick={onPause} className="p-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-full shadow-lg transition-transform active:scale-90">
                <Pause size={18} className="fill-current" />
              </button>
            ) : (
              <button onClick={onResume} className="p-2.5 bg-green-500 hover:bg-green-400 text-slate-900 rounded-full shadow-lg transition-transform active:scale-90">
                <Play size={18} className="fill-current translate-x-0.5" />
              </button>
            )
          ) : (
            <button 
              onClick={onStart}
              disabled={isDisabled && !isActive}
              className={`p-2.5 rounded-full transition-all active:scale-90 ${
                isDisabled 
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                  : 'bg-slate-700 hover:bg-cyan-500 text-slate-300 hover:text-white shadow-lg'
              }`}
              title="Start from here (Skips previous)"
            >
              <Play size={18} className="fill-current translate-x-0.5" />
            </button>
          )}

          <button 
            onClick={onDelete}
            disabled={isActive || isDisabled}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 ml-1"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeInput({ value, onChange, max, disabled }) {
  const handleBlur = (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 0) val = 0;
    if (val > max) val = max;
    onChange(val.toString().padStart(2, '0'));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      let val = parseInt(value) + 1;
      if (val > max) val = 0;
      onChange(val.toString().padStart(2, '0'));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      let val = parseInt(value) - 1;
      if (val < 0) val = max;
      onChange(val.toString().padStart(2, '0'));
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="w-11 text-center bg-slate-900/50 border border-slate-700 text-slate-300 rounded focus:outline-none focus:border-cyan-500 py-1 px-0 transition-colors disabled:opacity-50"
    />
  );
}