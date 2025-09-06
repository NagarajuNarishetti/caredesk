import { useEffect, useState } from "react";
import API from "../lib/api";
import MediaCard from "../components/MediaCard";
import MediaDetail from "../components/MediaDetail";
import TicketDetail from "../components/TicketDetail";
import InvitationsButton from "../components/InvitationsButton";
import { useRouter } from "next/router";
import { PRIORITY_OPTIONS, getFileType, validateFile, handleTicketUpload, getPriorityDisplayName, formatTimeAgo } from "../utils/ticketUtils";

export default function MediaPage({ keycloak }) {
  const [media, setMedia] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  // Removed file-type filtering UI; keeping only priority
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open"); // New: filter by status
  const [sortBy] = useState("newest");
  const [isSelectedFromShared, setIsSelectedFromShared] = useState(false);
  const [sharedMedia, setSharedMedia] = useState([]);
  const [filterRole, setFilterRole] = useState("all");
  const [filterOrg, setFilterOrg] = useState("all");
  const [sharedMediaLoading, setSharedMediaLoading] = useState(false);
  const [sharedFilterStatus, setSharedFilterStatus] = useState("open"); // New: filter for assigned tickets

  // Upload modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [priorityId, setPriorityId] = useState("1");

  // Invite modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("Customer");
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [searching, setSearching] = useState(false);
  // Organizations for ticket raising
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");

  // Get or create user in database
  const getCurrentUser = async () => {
    if (!keycloak?.authenticated) return null;
    try {
      const keycloakId = keycloak.tokenParsed?.sub;
      const userResponse = await API.get(`/users?keycloak_id=${keycloakId}`);
      if (userResponse.data.length === 0) {
        const newUser = await API.post("/users", {
          keycloak_id: keycloakId,
          username: keycloak.tokenParsed?.preferred_username || "Unknown",
          email: keycloak.tokenParsed?.email || "",
          role: "user",
        });
        return {
          id: newUser.data.id,
          username: newUser.data.username,
          email: newUser.data.email,
        };
      }
      const user = userResponse.data[0];
      return { id: user.id, username: user.username, email: user.email };
    } catch (err) {
      console.error("Error getting current user:", err);
      return null;
    }
  };

  // Fetch tickets for dashboard sections
  const fetchTickets = async (userId) => {
    if (!userId) return;
    console.log("🔄 Fetching tickets for user:", userId);
    setSharedMediaLoading(true);
    try {
      // Tickets raised by this user
      const raisedRes = await API.get(`/tickets?userId=${userId}`);
      const raisedTickets = Array.isArray(raisedRes.data) ? raisedRes.data : [];
      setMedia(raisedTickets);

      // Tickets assigned to this logged-in user (agent view). Use explicit agent param to avoid Keycloak dependency
      const assignedRes = await API.get(`/tickets?assignedTo=${userId}`);
      const assignedRaw = Array.isArray(assignedRes.data) ? assignedRes.data : [];
      const assignedFiltered = assignedRaw.filter(t => t.customer_id !== userId);
      setSharedMedia(assignedFiltered);
    } catch (err) {
      console.error("❌ Error fetching tickets:", err);
      setMedia([]);
      setSharedMedia([]);
    } finally {
      setSharedMediaLoading(false);
    }
  };

  // Get unique organizations and roles for filtering tickets
  const sharedOrganizations = [
    ...new Set(
      sharedMedia.map((item) => item.organization_name).filter(Boolean)
    ),
  ];
  const roles = [
    ...new Set(
      sharedMedia.map((item) => item.status).filter(Boolean)
    ),
  ];

  // Filter tickets based on status and organization
  const filteredSharedMedia = sharedMedia.filter((item) => {
    const matchesStatus =
      sharedFilterStatus === "all" || item.status === sharedFilterStatus;
    const matchesOrg =
      filterOrg === "all" || item.organization_name === filterOrg;

    // Also apply priority filter to shared media
    let matchesPriority = filterPriority === "all";
    if (!matchesPriority) {
      // Check priority_level (number)
      if (item.priority_level && String(item.priority_level) === String(filterPriority)) {
        matchesPriority = true;
      }
      // Check priority (legacy field)
      else if (item.priority && String(item.priority) === String(filterPriority)) {
        matchesPriority = true;
      }
      // Check priority_name (string) - map to numbers
      else if (item.priority_name) {
        const priorityMap = { "Low": "1", "Medium": "2", "High": "3" };
        if (priorityMap[item.priority_name] === String(filterPriority)) {
          matchesPriority = true;
        }
      }
    }

    return matchesStatus && matchesOrg && matchesPriority;
  });


  useEffect(() => {
    const fetchUserAndTickets = async () => {
      if (!keycloak?.authenticated) {
        setLoading(false);
        return;
      }
      try {
        const userData = await getCurrentUser();
        setCurrentUserId(userData?.id);
        setCurrentUser(userData);
        if (!userData?.id) {
          console.error("Could not get user ID");
          setLoading(false);
          return;
        }
        const ticketsResponse = await API.get(`/tickets?userId=${userData.id}`);
        setMedia(ticketsResponse.data);
      } catch (err) {
        console.error("Error fetching tickets", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUserAndTickets();
  }, [keycloak?.authenticated]);

  // Separate useEffect for fetching tickets when currentUserId is available
  useEffect(() => {
    if (currentUserId) {
      fetchTickets(currentUserId);
    }
  }, [currentUserId]);


  // Load organizations of current user (for ticket raising org selection)
  useEffect(() => {
    const loadUserOrganizations = async () => {
      if (!currentUserId) return;
      try {
        const res = await API.get(`/organizations/user/${currentUserId}`);
        const allOrganizations = res.data || [];
        // Only allow organizations where this user is a Customer
        const customerOrganizations = allOrganizations.filter(
          (org) => String(org.role) === "Customer"
        );
        setOrganizations(customerOrganizations);
        if (customerOrganizations.length > 0) {
          setSelectedOrgId(String(customerOrganizations[0].id));
        } else {
          setSelectedOrgId("");
        }
      } catch (e) {
        console.error('Failed to fetch organizations for user', e);
        setOrganizations([]);
        setSelectedOrgId("");
      }
    };
    loadUserOrganizations();
  }, [currentUserId]);

  const refreshMedia = async () => {
    if (!currentUserId) return;
    try {
      const mediaResponse = await API.get(`/media?userId=${currentUserId}`);
      setMedia(mediaResponse.data);
      await fetchTickets(currentUserId);
    } catch (err) {
      console.error("Error refreshing media", err);
    }
  };

  const refreshSharedMedia = async () => {
    if (!currentUserId) return;
    try {
      await fetchTickets(currentUserId);
    } catch (err) {
      console.error("Error refreshing shared media", err);
    }
  };

  const handleEdit = async (id, newTitle) => {
    setMedia((media) =>
      media.map((item) =>
        item.id === id ? { ...item, title: newTitle } : item
      )
    );
    if (selected && selected.id === id) {
      setSelected({ ...selected, title: newTitle });
    }
  };

  // Delete handler
  const handleDelete = async (id) => {
    try {
      await API.delete(`/tickets/${id}`);
      setMedia((media) => media.filter((item) => item.id !== id));
      if (selected && selected.id === id) setSelected(null);
      // Refresh tickets to update both sections
      if (currentUserId) {
        await fetchTickets(currentUserId);
      }
    } catch (err) {
      console.error("Error deleting ticket:", err);
      alert("Failed to delete the ticket. Please try again.");
    }
  };

  // Handle file selection using shared utility
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const error = validateFile(file);
      if (error) {
        setUploadMessage(error);
        return;
      }

      setUploadFile(file);
      setUploadMessage("");

      // Auto-generate title from filename (without extension)
      const nameWithoutExt = file.name.split(".").slice(0, -1).join(".");
      setUploadTitle(nameWithoutExt || file.name);
    }
  };

  // Handle upload using shared utility
  const handleUpload = async (e) => {
    e.preventDefault();

    if (!uploadFile || !uploadTitle.trim()) {
      setUploadMessage("❌ Please select a file and enter a title");
      return;
    }

    if (!currentUserId) {
      setUploadMessage("❌ User not authenticated properly");
      return;
    }

    setUploading(true);

    await handleTicketUpload(
      {
        file: uploadFile,
        title: uploadTitle,
        description: uploadDescription,
        priorityId: priorityId,
        organizationId: selectedOrgId,
        currentUserId: currentUserId
      },
      (message) => {
        setUploadMessage("✅ " + message);

        // Reset form
        setUploadFile(null);
        setUploadTitle("");

        // Reset file input
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = "";

        // Refresh media list
        refreshMedia();

        // Auto-close modal after success
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadMessage("");
        }, 2000);
      },
      (error) => {
        setUploadMessage(error);
      }
    );

    setUploading(false);
  };

  // Close upload modal
  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadFile(null);
    setUploadTitle("");
    setUploadMessage("");
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) fileInput.value = "";
  };

  // Search users function
  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const response = await API.get(`/users?search=${encodeURIComponent(query)}`);
      const filteredUsers = response.data.filter(user => user.keycloak_id !== keycloak.tokenParsed?.sub);
      setSearchResults(filteredUsers);
    } catch (err) {
      console.error("Error searching users:", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchUsers(query);
  };

  // Handle user selection
  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setSearchQuery(user.username);
    setSearchResults([]);
  };

  // Handle invite submission
  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !selectedRole) {
      setInviteMessage("❌ Please select a user and role");
      return;
    }

    setInviting(true);
    try {
      const response = await API.post("/org-invites/send", {
        email: selectedUser.email,
        role: selectedRole,
        invited_by: keycloak.tokenParsed?.sub,
        message: `You have been invited to join an organization as a ${selectedRole}.`
      });

      setInviteMessage("✅ Invitation sent successfully!");
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteMessage("");
        setSelectedUser(null);
        setSearchQuery("");
        setSelectedRole("Customer");
      }, 2000);
    } catch (err) {
      console.error("Error sending invite:", err);
      setInviteMessage("❌ Failed to send invitation: " + (err.response?.data?.error || err.message));
    } finally {
      setInviting(false);
    }
  };

  // Close invite modal
  const closeInviteModal = () => {
    setShowInviteModal(false);
    setSelectedUser(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedRole("Customer");
    setInviteMessage("");
  };

  // Filter and sort media
  const filteredMedia = media
    .filter((item) => {
      // Check priority with multiple field formats
      let matchesPriority = filterPriority === "all";
      if (!matchesPriority) {
        // Check priority_level (number)
        if (item.priority_level && String(item.priority_level) === String(filterPriority)) {
          matchesPriority = true;
        }
        // Check priority (legacy field)
        else if (item.priority && String(item.priority) === String(filterPriority)) {
          matchesPriority = true;
        }
        // Check priority_name (string) - map to numbers
        else if (item.priority_name) {
          const priorityMap = { "Low": "1", "Medium": "2", "High": "3" };
          if (priorityMap[item.priority_name] === String(filterPriority)) {
            matchesPriority = true;
          }
        }
      }

      const matchesStatus =
        filterStatus === "all" || item?.status === filterStatus;
      return matchesPriority && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at) - new Date(a.created_at);
        case "oldest":
          return new Date(a.created_at) - new Date(b.created_at);
        case "alphabetical":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

  const router = useRouter();

  if (!keycloak?.authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center p-12 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl max-w-md">
          <h2 className="text-3xl font-bold text-gray-800 mb-4 tracking-wide">
            caredesk
          </h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Your multi-tenant support portal
          </p>
          <button
            onClick={() => keycloak.login()}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl hover:shadow-3xl hover:scale-105 transform duration-300 border border-blue-300 tracking-wider"
          >
            ENTER
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6 shadow-2xl"></div>
          <p className="text-gray-700 text-xl font-semibold tracking-wide">
            Loading your workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      {/* Header Section */}
      <div className="pt-12 px-8 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* Royal Welcome Area */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold border-2 border-blue-200 shadow-xl">
                  {keycloak.tokenParsed?.preferred_username[0].toUpperCase()}
                </div>
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl font-bold text-gray-800 mb-1 tracking-wide">
                    Welcome {keycloak.tokenParsed?.preferred_username}
                  </h1>
                  <button
                    onClick={() => router.push('/organizations')}
                    className="px-4 py-2 bg-white/80 backdrop-blur-md text-slate-700 rounded-xl hover:bg-white hover:shadow-lg transition-all font-semibold shadow-xl flex items-center gap-2 group border border-emerald-200/60 hover:border-emerald-300 tracking-wide"
                  >
                    <svg className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Organizations
                  </button>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="px-4 py-2 bg-purple-100/80 backdrop-blur-md text-purple-700 rounded-xl hover:bg-purple-200 hover:shadow-lg transition-all font-semibold shadow-xl flex items-center gap-2 group border border-purple-200/50 hover:border-purple-300 tracking-wide"
                  >
                    <svg className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    Invite to Org
                  </button>
                  <InvitationsButton keycloak={keycloak} />
                </div>
              </div>

              {/* Upload moved to floating action button */}
            </div>


          </div>

          {/* Controls moved to header as dropdown */}
        </div>
      </div>

      {/* Floating Upload Button - bottom right */}
      <button
        onClick={() => setShowUploadModal(true)}
        aria-label="Upload"
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-2xl hover:from-emerald-400 hover:to-teal-400 border border-emerald-300 flex items-center justify-center transition-transform duration-200 hover:scale-105"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* invitations button renders its own badge; no inline scripts */}

      {/* Media Grid */}
      <div className="px-8 pb-12">
        <div className="max-w-7xl mx-auto">
          {/* Persistent Header with Filters */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              <h2 className="text-2xl font-bold text-gray-800 tracking-wide">
                TICKETS RAISED BY YOU
              </h2>
              {/* Type filter removed */}
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-3 py-2 bg-white/90 backdrop-blur-2xl rounded-xl border border-emerald-200/50 text-sm text-gray-700 shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                <option value="all">All Priorities</option>
                {PRIORITY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} Priority
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 bg-white/90 backdrop-blur-2xl rounded-xl border border-emerald-200/50 text-sm text-gray-700 shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                <option value="open">Open Tickets</option>
                <option value="closed">Closed Tickets</option>
                <option value="all">All Tickets</option>
              </select>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-100/80 backdrop-blur-3xl rounded-xl border border-emerald-200 shadow-xl">
                  <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
                  </svg>
                  <span className="text-emerald-700 text-sm font-semibold tracking-wider">
                    {media.length} Total
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-teal-100/80 backdrop-blur-3xl rounded-xl border border-teal-200 shadow-xl">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 9a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-teal-700 text-sm font-semibold tracking-wider">
                    {media.filter((m) => m.status === "open").length} Open
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50/80 backdrop-blur-3xl rounded-xl border border-emerald-200 shadow-xl">
                  <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span className="text-emerald-700 text-sm font-semibold tracking-wider">
                    {media.filter((m) => m.status === "closed").length} Closed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {filteredMedia.length === 0 ? (
            <div className="text-center py-20 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl">
              <div className="text-6xl mb-6">
                <i
                  className="fa-solid fa-folder-open"
                  style={{ color: "#96C2DB", fontSize: "45px" }}
                ></i>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-4 tracking-wide">
                NO TICKETS FOUND
              </h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
                You haven't raised any tickets yet. Create your first support ticket.
              </p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 backdrop-blur-md text-white rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl hover:shadow-3xl group border border-blue-400 tracking-wide"
              >
                <svg
                  className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                RAISE TICKET
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredMedia.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onClick={() => {
                    setSelected(item);
                    // Use TicketDetail modal even for tickets raised by you
                    setIsSelectedFromShared(true);
                  }}
                  currentUserId={currentUserId}
                  onEdit={null}
                  onDelete={null}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Shared Media Section */}
      <div className="px-8 pb-12">
        <div className="max-w-7xl mx-auto">

          {/* Shared Media Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-gray-800 tracking-wide">
                TICKETS ASSIGNED TO YOU
              </h2>
              <span className="px-4 py-2 bg-blue-100/80 backdrop-blur-3xl rounded-xl text-blue-700 text-sm border border-blue-200 font-semibold tracking-wider shadow-xl">
                {filteredSharedMedia.length} ITEM
                {filteredSharedMedia.length !== 1 ? "S" : ""}
              </span>
            </div>

            {/* Shared Media Controls */}
            <div className="flex items-center gap-4">
              {/* Refresh Button */}
              <button
                onClick={refreshSharedMedia}
                className="px-4 py-2 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-white transition-all duration-300 flex items-center gap-2 shadow-lg"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>

              {/* Shared Media Filters */}
              <div className="flex items-center gap-4">
                {/* Organization Filter */}
                {sharedOrganizations.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={filterOrg}
                      onChange={(e) => setFilterOrg(e.target.value)}
                      className="px-3 py-2 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 focus:text-gray-800 hover:bg-white focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-600/30 transition-all duration-300"
                    >
                      <option value="all" className="bg-white text-gray-800">
                        All Organizations
                      </option>
                      {sharedOrganizations.map((org) => (
                        <option
                          key={org}
                          value={org}
                          className="bg-white text-gray-800 hover:text-gray-900"
                        >
                          {org}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {/* Priority Filter (client-side only if available) */}
                <div className="flex items-center gap-2">
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="px-3 py-2 bg-white/80 backdrop-blur-2xl border border-emerald-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 focus:text-gray-800 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/30 transition-all duration-300"
                  >
                    <option value="all" className="bg-white text-gray-800">All Priorities</option>
                    {PRIORITY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value} className="bg-white text-gray-800">
                        {option.label} Priority
                      </option>
                    ))}
                  </select>
                </div>
                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <select
                    value={sharedFilterStatus}
                    onChange={(e) => setSharedFilterStatus(e.target.value)}
                    className="px-3 py-2 bg-white/80 backdrop-blur-2xl border border-blue-200/50 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-800 focus:text-gray-800 hover:bg-white focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-600/30 transition-all duration-300"
                  >
                    <option value="open" className="bg-white text-gray-800">Open Tickets</option>
                    <option value="closed" className="bg-white text-gray-800">Closed Tickets</option>
                    <option value="all" className="bg-white text-gray-800">All Tickets</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Shared Media Content */}
          {sharedMediaLoading ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6 shadow-2xl"></div>
              <p className="text-gray-700 text-xl font-semibold tracking-wide">
                Loading tickets...
              </p>
            </div>
          ) : filteredSharedMedia.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredSharedMedia.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelected(item);
                    setIsSelectedFromShared(true);
                  }}
                  className="group cursor-pointer relative"
                >
                  <div className="relative p-[1px] rounded-2xl bg-gradient-to-br from-blue-200/30 via-blue-100/20 to-transparent hover:from-blue-300/40 hover:via-blue-200/30 transition-all duration-700 hover:scale-[1.01] shadow-2xl hover:shadow-3xl">
                    <div className="relative bg-white rounded-2xl overflow-hidden backdrop-blur-xl border border-blue-200/50">
                      {/* Ticket Container */}
                      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 rounded-t-2xl flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-2">
                            <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 9a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V9z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <p className="text-sm text-blue-600 font-semibold">Support Ticket</p>
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="p-6 bg-white backdrop-blur-md border-t border-blue-200/50">
                        <h3 className="text-gray-800 font-semibold text-lg mb-1 line-clamp-2 leading-tight group-hover:text-blue-600 transition duration-300">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                          <span className="font-semibold">Raised by:</span>
                          <span className="font-bold">{item.customer_name || 'Unknown'}</span>
                          <span>· {formatTimeAgo(item.created_at)}</span>
                        </div>
                        {item.organization_name &&
                          item.organization_name !== "Unknown Organization" && (
                            <div className="flex items-center gap-2 text-sm text-blue-600 mb-2">
                              <span className="truncate">
                                {item.organization_name}
                              </span>
                            </div>
                          )}
                        {item.message && (
                          <p className="text-xs text-gray-500 italic line-clamp-2 mb-2">
                            &ldquo;{item.message}&rdquo;
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                          <span>
                            Role: {item.permission_level === "Agent" ? "Agent" : "Customer"}
                          </span>
                          <span>
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
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/[0.01] backdrop-blur-3xl rounded-3xl border border-white/10 shadow-2xl">
              <div className="text-6xl mb-6">
                <i
                  className="fa-solid fa-share-nodes"
                  style={{ color: "#ffffff", fontSize: "45px" }}
                ></i>
              </div>
              <h3 className="text-xl font-bold text-white mb-4 tracking-wide">
                NO TICKETS ASSIGNED YET
              </h3>
              <p className="text-white/60 mb-8 max-w-md mx-auto leading-relaxed">
                Tickets assigned to you within organizations will appear here.
              </p>
              <button
                onClick={() => router.push('/organizations')}
                className="inline-flex items-center gap-3 px-6 py-3 bg-white/[0.02] backdrop-blur-md text-white rounded-2xl hover:from-white/30 hover:to-white/15 transition-all font-bold shadow-2xl hover:shadow-3xl flex items-center gap-3 group border border-white/20 tracking-wide"
              >
                <svg
                  className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                EXPLORE ORGANIZATIONS
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={closeUploadModal}
        >
          <div
            className="bg-white/95 rounded-3xl border border-blue-200/50 shadow-2xl backdrop-blur-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-8 border-b border-blue-200/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200">
                  <svg
                    className="w-6 h-6 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 tracking-wide">
                    Raise Ticket
                  </h3>
                  <p className="text-gray-600">
                    Attach a file and describe your issue
                  </p>
                </div>
              </div>

              <button
                onClick={closeUploadModal}
                className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 transition-all border border-gray-200 hover:border-gray-300"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8">
              <form onSubmit={handleUpload} className="space-y-6">
                {/* File Input */}
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-4 tracking-wider">
                    SELECT FILE
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-blue-300 rounded-2xl p-12 text-center hover:border-blue-400 transition-all bg-blue-50/50">
                      {uploadFile ? (
                        <div className="text-gray-800">
                          <div className="text-5xl mb-4 text-blue-500">
                            {uploadFile.type.startsWith("image/") ? (
                              <i
                                className="fa-solid fa-image"
                                style={{ color: "#96C2DB", fontSize: "38px" }}
                              ></i>
                            ) : uploadFile.type.startsWith("video/") ? (
                              <i
                                className="fa-solid fa-video"
                                style={{ color: "#96C2DB", fontSize: "38px" }}
                              ></i>
                            ) : (
                              <i
                                className="fa-solid fa-file"
                                style={{ color: "#96C2DB", fontSize: "38px" }}
                              ></i>
                            )}
                          </div>
                          <p className="font-bold text-lg mb-2">
                            {uploadFile.name}
                          </p>
                          <p className="text-gray-600 text-sm">
                            {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB •{" "}
                            {getFileType(uploadFile).toUpperCase()}
                          </p>
                        </div>
                      ) : (
                        <div className="text-gray-600">
                          <div className="text-5xl mb-4 text-blue-400">
                            <i className="fa-solid fa-cloud-arrow-up" style={{ color: "#96C2DB", fontSize: "50px" }}></i>
                          </div>
                          <p className="text-lg mb-2">Drop a file here or click to browse</p>
                          <p className="text-sm">Support files and attachments supported (Max 50MB)</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Title Input */}
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-4 tracking-wider">
                    TICKET TITLE
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Enter a descriptive title..."
                    className="w-full px-4 py-4 bg-white border border-blue-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all text-lg"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-4 tracking-wider">
                    DESCRIPTION
                  </label>
                  <textarea
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="Add details about the issue..."
                    rows={4}
                    className="w-full px-4 py-4 bg-white border border-blue-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all text-base"
                  />
                </div>

                {/* Organization Select */}
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-4 tracking-wider">
                    ORGANIZATION
                  </label>
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="w-full px-4 py-4 bg-white border border-blue-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all text-lg"
                  >
                    {organizations.length === 0 && (
                      <option value="">No organizations found</option>
                    )}
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                {/* Priority Select */}
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-4 tracking-wider">
                    PRIORITY
                  </label>
                  <select
                    value={priorityId}
                    onChange={(e) => setPriorityId(e.target.value)}
                    className="w-full px-4 py-4 bg-white border border-blue-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all text-lg"
                  >
                    {PRIORITY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message */}
                {uploadMessage && (
                  <div
                    className={`p-4 rounded-xl font-semibold text-center ${uploadMessage.includes("✅") ? "bg-green-100 text-green-700 border border-green-300" : "bg-red-100 text-red-700 border border-red-300"}`}
                  >
                    {uploadMessage}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-4 pt-4">
                  <button type="button" onClick={closeUploadModal} className="flex-1 px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all font-bold border border-gray-200 hover:border-gray-300 tracking-wider">Close</button>

                  <button
                    type="submit"
                    disabled={uploading || !uploadFile || !uploadTitle.trim()}
                    className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed border border-blue-400 tracking-wider flex items-center justify-center gap-3"
                  >
                    {uploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        Submit Ticket
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Ticket detail for assigned tickets; Media detail for legacy */}
      {selected && isSelectedFromShared && (
        <TicketDetail
          ticket={selected}
          viewerId={currentUserId}
          onClose={() => setSelected(null)}
          onUpdated={() => fetchTickets(currentUserId)}
        />
      )}
      {selected && !isSelectedFromShared && (
        <MediaDetail
          item={selected}
          onClose={() => {
            setSelected(null);
          }}
          currentUser={currentUser}
          permissionLevel={null}
          isSharedMedia={false}
        />
      )}

      {/* Invite to Organization Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={closeInviteModal}
        >
          <div
            className="bg-white rounded-3xl border border-blue-200/50 shadow-2xl backdrop-blur-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-8 border-b border-blue-200/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center border border-purple-200">
                  <svg
                    className="w-6 h-6 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 tracking-wide">
                    Invite to Organization
                  </h3>
                  <p className="text-gray-600">
                    Search and invite users to your organization
                  </p>
                </div>
              </div>

              <button
                onClick={closeInviteModal}
                className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-700 transition-all border border-gray-200 hover:border-gray-300"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8">
              <form onSubmit={handleInviteSubmit} className="space-y-6">
                {/* Search Input */}
                <div>
                  <label className="block text-gray-800 text-sm font-bold mb-4 tracking-wider">
                    SEARCH USERS
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      placeholder="Search by username..."
                      className="w-full px-4 py-4 bg-gray-50 backdrop-blur-3xl border border-gray-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition-all text-lg"
                    />

                    {/* Search Results Dropdown */}
                    {searching && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-10">
                        <div className="flex items-center justify-center gap-3 text-gray-600">
                          <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin"></div>
                          <span>Searching users...</span>
                        </div>
                      </div>
                    )}
                    {!searching && searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto z-10">
                        {searchResults.map((user) => (
                          <div
                            key={user.id}
                            onClick={() => handleUserSelect(user)}
                            className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-semibold text-sm">
                                {user.username[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-800">{user.username}</div>
                                <div className="text-sm text-gray-500">{user.email}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected User Display */}
                {selectedUser && (
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-semibold">
                        {selectedUser.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{selectedUser.username}</div>
                        <div className="text-sm text-gray-500">{selectedUser.email}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Role Selection */}
                <div>
                  <label className="block text-gray-800 text-sm font-bold mb-4 tracking-wider">
                    ASSIGN ROLE
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setSelectedRole("Customer")}
                      className={`p-4 rounded-xl border-2 transition-all ${selectedRole === "Customer"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                        }`}
                    >
                      <div className="text-center">
                        <div className="text-lg font-semibold mb-1">Customer</div>
                        <div className="text-sm">Can raise tickets</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRole("Agent")}
                      className={`p-4 rounded-xl border-2 transition-all ${selectedRole === "Agent"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                        }`}
                    >
                      <div className="text-center">
                        <div className="text-lg font-semibold mb-1">Agent</div>
                        <div className="text-sm">Can work on assigned tickets</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Message */}
                {inviteMessage && (
                  <div
                    className={`p-4 rounded-xl font-semibold text-center ${inviteMessage.includes("✅")
                      ? "bg-green-100 text-green-700 border border-green-300"
                      : "bg-red-100 text-red-700 border border-red-300"
                      }`}
                  >
                    {inviteMessage}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-4 pt-4">
                  <button
                    type="button"
                    onClick={closeInviteModal}
                    className="flex-1 px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all font-bold border border-gray-200 hover:border-gray-300 tracking-wider"
                  >
                    CANCEL
                  </button>

                  <button
                    type="submit"
                    disabled={inviting || !selectedUser}
                    className="flex-1 px-6 py-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-400 hover:to-purple-500 transition-all font-bold shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed border border-purple-400 tracking-wider flex items-center justify-center gap-3"
                  >
                    {inviting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        SENDING...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                          />
                        </svg>
                        SEND INVITE
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
