// One monochrome icon set for the whole panel.
//
// Every icon is a 24×24 stroke drawing that inherits the text colour, so a row is quiet
// and consistent instead of a different two-colour picture on every line.
const paths = {
  home: '<path d="M4 10.7 12 4l8 6.7V19a1.3 1.3 0 0 1-1.3 1.3h-3.4v-5.6H9.7v5.6H5.3A1.3 1.3 0 0 1 4 19z"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2.2"/><circle cx="8.6" cy="11" r="1.7"/><path d="M5.6 16.2c.5-1.4 1.7-2.1 3-2.1s2.5.7 3 2.1"/><path d="M14.4 10h4M14.4 13.4h4"/>',
  shield: '<path d="M12 3.4 19.5 6v5.4c0 4.6-3.2 7.9-7.5 9.2-4.3-1.3-7.5-4.6-7.5-9.2V6z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
  devices: '<rect x="3" y="4.5" width="13" height="9.5" rx="1.6"/><path d="M7 18h5"/><rect x="17" y="9" width="4" height="10" rx="1.4"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v5.6c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V6"/><path d="M5 11.6V17c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-5.4"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M7 8h10v3.2a5 5 0 0 1-10 0z"/><path d="M12 16.2V21"/>',
  chat: '<path d="M20 12.2c0 3.7-3.6 6.7-8 6.7a9.4 9.4 0 0 1-2.6-.4L5 20l1.1-3.2A6.4 6.4 0 0 1 4 12.2C4 8.5 7.6 5.5 12 5.5s8 3 8 6.7z"/>',
  search: '<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4 4"/>',
  browser: '<rect x="3" y="4.5" width="18" height="15" rx="2.2"/><path d="M3 9h18"/><circle cx="6.4" cy="6.8" r=".9"/><circle cx="9.2" cy="6.8" r=".9"/>',
  lifebuoy: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.4"/><path d="m6.3 6.3 3.4 3.4M17.7 6.3l-3.4 3.4M17.7 17.7l-3.4-3.4M6.3 17.7l3.4-3.4"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.4"/><circle cx="12" cy="8" r=".9"/>',
  user: '<circle cx="12" cy="8.4" r="3.6"/><path d="M5 20c.8-3.4 3.5-5.2 7-5.2s6.2 1.8 7 5.2"/>',
  tag: '<path d="M4 11.4V5.4A1.4 1.4 0 0 1 5.4 4h6l8.2 8.2a1.4 1.4 0 0 1 0 2L13.2 20a1.4 1.4 0 0 1-2 0z"/><circle cx="8.2" cy="8.2" r="1.2"/>',
  gender: '<circle cx="12" cy="9.4" r="4.4"/><path d="M12 13.8V21M9.4 18.4h5.2"/>',
  envelope: '<rect x="3" y="5.4" width="18" height="13.2" rx="2.2"/><path d="m3.8 6.8 8.2 6 8.2-6"/>',
  phone: '<path d="M7.4 3.6 9.9 6l-1.6 2.6c.9 2.2 2.9 4.2 5.1 5.1L16 12.1l2.4 2.5-1.6 2.2c-.6.8-1.7 1.2-2.7 1-4.9-1.4-8.8-5.3-10.2-10.2-.2-1 .2-2.1 1-2.7z"/>',
  cake: '<path d="M4 20h16"/><path d="M5.5 20v-6.4a1.6 1.6 0 0 1 1.6-1.6h9.8a1.6 1.6 0 0 1 1.6 1.6V20"/><path d="M12 12V9.4"/><circle cx="12" cy="7.6" r="1"/>',
  translate: '<path d="M4 6h7M7.5 6c0 4-1.6 6.8-4 8.4"/><path d="M5.5 10.4c1 1.8 2.7 3.2 4.8 3.9"/><path d="m12.5 20 3.6-9 3.6 9"/><path d="M14 17h4.4"/>',
  house: '<path d="M4.5 10.5 12 4.6l7.5 5.9V19a1.2 1.2 0 0 1-1.2 1.2H5.7A1.2 1.2 0 0 1 4.5 19z"/><path d="M9.8 20.2v-5h4.4v5"/>',
  briefcase: '<rect x="3.2" y="7.6" width="17.6" height="11.6" rx="2"/><path d="M9 7.6V5.8A1.4 1.4 0 0 1 10.4 4.4h3.2A1.4 1.4 0 0 1 15 5.8v1.8"/><path d="M3.2 12.4h17.6"/>',
  pin: '<path d="M12 21c4-4.4 6-7.4 6-9.8A6 6 0 0 0 6 11.2C6 13.6 8 16.6 12 21z"/><circle cx="12" cy="10.6" r="2.2"/>',
  apps: '<rect x="4" y="4" width="6.4" height="6.4" rx="1.6"/><rect x="13.6" y="4" width="6.4" height="6.4" rx="1.6"/><rect x="4" y="13.6" width="6.4" height="6.4" rx="1.6"/><rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1.6"/>',
  check: '<path d="m5 12.6 4.4 4.4L19 7.6"/>',
  arrow: '<path d="M9 6l6 6-6 6"/>',
  upload: '<path d="M12 16V4.6"/><path d="m7.6 9 4.4-4.4L16.4 9"/><path d="M4.6 15.4v2.6a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-2.6"/>',
  trash: '<path d="M4.6 7h14.8"/><path d="M9.4 7V5.2A1.2 1.2 0 0 1 10.6 4h2.8a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.6 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.4 7"/>',
  lock: '<rect x="5" y="10.4" width="14" height="9.6" rx="2.2"/><path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4"/>',
  key: '<circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H20M17 12v3.2M14.4 12v2.2"/>'
};

export function icon(name, size = 22) {
  const body = paths[name] || paths.info;
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const iconStyle = `.ico{display:block;flex:none}`;
