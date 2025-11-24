import type { IScrapData } from './type';
// Only run on YouTube watch pages
export const checkTargetUrl = () => {
  const check = location.hostname.includes('youtube.com') && location.pathname.startsWith('/watch');

  return check;
};

interface IYoutubeScrapData extends IScrapData {
  transcript: string[] | TranscriptResponse[];
}

// Function to extract YouTube transcript if available
export const scrapYouTube = async (): Promise<IYoutubeScrapData | null> => {
  try {
    // Access YouTube's global variable for captions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerResponse = (window as any).ytInitialPlayerResponse;

    console.log(playerResponse, window);
    if (!playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      console.log('fttf :: no captions available');
      return null;
    }

    const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    const videoDetails = playerResponse.videoDetails;

    // Try to get thumbnail
    const thumbnameUrl = videoDetails?.thumbnail?.thumbnails?.[0]?.url;
    let thumbnail: Blob | undefined;
    if (thumbnameUrl) {
      thumbnail = await (await fetch(thumbnameUrl)).blob();
    }

    // Try to find English captions first
    const chosenTrack =
      captionTracks.find((track: Record<string, string>) => track.languageCode === 'en') || captionTracks[0];

    if (!chosenTrack?.baseUrl) {
      return null;
    }

    // Fetch the caption data
    const response = await fetch(chosenTrack.baseUrl);
    const captionData = await response.text();

    // Parse the TTML data
    let textLines: string[] | TranscriptResponse[] = [];

    // Try DOMParser first
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(captionData, 'application/xml');

      // Check for parser errors
      const parserErrors = xmlDoc.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        throw new Error('DOMParser parsererror encountered');
      }

      // Extract text content
      const textNodes = xmlDoc.getElementsByTagName('text');
      for (let i = 0; i < textNodes.length; i++) {
        const textContent = textNodes[i].textContent?.trim();
        if (textContent) {
          textLines.push(textContent);
        }
      }
    } catch (err) {
      // Fallback to regex parsing if DOMParser fails
      console.log('fttf :: falling back to regex parsing for transcript', err);
      const textTagRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
      let match;
      while ((match = textTagRegex.exec(captionData)) !== null) {
        const raw = match[1].trim();
        if (raw) {
          textLines.push(raw);
        }
      }
    }

    if (textLines.length === 0) {
      textLines = await fetchTranscript(location.href);
    }

    return {
      transcript: textLines,
      title: videoDetails?.title,
      id: videoDetails?.videoId,
      size: videoDetails?.lengthSeconds,
      author: videoDetails?.author,
      image: thumbnail,
    };
  } catch (err) {
    console.log('fttf :: error extracting transcript', err);
    return null;
  }
};

/**
 * -------------------- Most of the code below are copied from https://github.com/ericmmartin/youtube-transcript-plus------------------------
 */

