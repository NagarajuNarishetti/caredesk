import { useEffect, useState } from "react";
import API from "../lib/api";

export default function TicketDetail({ ticket, viewerId, onClose, onUpdated }) {
    const [details, setDetails] = useState(ticket);
    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [closing, setClosing] = useState(false);
    const [editingDescription, setEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState(ticket?.description || "");
    const [replyText, setReplyText] = useState("");
    const [replying, setReplying] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const queryParam = ticket.assigned_agent_id ? `assignedTo=${ticket.assigned_agent_id}` : (viewerId ? `userId=${viewerId}` : '');
                const url = queryParam ? `/tickets/${ticket.id}?${queryParam}` : `/tickets/${ticket.id}`;
                const res = await API.get(url);
                setDetails(res.data);
            } catch (e) {
                console.error("Failed to load ticket details", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [ticket.id, viewerId, ticket.assigned_agent_id]);

    const handleAddNote = async () => {
        if (!note.trim()) return;
        setSaving(true);
        try {
            const queryParam = ticket.assigned_agent_id ? `assignedTo=${ticket.assigned_agent_id}` : (viewerId ? `userId=${viewerId}` : '');
            const postUrl = queryParam ? `/ticket-comments/ticket/${ticket.id}?${queryParam}` : `/ticket-comments/ticket/${ticket.id}`;
            await API.post(postUrl, { content: note.trim(), is_internal: false });
            setNote("");
            const getUrl = queryParam ? `/tickets/${ticket.id}?${queryParam}` : `/tickets/${ticket.id}`;
            const res = await API.get(getUrl);
            setDetails(res.data);
        } catch (e) {
            console.error("Failed to add note", e);
        } finally {
            setSaving(false);
        }
    };

    const handleReply = async () => {
        if (!replyText.trim()) return;
        setReplying(true);
        try {
            // For customer replies, always use the customer's ID from the ticket details
            const customerId = details?.customer_id;
            if (!customerId) {
                console.error("No customer ID found for reply");
                return;
            }

            const queryParam = `userId=${customerId}`;
            const postUrl = `/ticket-comments/ticket/${ticket.id}?${queryParam}`;
            await API.post(postUrl, { content: replyText.trim(), is_internal: false });
            setReplyText("");

            // Refresh the ticket details
            const getUrl = `/tickets/${ticket.id}?${queryParam}`;
            const res = await API.get(getUrl);
            setDetails(res.data);
        } catch (e) {
            console.error("Failed to add reply", e);
        } finally {
            setReplying(false);
        }
    };

    const canEditDescription = details?.customer_id && viewerId && details.customer_id === viewerId;

    const handleSaveDescription = async () => {
        try {
            console.log('Saving description for ticket:', ticket.id, 'Description:', descriptionDraft);
            const queryParam = ticket.assigned_agent_id ? `assignedTo=${ticket.assigned_agent_id}` : (viewerId ? `userId=${viewerId}` : '');
            const putUrl = queryParam ? `/tickets/${ticket.id}?${queryParam}` : `/tickets/${ticket.id}`;
            const updateResponse = await API.put(putUrl, { description: descriptionDraft });
            console.log('Update response:', updateResponse.data);

            const getUrl = queryParam ? `/tickets/${ticket.id}?${queryParam}` : `/tickets/${ticket.id}`;
            const res = await API.get(getUrl);
            console.log('Refreshed ticket data:', res.data);
            setDetails(res.data);
            setEditingDescription(false);
            console.log('Description saved successfully');
        } catch (e) {
            console.error('Failed to update description', e);
            console.error('Error details:', e.response?.data);
            alert('Failed to save description: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleClose = async () => {
        setClosing(true);
        try {
            const queryParam = ticket.assigned_agent_id ? `assignedTo=${ticket.assigned_agent_id}` : (viewerId ? `userId=${viewerId}` : '');
            const url = queryParam ? `/tickets/${ticket.id}?${queryParam}` : `/tickets/${ticket.id}`;
            await API.put(url, { status: "closed" });
            if (onUpdated) onUpdated();
            onClose();
        } catch (e) {
            console.error("Failed to close ticket", e);
        } finally {
            setClosing(false);
        }
    };

    const firstAttachment = details?.attachments?.[0];
    const previewUrl = firstAttachment?.presigned_url || firstAttachment?.file_path;
    const isImage = firstAttachment?.mime_type?.startsWith("image/");
    const isVideo = firstAttachment?.mime_type?.startsWith("video/");

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xl flex z-50">
            <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between p-6 bg-white border-b border-blue-200/50 shadow-2xl">
                    <div className="flex-1">
                        <h2 className="text-gray-800 font-bold text-xl mb-3">{details?.title}</h2>

                        {/* Ticket Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Ticket Number */}
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Ticket #</div>
                                <div className="text-sm font-medium text-gray-800">{details?.ticket_number || "N/A"}</div>
                            </div>

                            {/* Organization */}
                            <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Organization</div>
                                <div className="text-sm font-medium text-gray-800 truncate">{details?.organization_name || "N/A"}</div>
                            </div>

                            {/* Priority */}
                            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                                <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Priority</div>
                                <div className="text-sm font-medium text-gray-800">
                                    {details?.priority_name || "Unknown"} ({details?.priority_level || "N/A"})
                                </div>
                            </div>

                            {/* Status */}
                            <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                                <div className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1">Status</div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${details?.status === "open" ? "bg-green-100 text-green-700 border border-green-200" :
                                        details?.status === "closed" ? "bg-red-100 text-red-700 border border-red-200" :
                                            "bg-yellow-100 text-yellow-700 border border-yellow-200"
                                        }`}>
                                        {details?.status === "open" ? "🟢 Open" : details?.status === "closed" ? "🔴 Closed" : "🟡 In Progress"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Additional Details */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                            {/* Raised By */}
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Raised By</div>
                                <div className="text-sm font-medium text-gray-800">{details?.customer_name || "Unknown"}</div>
                                <div className="text-xs text-gray-500 mt-1">{details?.customer_email || ""}</div>
                            </div>

                            {/* Assigned To */}
                            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                                <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Assigned To</div>
                                <div className="text-sm font-medium text-gray-800">{details?.assigned_agent_name || "Unassigned"}</div>
                            </div>

                            {/* Created Date */}
                            <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                                <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Created</div>
                                <div className="text-sm font-medium text-gray-800">
                                    {details?.created_at ? new Date(details.created_at).toLocaleDateString() : "N/A"}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {details?.created_at ? new Date(details.created_at).toLocaleTimeString() : ""}
                                </div>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 flex items-center justify-center ml-4 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                    <div className="bg-white rounded-2xl border border-blue-200/50 shadow-2xl p-4 flex items-center justify-center min-h-[320px]">
                        {loading ? (
                            <div>Loading...</div>
                        ) : firstAttachment ? (
                            isImage ? (
                                <img src={previewUrl} alt={firstAttachment.original_name} className="max-w-full max-h-[70vh] object-contain rounded-xl" />
                            ) : isVideo ? (
                                <video src={previewUrl} controls className="max-w-full max-h-[70vh] object-contain rounded-xl" />
                            ) : (
                                <a href={previewUrl} target="_blank" rel="noreferrer" className="px-4 py-2 bg-blue-600 text-white rounded-xl">Open Attachment</a>
                            )
                        ) : (
                            <div className="text-gray-500">No attachments</div>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="bg-white rounded-2xl border border-blue-200/50 shadow-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-800">Description</h3>
                                {canEditDescription && !editingDescription && (
                                    <button onClick={() => { setEditingDescription(true); setDescriptionDraft(details?.description || ''); }} className="px-3 py-1 text-xs rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">Edit</button>
                                )}
                            </div>
                            {editingDescription ? (
                                <div>
                                    <textarea value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} rows={4} className="w-full border rounded-xl p-3 outline-none border-blue-200" />
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={handleSaveDescription} className="px-3 py-1 bg-blue-600 text-white rounded-lg">Save</button>
                                        <button onClick={() => setEditingDescription(false)} className="px-3 py-1 bg-gray-100 border rounded-lg">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{details?.description || "No description provided"}</p>
                            )}
                        </div>

                        {details?.assigned_agent_id === viewerId && details?.status !== 'closed' ? (
                            <div className="bg-white rounded-2xl border border-blue-200/50 shadow-2xl p-4">
                                <h3 className="font-semibold text-gray-800 mb-2">Add note for the customer</h3>
                                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full border rounded-xl p-3 outline-none border-blue-200" placeholder="Type how you plan to resolve..." />
                                <div className="flex gap-3 mt-3">
                                    <button disabled={!note.trim() || saving} onClick={handleAddNote} className="px-4 py-2 bg-blue-600 text-white rounded-xl disabled:opacity-50">{saving ? "Saving..." : "Save Note"}</button>
                                    <button disabled={closing} onClick={handleClose} className="px-4 py-2 bg-green-600 text-white rounded-xl disabled:opacity-50">{closing ? "Closing..." : "Close Ticket"}</button>
                                </div>
                            </div>
                        ) : details?.assigned_agent_id === viewerId && details?.status === 'closed' ? (
                            <div className="bg-gray-100 rounded-2xl border border-gray-200 shadow-2xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>
                                    <h3 className="font-semibold text-gray-800">Ticket Closed</h3>
                                </div>
                                <p className="text-gray-600 text-sm">
                                    This ticket has been closed. No further actions can be taken on this ticket.
                                </p>
                            </div>
                        ) : null}

                        <div className="bg-white rounded-2xl border border-blue-200/50 shadow-2xl p-4 max-h-64 overflow-auto">
                            <h3 className="font-semibold text-gray-800 mb-2">Conversation</h3>
                            {details?.comments?.length ? details.comments.map(c => (
                                <div key={c.id || c._id} className="text-sm text-gray-700 border-t first:border-t-0 py-2">
                                    <div className="font-medium">{c.username || c.email || "User"}</div>
                                    <div>{c.content || c.text}</div>
                                </div>
                            )) : <div className="text-gray-500 text-sm">No comments yet</div>}
                        </div>

                        {/* Customer Reply Section - Only show if ticket is not closed */}
                        {details?.customer_id && details?.customer_id === viewerId && details?.status !== 'closed' && (
                            <div className="bg-white rounded-2xl border border-blue-200/50 shadow-2xl p-4">
                                <h3 className="font-semibold text-gray-800 mb-2">Reply to Agent</h3>
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    rows={3}
                                    className="w-full border rounded-xl p-3 outline-none border-blue-200"
                                    placeholder="Type your reply to the agent..."
                                />
                                <div className="flex gap-3 mt-3">
                                    <button
                                        disabled={!replyText.trim() || replying}
                                        onClick={handleReply}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-xl disabled:opacity-50"
                                    >
                                        {replying ? "Sending..." : "Send Reply"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Closed Ticket Message */}
                        {details?.customer_id && details?.customer_id === viewerId && details?.status === 'closed' && (
                            <div className="bg-gray-100 rounded-2xl border border-gray-200 shadow-2xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>
                                    <h3 className="font-semibold text-gray-800">Communication Closed</h3>
                                </div>
                                <p className="text-gray-600 text-sm">
                                    This ticket has been closed. Communication is no longer available.
                                    If you need further assistance, please create a new ticket.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}


