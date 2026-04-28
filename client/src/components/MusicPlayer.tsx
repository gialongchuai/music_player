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
  file?: Blob; // <--- THÊM DÒNG NÀY: Để truyền file từ Importer sang Home
}

interface MusicPlayerProps {
  songs: Song[];
  onRemoveSong: (songId: number) => void;
  autoPlayFirst?: boolean; // <--- 1. THÊM DÒNG NÀY
}

// Load YouTube API (only once)
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

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<any>(null);

  // Ref để lưu trạng thái Repeat/Shuffle (Fix lỗi Stale Closure)
  const isRepeatRef = useRef(isRepeat);
  const isShuffleRef = useRef(isShuffle);

  // 3. SỬA DÒNG NÀY: Lấy giá trị từ prop truyền vào thay vì mặc định là false
  const shouldAutoPlayRef = useRef(autoPlayFirst || false);

  // Volume control refs
  const volumeWrapperRef = useRef<HTMLDivElement>(null);
  const [isVolumeFocused, setIsVolumeFocused] = useState(false);
  const [isVolumeAdjustMode, setIsVolumeAdjustMode] = useState(false);

  // Lấy bài hát hiện tại một cách an toàn
  const currentSong = songs[currentSongIndex] || {};

  // -------------------------------------------------------
  // THÊM ĐOẠN NÀY VÀO: Xử lý phím SPACE để Play/Pause
  // -------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Chỉ bắt phím Space
      if (e.code === "Space") {
        // 1. Kiểm tra xem người dùng có đang gõ chữ trong ô Input nào không?
        // Nếu đang gõ tên bài hát hay tìm kiếm youtube thì Space phải là dấu cách, không được Pause nhạc.
        const activeTag = document.activeElement?.tagName.toUpperCase();
        if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
          return;
        }

        // 2. Chặn hành động cuộn trang mặc định của phím Space
        e.preventDefault();

        // 3. Đảo ngược trạng thái Play/Pause
        // Sử dụng functional update (prev => !prev) để luôn lấy giá trị mới nhất mà không cần thêm dependency
        setIsPlaying(prev => !prev);
      }
    };

    // Lắng nghe sự kiện trên toàn bộ cửa sổ
    window.addEventListener("keydown", handleKeyDown);

    // Dọn dẹp khi component unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  // -------------------------------------------------------

  // --- LOGIC MỚI: SYNC INDEX KHI THÊM/XÓA BÀI ---
  const currentSongIdRef = useRef<number | null>(null);

  // 1. Cập nhật ID bài hát hiện tại vào Ref
  useEffect(() => {
    if (currentSong.id) {
      currentSongIdRef.current = currentSong.id;
    }
  }, [currentSongIndex, songs]);

  // 2. Khi danh sách songs thay đổi (thêm/xóa), tìm lại vị trí của bài đang hát
  useEffect(() => {
    if (currentSongIdRef.current !== null) {
      const newIndex = songs.findIndex(s => s.id === currentSongIdRef.current);
      // Nếu bài hát vẫn còn trong list nhưng index đã đổi -> cập nhật index mới
      if (newIndex !== -1 && newIndex !== currentSongIndex) {
        setCurrentSongIndex(newIndex);
      }
      // Lưu ý: Nếu newIndex === -1 (bài đang hát bị xóa), logic render sẽ tự handle hoặc crash nhẹ,
      // nhưng thường ta không xóa bài đang hát hoặc chấp nhận nó dừng.
    }
  }, [songs]); // Dependency chỉ là songs
  // -----------------------------------------------

  // Sync Refs
  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);
  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  // Volume Wheel Logic
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

  // Load API
  useEffect(() => {
    loadYouTubeAPI();
  }, []);

  // --- MAIN PLAYER EFFECT (Đã fix dependency để không reload khi thêm bài) ---
  // --- MAIN PLAYER EFFECT ---
  useEffect(() => {
    if (!currentSong.id) return;

    // 1. LẤY TRẠNG THÁI TỪ REF ĐỂ QUYẾT ĐỊNH
    const shouldPlay = shouldAutoPlayRef.current;
    setIsPlaying(shouldPlay); // Cập nhật icon Play/Pause theo đúng ý định
    setCurrentTime(0);

    // Reset lại ref về false cho an toàn (mặc định là không hát nếu không có lệnh)
    // Hoặc giữ nguyên cũng được, nhưng reset giúp tránh lỗi logic lạ sau này.
    // shouldAutoPlayRef.current = false; // (Optional: Có thể bỏ dòng này nếu muốn Next xong bấm Next tiếp vẫn hát)

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 2. DỪNG NGUỒN CŨ
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

    // 3. LOAD BÀI MỚI
    // CASE A: YOUTUBE
    if (currentSong.type === "youtube" && currentSong.youtubeId) {
      if (
        playerRef.current &&
        typeof playerRef.current.loadVideoById === "function"
      ) {
        try {
          playerRef.current.loadVideoById(currentSong.youtubeId);
          if (shouldPlay)
            playerRef.current.playVideo(); // <--- Dùng biến shouldPlay
          else playerRef.current.pauseVideo();
        } catch (e) {
          playerRef.current.destroy();
          createYouTubePlayer(currentSong.youtubeId, shouldPlay);
        }
      } else {
        createYouTubePlayer(currentSong.youtubeId, shouldPlay);
      }
    }
    // CASE B: LOCAL MP3
    else if (audioRef.current) {
      audioRef.current.src = currentSong.url;
      audioRef.current.load();
      setDuration(0);

      if (shouldPlay) {
        // <--- Dùng biến shouldPlay
        audioRef.current.play().catch(e => {
          console.error("Auto-play blocked:", e);
          setIsPlaying(false);
        });
      }
    }
  }, [currentSong.id]);
  // --------------------------------------------------------------------------

  // Helper create player
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
            handleSongEnd();
          }
        },
        onError: () => handleNext(),
      },
    });
  };

  // Play/Pause button trigger
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

  // Volume Update
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
    if (isRepeatRef.current) {
      // ... giữ nguyên logic repeat
      // (Logic repeat vẫn cần play lại nên coi như auto play)
      if (currentSong.type === "youtube" && playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.playVideo();
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      shouldAutoPlayRef.current = true; // <--- Hết bài tự next -> BẮT BUỘC PHẢI HÁT
      handleNext();
    }
  };

  const handleNext = () => {
    shouldAutoPlayRef.current = true; // <--- Bấm nút Next -> HÁT LUÔN
    if (isShuffleRef.current) {
      setCurrentSongIndex(Math.floor(Math.random() * songs.length));
    } else {
      setCurrentSongIndex(prev => (prev + 1) % songs.length);
    }
  };

  const handlePrev = () => {
    shouldAutoPlayRef.current = true; // <--- Bấm nút Prev -> HÁT LUÔN
    if (currentTime > 3) handleSeek([0]);
    else setCurrentSongIndex(prev => (prev - 1 + songs.length) % songs.length);
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    // 1. Thêm 'relative' vào div bao ngoài cùng để làm điểm neo
    <div className="flex flex-col lg:flex-row h-[85vh] w-full max-w-6xl mx-auto gap-6 p-4 lg:p-8 relative">
      {/* Ẩn MP3 player đi nếu đang là Youtube, nhưng không unmount nó */}
      <audio
        ref={audioRef}
        src={currentSong.type !== "youtube" ? currentSong.url : undefined}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleSongEnd}
        onLoadedMetadata={handleTimeUpdate}
        className="hidden"
      />

      {/* YouTube player container */}
      <div className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none overflow-hidden -z-50">
        <div ref={playerContainerRef} />
      </div>

      {/* Playlist UI */}
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
                  shouldAutoPlayRef.current = false; // <--- QUAN TRỌNG: Đánh dấu là KHÔNG tự hát
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

      {/* Player UI */}
      <div className="glass-panel rounded-3xl flex-[1.5] flex flex-col p-6 lg:p-10 relative overflow-hidden">
        {/* ... (Giữ nguyên phần UI Player như cũ, không thay đổi gì ở đây) ... */}
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
              // THÊM: interactive-slider
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
                // THÊM: interactive-slider
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

  /* --- FIX TUA CHẬM & HOVER PHỒNG TO --- */

  /* 1. Thiết lập transition có chọn lọc */
  /* Thay vì 'all', ta chỉ liệt kê những thứ cần mượt (height, transform, border) */
  /* Tuyệt đối KHÔNG transition 'width' của thanh Range hoặc 'left' của Thumb */
  .interactive-slider span {
    transition-property: height, transform, box-shadow, border-width; 
    transition-duration: 0.2s; /* Giảm xuống 0.2s cho nhanh hơn chút nữa */
    transition-timing-function: ease-out;
  }

  /* Riêng cục Thumb (cục tròn) cần transition cả width/height để phồng to mượt */
  .interactive-slider span[role="slider"] {
    transition-property: width, height, transform, box-shadow, border;
    transition-duration: 0.2s;
    transition-timing-function: ease-out;
    /* Quan trọng: KHÔNG transition 'left', 'right' để khi click nó nhảy ngay lập tức */
  }

  /* 2. Hiệu ứng Hover cho thanh Track (Phồng lên) */
  .interactive-slider:hover span.grow {
    height: 10px !important; 
    border-radius: 999px;
  }

  /* 3. Hiệu ứng Hover cho cục Thumb (To lên) */
  .interactive-slider:hover span[role="slider"] {
    width: 20px !important;
    height: 20px !important;
    transform: scale(1.2);
    border: 2px solid white;
    box-shadow: 0 0 10px rgba(255,255,255,0.5);
  }
  
  /* Đảm bảo thứ tự hiển thị */
  .interactive-slider span[role="slider"] {
    z-index: 10;
  }
`}</style>
    </div>
  );
}
