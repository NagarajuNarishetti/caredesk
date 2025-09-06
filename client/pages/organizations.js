import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import API from "../lib/api";

export default function OrganizationsPage({ keycloak }) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [orgMembers, setOrgMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  // Map backend roles to UI labels without changing functionality
  const displayRole = (role) => {
    if (!role) return "";
    const lower = String(role).toLowerCase();
    if (lower === "orgadmin") return "OrgAdmin";
    if (lower === "agent") return "Agent";
    if (lower === "customer") return "Customer";
    // Legacy mapping for old data
    if (lower === "owner") return "OrgAdmin";
    if (lower === "reviewer") return "Agent";
    if (lower === "viewer") return "Customer";
    return role;
  };

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

  // Fetch organizations once we have user ID
  useEffect(() => {
    const fetchOrganizations = async () => {
      if (!currentUserId) return;

      try {
        const response = await API.get(`/organizations/user/${currentUserId}`);
        setOrganizations(response.data);
      } catch (err) {
        console.error("Error fetching organizations:", err);
        setError("Failed to fetch organizations");
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizations();
  }, [currentUserId]);

  // Fetch organization members for modal
  const fetchOrgMembers = async (orgId) => {
    setLoadingMembers(true);
    try {
      const response = await API.get(`/organizations/${orgId}/members`);
      setOrgMembers(response.data);
    } catch (err) {
      console.error("Error fetching organization members:", err);
      setOrgMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  // Handle view details click
  const handleViewDetails = async (org) => {
    setSelectedOrg(org);
    setShowModal(true);
    await fetchOrgMembers(org.id);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedOrg(null);
    setOrgMembers([]);
  };

  // Handle switch to organization
  const handleSwitchToOrg = (org) => {
    router.push(`/organization/${org.id}?role=${org.role}`);
  };

  // Format date helper
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Get role badge color
  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "owner":
        return "bg-purple-600 text-white";
      case "reviewer":
        return "bg-blue-600 text-white";
      case "viewer":
        return "bg-green-600 text-white";
      default:
        return "bg-gray-600 text-white";
    }
  };

  if (!keycloak?.authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center p-12 bg-white/80 backdrop-blur-3xl rounded-3xl border border-blue-200/50 shadow-2xl max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h1>
          <p className="text-gray-600">
            Please log in to view your organizations.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your organizations...</p>
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-1">
            Organizations Hub
          </h1>
          <p className="text-gray-600 text-sm">
            Spaces you manage or collaborate in
          </p>
        </div>

        {/* Organizations List - grouped by role */}
        {organizations.length === 0 ? (
          <div className="text-center py-16">
            <h3 className="text-xl font-semibold mb-2 text-gray-800">
              No Organizations Found
            </h3>
            <p className="text-gray-600 text-sm">
              You're not part of any organizations yet.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Org Admin */}
            {(organizations.filter(o => (String(o.role).toLowerCase() === 'orgadmin' || String(o.role).toLowerCase() === 'owner'))).length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">You manage</h2>
                  <span className="text-xs text-gray-500">Org Admin</span>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {organizations.filter(o => (String(o.role).toLowerCase() === 'orgadmin' || String(o.role).toLowerCase() === 'owner')).map((org) => (
                    <div
                      key={org.id}
                      className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-300 transition-all shadow-sm hover:shadow-md group relative"
                    >
                      <span className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-indigo-500 to-sky-500"></span>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 truncate">{org.name}</h3>
                          <p className="text-xs text-gray-500">Created {formatDate(org.created_at)}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase border ${getRoleBadgeColor(org.role)} bg-white/70 !text-current`}>
                          <span className="mix-blend-multiply">{displayRole(org.role)}</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Org Admin</div>
                          <div className="font-medium text-gray-800 truncate">{org.owner_username}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Members</div>
                          <div className="font-medium text-gray-800">{org.member_count}</div>
                        </div>
                        {org.joined_at && (
                          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                            <div className="text-xs text-gray-500">Joined</div>
                            <div className="font-medium text-gray-800">{formatDate(org.joined_at)}</div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleViewDetails(org)} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-700 transition-colors shadow">Open Overview</button>
                        {/* Org Admins don't need Switch button - they're already managing */}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Agent */}
            {(organizations.filter(o => (String(o.role).toLowerCase() === 'agent' || String(o.role).toLowerCase() === 'reviewer'))).length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">You work as Agent</h2>
                  <span className="text-xs text-gray-500">Agent</span>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {organizations.filter(o => (String(o.role).toLowerCase() === 'agent' || String(o.role).toLowerCase() === 'reviewer')).map((org) => (
                    <div key={org.id} className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-300 transition-all shadow-sm hover:shadow-md group relative">
                      <span className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-blue-500 to-cyan-500"></span>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 truncate">{org.name}</h3>
                          <p className="text-xs text-gray-500">Created {formatDate(org.created_at)}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase border ${getRoleBadgeColor(org.role)} bg-white/70 !text-current`}><span className="mix-blend-multiply">{displayRole(org.role)}</span></span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Org Admin</div>
                          <div className="font-medium text-gray-800 truncate">{org.owner_username}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Members</div>
                          <div className="font-medium text-gray-800">{org.member_count}</div>
                        </div>
                        {org.joined_at && (
                          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                            <div className="text-xs text-gray-500">Joined</div>
                            <div className="font-medium text-gray-800">{formatDate(org.joined_at)}</div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleViewDetails(org)} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-700 transition-colors shadow">Open Overview</button>
                        <button onClick={() => handleSwitchToOrg(org)} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-blue-600 bg-white border-2 border-blue-600 hover:bg-blue-50 transition-colors shadow">Switch</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Customer */}
            {(organizations.filter(o => (String(o.role).toLowerCase() === 'customer' || String(o.role).toLowerCase() === 'viewer'))).length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">You are a Customer</h2>
                  <span className="text-xs text-gray-500">Customer</span>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  {organizations.filter(o => (String(o.role).toLowerCase() === 'customer' || String(o.role).toLowerCase() === 'viewer')).map((org) => (
                    <div key={org.id} className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-300 transition-all shadow-sm hover:shadow-md group relative">
                      <span className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-emerald-500 to-teal-500"></span>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 truncate">{org.name}</h3>
                          <p className="text-xs text-gray-500">Created {formatDate(org.created_at)}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase border ${getRoleBadgeColor(org.role)} bg-white/70 !text-current`}><span className="mix-blend-multiply">{displayRole(org.role)}</span></span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Org Admin</div>
                          <div className="font-medium text-gray-800 truncate">{org.owner_username}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-xs text-gray-500">Members</div>
                          <div className="font-medium text-gray-800">{org.member_count}</div>
                        </div>
                        {org.joined_at && (
                          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                            <div className="text-xs text-gray-500">Joined</div>
                            <div className="font-medium text-gray-800">{formatDate(org.joined_at)}</div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleViewDetails(org)} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-700 transition-colors shadow">Open Overview</button>
                        <button onClick={() => handleSwitchToOrg(org)} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-blue-600 bg-white border-2 border-blue-600 hover:bg-blue-50 transition-colors shadow">Switch</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Organization Details Modal */}
      {showModal && selectedOrg && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">{selectedOrg.name?.[0]?.toUpperCase()}</div>
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900">{selectedOrg.name}</h2>
                  <p className="text-gray-500 text-xs mt-0.5">Overview</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-gray-700 transition-all border border-gray-200"
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
            <div className="p-6">
              {/* Snapshot */}
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="space-y-4 md:col-span-1">
                  <h3 className="text-sm font-bold text-gray-900">Organization Snapshot</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-gray-500 text-xs">Name</span>
                      <p className="font-medium text-gray-900">
                        {selectedOrg.name}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Owner</span>
                      <p className="font-medium text-gray-900">
                        {selectedOrg.owner_username}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Created</span>
                      <p className="font-medium text-gray-900">
                        {formatDate(selectedOrg.created_at)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Members</span>
                      <p className="font-medium text-gray-900">
                        {selectedOrg.member_count}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 md:col-span-2">
                  <h3 className="text-sm font-bold text-gray-900">Your Membership</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-gray-500 text-xs">Role</span>
                      <div className="mt-1">
                        <span className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase border ${getRoleBadgeColor(selectedOrg.role)} bg-white/70 !text-current`}>{displayRole(selectedOrg.role)}</span>
                      </div>
                    </div>
                    {selectedOrg.joined_at && (
                      <div>
                        <span className="text-gray-500 text-xs">Joined</span>
                        <p className="font-medium text-gray-900">
                          {formatDate(selectedOrg.joined_at)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Members Directory */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Member Directory</h3>
                {loadingMembers ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500 text-sm">Loading members...</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {orgMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-4 bg-blue-50/50 rounded-xl border border-blue-200 hover:bg-white transition-all"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-semibold">
                              {member.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {member.username}
                            </p>
                            <p className="text-sm text-gray-600">
                              {member.email}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase border ${getRoleBadgeColor(member.role)} bg-white/70 !text-current`}>{displayRole(member.role)}</span>
                          <p className="text-xs text-gray-500 mt-1">
                            Joined {formatDate(member.joined_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-blue-400 hover:to-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
