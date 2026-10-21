import { Link } from 'react-router-dom';
import {
  APP_RELEASE,
  CHAT_MODEL_NAME,
  CHAT_MODEL_VERSION,
  EMBED_MODEL_NAME,
  POWERED_BY,
} from '../release';

export function ReleaseNotesPage() {
  return (
    <article className="panel release-notes">
        <h1>Release {APP_RELEASE}</h1>
        <p className="muted">October 21, 2026 · {POWERED_BY}</p>

        <section>
          <h2>AI model</h2>
          <p>
            Chat answers now come from GPT-OSS 120B on Groq. Llama 4 Scout is no longer
            available on the Groq Developer plan, so this is the replacement Groq recommends.
            Document search still uses the embedding model on the club VPS. Existing documents
            do not need to be re-trained for this release.
          </p>
          <ul>
            <li>
              <strong>Chat model:</strong> {CHAT_MODEL_NAME}, Groq id{' '}
              <code>{CHAT_MODEL_VERSION}</code>. Answers stream as they are written.
            </li>
            <li>
              <strong>Embeddings:</strong> <code>{EMBED_MODEL_NAME}</code> (768 dimensions) on
              the club VPS. Document search still uses the existing vector column size.
            </li>
          </ul>
          <p>
            The VPS is a Hostinger KVM 2 with 2 CPUs and 8 GB of RAM, and it already runs the
            member portal and other club apps. Only the embedding model stays loaded there.
            Each answer still uses at most 3 document chunks.
          </p>
        </section>

        <section>
          <h2>OFRCNews.com</h2>
          <p>
            Admins can import public pages, posts, and PDFs from OFRCNews.com on the Documents
            page. Imported pages are trained like other club documents. The chat does not browse
            the web while answering. Pages that require a member login are not imported, and shop,
            cart, and checkout pages are skipped.
          </p>
        </section>

        <section>
          <h2>What changed</h2>
          <ul>
            <li>
              Documents can be loaded from public OFRCNews.com pages, posts, and PDFs, then trained
              for chat.
            </li>
            <li>Public chat and topic extraction call GPT-OSS 120B on Groq.</li>
            <li>
              Embeddings stay on the VPS with <code>{EMBED_MODEL_NAME}</code>. Existing
              documents do not need another training pass.
            </li>
            <li>
              Each answer still uses at most 3 document chunks. Reply text appears as it is
              written.
            </li>
            <li>
              Everyone sees Release {APP_RELEASE} and “{POWERED_BY}” as plain text in the
              header. That line is not a link. These notes are only available to signed-in
              admins.
            </li>
            <li>
              Topic extraction still reads the start of long documents. If that step fails, the
              document can still become ready and chat can still search its chunks.
            </li>
          </ul>
        </section>

        <section>
          <h2>Admin action</h2>
          <p>
            To use OFRCNews.com in answers, open{' '}
            <Link to="/admin/documents">Admin → Documents</Link>, load the site, and import the
            pages you want. Existing PDFs do not need another training pass. Search still uses{' '}
            <code>{EMBED_MODEL_NAME}</code>.
          </p>
        </section>
      </article>
  );
}
