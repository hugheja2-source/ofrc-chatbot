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
          <h2>Ask page</h2>
          <p>
            The site header still says Ask OFRC. The chat page no longer repeats that title.
            The page opens with “How can we help?”, then a short line about what to ask,
            including contact information and meeting dates, then the OFRCNews.com and
            emergency lines.
          </p>
        </section>

        <section>
          <h2>Dates and contacts</h2>
          <p>
            Training now keeps a contact list or a meeting-date list in one piece, and it
            puts ordinals such as “7th” back on the date. A question that names a role, such
            as secretary, can match the chunk that has the phone number and email. The chat
            is told today’s date, so “next meeting” means the earliest listed date that is
            still today or later.
          </p>
          <ul>
            <li>
              <strong>Chat model:</strong> {CHAT_MODEL_NAME}, Groq id{' '}
              <code>{CHAT_MODEL_VERSION}</code>.
            </li>
            <li>
              <strong>Embeddings:</strong> <code>{EMBED_MODEL_NAME}</code> on the club VPS.
              Each answer still uses at most 3 document chunks.
            </li>
          </ul>
        </section>

        <section>
          <h2>Admin action</h2>
          <p>
            Open <Link to="/admin/documents">Admin → Documents</Link> and train each document
            again. Answers keep using the old chunks until that training finishes. Search still
            uses <code>{EMBED_MODEL_NAME}</code>.
          </p>
        </section>
      </article>
  );
}
