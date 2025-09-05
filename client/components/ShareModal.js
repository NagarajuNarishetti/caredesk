import React, { useEffect, useState } from "react";
import API from "../lib/api";

export default function ShareModal({ mediaId, currentUserId, onClose }) {
  console.log("currentUserId in ShareModal:", currentUserId);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [sentUsers, setSentUsers] = useState([]); // track which users got it

  useEffect(() => {
    API.get("/users")
      .then((res) => {
        const filteredUsers = res.data.filter((u) => u.id !== currentUserId);
        setUsers(filteredUsers);
      })
      .catch((err) => {
        console.error("Failed to fetch users:", err);
      });
  }, [currentUserId]);

  const handleShare = async (shared_with) => {
    if (!shared_with) {
      alert("User ID is missing!");
      return;
    }
    console.log({
      media_id: mediaId,
      shared_by: currentUserId,
      shared_with,
      message,
    });
    setLoadingId(shared_with);
    try {
      await API.post("/media-shared/share", {
        media_id: mediaId,
        shared_by: currentUserId,
        shared_with,
      });
      setSentUsers((prev) => [...prev, shared_with]);
    } catch (err) {
      alert("Error: " + (err.response?.data?.error || err.message));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full bg-white border border-blue-200/50 rounded-3xl shadow-2xl p-8 mx-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200">
            <svg
              className="w-4 h-4 text-blue-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 6l-4-4-4 4m4-4v12"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-wide mb-1 text-gray-800">
              Add Comment
            </h2>
            <p className="text-gray-600 text-sm">
              Add a comment to this support ticket
            </p>
          </div>
        </div>

        {/* User List */}
        <div className="max-h-64 overflow-y-auto border border-blue-200/50 rounded-xl p-4 mb-6 bg-blue-50/50 backdrop-blur-sm scrollbar-hide">
          {users.length === 0 && (
            <p className="text-gray-500 text-center">
              No users available to share with.
            </p>
          )}
          <ul className="space-y-3">
            {users.map((user) => {
              const isSent = sentUsers.includes(user.id);
              const isLoading = loadingId === user.id;

              return (
                <li
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-blue-100/50 transition"
                >
                  <div className="flex flex-col">
                    <p className="font-semibold text-gray-800 flex items-center gap-2">
                      {user.username}
                    </p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>

                  <button
                    onClick={() => handleShare(user.id)}
                    disabled={isLoading || isSent}
                    className={`px-5 py-2 rounded-xl font-bold shadow-lg transition flex items-center justify-center ${
                      isSent
                        ? "bg-green-600 text-white shadow-green-600/30 cursor-default"
                        : isLoading
                          ? "bg-blue-500/40 cursor-not-allowed text-white"
                          : "bg-blue-700 text-white hover:bg-gradient-to-r hover:from-blue-600 hover:to-blue-800"
                    }`}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Sending...
                      </span>
                    ) : isSent ? (
                      "Sent ✓"
                    ) : (
                      "Send"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Message input removed per request */}

        {/* Footer */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-bold border border-gray-200 hover:border-gray-300 transition tracking-wider"
          >
            Close
          </button>
        </div>
      </div>

      {/* Scoped CSS to hide scrollbars */}
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
