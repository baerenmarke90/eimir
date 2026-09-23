/* Proposed 24 px visual grammar for issue #1225. Deliberately separate from runtime icons. */
const ICON_PATHS = {
  wir: '<circle class="cool" cx="9" cy="12" r="6.5"/><circle class="accent" cx="15" cy="12" r="6.5"/>',
  momente: '<path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z"/><path class="accent" d="M12 7.1a4.5 4.5 0 0 1 5.4-1.9"/>',
  planen: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.7"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/><path class="accent" d="M8 3.5v4M16 3.5v4"/>',
  kalender: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.7"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/><circle class="accent" cx="12" cy="15.2" r="1.5"/>',
  listen: '<path d="M3 6.5h12M3 12h15M3 17.5h10"/><path class="accent" d="M18 4v7m-3.5-3.5h7"/>',
  mehr: '<circle cx="5" cy="5" r=".9"/><circle cx="12" cy="5" r=".9"/><circle cx="19" cy="5" r=".9"/><circle cx="5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="19" cy="12" r=".9"/><circle cx="5" cy="19" r=".9"/><circle cx="12" cy="19" r=".9"/><circle cx="19" cy="19" r=".9"/>',
  neu: '<circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/>',
  denken: '<path d="M11.7 19.5S3 15 3 9.6a4 4 0 0 1 7.4-2.1 4 4 0 0 1 7.4 2.1c0 1.3-.5 2.5-1.3 3.6"/><path class="icon-fill-accent" d="M17.5 10.8S14 8.7 14 6.7a2.1 2.1 0 0 1 3.5-1.5A2.1 2.1 0 0 1 21 6.7c0 2-3.5 4.1-3.5 4.1Z"/>',
  vibe: '<path d="M2 12h5l2.2-6.5 3.1 13 2.8-9 1.8 3.2H22"/><path class="accent" d="m9.2 5.5 3.1 13"/>',
  gemeinsam: '<circle cx="8" cy="7.3" r="3"/><circle class="accent" cx="16.5" cy="7.7" r="2.5"/><path d="M2.5 20v-2.6A5.4 5.4 0 0 1 8 12h1a5.4 5.4 0 0 1 5.5 5.4V20Z"/><path class="accent" d="M15.8 12.4a4.3 4.3 0 0 1 5.7 4.1V20h-4"/>',
  geteilt: '<path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z"/><path class="accent" d="M4.4 13.1C8.3 14.1 12 14.3 19.6 12.9"/>',
  nurfuer: '<rect x="4.4" y="10" width="15.2" height="11" rx="2.7"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"/><path class="accent" d="M12 14v4m-2-2h4"/>',
  foto: '<rect x="2.8" y="5" width="18.4" height="15" rx="2.5"/><circle class="accent" cx="8" cy="9.3" r="1.3"/><path d="m4 17 5-4.8 3.2 2.7 3.1-3 4.8 5"/>',
  video: '<rect x="2.5" y="5.3" width="14.4" height="13.4" rx="2.5"/><path class="accent" d="m17 9.1 4.5-2.5v10.8L17 14.9"/>',
  erinnerungen: '<rect x="3" y="4" width="18" height="16" rx="2.7"/><path d="m4.6 16.8 5.2-4.2 2.6 2.3 3.5-3.5 3.6 4"/><path class="accent" d="M17.5 4v4"/>',
  highlights: '<path d="m12 2.2 2.1 7.7 7.7 2.1-7.7 2.1-2.1 7.7-2.1-7.7-7.7-2.1 7.7-2.1 2.1-7.7Z"/><path class="accent" d="M19 2v4m-2-2h4"/>',
  wuensche: '<path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z"/><path class="cool" d="M18.2 5.7 20 3.5"/>',
  reisen: '<path d="m3 18 8-5-6-3 1.5-2 8 2.1 4.7-6.4a2 2 0 0 1 2.5-.5 2 2 0 0 1 .3 2.7l-5 6.2 2.1 8-2 1.5-3.2-6L8 22Z"/>',
  ziele: '<circle cx="11" cy="13" r="8.5"/><circle class="accent" cx="11" cy="13" r="4.5"/><path d="m11 13 9-9m-3.5 0H20v3.5"/>',
  meilensteine: '<path d="M3 10.5 10.5 3l4.3 4.3-7.5 7.5L3 10.5Zm8.8 1.2 7.2 7.2M5.5 13.5l-2 6 6-2"/><path class="accent" d="m14.8 7.3 2.4-2.4 3.8 3.8-2.4 2.4"/>',
  jahrestag: '<circle cx="12" cy="13" r="8.5"/><path class="accent" d="M12 1.5v4M8 2.5 12 1l4 1.5"/>',
  benachrichtigungen: '<path d="M5 17h14l-2-2.5V9a5 5 0 0 0-10 0v5.5L5 17Zm5 3h4"/><path class="accent" d="M17 6a4 4 0 0 1 2 3"/>',
  nachrichten: '<rect x="3" y="5" width="18" height="14" rx="2.7"/><path class="accent" d="m5.5 8 6.5 5 6.5-5"/>',
  suche: '<circle cx="10.5" cy="10.5" r="7"/><path class="accent" d="m16 16 5 5"/>',
  einstellungen: '<path d="M10 2h4l.8 2.3 2.1.9 2.2-1.1 2.8 2.8-1.1 2.2.9 2.1L24 12l-2.3.8-.9 2.1 1.1 2.2-2.8 2.8-2.2-1.1-2.1.9L14 22h-4l-.8-2.3-2.1-.9-2.2 1.1-2.8-2.8 1.1-2.2-.9-2.1L0 12l2.3-.8.9-2.1-1.1-2.2 2.8-2.8 2.2 1.1 2.1-.9L10 2Z" transform="translate(2 2) scale(.83)"/><circle cx="12" cy="12" r="2.8"/>',
  privatsphaere: '<rect x="4.4" y="10" width="15.2" height="11" rx="2.7"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"/>',
  statistiken: '<rect x="3" y="13" width="4" height="8" rx="1"/><rect class="accent" x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>',
  pro: '<path d="M3 17 5 6l5 4 2-7 2 7 5-4 2 11H3Z" fill="#8DAAE9" stroke="none"/><path d="M4 20h16"/><circle class="icon-fill-accent" cx="5" cy="5" r="1.1"/><circle class="icon-fill-accent" cx="12" cy="2.5" r="1.1"/><circle class="icon-fill-accent" cx="19" cy="5" r="1.1"/>',
  hilfe: '<circle cx="12" cy="12" r="9"/><path class="accent" d="M9 9a3 3 0 0 1 6 .3c0 2-3 2.4-3 4.7M12 17.5h.01"/>',
  logout: '<path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path class="accent" d="m14 8 4 4-4 4m4-4H9"/>',
};

