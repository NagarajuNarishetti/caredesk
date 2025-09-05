import { useEffect, useState, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const colors = [
  '#958DF1',
  '#F98181',
  '#FBBC88',
  '#FAF594',
  '#70CFF8',
  '#94FADB',
  '#B9F18D',
];

const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];

export default function CollaborativeEditor({
  documentId,
  currentUser,
  permissionLevel = 'editor',
  onSave,
  initialContent = ''
}) {
  const [provider, setProvider] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [useFallbackMode, setUseFallbackMode] = useState(false);
  const [hasInitializedContent, setHasInitializedContent] = useState(false);
  const [currentContent, setCurrentContent] = useState(initialContent);
  const [forceContentUpdate, setForceContentUpdate] = useState(0);
  const [isSettingContent, setIsSettingContent] = useState(false);
  const [lastContentUpdate, setLastContentUpdate] = useState(0);

  // Update current content when initialContent changes
  useEffect(() => {
    if (initialContent !== currentContent) {
      setCurrentContent(initialContent);
    }
  }, [initialContent]);

  // Reset content if it gets too large (to handle infinite loops)
  useEffect(() => {
    if (currentContent && currentContent.length > 10000) {
      setCurrentContent(initialContent);
    }
  }, [currentContent, initialContent]);

  useEffect(() => {
    if (!documentId || !currentUser) return;

    try {
      // Create Yjs document
      const ydoc = new Y.Doc();

      // Create WebSocket provider for real-time collaboration
      const wsProvider = new WebsocketProvider(
        (process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://localhost:5000') + '/yjs',
        `document-${documentId}`,
        ydoc
      );

      // Ensure Yjs document is properly initialized
      const yText = ydoc.getText('content');

      // If Yjs document already has content, don't initialize it again
      if (yText.length > 0) {
        setHasInitializedContent(true);
      }

      setProvider(wsProvider);

      // Handle connection status
      wsProvider.on('status', ({ status }) => {
        const wasOffline = useFallbackMode;
        setIsConnected(status === 'connected');

        if (status === 'connected') {
          setUseFallbackMode(false);

          // If we were offline and now coming online, and we have content but Yjs doc is empty,
          // we need to initialize the Yjs document with the current content
          if (wasOffline && currentContent && !hasInitializedContent) {
            const yText = ydoc.getText('content');

            if (yText.length === 0) {
              // For Yjs, we need to insert the content as plain text
              // The TipTap editor will handle the HTML rendering
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = currentContent;
              const plainText = tempDiv.textContent || tempDiv.innerText || '';

              if (plainText.trim()) {
                yText.insert(0, plainText);
                setHasInitializedContent(true);
              }
            }
          }

          // Always mark as initialized when coming online to prevent re-initialization
          if (wasOffline) {
            setHasInitializedContent(true);
          }

          // Force content update when coming back online
          if (wasOffline) {
            setForceContentUpdate(prev => prev + 1);
          }
        }
      });

      // Handle connection errors
      wsProvider.on('connection-error', (error) => {
        console.error('Yjs connection error:', error);
        setUseFallbackMode(true);
        setIsConnected(false);
      });

      // Handle connection close
      wsProvider.on('connection-close', () => {
        console.log('WebSocket connection closed');
        setUseFallbackMode(true);
        setIsConnected(false);
      });

      // Handle awareness (user presence)
      wsProvider.awareness.setLocalStateField('user', {
        id: currentUser.id,
        name: currentUser.name || currentUser.username,
        color: getRandomColor(),
        permissionLevel
      });

      // Listen for other users
      wsProvider.awareness.on('change', () => {
        const states = Array.from(wsProvider.awareness.getStates().values());
        setActiveUsers(states.filter(state => state.user && state.user.id !== currentUser.id));
      });

      return () => {
        try {
          wsProvider.destroy();
        } catch (error) {
          console.error('Error destroying WebSocket provider:', error);
        }
      };
    } catch (error) {
      console.error('Error setting up collaborative editor:', error);
      setUseFallbackMode(true);
      setIsConnected(false);
    }
  }, [documentId, currentUser, currentContent, useFallbackMode, hasInitializedContent]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // Disable history to avoid collaboration conflicts
      }),
      ...(provider && !useFallbackMode ? [
        Collaboration.configure({
          document: provider.doc,
        }),
        CollaborationCursor.configure({
          provider,
          user: {
            id: currentUser?.id,
            name: currentUser?.name || currentUser?.username,
            color: getRandomColor(),
          },
        }),
      ] : []),
    ],
    editable: permissionLevel === 'editor' || permissionLevel === 'reviewer',
    content: useFallbackMode ? currentContent : undefined, // Only set content in fallback mode
    immediatelyRender: false, // Fix SSR hydration warnings
    onUpdate: ({ editor }) => {
      // Removed excessive logging for performance
    },
    onCreate: ({ editor }) => {
      // Removed excessive logging for performance
    },
  }, [provider, useFallbackMode, forceContentUpdate]); // Removed currentContent from dependencies

  // Monitor editor content changes to preserve content when switching modes
  // DISABLED: This was causing content duplication issues
  // useEffect(() => {
  //   if (!editor) return;

  //   const updateContent = () => {
  //     // Don't update if we're currently setting content programmatically
  //     if (isSettingContent) {
  //       return;
  //     }

  //     const content = editor.getHTML();
  //     // Only update if the content is significantly different to prevent loops
  //     if (content !== currentContent && Math.abs(content.length - currentContent.length) > 10) {
  //       setCurrentContent(content);
  //     }
  //   };

  //   // Update content on editor changes
  //   editor.on('update', updateContent);

  //   return () => {
  //     editor.off('update', updateContent);
  //   };
  // }, [editor, isSettingContent]); // Removed currentContent from dependencies

  // Force set content when editor is created and we have content
  useEffect(() => {
    if (editor && currentContent && !isSettingContent && !useFallbackMode) {
      const now = Date.now();
      const editorContent = editor.getHTML();

      // Only set content if editor is truly empty and we're in collaboration mode
      // Add debouncing to prevent rapid updates
      if ((editorContent.length === 0 || editorContent === '<p></p>' || editorContent === '<p><br></p>')
        && (now - lastContentUpdate > 1000)) {
        setIsSettingContent(true);
        setLastContentUpdate(now);
        editor.commands.setContent(currentContent);
        // Reset the flag after a short delay
        setTimeout(() => setIsSettingContent(false), 100);
      }
    }
  }, [editor, currentContent, isSettingContent, useFallbackMode, lastContentUpdate]);

  // Handle content update when coming back online
  useEffect(() => {
    if (forceContentUpdate > 0 && editor && !useFallbackMode && currentContent && !isSettingContent) {
      // Force update the editor content with HTML
      setIsSettingContent(true);
      editor.commands.setContent(currentContent);
      // Reset the flag after a short delay
      setTimeout(() => setIsSettingContent(false), 100);
    }
  }, [forceContentUpdate, editor, useFallbackMode, currentContent, isSettingContent]);

  const handleSave = async () => {
    if (!editor || !onSave) return;

    const content = editor.getHTML();
    try {
      await onSave(content);
      // Removed setCurrentContent to prevent duplication issues
    } catch (error) {
      console.error('Error saving document:', error);
    }
  };

  // Memoize debug information to reduce re-renders
  const debugInfo = useMemo(() => ({
    mode: useFallbackMode ? 'Offline' : 'Online',
    connected: isConnected ? 'Yes' : 'No',
    initialContentLength: initialContent ? initialContent.length : 0,
    currentContentLength: currentContent ? currentContent.length : 0,
    hasInitialized: hasInitializedContent ? 'Yes' : 'No',
    forceUpdate: forceContentUpdate,
    contentPreview: currentContent ? currentContent.substring(0, 50) + '...' : 'No content',
    isHTML: currentContent ? (currentContent.includes('<') ? 'Yes' : 'No') : 'N/A',
    editorContentLength: editor ? editor.getHTML().length : 0,
    editorHasContent: editor ? (editor.getHTML().length > 0 ? 'Yes' : 'No') : 'N/A',
    settingContent: isSettingContent ? 'Yes' : 'No'
  }), [useFallbackMode, isConnected, initialContent, currentContent, hasInitializedContent, forceContentUpdate, isSettingContent, editor]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Please log in to edit documents</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header with connection status and active users */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">
              {useFallbackMode ? 'Offline Mode' : (isConnected ? 'Connected' : 'Connecting...')}
            </span>
            {useFallbackMode && (
              <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">
                Local editing only
              </span>
            )}
          </div>

          <div className="flex space-x-2">
            {permissionLevel !== 'viewer' && (
              <button
                onClick={handleSave}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm"
              >
                Save
              </button>
            )}
            <button
              onClick={() => {
                if (editor && initialContent) {
                  setIsSettingContent(true);
                  editor.commands.setContent(initialContent);
                  setCurrentContent(initialContent);
                  setTimeout(() => setIsSettingContent(false), 100);
                }
              }}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Active users */}
        {!useFallbackMode && activeUsers.length > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Active users:</span>
            {activeUsers.map((user, index) => (
              <div key={index} className="flex items-center space-x-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: user.user.color }}
                ></div>
                <span className="text-sm text-gray-700">{user.user.name}</span>
                {index < activeUsers.length - 1 && <span className="text-gray-400">,</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {permissionLevel === 'viewer' ? (
            <div className="bg-gray-50 p-4 rounded border">
              <p className="text-gray-600 text-sm">
                You have view-only access to this document
              </p>
            </div>
          ) : (
            <div>
              {!initialContent && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                  <p className="text-blue-700 text-sm">
                    This is a new document. Start typing to add content!
                  </p>
                </div>
              )}
              <EditorContent
                editor={editor}
                className="prose max-w-none min-h-[500px] focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Debug info */}
      <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white p-2 text-xs rounded">
        <div>Mode: {debugInfo.mode}</div>
        <div>Connected: {debugInfo.connected}</div>
        <div>Initial Content Length: {debugInfo.initialContentLength}</div>
        <div>Current Content Length: {debugInfo.currentContentLength}</div>
        <div>Has Initialized: {debugInfo.hasInitialized}</div>
        <div>Force Update: {debugInfo.forceUpdate}</div>
        <div>Content Preview: {debugInfo.contentPreview}</div>
        <div>Is HTML: {debugInfo.isHTML}</div>
        <div>Editor Content Length: {debugInfo.editorContentLength}</div>
        <div>Editor Has Content: {debugInfo.editorHasContent}</div>
        <div>Setting Content: {debugInfo.settingContent}</div>
      </div>
    </div>
  );
}
