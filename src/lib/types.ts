'use server';

import type { ReviewManuscriptOutput } from "@/ai/flows/review-manuscript";

export type BookNodeType = 'file' | 'folder';

// This replaces the old Chapter interface to support nesting
export interface BookNode {
  id: string;
  title: string;
  type: BookNodeType;
  // For files
  content?: string;
  url?: string; // For bookstore chapters
  // For folders
  children?: BookNode[];
}

export interface Book {
  id: string;
  title: string;
  description: string;
  chapters: BookNode[];
  author?: string;
  cover?: string;
  category?: string;
  latestChapter?: string;
  detailUrl?: string; // For bookstore books
  sourceId?: string; // Origin source id to refetch chapters
}

export interface WorldSetting {
  id: string;
  keyword: string;
  description: string;
  enabled: boolean;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export type ReviewResult = ReviewManuscriptOutput;

export interface CommunityPrompt {
  id: string;
  name: string;
  prompt: string;
  likes: number;
  visible: boolean;
  createdAt: string;
}

// Bookstore specific types
export interface BookstoreBook {
  title: string;
  author: string;
  category: string;
  latestChapter: string;
  cover: string;
  detailUrl: string;
  sourceId: string; // To know which source it belongs to
}

export interface BookstoreCategory {
  title: string;
  url: string;
  sourceId: string;
}

export interface BookstoreChapter {
    title: string;
    url: string;
}

export interface BookstoreBookDetail extends Omit<BookstoreBook, 'sourceId'> {
    description: string;
    chapters: BookstoreChapter[];
}

export interface BookstoreChapterContent {
  title: string;
  content: string;
  nextChapterUrl?: string;
  prevChapterUrl?: string;
}

// Data structure for parsing rules from community JSON
export interface BookSourceRule {
  // Search page rules
  search?: {
    url?: string;
    checkKeyWord?: string;
    bookList: string;
    name: string;
    author?: string;
    kind?: string;
    wordCount?: string;
    lastChapter?: string;
    intro?: string;
    coverUrl?: string;
    bookUrl: string;
  };
  
  // Find/Discovery page rules
  find?: {
    url?: string;
    bookList: string;
    name: string;
    author?: string;
    kind?: string;
    wordCount?: string;
    lastChapter?: string;
    intro?: string;
    coverUrl?: string;
    bookUrl: string;
  };

  // Book detail page rules
  bookInfo?: {
    init?: string; // pre-process rule
    name?: string;
    author?: string;
    kind?: string;
    wordCount?: string;
    lastChapter?: string;
    intro?: string;
    coverUrl?: string;
    tocUrl?: string; // Table of Contents URL
  };

  // Table of Contents (TOC) rules
  toc?: {
    preUpdateJs?: string;
    chapterList: string;
    chapterName: string;
    chapterUrl: string;
    formatJs?: string;
    isVolume?: string;
    updateTime?: string;
    isVip?: string;
    isPay?: string;
  };

  // Chapter content rules
  content?: {
    content: string;
    chapterName?: string;
    nextContentUrl?: string;
    webJs?: string;
    sourceRegex?: string;
    replaceRegex?: string;
    imageStyle?: string;
    imageDecode?: string;
    payAction?: string;
  };
}


// User-configurable Book Source based on community JSON structure
export interface BookSource {
  id: string; // Internal UUID
  enabled: boolean;
  
  // Main source info
  url: string; 
  name: string;
  group?: string;
  comment?: string;
  exploreUrl?: string;
  loginUrl?: string;
  loginUi?: string;
  loginCheckJs?: string;
  jsLib?: string;
  coverDecodeJs?: string; // Cover decode JS
  proxyBase?: string; // Optional per-source proxy base
  bookUrlPattern?: string;
  header?: string; // Can be JSON string for request headers
  searchUrl?: string;
  
  // Parsing rules
  rules?: BookSourceRule | null;
}
