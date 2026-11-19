import { describe, expect, it } from 'vitest';
import { hashText, relevantText } from '../scripts/check-sources.js';

const source = { name: 'test', start: 'Below are', end: 'In This Section' };
const page = (body: string, tail = '') =>
  `<html><head><script>var t=${Math.random()}</script></head><body>
   <p>Survey banner</p><p>Below are the locations</p>${body}<h2>In This Section</h2>${tail}</body></html>`;

describe('relevantText', () => {
  it('ignores scripts, markup, whitespace and text outside the markers', () => {
    const a = relevantText(page('<li>Monday:   6 a.m.</li>', '<p>Date modified: Oct 1</p>'), source);
    const b = relevantText(page('<div>\nMonday: 6 a.m.\n</div>', '<p>Date modified: Nov 9</p>'), source);
    expect(hashText(a)).toBe(hashText(b));
  });

  it('changes the hash when hours change', () => {
    const a = relevantText(page('<li>Monday: 6 a.m.</li>'), source);
    const b = relevantText(page('<li>Monday: 7 a.m.</li>'), source);
    expect(hashText(a)).not.toBe(hashText(b));
  });

  it('decodes entities', () => {
    expect(relevantText(page('<p>10 a.m. &#8211; 6 p.m. &amp; more</p>'), source)).toContain('10 a.m. – 6 p.m. & more');
  });

  it('throws when a marker is gone instead of passing as unchanged', () => {
    expect(() => relevantText('<p>Redesigned</p>', source)).toThrow(/start marker/);
    expect(() => relevantText('<p>Below are</p>', source)).toThrow(/end marker/);
  });
});
