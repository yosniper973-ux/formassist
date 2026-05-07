import { open as openUrl } from "@tauri-apps/plugin-shell";

export function getComposeUrl(senderEmail: string, to: string, subject: string, body: string): string {
  const domain = senderEmail.split("@")[1]?.toLowerCase() ?? "";
  const t = encodeURIComponent(to);
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `https://mail.google.com/mail/?view=cm&to=${t}&su=${s}&body=${b}`;
  }
  if (["hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr", "msn.com"].includes(domain)) {
    return `https://outlook.live.com/mail/0/deeplink/compose?to=${t}&subject=${s}&body=${b}`;
  }
  return `mailto:${t}?subject=${s}&body=${b}`;
}

export async function openCompose(senderEmail: string, to: string, subject: string, body: string): Promise<void> {
  const url = getComposeUrl(senderEmail, to, subject, body);
  if (url.startsWith("mailto:")) {
    window.location.href = url;
  } else {
    await openUrl(url);
  }
}
