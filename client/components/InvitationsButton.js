import { useEffect, useState } from "react";
import API from "../lib/api";

export default function InvitationsButton({ keycloak }) {
  const [pendingInvites, setPendingInvites] = useState([]);
  const [showInvites, setShowInvites] = useState(false);

  const loadPendingInvites = async () => {
    if (!keycloak?.authenticated || !keycloak?.tokenParsed?.sub) {
      console.log('Keycloak not ready yet, skipping pending invites load');
      return;
    }
    try {
      const userResponse = await API.get(`/users?keycloak_id=${keycloak.tokenParsed.sub}`);
      if (userResponse.data.length > 0) {
        const userId = userResponse.data[0].id;
        const invitesResponse = await API.get(`/org-invites/pending/${userId}`);
        setPendingInvites(invitesResponse.data);
      }
    } catch (error) {
      console.error("Error loading pending invites:", error);
      setPendingInvites([]);
    }
  };

  useEffect(() => {
    if (keycloak?.authenticated && keycloak?.tokenParsed?.sub) {
      loadPendingInvites();
    }
    const handleRefreshInvites = () => loadPendingInvites();
    window.addEventListener("refreshInvites", handleRefreshInvites);
    return () => window.removeEventListener("refreshInvites", handleRefreshInvites);
  }, [keycloak?.authenticated, keycloak?.tokenParsed?.sub]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/accept/${inviteId}`);
      alert("✅ Organization invite accepted!");
      loadPendingInvites();
    } catch (error) {
      alert("❌ Failed to accept invite: " + (error.response?.data?.error || error.message));
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/reject/${inviteId}`);
      alert("❌ Organization invite rejected!");
      loadPendingInvites();
    } catch (error) {
      alert("❌ Failed to reject invite: " + (error.response?.data?.error || error.message));
    }
  };

  if (!keycloak?.authenticated) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowInvites(!showInvites)}
        className="px-4 py-2 bg-white/80 backdrop-blur-md text-gray-700 rounded-xl hover:bg-white hover:shadow-lg transition-all font-semibold shadow-xl flex items-center gap-2 group border border-blue-200/50 hover:border-blue-300 tracking-wide"
        aria-label="Open Invitations"
        title="Invitations for you"
      >
        <span className="relative inline-flex items-center">
          <svg className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform duration-200" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v2.586l-.707.707A1 1 0 004 13h12a1 1 0 00.707-1.707L16 10.586V8a6 6 0 00-6-6zM8 16a2 2 0 104 0H8z" />
          </svg>
          {pendingInvites.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-bold">
              {pendingInvites.length}
            </span>
          )}
        </span>
        Invitations
      </button>

      {showInvites && (
        <div className="absolute left-0 top-full mt-2 w-96 bg-white backdrop-blur-2xl rounded-2xl shadow-xl border border-blue-200/30 z-[9999] overflow-hidden transition-all duration-300">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800 tracking-wide">Organization Invites</h3>
              <button onClick={() => setShowInvites(false)} className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:rotate-90">
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            {pendingInvites.length === 0 ? (
              <div className="text-center py-10">
                <i className="fas fa-inbox text-4xl text-blue-300 mb-3"></i>
                <p className="text-gray-500 text-sm">No pending invites</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scroll">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="bg-blue-50/60 rounded-xl p-4 border border-blue-200/30 hover:border-blue-400/50 transition-all duration-300">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium text-gray-800">{invite.invited_by_username}</span> invited you to join
                        </p>
                        <p className="text-base font-semibold text-blue-600 mt-1">{invite.organization_name}</p>
                        {invite.message && (
                          <p className="text-sm text-gray-500 italic mt-2 border-l-2 border-blue-300 pl-3">{invite.message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => handleAcceptInvite(invite.id)} className="px-4 py-2 rounded-md text-sm font-medium bg-green-500/80 hover:bg-green-500 text-white transition-colors">Accept</button>
                      <button onClick={() => handleRejectInvite(invite.id)} className="px-4 py-2 rounded-md text-sm font-medium bg-red-500/80 hover:bg-red-500 text-white transition-colors">Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


