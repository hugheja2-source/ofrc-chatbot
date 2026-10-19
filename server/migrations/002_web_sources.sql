-- Public OFRCNews.com pages and PDFs imported into the knowledge base.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'upload';

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_source_kind_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_source_kind_check
  CHECK (source_kind IN ('upload', 'webpage', 'web_pdf'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source_url
  ON documents (source_url)
  WHERE source_url IS NOT NULL;
