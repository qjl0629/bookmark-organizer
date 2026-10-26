// What the user actually uses. Two sources, both read on this computer only:
//  - dateLastUsed on each bookmark (Chrome 114+, no extra permission): when it was last opened.
//  - browsing history (optional permission): how many times its page was visited recently.
// Chrome keeps only a few months of history, so visit counts are used to find what is used
// OFTEN, never to decide that something has been unused for a year.

export const DAY = 86_400_000;

// historyApi is chrome.history (or a test double). Returns url -> visits in the last 90 days.
export async function loadVisits(historyApi, urls, now = Date.now(), batch = 40) {
  const unique = [...new Set(urls.filter((url) => /^https?:\/\//i.test(url)))];
  const since = now - 90 * DAY;
  const visits = new Map();
  for (let i = 0; i < unique.length; i += batch) {
    await Promise.all(
      unique.slice(i, i + batch).map(async (url) => {
        try {
          const list = await historyApi.getVisits({ url });
          visits.set(url, list.filter((v) => v.visitTime >= since).length);
        } catch {
          /* one unreadable address must not stop the rest */
        }
      }),
    );
  }
  return visits;
}

export const daysAgo = (time, now) => Math.max(0, Math.floor((now - time) / DAY));
