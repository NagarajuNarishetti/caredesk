import { useMemo, useState } from "react";
import API from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function MediaCard({
  item,
  onClick,
  onDelete,
  onEdit,
  currentUserId,
}) {
  const src = useMemo(() => {
    // If file_path is already a full URL (starts with http), use it directly
    if (item.file_path && item.file_path.startsWith('http')) {
      return item.file_path;
    }
    // Otherwise, construct the URL with API_BASE
    return `${API_BASE}${item.file_path}`;
  }, [item]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");


  const formatTimeAgo = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      setEditError("Title cannot be empty");
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      await API.patch(`/media/${item.id}`, { title: editTitle.trim() });
      setEditOpen(false);
      setEditLoading(false);
      setMenuOpen(false);
      if (onEdit) onEdit(item.id, editTitle.trim());
    } catch (err) {
      console.error("Full edit error:", err);
      console.error("Error response:", err.response);
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Failed to update title";
      setEditError(errorMessage);
      setEditLoading(false);
    }
  };

  return (
    <>
      <div className="group cursor-pointer relative" onClick={onClick}>
        {/* Card layout & preview */}
        <div className="relative p-[1px] rounded-2xl bg-gradient-to-br from-emerald-200/30 via-teal-100/20 to-transparent hover:from-emerald-300/40 hover:via-teal-200/30 transition-all duration-700 hover:scale-[1.01] shadow-2xl hover:shadow-3xl">
          <div className="relative bg-white rounded-2xl overflow-hidden backdrop-blur-xl border border-emerald-200/50">
            <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50 rounded-t-2xl flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-2">
                  <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 9a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V9z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-sm text-blue-600 font-semibold">Support Ticket</p>
                <p className="text-xs text-blue-500 mt-1">
                  {(() => {
                    const name = (item.priority_name || "").toString();
                    if (name) return name.charAt(0).toUpperCase() + name.slice(1) + " Priority";
                    const level = Number(item.priority_level);
                    if (!Number.isNaN(level)) {
                      const byLevel = { 1: "Low", 2: "Medium", 3: "High", 4: "Critical", 5: "Emergency" };
                      return (byLevel[level] || "Low") + " Priority";
                    }
                    if (item.priority) {
                      return item.priority === "3" ? "High Priority" : item.priority === "2" ? "Medium Priority" : "Low Priority";
                    }
                    return "Low Priority";
                  })()}
                </p>
              </div>
            </div>
            {/* No quick actions on preview */}
          </div>
          {/* Card info */}
          <div className="p-6 bg-white backdrop-blur-md border-t border-emerald-200/50">
            <h3 className="text-gray-800 font-semibold text-lg mb-3 line-clamp-2 leading-tight group-hover:text-emerald-600 transition duration-300">
              {item.title}
            </h3>

            {/* Ticket Details Section */}
            <div className="space-y-3 mb-4">
              {/* Raised By */}
              <div className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Raised By</div>
                  <div className="text-sm font-medium text-gray-800">
                    {item.customer_name || item.created_by_username || "Unknown"}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {formatTimeAgo(item.created_at)} ago
                </div>
              </div>

              {/* Organization */}
              {item.organization_name && (
                <div className="flex items-center gap-3 p-2 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Organization</div>
                    <div className="text-sm font-medium text-gray-800 truncate">{item.organization_name}</div>
                  </div>
                </div>
              )}

              {/* Assigned Agent */}
              {item.assigned_agent_name && (
                <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-100">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">Assigned To</div>
                    <div className="text-sm font-medium text-gray-800">{item.assigned_agent_name}</div>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-3 p-2 bg-orange-50 rounded-lg border border-orange-100">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Status</div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${item.status === "open" ? "bg-green-100 text-green-700 border border-green-200" :
                      item.status === "closed" ? "bg-red-100 text-red-700 border border-red-200" :
                        "bg-yellow-100 text-yellow-700 border border-yellow-200"
                      }`}>
                      {item.status === "open" ? "🟢 Open" : item.status === "closed" ? "🔴 Closed" : "🟡 In Progress"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Priority */}
              {item.priority_name && (
                <div className="flex items-center gap-3 p-2 bg-red-50 rounded-lg border border-red-100">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-red-700 uppercase tracking-wide">Priority</div>
                    <div className="text-sm font-medium text-gray-800">
                      {item.priority_name} ({item.priority_level || "N/A"})
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Action row - only show if edit or delete functions are provided */}
            {(onEdit || onDelete) && (
              <div className="pt-3 mt-3 border-t border-emerald-200/50 flex items-center justify-center gap-8">
                {onEdit && (
                  <button
                    type="button"
                    aria-label="Edit ticket"
                    className="text-gray-600 hover:text-emerald-600 transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTitle(item.title);
                      setEditError("");
                      setEditOpen(true);
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" />
                    </svg>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    aria-label="Delete ticket"
                    title="Delete"
                    className="text-gray-600 hover:text-red-600 transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmOpen(true);
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-3h4m-6 3h8m-7 0V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal Popup (fullscreen, centered) */}
      {editOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
          tabIndex={-1}
          onClick={() => setEditOpen(false)}
        >
          <div
            className="max-w-xl w-full bg-white/40 border border-blue-200/20 rounded-3xl shadow-2xl p-10 mx-auto flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center border border-blue-200/50">
                <svg
                  className="w-7 h-7 text-gray-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-wide mb-2 text-gray-800">
                  Edit Ticket
                </h3>
                <p className="text-gray-600">
                  Update the title of your support ticket
                </p>
              </div>
            </div>
            <form onSubmit={handleEditSubmit} className="w-full">
              <label
                className="block text-gray-700 text-sm font-bold mb-3 tracking-wider"
                htmlFor="media-title"
              >
                Title
              </label>
              <input
                id="media-title"
                type="text"
                className="w-full px-4 py-4 bg-white/10 border border-blue-200/50 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-300 transition text-lg mb-4"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter new title..."
                autoFocus
              />
              {editError && (
                <div className="mb-4 text-red-400 font-semibold bg-red-500/20 border border-red-500/30 rounded px-4 py-2">
                  {editError}
                </div>
              )}
              <div className="flex gap-4 pt-2 justify-end">
                <button
                  type="button"
                  className="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-gray-800 font-bold border border-blue-200/50 hover:border-blue-300 transition tracking-wider"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    editLoading ||
                    !editTitle.trim() ||
                    editTitle.trim() === item.title
                  }
                  className="px-8 py-3 bg-blue-700 hover:bg-blue-800 rounded-xl text-white font-bold transition shadow-xl disabled:opacity-50"
                >
                  {editLoading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 inline-block"></span>
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="max-w-md w-full bg-white/40 border border-blue-200/20 rounded-3xl shadow-2xl p-8 mx-auto flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold tracking-wide mb-2 text-gray-800">
              Delete Ticket
            </h3>
            <div className="text-sm text-gray-600 mb-6 text-center leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-bold text-gray-800">"{item.title}"</span>?
              <br />
              This action cannot be undone.
            </div>
            <div className="flex gap-4 w-full pt-2 justify-end">
              <button
                className="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-gray-800 font-bold border border-blue-200/50 hover:border-blue-300 transition tracking-wider"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-8 py-3 bg-red-600 hover:bg-red-700 rounded-xl text-white font-bold transition shadow-xl tracking-wider"
                onClick={() => {
                  setConfirmOpen(false);
                  setMenuOpen(false);
                  if (onDelete) onDelete(item.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}


    </>
  );
}
