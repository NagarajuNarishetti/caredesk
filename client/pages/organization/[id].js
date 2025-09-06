import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import API from "../../lib/api";
import MediaCard from "../../components/MediaCard";
import TicketDetail from "../../components/TicketDetail";
import { PRIORITY_OPTIONS, getFileType, validateFile, handleTicketUpload, getPriorityDisplayName } from "../../utils/ticketUtils";

export default function OrganizationDashboard({ keycloak }) {
    const router = useRouter();
    const { id: orgId, role } = router.query;

    const [organization, setOrganization] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [showTicketDetail, setShowTicketDetail] = useState(false);

    // Customer-specific states
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadDescription, setUploadDescription] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState("");
    const [priorityId, setPriorityId] = useState("1");

    // Filter states for org admins
    const [filterPriority, setFilterPriority] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");

    // Get current user ID
    useEffect(() => {
        const fetchCurrentUserId = async () => {
            if (!keycloak?.authenticated) {
                setLoading(false);
                return;
            }

            try {
                const keycloakId = keycloak.tokenParsed?.sub;
                const userResponse = await API.get(`/users?keycloak_id=${keycloakId}`);

                if (userResponse.data.length === 0) {
                    setError("User not found");
                    setLoading(false);
                    return;
                }

                setCurrentUserId(userResponse.data[0].id);
            } catch (err) {
                console.error("Error fetching current user ID:", err);
                setError("Failed to fetch user information");
                setLoading(false);
            }
        };

        fetchCurrentUserId();
    }, [keycloak]);

    // Fetch organization details and verify user access
    useEffect(() => {
        const fetchOrganization = async () => {
            if (!orgId || !currentUserId) return;

            try {
                // First, verify user has access to this organization
                const userOrgsResponse = await API.get(`/organizations/user/${currentUserId}`);
                const userOrg = userOrgsResponse.data.find(org => org.id === orgId);

                if (!userOrg) {
                    setError("You don't have access to this organization");
                    setLoading(false);
                    return;
                }

                // Set user's role in this organization (use actual role from database, not URL param)
                setUserRole(userOrg.role);

                // If URL role doesn't match actual role, redirect with correct role
                if (role && role !== userOrg.role) {
                    router.replace(`/organization/${orgId}?role=${userOrg.role}`, undefined, { shallow: true });
                }

                // Get organization details
                const response = await API.get(`/organizations/${orgId}`);
                setOrganization(response.data);
            } catch (err) {
                console.error("Error fetching organization:", err);
                setError("Failed to fetch organization details");
                setLoading(false);
            }
        };

        fetchOrganization();
    }, [orgId, currentUserId]);

    // Fetch tickets based on role
    useEffect(() => {
        const fetchTickets = async () => {
            if (!currentUserId || !orgId || !userRole) return;

            try {
                let response;
                if (userRole?.toLowerCase() === 'customer' || userRole?.toLowerCase() === 'viewer') {
                    // Customer: fetch their own tickets
                    response = await API.get(`/tickets?userId=${currentUserId}`);
                } else if (userRole?.toLowerCase() === 'agent' || userRole?.toLowerCase() === 'reviewer') {
                    // Agent: fetch tickets assigned to them
                    response = await API.get(`/tickets?assignedTo=${currentUserId}`);
                } else {
                    // Org Admin: fetch all tickets in organization
                    response = await API.get(`/tickets`);
                }

                // Filter tickets for this organization
                // More robust filtering - handle both string and UUID comparisons
                const orgTickets = response.data.filter(ticket => {
                    const ticketOrgId = String(ticket.organization_id);
                    const targetOrgId = String(orgId);
                    return ticketOrgId === targetOrgId;
                });

                setTickets(orgTickets);
            } catch (err) {
                console.error("Error fetching tickets:", err);
                setError("Failed to fetch tickets");
            } finally {
                setLoading(false);
            }
        };

        fetchTickets();
    }, [currentUserId, orgId, userRole]);


    // File handling functions using shared utilities
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
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadTitle.trim()) return;

        setUploading(true);
        setUploadMessage("");

        await handleTicketUpload(
            {
                file: uploadFile,
                title: uploadTitle,
                description: uploadDescription,
                priorityId: priorityId,
                organizationId: orgId,
                currentUserId: currentUserId
            },
            (message) => {
                setUploadMessage("✅ " + message);
                setUploadFile(null);
                setUploadTitle("");
                setUploadDescription("");
                setPriorityId("1");

                // Refresh tickets
                handleTicketUpdated();

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

    const closeUploadModal = () => {
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadTitle("");
        setUploadDescription("");
        setUploadMessage("");
        setPriorityId("1");
    };

    const handleTicketClick = (ticket) => {
        setSelectedTicket(ticket);
        setShowTicketDetail(true);
    };

    const handleCloseTicketDetail = () => {
        setShowTicketDetail(false);
        setSelectedTicket(null);
    };

    const handleTicketUpdated = async () => {
        // Refresh tickets list
        try {
            let response;
            if (userRole?.toLowerCase() === 'customer' || userRole?.toLowerCase() === 'viewer') {
                response = await API.get(`/tickets?userId=${currentUserId}`);
            } else if (userRole?.toLowerCase() === 'agent' || userRole?.toLowerCase() === 'reviewer') {
                response = await API.get(`/tickets?assignedTo=${currentUserId}`);
            } else {
                response = await API.get(`/tickets`);
            }

            const orgTickets = response.data.filter(ticket => {
                const ticketOrgId = String(ticket.organization_id);
                const targetOrgId = String(orgId);
                return ticketOrgId === targetOrgId;
            });
            setTickets(orgTickets);
        } catch (err) {
            console.error("Error refreshing tickets:", err);
        }
    };

    const getRoleDisplayName = (role) => {
        switch (role?.toLowerCase()) {
            case 'orgadmin':
            case 'owner':
                return 'Organization Admin';
            case 'agent':
            case 'reviewer':
                return 'Agent';
            case 'customer':
            case 'viewer':
                return 'Customer';
            default:
                return role;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'open':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'in_progress':
                return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'resolved':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'closed':
                return 'bg-gray-100 text-gray-800 border-gray-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority?.toLowerCase()) {
            case 'high':
                return 'bg-red-100 text-red-800 border-red-200';
            case 'medium':
                return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'low':
                return 'bg-green-100 text-green-800 border-green-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    // Filter tickets based on selected filters
    const getFilteredTickets = () => {
        let filtered = tickets;

        // Filter by priority
        if (filterPriority !== "all") {
            filtered = filtered.filter(ticket => {
                const priorityLevel = ticket.priority_level || ticket.priority;
                return String(priorityLevel) === filterPriority;
            });
        }

        // Filter by status
        if (filterStatus !== "all") {
            filtered = filtered.filter(ticket => ticket.status === filterStatus);
        }

        return filtered;
    };

    if (!keycloak?.authenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                <div className="text-center p-12 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl max-w-md">
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h1>
                    <p className="text-gray-600">Please log in to access this organization.</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading organization dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                <div className="text-center p-12 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl max-w-md">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Error</h1>
                    <p className="text-gray-600">{error}</p>
                    <button
                        onClick={() => router.push('/organizations')}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Back to Organizations
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <button
                                onClick={() => router.push('/organizations')}
                                className="mb-4 flex items-center text-blue-600 hover:text-blue-700 transition-colors"
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                Back to Organizations
                            </button>
                            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-1">
                                {organization?.name || 'Organization Dashboard'}
                            </h1>
                            <p className="text-gray-600 text-sm">
                                Role: {getRoleDisplayName(userRole)} • {getFilteredTickets().length} tickets
                            </p>
                        </div>
                        {(userRole?.toLowerCase() === 'customer' || userRole?.toLowerCase() === 'viewer') && (
                            <button
                                onClick={() => setShowUploadModal(true)}
                                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-400 hover:to-blue-700 transition-colors shadow-lg"
                            >
                                + Raise Ticket
                            </button>
                        )}
                    </div>
                </div>

                {/* Filters for All Users */}
                <div className="mb-8">
                    <div className="flex items-center gap-6">
                        <h2 className="text-xl font-bold text-gray-800 tracking-wide">
                            {userRole?.toLowerCase() === 'orgadmin' ? 'Organization Tickets' :
                                userRole?.toLowerCase() === 'agent' ? 'Assigned Tickets' :
                                    'Your Tickets'}
                        </h2>
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
                            <option value="all">All Tickets</option>
                            <option value="open">Open Tickets</option>
                            <option value="closed">Closed Tickets</option>
                        </select>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-100/80 backdrop-blur-3xl rounded-xl border border-emerald-200 shadow-xl">
                                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2v1a1 1 0 001 1h6a1 1 0 001-1V3a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                </svg>
                                <span className="text-emerald-700 font-semibold text-sm">{getFilteredTickets().length} Total</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-green-100/80 backdrop-blur-3xl rounded-xl border border-green-200 shadow-xl">
                                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-green-700 font-semibold text-sm">{getFilteredTickets().filter(t => t.status === 'open').length} Open</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-100/80 backdrop-blur-3xl rounded-xl border border-red-200 shadow-xl">
                                <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span className="text-red-700 font-semibold text-sm">{getFilteredTickets().filter(t => t.status === 'closed').length} Closed</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Raise Ticket Modal */}
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
                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                Raise Ticket
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Tickets List */}
            {getFilteredTickets().length === 0 ? (
                <div className="text-center py-16">
                    <div className="text-6xl mb-4">🎫</div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-800">
                        {userRole?.toLowerCase() === 'customer' || userRole?.toLowerCase() === 'viewer'
                            ? 'No tickets created yet'
                            : userRole?.toLowerCase() === 'agent' || userRole?.toLowerCase() === 'reviewer'
                                ? 'No tickets assigned to you'
                                : 'No tickets in this organization'
                        }
                    </h3>
                    <p className="text-gray-600 text-sm mb-6">
                        {userRole?.toLowerCase() === 'customer' || userRole?.toLowerCase() === 'viewer'
                            ? 'Create your first ticket to get started'
                            : userRole?.toLowerCase() === 'agent' || userRole?.toLowerCase() === 'reviewer'
                                ? 'Tickets assigned to you will appear here'
                                : 'Tickets will appear here when created'
                        }
                    </p>
                    {(userRole?.toLowerCase() === 'customer' || userRole?.toLowerCase() === 'viewer') && (
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-400 hover:to-blue-700 transition-colors shadow-lg"
                        >
                            Raise Your First Ticket
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                    {getFilteredTickets().map((ticket) => (
                        <MediaCard
                            key={ticket.id}
                            item={ticket}
                            onClick={() => handleTicketClick(ticket)}
                            currentUserId={currentUserId}
                            onEdit={null} // Disable edit functionality
                            onDelete={null} // Disable delete functionality
                        />
                    ))}
                </div>
            )}

            {/* Ticket Detail Modal */}
            {showTicketDetail && selectedTicket && (
                <TicketDetail
                    ticket={selectedTicket}
                    viewerId={currentUserId}
                    onClose={handleCloseTicketDetail}
                    onUpdated={handleTicketUpdated}
                />
            )}
        </div>
    );
}
