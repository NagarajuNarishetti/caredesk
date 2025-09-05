import { useEffect, useState } from "react";
import API from "../lib/api";
import MediaCard from "../components/MediaCard";
import MediaDetail from "../components/MediaDetail";

export default function SharedMediaPage({ keycloak }) {
  const [sharedMedia, setSharedMedia] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterRole, setFilterRole] = useState("all");
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  // Get unique organizations and roles for filtering
  const organizations = [
    ...new Set(
      sharedMedia.map((item) => item.organization_name).filter(Boolean)
    ),
  ];
  const roles = [
    ...new Set(
      sharedMedia.map((item) => item.permission_level).filter(Boolean)
    ),
  ];

  // Get current user ID and info on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!keycloak?.authenticated) {
        setLoading(false);
        return;
      }

      try {
        const keycloakId = keycloak.tokenParsed?.sub;
        const userResponse = await API.get(`/users?keycloak_id=${keycloakId}`);

        if (userResponse.data.length === 0) {
          setLoading(false);
          return;
        }

        const userData = userResponse.data[0];
        setCurrentUserId(userData.id);
        setCurrentUser({
          id: userData.id,
          username: userData.username,
          email: userData.email,
        });
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    };

    fetchCurrentUser();
  }, [keycloak]);

  // Fetch shared media once currentUserId is set
  useEffect(() => {
    const fetchSharedMedia = async () => {
      if (!currentUserId) return;

      setLoading(true);
      try {
        const response = await API.get(`/media-shared/${currentUserId}`);
        setSharedMedia(response.data);
      } catch (err) {
        console.error("Error fetching shared media:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSharedMedia();
  }, [currentUserId]);

  // Filter shared media based on role and organization
  const filteredMedia = sharedMedia.filter((item) => {
    const matchesRole =
      filterRole === "all" || item.permission_level === filterRole;
    const matchesOrg =
      filterOrg === "all" || item.organization_name === filterOrg;
    const matchesPriority =
      filterPriority === "all" || String(item?.priority) === String(filterPriority);
    return matchesRole && matchesOrg && matchesPriority;
  });

  // Format time ago helper
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

  // Get role badge styling
  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "owner":
        return "bg-purple-600";
      case "reviewer":
        return "bg-blue-600";
      case "viewer":
        return "bg-green-600";
      default:
        return "bg-gray-600";
    }
  };

  // Enhanced MediaCard for shared media
  // Enhanced MediaCard for shared media - matches MediaCard.js styling
  const SharedMediaCard = ({ item }) => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const src = `${API_BASE}${item.file_path}`;

    return (
      <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl overflow-hidden border border-gray-700/50 hover:border-purple-400/50 transition-all duration-300 group cursor-pointer shadow-lg hover:shadow-xl">
        {/* Media Container */}
        <div
          className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden"
          onClick={() => setSelected(item)}
        >
          {/* Media Content */}
          {item.type === "image" ? (
            <img
              src={src}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                e.target.src = "/placeholder-image.png";
              }}
            />
          ) : (
            <video
              src={src}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              muted
            />
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Permission Badge */}
          <div className="absolute top-3 right-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold text-white backdrop-blur-sm ${getRoleBadgeColor(item.permission_level)} shadow-lg`}
            >
              {item.permission_level?.toUpperCase()}
            </span>
          </div>

          {/* Play icon for videos */}
          {item.type === "video" && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform duration-300">
                <div className="w-0 h-0 border-l-[12px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1"></div>
              </div>
            </div>
          )}

          {/* Hover Overlay with Action Hint */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/30">
            <div className="text-white text-center transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <div className="text-sm font-medium mb-1">Click to view</div>
              <div className="text-xs text-gray-300">
                {item.permission_level === "viewer"
                  ? "View only"
                  : "Can comment & annotate"}
              </div>
            </div>
          </div>
        </div>

        {/* Card Content */}
        <div className="p-4">
          {/* Title */}
          <h3 className="font-semibold text-white text-lg mb-3 truncate group-hover:text-purple-300 transition-colors duration-200">
            {item.title}
          </h3>

          {/* Metadata Grid */}
          <div className="space-y-2.5">
            {/* Shared by */}
            <div className="flex items-center text-gray-400 group-hover:text-gray-300 transition-colors duration-200">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-3 shadow-md">
                {item.shared_by_username?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="text-white font-medium">
                    {item.shared_by_username}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Shared this with you
                </div>
              </div>
            </div>

            {/* Organization */}
            {item.organization_name &&
              item.organization_name !== "Unknown Organization" && (
                <div className="flex items-center text-gray-400">
                  <i className="fas fa-building w-4 mr-3 text-center text-purple-400"></i>
                  <div className="flex-1">
                    <div className="text-sm text-white font-medium truncate">
                      {item.organization_name}
                    </div>
                    <div className="text-xs text-gray-500">Organization</div>
                  </div>
                </div>
              )}

            {/* Time & Message */}
            <div className="flex items-start text-gray-400">
              <i className="fas fa-clock w-4 mr-3 text-center text-blue-400 mt-0.5"></i>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-300">
                  {formatTimeAgo(item.shared_at)}
                </div>
                {item.message && (
                  <div className="text-xs text-gray-400 mt-1 italic truncate">
                    "{item.message}"
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer with permission indicator */}
          <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${item.permission_level === "reviewer"
                  ? "bg-blue-400"
                  : "bg-green-400"
                  } shadow-sm`}
              ></div>
              <span className="text-xs text-gray-400">
                {item.permission_level === "reviewer"
                  ? "Can interact"
                  : "View only"}
              </span>
            </div>

            <div className="text-xs text-gray-500">
              {item.type === "image" ? "📷" : "🎥"} {item.type}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!keycloak?.authenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-gray-400">Please log in to view shared media.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading shared media...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-wide text-gray-800 mb-2">
            Tickets Assigned to You
          </h1>
          <p className="text-gray-600 text-sm font-semibold">
            Tickets assigned to you within your organizations
          </p>
        </div>
        {/* Filters */}
        {sharedMedia.length > 0 && (
          <div className="mb-10 flex flex-wrap gap-8">
            {/* Organization Filter */}
            {organizations.length > 0 && (
              <div className="flex flex-col">
                <label className="block text-xs font-semibold uppercase text-gray-600 tracking-wider mb-3">
                  Organization
                </label>
                <div className="relative group">
                  <select
                    value={filterOrg}
                    onChange={(e) => setFilterOrg(e.target.value)}
                    className="appearance-none w-64 bg-white/80 backdrop-blur-2xl border border-emerald-200/50 rounded-xl px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-800 focus:text-gray-800 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/30 transition-all duration-300 ease-out shadow-lg hover:shadow-xl"
                  >
                    <option
                      value="all"
                      className="bg-white text-gray-800"
                    >
                      All Organizations
                    </option>
                    {organizations.map((org) => (
                      <option
                        key={org}
                        value={org}
                        className="bg-white text-gray-800 hover:text-gray-900"
                      >
                        {org}
                      </option>
                    ))}
                  </select>
                  {/* Dropdown Arrow */}
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg
                      className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            )}
            {/* Priority Filter */}
            <div className="flex flex-col">
              <label className="block text-xs font-semibold uppercase text-gray-600 tracking-wider mb-3">
                Priority
              </label>
              <div className="relative group">
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="appearance-none w-48 bg-white/80 backdrop-blur-2xl border border-emerald-200/50 rounded-xl px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-800 focus:text-gray-800 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/30 transition-all duration-300 ease-out shadow-lg hover:shadow-xl"
                >
                  <option value="all" className="bg-white text-gray-800">All</option>
                  <option value="1" className="bg-white text-gray-800">Priority 1</option>
                  <option value="2" className="bg-white text-gray-800">Priority 2</option>
                  <option value="3" className="bg-white text-gray-800">Priority 3</option>
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Media grid */}
        {filteredMedia.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-2xl font-semibold mb-3 text-gray-800 tracking-wide">
              {sharedMedia.length === 0
                ? "No Shared Media"
                : "No Matches Found"}
            </h3>
            <p className="text-gray-600 text-sm">
              {sharedMedia.length === 0
                ? "You haven't received any media yet."
                : "Try changing your filters to see more content."}
            </p>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredMedia.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelected(item)}
                className="group cursor-pointer relative"
              >
                <div className="relative p-[1px] rounded-2xl bg-gradient-to-br from-emerald-200/30 via-teal-100/20 to-transparent hover:from-emerald-300/40 hover:via-teal-200/30 transition-all duration-700 hover:scale-[1.01] shadow-2xl hover:shadow-3xl">
                  <div className="relative bg-white rounded-2xl overflow-hidden backdrop-blur-xl border border-emerald-200/50">
                    {/* Media Container */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50 rounded-t-2xl">
                      {item.type === "image" ? (
                        <img
                          src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${item.file_path}`}
                          alt={item.title}
                          className="w-full h-full object-cover transition-all duration-1000 ease-out group-hover:scale-110 group-hover:contrast-125"
                          onError={(e) => {
                            e.target.src = "/placeholder-image.png";
                          }}
                        />
                      ) : (
                        <video
                          src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${item.file_path}`}
                          className="w-full h-full object-cover transition-all duration-1000 ease-out group-hover:scale-110"
                          muted
                          preload="metadata"
                          style={{ background: "#E5EDF1" }}
                        />
                      )}
                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/10 via-transparent to-emerald-100/10 opacity-70 group-hover:opacity-90 transition duration-500"></div>
                      {/* Role badge removed for agent-only view */}

                      {/* Play Button Animation */}
                      {item.type === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 bg-purple-500/30 backdrop-blur-md rounded-full flex items-center justify-center border border-white/50 opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all duration-500">
                            <div className="w-0 h-0 border-l-[12px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1"></div>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Card Content */}
                    <div className="p-6 bg-white backdrop-blur-md border-t border-emerald-200/50">
                      <h3 className="text-gray-800 font-semibold text-lg mb-2 line-clamp-2 leading-tight group-hover:text-emerald-600 transition duration-300">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <span className="font-bold">
                          {item.shared_by_username || "Unknown"}
                        </span>
                        <span>· {formatTimeAgo(item.shared_at)}</span>
                      </div>
                      {item.organization_name &&
                        item.organization_name !== "Unknown Organization" && (
                          <div className="flex items-center text-sm text-emerald-700 mb-2">
                            <span className="truncate">
                              {item.organization_name}
                            </span>
                          </div>
                        )}
                      {item.message && (
                        <p className="text-xs text-gray-500 italic line-clamp-2 mb-2">
                          "{item.message}"
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <span>
                          Access:
                          {item.permission_level === "reviewer"
                            ? " Can Interact"
                            : " View Only"}
                        </span>
                        <span>{item.type === "image" ? "Image" : "Video"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Media Detail Modal */}
        {selected && (
          <MediaDetail
            item={selected}
            onClose={() => setSelected(null)}
            currentUser={currentUser}
            permissionLevel={selected.permission_level}
            isSharedMedia={true}
          />
        )}
      </div>
    </div>
  );
}
