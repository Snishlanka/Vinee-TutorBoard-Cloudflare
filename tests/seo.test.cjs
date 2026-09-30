'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('landing page exposes indexable SEO content in initial HTML', () => {
  const html = read('index.html');
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<title>Vinee TutorBoard \| Digital Whiteboard for Math Teaching<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{80,170}">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/vinee-tutorboard\.snishlanka\.workers\.dev\/">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /href="whiteboard\.html"/);
});

test('whiteboard route retains the working application', () => {
  const html = read('whiteboard.html');
  for (const marker of ['id="board"', 'id="graph-tools"', 'id="geometry-tools"', 'src="app.js"', 'src="pwa.js"'])
    assert.match(html, new RegExp(marker));
});

test('robots and sitemap expose only public routes', () => {
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.doesNotMatch(robots, /Disallow: \/$/m);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/vinee-tutorboard\.snishlanka\.workers\.dev\/<\/loc>/);
  assert.match(sitemap, /whiteboard\.html<\/loc>/);
  assert.doesNotMatch(sitemap, /lesson|\.json/i);
});
