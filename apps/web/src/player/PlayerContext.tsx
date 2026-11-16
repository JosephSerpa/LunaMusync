import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { coverUrl, streamUrl } from "../api";
import type { Song } from "../types";

type RepeatMode = "none" | "all" | "one";

interface PlayerContextValue {
  queue: Song[];
  current: Song | null;
  currentIndex: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  expanded: boolean;
  playQueue: (songs: Song[], index?: number) => void;
  playNext: (song: Song) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  removeAt: (index: number) => void;
  move: (from: number, to: number) => void;
  clear: () => void;
  setExpanded: (expanded: boolean) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

interface StoredPlayer {
  queue: Song[];
  index: number;
  position: number;
}

function readStored(key: string): StoredPlayer {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (value && Array.isArray(value.queue)) {
      const queue = value.queue.filter((song: unknown) => song && typeof song === "object" && "id" in song);
      const index = Math.max(0, Math.min(Number(value.index) || 0, queue.length - 1));
      return { queue, index, position: Math.max(0, Number(value.position) || 0) };
    }
  } catch {
    localStorage.removeItem(key);
  }
  return { queue: [], index: -1, position: 0 };
}

export function PlayerProvider({ children, storageKey }: { children: ReactNode; storageKey: string }) {
  const initial = useMemo(() => readStored(storageKey), [storageKey]);
  const [queue, setQueue] = useState<Song[]>(initial.queue);
  const [currentIndex, setCurrentIndex] = useState(initial.index);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initial.position);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => Number(localStorage.getItem("luna-volume")) || 0.85);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("none");
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayRef = useRef(false);
  const resumeRef = useRef(initial.position);
  const lastSaveRef = useRef(0);
  const current = queue[currentIndex] ?? null;

  const next = useCallback(() => {
    if (queue.length === 0) return;
    autoPlayRef.current = true;
    let nextIndex = currentIndex + 1;
    if (shuffle && queue.length > 1) {
      nextIndex = currentIndex;
      while (nextIndex === currentIndex) nextIndex = Math.floor(Math.random() * queue.length);
    }
    setCurrentIndex((nextIndex + queue.length) % queue.length);
  }, [currentIndex, queue.length, shuffle]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    if (queue.length === 0) return;
    autoPlayRef.current = true;
    setCurrentIndex((currentIndex - 1 + queue.length) % queue.length);
  }, [currentIndex, queue.length]);

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const clear = useCallback(() => {
    audioRef.current?.pause();
    autoPlayRef.current = false;
    setQueue([]);
    setCurrentIndex(-1);
    setPlaying(false);
    setCurrentTime(0);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const endedRef = useRef<() => void>(() => undefined);
  endedRef.current = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (repeat === "one") {
      audio.currentTime = 0;
      void audio.play();
    } else if (currentIndex === queue.length - 1 && repeat === "none" && !shuffle) {
      setPlaying(false);
      audio.currentTime = 0;
    } else {
      next();
    }
  };

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (Date.now() - lastSaveRef.current > 5000) {
        lastSaveRef.current = Date.now();
        const stored = readStored(storageKey);
        localStorage.setItem(storageKey, JSON.stringify({ ...stored, position: audio.currentTime }));
      }
    };
    const onMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (resumeRef.current > 0 && resumeRef.current < audio.duration) {
        audio.currentTime = resumeRef.current;
      }
      resumeRef.current = 0;
    };
    const onEnded = () => endedRef.current();
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, [storageKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = streamUrl(current);
    audio.load();
    setCurrentTime(0);
    setDuration(current.duration || 0);
    if (autoPlayRef.current) {
      void audio.play().catch(() => setPlaying(false));
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album,
        artwork: [{ src: coverUrl(current), sizes: "600x600", type: "image/jpeg" }],
      });
    }
  }, [current]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    localStorage.setItem("luna-volume", String(volume));
  }, [volume]);

  useEffect(() => {
    if (queue.length === 0) return;
    const position = readStored(storageKey).position;
    localStorage.setItem(storageKey, JSON.stringify({ queue, index: currentIndex, position }));
  }, [queue, currentIndex, storageKey]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => void audioRef.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", previous);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
  }, [next, previous, seek]);

  const playQueue = useCallback((songs: Song[], index = 0) => {
    if (songs.length === 0) return;
    autoPlayRef.current = true;
    resumeRef.current = 0;
    setQueue(songs);
    setCurrentIndex(Math.max(0, Math.min(index, songs.length - 1)));
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      autoPlayRef.current = true;
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [current]);

  const playNext = useCallback((song: Song) => {
    if (!current) {
      playQueue([song]);
      return;
    }
    setQueue((items) => [...items.slice(0, currentIndex + 1), song, ...items.slice(currentIndex + 1)]);
  }, [current, currentIndex, playQueue]);

  const removeAt = useCallback((index: number) => {
    if (index === currentIndex && queue.length === 1) {
      clear();
      return;
    }
    const nextQueue = queue.filter((_, itemIndex) => itemIndex !== index);
    setQueue(nextQueue);
    if (index < currentIndex) setCurrentIndex(currentIndex - 1);
    if (index === currentIndex) {
      autoPlayRef.current = playing;
      setCurrentIndex(Math.min(index, nextQueue.length - 1));
    }
  }, [clear, currentIndex, playing, queue]);

  const move = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
    const nextQueue = [...queue];
    const [item] = nextQueue.splice(from, 1);
    if (!item) return;
    nextQueue.splice(to, 0, item);
    setQueue(nextQueue);
    if (from === currentIndex) setCurrentIndex(to);
    else if (from < currentIndex && to >= currentIndex) setCurrentIndex(currentIndex - 1);
    else if (from > currentIndex && to <= currentIndex) setCurrentIndex(currentIndex + 1);
  }, [currentIndex, queue]);

  const value: PlayerContextValue = {
    queue,
    current,
    currentIndex,
    playing,
    currentTime,
    duration,
    volume,
    shuffle,
    repeat,
    expanded,
    playQueue,
    playNext,
    toggle,
    next,
    previous,
    seek,
    setVolume: (value) => setVolumeState(Math.max(0, Math.min(1, value))),
    toggleShuffle: () => setShuffle((value) => !value),
    cycleRepeat: () => setRepeat((value) => value === "none" ? "all" : value === "all" ? "one" : "none"),
    removeAt,
    move,
    clear,
    setExpanded,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer debe utilizarse dentro de PlayerProvider.");
  return context;
}
