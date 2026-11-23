// Dummy CV text only (no personal data). Node: [id, x, y, w, h, [[chars, style, size], ...], colorKey]
const C = { acc: [0.69, 0.329, 0], ink: [0.102, 0.11, 0.125], mut: [0.357, 0.38, 0.341], blk: [0, 0, 0] }
window.FILE = { name: 'Demo CV (Lorem Ipsum)', page: 'Page 1' }
window.FRAMES = [
  { id: '1:2', name: 'CV-Page-1', w: 595, h: 842, texts: [
    ['1:3', 44, 30, 507, 28, [['Max Mustermann', 'Bold', 21]], 'acc'],
    ['1:4', 44, 65.5, 507, 14, [['Produktmanager', 'SemiBold', 10.8]], 'ink'],
    ['1:5', 44, 87, 507, 24, [['Musterstadt   ·   +49 000 0000000   ·   max@example.com   ·   Verfügbar ab Oktober', 'Regular', 8.4]], 'blk'],
    ['1:7', 44, 127.3, 507, 13, [['PROFIL', 'Bold', 9.6]], 'acc'],
    ['1:9', 44, 156.6, 507, 39, [['Lorem ipsum dolor sit amet, consectetur adipiscing elit. Größe, Qualität und Übersicht: sed do eiusmod tempor incididunt ut labore.', 'Regular', 9.3]], 'ink'],
    ['1:13', 44, 232.4, 507, 24, [['Lorem ipsum:', 'Bold', 9.2], [' dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', 'Regular', 9.2]], 'ink'],
    ['1:14', 44, 259.4, 507, 12, [['Dolor sit amet:', 'Bold', 9.2], [' ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.', 'Regular', 9.2]], 'ink'],
    ['1:21', 44, 352.2, 190, 13, [['Senior Produktmanager', 'Bold', 9.9]], 'ink'],
    ['1:22', 489, 353.2, 62, 11, [['2022 – heute', 'Regular', 8.6]], 'mut'],
    ['1:23', 44, 367.7, 507, 12, [['Beispiel GmbH · Musterstadt', 'Regular', 8.8]], 'mut'],
    ['1:25', 44, 408.7, 507, 24, [['Nachhaltigkeit:', 'Bold', 9.2], [' Berechnung des CO₂-Fußabdrucks, Duis aute irure dolor in reprehenderit in voluptate.', 'Regular', 9.2]], 'ink'],
    ['1:53', 44, 820, 151, 10, [['Max Mustermann  ·  Seite 1 von 2', 'Regular', 7.8]], 'mut'],
  ] },
  { id: '3:2', name: 'CV-Page-2', w: 595, h: 842, texts: [
    ['3:3', 44, 30, 507, 13, [['BERUFSERFAHRUNG (FORTSETZUNG)', 'Bold', 9.6]], 'acc'],
    ['3:10', 44, 90.7, 507, 24, [['Innovation:', 'Bold', 9.2], [' Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.', 'Regular', 9.2]], 'ink'],
    ['3:31', 44, 349.5, 507, 12, [['M.Sc. Beispielstudium (Schwerpunkt Lorem)', 'Bold', 9.2]], 'ink'],
    ['3:41', 44, 456.1, 507, 11, [['Beispiel-Gymnasium · Musterstadt · 2011', 'Regular', 8.6]], 'mut'],
    ['3:63', 44, 701.6, 507, 12, [['Sprachen:', 'Bold', 9], [' Deutsch (Muttersprache), Englisch (C2)', 'Regular', 9]], 'ink'],
  ] },
  { id: '5:2', name: 'Anschreiben', w: 595, h: 842, texts: [
    ['5:10', 58, 214, 479, 15, [['Bewerbung als Produktmanager (m/w/d)', 'Bold', 10.6]], 'ink'],
    ['5:11', 58, 239, 479, 14, [['Liebes Team,', 'Regular', 9.8]], 'ink'],
    ['5:12', 58, 263, 479, 60, [['Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.', 'Regular', 9.8]], 'ink'],
    ['5:18', 58, 580, 479, 30, [['Viele Grüße\nMax Mustermann', 'Regular', 9.8]], 'ink'],
  ] },
]
