import { useState } from "react";

/**
 * The whole point of moving off AppSheet: the view you are looking at has an
 * address. This copies it, filters and all.
 */
export default function ShareLink({ label = "Copy link to this view" }: { label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (insecure context or denied permission) — select
      // the URL bar instead of failing silently.
      window.prompt("Copy this link", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return copied ? (
    <span className="copied">Link copied</span>
  ) : (
    <button className="btn" onClick={copy}>
      {label}
    </button>
  );
}
