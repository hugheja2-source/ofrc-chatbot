export function AdminHelpPage() {
  return (
    <article className="panel admin-help">
      <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Admin Help Guide</h2>
      <p className="muted">
        How to keep the public OFRC chat accurate using club documents only.
      </p>

      <section>
        <h3>1. Signing in</h3>
        <ol>
          <li>Open <strong>Admin</strong> from the top nav (or go to <code>/admin</code>).</li>
          <li>Enter your username and password.</li>
          <li>You land on <strong>Topics</strong>.</li>
        </ol>
        <p>
          If you forget your password, ask someone with the <strong>recovery</strong> account to
          reset it under <strong>Account</strong>.
        </p>
      </section>

      <section>
        <h3>2. What Admin is for</h3>
        <ul>
          <li>
            <strong>Topics</strong> — review categories, topics, and key facts extracted from
            trained documents.
          </li>
          <li>
            <strong>Documents</strong> — upload PDFs, assign categories, train / re-train, or
            delete.
          </li>
          <li>
            <strong>Account</strong> — change your password; recovery users can create admins and
            reset passwords.
          </li>
          <li>
            <strong>Help</strong> — this guide.
          </li>
        </ul>
        <p>
          Visitors use the public <strong>Ask</strong> page with no login. Answers come only from
          documents you have trained—not from the open internet.
        </p>
      </section>

      <section>
        <h3>3. Documents — upload and train</h3>
        <h4>Add knowledge</h4>
        <ol>
          <li>Go to <strong>Documents</strong>.</li>
          <li>Optionally choose a <strong>category</strong>, or create one with <strong>Add category</strong>.</li>
          <li>Choose a <strong>PDF</strong> file.</li>
          <li>Click <strong>Upload &amp; train</strong>.</li>
          <li>Wait until status is <strong>ready</strong>.</li>
        </ol>
        <p>Training extracts text, chunks and embeds it for chat, then builds topics/key facts when possible.</p>
        <h4>Change category</h4>
        <p>
          On any existing document in the list, use the <strong>Category</strong> dropdown to move
          it to another category (or Uncategorized). Related topics update to match.
        </p>
        <h4>Re-train</h4>
        <p>
          Use <strong>Re-train</strong> if training failed, you want refreshed content for the same
          file, or pipeline settings changed.
        </p>
        <h4>Delete</h4>
        <p>
          <strong>Delete</strong> removes the file and its chunks, topics, and facts. Chat will no
          longer use that document.
        </p>
        <h4>Statuses</h4>
        <ul>
          <li><strong>pending</strong> — uploaded, not trained</li>
          <li><strong>processing</strong> — training in progress</li>
          <li><strong>ready</strong> — available for chat</li>
          <li><strong>failed</strong> — see error text; try Re-train</li>
        </ul>
      </section>

      <section>
        <h3>4. Topics — review the knowledge map</h3>
        <ol>
          <li>Open <strong>Topics</strong>.</li>
          <li>Browse by category.</li>
          <li>Review key facts under each topic.</li>
          <li>Remove outdated topics or facts if needed.</li>
        </ol>
        <p>
          Chat answers use document chunks. Keeping documents trained and accurate matters most;
          Topics is the readable overview.
        </p>
      </section>

      <section>
        <h3>5. Account</h3>
        <p>
          Change your password under <strong>Account</strong> (new password at least 8 characters).
        </p>
        <p>
          The <strong>recovery</strong> account can create admins and reset passwords. Do not share
          the recovery password casually.
        </p>
      </section>

      <section>
        <h3>6. Checking that chat works</h3>
        <ol>
          <li>Open <strong>Public chat</strong> (or <strong>Ask</strong>).</li>
          <li>Ask something the new document should cover.</li>
          <li>Confirm the reply makes sense and shows <strong>References</strong> when grounded in docs.</li>
          <li>Use <strong>Copy</strong> on a reply if you need to paste it elsewhere.</li>
        </ol>
      </section>

      <section>
        <h3>7. Common problems</h3>
        <ul>
          <li>
            <strong>Training failed</strong> — the on-server model may be busy or down; read the
            document error; try Re-train. After release 1.1.0, re-train documents so search uses
            the new embedding model.
          </li>
          <li>
            <strong>Chat doesn’t know the answer</strong> — train/re-train the right PDF; ask more
            clearly.
          </li>
          <li>
            <strong>Topics empty but document ready</strong> — chat can still work; re-train if you
            need the Topics list refreshed.
          </li>
          <li>
            <strong>Can’t log in</strong> — use recovery to reset a password.
          </li>
          <li>
            <strong>Upload rejected</strong> — PDF only; stay under the size limit (~25 MB).
          </li>
        </ul>
      </section>

      <section>
        <h3>8. What not to expect (v1)</h3>
        <ul>
          <li>
            Training indexes club PDFs for retrieval; it does not fine-tune a private model.
            Answers are generated by Gemma 3 1B running on the club server.
          </li>
          <li>The bot does not look up answers on the public web.</li>
          <li>Admin logins are separate from the Member Portal.</li>
        </ul>
      </section>
    </article>
  );
}
