import { useState, useRef } from "react";
import API from "../lib/api";

export default function MediaDetail({
  item,
  onClose,
  currentUser,
  permissionLevel = null,
  isSharedMedia = false,
}) {
  const src = item.file_path && item.file_path.startsWith('http')
    ? item.file_path
    : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${item.file_path}`;
  const videoRef = useRef(null);
  const commentsContainerRef = useRef(null);

  // --- State Management ---
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes || 0);
  const [currentTime] = useState(0);

  // Check if user can write (comment/annotate)
  // For shared media: only 'reviewer' may write; 'viewer' is read-only.
  // For own media (not shared): always writable.
  const canWrite = !isSharedMedia || permissionLevel === "reviewer";
  const canEdit = !isSharedMedia; // Only own media can be edited

  // --- Utility Functions ---
  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // comments/annotations removed: no sockets and no fetch

  // --- Video Player Effects ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video || item.type !== "video") return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      if (video) {
        video.removeEventListener("timeupdate", handleTimeUpdate);
      }
    };
  }, [item.type]);

  // --- Event Handlers ---
  const handleAddComment = async () => { };

  const handleMediaClick = () => { };

  const handleAddAnnotation = async () => { };

  const seekToTimestamp = (timestamp) => {
    if (videoRef.current && timestamp !== undefined) {
      videoRef.current.currentTime = timestamp;
      videoRef.current.play();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-xl flex z-50">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-white backdrop-blur-3xl border-b border-blue-200/50 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center text-blue-700 font-bold border border-blue-200 shadow-2xl">
              {(currentUser?.username || item.shared_by_username || 'A')[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-gray-800 font-bold text-lg tracking-wide">{item.title}</h2>
              {isSharedMedia ? (
                <p className="text-gray-600 text-sm">
                  Shared by {item.shared_by_username} • {item.organization_name}
                </p>
              ) : (
                <p className="text-gray-600 text-sm">
                  by {currentUser?.username || item.shared_by_username || 'Anonymous'} • {formatTimeAgo(item.createdAt || new Date())}
                </p>
              )}
            </div>
            {isSharedMedia && permissionLevel && (
              <>
                <div className="flex items-center space-x-2 bg-blue-100 px-3 py-1 rounded-full border border-blue-200">
                  <div className={`w-2 h-2 rounded-full ${permissionLevel === 'reviewer' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                  <span className="text-gray-700 text-sm font-medium">
                    {permissionLevel === 'reviewer' ? 'Review mode' : 'View mode'}
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-100 hover:bg-gray-200 backdrop-blur-3xl rounded-xl flex items-center justify-center text-gray-700 transition-all border border-gray-200 hover:border-gray-300 shadow-2xl"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Media Display */}
        <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="relative max-w-full max-h-[70vh]">
            {item.type === 'image' ? (
              <img
                src={src}
                alt={item.title}
                className={`max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-blue-200/50 ${isAnnotating ? 'cursor-crosshair' : 'cursor-default'}`}
                onClick={handleMediaClick}
              />
            ) : item.type === 'video' ? (
              <video
                ref={videoRef}
                src={src}
                controls
                className={`max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-blue-200/50 ${isAnnotating ? 'cursor-crosshair' : ''}`}
                onClick={handleMediaClick}
              />
            ) : (
              <div className="max-w-full max-h-[70vh] flex flex-col items-center justify-center bg-white rounded-2xl shadow-2xl border border-orange-200/50 p-12">
                <div className="text-8xl mb-6 text-orange-500">
                  <i className="fa-solid fa-file"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">
                  {item.title}
                </h3>
                <p className="text-gray-600 mb-6 text-center">
                  Document file - Click to download or edit
                </p>
                <div className="flex gap-4">
                  <a
                    href={item.type === 'document' ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/media/${item.id}/download` : src}
                    download={item.title}
                    className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                  >
                    <i className="fa-solid fa-download"></i>
                    Download Document
                  </a>
                  {(canEdit || permissionLevel === 'reviewer') && (
                    <button
                      onClick={() => window.open(`/document-edit?id=${item.id}`, '_blank')}
                      className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                    >
                      <i className="fa-solid fa-edit"></i>
                      Edit Document
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* annotations removed */}
          </div>
        </div>
      </div>

      {/* Sidebar removed */}
    </div>
  );
}
