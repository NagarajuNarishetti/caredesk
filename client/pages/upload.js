import { useState, useEffect } from "react";
import API from "../lib/api";

export default function Upload({ keycloak }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("image");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");

  // Get or create current user
  const getCurrentUser = async () => {
    if (!keycloak?.authenticated) return null;

    try {
      const keycloakId = keycloak.tokenParsed?.sub;

      // Check if user exists
      const userResponse = await API.get(`/users?keycloak_id=${keycloakId}`);

      if (userResponse.data.length === 0) {
        // Create user if doesn't exist
        const newUser = await API.post('/users', {
          keycloak_id: keycloakId,
          username: keycloak.tokenParsed?.preferred_username || 'Unknown',
          email: keycloak.tokenParsed?.email || '',
          role: 'user'
        });
        return newUser.data.id;
      }

      return userResponse.data[0].id;
    } catch (err) {
      console.error("Error getting current user:", err);
      return null;
    }
  };

  useEffect(() => {
    const setupUser = async () => {
      if (keycloak?.authenticated) {
        const userId = await getCurrentUser();
        setCurrentUserId(userId);
        try {
          const orgs = await API.get(`/organizations/user/${userId}`);
          const allOrganizations = orgs.data || [];
          const customerOrganizations = allOrganizations.filter(
            (org) => String(org.role) === 'Customer'
          );
          setOrganizations(customerOrganizations);
          if (customerOrganizations.length > 0) {
            setSelectedOrgId(String(customerOrganizations[0].id));
          } else {
            setSelectedOrgId("");
          }
        } catch (e) {
          console.error('Failed to fetch organizations for upload page', e);
          setOrganizations([]);
          setSelectedOrgId("");
        }
      }
    };
    setupUser();
  }, [keycloak?.authenticated]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file || !title.trim()) {
      alert("Please select a file and enter a title");
      return;
    }

    if (!currentUserId) {
      alert("User not authenticated properly");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("type", type);
      formData.append("uploaded_by", currentUserId); // Use actual user ID
      if (selectedOrgId) {
        formData.append("organization_id", selectedOrgId);
      }

      const res = await API.post("/media/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setMessage("✅ " + res.data.message);

      // Reset form
      setFile(null);
      setTitle("");
      setType("image");

      // Reset file input
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';

    } catch (err) {
      console.error("Upload error:", err.response?.data);
      setMessage("❌ Upload failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  if (!keycloak?.authenticated) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-3xl font-bold mb-4">Please Login</h1>
        <p>You need to be logged in to upload files.</p>
        <button
          onClick={() => keycloak.login()}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded mt-4"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-3xl font-bold mb-8 text-center">Raise Ticket</h1>
      <p className="text-center mb-6 text-gray-600">
        Logged in as: {keycloak.tokenParsed?.preferred_username}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full p-2 border border-gray-300 rounded"
            accept="image/*,video/*"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Ticket Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
            placeholder="Enter ticket title"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Organization</label>
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          >
            {organizations.length === 0 && (
              <option value="">No organizations found</option>
            )}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !currentUserId}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-2 px-4 rounded transition-colors"
        >
          {loading ? "Submitting..." : "Submit Ticket"}
        </button>
      </form>

      {message && (
        <div className={`mt-4 p-3 rounded text-center ${message.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
          {message}
        </div>
      )}
    </div>
  );
}
