"use client";

import { useCallback, useEffect, useRef } from "react";

type SoundKind = "pebble" | "rock" | "clank";

export function ButtonSounds() {
  const enabledRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const showState = useCallback((isEnabled: boolean) => {
    if (!buttonRef.current) return;
    buttonRef.current.textContent = `Sound ${isEnabled ? "on" : "off"}`;
    buttonRef.current.ariaPressed = String(isEnabled);
    buttonRef.current.title = isEnabled
      ? "Turn button sounds off"
      : "Turn button sounds on";
  }, []);

  const play = useCallback((kind: SoundKind) => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    const audio = audioRef.current ?? new AudioContextClass();
    audioRef.current = audio;
    if (audio.state === "suspended") void audio.resume();

    const settings = {
      pebble: { hits: [0, 0.022], frequency: 1450, volume: 0.055 },
      rock: { hits: [0, 0.038], frequency: 620, volume: 0.085 },
      clank: { hits: [0, 0.052], frequency: 2100, volume: 0.07 },
    }[kind];

    for (const [index, delay] of settings.hits.entries()) {
      const start = audio.currentTime + delay;
      const duration = kind === "clank" ? 0.12 : 0.075;
      const length = Math.ceil(audio.sampleRate * duration);
      const buffer = audio.createBuffer(1, length, audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let sample = 0; sample < length; sample += 1) {
        const fade = 1 - sample / length;
        samples[sample] = (Math.random() * 2 - 1) * fade * fade;
      }

      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      source.buffer = buffer;
      filter.type = kind === "clank" ? "bandpass" : "lowpass";
      filter.frequency.value = settings.frequency * (1 + index * 0.22);
      filter.Q.value = kind === "clank" ? 6 : 1.3;
      gain.gain.setValueAtTime(settings.volume * (index ? 0.65 : 1), start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start(start);
      source.stop(start + duration);
    }
  }, []);

  useEffect(() => {
    let isEnabled = true;
    try {
      isEnabled = window.localStorage.getItem("greyhub-sound") !== "off";
    } catch {
      // Sound still works when browser storage is unavailable.
    }
    enabledRef.current = isEnabled;
    showState(isEnabled);

    function handleClick(event: MouseEvent) {
      if (!enabledRef.current || !(event.target instanceof Element)) return;
      const control = event.target.closest("button, a.button");
      if (!control || control.hasAttribute("data-no-sound")) return;
      if (control instanceof HTMLButtonElement && control.disabled) return;

      if (control.classList.contains("danger")) play("clank");
      else if (control.classList.contains("primary")) play("rock");
      else play("pebble");
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (audioRef.current) void audioRef.current.close();
    };
  }, [play, showState]);

  function toggleSound() {
    const next = !enabledRef.current;
    enabledRef.current = next;
    showState(next);
    try {
      window.localStorage.setItem("greyhub-sound", next ? "on" : "off");
    } catch {
      // Keep the toggle usable for the current page.
    }
    if (next) play("pebble");
  }

  return (
    <button
      type="button"
      ref={buttonRef}
      className="sound-toggle"
      aria-pressed="true"
      title="Turn button sounds off"
      data-no-sound
      onClick={toggleSound}
    >
      Sound on
    </button>
  );
}
