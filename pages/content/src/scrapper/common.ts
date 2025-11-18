import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { IScrapData } from './type';

interface IPageScrapData extends IScrapData {
  mdContent: string;
}
export const scrapPage = async (): Promise<IPageScrapData | null> => {
  // parse() will mutate the dom, so we need to clone in order not to spoil the normal reading of the site
  const domClone = document.cloneNode(true) as Document;

  const readabilityArticle = new Readability(domClone, {
    // charThreshold: 50,
    // nbTopCandidates: 10,
  }).parse();

  if (!readabilityArticle) {
    // await rpc(['nothingToIndex']);
    return null;
  }

  const { content, textContent, ...rest } = readabilityArticle;
  console.debug('fttf :: readabilityArticle', readabilityArticle, rest);

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    hr: '---',
  });

  if (content) {
    const mdContent = turndown.turndown(content);
    return { mdContent: mdContent, title: rest.title ?? undefined, author: rest.siteName ?? undefined };
  }

  return null;
};
