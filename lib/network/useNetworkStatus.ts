import { useState, useEffect } from 'react';
import { networkStatus } from './NetworkStatus';

export function useNetworkStatus(): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(networkStatus.isConnected);

  useEffect(() => networkStatus.subscribe(setIsConnected), []);

  return { isConnected };
}
