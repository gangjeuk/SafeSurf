export const detectDate = () => {
  let date: string | null = null;
  try {
    const el = document.querySelector<HTMLMetaElement>(
      'meta[property="article:published_time"],meta[property="og:pubdate"],meta[property="og:publish_date"],meta[name="citation_online_date"],meta[name="dc.Date"]',
    );
    if (el) {
      date = new Date(el.content).toISOString();
    } else {
      const el = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
      if (el) {
        const j = JSON.parse(el.textContent || '{}');
        if (j && j.datePublished) {
          date = new Date(j.datePublished).toISOString();
        }
      }
    }
  } catch (err) {
    console.log('could not detect date', err);
  }

  return date;
};
