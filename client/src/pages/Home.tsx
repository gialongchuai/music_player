import { useState, useEffect } from "react";
import MusicPlayer, { Song } from "@/components/MusicPlayer";
import SongImporter from "@/components/SongImporter";
import { Plus, Play } from "lucide-react";

// --- HELPERS CHO INDEXED DB ---
const DB_NAME = "MusicPlayerDB";
const STORE_NAME = "audioFiles";

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event) => reject(event);
  });
};

const saveAudioFile = async (id: number, file: Blob) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put(file, id);
};

const getAudioFile = async (id: number): Promise<Blob | undefined> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
};

const deleteAudioFile = async (id: number) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
};
// ------------------------------

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [isImporterOpen, setIsImporterOpen] = useState(false);

  // STATE MỚI: Để quyết định xem bài đầu tiên có được tự động phát không
  const [autoPlayFirstSong, setAutoPlayFirstSong] = useState(false);

  // Load songs from localStorage AND IndexedDB on mount
  useEffect(() => {
    const loadSongs = async () => {
      const savedSongs = localStorage.getItem("musicPlayerSongs");
      if (savedSongs) {
        try {
          const parsedSongs: Song[] = JSON.parse(savedSongs);

          // Duyệt qua các bài hát, nếu là bài local thì load blob từ DB và tạo URL mới
          const restoredSongs = await Promise.all(
            parsedSongs.map(async (song) => {
              if (song.type === "local") {
                const blob = await getAudioFile(song.id);
                if (blob) {
                  const newUrl = URL.createObjectURL(blob);
                  return { ...song, url: newUrl };
                }
              }
              return song;
            })
          );
          setSongs(restoredSongs);
        } catch (error) {
          console.error("Error loading songs:", error);
        }
      }
    };
    loadSongs();
  }, []);

  const handleRemoveSong = (songId: number) => {
    const updatedSongs = songs.filter((song) => song.id !== songId);
    setSongs(updatedSongs);

    // Xóa file khỏi IndexedDB để giải phóng bộ nhớ
    deleteAudioFile(songId);

    // Cập nhật localStorage
    const songsToSave = updatedSongs.map((song) => {
      const { file, ...rest } = song; // Không lưu object File vào localStorage
      return {
        ...rest,
        url: song.type === "youtube" ? song.url : "[LOCAL_FILE]",
      };
    });
    localStorage.setItem("musicPlayerSongs", JSON.stringify(songsToSave));
  };

  const handleAddSongs = (newSongs: Song[]) => {
    // KIỂM TRA: Nếu danh sách đang trống -> đánh dấu đây là lần thêm bài đầu tiên -> cho phép Play luôn
    if (songs.length === 0) {
      setAutoPlayFirstSong(true);
    } else {
      // Đặt lại false nếu người dùng thêm bài khi playlist đã có nhạc (để không phá vỡ logic bài đang hát)
      setAutoPlayFirstSong(false);
    }

    // 1. Lưu file MP3 vào IndexedDB
    newSongs.forEach((song) => {
      if (song.type === "local" && song.file) {
        saveAudioFile(song.id, song.file);
      }
    });

    const updatedSongs = [...songs, ...newSongs];
    setSongs(updatedSongs);

    // 2. Lưu metadata vào localStorage (bỏ qua property 'file')
    const songsToSave = updatedSongs.map((song) => {
      const { file, ...rest } = song; // Loại bỏ file blob object khi lưu JSON
      return {
        ...rest,
        url: song.type === "youtube" ? song.url : "[LOCAL_FILE]",
      };
    });
    localStorage.setItem("musicPlayerSongs", JSON.stringify(songsToSave));

    setIsImporterOpen(false);
  };

  const handleClearSongs = async () => {
    setSongs([]);
    localStorage.removeItem("musicPlayerSongs");

    // Clear toàn bộ DB
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
  };

  // Function để thêm nhanh bài hát gợi ý
  const handleAddSuggestedSong = async () => {
    const suggestedSong: Song = {
      id: Date.now(),
      title: "Beauty And A Beat",
      artist: "Justin Bieber",
      cover: "https://img.youtube.com/vi/aWkPBCF8rFU/hqdefault.jpg",
      url: "https://www.youtube.com/embed/aWkPBCF8rFU",
      duration: "0:00",
      type: "youtube",
      youtubeId: "aWkPBCF8rFU",
    };

    // Hàm handleAddSongs đã tự động lo việc bật cờ autoPlayFirstSong
    handleAddSongs([suggestedSong]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {songs.length === 0 ? (
        <div className="glass-panel rounded-3xl p-8 text-center max-w-md w-full space-y-6">
          <div className="text-6xl">🎶</div>
          <h1 className="text-2xl font-bold text-white">
            Chào cậu đến với <br />
            Music Player
          </h1>
          <p className="text-white/80">
            Cậu chưa có bài hát nào. Hãy thêm bài hát bằng cách nhập URL YouTube hoặc tải lên MP3.
          </p>
          <br />
          {/* Gợi ý bài hát */}
          <div className="space-y-3">
            <p className="text-white/80">
              ☁️ Gợi ý cho cậu nè ☁️
            </p>

            {/* Card gợi ý Justin Bieber - Beauty And A Beat */}
            <div
              onClick={handleAddSuggestedSong}
              className="group relative bg-gradient-to-br from-yellow-500/20 to-orange-600/20 border border-yellow-500/30 rounded-2xl p-4 cursor-pointer hover:from-yellow-500/30 hover:to-orange-600/30 hover:border-yellow-400/50 hover:scale-[1.02] transition-all duration-300 hover:shadow-[0_0_30px_rgba(234,179,8,0.3)]"
            >
              <div className="flex items-center gap-4">
                {/* Thumbnail */}
                <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-lg">
                  <img
                    src="https://img.youtube.com/vi/aWkPBCF8rFU/hqdefault.jpg"
                    alt="Beauty And A Beat"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                  {/* Play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                      <Play className="w-5 h-5 text-yellow-600 ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 text-left">
                  <h3 className="text-white font-bold text-lg group-hover:text-yellow-300 transition-colors">
                    Beauty And A Beat
                  </h3>
                  <p className="text-white/70 text-sm mt-1 group-hover:text-white/80 transition-colors">
                    Justin Bieber
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-yellow-300/100 bg-yellow-400/10 px-2 py-1 rounded-full border border-yellow-400/20">
                      🎵 Popular
                    </span>
                    <span className="text-xs text-white/70">
                      YouTube
                    </span>
                  </div>
                </div>
              </div>

              {/* Glow effect */}
              <div className="absolute -inset-px bg-gradient-to-br from-yellow-500/0 to-orange-600/0 group-hover:from-yellow-500/20 group-hover:to-orange-600/20 rounded-2xl blur-xl transition-all duration-500 -z-10" />
            </div>

          </div>

          <button
            onClick={() => setIsImporterOpen(true)}
            className="w-full px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Thêm bài hát
          </button>
        </div>
      ) : (
        <div className="w-full">
          <div className="flex justify-between items-center mb-4 px-4 lg:px-0">
            <button
              onClick={() => setIsImporterOpen(true)}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Thêm bài hát
            </button>
            <button
              onClick={handleClearSongs}
              className="px-4 py-2 bg-red-500/40 text-white-200 border border-red-500/30 rounded-xl hover:bg-red-500/30 transition text-sm"
            >
              Xóa tất cả
            </button>
          </div>

          {/* TRUYỀN autoPlayFirst VÀO ĐÂY NÈ CẬU */}
          <MusicPlayer
            songs={songs}
            onRemoveSong={handleRemoveSong}
            autoPlayFirst={autoPlayFirstSong}
          />
        </div>
      )}

      <SongImporter
        isOpen={isImporterOpen}
        onClose={() => setIsImporterOpen(false)}
        onAddSongs={handleAddSongs}
      />
    </div>
  );
}