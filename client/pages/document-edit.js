import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import API from '../lib/api';
import CollaborativeEditor from '../components/CollaborativeEditor';

export default function DocumentEdit({ keycloak }) {
    const router = useRouter();
    const { id } = router.query;

    const [document, setDocument] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [permissionLevel, setPermissionLevel] = useState('viewer');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const setupUser = async () => {
            if (keycloak?.authenticated) {
                try {
                    const userInfo = await keycloak.loadUserInfo();
                    const keycloakId = keycloak.tokenParsed?.sub;

                    // Get the actual user ID from database (same logic as upload page)
                    console.log('Looking up user with keycloak_id:', keycloakId);
                    const userResponse = await API.get(`/users?keycloak_id=${keycloakId}`);
                    console.log('User response:', userResponse.data);

                    if (userResponse.data.length === 0) {
                        console.error('User not found in database');
                        return;
                    }

                    const userId = userResponse.data[0].id;
                    console.log('Found user ID:', userId);

                    setCurrentUser({
                        id: userId,
                        name: userInfo.name,
                        username: userInfo.preferred_username,
                        email: userInfo.email
                    });
                } catch (err) {
                    console.error('Error loading user info:', err);
                }
            }
        };
        setupUser();
    }, [keycloak?.authenticated]);

    useEffect(() => {
        const fetchDocument = async () => {
            if (!id || !currentUser) return;

            try {
                setLoading(true);
                console.log('Fetching document with ID:', id, 'for user:', currentUser.id);

                // Fetch document details
                const docResponse = await API.get(`/media/${id}`);
                const doc = docResponse.data;
                console.log('Document fetched:', doc);
                console.log('Document content:', doc.content);

                // Always try to load the latest content from content endpoint
                try {
                    console.log('Loading content from content endpoint...');
                    const contentResponse = await API.get(`/media/${id}/content`);
                    if (contentResponse.data.content) {
                        doc.content = contentResponse.data.content;
                        console.log('Loaded content from content endpoint:', doc.content.substring(0, 100) + '...');
                    } else {
                        console.log('No content found in content endpoint response');
                    }
                } catch (contentErr) {
                    console.error('Error loading content from endpoint:', contentErr);

                    // Fallback: try to load from file path if it's a direct URL
                    if (doc.file_path && doc.file_path.startsWith('http')) {
                        try {
                            console.log('Loading content from file URL:', doc.file_path);
                            const fileResponse = await fetch(doc.file_path);
                            if (fileResponse.ok) {
                                const fileContent = await fileResponse.text();
                                doc.content = fileContent;
                                console.log('Loaded content from file URL:', fileContent.substring(0, 100) + '...');
                            }
                        } catch (fileErr) {
                            console.error('Error loading file content:', fileErr);
                        }
                    }
                }

                // Ensure we have some content, even if empty
                if (!doc.content) {
                    doc.content = '';
                    console.log('No content found, initializing with empty string');
                } else {
                    // Convert plain text content to HTML format for TipTap editor
                    // If content doesn't contain HTML tags, wrap it in paragraph tags
                    if (!doc.content.includes('<') && !doc.content.includes('>')) {
                        // Split content into paragraphs and wrap each in <p> tags
                        const paragraphs = doc.content.split('\n\n').filter(p => p.trim());
                        if (paragraphs.length > 0) {
                            doc.content = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
                        } else {
                            // Single paragraph
                            doc.content = `<p>${doc.content.trim()}</p>`;
                        }
                        console.log('Converted plain text to HTML format:', doc.content.substring(0, 100) + '...');
                    }
                }

                // Check if user owns the document
                console.log('Document uploaded_by:', doc.uploaded_by);
                console.log('Current user ID:', currentUser.id);
                console.log('IDs match?', doc.uploaded_by === currentUser.id);

                if (doc.uploaded_by === currentUser.id) {
                    console.log('User owns document, setting permission to editor');
                    setPermissionLevel('editor');
                } else {
                    console.log('User does not own document, checking shared permissions');
                    // Check shared permissions
                    try {
                        const sharedResponse = await API.get(`/media-shared/${id}/permissions?userId=${currentUser.id}`);
                        const permission = sharedResponse.data.permission_level || 'viewer';
                        console.log('Shared permission level:', permission);
                        setPermissionLevel(permission);
                    } catch (err) {
                        console.log('Document not shared with user, defaulting to viewer');
                        // Document not shared with user
                        setPermissionLevel('viewer');
                    }
                }

                setDocument(doc);
            } catch (err) {
                console.error('Error fetching document:', err);
                console.error('Error details:', err.response?.data || err.message);
                setError('Document not found or access denied');
            } finally {
                setLoading(false);
            }
        };

        fetchDocument();
    }, [id, currentUser]);

    const handleSave = async (content) => {
        if (!document || !currentUser) return;

        try {
            // Save document content
            await API.patch(`/media/${id}/content`, {
                content,
                updated_by: currentUser.id
            });

            console.log('Document saved successfully');
        } catch (err) {
            console.error('Error saving document:', err);
            throw err;
        }
    };

    if (!keycloak?.authenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Please Login</h1>
                    <p className="text-gray-600 mb-4">You need to be logged in to edit documents.</p>
                    <button
                        onClick={() => keycloak.login()}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
                    >
                        Login
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading document...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button
                        onClick={() => router.push('/media')}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
                    >
                        Back to Media
                    </button>
                </div>
            </div>
        );
    }

    if (!document) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Document Not Found</h1>
                    <button
                        onClick={() => router.push('/media')}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded"
                    >
                        Back to Media
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={() => router.push('/media')}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ← Back
                            </button>
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900">{document.title}</h1>
                                <p className="text-sm text-gray-500">
                                    {permissionLevel === 'editor' ? 'You can edit this document' :
                                        permissionLevel === 'reviewer' ? 'You can review and edit this document' :
                                            'You have view-only access'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">Permission:</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${permissionLevel === 'editor' ? 'bg-green-100 text-green-800' :
                                permissionLevel === 'reviewer' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                {permissionLevel.charAt(0).toUpperCase() + permissionLevel.slice(1)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Editor */}
            <div className="max-w-7xl mx-auto h-[calc(100vh-4rem)]">
                <CollaborativeEditor
                    documentId={id}
                    currentUser={currentUser}
                    permissionLevel={permissionLevel}
                    onSave={handleSave}
                    initialContent={document.content || ''}
                />
                {/* Debug info */}
                <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-2 text-xs rounded">
                    Content length: {document.content ? document.content.length : 0}
                    <br />
                    Content preview: {document.content ? document.content.substring(0, 50) + '...' : 'No content'}
                </div>
            </div>
        </div>
    );
}
