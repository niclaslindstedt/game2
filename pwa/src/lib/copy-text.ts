// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PUTTING TEXT ON THE CLIPBOARD, and saying whether it worked.
//
// Two ways, because the async clipboard is missing or refused often enough
// to matter to a developer tool: an insecure origin, a browser that only
// grants it inside a gesture it recognised, a permission prompt somebody
// dismissed. The hidden textarea is the old way and it still works in all
// of those, so it is the floor rather than the fallback nobody wrote.
//
// The RETURN VALUE is the point. A copy button that silently did nothing is
// a button that gets pressed twice and then stops being trusted, so every
// caller is handed the truth and says it on the button's own face.

/** Put text on the clipboard. Resolves to whether it actually landed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the old way */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
