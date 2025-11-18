document.dispatchEvent(
  new CustomEvent('content.ytInitialPlayerResponse', {
    detail: window.ytInitialPlayerResponse, // Some variable from Gmail.
  }),
);
