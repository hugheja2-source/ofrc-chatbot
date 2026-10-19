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
        <p className="muted">October 19, 2026 · {POWERED_BY}</p>

        <section>
          <h2>AI model</h2>
          <p>
            Chat answers now come from a free model running on the club VPS with Ollama.
            Google Gemini is no longer used for chat or embeddings.
          </p>
          <ul>
            <li>
              <strong>Chat model:</strong> {CHAT_MODEL_NAME}, Ollama tag{' '}
              <code>{CHAT_MODEL_VERSION}</code> (Gemma Terms of Use). This is Google’s Gemma 3
              4B instruction model, about 3.4 GB, quantized Q4_K_M. It is free to run for club
              questions.
            </li>
            <li>
              <strong>Embeddings:</strong> <code>{EMBED_MODEL_NAME}</code> (768 dimensions).
              Document search still uses the existing vector column size.
            </li>
          </ul>
          <p>
            The VPS is a Hostinger KVM 2 with 2 CPUs and 8 GB of RAM, and it already runs the
            member portal and other club apps. Gemma 3 4B is small enough to run there with one
            model loaded at a time. Qwen2.5 3B was not used: the Ollama build is under the Qwen
            Research License, which allows research and evaluation only. Larger 7B models would
            crowd the other club services out. Ollama on the VPS is version 0.40.6.
          </p>
        </section>

        <section>
          <h2>What changed</h2>
          <ul>
            <li>Public chat and document training call Ollama on the VPS.</li>
            <li>
              Gemma and the embedding model stay loaded together. Each answer uses at most 3
              document chunks and a 4096-token context. Reply text appears as it is written.
            </li>
            <li>
              Everyone sees Release {APP_RELEASE} and “{POWERED_BY}” as plain text in the
              header. That line is not a link. These notes are only available to signed-in
              admins.
            </li>
            <li>
              Existing documents must be re-trained. Embeddings from Gemini are not compatible
              with {EMBED_MODEL_NAME}, even though both use 768 dimensions.
            </li>
            <li>
              Topic extraction reads the start of long documents so the text fits the local
              model’s context window.
            </li>
          </ul>
        </section>

        <section>
          <h2>Admin action</h2>
          <p>
            Re-train each ready document under <Link to="/admin/documents">Admin → Documents</Link>{' '}
            so search uses the new embedding model.
          </p>
        </section>
      </article>
  );
}
