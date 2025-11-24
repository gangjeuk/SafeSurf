document.dispatchEvent(
  new CustomEvent('content.ytInitialPlayerResponse', {
    detail: window.ytInitialPlayerResponse, // Global variable from Youtube.
  }),
);
