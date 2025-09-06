// Shared utility functions for ticket handling across pages
import API from "../lib/api";

// Priority options - consistent across all pages
export const PRIORITY_OPTIONS = [
    { value: "1", label: "Low" },
    { value: "2", label: "Medium" },
    { value: "3", label: "High" }
];

// File type detection
export const getFileType = (file) => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("application/pdf")) return "document";
    if (file.type === "text/plain") return "document";
    if (file.type === "application/msword") return "document";
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "document";
    if (file.type === "application/vnd.ms-excel") return "document";
    if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "document";
    if (file.type === "application/vnd.ms-powerpoint") return "document";
    if (file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "document";
    if (file.type === "text/csv") return "document";
    return "document";
};

// File validation
export const validateFile = (file) => {
    const isValidType =
        file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        file.type.startsWith("application/pdf") ||
        file.type === "text/plain" ||
        file.type === "application/msword" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.type === "application/vnd.ms-excel" ||
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-powerpoint" ||
        file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        file.type === "text/csv";

    if (!isValidType) {
        return "❌ Please select an image, video, or document file (PDF, TXT, DOC, XLS, PPT, CSV)";
    }

    if (file.size > 50 * 1024 * 1024) {
        return "❌ File size must be less than 50MB";
    }

    return null; // No error
};

// Handle file upload for tickets
export const handleTicketUpload = async (uploadData, onSuccess, onError) => {
    const { file, title, description, priorityId, organizationId, currentUserId } = uploadData;

    if (!file || !title.trim()) {
        onError("❌ Please select a file and enter a title");
        return;
    }

    if (!currentUserId) {
        onError("❌ User not authenticated properly");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", title.trim());
        if (description && description.trim()) {
            formData.append("description", description.trim());
        }
        formData.append("type", getFileType(file));
        formData.append("uploaded_by", currentUserId);
        if (organizationId) {
            formData.append("organization_id", organizationId);
        }
        if (priorityId) {
            formData.append("priority_id", priorityId);
        }

        const response = await API.post("/media/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });

        onSuccess(response.data.message);
    } catch (err) {
        console.error("Upload error:", err.response?.data);
        onError("❌ Upload failed: " + (err.response?.data?.detail || err.message));
    }
};

// Get priority display name
export const getPriorityDisplayName = (priority) => {
    const option = PRIORITY_OPTIONS.find(opt => opt.value === String(priority));
    return option ? option.label : "Low";
};

// Format time ago
export const formatTimeAgo = (date) => {
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
