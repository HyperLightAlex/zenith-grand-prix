// Where the game is running: on a page of its own (its own site, the dev
// server), or inside a host that owns some of what a page would (Akeru: the
// game in a frame, the host keeping its saves and its controller, pausing
// it, and saying where its server is).
//
// Everything that differs goes through `platform`. A host sets
// `globalThis.zenithPlatform` before the game's program loads, with what it
// provides; whatever it leaves out is as on a page of the game's own,
// except what a framed game must not touch (the browser's storage).

/** Text kept by key: the part of the browser's Storage the game uses. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Platform {
  /** 'standalone' on a page of the game's own; a host's name inside one. */
  name: string;
  /**
   * What is kept between visits: settings, records, progress, your pilot
   * and mechs (SAVE_KEYS). The browser's localStorage on a page of the
   * game's own; a host's save for the game inside one.
   */
  storage: KeyStore;
  /** Kept for this visit only: the room and squad a tab was in, for a reload. */
  session: KeyStore;
  /** The controllers, as the Gamepad API gives them. A host that owns the controller gives its own (one pad, in the standard mapping). */
  getGamepads(): ReadonlyArray<Gamepad | null>;
  /** Called once a frame, before the controllers are read (a host's presses, queued between frames). */
  beginInputFrame(): void;
  /** Rumble through the host, where it owns the controller (strengths 0 to 1, milliseconds). Absent: the pad's own. */
  rumble?: (strong: number, weak: number, ms: number) => void;
  /**
   * The game server's address (https://host[/path]) for online play; null:
   * there is none here, and Online says so. Undefined: the address the page
   * came from, as on the game's own server.
   */
  server?: string | null;
  /**
   * The host keeps the controller's Start (Menu) button for its own menu:
   * the game's pause is on View (Back, Select) instead, and its hints say so.
   */
  hostMenu: boolean;
  /** Whether the game may go full screen itself. */
  fullscreen: boolean;
  /** Whether the page's address can be shared and opened (invite links), and the clipboard written. */
  links: boolean;
  /** Whether a file can be saved from the page (a photo). */
  downloads: boolean;
}

/**
 * Everything the game keeps in `platform.storage`. A host that keeps the
 * game's saves must take every one of these (Akeru's adapter lists them; its
 * build checks its list against this one). No value is longer than 128 KB:
 * the lap ghosts, the largest thing kept, are a key to a circuit for that.
 */
export const SAVE_KEYS: readonly string[] = [
  'zgp.settings',
  'zgp.video',
  'zgp.device',
  'zgp.callsign',
  'zgp.pilot',
  'zgp.loadout',
  'zgp.lastFaction',
  'zgp.free',
  'zgp.quick',
  'zgp.tutorial',
  'zgp.victory',
  'zgp.frameTips',
  'zgp.tipsSeen',
  'zgp.records',
  'zgp.gp.cup',
  'zgp.gp.tour',
  'zgp.gp.season',
  'zgp.gp.sprintCup',
  'zgp.gp.sprintTour',
  'zgp.gp.medals',
  'zgp.gp.sprintMedals',
  'zgp.gp.cupsWon',
  'zgp.gp.difficulty',
  // The lap ghosts, a key to a circuit (records.ts: ghostKey).
  ...['meridian', 'canyon', 'helios', 'crucible', 'frostline', 'titan', 'abyss', 'monsoon', 'zenith'].map((id) => `zgp.ghosts.${id}`),
];

/** A browser Storage, or (where it is refused: a private window, a blocked frame) nothing kept. */
function browserStore(pick: () => Storage): KeyStore {
  const store = (): Storage | null => {
    try {
      return pick();
    } catch {
      return null;
    }
  };
  return {
    getItem(key) {
      try {
        return store()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      // (Refused or full: the caller is told, as by Storage itself.)
      const s = store();
      if (!s) throw new Error('Storage unavailable');
      s.setItem(key, value);
    },
    removeItem(key) {
      try {
        store()?.removeItem(key);
      } catch {
        /* nothing kept */
      }
    },
  };
}

/** Kept in memory: for this visit. */
export function memoryStore(): KeyStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function standalone(): Platform {
  return {
    name: 'standalone',
    storage: browserStore(() => localStorage),
    session: browserStore(() => sessionStorage),
    getGamepads: () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []),
    beginInputFrame: () => {},
    hostMenu: false,
    fullscreen: true,
    links: true,
    downloads: true,
  };
}

type Given = Partial<Platform> | undefined;

/** The platform from what a host gave (see the top of this file), or a page of the game's own. */
export function makePlatform(given: Given): Platform {
  const own = standalone();
  if (!given) return own;
  // Inside a host: nothing of the browser's storage unless the host gives it,
  // and nothing a framed page cannot do.
  return {
    ...own,
    name: 'host',
    storage: memoryStore(),
    session: memoryStore(),
    server: null,
    fullscreen: false,
    links: false,
    downloads: false,
    ...given,
  };
}

export const platform: Platform = makePlatform((globalThis as { zenithPlatform?: Given }).zenithPlatform);

/** Whether the game is inside a host (not on a page of its own). */
export const hosted = platform.name !== 'standalone';
