import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
  ListMusic,
  X,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
    ytApiReady?: boolean;
  }
}

export interface Song {
  id: number;
  title: string;
  artist: string;
  cover: string;
  url: string;
  duration: string;
  type?: "local" | "youtube";
  youtubeId?: string;
  file?: Blob;
}

interface MusicPlayerProps {
  songs: Song[];
  onRemoveSong: (songId: number) => void;
  autoPlayFirst?: boolean;
}

const loadYouTubeAPI = () => {
  if (window.YT && window.YT.Player) {
    window.ytApiReady = true;
    return;
  }
  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = () => {
    window.ytApiReady = true;
  };
};

export default function MusicPlayer({ songs, onRemoveSong, autoPlayFirst }: MusicPlayerProps) {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<any>(null);

  const isRepeatRef = useRef(isRepeat);
  const isShuffleRef = useRef(isShuffle);
  const shouldAutoPlayRef = useRef(autoPlayFirst || false);

  const volumeWrapperRef = useRef<HTMLDivElement>(null);
  const [isVolumeFocused, setIsVolumeFocused] = useState(false);
  const [isVolumeAdjustMode, setIsVolumeAdjustMode] = useState(false);

  // --- FIX STALE CLOSURE CHÍNH LÀ ĐÂY ---
  // Tạo ref để lưu trữ các hàm xử lý mới nhất, giúp YouTube API không bị kẹt ở state cũ
  const latestHandleSongEnd = useRef<(() => void) | undefined>(undefined);
  const latestHandleNext = useRef<(() => void) | undefined>(undefined);

  const currentSong = songs[currentSongIndex] || {};

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const activeTag = document.activeElement?.tagName.toUpperCase();
        if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
          return;
        }
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const currentSongIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (currentSong.id) {
      currentSongIdRef.current = currentSong.id;
    }
  }, [currentSongIndex, songs]);

  useEffect(() => {
    if (currentSongIdRef.current !== null) {
      const newIndex = songs.findIndex(s => s.id === currentSongIdRef.current);
      if (newIndex !== -1 && newIndex !== currentSongIndex) {
        setCurrentSongIndex(newIndex);
      }
    }
  }, [songs]);

  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);
  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    if (!isVolumeAdjustMode) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.02 : -0.02;
      const newVolume = Math.max(0, Math.min(1, volume + delta));
      setVolume(newVolume);
      if (newVolume > 0) setIsMuted(false);
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, [isVolumeAdjustMode, volume]);

  useEffect(() => {
    if (!isVolumeAdjustMode) return;
    const handleClickOutside = (e: MouseEvent) => {
      const volumeArea = document.querySelector(".volume-control-wrapper");
      const muteButton = document.querySelector(".volume-mute-button");
      if (
        volumeArea &&
        !volumeArea.contains(e.target as Node) &&
        muteButton &&
        !muteButton.contains(e.target as Node)
      ) {
        setIsVolumeAdjustMode(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isVolumeAdjustMode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        volumeWrapperRef.current &&
        !volumeWrapperRef.current.contains(e.target as Node)
      ) {
        setIsVolumeFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    loadYouTubeAPI();
  }, []);

  useEffect(() => {
    if (!currentSong.id) return;

    const shouldPlay = shouldAutoPlayRef.current;
    setIsPlaying(shouldPlay);
    setCurrentTime(0);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (
      playerRef.current &&
      typeof playerRef.current.pauseVideo === "function"
    ) {
      playerRef.current.pauseVideo();
    }

    if (currentSong.type === "youtube" && currentSong.youtubeId) {
      if (
        playerRef.current &&
        typeof playerRef.current.loadVideoById === "function"
      ) {
        try {
          playerRef.current.loadVideoById(currentSong.youtubeId);
          if (shouldPlay)
            playerRef.current.playVideo();
          else playerRef.current.pauseVideo();
        } catch (e) {
          playerRef.current.destroy();
          createYouTubePlayer(currentSong.youtubeId, shouldPlay);
        }
      } else {
        createYouTubePlayer(currentSong.youtubeId, shouldPlay);
      }
    }
    else if (audioRef.current) {
      audioRef.current.src = currentSong.url;
      audioRef.current.load();
      setDuration(0);

      if (shouldPlay) {
        audioRef.current.play().catch(e => {
          console.error("Auto-play blocked:", e);
          setIsPlaying(false);
        });
      }
    }
  }, [currentSong.id]);

  const createYouTubePlayer = (videoId: string, shouldPlay: boolean) => {
    if (!window.ytApiReady || !playerContainerRef.current) {
      setTimeout(() => createYouTubePlayer(videoId, shouldPlay), 100);
      return;
    }
    playerRef.current = new window.YT.Player(playerContainerRef.current, {
      height: "0",
      width: "0",
      videoId: videoId,
      playerVars: {
        autoplay: shouldPlay ? 1 : 0,
        controls: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
      },
      events: {
        onReady: (e: any) => {
          setDuration(e.target.getDuration?.() || 0);
          e.target.setVolume(isMuted ? 0 : volume * 100);
          if (shouldPlay) e.target.playVideo();
        },
        onStateChange: (e: any) => {
          if (e.data === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true);
            setDuration(e.target.getDuration?.() || 0);
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
              if (playerRef.current?.getCurrentTime)
                setCurrentTime(playerRef.current.getCurrentTime());
            }, 100);
          } else if (e.data === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false);
          } else if (e.data === window.YT.PlayerState.ENDED) {
            // GỌI QUA REF ĐỂ LUÔN LẤY ĐƯỢC MẢNG `songs` MỚI NHẤT
            latestHandleSongEnd.current?.();
          }
        },
        // GỌI QUA REF 
        onError: () => latestHandleNext.current?.(),
      },
    });
  };

  useEffect(() => {
    if (
      currentSong.type === "youtube" &&
      playerRef.current &&
      typeof playerRef.current.playVideo === "function"
    ) {
      isPlaying
        ? playerRef.current.playVideo()
        : playerRef.current.pauseVideo();
    } else if (audioRef.current) {
      isPlaying
        ? audioRef.current.play().catch(() => setIsPlaying(false))
        : audioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (currentSong.type === "youtube" && playerRef.current) {
      playerRef.current.setVolume?.(isMuted ? 0 : volume * 100);
    } else if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (currentSong.type !== "youtube" && audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration) setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    const seconds = value[0];
    setCurrentTime(seconds);
    if (currentSong.type === "youtube" && playerRef.current) {
      playerRef.current.seekTo(seconds, true);
    } else if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
  };

  const handleSongEnd = () => {
    // FIX: NẾU BẬT REPEAT HOẶC CHỈ CÓ 1 BÀI TRONG PLAYLIST -> HÁT LẠI TỪ ĐẦU
    if (isRepeatRef.current || songs.length === 1) {
      if (currentSong.type === "youtube" && playerRef.current) {
        playerRef.current.seekTo(0, true);
        playerRef.current.playVideo();
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    } else {
      shouldAutoPlayRef.current = true;
      handleNext();
    }
  };

  const handleNext = () => {
    shouldAutoPlayRef.current = true;
    if (isShuffleRef.current) {
      setCurrentSongIndex(Math.floor(Math.random() * songs.length));
    } else {
      setCurrentSongIndex(prev => (prev + 1) % songs.length);
    }
  };

  const handlePrev = () => {
    shouldAutoPlayRef.current = true;
    if (currentTime > 3) handleSeek([0]);
    else setCurrentSongIndex(prev => (prev - 1 + songs.length) % songs.length);
  };

  // Cập nhật các ref mỗi khi render để đảm bảo YouTube API luôn gọi hàm với state mới nhất
  latestHandleSongEnd.current = handleSongEnd;
  latestHandleNext.current = handleNext;

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col lg:flex-row h-[85vh] w-full max-w-6xl mx-auto gap-6 p-4 lg:p-8 relative">
      <audio
        ref={audioRef}
        src={currentSong.type !== "youtube" ? currentSong.url : undefined}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleSongEnd}
        onLoadedMetadata={handleTimeUpdate}
        className="hidden"
      />

      <div className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none overflow-hidden -z-50">
        <div ref={playerContainerRef} />
      </div>

      <div
        className={cn(
          "glass-panel rounded-3xl flex-1 flex flex-col overflow-hidden transition-all duration-500 ease-in-out",
          showPlaylist
            ? "fixed inset-4 z-50 lg:static lg:inset-auto"
            : "hidden lg:flex"
        )}
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white tracking-wide">
            Playlist
          </h2>
          <button
            onClick={() => setShowPlaylist(false)}
            className="lg:hidden p-2 hover:bg-white/10 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {songs.map((song, index) => (
            <div
              key={song.id}
              className={cn(
                "flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all group hover:bg-white/10 relative",
                currentSongIndex === index
                  ? "bg-white/20 border border-white/10 shadow-lg"
                  : "border border-transparent"
              )}
            >
              <div
                onClick={() => {
                  shouldAutoPlayRef.current = false;
                  setCurrentSongIndex(index);
                  setShowPlaylist(false);
                }}
                className="flex items-center gap-4 flex-1 min-w-0"
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={song.cover}
                    alt={song.title}
                    className="w-full h-full object-cover"
                  />
                  {currentSongIndex === index && isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex gap-0.5 h-3 items-end">
                        <div className="w-1 bg-white animate-pulse h-full"></div>
                        <div
                          className="w-1 bg-white animate-pulse h-2/3"
                          style={{ animationDelay: "0.1s" }}
                        ></div>
                        <div
                          className="w-1 bg-white animate-pulse h-full"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className={cn(
                      "font-medium truncate",
                      currentSongIndex === index
                        ? "text-white"
                        : "text-white/80"
                    )}
                  >
                    {song.title}
                  </h3>
                  <p className="text-sm text-white/50 truncate">
                    {song.artist}
                  </p>
                </div>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onRemoveSong(song.id);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg transition-all"
                title="Xóa bài hát"
              >
                <X className="w-4 h-4 text-[#1f2937] hover:text-[#374151]" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-3xl flex-[1.5] flex flex-col p-6 lg:p-10 relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-30 blur-3xl transition-all duration-1000"
          style={{
            background: `radial-gradient(circle at center, ${currentSongIndex % 2 === 0 ? "#a855f7" : "#3b82f6"}, transparent 70%)`,
          }}
        ></div>
        <div className="lg:hidden absolute top-4 right-4">
          <button
            onClick={() => setShowPlaylist(true)}
            className="p-3 glass-button rounded-full"
          >
            <ListMusic className="w-5 h-5 text-white" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center py-6">
          <div
            className={cn(
              "relative w-50 h-50 sm:w-40 sm:h-40 rounded-full shadow-2xl border-4 border-white/10 overflow-hidden transition-all duration-700",
              isPlaying ? "animate-[spin_20s_linear_infinite]" : ""
            )}
          >
            <img
              src={currentSong.cover}
              alt={currentSong.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 rounded-full border-[3px] border-white/20"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center">
              <div className="w-4 h-4 bg-white/30 rounded-full"></div>
            </div>
          </div>
        </div>
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {currentSong.title}
          </h1>
          <p className="text-lg text-white/60 font-light">
            {currentSong.artist}
          </p>
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="cursor-pointer interactive-slider h-5"
            />
            <div className="flex justify-between text-xs font-medium text-white/40">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <button
              onClick={() => setIsShuffle(!isShuffle)}
              className={cn(
                "p-2 transition-colors",
                isShuffle ? "text-primary" : "text-white/40 hover:text-white"
              )}
            >
              <Shuffle className="w-5 h-5" />
            </button>
            <button
              onClick={handlePrev}
              className="p-3 sm:p-4 glass-button rounded-full hover:scale-105 active:scale-95"
            >
              <SkipBack className="w-6 h-6 text-white fill-white" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-4 sm:p-6 bg-white text-primary rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-all"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current ml-1" />
              )}
            </button>
            <button
              onClick={handleNext}
              className="p-3 sm:p-4 glass-button rounded-full hover:scale-105 active:scale-95"
            >
              <SkipForward className="w-6 h-6 text-white fill-white" />
            </button>
            <button
              onClick={() => setIsRepeat(!isRepeat)}
              className={cn(
                "p-2 transition-colors",
                isRepeat ? "text-primary" : "text-white/40 hover:text-white"
              )}
            >
              <Repeat className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-3 max-w-xs mx-auto pt-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-white/60 hover:text-white transition-colors volume-mute-button"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <div
              className="relative flex-1 max-w-32 volume-control-wrapper cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                setIsVolumeAdjustMode(true);
              }}
            >
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={(v) => {
                  setVolume(v[0]);
                  if (v[0] > 0) setIsMuted(false);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setIsVolumeAdjustMode(true);
                }}
                className="w-full interactive-slider h-5"
              />
              {isVolumeAdjustMode && (
                <div className="absolute -inset-2 border-2 border-white/50 rounded-lg pointer-events-none animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`
  .glass-panel {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .glass-button {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    transition: all 0.3s;
  }
  .glass-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .interactive-slider span {
    transition-property: height, transform, box-shadow, border-width; 
    transition-duration: 0.2s; 
    transition-timing-function: ease-out;
  }

  .interactive-slider span[role="slider"] {
    transition-property: width, height, transform, box-shadow, border;
    transition-duration: 0.2s;
    transition-timing-function: ease-out;
  }

  .interactive-slider:hover span.grow {
    height: 10px !important; 
    border-radius: 999px;
  }

  .interactive-slider:hover span[role="slider"] {
    width: 20px !important;
    height: 20px !important;
    transform: scale(1.2);
    border: 2px solid white;
    box-shadow: 0 0 10px rgba(255,255,255,0.5);
  }
  
  .interactive-slider span[role="slider"] {
    z-index: 10;
  }
`}</style>
    </div>
  );
}