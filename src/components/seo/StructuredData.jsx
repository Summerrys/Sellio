import React from 'react';
import { jsonLdText } from '@/lib/pageMeta';

// schema.org structured data (JSON-LD) inside the page's own markup rather than added to the head
// afterwards: a prerendered page (src/entry-server.jsx) carries it for crawlers that run no
// scripts, and once the app draws the page (main.jsx removes the prerender) it is still there,
// once. `data`: one schema object or a list of them.
export default function StructuredData({ data }) {
  const list = Array.isArray(data) ? data : [data];
  return list.map((item, index) => (
    <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(item) }} />
  ));
}