interface FetchParams {
  url: string;
  lang?: string;
  userAgent?: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

interface TranscriptResponse {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
}
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const RE_YOUTUBE =
  /(?:v=|\/|v\/|embed\/|watch\?.*v=|youtu\.be\/|\/v\/|e\/|watch\?.*vi?=|\/embed\/|\/v\/|vi?\/|watch\?.*vi?=|youtu\.be\/|\/vi?\/|\/e\/)([a-zA-Z0-9_-]{11})/i;

const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

function retrieveVideoId(videoId: string): string {
  if (videoId.length === 11) {
    return videoId;
  }
  const matchId = videoId.match(RE_YOUTUBE);
  if (matchId && matchId.length) {
    return matchId[1];
  }
  throw new Error();
}

async function defaultFetch(params: FetchParams): Promise<Response> {
  const { url, lang, userAgent, method = 'GET', body, headers = {} } = params;

  const fetchHeaders: Record<string, string> = {
    'User-Agent': userAgent || DEFAULT_USER_AGENT,
    ...(lang && { 'Accept-Language': lang }),
    ...headers,
  };

  const fetchOptions: RequestInit = {
    method,
    headers: fetchHeaders,
  };

  if (body && method === 'POST') {
    fetchOptions.body = body;
  }

  return fetch(url, fetchOptions);
}
async function fetchTranscript(videoId: string): Promise<TranscriptResponse[]> {
  const identifier = retrieveVideoId(videoId);

  // TODO: Add adequte lang detection. Error is thrown if there is no right language for now
  const lang = 'ko';
  const userAgent = DEFAULT_USER_AGENT;

  // 1) Fetch the watch page to extract an Innertube API key (no interface change)
  // Decide protocol once and reuse
  const protocol = 'https';
  const watchUrl = `${protocol}://www.youtube.com/watch?v=${identifier}`;
  const videoPageResponse = await defaultFetch({ url: watchUrl, lang, userAgent });

  if (!videoPageResponse.ok) {
    throw new Error(identifier);
  }

  const videoPageBody = await videoPageResponse.text();

  // Basic bot/recaptcha detection preserves old error behavior
  if (videoPageBody.includes('class="g-recaptcha"')) {
    throw new Error();
  }

  // 2) Extract Innertube API key from the page
  const apiKeyMatch =
    videoPageBody.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || videoPageBody.match(/INNERTUBE_API_KEY\\":\\"([^\\"]+)\\"/);

  if (!apiKeyMatch) {
    // If captions JSON wasn't present previously and we also can't find an API key,
    // retain the disabled semantics for compatibility.
    throw new Error(identifier);
  }
  const apiKey = apiKeyMatch[1];

  // 3) Call Innertube player as ANDROID client to retrieve captionTracks
  const playerEndpoint = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
  const playerBody = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
      },
    },
    videoId: identifier,
  };

  // Use configurable playerFetch for the POST to allow custom fetch logic.
  const playerFetchParams: FetchParams = {
    url: playerEndpoint,
    method: 'POST',
    lang,
    userAgent,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(playerBody),
  };
  const playerRes = await defaultFetch(playerFetchParams);

  if (!playerRes.ok) {
    throw new Error(identifier);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerJson: any = await playerRes.json();

  const tracklist =
    playerJson?.captions?.playerCaptionsTracklistRenderer ?? playerJson?.playerCaptionsTracklistRenderer;

  const tracks = tracklist?.captionTracks;

  const isPlayableOk = playerJson?.playabilityStatus?.status === 'OK';

  // If `captions` is entirely missing, treat as "not available"
  if (!playerJson?.captions || !tracklist) {
    // If video is playable but captions aren’t provided, treat as "disabled"
    if (isPlayableOk) {
      throw new Error(identifier);
    }
    // Otherwise we can’t assert they’re disabled; treat as "not available"
    throw new Error(identifier);
  }

  // If `captions` exists but there are zero tracks, treat as "disabled"
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error(identifier);
  }

  // Respect requested language or fallback to first track
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedTrack = lang ? tracks.find((t: any) => t.languageCode === lang) : tracks[0];

  if (!selectedTrack) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const available = tracks.map((t: any) => t.languageCode).filter(Boolean);
    throw new Error(lang!, available, identifier);
  }

  // 4) Build transcript URL; prefer XML by stripping fmt if present
  let transcriptURL: string = selectedTrack.baseUrl || selectedTrack.url;
  if (!transcriptURL) {
    throw new Error(identifier);
  }
  transcriptURL = transcriptURL.replace(/&fmt=[^&]+$/, '');

  // 5) Fetch transcript XML using the same hook surface as before
  const transcriptResponse = await defaultFetch({ url: transcriptURL, lang, userAgent });

  if (!transcriptResponse.ok) {
    // Preserve legacy behavior
    if (transcriptResponse.status === 429) {
      throw new Error();
    }
    throw new Error(identifier);
  }

  const transcriptBody = await transcriptResponse.text();

  // 6) Parse XML into the existing TranscriptResponse shape
  const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];
  const transcript: TranscriptResponse[] = results.map(m => ({
    text: m[3],
    duration: parseFloat(m[2]),
    offset: parseFloat(m[1]),
    lang: lang ?? selectedTrack.languageCode,
  }));

  if (transcript.length === 0) {
    throw new Error(identifier);
  }

  return transcript;
}