const FILLED = {
  wir: '<circle cx="9" cy="12" r="6.5" fill="#83BDF0" stroke="none"/><circle cx="15" cy="12" r="6.5" fill="#E5A8D7" stroke="none" opacity=".86"/>',
  momente: '<path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z" fill="#D88ACA" stroke="none"/>',
  planen: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.7" fill="#8AADEB" stroke="none"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4" stroke="#D171B7"/>',
  kalender: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.7" fill="#8AADEB" stroke="none"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4" stroke="#D171B7"/>',
  reisen: '<path d="m3 18 8-5-6-3 1.5-2 8 2.1 4.7-6.4a2 2 0 0 1 2.5-.5 2 2 0 0 1 .3 2.7l-5 6.2 2.1 8-2 1.5-3.2-6L8 22Z" fill="#899DE9" stroke="none"/>',
  highlights: '<path d="m12 2.2 2.1 7.7 7.7 2.1-7.7 2.1-2.1 7.7-2.1-7.7-7.7-2.1 7.7-2.1 2.1-7.7Z" fill="#CC78BE" stroke="none"/>',
  privatsphaere: '<rect x="4.4" y="10" width="15.2" height="11" rx="2.7" fill="#91B8EE" stroke="none"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" stroke="#D577B9"/>',
};

const DUOTONE = {
  wir: '<circle cx="9" cy="12" r="6.5" fill="#8DB8F0" stroke="none"/><circle cx="15" cy="12" r="6.5" fill="#FFB4B0" stroke="none" opacity=".8"/>',
  momente: '<path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z" fill="#9DB8F4" stroke="none"/><path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z" fill="#F5A3BC" stroke="none" clip-path="inset(0 0 0 50%)"/>',
  kalender: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.7" fill="#9DB8F4" stroke="none"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4" stroke="#D171B7"/>',
  reisen: '<path d="m3 18 8-5-6-3 1.5-2 8 2.1 4.7-6.4a2 2 0 0 1 2.5-.5 2 2 0 0 1 .3 2.7l-5 6.2 2.1 8-2 1.5-3.2-6L8 22Z" fill="#9DB8F4" stroke="none"/><path d="m5 9 9.5 2.1 4.7-6.4" stroke="#E39DC7" stroke-width="2.5"/>',
  highlights: '<path d="m12 2.2 2.1 7.7 7.7 2.1-7.7 2.1-2.1 7.7-2.1-7.7-7.7-2.1 7.7-2.1 2.1-7.7Z" fill="#AF9DEB" stroke="none"/>',
  privatsphaere: '<rect x="4.4" y="10" width="15.2" height="11" rx="2.7" fill="#9DB8F4" stroke="none"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" stroke="#E39DC7"/>',
};

function icon(name, variant = 'outline', size = 24) {
  const source = variant === 'filled' ? (FILLED[name] || ICON_PATHS[name]) : variant === 'duotone' ? (DUOTONE[name] || ICON_PATHS[name]) : ICON_PATHS[name];
  if (!source) throw new Error(`Unknown icon: ${name}`);
  return `<svg class="eicon ${variant}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${source}</svg>`;
}
