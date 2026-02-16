import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

type NetworkListener = (isConnected: boolean) => void;

class NetworkStatusManager {
  private _isConnected = true;
  private _listeners = new Set<NetworkListener>();
  private _unsubscribe: (() => void) | null = null;

  start(): void {
    if (this._unsubscribe) return;

    this._unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;

      if (connected === this._isConnected) return;

      this._isConnected = connected;
      console.log(connected ? '[Network] 🟢 Online' : '[Network] 🔴 Offline');

      for (const listener of this._listeners) {
        listener(connected);
      }
    });
  }

  stop(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  subscribe(listener: NetworkListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
}

export const networkStatus = new NetworkStatusManager();
