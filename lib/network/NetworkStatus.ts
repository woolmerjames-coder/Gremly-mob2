import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

type NetworkListener = (isConnected: boolean) => void;

class NetworkStatusManager {
  public isConnected = true; // optimistic default
  private _readyPromise: Promise<void>;
  private _subscribers = new Set<NetworkListener>();

  constructor() {
    // Eagerly fetch current state so isConnected is accurate ASAP
    this._readyPromise = NetInfo.fetch().then((state: NetInfoState) => {
      this._update(state.isConnected ?? false);
    });

    // Listen for ongoing changes
    NetInfo.addEventListener((state: NetInfoState) => {
      this._update(state.isConnected ?? false);
    });
  }

  /** Resolves once the initial NetInfo.fetch() completes */
  ready(): Promise<void> {
    return this._readyPromise;
  }

  subscribe(callback: NetworkListener): () => void {
    this._subscribers.add(callback);
    return () => {
      this._subscribers.delete(callback);
    };
  }

  private _update(connected: boolean): void {
    if (connected === this.isConnected) return;
    this.isConnected = connected;
    console.log(connected ? '[Network] 🟢 Online' : '[Network] 🔴 Offline');
    for (const cb of this._subscribers) {
      cb(connected);
    }
  }
}

export const networkStatus = new NetworkStatusManager();
