import { useState, useCallback, memo } from 'react';
import type { DocumentEntry } from './Drawer';

interface DocsListProps {
  documents: DocumentEntry[];
}

interface DocItemProps {
  doc: DocumentEntry;
}

const DocItem = memo(function DocItem({ doc }: DocItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(doc.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [doc.content]);

  const truncatedContent =
    doc.content.length > 200
      ? doc.content.substring(0, 200) + '...'
      : doc.content;

  return (
    <div className="doc-item">
      <div
        className="doc-item-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="doc-icon">📄</span>
        <span className="doc-title">{doc.title}</span>
        <span className="doc-time">{formatTime(doc.timestamp)}</span>
        <span className="doc-expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && (
        <div className="doc-content">
          <div className="doc-content-actions">
            <button
              className="doc-copy-btn"
              onClick={handleCopy}
              title="Copy content"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="doc-content-text">
            {isExpanded ? doc.content : truncatedContent}
          </pre>
          {doc.tags.length > 0 && (
            <div className="doc-tags">
              {doc.tags.map((tag) => (
                <span key={tag} className="doc-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default function DocsList({ documents }: DocsListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDocs = documents.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase())
      )
  );

  if (documents.length === 0) {
    return (
      <div className="docs-list-empty">
        <p>No documents yet</p>
        <p className="docs-list-hint">
          Claude can store documents using the store_document MCP tool
        </p>
      </div>
    );
  }

  return (
    <div className="docs-list">
      {documents.length > 3 && (
        <div className="docs-search">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="docs-search-input"
          />
        </div>
      )}

      <div className="docs-items">
        {filteredDocs.length === 0 ? (
          <div className="docs-no-results">
            No documents matching "{searchTerm}"
          </div>
        ) : (
          filteredDocs.map((doc) => <DocItem key={doc.id} doc={doc} />)
        )}
      </div>
    </div>
  );
}
