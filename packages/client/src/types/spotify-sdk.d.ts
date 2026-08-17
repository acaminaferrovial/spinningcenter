export {};

// Ambient Spotify Web Playback SDK typing, shared by every page/hook that
// creates its own named Player instance (the SDK script itself is global).
declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => any;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}
