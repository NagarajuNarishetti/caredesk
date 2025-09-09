import { useState, useEffect, useRef } from 'react';
import Link from "next/link";
import { useRouter } from "next/router";
import API from '../lib/api';
import InvitationsButton from "./InvitationsButton";

export default function Navbar({ keycloak }) {
  const router = useRouter();
  const [pendingInvites, setPendingInvites] = useState([]);
  const [showInvites, setShowInvites] = useState(false);
  const [orgsMenuOpen, setOrgsMenuOpen] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [userOrganizations, setUserOrganizations] = useState([]);
  const [showProfile, setShowProfile] = useState(false);
  const orgMenuRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [];

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
        try {
          const event = new CustomEvent('pendingInviteCount', { detail: invitesResponse.data.length });
          window.dispatchEvent(event);
        } catch (_) { }
      }
    } catch (error) {
      console.error('Error loading pending invites:', error);
      try {
        const event = new CustomEvent('pendingInviteCount', { detail: 0 });
        window.dispatchEvent(event);
      } catch (_) { }
    }
  };

  useEffect(() => {
    if (keycloak?.authenticated && keycloak?.tokenParsed?.sub) {
      loadPendingInvites();
    }
    const handleRefreshInvites = () => loadPendingInvites();
    window.addEventListener('refreshInvites', handleRefreshInvites);
    return () => window.removeEventListener('refreshInvites', handleRefreshInvites);
  }, [keycloak?.authenticated, keycloak?.tokenParsed?.sub]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/accept/${inviteId}`);
      alert('✅ Organization invite accepted!');
      loadPendingInvites();
    } catch (error) {
      alert('❌ Failed to accept invite: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/reject/${inviteId}`);
      alert('❌ Organization invite rejected!');
      loadPendingInvites();
    } catch (error) {
      alert('❌ Failed to reject invite: ' + (error.response?.data?.error || error.message));
    }
  };

  const openInviteModal = async () => {
    // Ensure we are on /media, then signal the page to open the invite modal
    const goAndOpen = () => {
      try {
        const event = new CustomEvent('openInviteModal');
        window.dispatchEvent(event);
      } catch (_) { }
    };
    if (router.pathname !== '/media') {
      await router.push('/media');
      setTimeout(goAndOpen, 50);
    } else {
      goAndOpen();
    }
  };

  const confirmAndLogout = () => {
    try {
      const confirmed = window.confirm('Are you sure you want to logout?');
      if (!confirmed) return;
      keycloak.logout({ redirectUri: window.location.origin });
    } catch (_) {
      keycloak.logout({ redirectUri: window.location.origin });
    }
  };

  const displayRole = (role) => {
    if (!role) return "";
    const lower = String(role).toLowerCase();
    if (lower === "orgadmin" || lower === "owner") return "OrgAdmin";
    if (lower === "agent" || lower === "reviewer") return "Agent";
    if (lower === "customer" || lower === "viewer") return "Customer";
    return role;
  };

  const openOrganizationsMenu = async () => {
    if (!keycloak?.authenticated || !keycloak?.tokenParsed?.sub) {
      setOrgsMenuOpen(false);
      return;
    }
    setOrgsMenuOpen(true);
    // Load once per open when list is empty
    if (userOrganizations.length === 0) {
      try {
        setLoadingOrgs(true);
        const userResponse = await API.get(`/users?keycloak_id=${keycloak.tokenParsed.sub}`);
        if (userResponse.data.length > 0) {
          const userId = userResponse.data[0].id;
          const orgRes = await API.get(`/organizations/user/${userId}`);
          setUserOrganizations(Array.isArray(orgRes.data) ? orgRes.data : []);
        }
      } catch (err) {
        console.error('Error loading organizations for menu:', err);
        setUserOrganizations([]);
      } finally {
        setLoadingOrgs(false);
      }
    }
  };
  // Close orgs menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!orgsMenuOpen) return;
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target)) {
        setOrgsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [orgsMenuOpen]);

  const handleSwitchToOrg = (org) => {
    const role = org.role;
    router.push(`/organization/${org.id}?role=${role}`);
    setOrgsMenuOpen(false);
  };


  return (
    <nav className="bg-white/80 backdrop-blur-2xl border-b border-emerald-100/60 shadow-[0_2px_15px_rgba(16,185,129,0.15)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <div
            className="flex-shrink-0 cursor-pointer select-none group"
            onClick={() => router.push('/media')}
          >
            <span className="text-2xl font-extrabold text-slate-800 group-hover:text-emerald-600 transition-all duration-300">
              caredesk
            </span>
          </div>



          {/* Right side */}
          <div className="hidden md:flex items-center space-x-3 lg:space-x-5">

            {/* Primary actions moved to navbar */}
            {keycloak?.authenticated && (
              <>
                <div
                  className="relative"
                  ref={orgMenuRef}
                  onMouseEnter={openOrganizationsMenu}
                >
                  <button
                    onClick={async () => {
                      // Only open the dropdown on click; no navigation
                      await openOrganizationsMenu();
                    }}
                    aria-haspopup="true"
                    aria-expanded={orgsMenuOpen}
                    className="px-4 py-2 bg-white/80 backdrop-blur-md text-slate-700 rounded-xl hover:bg-white hover:shadow-lg transition-all font-semibold shadow-xl flex items-center gap-2 group border border-emerald-200/60 hover:border-emerald-300 tracking-wide"
                  >
                    <svg className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM21 10a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Organizations
                    <svg className={`w-3 h-3 transition-transform ${orgsMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {orgsMenuOpen && (
                    <div className="absolute right-0 mt-2 w-[22rem] sm:w-[26rem] md:w-[28rem] max-w-[90vw] bg-white rounded-2xl shadow-xl border border-emerald-200/50 z-[999] p-4">
                      {loadingOrgs ? (
                        <div className="py-6 text-center text-sm text-gray-600">Loading organizations...</div>
                      ) : userOrganizations.length === 0 ? (
                        <div className="py-6 text-center text-sm text-gray-600">No organizations found</div>
                      ) : (
                        <div className="max-h-96 overflow-y-auto space-y-4">
                          {/* Agent / Reviewer */}
                          {(userOrganizations.filter(o => ['agent', 'reviewer'].includes(String(o.role).toLowerCase()))).length > 0 && (
                            <div>
                              <div className="text-xs font-bold text-gray-500 uppercase mb-2">You work as Agent</div>
                              <div className="space-y-2">
                                {userOrganizations.filter(o => ['agent', 'reviewer'].includes(String(o.role).toLowerCase())).map(org => (
                                  <div key={org.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-emerald-300 transition-colors">
                                    <div>
                                      <div className="text-sm font-semibold text-gray-800">{org.name}</div>
                                      <div className="text-xs text-gray-500">Role: {displayRole(org.role)}</div>
                                    </div>
                                    <button onClick={() => handleSwitchToOrg(org)} className="px-3 py-1.5 text-sm font-semibold text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 border border-emerald-200">Switch</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Customer / Viewer */}
                          {(userOrganizations.filter(o => ['customer', 'viewer'].includes(String(o.role).toLowerCase()))).length > 0 && (
                            <div>
                              <div className="text-xs font-bold text-gray-500 uppercase mb-2">You are a Customer</div>
                              <div className="space-y-2">
                                {userOrganizations.filter(o => ['customer', 'viewer'].includes(String(o.role).toLowerCase())).map(org => (
                                  <div key={org.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-emerald-300 transition-colors">
                                    <div>
                                      <div className="text-sm font-semibold text-gray-800">{org.name}</div>
                                      <div className="text-xs text-gray-500">Role: {displayRole(org.role)}</div>
                                    </div>
                                    <button onClick={() => handleSwitchToOrg(org)} className="px-3 py-1.5 text-sm font-semibold text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 border border-emerald-200">Switch</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={openInviteModal}
                  className="px-4 py-2 bg-purple-100/80 backdrop-blur-md text-purple-700 rounded-xl hover:bg-purple-200 hover:shadow-lg transition-all font-semibold shadow-xl flex items-center gap-2 group border border-purple-200/50 hover:border-purple-300 tracking-wide"
                >
                  <svg className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  Invite to Org
                </button>
                <InvitationsButton keycloak={keycloak} />
              </>
            )}

            {/* Auth */}
            {keycloak?.authenticated ? (
              <div className="flex items-center gap-3">
                {/* Profile Avatar */}
                <div className="relative">
                  <button
                    onClick={() => setShowProfile((v) => !v)}
                    aria-haspopup="true"
                    aria-expanded={showProfile}
                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center border border-blue-300 shadow-md hover:shadow-lg"
                    title="Profile"
                  >
                    {(keycloak?.tokenParsed?.preferred_username || 'U')[0].toUpperCase()}
                  </button>
                  {showProfile && (
                    <div
                      className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 z-[1000] overflow-hidden"
                      onMouseLeave={() => setShowProfile(false)}
                    >
                      <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center border border-blue-300">
                            {(keycloak?.tokenParsed?.preferred_username || 'U')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{keycloak?.tokenParsed?.preferred_username || 'User'}</div>
                            <div className="text-xs text-gray-600 truncate">{keycloak?.tokenParsed?.email || 'No email'}</div>
                          </div>
                        </div>
                      </div>
                      <div className="p-2">
                        <button
                          onClick={() => { setShowProfile(false); router.push('/media'); }}
                          className="w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 15c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          My Tickets
                        </button>
                        <button
                          onClick={() => { setShowProfile(false); router.push('/organizations'); }}
                          className="w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h3V5H5a2 2 0 00-2 2zm11-2v14h3a2 2 0 002-2V7a2 2 0 00-2-2h-3z" /></svg>
                          Organizations
                        </button>
                        <button
                          onClick={() => {
                            try {
                              navigator.clipboard.writeText(keycloak?.tokenParsed?.sub || '');
                              alert('User ID copied');
                            } catch (_) {
                              alert('Failed to copy');
                            }
                            setShowProfile(false);
                          }}
                          className="w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16h8M8 12h8m-7 8h6a2 2 0 002-2V6a2 2 0 00-2-2H9l-3 3v13a2 2 0 002 2z" /></svg>
                          Copy User ID
                        </button>
                      </div>
                      <div className="p-2 border-t border-gray-200">
                        <button
                          onClick={confirmAndLogout}
                          className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" /></svg>
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => keycloak.login()}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-semibold shadow-lg transition-all duration-200 relative overflow-hidden group"
              >
                <span className="relative z-10">Login</span>
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"></div>
              </button>
            )}
          </div>

          {/* Mobile menu toggle */}
          <div className="md:hidden flex items-center">
            {keycloak?.authenticated && (
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-white"
                aria-label="Open menu"
                aria-expanded={mobileOpen}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Mobile slide-down panel */}
        {keycloak?.authenticated && mobileOpen && (
          <div className="md:hidden border-t border-gray-200 pt-3 pb-4 animate-fade-in-fast">
            <div className="flex flex-col gap-3">
              {/* Organizations dropdown entry */}
              <div className="relative" ref={orgMenuRef}>
                <button
                  onClick={async () => { await openOrganizationsMenu(); }}
                  className="w-full px-4 py-2 bg-white text-slate-700 rounded-xl border border-emerald-200/60 text-left flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM21 10a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    Organizations
                  </span>
                  <svg className={`w-3 h-3 ${orgsMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                </button>
                {orgsMenuOpen && (
                  <div className="mt-2 bg-white rounded-xl border border-emerald-200/50 p-3">
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {userOrganizations.map((org) => (
                        <div key={org.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-200">
                          <div>
                            <div className="text-sm font-semibold text-gray-800">{org.name}</div>
                            <div className="text-xs text-gray-500">Role: {displayRole(org.role)}</div>
                          </div>
                          <button onClick={() => { handleSwitchToOrg(org); setMobileOpen(false); }} className="px-3 py-1.5 text-sm font-semibold text-emerald-700 bg-emerald-100 rounded-lg border border-emerald-200">Switch</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={openInviteModal} className="w-full px-4 py-2 bg-white text-purple-700 rounded-xl border border-purple-200/50">Invite to Org</button>
              <div>
                <InvitationsButton keycloak={keycloak} />
              </div>
              <button onClick={() => setShowProfile(true)} className="w-full px-4 py-2 bg-white text-slate-700 rounded-xl border border-gray-200 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center">
                  {(keycloak?.tokenParsed?.preferred_username || 'U')[0].toUpperCase()}
                </div>
                <span>Profile</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
