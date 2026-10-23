import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy · JUSTCREATE" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="23 October 2026">
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address, used to sign you in.
        </li>
        <li>
          <strong>What you save:</strong> images and screenshots you capture, their source URLs, page titles and the metadata
          the extension reads at that moment (for example a video title or a post&apos;s text), plus your notes, labels, boards
          and generated design specs.
        </li>
        <li>
          <strong>Agent tokens:</strong> a one way hash of each token and when it was last used. We never store the token
          itself.
        </li>
      </ul>

      <h2>What the browser extension does</h2>
      <p>
        The extension only acts when you use it: a right click menu item, the toolbar popup or a keyboard shortcut. It then reads
        the current page (for a screenshot, the image you chose, or the post or video you are viewing) and sends that capture
        to your JUSTCREATE account. It does not track your browsing, read pages in the background, or collect browsing
        history.
      </p>

      <h2>How your content is processed</h2>
      <ul>
        <li>
          <strong>Storage and sign in:</strong> Supabase hosts the database, file storage and authentication.
        </li>
        <li>
          <strong>AI analysis:</strong> each saved image (resized) and its text metadata is sent to an AI model provider, Google
          Gemini or Anthropic Claude, to describe its style. Design specs are written from those descriptions and a few key
          images. Whether a provider may use that content to improve its models depends on our plan with it: paid API plans
          exclude training, while Google&apos;s free Gemini tier allows Google to use it to improve its products.
        </li>
        <li>
          <strong>Similarity:</strong> image embeddings for clustering are computed on our own servers.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <p>We do not sell your data, show ads, or use third party analytics or tracking cookies. Boards are private to you.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Delete any reference or board at any time; its files are removed from storage.</li>
        <li>Revoke agent tokens in Settings.</li>
        <li>To delete your account and everything in it, email us and we will do it within 30 days.</li>
      </ul>

      <h2>Contact</h2>
      <p>Questions about privacy: contact the JUSTCREATE team at the address listed on this site.</p>
    </LegalPage>
  );
}
