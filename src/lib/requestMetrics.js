const counts = {
  browserGpsRequests: 0,
  frontendDiscoveryRequests: 0,
  frontendDetailsRequests: 0
};

export function recordBrowserGpsRequest() {
  counts.browserGpsRequests += 1;
}

export function recordFrontendRequest(kind) {
  if (kind === "details") {
    counts.frontendDetailsRequests += 1;
  } else {
    counts.frontendDiscoveryRequests += 1;
  }
}

export function getFrontendRequestCounts() {
  return { ...counts };
}
